import { heldTeaser } from "@/lib/app/held";
import { PAYMENT_PATH } from "@/lib/app/status";
import { completeStoredSession, discardSetupSession } from "@/lib/billing/card-setup";
import type { CardGateway } from "@/lib/billing/gateway";
import { NO_CARD_TRIAL_SQL } from "@/lib/billing/has-card";
import { addDays, currentMonday, cutoffInstant, torontoDate, wallToInstant, weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { appUrl, type Rendered } from "@/lib/mail/layout";
import { MAX_ATTEMPTS, sendToUser, type MailDeps } from "@/lib/mail/send";
import { heldReminderEmail } from "@/lib/mail/templates/held-reminder";
import { uploadReminderEmail } from "@/lib/mail/templates/upload-reminder";
import { trialNoCardClosedEmail, trialNoChargeClosedEmail, trialNoListClosedEmail, zackNotYetEmail } from "@/lib/mail/templates/zack-not-yet";
import type { V3Settings } from "@/lib/v3-settings";
import {
  CLOSED_NO_CARD,
  CLOSED_NO_LIST,
  closeMoment,
  comingWeeks,
  DAY_MS,
  HELD_REMINDER_DAYS,
  HELD_REMINDER_KIND,
  LIVE_SINCE,
  LIVE_SINCE_CTE,
  noCardClocks,
  ROGER_FAILURE_WEEKS_SQL,
  runWaiting,
  runWaitingFrom,
  wallDayReached,
  type NoCardClock,
} from "./clocks";

export { CLOSED_NO_CARD, CLOSED_NO_LIST, closeMoment, comingWeeks, HELD_CLOSE_DAYS, HELD_REMINDER_DAYS, HELD_REMINDER_KIND, noCardClocks, type NoCardClock } from "./clocks";

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

export const NUDGE_DAYS = [3, 10, 17] as const;
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

/** Every trial on the clock (or only the named ones), with its start and close. */
export async function trialClocks(q: Query, s: V3Settings, now: Date, onlyIds?: string[], kind: ClockKind = "no_list"): Promise<TrialClock[]> {
  const c = CLOCK(kind, s);
  const rows = await q<{ id: string; email: string; started_at: string; start: string; has_run: boolean; roger_weeks: string[] | null; undelivered: string[] | null }>(
    `with ${LIVE_SINCE_CTE},
     t as (
       select u.id, u.email, coalesce(u.trial_started_at, ${c.start}) as trial_started_at, greatest(${c.start}, ${LIVE_SINCE}) as start
       from users u
       where ${c.on} and ($1::uuid[] is null or u.id = any($1::uuid[])) and not ${runWaiting("u.id", "$3")}
     )
     select t.id, t.email,
       to_char(t.trial_started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
       to_char(t.start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start,
       exists (select 1 from runs r where r.user_id = t.id and not r.is_test and r.status <> 'deleted') as has_run,
       ${ROGER_FAILURE_WEEKS_SQL("t.id", "t.start", "$2")} as roger_weeks,
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

export type TrialDeps = {
  settings: V3Settings;
  now: Date;
  /** The pass's deadline (epoch ms): stop and leave the rest to the next pass. */
  deadline?: number;
  /**
   * The no-card clocks for this pass (review fixes Unit 7, F3): the hourly
   * pass loads them once and shares them between the nudges, the reminders
   * and the close. Each close re-checks the account at write time, so a
   * clock read a few tasks earlier is safe. Absent: read here.
   */
  noCard?: () => Promise<NoCardClock[]>;
  /**
   * Stripe's card gateway, for the no-card close (review fixes Unit 7, F1): a
   * card confirmed on the stored Payment session is saved instead of the
   * account being closed, and the session is closed after a close. Absent
   * (Stripe not set up): nobody could have confirmed a card.
   */
  card?: CardGateway | null;
} & MailDeps;

const outOfTime = (d: TrialDeps) => d.deadline != null && Date.now() >= d.deadline;
const clocksFor = (q: Query, d: TrialDeps) => (d.noCard ? d.noCard() : noCardClocks(q, d.settings, d.now));

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
  // Unit 7: the same nudges for a no-card trial that has had no teaser, counted from consent (Toronto calendar days)
  // and keyed by it. A teaser (which needs a run) moves the member to the held reminders; a saved card takes them off.
  for (const t of await clocksFor(q, d)) {
    if (sent >= MAX_SENDS || outOfTime(d)) break;
    if (t.firstTeaserAt || t.hasRun || d.now >= t.closesAt) continue;
    const day = wallDayReached(NUDGE_DAYS, t.start, d.now);
    if (day == null) continue;
    const r = await sendToUser({ id: t.id, email: t.email }, "zack_not_yet", `${t.consentAt.toISOString()}:${day}`, zackNotYetEmail({ day, closesOn: torontoDate(t.closesAt) }), d).catch(
      () => "failed" as const,
    );
    if (r !== "already") sent++;
  }
  return sent;
}

/**
 * Unit 7: "Your ideas are waiting" on days 2 and 7 after a no-card trial's
 * first teaser (Toronto calendar days, same wall time), titles only, with a
 * link to Payment. Once each, keyed by the first teaser and the day (kind
 * `held_reminder`); only the latest day reached is sent, so a late pass never
 * sends two. A failed send is tried on the next pass until the next day.
 * Nothing once the card is saved or the trial has closed, and nothing while
 * no list is held. A reminder already sent is known from the clock itself.
 */
export async function sendHeldReminders(q: Query, d: TrialDeps): Promise<number> {
  let sent = 0;
  for (const t of await clocksFor(q, d)) {
    if (sent >= MAX_SENDS || outOfTime(d)) break;
    if (!t.firstTeaserAt || d.now >= t.closesAt) continue;
    const day = wallDayReached(HELD_REMINDER_DAYS, t.firstTeaserAt, d.now);
    if (day == null) continue;
    const ref = `${t.firstTeaserAt.toISOString()}:${day}`;
    if (t.reminded.includes(ref)) continue;
    const held = await heldTeaser(q, t.id);
    if (!held) continue;
    const message = heldReminderEmail({ week: held.week, titles: held.titles, closesOn: torontoDate(t.closesAt), paymentUrl: appUrl(PAYMENT_PATH) });
    const r = await sendToUser({ id: t.id, email: t.email }, HELD_REMINDER_KIND, ref, message, d).catch(() => "failed" as const);
    if (r !== "already") sent++;
  }
  return sent;
}

/**
 * Unit 7: the no-card closes. A teasered trial closes at its first teaser +
 * 14 days (`no_card`), a never-teasered one at consent + 21 days
 * (`no_first_list`), each plus a week per Monday Roger failed. One statement
 * per account re-checks, at the moment it writes, that the account is still a
 * no-card, unsponsored trial in the same state (so a card saved, or a first
 * teaser sent, since the clock was read stops it). The closing email goes
 * through the same retried sweep as the card-saved closes.
 *
 * Review fixes (Unit 7), F1: with Stripe set up (`d.card`), a stored Payment
 * session the member has already confirmed is completed first (the card saved
 * and the list unlocked, Unit 5) and the account is not closed; a Stripe read
 * that fails leaves the close to the next pass. After a close, the stored
 * session is closed in Stripe and cleared (best effort); if the member
 * confirmed it in the meantime, the completion reopens the trial (card-setup.ts).
 */
export async function closeNoCardTrials(q: Query, d: TrialDeps): Promise<number> {
  let closed = 0;
  const mail = { getSettings: async () => d.settings, now: d.now, query: d.query, transport: d.transport, sleep: d.sleep };
  for (const t of await clocksFor(q, d)) {
    if (closed >= MAX_SENDS || outOfTime(d)) break;
    if (d.now < t.closesAt) continue;
    const teasered = t.firstTeaserAt != null;
    if (!teasered && t.runWaiting) continue;
    if (d.card) {
      const saved = await completeStoredSession(q, d.card, t.id, mail).catch((e) => {
        console.error("[trial] stored session before the no-card close", t.id, e instanceof Error ? e.message : e);
        return "error" as const;
      });
      // Saved (or Stripe could not be read: try again next pass, never close over a card that may be there).
      if (saved === "done" || saved === "error") continue;
    }
    const rows = await q(
      `update users u set status = 'closed', closed_reason = $2, hold_reason = null, quote = null, access_ends_at = coalesce(u.access_ends_at, $3::timestamptz)
       where u.id = $1 and ${NO_CARD_TRIAL_SQL("u")} and u.consent_at is not null
         and ${teasered ? "u.first_teaser_at is not null" : `u.first_teaser_at is null and not ${runWaitingFrom("u.id", "$4")}`}
       returning u.id`,
      [t.id, teasered ? CLOSED_NO_CARD : CLOSED_NO_LIST, d.now.toISOString(), ...(teasered ? [] : [currentMonday(d.now)])],
    );
    if (!rows.length) continue;
    closed++;
    if (d.card) await retireStoredSession(q, d.card, t.id, mail);
  }
  await sendClosingEmails(q, d);
  return closed;
}

/**
 * After a no-card close: the stored Payment session is expired in Stripe and
 * cleared, so an open tab cannot confirm a card on a closed account. If the
 * member confirmed it before the expiry landed, the completion runs (and
 * reopens the trial). Best effort: a failure is logged; the webhook still
 * completes a card confirmed later.
 */
async function retireStoredSession(q: Query, card: CardGateway, userId: string, mail: Parameters<typeof completeStoredSession>[3]): Promise<void> {
  try {
    if ((await discardSetupSession(q, card, userId)) === "complete") await completeStoredSession(q, card, userId, mail);
  } catch (e) {
    console.warn("[trial] stored session after the no-card close", userId, e instanceof Error ? e.message : e);
  }
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
 * layer's three; a sent email with any date ends it. Newest closes first, and
 * an email whose attempts for today are used up waits for tomorrow's key, so
 * a few addresses that always fail never starve newer closes (review fixes
 * Unit 7, F4).
 */
async function sendClosingEmails(q: Query, d: TrialDeps): Promise<void> {
  const reasons = Object.keys(CLOSING_EMAILS);
  const today = torontoDate(d.now);
  const due = await q<{ id: string; email: string; ended: string; reason: string }>(
    `with r as (select * from unnest($1::text[], $4::text[]) as r(reason, prefix)),
     x as (
       select u.id, u.email, u.closed_reason as reason, r.prefix, u.access_ends_at, to_char(u.access_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ended
       from users u join r on r.reason = u.closed_reason
       where u.status = 'closed' and u.access_ends_at > $2::timestamptz - interval '7 days'
     )
     select x.id, x.email, x.reason, x.ended from x
     where not exists (
       select 1 from notifications n where n.recipient = x.id::text and n.kind = 'trial_closed' and n.status = 'sent'
         and n.ref like x.prefix || ':' || x.ended || '%')
       and not exists (
       select 1 from notifications n where n.recipient = x.id::text and n.kind = 'trial_closed' and n.attempts >= $6
         and n.ref = x.prefix || ':' || x.ended || ':' || $5)
     order by x.access_ends_at desc, x.id
     limit $3`,
    [reasons, d.now.toISOString(), MAX_SENDS, reasons.map((k) => CLOSING_EMAILS[k].prefix), today, MAX_ATTEMPTS],
  );
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
