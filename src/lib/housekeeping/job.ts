import type { Query } from "@/lib/db-query";
import { wallParts } from "@/lib/clock";
import { retryDeletes, sendItemisedNotices } from "@/lib/billing/adjustment";
import { processContributions } from "@/lib/billing/contribution";
import {
  cursorPending,
  EVENTS_CURSOR,
  finishReconcilePass,
  reconcileEvents,
  reconcilePassUnderway,
  reconcilePendingItems,
  reconcileUsers,
  settleOpenClaims,
  stripeEventSource,
  USERS_CURSOR,
  type EventSource,
} from "@/lib/billing/reconcile";
import type Stripe from "stripe";
import { syncStripeEmails } from "@/lib/auth/email-change";
import { stripe } from "@/lib/billing/stripe";
import { stripeCredits, stripeGateway, type CardGateway, type CreditGateway } from "@/lib/billing/gateway";
import { grantForReferredUser, grantLateReferrals } from "@/lib/referrals/credit";
import type { CreditDeps } from "@/lib/referrals/credit-money";
import { postPendingCredits } from "@/lib/referrals/credit-post";
import { lapseClosedCredits } from "@/lib/referrals/credit-reversal";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { closeFailedWeekOrders, voidLeftoverInvoices } from "@/lib/billing/orders";
import { applyIdleRetention, applyRetention, cleanUpExpired, purgeOldRecords, purgeReferralData } from "./retention";
import { retryPendingReferrals } from "@/lib/referrals/attribution";
import { closeNoCardTrials, closeTrialsWithNoList, sendHeldReminders, sendTrialNudges, sendUploadReminders } from "./trial";
import { noCardClocks, type NoCardClock } from "./clocks";
import { sendUnsentWelcomes } from "@/lib/signup/finish";
import { finishCancellations } from "@/lib/billing/cancel";
import { endDueSubscriptions, holdUnpaidRenewals } from "@/lib/billing/renewals";
import { applyDueSwitches } from "@/lib/billing/switch";
import { sendFirstChargeReminders } from "@/lib/billing/quote";
import { deliverLate, sendUnsentTeasers } from "@/lib/cora/send-job";
import { sendPendingUnlocks } from "@/lib/cora/unlock";
import { closeUnpaidTrials, dueRetries, repairPaidUsers, type ChargeDeps } from "@/lib/billing/first-charge";

/**
 * The hourly pass (plan Unit 12): a list of due tasks that later units add
 * to. Each task is safe to run twice and works only on what is due now. One
 * failing task never stops the others.
 *
 * The pass has one deadline (PASS_SECONDS after it starts, inside the route's
 * 300 seconds): every time-budgeted step stops at it, and a task not started
 * by then is left to the next pass. Cheap database-only tasks run first.
 */
export const PASS_SECONDS = 240;
export type PassContext = {
  /** Epoch ms. */ deadline: number;
  /** The real clock (tests that simulate time pass their own); defaults to now. */ realNow?: Date;
  /** Reads shared by several tasks of one pass (runHourly makes one per pass). */ shared?: Map<string, Promise<unknown>>;
};
/**
 * What the hourly tasks are given: the charge's gateways, plus Stripe's card
 * gateway for the no-card close (review fixes Unit 10, T1). `card` absent:
 * the task asks `stripeGateway()` (null without a key); `null`: Stripe is
 * not set up. The route passes it; scenarios pass their fake Stripe.
 */
export type HourlyDeps = ChargeDeps & { card?: CardGateway | null; credits?: CreditGateway | null };
// The plan tasks (switches, cancellations) are handed no card gateway, as before this seam: only the no-card close reads it.
export type HourlyTask = { name: string; run: (q: Query, d: HourlyDeps, ctx: PassContext) => Promise<unknown> };

/** The card gateway a task uses: the one given, else Stripe's own. */
export const hourlyCard = (d: HourlyDeps): CardGateway | null => (d.card === undefined ? stripeGateway() : d.card);

/** Stripe's customer balance for referral credit (B2 Unit 4), the same way: given, else Stripe's own; null when not set up. */
export const hourlyCredits = (d: HourlyDeps): CreditGateway | null => (d.credits === undefined ? stripeCredits() : d.credits);

/** The credit deps for a task, or null when Stripe is not set up. Never ahead of the real clock. */
function creditDeps(d: HourlyDeps): CreditDeps | null {
  const credits = hourlyCredits(d);
  if (!credits) return null;
  return { credits, settings: d.settings, now: new Date(Math.min(d.now.getTime(), Date.now())), query: d.query, transport: d.transport, sleep: d.sleep };
}

/**
 * The no-card clocks, read once per pass and shared by the nudges, the held
 * reminders and the close (review fixes Unit 7, F3). Each close re-checks the
 * account when it writes, and each email goes through the notifications
 * claim, so a read from earlier in the pass is safe. Without a pass map (a
 * task run on its own) each task reads its own.
 */
function passClocks(q: Query, d: ChargeDeps, c: PassContext): () => Promise<NoCardClock[]> {
  return () => {
    if (!c.shared) return noCardClocks(q, d.settings, d.now);
    let p = c.shared.get("noCardClocks") as Promise<NoCardClock[]> | undefined;
    if (!p) {
      p = noCardClocks(q, d.settings, d.now);
      c.shared.set("noCardClocks", p);
    }
    return p;
  };
}

export const HOURLY_TASKS: HourlyTask[] = [
  // Expired links, sessions, Google sign-in states and rate counters (the database's clock, never "as of").
  { name: "expired_cleanup", run: (q) => cleanUpExpired(q) },
  // Runs and unshared plays, the set number of days after access ends. Never ahead of the real clock.
  { name: "retention", run: (q, d) => applyRetention(q, { now: new Date(Math.min(d.now.getTime(), Date.now())), retentionDays: d.settings.retentionDays }) },
  // Runs of one-at-a-time and held members idle for a year (privacy P3). Never ahead of the real clock.
  { name: "idle_retention", run: (q, d) => applyIdleRetention(q, { now: new Date(Math.min(d.now.getTime(), Date.now())) }) },
  // Old sign-up interest, notification and Stripe event records (privacy P6). Never ahead of the real clock.
  { name: "old_records", run: (q, d) => purgeOldRecords(q, { now: new Date(Math.min(d.now.getTime(), Date.now())) }) },
  // Guests' addresses on invitations never taken up (90 days), and referrals whose account was deleted. Never ahead of the real clock.
  { name: "referral_retention", run: (q, d) => purgeReferralData(q, { now: new Date(Math.min(d.now.getTime(), Date.now())) }) },
  // Referrals whose attribution failed at sign-up (users.pending_referrer_id). Guarded writes: safe to overlap.
  // A referral recorded late may follow its member's first paid invoice: the grant is attempted then too (B2 Unit 4);
  // one that fails is left to referral_late_grants.
  {
    name: "referral_pending",
    run: (q, d) => {
      const cd = d.settings ? creditDeps(d) : null;
      return retryPendingReferrals(q, new Date(Math.min(d.now.getTime(), Date.now())), 200, {
        grant: cd ? (userId) => grantForReferredUser(q, cd, userId) : undefined,
        mail: { query: d.query, transport: d.transport, sleep: d.sleep },
      });
    },
  },
  // B2 Unit 4. Referral credit waiting to post: a grant whose referrer now has a card, or recorded while referrals
  // were switched off, and any clawback or lapse left unposted; then any "you earned a credit" email still unsent.
  { name: "referral_credits", run: async (q, d) => { const cd = creditDeps(d); return cd ? postPendingCredits(q, cd) : "Stripe is not set up."; } },
  // B2 Unit 4. A referral still in trial whose member has paid and has no grant (a late referral, or a grant that
  // failed): granted now, retried hourly up to a cap.
  { name: "referral_late_grants", run: async (q, d) => { const cd = creditDeps(d); return cd ? grantLateReferrals(q, cd) : "Stripe is not set up."; } },
  // B2 Unit 4. A closed account's credit: pending rows lapse, an unused posted balance is taken back (one lapse row per close).
  { name: "referral_credit_lapse", run: async (q, d) => { const cd = creditDeps(d); return cd ? lapseClosedCredits(q, cd) : "Stripe is not set up."; } },
  // Claims left open past 15 minutes: looked up by claim id, then repeated with the same key (the reconcile's first step).
  { name: "charge_takeover", run: (q, d) => settleOpenClaims(q, d) },
  // Retries on days 1, 3 and 7, and amount-changed charges after 24 hours.
  { name: "charge_retries", run: (q, d) => dueRetries(q, d) },
  // After the retries, so a day-7 attempt runs before its trial closes.
  { name: "close_unpaid_trials", run: (q, d) => closeUnpaidTrials(q, d) },
  // Plan 2026-11-26-001, Unit 2. A welcome that failed when sign-up ended (a server action has no retry): the free-tool
  // claim re-run and the welcome sent, for trials with no card that consented since this flow shipped.
  { name: "welcome_unsent", run: (q, d, c) => sendUnsentWelcomes(q, { settings: d.settings, now: d.now, query: d.query ?? q, transport: d.transport, sleep: d.sleep, deadline: c.deadline }) },
  // Unit 18. A trial with no run: "Zack hasn't sent a report yet" on days 3, 10 and 17 (from the card, or for a
  // no-card trial with no teaser yet, from consent: plan 2026-11-26-001, Unit 7).
  { name: "trial_nudges", run: (q, d, c) => sendTrialNudges(q, { ...d, deadline: c.deadline, noCard: passClocks(q, d, c) }) },
  // Day 21 with no first list (weeks with no list because of Roger not counted): closed, no charge, one email.
  { name: "trial_no_list_close", run: (q, d, c) => closeTrialsWithNoList(q, { ...d, deadline: c.deadline }) },
  // Plan 2026-11-26-001, Unit 7. A no-card trial with a held list: "Your ideas are waiting" on days 2 and 7 after the first teaser.
  { name: "held_reminders", run: (q, d, c) => sendHeldReminders(q, { ...d, deadline: c.deadline, noCard: passClocks(q, d, c) }) },
  // Unit 7. No card: closed 14 days after the first teaser, or 21 days after consent with no teaser (failed Cora weeks
  // and no-eligible weeks extend; held lists never do), one closing email. A card confirmed on the stored Payment
  // session is saved instead (review fixes Unit 7, F1), so the close is given the pass's card gateway (Stripe's by default).
  { name: "no_card_close", run: (q, d, c) => closeNoCardTrials(q, { ...d, deadline: c.deadline, noCard: passClocks(q, d, c), card: hourlyCard(d) }) },
  // Sunday 6:00 PM in the member's time zone: upload-route members with no run yet.
  { name: "upload_reminders", run: (q, d, c) => sendUploadReminders(q, { ...d, deadline: c.deadline }) },
  // 48 hours before a first charge: the reminder with the stored date and amount.
  { name: "first_charge_reminders", run: (q, d) => sendFirstChargeReminders(q, d) },
  // Order invoices left open after a failed void.
  { name: "void_leftover_invoices", run: async (q, d) => (d.orders ? voidLeftoverInvoices(q, { ...d, orders: d.orders }) : 0) },
  // Orders for a week Cora failed: closed with no list and no charge, the member told (Unit 17).
  { name: "close_failed_week_orders", run: (q, d) => closeFailedWeekOrders(q, { query: d.query, transport: d.transport, sleep: d.sleep }) },
  // A list whose charge settled after Monday is delivered then.
  { name: "deliver_late", run: (q, d) => deliverLate(q, { settings: d.settings, now: d.now, gw: d.gw, adjust: d.adjust, query: d.query, transport: d.transport, sleep: d.sleep }) },
  // Plan 2026-11-26-001, Unit 3. A held list's titles-only teaser (no card yet) that the Monday send could not send.
  { name: "teaser_unsent", run: (q, d, c) => sendUnsentTeasers(q, { settings: d.settings, now: d.now, query: d.query ?? q, transport: d.transport, sleep: d.sleep, deadline: c.deadline }) },
  // Plan 2026-11-26-001, Unit 5. A card saved after a held list whose unlock did not finish (the list undelivered, or
  // delivered without its email): delivered and emailed now, whatever the list's age (deliver_late stops at 8 days).
  { name: "unlock_pending", run: (q, d, c) => sendPendingUnlocks(q, { settings: d.settings, now: d.now, query: d.query ?? q, transport: d.transport, sleep: d.sleep, deadline: c.deadline }) },
  // The contributor rule: misses settled (forgiven, or the adjustment), then any Stripe items due (a carried one after its renewal).
  { name: "contributions", run: (q, d) => processContributions(q, d) },
  // Stripe deletes of dropped adjustment items that failed, until Stripe confirms them.
  { name: "adjustment_deletes", run: (q, d) => retryDeletes(q, d) },
  // Three days before an invoice carrying an adjustment: the itemised email, from Stripe's preview.
  { name: "invoice_itemised", run: (q, d) => sendItemisedNotices(q, d) },
  // Once a day (4 AM Toronto): pending invoice items with no live adjustment are deleted.
  { name: "reconcile_pending_items", run: async (q, d, c) => (wallParts(d.now).hour === 4 ? reconcilePendingItems(q, d, { deadline: c.deadline }) : "not this hour") },
  // A paid user left held or in trial is made active.
  { name: "repair_paid_users", run: (q, d) => repairPaidUsers(q, d) },
  // Unit 15. A plan switch booked after a Monday cutoff, from the Tuesday.
  { name: "booked_switches", run: async (q, d) => (d.plans ? applyDueSwitches(q, { ...d, card: undefined, plans: d.plans }) : "Stripe is not set up.") },
  // A switch to one at a time whose paid month ended without its webhook.
  { name: "ended_subscriptions", run: async (q, d) => (d.plans ? endDueSubscriptions(q, { ...d, plans: d.plans }) : "Stripe is not set up.") },
  // A renewal still unpaid on day 7: lists are held until it is paid.
  { name: "renewal_holds", run: (q, d) => holdUnpaidRenewals(q, d) },
  // A cancellation whose card removal or confirmation email failed.
  { name: "finish_cancellations", run: async (q, d) => (d.plans ? finishCancellations(q, { ...d, card: undefined, plans: d.plans }) : "Stripe is not set up.") },
  // Fridays' "Want a list this Monday?" to one-at-a-time users is no longer sent (whole-branch review W2): ordering is
  // gone from the app, so the email would point at nothing. The task stays registered, doing nothing; `sendOrderPrompts`
  // is kept, dormant, with the per-run code until its cleanup after launch.
  { name: "order_prompts", run: async () => "Ordering is off: monthly is the only plan." },
  // Stripe customers still holding an address the user has since changed (Unit 16).
  {
    name: "stripe_email_sync",
    run: (q, d) => {
      const s = stripe();
      if (!s) return Promise.resolve({ skipped: "Stripe is not set up." });
      return syncStripeEmails(q, async (customer, email) => void (await s.customers.update(customer, { email })), { query: d.query, transport: d.transport, sleep: d.sleep });
    },
  },
  // Unit 18. A daily pass, started once the last finished over 24 hours ago and carried on hourly until done: Stripe
  // events never handled here, then every account whose state depends on Stripe read back. Each step is time-budgeted,
  // continues from a saved cursor, and one failing never skips the other.
  { name: "reconcile_stripe", run: (q, d, c) => reconcileStripe(q, d, c) },
];

/** Stripe's events and the webhook's handler (tests pass their own). */
export type EventIo = { source: EventSource; handle: (e: Stripe.Event) => Promise<unknown> };

export async function reconcileStripe(q: Query, d: ChargeDeps, c: PassContext, given?: EventIo): Promise<unknown> {
  let io = given;
  if (!io) {
    const s = stripe();
    const card = stripeGateway(s);
    if (!s || !card) return { skipped: "Stripe is not set up." };
    const credits = stripeCredits(s) ?? undefined;
    const mail = { query: d.query, transport: d.transport, sleep: d.sleep };
    io = {
      source: stripeEventSource(s),
      handle: (e) => handleStripeEvent(q, card, e, { getSettings: async () => d.settings, now: d.now, adjust: d.adjust, plans: d.plans, billing: d.gw, orders: d.orders, credits,
        // Credit ledger stamps are never ahead of the real clock, as in the hourly credit tasks (an "as of" pass replays events).
        creditsNow: new Date(Math.min(d.now.getTime(), Date.now())), ...mail }),
    };
  }
  if (!(await reconcilePassUnderway(q, d.now))) return "not due";
  const out: Record<string, unknown> = {};
  try {
    out.events = (await cursorPending(q, EVENTS_CURSOR)) ? await reconcileEvents(q, io.source, io.handle, { now: d.now, deadline: c.deadline }) : "done";
  } catch (e) {
    console.error("[hourly] reconcile events", e instanceof Error ? e.message : e);
    out.events = { error: e instanceof Error ? e.message : String(e) };
  }
  try {
    if (!(await cursorPending(q, USERS_CURSOR))) out.users = "done";
    else if (!d.plans) out.users = "Stripe is not set up.";
    else out.users = await reconcileUsers(q, { ...d, plans: d.plans }, { deadline: c.deadline });
  } catch (e) {
    console.error("[hourly] reconcile users", e instanceof Error ? e.message : e);
    out.users = { error: e instanceof Error ? e.message : String(e) };
  }
  // Never recorded ahead of the real clock: an "as of" pass in the future must not hold off the real daily pass.
  out.finished = await finishReconcilePass(q, d.now, c.realNow);
  return out;
}

export async function runHourly(q: Query, d: HourlyDeps, tasks: HourlyTask[] = HOURLY_TASKS, o: { deadline?: number } = {}): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (!d.settings.cycleLive) return { skipped: "The cycle is not live." };
  const ctx: PassContext = { deadline: o.deadline ?? Date.now() + PASS_SECONDS * 1000, shared: new Map() };
  for (const t of tasks) {
    if (Date.now() >= ctx.deadline) {
      out[t.name] = "out of time: next pass";
      continue;
    }
    try {
      out[t.name] = await t.run(q, d, ctx);
    } catch (e) {
      console.error(`[hourly] ${t.name}`, e instanceof Error ? e.message : e);
      out[t.name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}
