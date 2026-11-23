import { addDays, currentMonday, cutoffInstant, torontoDate, wallParts, wallToInstant, weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { uploadReminderEmail } from "@/lib/mail/templates/upload-reminder";
import { trialNoListClosedEmail, zackNotYetEmail } from "@/lib/mail/templates/zack-not-yet";
import { CYCLE_LIVE_SINCE, type V3Settings } from "@/lib/v3-settings";

/**
 * The trial with no first list (spec B.9, plan Unit 18): nudges on days 3, 10
 * and 17 while Zack has sent nothing, and the close on day 21 with no charge.
 *
 * - The clock starts when the card is saved (`trial_started_at`) or when the
 *   cycle first went live (`v3.cycleLiveSince`, written once), whichever is
 *   later.
 * - A week with no list because of Roger does not count: Cora's week failed,
 *   the member had no eligible plays, or a list was picked and not delivered
 *   after its Monday send. Each such Monday before the close moves the close
 *   a week later.
 * - Only a trial that has had no list at all is on this clock. A member past
 *   a free list, one mid-switch from one at a time (`switched_from_per_run_at`,
 *   a paying member waiting for a first monthly charge), a sponsored member,
 *   or one with a list picked and on its way is not; nor is one whose run for
 *   the coming Monday has arrived while that week is not finished.
 *
 * Each sending task sends at most MAX_SENDS emails a pass, and stops at the
 * pass's deadline; the next pass carries on.
 */

const DAY_MS = 86_400_000;
export const NUDGE_DAYS = [3, 10, 17] as const;
export const CLOSED_NO_LIST = "no_first_list";
export const MAX_SENDS = 50;

export type TrialClock = {
  id: string;
  email: string;
  /** When the card was saved: the nudges are keyed by it, so they never repeat when the clock moves. */
  startedAt: Date;
  /** When the clock started. */
  start: Date;
  /** When the trial closes if no list has gone out. */
  closesAt: Date;
  /** Whether Zack has sent a real (not test) run. */
  hasRun: boolean;
};

/** Who is on the clock: a trial with no list delivered, ever. Shared by the close and its statement. */
const ON_CLOCK = `u.status = 'trial' and u.trial_started_at is not null and u.switched_from_per_run_at is null and u.sponsor_id is null and u.free_lists_used = 0  and not exists (select 1 from picks p where p.user_id = u.id and not p.dry_run and p.delivered_at is not null)`;

/**
 * A real run for one of the coming weeks (`$n`, a date array) whose week is
 * not finished: Cora's week not yet sent or failed, or no decision for this
 * member yet. Its list may still go out, so the trial waits.
 */
const runWaiting = (user: string, weeks: string) => `exists (
  select 1 from runs r where r.user_id = ${user} and not r.is_test and r.status <> 'deleted' and r.week_of = any(${weeks}::date[])
    and not (exists (select 1 from cora_weeks w where w.week_of = r.week_of and not w.dry_run and w.status in ('sent', 'failed'))
             and exists (select 1 from cora_user_weeks cw where cw.user_id = r.user_id and cw.week_of = r.week_of and not cw.dry_run)))`;

/** The Mondays a run arriving now could still be for: the coming one, and on a Monday also today's. */
export function comingWeeks(now: Date, s: Pick<V3Settings, "runCutoff">): string[] {
  const next = weekOf(now, s.runCutoff);
  return wallParts(now).dow === 1 ? [currentMonday(now), next] : [next];
}

/**
 * The close moment: `days` after the start, plus a week for each Monday with
 * no list because of Roger whose send falls before the close as it stands then.
 */
export function closeMoment(start: Date, days: number, rogerWeeks: string[], sendAt: string): Date {
  let close = start.getTime() + days * DAY_MS;
  for (const w of [...new Set(rogerWeeks)].sort()) {
    const sent = wallToInstant(w, sendAt).getTime();
    if (sent >= start.getTime() && sent < close) close += 7 * DAY_MS;
  }
  return new Date(close);
}

/** Every trial on the clock (or only the named ones), with its start and close. */
export async function trialClocks(q: Query, s: V3Settings, now: Date, onlyIds?: string[]): Promise<TrialClock[]> {
  const rows = await q<{ id: string; email: string; started_at: string; start: string; has_run: boolean; roger_weeks: string[] | null; undelivered: string[] | null }>(
    `with live as (
       select coalesce(
         (select (value #>> '{}')::timestamptz from settings where key = '${CYCLE_LIVE_SINCE}'),
         -- Went live before the first go-live was recorded: the setting's own save time.
         (select max(updated_at) from settings where key = 'v3.cycleLive' and value = 'true'::jsonb)) as since
     ),
     t as (
       select u.id, u.email, u.trial_started_at, greatest(u.trial_started_at, (select since from live)) as start
       from users u
       where ${ON_CLOCK} and ($1::uuid[] is null or u.id = any($1::uuid[])) and not ${runWaiting("u.id", "$3")}
     )
     select t.id, t.email,
       to_char(t.trial_started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
       to_char(t.start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start,
       exists (select 1 from runs r where r.user_id = t.id and not r.is_test and r.status <> 'deleted') as has_run,
       (select array_agg(distinct to_char(w, 'YYYY-MM-DD')) from (
          select week_of as w from cora_weeks where status = 'failed' and not dry_run
            and week_of >= (t.start at time zone 'America/Toronto')::date and week_of <= $2::date
          union
          select week_of from cora_user_weeks where user_id = t.id and outcome = 'none' and not dry_run
            and week_of >= (t.start at time zone 'America/Toronto')::date and week_of <= $2::date
        ) x) as roger_weeks,
       -- Picked but never delivered: Roger's failure once that Monday's send has passed (checked below).
       (select array_agg(to_char(week_of, 'YYYY-MM-DD')) from cora_user_weeks
         where user_id = t.id and outcome in ('picked', 'short') and not dry_run and delivered_at is null
           and week_of >= (t.start at time zone 'America/Toronto')::date and week_of <= $2::date) as undelivered
     from t`,
    [onlyIds ?? null, torontoDate(now), comingWeeks(now, s)],
  );
  return rows.map((r) => {
    const start = new Date(r.start);
    const missed = (r.undelivered ?? []).filter((w) => wallToInstant(w, s.sendAt) <= now);
    return {
      id: r.id,
      email: r.email,
      startedAt: new Date(r.started_at),
      start,
      hasRun: r.has_run,
      closesAt: closeMoment(start, s.trialCloseDays, [...(r.roger_weeks ?? []), ...missed], s.sendAt),
    };
  });
}

export type TrialDeps = { settings: V3Settings; now: Date; /** The pass's deadline (epoch ms): stop and leave the rest to the next pass. */ deadline?: number } & MailDeps;

const outOfTime = (d: TrialDeps) => d.deadline != null && Date.now() >= d.deadline;

/**
 * Days 3, 10 and 17 with no run: "Zack hasn't sent a report yet", once each
 * (keyed by the card date and the day, so moving the clock never repeats one).
 * Only the latest day reached is sent, so a pass that comes late never sends
 * two at once. A failed send is tried again on the next pass until the next
 * nudge day.
 */
export async function sendTrialNudges(q: Query, d: TrialDeps): Promise<number> {
  let sent = 0;
  for (const t of await trialClocks(q, d.settings, d.now)) {
    if (sent >= MAX_SENDS || outOfTime(d)) break;
    if (t.hasRun || d.now >= t.closesAt) continue;
    const days = (d.now.getTime() - t.start.getTime()) / DAY_MS;
    const day = [...NUDGE_DAYS].reverse().find((n) => days >= n);
    if (day == null) continue;
    const r = await sendToUser({ id: t.id, email: t.email }, "zack_not_yet", `${t.startedAt.toISOString()}:${day}`, zackNotYetEmail({ day, closesOn: torontoDate(t.closesAt) }), d).catch(
      () => "failed" as const,
    );
    if (r !== "already") sent++;
  }
  return sent;
}

/**
 * Day 21 with no list: the trial closes with no charge and one email. Never
 * while a charge is in flight, a picked list is on its way, or a run for the
 * coming week waits on Cora. Closing sets `access_ends_at` (the retention
 * clock) and cancels any open order.
 *
 * The closing email is tried on every pass for a week after the close until
 * one is sent. Its key carries the Toronto date, so each day gets fresh
 * attempts beyond the mail layer's three.
 */
export async function closeTrialsWithNoList(q: Query, d: TrialDeps): Promise<number> {
  let closed = 0;
  const monday = currentMonday(d.now);
  for (const t of await trialClocks(q, d.settings, d.now)) {
    if (closed >= MAX_SENDS || outOfTime(d)) break;
    if (d.now < t.closesAt) continue;
    const rows = await q(
      `with c as (
         update users u set status = 'closed', closed_reason = $3, hold_reason = null, access_ends_at = coalesce(u.access_ends_at, $2::timestamptz)
         where u.id = $1 and ${ON_CLOCK} and not ${runWaiting("u.id", "$5")}
           and not exists (select 1 from charge_attempts x where x.user_id = u.id and x.outcome in ('claimed', 'unknown'))
           and not exists (select 1 from picks p where p.user_id = u.id and not p.dry_run and p.delivered_at is null and p.week_of >= $4::date)
         returning u.id
       ),
       o as (update orders set status = 'cancelled', updated_at = now() where user_id in (select id from c) and status = 'ordered')
       select id from c`,
      [t.id, d.now.toISOString(), CLOSED_NO_LIST, monday, comingWeeks(d.now, d.settings)],
    );
    if (rows.length) closed++;
  }
  // Every account this close ended in the last week whose email has not gone yet.
  const due = await q<{ id: string; email: string; ended: string }>(
    `with x as (
       select id, email, to_char(access_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ended from users
       where status = 'closed' and closed_reason = $1 and access_ends_at > $2::timestamptz - interval '7 days'
     )
     select * from x where not exists (
       select 1 from notifications n where n.recipient = x.id::text and n.kind = 'trial_closed' and n.status = 'sent' and n.ref like 'no_list:' || x.ended || '%')
     limit $3`,
    [CLOSED_NO_LIST, d.now.toISOString(), MAX_SENDS],
  );
  const today = torontoDate(d.now);
  for (const u of due) {
    if (outOfTime(d)) break;
    await sendToUser({ id: u.id, email: u.email }, "trial_closed", `no_list:${u.ended}:${today}`, trialNoListClosedEmail(), d).catch(() => {});
  }
  return closed;
}

/**
 * Spec B.5: members on the upload route (their last real run was uploaded by
 * hand) get a reminder at 6:00 PM on Sunday in their own time zone when no
 * run has arrived for the coming Monday; where that is after the cutoff, at
 * the last pass before it. Only someone a run is expected from: a live
 * account with Zack on and access past the coming Monday's charge; one at a
 * time only with an order, or while still on free lists. Once per week.
 */
export async function sendUploadReminders(q: Query, d: TrialDeps): Promise<number> {
  const week = weekOf(d.now, d.settings.runCutoff);
  const cutoff = cutoffInstant(week, d.settings.runCutoff);
  if (d.now >= cutoff) return 0;
  const rows = await q<{ id: string; email: string; timezone: string; status: string; plan: string; free_lists_used: number; order_status: string | null }>(
    `select u.id, u.email, u.timezone, u.status, u.plan, u.free_lists_used,
       (select o.status from orders o where o.user_id = u.id and o.week_of = $1) as order_status
     from users u
     where u.status in ('trial', 'active') and u.sharing <> 'off'
       and not (u.cancel_requested_at is not null and u.access_ends_at is not null and u.access_ends_at < $2::timestamptz)
       and (select r.route from runs r where r.user_id = u.id and not r.is_test order by r.received_at desc limit 1) = 'upload'
       and not exists (select 1 from runs r where r.user_id = u.id and r.week_of = $1 and not r.is_test and r.status <> 'deleted')`,
    [week, wallToInstant(week, d.settings.chargeAt).toISOString()],
  );
  // The last hourly pass before the cutoff.
  const lastCall = new Date(cutoff.getTime() - 3_600_000);
  let sent = 0;
  for (const u of rows) {
    if (sent >= MAX_SENDS || outOfTime(d)) break;
    const expected = u.plan !== "per_run" || u.order_status === "ordered" || (u.status === "trial" && u.free_lists_used < d.settings.freeRuns);
    if (!expected) continue;
    let local: Date;
    try {
      local = wallToInstant(addDays(week, -1), "18:00", u.timezone || "America/Toronto");
    } catch {
      local = wallToInstant(addDays(week, -1), "18:00");
    }
    const sendFrom = local < lastCall ? local : lastCall;
    if (d.now < sendFrom) continue;
    const r = await sendToUser({ id: u.id, email: u.email }, "upload_reminder", week, uploadReminderEmail({ week }), d).catch(() => "failed" as const);
    if (r !== "already") sent++;
  }
  return sent;
}
