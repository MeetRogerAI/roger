import { cutoffInstant, wallParts, wallToInstant, weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, sendToUser, type MailDeps } from "@/lib/mail/send";
import { listOrderedEmail, orderFailedEmail, orderNoListEmail } from "@/lib/mail/templates/charges";
import { orderPromptEmail } from "@/lib/mail/templates/order-prompt";
import type { V3Settings } from "@/lib/v3-settings";
import { chargeInFlight, claimCharge, claimedPrice, idempotencyKey, nextAttempt, stillChargeable, type Claim } from "./claims";
import { amount, money, priceId, taxPhrase, type Currency } from "./prices";
import type { ChargeResult, OrderCall, OrderGateway } from "./subscriptions";

/**
 * One list at a time (spec B.9): an order is placed or cancelled until the
 * Sunday cutoff, needs sharing on, and is charged on Monday only if that
 * week's run arrived and picks exist. Otherwise nothing is charged, the user
 * is told why, and the order does not carry over. A declined order is voided
 * and failed, with one email; orders are never retried, and an order claim
 * still open at the end of its Monday is given up.
 */
export type OrderResult = { ok: true } | { ok: false; message: string };

export async function placeOrder(q: Query, o: { userId: string; week: string; now: Date; settings: V3Settings } & MailDeps): Promise<OrderResult> {
  if (o.now >= cutoffInstant(o.week, o.settings.runCutoff)) return { ok: false, message: "Orders for that Monday closed on Sunday night." };
  const [u] = await q<{ email: string; status: string; plan: string; sharing: string; currency: Currency | null; free_lists_used: number; cancel_requested_at: string | null; stripe_subscription: string | null }>(
    `select email, status, plan, sharing, currency, free_lists_used, cancel_requested_at, stripe_subscription from users where id = $1`,
    [o.userId],
  );
  if (!u || !["trial", "active"].includes(u.status) || u.cancel_requested_at) return { ok: false, message: "Lists can’t be ordered on this account." };
  // A monthly month still running covers every Monday in it.
  if (u.plan !== "per_run" || u.stripe_subscription) return { ok: false, message: "Your plan already includes a list every Monday." };
  // Spec check 39: the action refuses this as well as the button.
  if (u.sharing === "off") return { ok: false, message: "Lists can’t be ordered while Zack is off. Turn sharing back on first." };
  if (u.status === "trial" && u.free_lists_used < o.settings.freeRuns) return { ok: false, message: "Your free lists don’t need ordering." };
  const rows = await q(
    `insert into orders (user_id, week_of) values ($1, $2)
     on conflict (user_id, week_of) do update set status = 'ordered', updated_at = now() where orders.status = 'cancelled'
     returning id`,
    [o.userId, o.week],
  );
  if (!rows.length) return { ok: true }; // already ordered
  const cur = u.currency ?? "USD";
  await sendToUser({ id: o.userId, email: u.email }, "list_ordered", o.week, listOrderedEmail({ week: o.week, price: money(amount(o.settings, "per_run", cur), cur) }), o).catch(() => {});
  return { ok: true };
}

export async function cancelOrder(q: Query, o: { userId: string; week: string; now: Date; settings: V3Settings }): Promise<OrderResult> {
  if (o.now >= cutoffInstant(o.week, o.settings.runCutoff)) return { ok: false, message: "That order can no longer be cancelled: Sunday night has passed." };
  if (await chargeInFlight(q, o.userId)) return { ok: false, message: "A charge is going through. Try again in a few minutes." };
  const rows = await q(`update orders set status = 'cancelled', updated_at = now() where user_id = $1 and week_of = $2 and status = 'ordered' returning id`, [o.userId, o.week]);
  return rows.length ? { ok: true } : { ok: false, message: "There is no order for that Monday to cancel." };
}

export type OrderDeps = { orders: OrderGateway; settings: V3Settings; now: Date } & MailDeps;
export type OrderOutcome = "charged" | "declined" | "no_run" | "no_plays" | "unknown" | "error" | "skipped" | "cancelled";

type U = { id: string; email: string; currency: Currency | null; stripe_customer: string | null };

/** The order can still be charged: the same conditions as the claim, checked before any Stripe call. */
async function orderStands(q: Query, userId: string, week: string): Promise<boolean> {
  const [r] = await q<{ ok: boolean }>(
    `select exists (select 1 from users u join orders o on o.user_id = u.id and o.week_of = $2 and o.status = 'ordered'
       where u.id = $1 and u.status in ('active', 'trial') and u.plan = 'per_run' and u.cancel_requested_at is null and u.stripe_subscription is null) as ok`,
    [userId, week],
  );
  return Boolean(r?.ok);
}

/** Monday: every open order for the week, from the charge time on a week Cora finished (the charge job checks both). */
export async function chargeOrders(q: Query, d: OrderDeps, week: string): Promise<Record<OrderOutcome, number>> {
  const tally: Record<OrderOutcome, number> = { charged: 0, declined: 0, no_run: 0, no_plays: 0, unknown: 0, error: 0, skipped: 0, cancelled: 0 };
  const due = await q<U & { run_arrived: boolean; picked: boolean }>(
    `select u.id, u.email, u.currency, u.stripe_customer,
            exists (select 1 from runs r where r.user_id = u.id and r.week_of = $1 and not r.is_test and r.status in ('received', 'accepted', 'flagged')) as run_arrived,
            exists (select 1 from cora_user_weeks cw where cw.user_id = u.id and cw.week_of = $1 and not cw.dry_run and cw.outcome in ('picked', 'short')) as picked
     from orders o join users u on u.id = o.user_id
     where o.week_of = $1 and o.status = 'ordered'
     order by u.id`,
    [week],
  );
  for (const u of due) {
    try {
      tally[await chargeOne(q, d, u, week)]++;
    } catch (e) {
      console.error("[charge] order", u.id, e instanceof Error ? e.message : e);
      tally.unknown++;
    }
  }
  return tally;
}

async function chargeOne(q: Query, d: OrderDeps, u: U & { run_arrived: boolean; picked: boolean }, week: string): Promise<OrderOutcome> {
  if (!(await orderStands(q, u.id, week))) {
    // The account changed since the order (switched, cancelled, subscribed): it is closed out, never charged.
    await q(`update orders set status = 'cancelled', updated_at = now() where user_id = $1 and week_of = $2 and status = 'ordered'`, [u.id, week]);
    return "cancelled";
  }
  if (!u.run_arrived || !u.picked) {
    const reason = !u.run_arrived ? "no_run" : "no_plays";
    const done = await q(`update orders set status = 'no_run', updated_at = now() where user_id = $1 and week_of = $2 and status = 'ordered' returning id`, [u.id, week]);
    if (done.length) await sendToUser({ id: u.id, email: u.email }, "order_no_list", week, orderNoListEmail({ week, reason }), d).catch(() => {});
    return reason;
  }
  if (!u.stripe_customer) return "error";
  const cur = u.currency ?? "USD";
  const price = priceId("per_run", cur);
  if (!price) {
    await alertAdmins("charge_setup", `price:per_run:${cur}`, adminAlert("A Stripe price is missing", [`No price id for one list in ${cur}.`]), d).catch(() => {});
    return "error";
  }
  const attempt = await nextAttempt(q, { userId: u.id, purpose: "order", weekOf: week });
  if (attempt == null) return "skipped";
  const preview = await d.orders.previewOrder({ customer: u.stripe_customer, price });
  const claim = await claimCharge(q, { userId: u.id, purpose: "order", weekOf: week, attempt, price, amountCents: preview.totalCents, currency: preview.currency, now: d.now });
  if (!claim) return "skipped";
  const call: OrderCall = { customer: u.stripe_customer, price, claimId: claim.id, userId: u.id, week, idempotencyKey: idempotencyKey(claim) };
  const made = await d.orders.createOrderInvoice(call);
  if (!made.ok) return applyOrderResult(q, d, u, claim, null, made.result);
  await q(`update charge_attempts set stripe_object = $2 where id = $1`, [claim.id, made.invoice]);
  return applyOrderResult(q, d, u, claim, made.invoice, await d.orders.payOrderInvoice(made.invoice, call));
}

/**
 * The claim's outcome and the order's state in one statement; a paid order
 * also ends a one-at-a-time user's trial. A declined or refused invoice is
 * voided; if the void fails, the hourly sweep voids it.
 */
async function applyOrderResult(q: Query, d: OrderDeps, u: Pick<U, "id" | "email">, claim: Claim, invoice: string | null, r: ChargeResult): Promise<OrderOutcome> {
  if (r.kind === "succeeded") {
    await q(
      `with s as (
         update charge_attempts set outcome = 'succeeded', stripe_object = $2, amount_cents = coalesce($3, amount_cents), currency = coalesce($4, currency), settled_at = now()
         where id = $1 and outcome in ('claimed', 'unknown') returning user_id, week_of
       ),
       o as (
         update orders o set status = 'charged', amount_cents = coalesce($3, o.amount_cents), currency = coalesce($4, o.currency), stripe_invoice = $2, receipt_url = $5, updated_at = now()
         from s where o.user_id = s.user_id and o.week_of = s.week_of and o.status = 'ordered'
       )
       update users set status = 'active', hold_reason = null where id in (select user_id from s) and status = 'trial'`,
      [claim.id, r.object, r.amountCents, r.currency, r.receiptUrl ?? null],
    );
    return "charged";
  }
  if (r.kind === "unknown") {
    await q(`update charge_attempts set outcome = 'unknown', error = $2 where id = $1 and outcome in ('claimed', 'unknown')`, [claim.id, r.error.slice(0, 1000)]);
    return "unknown";
  }
  if (invoice) await d.orders.voidInvoice(invoice).catch((e) => console.error("[charge] void failed; the hourly sweep retries", invoice, e instanceof Error ? e.message : e));
  const declined = r.kind === "declined";
  const [x] = await q<{ settled: boolean }>(
    `with s as (
       update charge_attempts set outcome = $2, decline_code = $3, error = $4, settled_at = now()
       where id = $1 and outcome in ('claimed', 'unknown') returning user_id, week_of
     ),
     o as (update orders o set status = 'failed', updated_at = now() from s where o.user_id = s.user_id and o.week_of = s.week_of and o.status = 'ordered')
     select exists (select 1 from s) as settled`,
    [claim.id, declined ? (r.hard ? "hard_declined" : "declined") : "error", declined ? r.code : null, declined ? null : r.error.slice(0, 1000)],
  );
  if (!x?.settled) return "skipped";
  if (declined) {
    await sendToUser({ id: u.id, email: u.email }, "order_failed", claim.weekOf, orderFailedEmail({ week: claim.weekOf }), d).catch(() => {});
    return "declined";
  }
  await alertAdmins("charge_error", claim.id, adminAlert("An order charge was refused by Stripe", [`User ${u.id}, claim ${claim.id}.`, r.error]), d).catch(() => {});
  return "error";
}

/** The end of an order's Monday: an order claim still open then is given up, never charged late. */
function orderDeadline(week: string): Date {
  return wallToInstant(week, "23:59");
}

/**
 * An order claim left open: the invoice is looked up by claim id and finished
 * from the state it is in, if the order still stands and its Monday is not
 * over; only if there is none is it made again with the same keys.
 */
export async function takeOverOrder(q: Query, d: OrderDeps, claim: Claim): Promise<OrderOutcome> {
  const [u] = await q<U>(`select id, email, currency, stripe_customer from users where id = $1`, [claim.userId]);
  if (!u?.stripe_customer) return "error";
  const found = await d.orders.findOrderInvoice(u.stripe_customer, claim.id);
  if (found?.status === "paid") return applyOrderResult(q, d, u, claim, found.id, { kind: "succeeded", object: found.id, amountCents: found.amountPaid, currency: found.currency });
  if (found && (found.status === "void" || found.status === "uncollectible")) return applyOrderResult(q, d, u, claim, null, { kind: "error", error: `The invoice is ${found.status}.` });
  const giveUp = d.now >= orderDeadline(claim.weekOf) ? "Its Monday is over; an order is never charged late." : !(await stillChargeable(q, claim.id)) ? "The order no longer stands." : null;
  if (giveUp) return applyOrderResult(q, d, u, claim, found?.id ?? null, { kind: "error", error: giveUp });
  const { price } = await claimedPrice(q, claim.id);
  if (!price) return applyOrderResult(q, d, u, claim, found?.id ?? null, { kind: "error", error: "The claim has no recorded price." });
  const call: OrderCall = { customer: u.stripe_customer, price, claimId: claim.id, userId: u.id, week: claim.weekOf, idempotencyKey: idempotencyKey(claim) };
  if (found) return applyOrderResult(q, d, u, claim, found.id, await d.orders.payOrderInvoice(found.id, call));
  const made = await d.orders.createOrderInvoice(call);
  if (!made.ok) return applyOrderResult(q, d, u, claim, null, made.result);
  return applyOrderResult(q, d, u, claim, made.invoice, await d.orders.payOrderInvoice(made.invoice, call));
}

/** The Friday prompt goes from this hour (Toronto) on. */
export const ORDER_PROMPT_HOUR = 10;

/**
 * Spec B.13 email 23, "Want a list this Monday?" (spec B.9): on Fridays, to
 * one-at-a-time users past their free lists with no order for the coming
 * Monday and sharing on (with it off they can't order). Once per user and
 * week; a user who switched it off in settings is skipped (kind order_prompt,
 * preference friday_prompt).
 */
export async function sendOrderPrompts(q: Query, d: { settings: V3Settings; now: Date } & MailDeps): Promise<number> {
  const p = wallParts(d.now);
  if (p.dow !== 5 || p.hour < ORDER_PROMPT_HOUR) return 0;
  const week = weekOf(d.now, d.settings.runCutoff);
  const users = await q<{ id: string; email: string; email_prefs: Record<string, unknown> | null; currency: Currency | null }>(
    `select u.id, u.email, u.email_prefs, u.currency from users u
     where u.plan = 'per_run' and u.stripe_subscription is null and u.cancel_requested_at is null and u.sharing <> 'off' and u.sponsor_id is null
       and (u.status = 'active' or (u.status = 'trial' and u.free_lists_used >= $2))
       and not exists (select 1 from orders o where o.user_id = u.id and o.week_of = $1::date and o.status in ('ordered', 'charged', 'sent'))
       and not exists (select 1 from notifications n where n.recipient = u.id::text and n.kind = 'order_prompt' and n.ref = $3 and n.status in ('sent', 'skipped'))`,
    [week, d.settings.freeRuns, week],
  );
  let n = 0;
  for (const u of users) {
    const cur = u.currency ?? "USD";
    const res = await sendToUser(
      { id: u.id, email: u.email, emailPrefs: u.email_prefs },
      "order_prompt",
      week,
      orderPromptEmail({
        week,
        price: `${money(amount(d.settings, "per_run", cur), cur)} ${taxPhrase(cur)}`,
        monthlyLine: `Monthly is ${money(amount(d.settings, "monthly", cur), cur)} for every Monday.`,
      }),
      d,
    ).catch(() => "failed" as const);
    if (res === "sent") n++;
  }
  return n;
}

/** Hourly: voids any order invoice still open after its claim failed (a void that errored the first time). */
export async function voidLeftoverInvoices(q: Query, d: OrderDeps): Promise<number> {
  const rows = await q<{ stripe_object: string }>(
    `select stripe_object from charge_attempts
     where purpose = 'order' and outcome in ('declined', 'hard_declined', 'error') and stripe_object like 'in_%' and settled_at > now() - interval '3 days'`,
  );
  let n = 0;
  for (const r of rows) {
    try {
      await d.orders.voidInvoice(r.stripe_object);
      n++;
    } catch (e) {
      console.error("[charge] sweep void failed", r.stripe_object, e instanceof Error ? e.message : e);
    }
  }
  return n;
}
