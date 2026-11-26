import { heldTeaser } from "@/lib/app/held";
import { PAYMENT_PATH } from "@/lib/app/status";
import { NO_CARD_TRIAL_SQL } from "@/lib/billing/has-card";
import { addDays, currentMonday, cutoffInstant, torontoDate, wallParts, wallToInstant, weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { appUrl, type Rendered } from "@/lib/mail/layout";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { heldReminderEmail } from "@/lib/mail/templates/held-reminder";
import { uploadReminderEmail } from "@/lib/mail/templates/upload-reminder";
import { trialNoCardClosedEmail, trialNoChargeClosedEmail, trialNoListClosedEmail, zackNotYetEmail } from "@/lib/mail/templates/zack-not-yet";
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
 * The second clock (the seams review): a monthly trial past its free lists
 * whose first paid list never comes (no run arrives) would stay a trial for
 * ever, told each Monday that its first charge moved. It closes the same way,
 * `trialCloseDays` after its last list was delivered (or the first go-live,
 * if later), with each Monday Roger failed to give a list moving the close a
 * week, and never while a run, a picked list or a charge is on its way. Not
 * a member mid-switch from one at a time, sponsored, or cancelling.
 */
const WAITING = (free: number) =>
  `u.status = 'trial' and u.plan = 'monthly' and u.switched_from_per_run_at is null and u.sponsor_id is null and u.cancel_requested_at is null
   and u.stripe_subscription is null and u.free_lists_used >= ${Math.max(1, Math.floor(free))}`;
const LAST_LIST = `(select max(p.delivered_at) from picks p where p.user_id = u.id and not p.dry_run and p.delivered_at is not null)`;

export type ClockKind = "no_list" | "no_charge";
export const CLOSED_NO_CHARGE = "no_first_charge";
const CLOCK = (kind: ClockKind, s: Pick<V3Settings, "freeRuns">) =>
  kind === "no_list"
    ? { on: ON_CLOCK, start: "u.trial_started_at", reason: CLOSED_NO_LIST }
    : { on: `${WAITING(s.freeRuns)} and ${LAST_LIST} is not null`, start: LAST_LIST, reason: CLOSED_NO_CHARGE };

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
export async function trialClocks(q: Query, s: V3Settings, now: Date, onlyIds?: string[], kind: ClockKind = "no_list"): Promise<TrialClock[]> {
  const c = CLOCK(kind, s);
  const rows = await q<{ id: string; email: string; started_at: string; start: string; has_run: boolean; roger_weeks: string[] | null; undelivered: string[] | null }>(
    `with live as (
       select coalesce(
         (select (value #>> '{}')::timestamptz from settings where key = '${CYCLE_LIVE_SINCE}'),
         -- Went live before the first go-live was recorded: the setting's own save time.
         (select max(updated_at) from settings where key = 'v3.cycleLive' and value = 'true'::jsonb)) as since
     ),
     t as (
       select u.id, u.email, coalesce(u.trial_started_at, ${c.start}) as trial_started_at, greatest(${c.start}, (select since from live)) as start
       from users u
       where ${c.on} and ($1::uuid[] is null or u.id = any($1::uuid[])) and not ${runWaiting("u.id", "$3")}
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

/**
 * The no-card clocks (plan 2026-11-26-001, Unit 7; origin R11). Sign-up ends
 * without a card, so a trial may wait for one (`trial_started_at` null, no
 * sponsor: `NO_CARD_TRIAL_SQL`). Such a trial is never on the card-saved
 * clocks above (`ON_CLOCK` requires `trial_started_at`); it has its own:
 *
 * - **Teasered** (`first_teaser_at` set): closes `HELD_CLOSE_DAYS` (14) after
 *   the first teaser, closed_reason `no_card`. A later teaser (the held list
 *   replaced) never restarts it: `first_teaser_at` is stamped once.
 * - **Never teasered**: closes `trialCloseDays` (21) after consent (or the
 *   first go-live, if later), closed_reason `no_first_list`, the reason the
 *   card-saved 21-day close uses. Never while a run for the coming Monday
 *   waits on Cora (it may bring the first teaser, and with it the 14-day clock).
 *
 * Both move a week later for each Monday with no list because of Roger, but
 * only **Cora's week failed** or **no eligible plays for the member** (outcome
 * `none`). Not `trialClocks`' "picked but undelivered after its send" rule:
 * every held list is exactly that, so counting it would keep a no-card
 * account open for ever.
 *
 * Saving a card (or a sponsor) takes the account off these clocks at once: no
 * more reminders, nudges or close.
 */
export const HELD_CLOSE_DAYS = 14;
export const HELD_REMINDER_DAYS = [2, 7] as const;
export const HELD_REMINDER_KIND = "held_reminder";
export const CLOSED_NO_CARD = "no_card";

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
};

/** Every no-card, unsponsored trial (or only the named ones), with its start and close. */
export async function noCardClocks(q: Query, s: V3Settings, now: Date, onlyIds?: string[]): Promise<NoCardClock[]> {
  const rows = await q<{ id: string; email: string; consent_at: string; first_teaser_at: string | null; start: string; has_run: boolean; roger_weeks: string[] | null }>(
    `with live as (
       select coalesce(
         (select (value #>> '{}')::timestamptz from settings where key = '${CYCLE_LIVE_SINCE}'),
         (select max(updated_at) from settings where key = 'v3.cycleLive' and value = 'true'::jsonb)) as since
     ),
     t as (
       select u.id, u.email, u.consent_at, u.first_teaser_at,
         coalesce(u.first_teaser_at, greatest(u.consent_at, (select since from live))) as start
       from users u
       where ${NO_CARD_TRIAL_SQL("u")} and u.consent_at is not null and ($1::uuid[] is null or u.id = any($1::uuid[]))
     )
     select t.id, t.email,
       to_char(t.consent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as consent_at,
       to_char(t.first_teaser_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as first_teaser_at,
       to_char(t.start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start,
       exists (select 1 from runs r where r.user_id = t.id and not r.is_test and r.status <> 'deleted') as has_run,
       -- Roger's failures only: Cora's week failed, or no eligible plays for the member. Never a held list.
       (select array_agg(distinct to_char(w, 'YYYY-MM-DD')) from (
          select week_of as w from cora_weeks where status = 'failed' and not dry_run
            and week_of >= (t.start at time zone 'America/Toronto')::date and week_of <= $2::date
          union
          select week_of from cora_user_weeks where user_id = t.id and outcome = 'none' and not dry_run
            and week_of >= (t.start at time zone 'America/Toronto')::date and week_of <= $2::date
        ) x) as roger_weeks
     from t`,
    [onlyIds ?? null, torontoDate(now)],
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
      closesAt: closeMoment(start, firstTeaserAt ? HELD_CLOSE_DAYS : s.trialCloseDays, r.roger_weeks ?? [], s.sendAt),
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
  // Unit 7: the same nudges for a no-card trial that has had no teaser, counted from consent and keyed by it. A
  // teaser (which needs a run) moves the member to the held reminders; a saved card takes them off this clock.
  for (const t of await noCardClocks(q, d.settings, d.now)) {
    if (sent >= MAX_SENDS || outOfTime(d)) break;
    if (t.firstTeaserAt || t.hasRun || d.now >= t.closesAt) continue;
    const day = reached(NUDGE_DAYS, (d.now.getTime() - t.start.getTime()) / DAY_MS);
    if (day == null) continue;
    const r = await sendToUser({ id: t.id, email: t.email }, "zack_not_yet", `${t.consentAt.toISOString()}:${day}`, zackNotYetEmail({ day, closesOn: torontoDate(t.closesAt) }), d).catch(
      () => "failed" as const,
    );
    if (r !== "already") sent++;
  }
  return sent;
}

/** The latest of `days` reached after `elapsed` days, or undefined. */
const reached = (days: readonly number[], elapsed: number) => [...days].reverse().find((n) => elapsed >= n);

/**
 * Unit 7: "Your ideas are waiting" on days 2 and 7 after a no-card trial's
 * first teaser, titles only, with a link to Payment. Once each, keyed by the
 * first teaser and the day (kind `held_reminder`); only the latest day
 * reached is sent, so a late pass never sends two. A failed send is tried on
 * the next pass until the next day. Nothing once the card is saved or the
 * trial has closed.
 */
export async function sendHeldReminders(q: Query, d: TrialDeps): Promise<number> {
  let sent = 0;
  for (const t of await noCardClocks(q, d.settings, d.now)) {
    if (sent >= MAX_SENDS || outOfTime(d)) break;
    if (!t.firstTeaserAt || d.now >= t.closesAt) continue;
    const day = reached(HELD_REMINDER_DAYS, (d.now.getTime() - t.firstTeaserAt.getTime()) / DAY_MS);
    if (day == null) continue;
    const ref = `${t.firstTeaserAt.toISOString()}:${day}`;
    if (await settled(q, t.id, HELD_REMINDER_KIND, ref)) continue;
    const held = await heldTeaser(q, t.id);
    if (!held) continue;
    const message = heldReminderEmail({ week: held.week, titles: held.titles, closesOn: torontoDate(t.closesAt), paymentUrl: appUrl(PAYMENT_PATH) });
    const r = await sendToUser({ id: t.id, email: t.email }, HELD_REMINDER_KIND, ref, message, d).catch(() => "failed" as const);
    if (r !== "already") sent++;
  }
  return sent;
}

/** The email (recipient, kind, ref) was sent or skipped: no need to build it again. */
async function settled(q: Query, userId: string, kind: string, ref: string): Promise<boolean> {
  const rows = await q("select 1 from notifications where recipient = $1 and kind = $2 and ref = $3 and status in ('sent', 'skipped')", [userId, kind, ref]);
  return rows.length > 0;
}

/**
 * Unit 7: the no-card closes. A teasered trial closes at its first teaser +
 * 14 days (`no_card`), a never-teasered one at consent + 21 days
 * (`no_first_list`), each plus a week per Monday Roger failed. One statement
 * per account re-checks, at the moment it writes, that the account is still a
 * no-card, unsponsored trial in the same state (so a card saved, or a first
 * teaser sent, since the clock was read stops it). The closing email goes
 * through the same retried sweep as the card-saved closes.
 */
export async function closeNoCardTrials(q: Query, d: TrialDeps): Promise<number> {
  let closed = 0;
  for (const t of await noCardClocks(q, d.settings, d.now)) {
    if (closed >= MAX_SENDS || outOfTime(d)) break;
    if (d.now < t.closesAt) continue;
    const teasered = t.firstTeaserAt != null;
    const rows = await q(
      `update users u set status = 'closed', closed_reason = $2, hold_reason = null, quote = null, access_ends_at = coalesce(u.access_ends_at, $3::timestamptz)
       where u.id = $1 and ${NO_CARD_TRIAL_SQL("u")} and u.consent_at is not null
         and ${teasered ? "u.first_teaser_at is not null" : `u.first_teaser_at is null and not ${runWaiting("u.id", "$4")}`}
       returning u.id`,
      [t.id, teasered ? CLOSED_NO_CARD : CLOSED_NO_LIST, d.now.toISOString(), ...(teasered ? [] : [comingWeeks(d.now, d.settings)])],
    );
    if (rows.length) closed++;
  }
  await sendClosingEmails(q, d);
  return closed;
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
  for (const kind of ["no_list", "no_charge"] as const) {
    const c = CLOCK(kind, d.settings);
    for (const t of await trialClocks(q, d.settings, d.now, undefined, kind)) {
      if (closed >= MAX_SENDS || outOfTime(d)) break;
      if (d.now < t.closesAt) continue;
      const rows = await q(
        `with c as (
           update users u set status = 'closed', closed_reason = $3, hold_reason = null, quote = null, access_ends_at = coalesce(u.access_ends_at, $2::timestamptz)
           where u.id = $1 and ${c.on} and not ${runWaiting("u.id", "$5")}
             and not exists (select 1 from charge_attempts x where x.user_id = u.id and x.outcome in ('claimed', 'unknown'))
             and not exists (select 1 from picks p where p.user_id = u.id and not p.dry_run and p.delivered_at is null and p.week_of >= $4::date)
           returning u.id
         ),
         o as (update orders set status = 'cancelled', updated_at = now() where user_id in (select id from c) and status = 'ordered')
         select id from c`,
        [t.id, d.now.toISOString(), c.reason, monday, comingWeeks(d.now, d.settings)],
      );
      if (rows.length) closed++;
    }
  }
  await sendClosingEmails(q, d);
  return closed;
}

/** The trial closes' emails, by closed_reason: the ref prefix and the email. */
const CLOSING_EMAILS: Record<string, { prefix: string; email: () => Rendered }> = {
  [CLOSED_NO_LIST]: { prefix: "no_list", email: trialNoListClosedEmail },
  [CLOSED_NO_CHARGE]: { prefix: "no_charge", email: trialNoChargeClosedEmail },
  [CLOSED_NO_CARD]: { prefix: "no_card", email: trialNoCardClosedEmail },
};

/**
 * Every account a trial close ended in the last week whose closing email has
 * not gone yet: decided from stored state (closed, the reason, access_ends_at),
 * so every pass of either close task retries it until one is sent. The key
 * carries the Toronto date, so each day gets fresh attempts beyond the mail
 * layer's three; a sent email with any date ends it.
 */
async function sendClosingEmails(q: Query, d: TrialDeps): Promise<void> {
  const reasons = Object.keys(CLOSING_EMAILS);
  const due = await q<{ id: string; email: string; ended: string; reason: string }>(
    `with r as (select * from unnest($1::text[], $4::text[]) as r(reason, prefix)),
     x as (
       select u.id, u.email, u.closed_reason as reason, r.prefix, to_char(u.access_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ended
       from users u join r on r.reason = u.closed_reason
       where u.status = 'closed' and u.access_ends_at > $2::timestamptz - interval '7 days'
     )
     select x.id, x.email, x.reason, x.ended from x where not exists (
       select 1 from notifications n where n.recipient = x.id::text and n.kind = 'trial_closed' and n.status = 'sent'
         and n.ref like x.prefix || ':' || x.ended || '%')
     limit $3`,
    [reasons, d.now.toISOString(), MAX_SENDS, reasons.map((k) => CLOSING_EMAILS[k].prefix)],
  );
  const today = torontoDate(d.now);
  for (const u of due) {
    if (outOfTime(d)) break;
    const c = CLOSING_EMAILS[u.reason];
    await sendToUser({ id: u.id, email: u.email }, "trial_closed", `${c.prefix}:${u.ended}:${today}`, c.email(), d).catch(() => {});
  }
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
