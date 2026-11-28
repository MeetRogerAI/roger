import { isModelUnavailable, ModelUnavailable, rethrowIfUnavailable } from "@/lib/ai/errors";
import { recordWeek } from "@/lib/billing/contribution";
import { currentMonday, isAtOrPast } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import type { IntakeModel } from "@/lib/intake/model";
import { processPending } from "@/lib/intake/process";
import { adminAlert, alertAdmins, type MailDeps } from "@/lib/mail/send";
import type { V3Settings } from "@/lib/v3-settings";
import { bestContent, installable, loadPool, loadUsers, couldUse, type CoraUser, type PoolRow } from "./context";
import { eligiblePlays } from "./eligible";
import { boundFit, codeFit, needsLine, reasonFor, type FitModel, type FitResult } from "./fit";
import { mergePending, type MergeModel } from "./merge";
import { pickThree, type Fitted } from "./pick";
import { networkScore, scorePool, type Figures, type Scored } from "./score";
import { whoGetsAList } from "./who-gets-a-list";
import { NO_CARD_TRIAL_SQL } from "@/lib/billing/has-card";
import { FIRST_LIST_PENDING_SQL } from "./deliver";

/**
 * The Monday Cora job (spec B.7 "The job", plan Unit 11). It takes the week's
 * lease and works through the phases in order (intake closed, merged, scored,
 * picked, ready) to a time budget; the next scheduled run continues from the
 * recorded phase. Only the lease holder writes the week. It is safe to run
 * twice: every step writes only what is not written yet. Passing errors are
 * retried by the next run; a week fails on a model that refuses (no credits),
 * on repeated errors, or at noon Toronto, and then sends nothing, alerts both
 * admins, and can never become ready.
 */
export type CoraDeps = { intake: IntakeModel; merge: MergeModel; fit: FitModel } & MailDeps;
export type JobOptions = { now: Date; settings: V3Settings; week?: string; dryRun?: boolean; budgetMs?: number; holder?: string };
export type JobResult = { week: string; status: "skipped" | "busy" | "running" | "ready" | "failed" | "sent"; phase?: string; note?: string };

const LEASE_SECONDS = 330;
const CANDIDATES_PER_USER = 30;
const FIT_AT_ONCE = 4;
/** Errors in a row, across runs, before a week fails (a passing database blip is retried instead). */
const ERRORS_BEFORE_FAILING = 3;

type WeekRow = { phase: string; dry_run: boolean; status: string; lease_free: boolean };

export async function runCoraJob(q: Query, deps: CoraDeps, o: JobOptions): Promise<JobResult> {
  const week = o.week ?? currentMonday(o.now);
  const dry = Boolean(o.dryRun);
  const until = new Date(Date.now() + (o.budgetMs ?? 240_000));
  const holder = o.holder ?? crypto.randomUUID();

  const [existing] = await q<WeekRow>(
    `select phase, dry_run, status, (lease_until is null or lease_until < now()) as lease_free from cora_weeks where week_of = $1`,
    [week],
  );
  // Noon applies to a real week whatever the settings say, so a week left running is always failed and reported.
  if (!dry && existing && !existing.dry_run && existing.status === "running" && isAtOrPast(o.now, week, "12:00") && existing.phase !== "picked") {
    await failWeek(q, week, false, "The week was not ready by noon, so nothing was sent.", deps);
    return { week, status: "failed", note: "noon" };
  }
  if (!dry && !o.settings.cycleLive) return { week, status: "skipped", note: "The cycle is not live." };
  // A dry run never touches a real week; a real run replaces a dry one, but only once no dry worker holds it.
  if (existing && dry && !existing.dry_run) return { week, status: "skipped", note: "This week has already run for real." };
  if (existing && !dry && existing.dry_run) {
    if (!existing.lease_free) return { week, status: "busy", note: "A dry run is still working on this week." };
    await clearDryRun(q, week);
  }
  if (!dry && !existing && isAtOrPast(o.now, week, "12:00")) {
    await q(`insert into cora_weeks (week_of, dry_run, status, error, finished_at) values ($1, false, 'failed', $2, now()) on conflict (week_of) do nothing`, [
      week,
      "Cora did not start before noon.",
    ]);
    await alert(week, false, "Cora did not start before noon, so nothing will be sent for this week.", deps);
    return { week, status: "failed", note: "noon" };
  }
  await q(`insert into cora_weeks (week_of, dry_run) values ($1, $2) on conflict (week_of) do nothing`, [week, dry]);

  const [w] = await q<WeekRow>(
    `update cora_weeks set lease_until = now() + make_interval(secs => $2), holder = $3
     where week_of = $1 and status = 'running' and dry_run = $4 and (lease_until is null or lease_until < now())
     returning phase, dry_run, status, false as lease_free`,
    [week, LEASE_SECONDS, holder, dry],
  );
  if (!w) {
    const [now] = await q<WeekRow>(`select phase, dry_run, status, false as lease_free from cora_weeks where week_of = $1`, [week]);
    return { week, status: now?.status === "running" ? "busy" : ((now?.status ?? "skipped") as JobResult["status"]), phase: now?.phase };
  }
  const s: StepOptions = { ...o, week, dry, until, holder };

  try {
    let phase = w.phase;
    while (phase !== "ready") {
      // The last step is a single update: never left for noon to fail a week whose picks are all made.
      if (phase !== "picked" && Date.now() > until.getTime()) return { week, status: "running", phase };
      if (!(await renew(q, s))) return { week, status: "busy", phase };
      const next = await step(q, deps, s, phase);
      await q(`update cora_weeks set error_count = 0 where week_of = $1 and holder = $2`, [week, holder]);
      if (next === phase) return { week, status: "running", phase };
      phase = next;
    }
    return { week, status: "ready", phase };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof ModelUnavailable || isModelUnavailable(e)) {
      await failWeek(q, week, dry, `AI Gateway credits ran out, or its key was refused: ${msg}`, deps, holder);
      return { week, status: "failed", note: msg };
    }
    // A passing error (a database blip): recorded, retried by the next run; repeated ones fail the week.
    const [c] = await q<{ error_count: number }>(
      `update cora_weeks set error_count = error_count + 1, error = $3 where week_of = $1 and holder = $2 and status = 'running' returning error_count`,
      [week, holder, msg.slice(0, 2000)],
    ).catch(() => []);
    console.error("[cora] step failed", week, c?.error_count, msg);
    if ((c?.error_count ?? 0) >= ERRORS_BEFORE_FAILING) {
      await failWeek(q, week, dry, msg, deps, holder);
      return { week, status: "failed", note: msg };
    }
    return { week, status: "running", note: msg };
  } finally {
    await q(`update cora_weeks set lease_until = null where week_of = $1 and holder = $2`, [week, holder]).catch(() => {});
  }
}

type StepOptions = JobOptions & { week: string; dry: boolean; until: Date; holder: string };

/** Keeps the lease while working; false when another worker has it now. */
async function renew(q: Query, o: StepOptions): Promise<boolean> {
  const rows = await q(
    `update cora_weeks set lease_until = now() + make_interval(secs => $3) where week_of = $1 and holder = $2 and status = 'running' and dry_run = $4 returning week_of`,
    [o.week, o.holder, LEASE_SECONDS, o.dry],
  );
  return rows.length > 0;
}

/** Runs one phase as far as time allows; returns the phase now recorded. */
async function step(q: Query, deps: CoraDeps, o: StepOptions, phase: string): Promise<string> {
  const setPhase = async (to: string, extra = "", params: unknown[] = []) => {
    const rows = await q(`update cora_weeks set phase = $3 ${extra} where week_of = $1 and holder = $2 and status = 'running' returning week_of`, [o.week, o.holder, to, ...params]);
    return rows.length ? to : phase;
  };

  if (phase === "started") {
    // Close intake: every waiting run gets one pass in this invocation; failures retry next time.
    await processPending(q, { model: deps.intake, ...mail(deps) }, { until: o.until, limit: 100, week: o.week });
    const [left] = await q<{ n: number | string }>(`select count(*) as n from runs where status = 'received' and week_of <= $1`, [o.week]);
    if (Number(left.n) > 0) return phase;
    // The week's contribution, at the cutoff, in its billing period (the contributor rule). Notices and adjustments follow once the week is settled.
    if (!o.dry) await recordWeek(q, o.week, o.settings);
    // The binding sharing check (Unit 9 review): plays not yet in the pool from a test run, a run not shared, or a user who stopped sharing.
    await q(
      `update plays p set shareable = false from runs r left join users u on u.id = r.user_id
       where p.run_id = r.id and p.shareable and p.pool_play_id is null and p.week_of <= $1
         and (r.is_test or r.sharing <> 'share' or (r.user_id is not null and u.sharing <> 'share'))`,
      [o.week],
    );
    const [runs] = await q<{ n: number | string }>(`select count(*) as n from runs where week_of = $1 and not is_test and status in ('accepted', 'flagged')`, [o.week]);
    return setPhase("intake_closed", ", runs_read = $4", [Number(runs.n)]);
  }

  if (phase === "intake_closed") {
    const t = await mergePending(q, deps.merge, { until: o.until, holder: o.holder, limit: 200, week: o.week });
    if (t.busy) return phase;
    await q(`update cora_weeks set plays_merged = plays_merged + $3 where week_of = $1 and holder = $2`, [o.week, o.holder, t.joined + t.created]);
    const [left] = await q<{ n: number | string }>(
      `select count(*) as n from plays p join runs r on r.id = p.run_id
       where p.merged_at is null and p.flag is null and not r.is_test and r.status in ('accepted', 'flagged') and p.week_of <= $1`,
      [o.week],
    );
    return Number(left.n) > 0 ? phase : setPhase("merged");
  }

  if (phase === "merged") {
    await rebuildContent(q, o.week);
    const pool = await loadPool(q, o.week);
    const users = (await loadUsers(q, o.week, { now: o.now })).filter((u) => whoGetsAList(u.facts, "pick").gets);
    const plays = pool.rows.map((r) => ({ id: r.id, title: r.title, evidence: pool.evidence.get(r.id) ?? [], reachCount: users.filter((u) => couldUse(u, r)).length, drafted: r.playbook_drafted }));
    const { scored, retired } = scorePool(plays, { asOf: o.week, weights: o.settings.recencyWeights, activeUsers: users.length });
    // This is the week's snapshot: picking reads these stored scores, so every user is ranked against the same pool.
    // A play an admin removed since the pool was loaded stays out (removed_at is the durable mark, not active).
    await q(
      `update pool_plays pp set f_hours = s.f_hours, f_reach = s.f_reach, f_ease = s.f_ease, f_proof = s.f_proof, f_surprise = s.f_surprise,
         score = s.score, figures = s.figures, active = true
       from jsonb_to_recordset($1::jsonb) as s(id uuid, f_hours int, f_reach int, f_ease int, f_proof int, f_surprise int, score int, figures jsonb)
       where pp.id = s.id and pp.removed_at is null`,
      [
        JSON.stringify(
          scored.map((x) => ({ id: x.id, f_hours: x.f.hours, f_reach: x.f.reach, f_ease: x.f.ease, f_proof: x.f.proof, f_surprise: x.f.surprise, score: Math.round(x.score), figures: cardFigures(x.figures) })),
        ),
      ],
    );
    if (retired.length) await q(`update pool_plays set active = false, score = null where id = any($1::uuid[])`, [retired]);
    return setPhase("scored", ", pool_size = $4", [scored.length]);
  }

  if (phase === "scored") {
    const scored = await storedScores(q);
    const pool = await loadPool(q, o.week);
    const byId = new Map(pool.rows.map((r) => [r.id, r]));
    const allUsers = await loadUsers(q, o.week, { now: o.now });
    const decided = new Set((await q<{ user_id: string }>(`select user_id from cora_user_weeks where week_of = $1 and dry_run = $2`, [o.week, o.dry])).map((r) => r.user_id));
    const todo = allUsers.filter((u) => !decided.has(u.id));
    const breaker = { failures: 0 };
    for (let i = 0; i < todo.length; i += FIT_AT_ONCE) {
      if (Date.now() > o.until.getTime() || !(await renew(q, o))) return phase;
      await Promise.all(
        todo.slice(i, i + FIT_AT_ONCE).map(async (u) => {
          const who = whoGetsAList(u.facts, "pick");
          if (who.gets) return pickFor(q, deps, o, u, scored, byId, breaker);
          await q(
            `insert into cora_user_weeks (user_id, week_of, outcome, note, dry_run) values ($1, $2, 'not_eligible', $3, $4) on conflict (user_id, week_of) do nothing`,
            [u.id, o.week, who.why, o.dry],
          );
        }),
      );
    }
    const [n] = await q<{ n: number | string }>(`select count(*) as n from cora_user_weeks where week_of = $1 and dry_run = $2 and outcome in ('picked', 'short')`, [o.week, o.dry]);
    return setPhase("picked", ", users_picked = $4", [Number(n.n)]);
  }

  if (phase === "picked") {
    const rows = await q(SUPERSEDE_AT_READY_SQL, [o.week, o.holder, o.now.toISOString()]);
    return rows.length ? "ready" : phase;
  }
  throw new Error(`Unknown Cora phase: ${phase}`);
}

const mail = (d: CoraDeps): MailDeps => ({ query: d.query, transport: d.transport, sleep: d.sleep });

/** The scores the "merged" phase stored: the week's one snapshot. The network score is rebuilt exactly from the factor scores. */
/**
 * What the idea card reads (src/lib/cora/idea-view.ts), plus Cora's own
 * merged figures under "cora" for picking.
 */
export function cardFigures(f: Figures): Record<string, unknown> {
  return {
    current_hours_week: f.currentHours,
    range_low: f.rangeLow,
    range_high: f.rangeHigh,
    basis: f.actualContributors > 0 ? "Actual" : f.currentHours != null ? "Implied" : null,
    confidence: f.confidence,
    minutes_saved_each: f.minutes,
    heavy_hours_week: f.heavyHours,
    runners: f.contributors,
    cora: f,
  };
}

async function storedScores(q: Query): Promise<Scored[]> {
  const rows = await q<{ id: string; title: string; f_hours: number; f_reach: number; f_ease: number; f_proof: number; f_surprise: number; figures: { cora: Figures }; playbook_drafted: boolean }>(
    `select id, title, f_hours, f_reach, f_ease, f_proof, f_surprise, figures, playbook_drafted from pool_plays where active and score is not null and removed_at is null`,
  );
  return rows.map((r) => {
    const f = { hours: r.f_hours, reach: r.f_reach, ease: r.f_ease, proof: r.f_proof, surprise: r.f_surprise };
    return { id: r.id, title: r.title, figures: r.figures.cora, reachShare: 0, f, score: networkScore(f, r.playbook_drafted) };
  });
}

/** v1.1 Step 1.3: each pool play's text from its best shareable evidence. The public sample, which an admin read, is never rewritten. */
async function rebuildContent(q: Query, week: string) {
  const pool = await loadPool(q, week);
  const updates = pool.rows.flatMap((r) => {
    const c = bestContent(pool.bodies.get(r.id) ?? []);
    return c ? [{ id: r.id, ...c }] : [];
  });
  if (!updates.length) return;
  await q(
    `update pool_plays pp set title = s.title, description = s.description, playbook_md = s.playbook_md, paste_to_install = s.paste_to_install,
       heavy_use_for = s.heavy_use_for, job = case when s.job <> '' then s.job else pp.job end, playbook_drafted = s.playbook_drafted
     from jsonb_to_recordset($1::jsonb) as s(id uuid, title text, description text, playbook_md text, paste_to_install text, heavy_use_for text, job text, playbook_drafted boolean)
     where pp.id = s.id and not pp.is_public_sample
       and (pp.title, pp.description, pp.playbook_md, pp.paste_to_install, pp.heavy_use_for, pp.playbook_drafted)
         is distinct from (s.title, s.description, s.playbook_md, s.paste_to_install, s.heavy_use_for, s.playbook_drafted)`,
    [JSON.stringify(updates)],
  );
}

/**
 * One user's picks, or the reason there are none, in one statement: exactly one set per user per week.
 *
 * The statement writes only while this worker holds the week's lease (holder and kind of run), like every
 * other write here. It supersedes nothing: a held list is replaced only once the newer week is ready
 * (SUPERSEDE_AT_READY_SQL), so a week that fails after its picks never takes the older held list away.
 *
 * It writes nothing either when a picked play was removed from the pool since the scores were read (2026-11-28
 * review F4), and returns those plays' ids (`removed`) so the caller picks again without them. The pool plays are
 * read `for share`, so a removal at the same moment either lands first (and is seen here) or waits for this
 * statement (and its pick is then skipped at delivery).
 */
export const RECORD_PICKS_SQL = `with lease as (
         select 1 from cora_weeks where week_of = $2::date and holder = $9::text and status = 'running' and dry_run = $7::boolean
       ),
       locked as (select pp.id, pp.removed_at from pool_plays pp where pp.id in (select p.id from jsonb_to_recordset($8::jsonb) as p(id uuid)) for share),
       gone as (select id from locked where removed_at is not null),
       cw as (
         insert into cora_user_weeks (user_id, week_of, outcome, eligible_count, picked_count, note, dry_run)
         select $1::uuid, $2::date, $3::text, $4::int, $5::int, $6::text, $7::boolean where exists (select 1 from lease) and not exists (select 1 from gone)
         on conflict (user_id, week_of) do nothing returning user_id
       ),
       ins as (
         insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run)
         select $1, $2, p.position, p.id, p.personal, p.fit, p.reason, $7
         from cw, jsonb_to_recordset($8::jsonb) as p(position int, id uuid, personal int, fit int, reason text)
         on conflict do nothing
       )
       select coalesce((select array_agg(id::text) from gone), '{}') as removed`;

/**
 * The week becomes ready, and held lists are replaced, in one statement (plan 2026-11-26-001, Unit 3 review).
 *
 * Only the lease holder of a running week moves it to ready ($1 week, $2 holder). In the same statement, for
 * every unsponsored trial still waiting for its first list (FIRST_LIST_PENDING_SQL: every trial with no card,
 * and one whose card was saved since its list was held), each undelivered picked or short week older than the
 * member's newest picked or short week of a ready (or sent) Cora week is stamped `superseded_at` with the job
 * clock ($3). The member is left with at most one held list, the newest one Cora finished:
 *
 * - a newer week that fails after its picks never becomes ready, so it supersedes nothing;
 * - an older week re-run after a newer one (JobOptions.week) is itself superseded as it becomes ready;
 * - week W ready at about 01:00 supersedes W-1 then, so a card saved before the 07:00 send unlocks W.
 *
 * This week's own row is counted as ready (the update above is not visible to the other parts of the
 * statement). Nothing is superseded unless this statement moved the week, and never for a dry run.
 */
export const SUPERSEDE_AT_READY_SQL = `with r as (
         update cora_weeks set phase = 'ready', status = 'ready', finished_at = now()
         where week_of = $1::date and holder = $2::text and status = 'running' returning week_of, dry_run
       ),
       newest as (
         select nw.user_id, max(nw.week_of) as week_of
         from cora_user_weeks nw join cora_weeks nk on nk.week_of = nw.week_of
         where not nw.dry_run and not nk.dry_run and nw.outcome in ('picked', 'short') and (nk.status in ('ready', 'sent') or nk.week_of = $1::date)
         group by nw.user_id
       ),
       s as (
         update cora_user_weeks cw set superseded_at = coalesce($3::timestamptz, now())
         from newest n, users u
         where exists (select 1 from r where not r.dry_run)
           and cw.user_id = n.user_id and u.id = cw.user_id and cw.week_of < n.week_of
           and not cw.dry_run and cw.outcome in ('picked', 'short') and cw.delivered_at is null and cw.superseded_at is null
           and (${NO_CARD_TRIAL_SQL("u")} or ${FIRST_LIST_PENDING_SQL("u")})
       )
       select week_of from r`;

async function pickFor(q: Query, deps: CoraDeps, o: StepOptions, u: CoraUser, scored: Scored[], byId: Map<string, PoolRow>, breaker: { failures: number }) {
  /** Records the picks; returns the ids of any picked play removed from the pool meanwhile (then nothing was written). */
  const record = async (outcome: string, eligible: number, picks: { position: number; id: string; personal: number; fit: number; reason: string }[], note = "") => {
    const [r] = await q<{ removed: string[] }>(RECORD_PICKS_SQL, [u.id, o.week, outcome, eligible, picks.length, note.slice(0, 300), o.dry, JSON.stringify(picks), o.holder]);
    return r?.removed ?? [];
  };

  const eligible = eligiblePlays(
    scored.filter((s) => byId.has(s.id)).map((s) => ({ ...s, retired: false })),
    u.ctx,
  ).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  if (!eligible.length) return record("none", 0, [], "no eligible plays");

  const candidates = eligible.slice(0, CANDIDATES_PER_USER);
  let judged: FitResult[] = [];
  // After a few failures in this run, the rest are fitted by code rather than waiting on a struggling model.
  if (breaker.failures < 3) {
    try {
      judged = await deps.fit.fit(
        { role: u.role, categories: [...u.categories], friction: u.friction },
        candidates.map((c) => {
          const r = byId.get(c.id)!;
          return { id: r.id, title: r.title, category: r.category, job: r.job, heavy_use_for: r.heavy_use_for, who_can_use_it: r.who_can_use_it };
        }),
      );
    } catch (e) {
      rethrowIfUnavailable(e);
      breaker.failures++;
      console.error("[cora] fit failed; using categories", u.id, e instanceof Error ? e.message : e);
    }
  }
  let fitted: (Fitted & { reason: string })[] = candidates.map((c) => {
    const r = byId.get(c.id)!;
    const b = boundFit(
      judged.find((x) => x.id === c.id),
      codeFit(u, r),
    );
    return { play: c, fit: b.fit, frictionMatch: b.frictionMatch, installable: installable(u, r), reason: reasonFor(b.why, r) };
  });
  // A play removed from the pool while this user was being picked for is left out, and the rest picked again (F4).
  let left = eligible.length;
  for (;;) {
    const result = pickThree(fitted);
    if (result.outcome === "none") return record("none", left, [], "no eligible plays");
    const picks = result.picks.map((p) => {
      const reason = fitted.find((f) => f.play.id === p.play.id)!.reason;
      return { position: p.position, id: p.play.id, personal: Math.round(p.personal), fit: p.fit, reason: p.installable ? reason : `${reason}${needsLine(byId.get(p.play.id)!.requires)}` };
    });
    const removed = new Set(await record(result.outcome, left, picks));
    if (!removed.size) return;
    fitted = fitted.filter((f) => !removed.has(f.play.id));
    left -= removed.size;
  }
}

async function alert(week: string, dry: boolean, message: string, deps: MailDeps) {
  // A dry run's alert has its own name, so it never uses up the real week's alert.
  const kind = dry ? "cora_dry_run_failed" : "cora_failed";
  const subject = dry ? `Cora's dry run failed for ${week}` : `Cora failed for ${week}`;
  const lines = dry ? [message, "This was a dry run: nothing would have been sent."] : [message, "Nothing will be sent for this week. Open /admin/cora to see what happened."];
  await alertAdmins(kind, week, adminAlert(subject, lines), deps).catch(() => {});
}

async function failWeek(q: Query, week: string, dry: boolean, message: string, deps: MailDeps, holder?: string) {
  const rows = await q(
    `update cora_weeks set status = 'failed', error = $2, finished_at = now() where week_of = $1 and status = 'running' and ($3::text is null or holder = $3) returning week_of`,
    [week, message.slice(0, 2000), holder ?? null],
  );
  if (rows.length) await alert(week, dry, message, deps);
}

/**
 * Dry-run picks are never sent or charged; they are cleared when the cycle
 * goes live, or when a real run starts for that week. A dry week still being
 * worked is left alone.
 */
export async function clearDryRun(q: Query, week?: string): Promise<void> {
  await q(
    `with gone as (
       delete from cora_weeks where dry_run and ($1::date is null or week_of = $1) and (lease_until is null or lease_until < now()) returning week_of
     ),
     p as (delete from picks where dry_run and week_of in (select week_of from gone))
     delete from cora_user_weeks where dry_run and week_of in (select week_of from gone)`,
    [week ?? null],
  );
}
