import { NO_CARD_TRIAL_SQL } from "@/lib/billing/has-card";
import { addWallDays, currentMonday, torontoDate, wallParts, wallToInstant, weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { CYCLE_LIVE_SINCE, type V3Settings } from "@/lib/v3-settings";

/**
 * The trial clocks' shared pieces (housekeeping/trial.ts holds the tasks).
 * Kept apart from the tasks so the Monday send (cora/send-job.ts) can read a
 * no-card clock without importing the card-save code the close uses.
 */

export const DAY_MS = 86_400_000;

/** The first go-live, as a CTE named `live` with one column `since`; read it with LIVE_SINCE. */
export const LIVE_SINCE_CTE = `live as (
  select coalesce(
    (select (value #>> '{}')::timestamptz from settings where key = '${CYCLE_LIVE_SINCE}'),
    -- Went live before the first go-live was recorded: the setting's own save time.
    (select max(updated_at) from settings where key = 'v3.cycleLive' and value = 'true'::jsonb)) as since
)`;
export const LIVE_SINCE = "(select since from live)";

/**
 * The Mondays with no list because of Roger that every trial clock counts,
 * from the clock's start (its Toronto date) to `today` (a date parameter):
 * Cora's week failed (not a dry run), or the member had no eligible plays
 * (outcome `none`). The card-saved clocks add their own "picked but never
 * delivered after its send" weeks on top (trial.ts); the no-card clocks never
 * do, since every held list is exactly that.
 */
export const ROGER_FAILURE_WEEKS_SQL = (user: string, start: string, today: string) => `(select array_agg(distinct to_char(w, 'YYYY-MM-DD')) from (
    select week_of as w from cora_weeks where status = 'failed' and not dry_run
      and week_of >= (${start} at time zone 'America/Toronto')::date and week_of <= ${today}::date
    union
    select week_of from cora_user_weeks where user_id = ${user} and outcome = 'none' and not dry_run
      and week_of >= (${start} at time zone 'America/Toronto')::date and week_of <= ${today}::date
  ) x)`;

/** A run `r` whose week is not finished: Cora's week not yet sent or failed, or no decision for this member yet. */
const UNFINISHED_RUN = `not (exists (select 1 from cora_weeks w where w.week_of = r.week_of and not w.dry_run and w.status in ('sent', 'failed'))
             and exists (select 1 from cora_user_weeks cw where cw.user_id = r.user_id and cw.week_of = r.week_of and not cw.dry_run))`;
const REAL_RUN = (user: string) => `r.user_id = ${user} and not r.is_test and r.status <> 'deleted'`;

/**
 * A real run for one of the coming weeks (`weeks`, a date array) whose week is
 * not finished. Its list may still go out, so a card-saved trial waits.
 */
export const runWaiting = (user: string, weeks: string) => `exists (
  select 1 from runs r where ${REAL_RUN(user)} and r.week_of = any(${weeks}::date[]) and ${UNFINISHED_RUN})`;

/**
 * A real run for this week or any later one (`from`, this Monday) whose week
 * is not finished: the never-teasered no-card close waits for it. Wider than
 * `runWaiting` so a run an admin added for a later week also holds the close
 * (it may bring the first teaser). A run for this week that Cora's finished
 * week never included holds it at most until the next Monday.
 */
export const runWaitingFrom = (user: string, from: string) => `exists (
  select 1 from runs r where ${REAL_RUN(user)} and r.week_of >= ${from}::date and ${UNFINISHED_RUN})`;

/** The Mondays a run arriving now could still be for: the coming one, and on a Monday also today's. */
export function comingWeeks(now: Date, s: Pick<V3Settings, "runCutoff">): string[] {
  const next = weekOf(now, s.runCutoff);
  return wallParts(now).dow === 1 ? [currentMonday(now), next] : [next];
}

/**
 * The close moment: `days` after the start, plus a week for each Monday with
 * no list because of Roger whose send falls before the close as it stands then.
 * `wall`: days are Toronto calendar days at the same wall time (the no-card
 * clocks), so a close never drifts an hour across a clock change; otherwise
 * 24-hour days (the card-saved clocks, unchanged).
 */
export function closeMoment(start: Date, days: number, rogerWeeks: string[], sendAt: string, o: { wall?: boolean } = {}): Date {
  const plus = (t: Date, n: number) => (o.wall ? addWallDays(t, n) : new Date(t.getTime() + n * DAY_MS));
  let close = plus(start, days);
  for (const w of [...new Set(rogerWeeks)].sort()) {
    const sent = wallToInstant(w, sendAt).getTime();
    if (sent >= start.getTime() && sent < close.getTime()) close = plus(close, 7);
  }
  return close;
}

/**
 * The no-card clocks (plan 2026-11-26-001, Unit 7; origin R11). Sign-up ends
 * without a card, so a trial may wait for one (`trial_started_at` null, no
 * sponsor: `NO_CARD_TRIAL_SQL`). Such a trial is never on the card-saved
 * clocks (`ON_CLOCK` requires `trial_started_at`); it has its own:
 *
 * - **Teasered** (`first_teaser_at` set): closes `HELD_CLOSE_DAYS` (14) after
 *   the first teaser, closed_reason `no_card`. A later teaser (the held list
 *   replaced) never restarts it: `first_teaser_at` is stamped once.
 * - **Never teasered**: closes `trialCloseDays` (21) after consent (or the
 *   first go-live, if later), closed_reason `no_first_list`, the reason the
 *   card-saved 21-day close uses. Never while a run for this week or a later
 *   one waits on Cora (it may bring the first teaser, and with it the 14-day
 *   clock).
 *
 * Days are Toronto calendar days at the same wall time (review fixes Unit 7,
 * F2): the close, the reminders and the nudges keep their hour across a clock
 * change.
 *
 * Both move a week later for each Monday with no list because of Roger, but
 * only Cora's week failed or no eligible plays for the member (outcome
 * `none`). Not the card-saved clocks' "picked but undelivered after its send"
 * rule: every held list is exactly that, so counting it would keep a no-card
 * account open for ever.
 *
 * Saving a card (or a sponsor) takes the account off these clocks at once: no
 * more reminders, nudges or close.
 */
export const HELD_CLOSE_DAYS = 14;
export const HELD_REMINDER_DAYS = [2, 7] as const;
export const HELD_REMINDER_KIND = "held_reminder";
export const CLOSED_NO_CARD = "no_card";
export const CLOSED_NO_LIST = "no_first_list";

export type NoCardClock = {
  id: string;
  email: string;
  /** Consent at Step 3: the never-teasered nudges are keyed by it. */
  consentAt: Date;
  /** The first teaser; null while none was sent. The held reminders are keyed by it. */
  firstTeaserAt: Date | null;
  /** When the clock started: the first teaser, or consent (or the first go-live, if later). */
  start: Date;
  closesAt: Date;
  /** Whether Zack has sent a real (not test) run. */
  hasRun: boolean;
  /** A run for this week or a later one is waiting on Cora (holds a never-teasered close). */
  runWaiting: boolean;
  /** Refs of the held reminders already sent or skipped. */
  reminded: string[];
};

/** Every no-card, unsponsored trial (or only the named ones), with its start and close. */
export async function noCardClocks(q: Query, s: V3Settings, now: Date, onlyIds?: string[]): Promise<NoCardClock[]> {
  const rows = await q<{
    id: string;
    email: string;
    consent_at: string;
    first_teaser_at: string | null;
    start: string;
    has_run: boolean;
    run_waiting: boolean;
    roger_weeks: string[] | null;
    reminded: string[] | null;
  }>(
    `with ${LIVE_SINCE_CTE},
     t as (
       select u.id, u.email, u.consent_at, u.first_teaser_at,
         coalesce(u.first_teaser_at, greatest(u.consent_at, ${LIVE_SINCE})) as start
       from users u
       where ${NO_CARD_TRIAL_SQL("u")} and u.consent_at is not null and ($1::uuid[] is null or u.id = any($1::uuid[]))
     )
     select t.id, t.email,
       to_char(t.consent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as consent_at,
       to_char(t.first_teaser_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as first_teaser_at,
       to_char(t.start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start,
       exists (select 1 from runs r where r.user_id = t.id and not r.is_test and r.status <> 'deleted') as has_run,
       ${runWaitingFrom("t.id", "$3")} as run_waiting,
       -- Roger's failures only: never a held list.
       ${ROGER_FAILURE_WEEKS_SQL("t.id", "t.start", "$2")} as roger_weeks,
       (select array_agg(n.ref) from notifications n where n.recipient = t.id::text and n.kind = '${HELD_REMINDER_KIND}' and n.status in ('sent', 'skipped')) as reminded
     from t`,
    [onlyIds ?? null, torontoDate(now), currentMonday(now)],
  );
  return rows.map((r) => {
    const start = new Date(r.start);
    const firstTeaserAt = r.first_teaser_at ? new Date(r.first_teaser_at) : null;
    return {
      id: r.id,
      email: r.email,
      consentAt: new Date(r.consent_at),
      firstTeaserAt,
      start,
      hasRun: r.has_run,
      runWaiting: r.run_waiting,
      reminded: r.reminded ?? [],
      closesAt: closeMoment(start, firstTeaserAt ? HELD_CLOSE_DAYS : s.trialCloseDays, r.roger_weeks ?? [], s.sendAt, { wall: true }),
    };
  });
}

/** The latest of `days` (Toronto calendar days after `start`, same wall time) reached at `now`, or undefined. */
export function wallDayReached(days: readonly number[], start: Date, now: Date): number | undefined {
  return [...days].reverse().find((n) => now.getTime() >= addWallDays(start, n).getTime());
}

/** How long before a teasered no-card close a held teaser is no longer sent (it would arrive with the closing email). */
export const TEASER_QUIET_MS = DAY_MS;

/**
 * Review fixes (Unit 7), F2: an already-teasered no-card member whose close is
 * due within TEASER_QUIET_MS (or past due, not yet run) gets no further teaser.
 */
export async function teaserQuiet(q: Query, s: V3Settings, now: Date, userId: string): Promise<boolean> {
  const [c] = await noCardClocks(q, s, now, [userId]);
  return Boolean(c?.firstTeaserAt) && c.closesAt.getTime() - now.getTime() <= TEASER_QUIET_MS;
}
