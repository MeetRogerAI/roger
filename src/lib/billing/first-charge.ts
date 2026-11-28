import { addDays, cutoffInstant } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, sendToUser, type MailDeps } from "@/lib/mail/send";
import { amountChangedEmail, chargeFailedEmail, subscribedEmail, trialClosedEmail } from "@/lib/mail/templates/charges";
import { backToPerRunEmail } from "@/lib/mail/templates/plan-changed";
import { longDate } from "@/lib/dates";
import type { V3Settings } from "@/lib/v3-settings";
import { carriedDifferenceCents, clearCarried } from "./adjustment";
import { claimCharge, claimedPrice, closeTrialAt, idempotencyKey, nextAttempt, nextRetryAt, settle, stillChargeable, type Claim } from "./claims";
import { firstChargePricing, type Currency } from "./prices";
import { isCouponGone } from "./gateway";
import { isLive, type AdjustmentGateway, type BillingGateway, type ChargeResult, type FirstExtra, type OrderGateway, type PlanGateway } from "./subscriptions";

/**
 * The first monthly charge, with the third list (spec B.9, plan Unit 12):
 * price from the user's choices at the Sunday cutoff, check the amount against
 * the stored quote (before anything is claimed), claim, create the
 * subscription off-session, and act on the outcome in the same statement that
 * records it. Declines hold the user and retry on days 1, 3 and 7; a refusal
 * a retry cannot fix holds the user for an admin; day 7 with nothing charged
 * closes the trial.
 */
export type ChargeDeps = { gw: BillingGateway; orders?: OrderGateway; adjust?: AdjustmentGateway; plans?: PlanGateway; settings: V3Settings; now: Date } & MailDeps;
export type FirstOutcome = "charged" | "declined" | "held_amount" | "unknown" | "error" | "skipped" | "open";

type Quote = { totalCents?: number; currency?: string; price?: string; extraCents?: number; at?: string; week?: string; coupon?: string | null; discountCents?: number; taxCents?: number };
type U = {
  id: string;
  email: string;
  currency: Currency | null;
  status: string;
  hold_reason: string | null;
  stripe_customer: string | null;
  quote: Quote | null;
  free_lists_used: number;
  promo_coupon: string | null;
  promo_label: string | null;
  promo_ended_label: string | null;
};

async function loadUser(q: Query, userId: string): Promise<U | null> {
  const [u] = await q<U>(
    `select id, email, currency, status, hold_reason, stripe_customer, quote, free_lists_used, promo_coupon, promo_label, promo_ended_label from users where id = $1`,
    [userId],
  );
  return u ?? null;
}

/**
 * A list delivered free to this member for this week (`picks.is_free_list`,
 * not a dry run): that week is never their first paid one. The charge job
 * re-runs every 10 minutes after the 7:00 send, which delivers the second free
 * list (plan 2026-11-26-001, "Pre-existing charge gap").
 */
export const FREE_LIST_WEEK_SQL = (user: string, week: string) =>
  `select 1 from picks fl where fl.user_id = ${user} and fl.week_of = ${week}::date and not fl.dry_run and fl.is_free_list`;

/** A first charge claim still open (claimed or unknown) for this member. */
const OPEN_FIRST_CLAIM_SQL = (user: string) =>
  `exists (select 1 from charge_attempts x where x.user_id = ${user} and x.purpose = 'first_charge' and x.outcome in ('claimed', 'unknown'))`;

/**
 * Drops a locked-in coupon Stripe no longer applies (deleted, past its
 * `redeem_by`, or an amount-off coupon without the member's currency): the
 * member is then quoted and charged the full price, told first through the
 * amount-changed hold (plan R17). Only if it is still the coupon that was
 * tried, and never while a first charge claim is open (that claim's own end
 * settles its coupon, and a takeover repeats the claimed coupon anyway). The
 * dropped discount's name stays in `promo_ended_label` until the hold (or the
 * charge) uses it, so a pass that fails after the drop still lets the next
 * pass's email say the discount ended.
 */
async function dropCoupon(q: Query, userId: string, coupon: string): Promise<string | null> {
  const [r] = await q<{ label: string | null }>(
    `update users u set promo_coupon = null, promo_label = null, promo_duration = null, promo_duration_months = null,
       promo_ended_label = coalesce(o.promo_label, o.promo_coupon)
     from users o
     where u.id = o.id and u.id = $1 and u.promo_coupon = $2 and not ${OPEN_FIRST_CLAIM_SQL("u.id")}
     returning o.promo_label as label`,
    [userId, coupon],
  );
  console.warn("[charge] locked-in coupon no longer applies; dropped", { userId, coupon });
  return r?.label ?? null;
}

export type FirstPreview = { totalCents: number; currency: string; discountCents?: number; taxCents?: number | null };

/**
 * Stripe's preview of the first invoice with the member's locked-in coupon,
 * shared by the quote and the charge so the told amount and the charge are
 * priced alike. A coupon Stripe no longer applies is dropped from the member
 * and the preview made again without it; `ended` names the dropped discount.
 */
export async function previewFirst(
  q: Query,
  gw: BillingGateway,
  u: Pick<U, "id" | "promo_coupon"> & { stripe_customer: string },
  price: string,
  extra: FirstExtra,
): Promise<{ preview: FirstPreview; coupon: string | null; ended: string | null }> {
  const coupon = u.promo_coupon ?? null;
  try {
    return { preview: await gw.preview({ customer: u.stripe_customer, price, extra, coupon }), coupon, ended: null };
  } catch (e) {
    if (!coupon || !isCouponGone(e)) throw e;
    const label = await dropCoupon(q, u.id, coupon);
    return { preview: await gw.preview({ customer: u.stripe_customer, price, extra, coupon: null }), coupon: null, ended: label ?? coupon };
  }
}

/**
 * The user's sharing as it stood at the week's Sunday cutoff (plan: "Monday
 * uses the user's choices as they stood at the cutoff"), from the history of
 * changes. Users start sharing, so no change before the cutoff means "share"
 * unless nothing has changed at all.
 */
export async function sharingAtCutoff(q: Query, userId: string, week: string, s: V3Settings): Promise<string> {
  const [r] = await q<{ before: string | null; after_any: boolean; now: string }>(
    `select (select sharing from zack_settings_history where user_id = $1 and changed_at < $2 order by changed_at desc limit 1) as before,
            exists (select 1 from zack_settings_history where user_id = $1 and changed_at >= $2) as after_any,
            (select sharing from users where id = $1) as now`,
    [userId, cutoffInstant(week, s.runCutoff).toISOString()],
  );
  if (!r) return "share";
  return r.before ?? (r.after_any ? "share" : r.now);
}

async function alert(kind: string, ref: string, subject: string, lines: string[], d: MailDeps) {
  await alertAdmins(kind, ref, adminAlert(subject, lines), d).catch(() => {});
}

const extraOf = (cents: number, currency: string): FirstExtra => (cents > 0 ? { amountCents: cents, currency } : null);

export async function chargeFirst(q: Query, d: ChargeDeps, userId: string, week: string, o: { reset?: boolean } = {}): Promise<FirstOutcome> {
  const u = await loadUser(q, userId);
  if (!u) return "skipped";
  // A trial member who still has a free list (an admin gave one back after the job listed them) is not charged.
  if (u.status === "trial" && u.free_lists_used < d.settings.freeRuns) return "skipped";
  // This week's delivered list was itself a free list (the second, delivered at 7:00): the charge comes with the next one.
  const [free] = await q(FREE_LIST_WEEK_SQL("$1", "$2"), [userId, week]);
  if (free) return "skipped";
  if (!u.stripe_customer) {
    await alert("charge_setup", `${userId}:${week}`, "A first charge has no Stripe customer", [`User ${userId}, week ${week}.`], d);
    return "error";
  }
  const currency = u.currency ?? "USD";
  // The standard price; not sharing at the cutoff adds the month's difference to the first invoice (the contributor rule).
  const { price, extraCents } = await firstChargePricing(d.settings, currency, await sharingAtCutoff(q, userId, week, d.settings), d.gw, await carriedDifferenceCents(q, userId));
  const extra = extraOf(extraCents, currency);
  if (!price) {
    await alert("charge_setup", `price:${currency}`, "A Stripe price is missing", [`No price id for monthly ${currency}. Set the STRIPE_PRICE_* variables.`], d);
    return "error";
  }
  const attempt = await nextAttempt(q, { userId, purpose: "first_charge", weekOf: week, reset: o.reset });
  if (attempt == null) return "open";

  // The amount must be the one the user was told (spec check 21), checked before anything is claimed. The told
  // quote and this preview carry the same locked-in coupon; one Stripe no longer applies is dropped here. A quote
  // told before Unit 8 has no `coupon` field: its coupon is not compared (it was told with none, and its amount is).
  const { preview, coupon, ended } = await previewFirst(q, d.gw, { ...u, stripe_customer: u.stripe_customer }, price, extra);
  const fresh = quoteOf(preview, price, extraCents, coupon, d.now, week);
  // No amount was ever told (its email failed), or the amount moved: tell first, charge after 24 hours.
  if (
    u.quote?.totalCents == null ||
    u.quote.totalCents !== preview.totalCents ||
    u.quote.currency !== preview.currency ||
    u.quote.price !== price ||
    (u.quote.extraCents ?? 0) !== extraCents ||
    (u.quote.coupon !== undefined && (u.quote.coupon ?? null) !== coupon)
  ) {
    return holdForAmount(q, d, u, week, fresh, { ended });
  }

  const claim = await claimCharge(q, { userId, purpose: "first_charge", weekOf: week, attempt, price, amountCents: preview.totalCents, currency: preview.currency, extraCents, coupon, now: d.now });
  if (!claim) return "skipped";

  // Never a second subscription.
  const live = (await d.gw.subscriptions(u.stripe_customer)).find(isLive);
  if (live) return applyResult(q, d, u, claim, { kind: "error", error: `The customer already has a live subscription (${live.id}).` }, "charge_duplicate");

  const result = await d.gw.createSubscription({ customer: u.stripe_customer, price, extra, coupon, claimId: claim.id, userId, idempotencyKey: idempotencyKey(claim) });
  if (result.kind === "coupon_gone") return couponGoneAtCreate(q, d, u, claim, { price, extra, extraCents, coupon }, result.error);
  return applyResult(q, d, u, claim, result);
}

const quoteOf = (p: FirstPreview, price: string, extraCents: number, coupon: string | null, now: Date, week: string): Quote => ({
  totalCents: p.totalCents,
  currency: p.currency,
  price,
  extraCents,
  at: now.toISOString(),
  week,
  coupon,
  discountCents: coupon ? (p.discountCents ?? 0) : 0,
  ...(p.taxCents != null ? { taxCents: p.taxCents } : {}),
});

/**
 * The amount moved (or was never told, or the locked-in coupon ended): held
 * as `amount_changed` with the new amount, told by email, charged 24 hours
 * later if unchanged. A discount dropped on an earlier pass
 * (`promo_ended_label`) is named in the email, then forgotten.
 *
 * With `claim` (the create found the claimed coupon gone), one statement
 * locks the member while they may still be charged (`m`), settles the claim
 * as an error, drops that coupon and holds: all of it or none of it. If the
 * member can no longer be charged (cancelled, closed, subscribed), the claim
 * is then settled as an error by itself and the admins are told (decision:
 * never left open for the takeover to repeat, never ended silently).
 */
async function holdForAmount(
  q: Query,
  d: ChargeDeps,
  u: Pick<U, "id" | "email" | "quote">,
  week: string,
  fresh: Quote,
  o: { ended?: string | null; claim?: { id: string; error: string; coupon: string | null } } = {},
): Promise<FirstOutcome> {
  const held = await q<{ ended: string | null }>(
    `with m as (
       select id, promo_ended_label from users
       where id = $1 and status in ('trial', 'held') and stripe_subscription is null and free_lists_used >= $3
         and ($4::uuid is null or (cancel_requested_at is null and plan = 'monthly'))
       for update
     ),
     s as (
       update charge_attempts set outcome = 'error', error = $5, settled_at = now(), next_attempt_at = null
       where $4::uuid is not null and id = $4 and outcome in ('claimed', 'unknown') and exists (select 1 from m)
       returning id
     )
     update users u set status = 'held', hold_reason = 'amount_changed', quote = $2, promo_ended_label = null,
       promo_coupon = case when u.promo_coupon = $6::text then null else u.promo_coupon end,
       promo_label = case when u.promo_coupon = $6::text then null else u.promo_label end,
       promo_duration = case when u.promo_coupon = $6::text then null else u.promo_duration end,
       promo_duration_months = case when u.promo_coupon = $6::text then null else u.promo_duration_months end
     from m
     where u.id = m.id and ($4::uuid is null or exists (select 1 from s))
     returning m.promo_ended_label as ended`,
    [u.id, JSON.stringify(fresh), d.settings.freeRuns, o.claim?.id ?? null, o.claim?.error.slice(0, 1000) ?? null, o.claim?.coupon ?? null],
  );
  if (!held.length) {
    if (!o.claim) return "held_amount";
    // The member can no longer be charged: the claim ends here (nothing was created in Stripe), and an admin looks.
    if (!(await settle(q, o.claim.id, "error", { error: `The user can no longer be charged. ${o.claim.error}` }))) return "open";
    await alert(
      "charge_error",
      o.claim.id,
      "A first charge claim ended: the member can no longer be charged",
      [`User ${u.id}, claim ${o.claim.id}. The coupon no longer applied and the member is cancelled, closed or subscribed. Nothing was created in Stripe.`],
      d,
    );
    return "error";
  }
  const ended = o.ended ?? held[0].ended ?? null;
  const total = fresh.totalCents!;
  await sendToUser(
    { id: u.id, email: u.email },
    "amount_changed",
    `${week}:${total}:${fresh.price}`,
    amountChangedEmail({ amountCents: total, currency: fresh.currency as Currency, taxCents: fresh.taxCents, discountEnded: ended }),
    d,
  ).catch(() => {});
  const why = ended ? ` The locked-in discount (${ended}) no longer applies.` : "";
  await alert("amount_changed", `${u.id}:${week}:${total}`, "A first charge amount changed", [`User ${u.id}: told ${u.quote?.totalCents ?? "nothing"} ${u.quote?.currency ?? ""}, now ${total} ${fresh.currency}.${why} Charged in 24 hours if unchanged.`], d);
  return "held_amount";
}

/** The name of a claimed coupon that ended: the member's label while it is still theirs, else the one kept at its drop. */
const endedLabel = (u: Pick<U, "promo_coupon" | "promo_label" | "promo_ended_label">, coupon: string | null) =>
  coupon && u.promo_coupon === coupon ? (u.promo_label ?? coupon) : (u.promo_ended_label ?? coupon);

/** The claimed call: price, extra and coupon (a takeover reads them back from the claim). */
type Claimed = { price: string; extra: FirstExtra; extraCents: number; coupon: string | null };

/**
 * Stripe refused the subscription because the claimed coupon was deleted or
 * expired since the preview: nothing was created. The full price is
 * previewed, then the claim ends as an error, the coupon is dropped and the
 * member is held for the changed amount, all in one statement; the 24-hour
 * retry (a new attempt) charges the full price. If the preview fails, the
 * claim stays open and the takeover repeats the claimed create, which finds
 * the coupon gone again.
 */
async function couponGoneAtCreate(q: Query, d: ChargeDeps, u: U, claim: Claim, c: Claimed, error: string): Promise<FirstOutcome> {
  const p = await d.gw.preview({ customer: u.stripe_customer!, price: c.price, extra: c.extra, coupon: null });
  return holdForAmount(q, d, u, claim.weekOf, quoteOf(p, c.price, c.extraCents, null, d.now, claim.weekOf), {
    ended: endedLabel(u, c.coupon),
    claim: { id: claim.id, error: `Coupon no longer applies: ${error}`, coupon: c.coupon },
  });
}

/** The dates still to come, for the decline email. */
function retryDates(week: string, attempt: number, chargeAt: string, now: Date): string[] {
  const out: string[] = [];
  for (let a = attempt; a <= 3; a++) {
    const t = nextRetryAt(week, a, chargeAt);
    if (t && t > now) out.push(longDate(addDays(week, [1, 3, 7][a - 1])));
  }
  return out;
}

/**
 * Acts on how a charge ended: the claim's outcome and the user's state are
 * written in one statement, so a crash can never leave a paid user held or a
 * declined user unheld.
 */
export async function applyResult(q: Query, d: ChargeDeps, u: Pick<U, "id" | "email" | "currency">, claim: Claim, r: ChargeResult, errorKind?: string): Promise<FirstOutcome> {
  if (r.kind === "succeeded") {
    const [x] = await q<{ settled: boolean; activated: boolean; switched: boolean }>(
      `with s as (
         update charge_attempts set outcome = 'succeeded', stripe_object = $2, amount_cents = coalesce($3, amount_cents), currency = coalesce($4, currency),
           settled_at = now(), error = null, next_attempt_at = null
         where id = $1 and outcome in ('claimed', 'unknown') returning user_id, week_of, extra_cents, currency
       ),
       a as (
         -- The job's clock, not the database's: billing months are counted from the new subscription's anchor.
         update users set status = 'active', hold_reason = null, stripe_subscription = $2, first_charge_at = coalesce(first_charge_at, $5::timestamptz),
           billing_anchor = coalesce($6::timestamptz, $5::timestamptz), switched_from_per_run_at = null, promo_ended_label = null
         where id in (select user_id from s) and status in ('trial', 'held') returning id, billing_anchor
       ),
       -- Earlier months' differences carried to this charge (a switch away and back): billed now.
       c as (select coalesce(sum(amount_cents), 0)::int as cents from pending_adjustments where user_id in (select user_id from s) and status = 'deleted' and carried_at is not null),
       g as (update pending_adjustments set status = 'invoiced', updated_at = now() where user_id in (select id from a) and status = 'deleted' and carried_at is not null),
       -- The rest of the extra is this month's higher-rate difference: the first month owes nothing more.
       f as (
         insert into pending_adjustments (user_id, period_start, amount_cents, currency, week_of, invoice_at, create_after, status, reason)
         select a.id, (a.billing_anchor at time zone 'America/Toronto')::date, s.extra_cents - c.cents, coalesce(s.currency, 'USD'), s.week_of, a.billing_anchor, a.billing_anchor, 'invoiced', 'not_sharing'
         from a join s on s.user_id = a.id cross join c where s.extra_cents - c.cents > 0
       )
       -- Read from the snapshot before the update: a paying one-at-a-time member's first monthly charge is not a "third list".
       select exists (select 1 from s) as settled, exists (select 1 from a) as activated,
              coalesce((select switched_from_per_run_at is not null from users where id in (select user_id from s)), false) as switched`,
      [claim.id, r.object, r.amountCents, r.currency, d.now.toISOString(), r.anchor ? new Date(r.anchor * 1000).toISOString() : null],
    );
    if (!x?.settled) return "open";
    if (!x.activated) {
      // Charged, but the user was closed or cancelled meanwhile: an admin decides on a refund.
      await alert("charged_not_active", claim.id, "A first charge succeeded for a user who is no longer in trial", [`User ${u.id}, subscription ${r.object}. Check and refund if needed.`], d);
      return "charged";
    }
    await sendToUser({ id: u.id, email: u.email }, "subscribed", claim.weekOf, subscribedEmail({ amountCents: r.amountCents, currency: (r.currency ?? u.currency ?? "USD") as Currency, taxCents: r.taxCents, switched: x.switched }), d).catch(() => {});
    return "charged";
  }
  if (r.kind === "unknown") {
    await q(`update charge_attempts set outcome = 'unknown', error = $2 where id = $1 and outcome in ('claimed', 'unknown')`, [claim.id, r.error.slice(0, 1000)]);
    return "unknown";
  }
  const declined = r.kind === "declined";
  const outcome = declined ? (r.hard ? "hard_declined" : "declined") : "error";
  const next = declined && !r.hard ? nextRetryAt(claim.weekOf, claim.attempt, d.settings.chargeAt) : null;
  // A retry whose day already passed (the first attempt came late) runs at the next hourly pass.
  const nextAt = next && next < d.now ? new Date(d.now.getTime() + 60 * 60_000) : next;
  const [x] = await q<{ settled: boolean }>(
    `with s as (
       update charge_attempts set outcome = $2, decline_code = $3, error = $4, next_attempt_at = $5, settled_at = now()
       where id = $1 and outcome in ('claimed', 'unknown') returning user_id
     ),
     h as (update users set status = 'held', hold_reason = 'first_charge_failed' where id in (select user_id from s) and status in ('trial', 'held'))
     select exists (select 1 from s) as settled`,
    [claim.id, outcome, declined ? r.code : null, declined ? null : r.error.slice(0, 1000), nextAt?.toISOString() ?? null],
  );
  if (!x?.settled) return "open";
  // No retry left and the close is due (the day-7 attempt, or a later one): the close follows in this pass, and its
  // email ("closed", or "back to one at a time") stands alone, never after a "we'll try again" that won't happen.
  if (declined && !next && d.now >= closeTrialAt(claim.weekOf, d.settings.chargeAt)) return "declined";
  if (declined) {
    const retries = r.hard ? [] : retryDates(claim.weekOf, claim.attempt, d.settings.chargeAt, d.now);
    await sendToUser({ id: u.id, email: u.email }, "charge_failed", `${claim.weekOf}:${claim.attempt}`, chargeFailedEmail({ hard: r.hard, retries }), d).catch(() => {});
    return "declined";
  }
  const kind = errorKind ?? (r.kind === "tax_address" ? "charge_tax_address" : "charge_error");
  const subject =
    kind === "charge_duplicate"
      ? "A first charge found a live subscription"
      : r.kind === "tax_address"
        ? "Stripe couldn't work out tax for a customer's address"
        : "A first charge was refused by Stripe";
  await alert(kind, claim.id, subject, [`User ${u.id}, claim ${claim.id}. The user is held; fix it, then retry from the admin.`, r.error], d);
  return "error";
}

/**
 * Settles a claim left open past 15 minutes: the subscription is looked up by
 * its claim id first, whatever its status; only if none exists, and the user
 * may still be charged, is the claimed call repeated exactly (same price, same
 * key).
 */
export async function takeOverFirstCharge(q: Query, d: ChargeDeps, claim: Claim): Promise<FirstOutcome> {
  const u = await loadUser(q, claim.userId);
  if (!u?.stripe_customer) return "error";
  const subs = await d.gw.subscriptions(u.stripe_customer);
  const mine = subs.find((s) => s.claimId === claim.id);
  if (mine && isLive(mine)) return applyResult(q, d, u, claim, { kind: "succeeded", object: mine.id, amountCents: null, currency: null, anchor: mine.anchor ?? null });
  if (mine) return applyResult(q, d, u, claim, { kind: "error", error: `Subscription ${mine.id} made by this claim is ${mine.status}.` });
  const other = subs.find(isLive);
  if (other) return applyResult(q, d, u, claim, { kind: "error", error: `The customer already has a live subscription (${other.id}).` }, "charge_duplicate");
  if (!(await stillChargeable(q, claim.id))) return applyResult(q, d, u, claim, { kind: "error", error: "The user can no longer be charged (cancelled, closed or switched)." });
  const { price, extraCents, currency, coupon } = await claimedPrice(q, claim.id);
  if (!price) return applyResult(q, d, u, claim, { kind: "error", error: "The claim has no recorded price." });
  const extra = extraOf(extraCents, currency ?? u.currency ?? "USD");
  // Exactly the claimed call, coupon included (Stripe refuses a reused key with other parameters). The member was told
  // the amount with that coupon, so it is sent even if the member's own coupon was changed or dropped since.
  if ((u.promo_coupon ?? null) !== coupon) console.warn("[charge] takeover repeats the claimed coupon", { claimId: claim.id, coupon, current: u.promo_coupon });
  const r = await d.gw.createSubscription({ customer: u.stripe_customer, price, extra, coupon, claimId: claim.id, userId: u.id, idempotencyKey: idempotencyKey(claim) });
  if (r.kind === "coupon_gone") return couponGoneAtCreate(q, d, u, claim, { price, extra, extraCents, coupon }, r.error);
  return applyResult(q, d, u, claim, r);
}

/** Retries whose day has come (days 1, 3 and 7), and charges held for a changed amount once 24 hours have passed. */
export async function dueRetries(q: Query, d: ChargeDeps): Promise<Record<FirstOutcome, number>> {
  const tally: Record<FirstOutcome, number> = { charged: 0, declined: 0, held_amount: 0, unknown: 0, error: 0, skipped: 0, open: 0 };
  const due = await q<{ user_id: string; week_of: string; changed: boolean }>(
    `select u.id as user_id, to_char(c.week_of, 'YYYY-MM-DD') as week_of, false as changed
     from users u join lateral (
       select week_of, outcome, next_attempt_at from charge_attempts where user_id = u.id and purpose = 'first_charge' order by claimed_at desc limit 1
     ) c on true
     where u.status = 'held' and u.hold_reason = 'first_charge_failed' and c.outcome = 'declined' and c.next_attempt_at is not null and c.next_attempt_at <= $1
     union all
     select u.id, coalesce(u.quote->>'week', to_char($1::timestamptz at time zone 'America/Toronto', 'YYYY-MM-DD')), true
     from users u where u.status = 'held' and u.hold_reason = 'amount_changed' and (u.quote->>'at')::timestamptz <= $1::timestamptz - interval '24 hours'`,
    [d.now.toISOString()],
  );
  // A changed amount told 24 hours ago is a new attempt whatever ended the last one (a refusal that a new card fixed
  // and whose retry found the amount moved would otherwise wait for an admin for ever, never charged nor closed).
  for (const r of due) {
    // One member throwing never blocks the rest (whole-branch review W6, as runChargeJob). A failure before Stripe was
    // reached leaves the claim open; the hourly pass takes it over after 15 minutes, and the next pass tries again.
    try {
      tally[await chargeFirst(q, d, r.user_id, r.week_of, { reset: r.changed })]++;
    } catch (e) {
      console.error("[charge] first charge retry", r.user_id, e instanceof Error ? e.message : e);
      tally.unknown++;
    }
  }
  return tally;
}

/**
 * A new card while held for a changed amount (the card's address can change
 * the tax): the amount is previewed again and, if it moved, told again (the
 * 24 hours start over). It is charged only once 24 hours have passed since
 * the amount now standing was told.
 */
export async function recheckChangedAmount(q: Query, d: ChargeDeps, userId: string): Promise<FirstOutcome> {
  const [u] = await q<{ week: string | null }>(`select quote->>'week' as week from users where id = $1 and status = 'held' and hold_reason = 'amount_changed'`, [userId]);
  return u?.week ? chargeFirst(q, d, userId, u.week, { reset: true }) : "skipped";
}

/** A card replaced while held, or an admin's retry after a fix: try at once, as a new attempt (spec B.9). */
export async function retryNow(q: Query, d: ChargeDeps, userId: string): Promise<FirstOutcome> {
  const [last] = await q<{ week_of: string }>(
    `select to_char(week_of, 'YYYY-MM-DD') as week_of from charge_attempts where user_id = $1 and purpose = 'first_charge' order by claimed_at desc limit 1`,
    [userId],
  );
  return last ? chargeFirst(q, d, userId, last.week_of, { reset: true }) : "skipped";
}

/**
 * Day 7 with nothing charged and no retry left: the trial closes, once, and
 * its held list is never delivered. Never while a charge is in flight.
 *
 * A failed first charge whose retry found the amount changed (held
 * `amount_changed`, told the new amount) gets that retry 24 hours later; if
 * the close is due by then and it did not go through, it closes the same way
 * (or goes back to one at a time), rather than waiting on a changed amount.
 */
export async function closeUnpaidTrials(q: Query, d: ChargeDeps): Promise<number> {
  const rows = await q<{ id: string; email: string; week_of: string; claim_id: string }>(
    `select u.id, u.email, to_char(c.week_of, 'YYYY-MM-DD') as week_of, c.id as claim_id
     from users u join lateral (
       select id, week_of, outcome, next_attempt_at from charge_attempts where user_id = u.id and purpose = 'first_charge' order by claimed_at desc limit 1
     ) c on true
     where u.status = 'held' and c.outcome in ('declined', 'hard_declined', 'error')
       and ((u.hold_reason = 'first_charge_failed' and c.next_attempt_at is null)
            or (u.hold_reason = 'amount_changed' and c.week_of = (u.quote->>'week')::date
                and (u.quote->>'at')::timestamptz <= $1::timestamptz - interval '24 hours'))`,
    [d.now.toISOString()],
  );
  let closed = 0;
  for (const r of rows) {
    if (d.now < closeTrialAt(r.week_of, d.settings.chargeAt)) continue;
    // A paying one-at-a-time member who switched to monthly goes back to one at a time: never "trial closed".
    const [done] = await q<{ restored: boolean }>(
      `with b as (select id, switched_from_per_run_at is not null as restored from users where id = $1 for update)
       update users u set
         status = case when u.switched_from_per_run_at is not null then 'active' else 'closed' end,
         plan = case when u.switched_from_per_run_at is not null then 'per_run' else u.plan end,
         hold_reason = case when u.switched_from_per_run_at is not null then null else u.hold_reason end,
         quote = case when u.switched_from_per_run_at is not null then null else u.quote end,
         plan_switched_at = case when u.switched_from_per_run_at is not null then now() else u.plan_switched_at end,
         -- A close ends access: the retention clock counts from here (Unit 18).
         access_ends_at = case when u.switched_from_per_run_at is not null then u.access_ends_at else coalesce(u.access_ends_at, now()) end,
         switched_from_per_run_at = null
       from b
       where u.id = b.id and u.id = $1 and u.status = 'held' and u.hold_reason in ('first_charge_failed', 'amount_changed')
         and not exists (select 1 from charge_attempts x where x.user_id = u.id and x.outcome in ('claimed', 'unknown'))
         and (select id from charge_attempts x where x.user_id = u.id and x.purpose = 'first_charge' order by claimed_at desc limit 1) = $2
       returning b.restored`,
      [r.id, r.claim_id],
    );
    if (!done) continue;
    closed++;
    if (done.restored) {
      await clearCarried(q, r.id);
      await sendToUser({ id: r.id, email: r.email }, "plan_changed", `restored:${r.week_of}`, backToPerRunEmail(), d).catch(() => {});
      continue;
    }
    await sendToUser({ id: r.id, email: r.email }, "trial_closed", r.week_of, trialClosedEmail(), d).catch(() => {});
  }
  return closed;
}

/** A repair: a succeeded first charge whose user is not active (a crash in an older version, or a manual change). */
export async function repairPaidUsers(q: Query, d: ChargeDeps): Promise<number> {
  // Only the user's latest charge claim, and only one made after their last plan change: an old
  // subscription from before a switch to one at a time and back is dead and is never reattached.
  const candidates = await q<{ id: string; claim_id: string; customer: string | null; stripe_object: string }>(
    `select c.user_id as id, c.id as claim_id, u.stripe_customer as customer, c.stripe_object from charge_attempts c join users u on u.id = c.user_id
     where c.purpose = 'first_charge' and c.outcome = 'succeeded' and u.status in ('trial', 'held') and u.stripe_subscription is null
       and c.id = (select x.id from charge_attempts x where x.user_id = c.user_id order by x.claimed_at desc limit 1)
       and (u.plan_switched_at is null or c.claimed_at > u.plan_switched_at)`,
  );
  if (!candidates.length) return 0;
  // The subscription must be live in Stripe; billing months count from its own anchor (the settle time only if Stripe gives none).
  const anchors: { user_id: string; claim_id: string; anchor: string | null }[] = [];
  for (const c of candidates) {
    const found = c.customer ? (await d.gw.subscriptions(c.customer).catch(() => [])).find((s) => s.id === c.stripe_object) : undefined;
    if (!found || !isLive(found)) continue;
    anchors.push({ user_id: c.id, claim_id: c.claim_id, anchor: found.anchor ? new Date(found.anchor * 1000).toISOString() : null });
  }
  if (!anchors.length) return 0;
  const rows = await q<{ id: string; stripe_object: string }>(
    `with x as (select * from jsonb_to_recordset($1::jsonb) as x(user_id uuid, claim_id uuid, anchor timestamptz)),
     r as (
       update users u set status = 'active', hold_reason = null, stripe_subscription = c.stripe_object, first_charge_at = coalesce(u.first_charge_at, c.settled_at),
         billing_anchor = coalesce(x.anchor, c.settled_at)
       from charge_attempts c
       join x on x.claim_id = c.id
       where c.user_id = u.id and c.outcome = 'succeeded' and u.status in ('trial', 'held') and u.stripe_subscription is null
       returning u.id, c.stripe_object, u.billing_anchor, c.week_of, c.extra_cents, c.currency
     ),
     k as (select p.user_id, coalesce(sum(p.amount_cents), 0)::int as cents from pending_adjustments p where p.user_id in (select id from r) and p.status = 'deleted' and p.carried_at is not null group by p.user_id),
     g as (update pending_adjustments p set status = 'invoiced', updated_at = now() where p.user_id in (select id from r) and p.status = 'deleted' and p.carried_at is not null),
     -- As in applyResult: a first invoice that carried the month's difference leaves that month billed.
     f as (
       insert into pending_adjustments (user_id, period_start, amount_cents, currency, week_of, invoice_at, create_after, status, reason)
       select r.id, (r.billing_anchor at time zone 'America/Toronto')::date, r.extra_cents - coalesce(k.cents, 0), coalesce(r.currency, 'USD'), r.week_of, r.billing_anchor, r.billing_anchor, 'invoiced', 'not_sharing'
       from r left join k on k.user_id = r.id where r.extra_cents - coalesce(k.cents, 0) > 0
       on conflict do nothing
     )
     select id, stripe_object from r`,
    [JSON.stringify(anchors)],
  );
  for (const r of rows) {
    await alert("charge_repaired", r.id, "A paid user was set active by the repair pass", [`User ${r.id}, subscription ${r.stripe_object}.`], d);
  }
  return rows.length;
}

/**
 * Stripe says a subscription's invoice was paid (a signal): an open claim
 * named in its metadata is settled as succeeded, in the same statement that
 * makes the user active.
 */
export async function settleFromInvoice(
  q: Query,
  o: {
    claimId: string;
    subscription: string;
    amountCents: number | null;
    currency: string | null;
    /** The tax in the paid invoice. */
    taxCents?: number | null;
    /** The subscription's billing cycle anchor (unix seconds), from the invoice's plan line. */
    anchor?: number | null;
  },
  d: Omit<ChargeDeps, "gw"> & { gw?: BillingGateway },
): Promise<FirstOutcome> {
  const [c] = await q<{ id: string; user_id: string; week_of: string; attempt: number; claimed_at: string }>(
    `select id, user_id, to_char(week_of, 'YYYY-MM-DD') as week_of, attempt, claimed_at::text from charge_attempts
     where id = $1 and outcome in ('claimed', 'unknown') and purpose = 'first_charge'`,
    [o.claimId],
  );
  if (!c) return "skipped";
  const u = await loadUser(q, c.user_id);
  if (!u) return "skipped";
  const claim: Claim = { id: c.id, userId: c.user_id, purpose: "first_charge", weekOf: c.week_of, attempt: c.attempt, claimedAt: c.claimed_at };
  return applyResult(q, { gw: d.gw as BillingGateway, ...d }, u, claim, { kind: "succeeded", object: o.subscription, amountCents: o.amountCents, currency: o.currency?.toUpperCase() ?? null, taxCents: o.taxCents ?? null, anchor: o.anchor ?? null });
}

/** The Monday a trial user's first charge would come next, for the "date moved" note. */
export function nextChargeMonday(week: string): string {
  return addDays(week, 7);
}
