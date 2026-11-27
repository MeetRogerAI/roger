import { torontoDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, sendToUser, type MailDeps } from "@/lib/mail/send";
import { cancelledEmail, cancelUndoneEmail } from "@/lib/mail/templates/cancelled";
import { planChangedEmail } from "@/lib/mail/templates/plan-changed";
import { longDate } from "@/lib/mail/templates/welcome";
import type { V3Settings } from "@/lib/v3-settings";
import { adjustmentOnCancelScheduled, adjustmentOnCancelUndone, ANCHOR, ISO, placeAdjustments } from "./adjustment";
import { chargeInFlight } from "./claims";
import { settlePeriod } from "./contribution";
import { periodAt } from "./period";
import type { AdjustmentGateway, BillingGateway, PlanGateway, SubscriptionInfo } from "./subscriptions";

/**
 * Cancelling (spec B.9 "Changing and cancelling", plan Unit 15): one click,
 * one optional question, no retention screen.
 *
 * - Nothing subscribed (the trial, a first charge still held, or one list at
 *   a time): the account ends at once (`cancelled`) and open orders are
 *   cancelled. A member never charged has the saved cards removed and is told
 *   "You have not been charged". A list already charged for this week is
 *   still delivered (the deliverable rule allows it).
 * - A monthly subscriber: Stripe ends the subscription when the paid month
 *   ends. Until it actually ends the account stays `active`, with
 *   `cancel_requested_at` set and `access_ends_at` the period end ("cancelling"):
 *   lists continue, Zack runs are taken, and the week's results are still
 *   recorded (Unit 14 treats cancel_requested_at as cancelling). Only when the
 *   subscription ends does the account become `cancelled`. Undo is possible
 *   until then, and re-settles the current month.
 * - A renewal unpaid (confirmed with Stripe): the subscription ends now, the
 *   cards stay (admins decide whether to collect the open invoice).
 *
 * Refused while a charge claim is open ("try again in a few minutes"). The
 * scheduled end is Stripe's to keep, so Stripe is asked first; the webhook
 * re-reads the subscription and writes the same state if our write is lost.
 */
export type PlanDeps = { plans: PlanGateway; gw?: BillingGateway; adjust?: AdjustmentGateway; settings: V3Settings; now: Date } & MailDeps;
/** `busy`: nothing changed for a reason that passes (a charge in flight, Stripe unreachable); try again later. */
export type PlanResult = { ok: true; message: string } | { ok: false; message: string; busy?: boolean };

export const BUSY = "A charge is going through right now. Try again in a few minutes.";
export const UNREACHABLE = "We couldn’t reach our payment provider, so nothing changed. Try again in a minute.";
const LIVE = new Set(["active", "trialing", "past_due", "unpaid"]);

export type PlanUser = {
  id: string;
  email: string;
  status: string;
  plan: "monthly" | "per_run";
  hold_reason: string | null;
  stripe_customer: string | null;
  stripe_subscription: string | null;
  cancel_requested_at: string | null;
  access_ends_at: string | null;
  plan_change_to: "monthly" | "per_run" | null;
  plan_change_at: string | null;
  free_lists_used: number;
  renewal_invoice: string | null;
  switched_from_per_run_at: string | null;
  anchor: string | null;
  renewal_failed_at: string | null;
};

/**
 * Where an unpaid end leaves access (the deliverable rule compares against
 * it): the start of the billing month whose renewal was never paid, found
 * from the first failure of that renewal; never later than now. With no
 * failure on record, now.
 */
export function unpaidStart(anchor: string | null, failedAt: string | null, now: Date): Date {
  const start = failedAt ? periodAt(anchor, new Date(failedAt))?.start : null;
  return start && start < now ? start : now;
}

export async function loadPlanUser(q: Query, userId: string): Promise<PlanUser | null> {
  const [u] = await q<PlanUser>(
    `select id, email, status, plan, hold_reason, stripe_customer, stripe_subscription, ${ISO("cancel_requested_at")} as cancel_requested_at,
            ${ISO("access_ends_at")} as access_ends_at, plan_change_to, ${ISO("plan_change_at")} as plan_change_at, free_lists_used, renewal_invoice,
            ${ISO("switched_from_per_run_at")} as switched_from_per_run_at, ${ISO(ANCHOR("users"))} as anchor, ${ISO("renewal_failed_at")} as renewal_failed_at
     from users where id = $1`,
    [userId],
  );
  return u ?? null;
}

/** A monthly subscriber whose subscription ends with the paid month (a cancellation, not a switch). */
export const isCancelling = (u: Pick<PlanUser, "status" | "cancel_requested_at" | "plan_change_to" | "stripe_subscription">) =>
  u.status === "active" && Boolean(u.cancel_requested_at) && Boolean(u.stripe_subscription) && u.plan_change_to !== "per_run";

export const unixIso = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString() : null);

function cleanReason(r: string | null | undefined): string | null {
  const t = (r ?? "").trim().slice(0, 1000);
  return t || null;
}

export async function cancelPlan(q: Query, d: PlanDeps, o: { userId: string; reason?: string | null }): Promise<PlanResult> {
  const u = await loadPlanUser(q, o.userId);
  if (!u || !["trial", "active", "held"].includes(u.status)) {
    return { ok: false, message: u?.status === "cancelled" ? "Your plan is already cancelled." : "There is no plan to cancel on this account." };
  }
  if (isCancelling(u)) return { ok: false, message: "Your plan is already cancelled." };
  if (await chargeInFlight(q, u.id)) return { ok: false, message: BUSY, busy: true };
  const reason = cleanReason(o.reason);
  if (!u.stripe_subscription) return endNow(q, d, u, reason);
  if (u.status === "held" || u.renewal_invoice) {
    // Stripe says whether the renewal is really unpaid; a stale failure is cleared and the plan ends with its month.
    let open;
    try {
      open = await d.plans.unpaidInvoice(u.stripe_subscription);
    } catch (e) {
      console.error("[billing] cancel lookup", u.id, e instanceof Error ? e.message : e);
      return { ok: false, message: UNREACHABLE, busy: true };
    }
    if (open) return endUnpaid(q, d, u, reason, open.id);
    await q(
      `update users set renewal_failed_at = null, renewal_invoice = null,
         status = case when status = 'held' and hold_reason = 'renewal_unpaid' then 'active' else status end,
         hold_reason = case when status = 'held' and hold_reason = 'renewal_unpaid' then null else hold_reason end
       where id = $1`,
      [u.id],
    );
  }
  return endAtPeriodEnd(q, d, u, reason);
}

/**
 * Nothing is subscribed: the account ends now, in one statement that also
 * re-checks no charge is in flight. Access ends at the moment of cancelling;
 * with no subscription, the deliverable rule covers no later week (a list
 * held for a first charge is never delivered), only a paid order's.
 */
async function endNow(q: Query, d: PlanDeps, u: PlanUser, reason: string | null): Promise<PlanResult> {
  const rows = await q<{ id: string }>(
    `with u as (
       update users set status = 'cancelled', hold_reason = null, cancel_requested_at = $2, access_ends_at = $2, cancel_reason = $3,
         quote = null, plan_change_to = null, plan_change_at = null
       where id = $1 and status in ('trial', 'active', 'held') and stripe_subscription is null
         and not exists (select 1 from charge_attempts c where c.user_id = $1 and c.outcome in ('claimed', 'unknown'))
       returning id
     ),
     o as (update orders set status = 'cancelled', updated_at = now() where user_id in (select id from u) and status = 'ordered')
     select id from u`,
    [u.id, d.now.toISOString(), reason],
  );
  if (!rows.length) return { ok: false, message: BUSY, busy: true };
  await finishCancellation(q, d, u.id);
  return { ok: true, message: "Your account is cancelled, and nothing more will be charged." };
}

/** A monthly subscriber: Stripe ends the subscription with the paid month; the account stays active ("cancelling") until then. */
async function endAtPeriodEnd(q: Query, d: PlanDeps, u: PlanUser, reason: string | null): Promise<PlanResult> {
  // A switch booked (or marked) and not yet made becomes this cancellation: cleared first, so the webhook reads a cancel.
  await q(`update users set plan_change_to = null, plan_change_at = null where id = $1 and cancel_requested_at is null and plan_change_to is not null`, [u.id]);
  let sub: SubscriptionInfo;
  try {
    sub = await d.plans.cancelAtPeriodEnd(u.stripe_subscription!);
  } catch (e) {
    console.error("[billing] cancel", u.id, e instanceof Error ? e.message : e);
    return { ok: false, message: UNREACHABLE, busy: true };
  }
  const ends = unixIso(sub.cancelAt ?? sub.periodEnd) ?? d.now.toISOString();
  await q(
    `update users set cancel_requested_at = coalesce(cancel_requested_at, $3), access_ends_at = $4,
       cancel_reason = coalesce($5, cancel_reason), plan_change_to = null, plan_change_at = null
     where id = $1 and stripe_subscription = $2 and status = 'active'`,
    [u.id, u.stripe_subscription, d.now.toISOString(), ends, reason],
  );
  // The month's difference will never be invoiced (there is no renewal): deleted now, restored on undo.
  await adjustmentOnCancelScheduled(q, d, u.id).catch((e) => console.error("[billing] cancel adjustment", u.id, e instanceof Error ? e.message : e));
  await finishCancellation(q, d, u.id);
  return { ok: true, message: `Cancelled. Your Cora Curations continue until ${longDate(torontoDate(new Date(ends)))}, and nothing more will be charged.` };
}

/** A renewal Stripe confirms is unpaid: the subscription ends now; admins decide about the open invoice, so the cards stay. */
async function endUnpaid(q: Query, d: PlanDeps, u: PlanUser, reason: string | null, invoice: string): Promise<PlanResult> {
  try {
    await d.plans.cancelNow(u.stripe_subscription!);
  } catch (e) {
    console.error("[billing] cancel unpaid", u.id, e instanceof Error ? e.message : e);
    return { ok: false, message: UNREACHABLE, busy: true };
  }
  // Access ends where the unpaid month starts: a list for a week of that month is never delivered.
  await q(
    `update users set status = 'cancelled', hold_reason = null, cancel_requested_at = $3, access_ends_at = $5, cancel_reason = coalesce($4, cancel_reason),
       plan_change_to = null, plan_change_at = null, renewal_failed_at = null, renewal_invoice = null
     where id = $1 and stripe_subscription = $2 and status in ('held', 'active')`,
    [u.id, u.stripe_subscription, d.now.toISOString(), reason, unpaidStart(u.anchor, u.renewal_failed_at, d.now).toISOString()],
  );
  await adjustmentOnCancelScheduled(q, d, u.id).catch((e) => console.error("[billing] cancel adjustment", u.id, e instanceof Error ? e.message : e));
  await alertAdmins(
    "cancel_unpaid_renewal",
    u.id,
    adminAlert("A member cancelled with a renewal unpaid", [`User ${u.id}, subscription ${u.stripe_subscription}, invoice ${invoice}. The subscription is ended; void or collect the open invoice. The saved card was kept.`]),
    d,
  ).catch(() => {});
  await finishCancellation(q, d, u.id);
  return { ok: true, message: "Your account is cancelled, and nothing more will be charged." };
}

type Cancelled = {
  id: string;
  email: string;
  stripe_customer: string | null;
  cards_removed_at: string | null;
  cancel_requested_at: string;
  access_ends_at: string | null;
  at_once: boolean;
  charged: boolean;
};

/** Cancelled, or a subscriber cancelling (not switching): who gets the cancellation email. */
const CANCELLED_SQL = (u: string) =>
  `${u}.cancel_requested_at is not null and (${u}.status = 'cancelled' or (${u}.status = 'active' and ${u}.stripe_subscription is not null and ${u}.plan_change_to is distinct from 'per_run'))`;
/** Ever charged anything (a first charge or an order). */
const CHARGED_SQL = (u: string) => `(${u}.first_charge_at is not null or exists (select 1 from charge_attempts c where c.user_id = ${u}.id and c.outcome = 'succeeded'))`;

/**
 * What follows a cancellation, on every pass until done (the action, then the
 * hourly pass): an account that ended at once and was never charged has its
 * saved cards removed; the confirmation email goes once (keyed by the
 * cancellation's time).
 */
export async function finishCancellation(q: Query, d: PlanDeps, userId: string): Promise<void> {
  const [u] = await q<Cancelled>(
    `select id, email, stripe_customer, cards_removed_at::text, ${ISO("cancel_requested_at")} as cancel_requested_at, ${ISO("access_ends_at")} as access_ends_at,
            (access_ends_at is not null and access_ends_at <= cancel_requested_at + interval '1 minute') as at_once, ${CHARGED_SQL("users")} as charged
     from users where id = $1 and ${CANCELLED_SQL("users")}`,
    [userId],
  );
  if (!u) return;
  if (u.at_once && !u.charged && !u.cards_removed_at && u.stripe_customer) {
    try {
      await d.plans.removeCards(u.stripe_customer);
      await q(`update users set cards_removed_at = $2 where id = $1 and cards_removed_at is null`, [u.id, d.now.toISOString()]);
    } catch (e) {
      // The hourly pass tries again.
      console.error("[billing] remove cards", u.id, e instanceof Error ? e.message : e);
    }
  }
  const message =
    u.at_once || !u.access_ends_at
      ? cancelledEmail({ when: "now", charged: u.charged })
      : cancelledEmail({ when: "period_end", accessEnds: torontoDate(new Date(u.access_ends_at)) });
  await sendToUser({ id: u.id, email: u.email }, "cancelled", u.cancel_requested_at, message, d).catch(() => {});
}

/** Hourly: cancellations from the last week whose cards or email are still to do. */
export async function finishCancellations(q: Query, d: PlanDeps): Promise<number> {
  const rows = await q<{ id: string }>(
    `select u.id from users u
     where ${CANCELLED_SQL("u")} and u.cancel_requested_at > $1::timestamptz - interval '7 days'
       and ((u.cards_removed_at is null and u.stripe_customer is not null and u.access_ends_at <= u.cancel_requested_at + interval '1 minute' and not ${CHARGED_SQL("u")})
            or not exists (select 1 from notifications n where n.recipient = u.id::text and n.kind = 'cancelled' and n.status in ('sent', 'skipped')))`,
    [d.now.toISOString()],
  );
  for (const r of rows) await finishCancellation(q, d, r.id).catch((e) => console.error("[billing] finish cancel", r.id, e instanceof Error ? e.message : e));
  return rows.length;
}

/**
 * Takes back a scheduled end before the paid month is over: a cancellation,
 * or a switch to one list at a time. The same subscription simply continues
 * (no new one, so no second charge). A month's difference the cancellation
 * deleted is raised again, and the current month is settled again from its
 * recorded cutoffs (a week missed or not shared while cancelling counts).
 */
export async function undoCancel(q: Query, d: PlanDeps, o: { userId: string }): Promise<PlanResult> {
  const u = await loadPlanUser(q, o.userId);
  if (!u?.stripe_subscription || !u.cancel_requested_at || u.status !== "active") return { ok: false, message: "There is nothing to undo." };
  const switching = u.plan_change_to === "per_run";
  if (!switching && !(u.access_ends_at && new Date(u.access_ends_at) > d.now)) return { ok: false, message: "Your paid month has ended, so this can’t be undone." };
  if (await chargeInFlight(q, u.id)) return { ok: false, message: BUSY, busy: true };
  let sub: SubscriptionInfo;
  try {
    sub = await d.plans.keepSubscription(u.stripe_subscription);
  } catch (e) {
    console.error("[billing] undo", u.id, e instanceof Error ? e.message : e);
    return { ok: false, message: UNREACHABLE, busy: true };
  }
  if (!LIVE.has(sub.status) || sub.cancelAt) return { ok: false, message: "Your paid month has ended, so this can’t be undone." };
  await q(
    `update users set cancel_requested_at = null, access_ends_at = null, plan_change_to = null, plan_change_at = null
     where id = $1 and stripe_subscription = $2 and status = 'active' and cancel_requested_at is not null`,
    [u.id, u.stripe_subscription],
  );
  // Whether this write or the webhook's re-read of Stripe got there first: everything below is safe to repeat.
  await resettleAfterUndo(q, d, u.id, u.anchor);
  const renews = sub.periodEnd ? torontoDate(new Date(sub.periodEnd * 1000)) : null;
  const message = switching
    ? planChangedEmail({ to: "monthly", effect: renews ? `You stay on monthly. It renews on ${longDate(renews)}, as before.` : "You stay on monthly, as before." })
    : cancelUndoneEmail({ renews });
  await sendToUser({ id: u.id, email: u.email }, switching ? "plan_changed" : "cancel_undone", `undo:${u.cancel_requested_at}`, message, d).catch(() => {});
  return { ok: true, message: switching ? "You stay on monthly." : "Your plan continues as before." };
}

/** After an undo (here or seen in Stripe): deleted differences raised again, and the current month settled from its cutoffs. */
export async function resettleAfterUndo(q: Query, d: Omit<PlanDeps, "plans">, userId: string, anchor: string | null): Promise<void> {
  try {
    await adjustmentOnCancelUndone(q, d, userId);
    const p = periodAt(anchor, d.now);
    if (p) await settlePeriod(q, d, userId, p.startDate);
    await placeAdjustments(q, d);
  } catch (e) {
    // The hourly contributions pass settles the month again.
    console.error("[billing] undo settle", userId, e instanceof Error ? e.message : e);
  }
}
