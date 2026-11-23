import { logAdminAction } from "@/lib/admin/log";
import { addDays, currentMonday, cutoffInstant, torontoDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, sendToUser } from "@/lib/mail/send";
import { missedForgivenEmail } from "@/lib/mail/templates/missed-forgiven";

import type { V3Settings } from "@/lib/v3-settings";
import {
  ANCHOR,
  dropAdjustments,
  dropReasonFor,
  ensureAdjustment,
  ISO,
  liveAdjustment,
  oweNotice,
  periodOf,
  placeAdjustments,
  SETTLED_SQL,
  type AdjustDeps,
  type OweReason,
  type RuleUser,
} from "./adjustment";
import { countMisses, periodAt } from "./period";
import { amount, money, type Currency } from "./prices";

/**
 * The contributor rule (spec B.9, plan Unit 14), for monthly members only.
 *
 * At the Sunday cutoff each active monthly member's week is recorded as
 * contributed (an accepted or flagged run, sent while sharing), by choice
 * ("matching only" or "Zack off" at the cutoff, so billed at the higher rate
 * for that month instead, see rate.ts), or missed; Roger's own failures turn
 * a miss into "excused". The week belongs to the billing month containing
 * the cutoff, counted from the subscription's anchor. Once the week is
 * settled (Cora finished or failed), the first miss in a month is forgiven
 * with an email; the next raises the adjustment and its email. Every step
 * decides from stored rows, so a repeated pass changes nothing and a failed
 * email is tried again by the next pass.
 */

/** Which of the user's weeks to look at again on each pass. */
const LOOK_BACK_DAYS = 21;

/**
 * Records the week's result for every active monthly member. Called by the
 * Cora job once intake has closed (all of the week's runs are read). A row
 * already there (an admin excused the week in advance) is kept.
 */
export async function recordWeek(q: Query, week: string, s: V3Settings): Promise<number> {
  const cutoff = cutoffInstant(week, s.runCutoff);
  // Sharing at the cutoff, as the charge reads it (first-charge.ts sharingAtCutoff): the last change before it; none, but some after, means "share".
  const users = await q<{ id: string; anchor: string | null; sharing: string; contributed: boolean }>(
    `select u.id, ${ISO(ANCHOR())} as anchor,
       coalesce(
         (select h.sharing from zack_settings_history h where h.user_id = u.id and h.changed_at < $2 order by h.changed_at desc, h.id desc limit 1),
         case when exists (select 1 from zack_settings_history h where h.user_id = u.id and h.changed_at >= $2) then 'share' else u.sharing end
       ) as sharing,
       exists (select 1 from runs r where r.user_id = u.id and r.week_of = $1 and not r.is_test and r.sharing = 'share' and r.status in ('accepted', 'flagged')) as contributed
     -- A sponsored member pays nothing, so the contributor rule never applies to them.
     from users u where u.status = 'active' and u.plan = 'monthly' and u.sponsor_id is null`,
    [week, cutoff.toISOString()],
  );
  if (!users.length) return 0;
  const rows = users.map((u) => ({
    user_id: u.id,
    result: u.sharing !== "share" ? "by_choice" : u.contributed ? "contributed" : "missed",
    period_start: periodAt(u.anchor, cutoff)?.startDate ?? null,
  }));
  // A week an admin excused before it was recorded (for this member, or for everyone): a miss is recorded as
  // excused. Contributed and by choice are never overridden. The member's own excuse names its admin plainly.
  const ins = await q(
    `insert into contribution_weeks (user_id, week_of, result, excused_by, period_start)
     select x.user_id, $1, case when x.result = 'missed' and e.excused_by is not null then 'excused' else x.result end,
            case when x.result = 'missed' then e.excused_by end, x.period_start
     from jsonb_to_recordset($2::jsonb) as x(user_id uuid, result text, period_start date)
     left join lateral (
       select case when w.user_id is null then w.excused_by || ' (everyone)' else w.excused_by end as excused_by
       from week_excuses w where w.week_of = $1::date and (w.user_id = x.user_id or w.user_id is null)
       order by w.user_id nulls last limit 1
     ) e on true
     on conflict (user_id, week_of) do nothing returning user_id`,
    [week, JSON.stringify(rows)],
  );
  return ins.length;
}

type Member = RuleUser & { id: string; email: string; sharing: string; currency: Currency | null; anchor: string | null };

const MEMBER_SQL = `select id, email, status, plan, sharing, currency, stripe_subscription, cancel_requested_at::text, plan_change_to, ${ISO(ANCHOR("users"))} as anchor from users where id = $1`;

export type PeriodOutcome = "none" | "forgiven" | "second" | "dropped";

/**
 * Brings one member's month in line with its weeks. A month owes the higher
 * rate's difference if any cutoff found sharing off, or more weeks were
 * missed than are forgiven: then the one difference row stands, with its
 * notice. Otherwise, the forgiven email for a miss (and any difference
 * dropped, after an excuse). A member the rule no longer applies to has the
 * difference dropped with the matching reason.
 */
export async function settlePeriod(q: Query, d: AdjustDeps, userId: string, periodStart: string): Promise<PeriodOutcome> {
  const [u] = await q<Member>(MEMBER_SQL, [userId]);
  if (!u?.anchor) return "none";
  // Only weeks Cora has settled count: one still being worked may yet be excused.
  const rows = await q<{ week_of: string; result: string }>(
    `select to_char(c.week_of, 'YYYY-MM-DD') as week_of, c.result from contribution_weeks c
     where c.user_id = $1 and c.period_start = $2 and ${SETTLED_SQL("c")} order by c.week_of`,
    [userId, periodStart],
  );
  const missed = rows.filter((r) => r.result === "missed");
  const byChoice = rows.filter((r) => r.result === "by_choice");
  const allowed = d.settings.forgivenMissesPerMonth;
  const cur = u.currency ?? "USD";
  const higher = money(amount(d.settings, "monthly", cur, "higher"), cur);
  const why = dropReasonFor(u);
  const before = await liveAdjustment(q, userId, periodStart);

  if (!byChoice.length && countMisses(rows.map((r) => r.result)) <= allowed) {
    // An excuse took the count back down: the difference no longer stands.
    const dropped = await dropAdjustments(q, d, userId, "excused", { periodStart });
    if (before?.status === "invoiced" && before.reason === "two_misses") {
      await alertAdmins("adjustment_excused_after_invoice", `${userId}:${periodStart}`, adminAlert("An excused week's higher-rate difference was already invoiced", [`User ${userId}, month from ${periodStart}. Credit or refund the higher-rate line.`]), d).catch(() => {});
    }
    // A month already billed at the higher rate (the first month charged it up front) has nothing to forgive.
    if (!missed.length || why || before?.status === "invoiced") return dropped ? "dropped" : "none";
    const last = missed[missed.length - 1];
    const p = periodAt(u.anchor, cutoffInstant(last.week_of, d.settings.runCutoff));
    if (!p) return "none";
    await sendToUser(
      { id: u.id, email: u.email },
      "missed_forgiven",
      `${periodStart}:${missed.length}`,
      missedForgivenEmail({ periodEnd: p.end > d.now ? p.endDate : null, higher }),
      d,
    ).catch(() => {});
    return "forgiven";
  }

  if (why === "wait") return "none";
  if (why) return (await dropAdjustments(q, d, userId, why, { periodStart })) ? "dropped" : "none";
  const weekOf = (byChoice[0] ?? missed[allowed] ?? rows[rows.length - 1]).week_of;
  const live = await ensureAdjustment(q, d, { userId, periodStart, weekOf, anchor: u.anchor, currency: cur });
  // An invoiced one (the first month charged the higher rate up front, or a renewal already billed) needs no notice.
  if (!live || live.status !== "pending") return "none";
  // One notice per row, so one raised again (after an excuse or an undone cancellation) has its own.
  const p = periodOf(u.anchor, periodStart);
  const notice = oweNotice(live.reason, d.settings, {
    amountCents: live.amountCents,
    currency: live.currency,
    invoiceDate: torontoDate(new Date(live.invoiceAt)),
    periodEnd: p?.endDate ?? periodStart,
    periodEndAt: p?.end ?? null,
    now: d.now,
  });
  await sendToUser({ id: u.id, email: u.email }, notice.kind, live.id, notice.message, d).catch(() => {});
  return "second";
}

/**
 * Every pass (the send job, the hourly pass): for weeks Cora has settled,
 * excuse what Roger caused (the week failed, or the member had no list
 * because nothing in the pool fit them), then settle each member's month
 * that has a miss or a pending adjustment, then make any Stripe items due.
 */
export async function processContributions(q: Query, d: AdjustDeps): Promise<Record<PeriodOutcome | "excused" | "placed", number>> {
  const tally: Record<PeriodOutcome | "excused" | "placed", number> = { none: 0, forgiven: 0, second: 0, dropped: 0, excused: 0, placed: 0 };
  const weeks = (
    await q<{ week: string }>(
      `select to_char(week_of, 'YYYY-MM-DD') as week from cora_weeks where not dry_run and status in ('ready', 'sent', 'failed') and week_of >= $1 and week_of <= $2`,
      [addDays(torontoDate(d.now), -LOOK_BACK_DAYS), torontoDate(d.now)],
    )
  ).map((r) => r.week);
  if (weeks.length) {
    const excused = await q<{ user_id: string }>(
      `update contribution_weeks cw set result = 'excused', excused_by = 'roger'
       where cw.result = 'missed' and cw.week_of = any($1::date[])
         and (exists (select 1 from cora_weeks w where w.week_of = cw.week_of and not w.dry_run and w.status = 'failed')
              or exists (select 1 from cora_user_weeks c where c.user_id = cw.user_id and c.week_of = cw.week_of and not c.dry_run and c.outcome = 'none'))
       returning cw.user_id`,
      [weeks],
    );
    tally.excused = excused.length;
  }
  // A month with a miss in the weeks looked at, or one whose adjustment is still pending (an excuse may have taken it back).
  // A month already done (its item placed and its notice sent) is left alone unless one of its weeks was excused.
  const periods = await q<{ user_id: string; period_start: string }>(
    `select distinct cw.user_id, to_char(cw.period_start, 'YYYY-MM-DD') as period_start from contribution_weeks cw
     where cw.period_start is not null and (
       (cw.week_of = any($1::date[]) and cw.result in ('missed', 'excused', 'by_choice'))
       or exists (select 1 from pending_adjustments a where a.user_id = cw.user_id and a.period_start = cw.period_start and a.status = 'pending'))
       and not (
         exists (
           select 1 from pending_adjustments a join notifications n on n.recipient = a.user_id::text and n.ref = a.id::text and n.kind in ('second_miss', 'not_sharing_month') and n.status = 'sent'
           where a.user_id = cw.user_id and a.period_start = cw.period_start and a.status = 'pending' and a.stripe_item is not null)
         and not exists (select 1 from contribution_weeks x where x.user_id = cw.user_id and x.period_start = cw.period_start and x.result = 'excused')
       )`,
    [weeks],
  );
  for (const p of periods) {
    try {
      tally[await settlePeriod(q, d, p.user_id, p.period_start)]++;
    } catch (e) {
      console.error("[contribution] settle", p.user_id, e instanceof Error ? e.message : e);
    }
  }
  tally.placed = await placeAdjustments(q, d);
  return tally;
}

/**
 * An admin excuses a week, for one member or for everyone who missed it
 * (spec B.9, B.12). The week then never counts; an adjustment it caused is
 * deleted (or, if already invoiced, admins are told to credit it). A week
 * not recorded yet is excused in advance through `week_excuses`, which
 * recordWeek applies only to a result that would be "missed". Returns how
 * many recorded weeks changed (a pending excuse changes none yet).
 */
export async function excuseWeek(q: Query, d: AdjustDeps, o: { week: string; userId: string | null; by: string }): Promise<number> {
  let rows: { user_id: string; period_start: string | null }[];
  let pending = false;
  if (o.userId) {
    rows = await q(
      `update contribution_weeks set result = 'excused', excused_by = $3 where user_id = $1 and week_of = $2 and result = 'missed'
       returning user_id, to_char(period_start, 'YYYY-MM-DD') as period_start`,
      [o.userId, o.week, o.by],
    );
    if (!rows.length) {
      // Not recorded yet: a pending excuse, applied by recordWeek only if the week turns out missed.
      const made = await q(
        `insert into week_excuses (week_of, user_id, excused_by)
         select $2, u.id, $3 from users u where u.id = $1 and not exists (select 1 from contribution_weeks c where c.user_id = $1 and c.week_of = $2)
         on conflict (week_of, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing returning id`,
        [o.userId, o.week, o.by],
      );
      pending = made.length > 0;
    }
  } else {
    // Kept for the week, so members not recorded yet are covered when they are, and so the excuse can be undone.
    await q(
      `insert into week_excuses (week_of, user_id, excused_by) values ($1, null, $2)
       on conflict (week_of, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing`,
      [o.week, o.by],
    );
    rows = await q(
      `update contribution_weeks set result = 'excused', excused_by = $2 || ' (everyone)' where week_of = $1 and result = 'missed'
       returning user_id, to_char(period_start, 'YYYY-MM-DD') as period_start`,
      [o.week, o.by],
    );
  }
  await logAdminAction(q, { by: o.by, userId: o.userId, action: "excuse_week", detail: { week: o.week, everyone: !o.userId, rows: rows.length, pending } });
  await settleAll(q, d, rows);
  return rows.length;
}

/**
 * Undoes an excuse for everyone: its row goes, and the weeks it excused are
 * missed again, except where the member has an excuse of their own or Roger
 * caused the miss (a failed week, or nothing in the pool fit them), which
 * stay excused. Each month is then settled again. Returns how many weeks
 * changed, or null when there was no such excuse.
 */
export async function undoExcuseForEveryone(q: Query, d: AdjustDeps, o: { week: string; by: string }): Promise<number | null> {
  const gone = await q(`delete from week_excuses where week_of = $1 and user_id is null returning id`, [o.week]);
  if (!gone.length) return null;
  const roger = `(exists (select 1 from cora_weeks w where w.week_of = cw.week_of and not w.dry_run and w.status = 'failed')
                  or exists (select 1 from cora_user_weeks c where c.user_id = cw.user_id and c.week_of = cw.week_of and not c.dry_run and c.outcome = 'none'))`;
  const rows = await q<{ user_id: string; period_start: string | null }>(
    `update contribution_weeks cw set result = case when ${roger} then 'excused' else 'missed' end, excused_by = case when ${roger} then 'roger' end
     where cw.week_of = $1 and cw.result = 'excused' and cw.excused_by like '% (everyone)'
       and not exists (select 1 from week_excuses w where w.week_of = cw.week_of and w.user_id = cw.user_id)
     returning cw.user_id, to_char(cw.period_start, 'YYYY-MM-DD') as period_start`,
    [o.week],
  );
  await logAdminAction(q, { by: o.by, action: "excuse_week_undone", detail: { week: o.week, rows: rows.length } });
  await settleAll(q, d, rows);
  return rows.length;
}

async function settleAll(q: Query, d: AdjustDeps, rows: { user_id: string; period_start: string | null }[]): Promise<void> {
  for (const r of rows) {
    if (!r.period_start) continue;
    // One member's failure never stops the others; the hourly pass settles a pending adjustment again.
    try {
      await settlePeriod(q, d, r.user_id, r.period_start);
    } catch (e) {
      console.error("[contribution] excuse", r.user_id, e instanceof Error ? e.message : e);
    }
  }
}

/** What the status strip and the /app banner need about the month so far (spec B.9 notices 2 to 4). */
export type ContributionStatus = {
  /** Forgiven misses used this month (at most `allowed`). */
  used: number;
  /** Weeks missed this month. */
  missed: number;
  allowed: number;
  /** Toronto date of the renewal that ends this month. */
  periodEnd: string;
  /** The week of this Monday was missed. */
  missedThisWeek: boolean;
  /** This month is already billed at the higher rate. */
  alreadyBilled: boolean;
  /** A cancellation is scheduled: the rule no longer applies. */
  cancelling: boolean;
  /** An adjustment still to be invoiced; `current` when it is for this month. */
  adjustment: { invoiceDate: string; amountCents: number; currency: Currency; periodEnd: string; current: boolean; reason: OweReason } | null;
};

export async function contributionStatus(q: Query, userId: string, s: V3Settings, now: Date): Promise<ContributionStatus | null> {
  const [u] = await q<Member>(MEMBER_SQL, [userId]);
  if (!u || u.status !== "active" || u.plan !== "monthly") return null;
  const p = periodAt(u.anchor, now);
  if (!p) return null;
  const rows = await q<{ result: string }>(`select c.result from contribution_weeks c where c.user_id = $1 and c.period_start = $2 and ${SETTLED_SQL("c")}`, [userId, p.startDate]);
  // This month already billed at the higher rate (the first month charged it up front, or its renewal already carried it).
  const billed = (await liveAdjustment(q, userId, p.startDate))?.status === "invoiced";
  const [thisWeek] = await q<{ result: string }>(`select result from contribution_weeks where user_id = $1 and week_of = $2`, [userId, currentMonday(now)]);
  const [adj] = await q<{ invoice_at: string; amount_cents: number; currency: Currency; period_start: string; reason: OweReason }>(
    `select ${ISO("invoice_at")} as invoice_at, amount_cents, currency, reason, to_char(period_start, 'YYYY-MM-DD') as period_start from pending_adjustments
     where user_id = $1 and status = 'pending' and invoice_at > $2 order by invoice_at limit 1`,
    [userId, now.toISOString()],
  );
  const missed = countMisses(rows.map((r) => r.result));
  const adjPeriod = adj && u.anchor ? periodOf(u.anchor, adj.period_start) : null;
  return {
    used: Math.min(missed, s.forgivenMissesPerMonth),
    missed,
    allowed: s.forgivenMissesPerMonth,
    periodEnd: p.endDate,
    missedThisWeek: thisWeek?.result === "missed",
    cancelling: Boolean(u.cancel_requested_at),
    alreadyBilled: billed,
    adjustment: adj
      ? {
          invoiceDate: torontoDate(new Date(adj.invoice_at)),
          amountCents: adj.amount_cents,
          currency: adj.currency,
          periodEnd: adjPeriod?.endDate ?? p.endDate,
          current: adj.period_start === p.startDate,
          reason: adj.reason,
        }
      : null,
  };
}
