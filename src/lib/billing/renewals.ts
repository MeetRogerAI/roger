import { addDays, torontoDate } from "@/lib/clock";
import { deliverLate } from "@/lib/cora/send-job";
import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, sendToUser, type MailDeps } from "@/lib/mail/send";
import { planChangedEmail } from "@/lib/mail/templates/plan-changed";
import { renewalFailedEmail, renewalHeldEmail, renewalPaidEmail } from "@/lib/mail/templates/renewal";
import type { V3Settings } from "@/lib/v3-settings";
import { adjustmentOnCancelScheduled, adjustmentOnSubscriptionEnded, adjustmentOnSwitchScheduled, adjustmentOnSwitchToPerRun, ANCHOR, ISO } from "./adjustment";
import { finishCancellation, resettleAfterUndo, unixIso } from "./cancel";
import { retryNow } from "./first-charge";
import { amount, money, type Currency } from "./prices";
import { noticeQuoteChange } from "./quote";
import type { AdjustmentGateway, BillingGateway, OrderGateway, PlanGateway } from "./subscriptions";

/**
 * After the first charge, Stripe owns the monthly subscription (spec B.9,
 * plan Unit 15). This module keeps the account in step with it:
 *
 * - A renewal that fails is retried by Stripe. Roger emails each failure
 *   (Stripe's own emails are off). Seven Toronto calendar days after the
 *   first failure, if still unpaid, the account is held with the reason
 *   "renewal unpaid" and lists stop; paying releases it at once. Stripe must
 *   be set to leave the subscription unpaid (not cancel it) when its retries
 *   run out, so there is still an invoice to pay.
 * - A card replaced on /app/billing pays a failed renewal at once, or retries
 *   a held first charge at once.
 * - When the subscription ends (the paid month after a cancel or a switch),
 *   the account becomes cancelled, or one list at a time.
 * - Stripe's subscription is re-read on every change event, so a schedule
 *   made or taken back outside the app (or a write of ours that was lost) is
 *   copied here. A scheduled end is read from the cancel date.
 */
export type RenewalDeps = { plans?: PlanGateway; gw?: BillingGateway; orders?: OrderGateway; adjust?: AdjustmentGateway; settings: V3Settings; now: Date } & MailDeps;

export const HOLD_DAYS = 7;
const LIVE = new Set(["active", "trialing", "past_due", "unpaid"]);

/** The Toronto date a renewal that first failed at `failedAt` is held, if still unpaid. */
export const holdDate = (failedAt: string | Date) => addDays(torontoDate(new Date(failedAt)), HOLD_DAYS);

const quoteDeps = (d: RenewalDeps & { gw: BillingGateway }) => ({ gw: d.gw, settings: d.settings, now: d.now, query: d.query, transport: d.transport, sleep: d.sleep });

/** Stripe could not collect a renewal (invoice.payment_failed): the first failure starts the 7 days; each attempt is emailed. */
export async function renewalFailed(
  q: Query,
  d: RenewalDeps,
  o: { subscription: string; invoice: string; attempt: number; /** When Stripe made the event: a replayed one keeps its own time. */ at?: Date },
): Promise<boolean> {
  // The event is a signal: the invoice is re-read, and a failure already paid, voided or replaced is ignored.
  if (d.plans) {
    const inv = await d.plans.invoice(o.invoice);
    if (!inv || inv.status !== "open") return false;
  }
  const [u] = await q<{ id: string; email: string; failed_at: string }>(
    `update users set renewal_failed_at = least(coalesce(renewal_failed_at, $3::timestamptz), $3::timestamptz), renewal_invoice = $2
     where stripe_subscription = $1 and status in ('active', 'held') and plan = 'monthly'
     returning id, email, ${ISO("renewal_failed_at")} as failed_at`,
    [o.subscription, o.invoice, (o.at ?? d.now).toISOString()],
  );
  if (!u) return false;
  // A replay (the reconcile handles missed events newest first) emails only the newest failed attempt of an invoice.
  const [newer] = await q(
    `select 1 from notifications where recipient = $1 and kind = 'renewal_failed' and ref like $2 || ':%' and split_part(ref, ':', 2) ~ '^[0-9]+$' and split_part(ref, ':', 2)::int > $3`,
    [u.id, o.invoice, o.attempt],
  );
  if (newer) return true;
  await sendToUser({ id: u.id, email: u.email }, "renewal_failed", `${o.invoice}:${o.attempt}`, renewalFailedEmail({ holdOn: holdDate(u.failed_at) }), d).catch(() => {});
  return true;
}

/**
 * Hourly: a renewal still unpaid on the seventh day holds the account. Stripe
 * is asked first, so a payment whose webhook was missed releases instead.
 */
export async function holdUnpaidRenewals(q: Query, d: RenewalDeps): Promise<number> {
  const rows = await q<{ id: string; email: string; sub: string; failed_at: string; invoice: string | null }>(
    `select id, email, stripe_subscription as sub, ${ISO("renewal_failed_at")} as failed_at, renewal_invoice as invoice
     from users where status = 'active' and renewal_failed_at is not null and stripe_subscription is not null`,
  );
  let n = 0;
  for (const r of rows) {
    if (torontoDate(d.now) < holdDate(r.failed_at)) continue;
    if (d.plans) {
      try {
        if (!(await d.plans.unpaidInvoice(r.sub))) {
          await renewalPaid(q, d, { subscription: r.sub });
          continue;
        }
      } catch (e) {
        console.error("[renewal] look up", r.id, e instanceof Error ? e.message : e);
        continue;
      }
    }
    const held = await q(
      `update users set status = 'held', hold_reason = 'renewal_unpaid' where id = $1 and status = 'active' and renewal_failed_at is not null returning id`,
      [r.id],
    );
    if (!held.length) continue;
    n++;
    await sendToUser({ id: r.id, email: r.email }, "renewal_held", r.invoice ?? r.failed_at, renewalHeldEmail(), d).catch(() => {});
  }
  return n;
}

/**
 * The renewal was paid (invoice.paid, a card update, or found paid by the
 * hold pass): the failure is cleared and a held account is released, with
 * any list that waited delivered now.
 */
export async function renewalPaid(q: Query, d: RenewalDeps, o: { subscription: string }): Promise<"released" | "cleared" | "none" | "still_unpaid"> {
  // Another invoice of the subscription may still be open: the hold stays until Stripe has none (a lookup error throws, so the webhook is retried).
  if (d.plans) {
    const open = await d.plans.unpaidInvoice(o.subscription);
    if (open) {
      await q(`update users set renewal_invoice = $2 where stripe_subscription = $1 and renewal_invoice is distinct from $2`, [o.subscription, open.id]);
      return "still_unpaid";
    }
  }
  const rows = await q<{ id: string; email: string; was_held: boolean; invoice: string | null }>(
    `with b as (
       select id, (status = 'held' and hold_reason = 'renewal_unpaid') as was_held, renewal_invoice from users where stripe_subscription = $1 for update
     )
     update users u set renewal_failed_at = null, renewal_invoice = null,
       status = case when b.was_held then 'active' else u.status end,
       hold_reason = case when b.was_held then null else u.hold_reason end
     from b where u.id = b.id and (u.renewal_failed_at is not null or b.was_held)
     returning u.id, u.email, b.was_held, b.renewal_invoice as invoice`,
    [o.subscription],
  );
  const r = rows[0];
  if (!r) return "none";
  if (!r.was_held) return "cleared";
  await sendToUser({ id: r.id, email: r.email }, "renewal_paid", r.invoice ?? d.now.toISOString(), renewalPaidEmail(), d).catch(() => {});
  // The lists that waited (the hourly pass would deliver them too).
  await deliverLate(q, { settings: d.settings, now: d.now, gw: d.gw, adjust: d.adjust, query: d.query, transport: d.transport, sleep: d.sleep }).catch((e) =>
    console.error("[renewal] deliver", r.id, e instanceof Error ? e.message : e),
  );
  return "released";
}

/**
 * The subscription ended. A member switching to one list at a time now
 * orders lists one at a time; anyone else is cancelled (access ends then at
 * the latest). An end nobody asked for in Roger is reported to admins.
 */
export async function subscriptionEnded(q: Query, d: RenewalDeps, o: { subscription: string; endedAt: Date }): Promise<"switched" | "cancelled" | "none"> {
  // A switch (confirmed, or only marked when Stripe's answer was lost): one at a time from now. A hold for an unpaid
  // renewal is lifted with the subscription (nothing more can renew); an invoice still open is left to admins.
  const [sw] = await q<{ id: string; email: string; currency: Currency | null; was_held: boolean; invoice: string | null }>(
    `with b as (
       select id, status = 'held' as was_held, renewal_invoice from users
       where stripe_subscription = $1 and status in ('active', 'held') and plan_change_to = 'per_run' for update
     )
     update users u set plan = 'per_run', status = 'active', stripe_subscription = null, cancel_requested_at = null, access_ends_at = null,
       plan_change_to = null, plan_change_at = null, quote = null, hold_reason = null, renewal_failed_at = null, renewal_invoice = null, plan_switched_at = now()
     from b where u.id = b.id
     returning u.id, u.email, u.currency, b.was_held, b.renewal_invoice as invoice`,
    [o.subscription],
  );
  if (sw) {
    if (sw.was_held || sw.invoice) {
      const open = d.plans ? await d.plans.unpaidInvoice(o.subscription).catch(() => null) : null;
      if (open || !d.plans) {
        await alertAdmins(
          "switch_ended_unpaid",
          o.subscription,
          adminAlert("A switch to one at a time ended with a renewal unpaid", [`User ${sw.id}, subscription ${o.subscription}, invoice ${open?.id ?? sw.invoice ?? "unknown"}. Void or collect it.`]),
          d,
        ).catch(() => {});
      }
    }
    await adjustmentOnSwitchToPerRun(q, d, sw.id).catch((e) => console.error("[renewal] switch adjustment", sw.id, e instanceof Error ? e.message : e));
    const cur = sw.currency ?? "USD";
    await sendToUser(
      { id: sw.id, email: sw.email },
      "plan_changed",
      `per_run_now:${o.subscription}`,
      planChangedEmail({
        to: "per_run",
        effect: `Your paid month has ended. From now on nothing is charged unless you order a list, ${money(amount(d.settings, "per_run", cur), cur)} plus tax each.`,
        monthlyLine: `Monthly is ${money(amount(d.settings, "monthly", cur), cur)} for every Monday.`,
      }),
      d,
    ).catch(() => {});
    return "switched";
  }
  const [ended] = await q<{ id: string; asked: boolean }>(
    `with b as (select id, cancel_requested_at is not null as asked from users where stripe_subscription = $1 and status in ('active', 'held', 'cancelled') for update)
     update users u set status = 'cancelled', hold_reason = null, renewal_failed_at = null, plan_change_to = null, plan_change_at = null,
       cancel_requested_at = coalesce(u.cancel_requested_at, $2), access_ends_at = least(coalesce(u.access_ends_at, $2), $2)
     from b where u.id = b.id
     returning u.id, b.asked`,
    [o.subscription, o.endedAt.toISOString()],
  );
  if (!ended) return "none";
  await adjustmentOnSubscriptionEnded(q, d, ended.id).catch((e) => console.error("[renewal] ended adjustment", ended.id, e instanceof Error ? e.message : e));
  if (!ended.asked) {
    await alertAdmins("subscription_ended_unasked", o.subscription, adminAlert("A subscription ended without a cancellation in Roger", [`User ${ended.id}, subscription ${o.subscription}. The account is now cancelled.`]), d).catch(() => {});
  }
  return "cancelled";
}

/**
 * Re-reads the subscription from Stripe and copies its schedule here
 * (customer.subscription.updated / .deleted). Stripe's state now wins, so the
 * order events arrive in does not matter.
 */
export async function syncSubscription(q: Query, d: RenewalDeps & { plans: PlanGateway }, subscription: string): Promise<string> {
  const sub = await d.plans.getSubscription(subscription);
  if (!sub) return "unknown";
  if (sub.status === "canceled" || sub.endedAt) return subscriptionEnded(q, d, { subscription, endedAt: sub.endedAt ? new Date(sub.endedAt * 1000) : d.now });
  const [u] = await q<{ id: string; status: string; cancel_requested_at: string | null; plan_change_to: string | null; anchor: string | null }>(
    `select id, status, cancel_requested_at::text, plan_change_to, ${ISO(ANCHOR("users"))} as anchor from users where stripe_subscription = $1`,
    [subscription],
  );
  if (!u) return "unknown";
  if (sub.cancelAt) {
    const ends = unixIso(sub.cancelAt)!;
    if (u.status === "active" && !u.cancel_requested_at) {
      const switching = u.plan_change_to === "per_run";
      // Scheduled outside the app, or our own write after Stripe's was lost.
      // Either way the account stays active until the subscription actually ends.
      const rows = await q(
        `update users set cancel_requested_at = $2, access_ends_at = $3, plan_change_at = case when plan_change_to = 'per_run' then $3::timestamptz else plan_change_at end
         where id = $1 and status = 'active' and cancel_requested_at is null returning id`,
        [u.id, d.now.toISOString(), ends],
      );
      if (!rows.length) return "unchanged";
      // An undo may have raced this (the event, or our read, came from before it): read Stripe again, and if the
      // cancellation is gone, take our write back before anything follows from it (Unit 18 review).
      const again = await d.plans.getSubscription(subscription);
      if (again && !again.cancelAt && !again.endedAt && again.status !== "canceled") {
        await q(`update users set cancel_requested_at = null, access_ends_at = null where id = $1 and cancel_requested_at = $2::timestamptz`, [u.id, d.now.toISOString()]);
        return "unchanged";
      }
      await (switching ? adjustmentOnSwitchScheduled : adjustmentOnCancelScheduled)(q, d, u.id).catch((e) => console.error("[renewal] sync adjustment", u.id, e instanceof Error ? e.message : e));
      if (!switching) await finishCancellation(q, { ...d, plans: d.plans }, u.id);
      return switching ? "switching" : "cancelled";
    }
    await q(
      `update users set access_ends_at = $2, plan_change_at = case when plan_change_to = 'per_run' then $2 else plan_change_at end
       where id = $1 and cancel_requested_at is not null and access_ends_at is distinct from $2::timestamptz`,
      [u.id, ends],
    );
    return "scheduled";
  }
  if (u.cancel_requested_at && u.status === "active" && LIVE.has(sub.status)) {
    // Taken back outside the app, or our own write after Stripe's was lost.
    const rows = await q(
      `update users set cancel_requested_at = null, access_ends_at = null, plan_change_to = null, plan_change_at = null
       where id = $1 and stripe_subscription = $2 and cancel_requested_at is not null and status = 'active' returning id`,
      [u.id, subscription],
    );
    if (rows.length) await resettleAfterUndo(q, d, u.id, u.anchor);
    return "undone";
  }
  return "unchanged";
}

/**
 * Hourly backstop: a member cancelling or switching whose paid month is over
 * but whose end event never came is moved to the ended state, once Stripe
 * confirms the subscription has ended.
 */
export async function endDueSubscriptions(q: Query, d: RenewalDeps & { plans: PlanGateway }): Promise<number> {
  const rows = await q<{ id: string; sub: string; ends: string }>(
    `select id, stripe_subscription as sub, ${ISO("access_ends_at")} as ends from users
     where status = 'active' and cancel_requested_at is not null and stripe_subscription is not null and access_ends_at <= $1`,
    [d.now.toISOString()],
  );
  let n = 0;
  for (const r of rows) {
    try {
      const sub = await d.plans.getSubscription(r.sub);
      if (!sub || sub.status === "canceled" || sub.endedAt) {
        if ((await subscriptionEnded(q, d, { subscription: r.sub, endedAt: sub?.endedAt ? new Date(sub.endedAt * 1000) : new Date(r.ends) })) !== "none") n++;
      } else if (d.now.getTime() - Date.parse(r.ends) > 86_400_000) {
        await alertAdmins("subscription_not_ended", r.sub, adminAlert("A subscription is still live after its scheduled end", [`User ${r.id}, subscription ${r.sub}, due to end ${r.ends}.`]), d).catch(() => {});
      }
    } catch (e) {
      console.error("[renewal] end", r.id, e instanceof Error ? e.message : e);
    }
  }
  return n;
}

/**
 * A new card was saved on /app/billing: the coming first charge's amount is
 * re-checked (the address may have changed), a held first charge is retried
 * at once, and a failed renewal is paid at once (spec B.9; plan Unit 12
 * "a card update triggers an immediate attempt").
 */
export async function afterCardChange(q: Query, d: RenewalDeps, userId: string, ref: string): Promise<string> {
  const [u] = await q<{ status: string; hold_reason: string | null; stripe_subscription: string | null; renewal_invoice: string | null }>(
    `select status, hold_reason, stripe_subscription, renewal_invoice from users where id = $1`,
    [userId],
  );
  if (!u) return "none";
  if (d.gw) await noticeQuoteChange(q, quoteDeps({ ...d, gw: d.gw }), userId).catch((e) => console.error("[card] quote", userId, e instanceof Error ? e.message : e));
  // Only an account that can still be charged: never one cancelled meanwhile.
  if (u.status !== "active" && u.status !== "held") return "none";
  if (u.status === "held" && u.hold_reason === "first_charge_failed" && d.gw) {
    return `first_charge:${await retryNow(q, { gw: d.gw, orders: d.orders, adjust: d.adjust, settings: d.settings, now: d.now, query: d.query, transport: d.transport, sleep: d.sleep }, userId)}`;
  }
  if (u.stripe_subscription && d.plans && (u.renewal_invoice || (u.status === "held" && u.hold_reason === "renewal_unpaid"))) {
    // Every open invoice of the subscription, oldest first; the first that fails stops the run.
    for (const inv of await d.plans.openInvoices(u.stripe_subscription)) {
      const r = await d.plans.payInvoice(inv.id, `renewal:${inv.id}:${ref}`);
      if (r.kind !== "succeeded") return `renewal:${r.kind}`;
    }
    return `renewal:${await renewalPaid(q, d, { subscription: u.stripe_subscription })}`;
  }
  return "none";
}
