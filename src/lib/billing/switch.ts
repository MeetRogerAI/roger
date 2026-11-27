import { addDays, cutoffInstant, torontoDate, wallToInstant, weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { sendToUser } from "@/lib/mail/send";
import { bookedSwitchDroppedEmail, planChangedEmail } from "@/lib/mail/templates/plan-changed";
import { longDate } from "@/lib/dates";
import type { V3Settings } from "@/lib/v3-settings";
import { adjustmentOnSwitchScheduled, ANCHOR, carryToFirstCharge, ISO } from "./adjustment";
import { BUSY, isCancelling, loadPlanUser, undoCancel, unixIso, UNREACHABLE, type PlanDeps, type PlanResult, type PlanUser } from "./cancel";
import { chargeInFlight } from "./claims";
import { periodAt } from "./period";
import { amount, money, moneyCents, taxPhrase, type Currency } from "./prices";
import { tellFirstCharge } from "./quote";
import type { SubscriptionInfo } from "./subscriptions";

/**
 * Switching between monthly and one list at a time (spec B.9, plan Unit 15):
 * one click on /app/billing, with the effect shown beside the button before
 * it is pressed, and an email after.
 *
 * - Monthly subscriber to one at a time: Stripe ends the subscription when
 *   the paid month ends (no renewal, no refund); lists continue until then;
 *   then the plan becomes one at a time. Switching back before then is an
 *   undo: the same subscription continues.
 * - Monthly trial (no subscription yet) to one at a time: at once; nothing is
 *   charged automatically after the free lists.
 * - One at a time to monthly: at once; the subscription starts with the next
 *   ready list, charged by the Monday charge job as a first charge (the
 *   account goes back to `trial` until then, so it uses the third-list
 *   machinery: the told quote, the 48-hour reminder, the held list). An order
 *   still open for the coming Monday is cancelled in the same statement, so
 *   that Monday is charged once (spec check 41).
 *
 * Monday uses the plan as it stood at the Sunday cutoff: from the cutoff to
 * the end of that Monday a switch is booked for the Tuesday and applied by
 * the hourly pass. Refused while a charge claim is open.
 */
export type Target = "monthly" | "per_run";

const OPEN_INVOICE = "Pay the open invoice first: update your card and it is charged straight away. Then you can switch.";
const HELD = "Update your card first. Once the payment goes through, you can switch.";
/**
 * A first charge held a day because its amount changed is not switched (the
 * held list and the told amount belong to monthly): the member waits for the
 * charge, or cancels, which charges nothing.
 */
const AMOUNT_CHANGED = "Your first charge is waiting a day because its amount changed. You can switch once it has gone through, or cancel before then and nothing is charged.";
const heldWhy = (u: Pick<PlanUser, "hold_reason">) => (u.hold_reason === "amount_changed" ? AMOUNT_CHANGED : HELD);

/** From a Monday's cutoff to the end of that Monday, a switch waits: the time it may happen, or null when it can happen now. */
export function switchLockedUntil(now: Date, s: V3Settings): Date | null {
  const monday = addDays(weekOf(now, s.runCutoff), -7);
  const end = wallToInstant(addDays(monday, 1), "00:00");
  return now >= cutoffInstant(monday, s.runCutoff) && now < end ? end : null;
}

type OfferUser = PlanUser & { currency: Currency | null; anchor: string | null; ordered_week: string | null };

async function loadOfferUser(q: Query, userId: string, week: string): Promise<OfferUser | null> {
  const u = await loadPlanUser(q, userId);
  if (!u) return null;
  const [x] = await q<{ currency: Currency | null; anchor: string | null; ordered_week: string | null }>(
    `select currency, ${ISO(ANCHOR("users"))} as anchor,
            (select to_char(week_of, 'YYYY-MM-DD') from orders o where o.user_id = users.id and o.week_of = $2 and o.status = 'ordered') as ordered_week
     from users where id = $1`,
    [userId, week],
  );
  return { ...u, ...x };
}

export type SwitchOffer = { to: Target; effect: string; allowed: boolean; why?: string };

/** The effect of a switch, in words, for the page (before the click) and the email (after it). */
export function switchEffect(
  u: Pick<OfferUser, "plan" | "status" | "stripe_subscription" | "free_lists_used" | "currency" | "anchor" | "ordered_week">,
  s: V3Settings,
  now: Date,
  periodEnd?: string | null,
): string {
  const cur = u.currency ?? "USD";
  const tax = taxPhrase(cur);
  const run = `${money(amount(s, "per_run", cur), cur)} ${tax}`;
  const monthly = `${money(amount(s, "monthly", cur), cur)} ${tax}`;
  const lock = switchLockedUntil(now, s);
  const lead = lock ? `Monday’s list stays on your current plan; this applies from ${longDate(torontoDate(lock))}. ` : "";
  if (u.plan === "monthly") {
    if (u.stripe_subscription) {
      // Booked in the lock with the paid month ending before the lock lifts (a renewal on that Sunday night or Monday):
      // the switch is made after the renewal, so Stripe ends the month that renewal starts. Asking Stripe at once instead
      // would end the plan at the renewal and lose Monday's list (access never covers the Monday it ends on).
      const current = periodAt(u.anchor, now);
      const across = !periodEnd && lock && current && current.end <= lock ? periodAt(u.anchor, lock) : null;
      const end = periodEnd ?? (across ?? current)?.endDate ?? null;
      const until = end ? `until ${longDate(end)}` : "until the end of the month you paid for";
      if (across && current) {
        return `${lead}Your monthly plan renews on ${longDate(current.endDate)} as usual, with Monday’s list. It then continues ${until}, with a list every Monday, and is not renewed again. After that nothing is charged unless you order a list, ${run} each.`;
      }
      return `${lead}Your monthly plan continues ${until}, with a list every Monday, and is not renewed. After that nothing is charged unless you order a list, ${run} each.`;
    }
    return `${lead}Nothing is charged automatically after your free lists. You order a list for any Monday you want one, ${run} each.`;
  }
  if (u.free_lists_used < s.freeRuns) return `${lead}Your free lists stay free. After them, monthly starts with your next list: ${monthly}, charged the Monday it is ready, then every month.`;
  const replaced = u.ordered_week && !lock ? ` Your order for ${longDate(u.ordered_week)} is replaced by it, so that Monday is charged once.` : "";
  return `${lead}Monthly starts with your next list: ${monthly}, charged the Monday it is ready, then every month.${replaced}`;
}

/** What the billing page offers: the one switch that applies to this account, with its effect. */
export async function switchOffer(q: Query, s: V3Settings, now: Date, userId: string): Promise<SwitchOffer | null> {
  const u = await loadOfferUser(q, userId, weekOf(now, s.runCutoff));
  if (!u || !["trial", "active", "held"].includes(u.status)) return null;
  // A switch to one at a time already waiting for the month's end: the offer is to stay monthly.
  if (u.plan_change_to === "per_run" && u.cancel_requested_at) return { to: "monthly", effect: "You stay on monthly, and it renews as before.", allowed: true };
  // A switch booked for after Monday: the offer is to keep the plan as it is.
  if (u.plan_change_to && u.plan_change_at) {
    const name = u.plan_change_to === "monthly" ? "monthly" : "one list at a time";
    return { to: u.plan, effect: `Your switch to ${name} is booked for ${longDate(torontoDate(new Date(u.plan_change_at)))}. You can keep your current plan instead.`, allowed: true };
  }
  // Cancelling: undo the cancellation first (the page offers the undo instead).
  if (isCancelling(u)) return null;
  const to: Target = u.plan === "monthly" ? "per_run" : "monthly";
  const effect = switchEffect(u, s, now);
  if (u.status === "held") return { to, effect, allowed: false, why: heldWhy(u) };
  if (to === "per_run" && u.renewal_invoice) return { to, effect, allowed: false, why: OPEN_INVOICE };
  return { to, effect, allowed: true };
}

export async function switchPlan(q: Query, d: PlanDeps, o: { userId: string; to: Target }): Promise<PlanResult> {
  const u = await loadPlanUser(q, o.userId);
  if (!u || !["trial", "active", "held"].includes(u.status)) {
    return { ok: false, message: u?.status === "cancelled" ? "Undo the cancellation first, then switch." : "Switching isn’t available on this account." };
  }
  if (u.status === "held") return { ok: false, message: heldWhy(u) };
  if (isCancelling(u)) return { ok: false, message: "Undo the cancellation first, then switch." };
  if (o.to === "per_run" && u.renewal_invoice) return { ok: false, message: OPEN_INVOICE };
  // Back to monthly while the switch to one at a time waits for the month's end: the same subscription simply continues.
  if (o.to === "monthly" && u.plan_change_to === "per_run" && u.cancel_requested_at) return undoCancel(q, d, { userId: u.id });
  // A switch booked for after Monday, taken back before it happened.
  if (u.plan === o.to && u.plan_change_to && !u.cancel_requested_at) {
    await q(`update users set plan_change_to = null, plan_change_at = null where id = $1 and cancel_requested_at is null`, [u.id]);
    return { ok: true, message: `Your plan stays ${o.to === "monthly" ? "monthly" : "one list at a time"}.` };
  }
  if (u.plan === o.to) return { ok: false, message: "That’s already your plan." };
  if (await chargeInFlight(q, u.id)) return { ok: false, message: BUSY, busy: true };

  const lock = switchLockedUntil(d.now, d.settings);
  if (lock) {
    const booked = await q(
      `update users set plan_change_to = $2, plan_change_at = $3 where id = $1 and status in ('trial', 'active') and plan <> $2 and cancel_requested_at is null returning id`,
      [u.id, o.to, lock.toISOString()],
    );
    if (!booked.length) return { ok: false, message: "That switch isn’t available right now." };
    const offer = await loadOfferUser(q, u.id, weekOf(d.now, d.settings.runCutoff));
    await sendToUser(
      { id: u.id, email: u.email },
      "plan_changed",
      `booked:${o.to}:${d.now.toISOString()}`,
      planChangedEmail({ to: o.to, later: true, effect: switchEffect(offer!, d.settings, d.now) }),
      d,
    ).catch(() => {});
    return { ok: true, message: `Booked. Monday’s list stays on your current plan; the switch happens on ${longDate(torontoDate(lock))}.` };
  }
  return applySwitch(q, d, u.id, o.to);
}

/** Makes a switch happen now (the action, or the hourly pass for one booked after a Monday cutoff). */
export async function applySwitch(q: Query, d: PlanDeps, userId: string, to: Target, o: { bookedAt?: string } = {}): Promise<PlanResult> {
  const week = weekOf(d.now, d.settings.runCutoff);
  const u = await loadOfferUser(q, userId, week);
  if (!u || !["trial", "active"].includes(u.status) || u.cancel_requested_at) return { ok: false, message: "That switch isn’t available on this account." };
  if (u.plan === to) return { ok: false, message: "That’s already your plan." };
  if (to === "per_run" && u.renewal_invoice) return { ok: false, message: OPEN_INVOICE };
  if (await chargeInFlight(q, u.id)) return { ok: false, message: BUSY, busy: true };
  const cur = u.currency ?? "USD";
  const monthlyLine = `Monthly is ${money(amount(d.settings, "monthly", cur), cur)} for every Monday.`;

  if (to === "per_run" && u.stripe_subscription) {
    // Marked first, so the webhook for Stripe's change reads a switch, not a cancellation.
    const marked = await q(
      `update users set plan_change_to = 'per_run', plan_change_at = null where id = $1 and status = 'active' and stripe_subscription = $2 and cancel_requested_at is null returning id`,
      [u.id, u.stripe_subscription],
    );
    if (!marked.length) return { ok: false, message: "That switch isn’t available on this account." };
    let sub: SubscriptionInfo;
    try {
      sub = await d.plans.cancelAtPeriodEnd(u.stripe_subscription);
    } catch (e) {
      console.error("[billing] switch", u.id, e instanceof Error ? e.message : e);
      // The answer may have been lost after Stripe made the change: read it back before giving up.
      let now: SubscriptionInfo | null = null;
      let unknown = false;
      try {
        now = await d.plans.getSubscription(u.stripe_subscription);
      } catch {
        unknown = true;
      }
      if (now?.cancelAt) sub = now;
      else {
        // Unknown (the read-back failed too): plan_change_to stays 'per_run' as an unconfirmed-switch marker, so a later
        // webhook showing the end reads it as a switch. Known not made: a click is undone. Either way a booking keeps its
        // time, so the next hourly pass tries again (repeating the Stripe call is harmless).
        await q(
          `update users set plan_change_to = $2, plan_change_at = $3 where id = $1 and plan_change_at is null and cancel_requested_at is null`,
          [u.id, unknown || o.bookedAt ? "per_run" : null, o.bookedAt ?? null],
        );
        return { ok: false, message: UNREACHABLE, busy: true };
      }
    }
    const ends = unixIso(sub.cancelAt ?? sub.periodEnd) ?? d.now.toISOString();
    await q(
      `update users set cancel_requested_at = coalesce(cancel_requested_at, $3), access_ends_at = $4, plan_change_to = 'per_run', plan_change_at = $4
       where id = $1 and stripe_subscription = $2 and status = 'active'`,
      [u.id, u.stripe_subscription, d.now.toISOString(), ends],
    );
    // No renewal will carry the month's difference: deleted ("switching"), raised again if the switch is taken back,
    // and carried to the first charge if the member comes back to monthly after the switch.
    await adjustmentOnSwitchScheduled(q, d, u.id).catch((e) => console.error("[billing] switch adjustment", u.id, e instanceof Error ? e.message : e));
    const end = torontoDate(new Date(ends));
    await sendToUser(
      { id: u.id, email: u.email },
      "plan_changed",
      `per_run:${d.now.toISOString()}`,
      planChangedEmail({ to, later: true, effect: switchEffect(u, d.settings, d.now, end), monthlyLine }),
      d,
    ).catch(() => {});
    return { ok: true, message: `Switched. Monthly continues until ${longDate(end)}; after that you order lists one at a time.` };
  }

  if (to === "per_run") {
    const done = await q(
      `update users set plan = 'per_run', quote = null, plan_change_to = null, plan_change_at = null, plan_switched_at = now()
       where id = $1 and status = 'trial' and plan = 'monthly' and stripe_subscription is null and cancel_requested_at is null
         and not exists (select 1 from charge_attempts c where c.user_id = $1 and c.outcome in ('claimed', 'unknown'))
       returning id`,
      [u.id],
    );
    if (!done.length) return { ok: false, message: BUSY, busy: true };
    await sendToUser(
      { id: u.id, email: u.email },
      "plan_changed",
      `per_run:${d.now.toISOString()}`,
      planChangedEmail({ to, effect: switchEffect(u, d.settings, d.now), monthlyLine }),
      d,
    ).catch(() => {});
    return { ok: true, message: "Switched. You now order lists one at a time." };
  }

  // One at a time to monthly: back to the first-charge path, and any open order for the coming Monday is cancelled with it.
  const [done] = await q<{ free_lists_used: number }>(
    `with u as (
       update users set plan = 'monthly', status = 'trial', quote = null, plan_change_to = null, plan_change_at = null, plan_switched_at = now(),
         switched_from_per_run_at = case when status = 'active' then $3::timestamptz else null end
       where id = $1 and plan = 'per_run' and status in ('trial', 'active') and stripe_subscription is null and cancel_requested_at is null
         and not exists (select 1 from charge_attempts c where c.user_id = $1 and c.outcome in ('claimed', 'unknown'))
       returning id, free_lists_used
     ),
     o as (update orders set status = 'cancelled', updated_at = now() where user_id in (select id from u) and status = 'ordered' and week_of >= $2)
     select free_lists_used from u`,
    [u.id, week, d.now.toISOString()],
  );
  if (!done) return { ok: false, message: BUSY, busy: true };
  // A month's difference dropped by the switch away is owed with the first charge back (told in the quote below).
  const carried = await carryToFirstCharge(q, u.id, d.now);
  const ref = `monthly:${d.now.toISOString()}`;
  const plain = () => sendToUser({ id: u.id, email: u.email }, "plan_changed", ref, planChangedEmail({ to, effect: switchEffect(u, d.settings, d.now) }), d);
  if (done.free_lists_used >= d.settings.freeRuns && d.gw) {
    // The email states the first charge, and that amount becomes the told one (spec check 21).
    const told = await tellFirstCharge(q, { gw: d.gw, settings: d.settings, now: d.now, query: d.query, transport: d.transport, sleep: d.sleep }, u.id, "plan_changed", ref, (quote) =>
      planChangedEmail({
        to,
        effect: `Monthly starts with your next list. That Monday, no earlier than ${longDate(quote.week)}, we’ll charge ${moneyCents(quote.totalCents, quote.currency)}, tax included, for your first month${carried ? `, with the higher-rate difference of ${moneyCents(carried, quote.currency)} still owed for the month you switched away from` : ""}, then the monthly price every month.`,
      }),
    ).catch((e) => {
      console.error("[billing] switch quote", u.id, e instanceof Error ? e.message : e);
      return null;
    });
    if (told == null) await plain().catch(() => {});
  } else {
    await plain().catch(() => {});
  }
  return { ok: true, message: "Switched. Monthly starts with your next list." };
}

/** Hourly: switches booked after a Monday cutoff whose time has come. A busy account waits for the next pass. */
export async function applyDueSwitches(q: Query, d: PlanDeps): Promise<number> {
  const due = await q<{ id: string; email: string; plan_change_to: Target; booked_at: string }>(
    `select id, email, plan_change_to, ${ISO("plan_change_at")} as booked_at from users
     where plan_change_to is not null and plan_change_at <= $1 and cancel_requested_at is null and status in ('trial', 'active', 'held')`,
    [d.now.toISOString()],
  );
  let n = 0;
  for (const r of due) {
    let res: PlanResult;
    try {
      res = await applySwitch(q, d, r.id, r.plan_change_to, { bookedAt: r.booked_at });
    } catch (e) {
      console.error("[billing] booked switch", r.id, e instanceof Error ? e.message : e);
      continue;
    }
    if (res.ok) n++;
    if (!res.ok && res.busy) continue;
    // Done, or no longer possible (held, cancelled, already that plan): the booking is cleared. A switch now waiting for the month's end keeps its own.
    const dropped = await q(
      `update users set plan_change_to = null, plan_change_at = null where id = $1 and plan_change_at <= $2 and cancel_requested_at is null returning id`,
      [r.id, d.now.toISOString()],
    );
    // A booking given up for good is told to the member.
    if (!res.ok && dropped.length) {
      await sendToUser({ id: r.id, email: r.email }, "plan_changed", `dropped:${r.booked_at}`, bookedSwitchDroppedEmail({ to: r.plan_change_to, why: res.message }), d).catch(() => {});
    }
  }
  return n;
}
