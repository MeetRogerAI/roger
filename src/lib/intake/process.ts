import { isModelUnavailable, rethrowIfUnavailable } from "@/lib/ai/errors";
import type { Query } from "@/lib/db-query";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { runNeedsALookEmail } from "@/lib/mail/templates/run-needs-a-look";
import { ModelCutOff, slicePlaybook, type IntakeModel, type ReviewFinding } from "./model";
import { parseProfileBlock, parseRunBlock, withoutPrivateBlocks } from "./parse-block";
import { harmFlags, phrasePattern, replaceNeverWords, replacePatterns } from "./privacy-patterns";
import { validateRun, type ParsedRun, type Play } from "./validate";

/**
 * Spec B.6, run as each run arrives and again as a batch before Cora. Safe to
 * run twice: each pass claims an attempt first, and the result is written
 * only while the run is still `received` at the revision that was read.
 *
 * Whether a play is shareable is decided here from what is known now; Cora
 * checks the user's sharing again at the cutoff before anything is pooled.
 */
export const MAX_ATTEMPTS = 3;

export type Outcome = "accepted" | "flagged" | "rejected" | "retry" | "skipped";
export type IntakeDeps = { model: IntakeModel } & MailDeps;

type RunRow = {
  id: string;
  revision: number;
  raw_text: string;
  sharing: string;
  user_sharing: string | null;
  is_test: boolean;
  user_id: string | null;
  contributor_id: string | null;
  email: string | null;
  never_words: string[] | null;
  skip_categories: string[] | null;
};

/** What a member may read on /app/zack. Internal errors go to the log, never here. */
const REASON = {
  unreadable: "Zack's report couldn't be read automatically, so someone at Roger will read it. It still counts for this week.",
  tooLong: "Zack's report was too long to read automatically, so someone at Roger will read it. It still counts for this week.",
};

const NAME_PLACEHOLDER: Record<"person" | "company" | "place", string> = { person: "[a person]", company: "[a company]", place: "[a place]" };

export async function processRun(q: Query, runId: string, deps: IntakeDeps): Promise<Outcome> {
  // Claim an attempt before any model call, so a run that hangs or is killed moves towards an admin.
  const [run] = await q<RunRow & { attempts: number }>(
    `with claim as (update runs set attempts = attempts + 1 where id = $1 and status = 'received' returning id, revision, attempts)
     select r.id, c.revision, c.attempts, r.raw_text, r.sharing, u.sharing as user_sharing, r.is_test, r.user_id, r.contributor_id, u.email,
            zs.never_words, zs.skip_categories
     from claim c join runs r on r.id = c.id left join users u on u.id = r.user_id left join zack_settings zs on zs.user_id = r.user_id`,
    [runId],
  );
  if (!run) return "skipped";
  if (run.attempts > MAX_ATTEMPTS) return flagWhole(q, run, REASON.unreadable);
  try {
    return await processClaimed(q, run, deps);
  } catch (e) {
    // No credits or no key: retrying cannot help, so stop and say so (the attempt is not counted).
    if (isModelUnavailable(e)) {
      await q(`update runs set attempts = greatest(attempts - 1, 0) where id = $1 and status = 'received'`, [run.id]).catch(() => {});
      rethrowIfUnavailable(e);
    }
    console.error("[intake] run", run.id, e instanceof Error ? e.message : e);
    return giveUpIfLast(q, run);
  }
}

async function processClaimed(q: Query, run: RunRow & { attempts: number }, deps: IntakeDeps): Promise<Outcome> {
  // 1. Parse: the block if there is one, else the model.
  let parsed: ParsedRun;
  let parsedBy: "block" | "model";
  const block = parseRunBlock(run.raw_text);
  // What the model reads, and where stated figures are looked for: never a private block (build spec T3).
  const readable = withoutPrivateBlocks(run.raw_text);
  if (block !== null) {
    const v = validateRun(block);
    if (!v.ok) return reject(q, run, v.reason, deps);
    parsed = v.run;
    parsedBy = "block";
  } else {
    const read = await readWithModel(readable, deps.model);
    if (read.kind === "cut_off") return flagWhole(q, run, REASON.tooLong);
    const v = validateRun(read.run);
    // Our reader's mistake, not Zack's: try again, then an admin. The member is not told to rerun Zack.
    if (!v.ok) {
      console.error("[intake] model output invalid", run.id, v.reason);
      return giveUpIfLast(q, run);
    }
    parsed = v.run;
    parsedBy = "model";
  }

  // 2. The member's own rules: plays in a category they asked Zack to skip are dropped.
  const skip = new Set((run.skip_categories ?? []).map((c) => c.toLowerCase()));
  const kept = parsed.plays.filter((p) => !skip.has(p.category.toLowerCase()));

  // 3. Privacy and harm, on every string in the play: patterns, the never-include list, then the model review.
  const plays = kept.map((p, i) => cleanPlay(p, `p${i + 1}`, run.never_words ?? [], parsedBy, readable));
  const alsoRuns = parsed.also_runs.map((a) => cleanStrings(a, run.never_words ?? []).value);
  let findings: ReviewFinding[];
  try {
    const texts = plays.map((p) => ({ id: p.id, text: allStrings(p.play).join("\n\n") }));
    if (alsoRuns.length) texts.push({ id: "also", text: alsoRuns.map((a) => `${a.title}: ${a.job}`).join("\n") });
    findings = await deps.model.review(texts);
  } catch (e) {
    console.error("[intake] review failed", run.id, e instanceof Error ? e.message : e);
    return giveUpIfLast(q, run);
  }
  let alsoRunsOut = alsoRuns;
  applyFindings(findings, plays, () => {
    alsoRunsOut = []; // Runners-up are matching context only; anything unclear in them is simply dropped.
  });
  for (const a of alsoRunsOut) for (const n of findings.filter((f) => f.playId === "also" && f.clear && f.kind !== "harm")) {
    a.title = a.title.replace(phrasePattern(n.text), NAME_PLACEHOLDER[n.kind as keyof typeof NAME_PLACEHOLDER]);
    a.job = a.job.replace(phrasePattern(n.text), NAME_PLACEHOLDER[n.kind as keyof typeof NAME_PLACEHOLDER]);
  }

  // 4. Result. A "matching only" or test run never yields shareable plays, cleared or not.
  const shareableRun = run.sharing === "share" && (run.contributor_id !== null || run.user_sharing === "share") && !run.is_test;
  const counters: Record<string, number> = {};
  const rows = plays.map((p) => {
    const position = (counters[p.play.set] = (counters[p.play.set] ?? 0) + 1);
    const flagged = p.flags.size > 0;
    return {
      set_: p.play.set,
      position,
      title: p.play.title,
      category: p.play.category,
      body: { ...p.play, privacy: p.replaced },
      shareable: shareableRun && !flagged,
      // Reasons and where, never the private text itself.
      flag: flagged ? { reasons: [...p.flags], fields: [...p.flagFields] } : null,
    };
  });
  const status = rows.some((r) => r.flag) ? "flagged" : "accepted";
  const stored = { ...parsed, plays: rows.map((r) => r.body), also_runs: alsoRunsOut };
  const ok = await finish(q, run, { status, reason: "", parsed: stored, parsedBy, plays: rows });
  return ok ? status : "skipped";
}

type Cleaned = { id: string; play: Play; flags: Set<string>; flagFields: Set<string>; replaced: { kind: string; placeholder: string }[] };

/** Every string in a value, depth first. */
function allStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === "object") return Object.values(v).flatMap(allStrings);
  return [];
}

/** Applies `f` to every string in a value, keeping its shape. */
function mapStrings<T>(v: T, f: (s: string, path: string) => string, path = ""): T {
  if (typeof v === "string") return f(v, path) as T;
  if (Array.isArray(v)) return v.map((x, i) => mapStrings(x, f, `${path}[${i}]`)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f, path ? `${path}.${k}` : k)])) as T;
  return v;
}

function cleanStrings<T>(v: T, neverWords: string[]) {
  const replaced: { kind: string; placeholder: string }[] = [];
  const flags = new Set<string>();
  const flagFields = new Set<string>();
  const value = mapStrings(v, (s, path) => {
    for (const h of harmFlags(s)) {
      flags.add(h);
      flagFields.add(path);
    }
    const a = replacePatterns(s);
    const b = replaceNeverWords(a.text, neverWords);
    // Recorded by kind only: the private text itself is not copied anywhere.
    for (const x of [...a.findings, ...b.findings]) replaced.push({ kind: x.kind, placeholder: x.placeholder ?? "" });
    return b.text;
  });
  return { value, replaced, flags, flagFields };
}

const FIGURES = ["minutes_saved_each", "runs_week", "current_hours_week", "range_low", "range_high", "weeks_running", "heavy_runs_week", "heavy_hours_week"] as const;

/** A number the model gives must be written in the report; otherwise it is missing, not invented. */
function statedIn(report: string, n: number): boolean {
  const forms = new Set([String(n), n.toFixed(1), n.toFixed(2), String(Math.round(n))]);
  return [...forms].some((f) => new RegExp(`(?<![\\d.])${f.replace(".", "\\.")}(?![\\d])`).test(report));
}

function cleanPlay(play: Play, id: string, neverWords: string[], parsedBy: "block" | "model", report: string): Cleaned {
  const c = cleanStrings(play, neverWords);
  const out = c.value;
  if (parsedBy === "model") {
    for (const f of FIGURES) if (out[f] != null && !statedIn(report, out[f])) out[f] = null;
    if (!out.outline_only && out.playbook_md.trim().length < 50) {
      c.flags.add("its playbook could not be found in the report");
      c.flagFields.add("playbook_md");
    }
  }
  if (play.sensitive) c.flags.add("Zack marked it sensitive");
  return { id, play: out, flags: c.flags, flagFields: c.flagFields, replaced: c.replaced };
}

/**
 * Names and harm from the model review. Clear names are replaced in every
 * play, longest first, in any capitalisation; a clear name that replaces
 * nothing, an unclear name, any harm, or a finding for a play that does not
 * exist, flags (every play, when it cannot be placed). Fails closed.
 */
function applyFindings(findings: ReviewFinding[], plays: Cleaned[], dropAlsoRuns: () => void) {
  const flag = (target: Cleaned[], reason: string) => target.forEach((p) => p.flags.add(reason));
  const known = (id: string) => plays.find((p) => p.id === id);
  const clear = findings.filter((f) => f.kind !== "harm" && f.clear && f.text.trim()).sort((a, b) => b.text.length - a.text.length);
  const done: string[] = [];
  for (const f of clear) {
    // "Dana" after "Dana Whitfield" was replaced has nothing left to replace, and that is fine.
    const inLonger = done.some((d) => phrasePattern(f.text).test(d));
    done.push(f.text);
    if (inLonger && !plays.some((p) => allStrings(p.play).some((s) => phrasePattern(f.text).test(s)))) continue;
    const placeholder = NAME_PLACEHOLDER[f.kind as keyof typeof NAME_PLACEHOLDER];
    let count = 0;
    for (const p of plays) {
      p.play = mapStrings(p.play, (s) =>
        s.replace(phrasePattern(f.text), () => {
          count++;
          return placeholder;
        }),
      );
    }
    if (count > 0) for (const p of plays) p.replaced.push({ kind: f.kind, placeholder });
    else if (f.playId !== "also") flag(known(f.playId) ? [known(f.playId)!] : plays, `may contain a private ${f.kind} name`);
  }
  for (const f of findings.filter((x) => x.kind === "harm" || !x.clear)) {
    if (f.playId === "also") {
      dropAlsoRuns();
      continue;
    }
    const reason = f.kind === "harm" ? `could harm whoever runs it: ${f.reason.slice(0, 120) || "see the playbook"}` : `may contain a private ${f.kind} name`;
    flag(known(f.playId) ? [known(f.playId)!] : plays, reason);
  }
}

type Read = { kind: "ok"; run: unknown } | { kind: "cut_off" };

/** The model path, retried once with a smaller scope if the answer is cut off for length. Other errors throw. */
async function readWithModel(report: string, model: IntakeModel): Promise<Read> {
  for (const maxPlays of [4, 2]) {
    try {
      const r = await model.readRun(report, { maxPlays });
      return {
        kind: "ok",
        run: {
          plays: r.plays.map(({ playbook_first_words, playbook_last_words, ...p }) => ({
            ...p,
            playbook_md: slicePlaybook(report, playbook_first_words, playbook_last_words, p.title),
          })),
          also_runs: r.also_runs,
        },
      };
    } catch (e) {
      if (e instanceof ModelCutOff) continue;
      throw e;
    }
  }
  return { kind: "cut_off" };
}

type PlayRow = { set_: string; position: number; title: string; category: string; body: unknown; shareable: boolean; flag: unknown };

async function finish(q: Query, run: RunRow, r: { status: string; reason: string; parsed: unknown; parsedBy: "block" | "model" | null; plays: PlayRow[] }): Promise<boolean> {
  const [res] = await q<{ updated: number | string }>(
    `with r as (
       update runs set status = $3, reason = $4, parsed = $5, parsed_by = $6, processed_at = now()
       where id = $1 and revision = $2 and status = 'received'
       returning id, user_id, contributor_id, week_of, revision
     ),
     ins as (
       insert into plays (run_id, user_id, contributor_id, week_of, set_, position, title, category, body, shareable, flag, revision)
       select r.id, r.user_id, r.contributor_id, r.week_of, p.set_, p.position, p.title, p.category, p.body, p.shareable, p.flag, r.revision
       from r, jsonb_to_recordset($7::jsonb) as p(set_ text, position int, title text, category text, body jsonb, shareable boolean, flag jsonb)
       on conflict (run_id, set_, position) do update set title = excluded.title, category = excluded.category, body = excluded.body,
         shareable = excluded.shareable, flag = excluded.flag, revision = excluded.revision, week_of = excluded.week_of,
         -- New text is a new play for Cora: it is placed in the pool again, never left on the old one's pool play.
         pool_play_id = null, merged_at = null
       returning id
     )
     select (select count(*) from r) as updated`,
    [run.id, run.revision, r.status, r.reason, r.parsed === null ? null : JSON.stringify(r.parsed), r.parsedBy, JSON.stringify(r.plays)],
  );
  const updated = Number(res?.updated ?? 0) > 0;
  // Plays left over from an older text of this run (a replacement racing this write) go.
  if (updated) await q(`delete from plays where run_id = $1 and revision <> (select revision from runs where id = $1)`, [run.id]);
  return updated;
}

async function reject(q: Query, run: RunRow, reason: string, deps: IntakeDeps): Promise<Outcome> {
  const ok = await finish(q, run, { status: "rejected", reason, parsed: null, parsedBy: null, plays: [] });
  if (ok && run.user_id && run.email && !run.is_test) {
    await sendToUser({ id: run.user_id, email: run.email }, "run_rejected", `${run.id}:${run.revision}`, runNeedsALookEmail({ reason }), deps).catch((e) =>
      console.error("[intake] rejection email failed", e instanceof Error ? e.message : e),
    );
  }
  return ok ? "rejected" : "skipped";
}

/** The whole run waits for an admin; it still counts as contributed (spec B.6 step 6). */
async function flagWhole(q: Query, run: RunRow, reason: string): Promise<Outcome> {
  return (await finish(q, run, { status: "flagged", reason, parsed: null, parsedBy: null, plays: [] })) ? "flagged" : "skipped";
}

/** A failure leaves the run `received` for the batch pass; on the last attempt an admin gets it. */
async function giveUpIfLast(q: Query, run: RunRow & { attempts: number }): Promise<Outcome> {
  return run.attempts >= MAX_ATTEMPTS ? flagWhole(q, run, REASON.unreadable) : "retry";
}

/** The private profile: parsed for matching only, never shared. */
export async function processProfile(q: Query, id: string): Promise<Outcome> {
  const [p] = await q<{ raw_text: string; revision: number }>(`select raw_text, revision from zack_profiles where id = $1 and status = 'received'`, [id]);
  if (!p) return "skipped";
  const parsed = parseProfileBlock(p.raw_text);
  const status = parsed ? "accepted" : "rejected";
  const rows = await q(
    `update zack_profiles set status = $3, parsed = $4, reason = $5, processed_at = now() where id = $1 and revision = $2 and status = 'received' returning id`,
    [id, p.revision, status, parsed ? JSON.stringify(parsed) : null, parsed ? "" : "The profile had no readable roger-profile block."],
  );
  return rows.length ? status : "skipped";
}

/**
 * The batch pass before Cora (and a safety net for anything the arrival pass
 * missed). Stops starting new runs once `until` is near, so it never runs past
 * the function's time limit; what is left waits for the next pass.
 */
export async function processPending(
  q: Query,
  deps: IntakeDeps,
  o: { limit?: number; until?: Date; perRunMs?: number; week?: string } = {},
): Promise<Record<Outcome, number>> {
  const tally: Record<Outcome, number> = { accepted: 0, flagged: 0, rejected: 0, retry: 0, skipped: 0 };
  const timeLeft = () => (o.until ? o.until.getTime() - Date.now() : Infinity);
  const perRun = o.perRunMs ?? 110_000;
  const runs = await q<{ id: string }>(
    `select id from runs where status = 'received' and ($2::date is null or week_of <= $2::date) order by attempts, received_at limit $1`,
    [o.limit ?? 200, o.week ?? null],
  );
  for (const r of runs) {
    if (timeLeft() < perRun) break;
    try {
      tally[await processRun(q, r.id, deps)]++;
    } catch (e) {
      rethrowIfUnavailable(e);
      console.error("[intake] run failed", r.id, e instanceof Error ? e.message : e);
      tally.retry++;
    }
  }
  const profiles = await q<{ id: string }>(`select id from zack_profiles where status = 'received' order by received_at limit $1`, [o.limit ?? 200]);
  for (const p of profiles) {
    try {
      tally[await processProfile(q, p.id)]++;
    } catch (e) {
      console.error("[intake] profile failed", p.id, e instanceof Error ? e.message : e);
    }
  }
  return tally;
}
