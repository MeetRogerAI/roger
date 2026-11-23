import { addDays, cutoffInstant } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, sendToUser, type MailDeps } from "@/lib/mail/send";
import { amountChangedEmail, chargeFailedEmail, subscribedEmail, trialClosedEmail } from "@/lib/mail/templates/charges";
import { backToPerRunEmail } from "@/lib/mail/templates/plan-changed";
import { longDate } from "@/lib/mail/templates/welcome";
import type { V3Settings } from "@/lib/v3-settings";
import { claimCharge, claimedPrice, closeTrialAt, idempotencyKey, nextAttempt, nextRetryAt, stillChargeable, type Claim } from "./claims";
import { firstChargePricing, type Currency } from "./prices";
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

type Quote = { totalCents?: number; currency?: string; price?: string; extraCents?: number; at?: string; week?: string };
type U = { id: string; email: string; currency: Currency | null; status: string; hold_reason: string | null; stripe_customer: string | null; quote: Quote | null; free_lists_used: number };

async function loadUser(q: Query, userId: string): Promise<U | null> {
  const [u] = await q<U>(`select id, email, currency, status, hold_reason, stripe_customer, quote, free_lists_used from users where id = $1`, [userId]);
  return u ?? null;
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
  if (!u.stripe_customer) {
    await alert("charge_setup", `${userId}:${week}`, "A first charge has no Stripe customer", [`User ${userId}, week ${week}.`], d);
    return "error";
  }
  const currency = u.currency ?? "USD";
  // The standard price; not sharing at the cutoff adds the month's difference to the first invoice (the contributor rule).
  const { price, extraCents } = await firstChargePricing(d.settings, currency, await sharingAtCutoff(q, userId, week, d.settings), d.gw);
  const extra = extraOf(extraCents, currency);
  if (!price) {
    await alert("charge_setup", `price:${currency}`, "A Stripe price is missing", [`No price id for monthly ${currency}. Set the STRIPE_PRICE_* variables.`], d);
    return "error";
  }
  const attempt = await nextAttempt(q, { userId, purpose: "first_charge", weekOf: week, reset: o.reset });
  if (attempt == null) return "open";

  // The amount must be the one the user was told (spec check 21), checked before anything is claimed.
  const preview = await d.gw.preview({ customer: u.stripe_customer, price, extra });
  const fresh: Quote = { totalCents: preview.totalCents, currency: preview.currency, price, extraCents, at: d.now.toISOString(), week };
  // No amount was ever told (its email failed), or the amount moved: tell first, charge after 24 hours.
  if (
    u.quote?.totalCents == null ||
    u.quote.totalCents !== preview.totalCents ||
    u.quote.currency !== preview.currency ||
    u.quote.price !== price ||
    (u.quote.extraCents ?? 0) !== extraCents
  ) {
    const held = await q(
      `update users set status = 'held', hold_reason = 'amount_changed', quote = $2 where id = $1 and status in ('trial', 'held') and stripe_subscription is null and free_lists_used >= $3 returning id`,
      [userId, JSON.stringify(fresh), d.settings.freeRuns],
    );
    if (held.length) {
      await sendToUser({ id: u.id, email: u.email }, "amount_changed", `${week}:${preview.totalCents}:${price}`, amountChangedEmail({ amountCents: preview.totalCents, currency: preview.currency as Currency }), d).catch(() => {});
      await alert("amount_changed", `${userId}:${week}:${preview.totalCents}`, "A first charge amount changed", [`User ${userId}: told ${u.quote?.totalCents ?? "nothing"} ${u.quote?.currency ?? ""}, now ${preview.totalCents} ${preview.currency}. Charged in 24 hours if unchanged.`], d);
    }
    return "held_amount";
  }

  const claim = await claimCharge(q, { userId, purpose: "first_charge", weekOf: week, attempt, price, amountCents: preview.totalCents, currency: preview.currency, extraCents, now: d.now });
  if (!claim) return "skipped";

  // Never a second subscription.
  const live = (await d.gw.subscriptions(u.stripe_customer)).find(isLive);
  if (live) return applyResult(q, d, u, claim, { kind: "error", error: `The customer already has a live subscription (${live.id}).` }, "charge_duplicate");

  const result = await d.gw.createSubscription({ customer: u.stripe_customer, price, extra, claimId: claim.id, userId, idempotencyKey: idempotencyKey(claim) });
  return applyResult(q, d, u, claim, result);
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
    const [x] = await q<{ settled: boolean; activated: boolean }>(
      `with s as (
         update charge_attempts set outcome = 'succeeded', stripe_object = $2, amount_cents = coalesce($3, amount_cents), currency = coalesce($4, currency),
           settled_at = now(), error = null, next_attempt_at = null
         where id = $1 and outcome in ('claimed', 'unknown') returning user_id, week_of, extra_cents, currency
       ),
       a as (
         -- The job's clock, not the database's: billing months are counted from the new subscription's anchor.
         update users set status = 'active', hold_reason = null, stripe_subscription = $2, first_charge_at = coalesce(first_charge_at, $5::timestamptz),
           billing_anchor = coalesce($6::timestamptz, $5::timestamptz)
         where id in (select user_id from s) and status in ('trial', 'held') returning id, billing_anchor
       ),
       -- The first invoice already carried the month's higher-rate difference: the first month owes nothing more.
       f as (
         insert into pending_adjustments (user_id, period_start, amount_cents, currency, week_of, invoice_at, create_after, status, reason)
         select a.id, (a.billing_anchor at time zone 'America/Toronto')::date, s.extra_cents, coalesce(s.currency, 'USD'), s.week_of, a.billing_anchor, a.billing_anchor, 'invoiced', 'not_sharing'
         from a join s on s.user_id = a.id where s.extra_cents > 0
       )
       select exists (select 1 from s) as settled, exists (select 1 from a) as activated`,
      [claim.id, r.object, r.amountCents, r.currency, d.now.toISOString(), r.anchor ? new Date(r.anchor * 1000).toISOString() : null],
    );
    if (!x?.settled) return "open";
    if (!x.activated) {
      // Charged, but the user was closed or cancelled meanwhile: an admin decides on a refund.
      await alert("charged_not_active", claim.id, "A first charge succeeded for a user who is no longer in trial", [`User ${u.id}, subscription ${r.object}. Check and refund if needed.`], d);
      return "charged";
    }
    await sendToUser({ id: u.id, email: u.email }, "subscribed", claim.weekOf, subscribedEmail({ amountCents: r.amountCents, currency: (r.currency ?? u.currency ?? "USD") as Currency }), d).catch(() => {});
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
  const { price, extraCents, currency } = await claimedPrice(q, claim.id);
  if (!price) return applyResult(q, d, u, claim, { kind: "error", error: "The claim has no recorded price." });
  const r = await d.gw.createSubscription({ customer: u.stripe_customer, price, extra: extraOf(extraCents, currency ?? u.currency ?? "USD"), claimId: claim.id, userId: u.id, idempotencyKey: idempotencyKey(claim) });
  return applyResult(q, d, u, claim, r);
}

/** Retries whose day has come (days 1, 3 and 7), and charges held for a changed amount once 24 hours have passed. */
export async function dueRetries(q: Query, d: ChargeDeps): Promise<Record<FirstOutcome, number>> {
  const tally: Record<FirstOutcome, number> = { charged: 0, declined: 0, held_amount: 0, unknown: 0, error: 0, skipped: 0, open: 0 };
  const due = await q<{ user_id: string; week_of: string }>(
    `select u.id as user_id, to_char(c.week_of, 'YYYY-MM-DD') as week_of
     from users u join lateral (
       select week_of, outcome, next_attempt_at from charge_attempts where user_id = u.id and purpose = 'first_charge' order by claimed_at desc limit 1
     ) c on true
     where u.status = 'held' and u.hold_reason = 'first_charge_failed' and c.outcome = 'declined' and c.next_attempt_at is not null and c.next_attempt_at <= $1
     union all
     select u.id, coalesce(u.quote->>'week', to_char(now(), 'YYYY-MM-DD'))
     from users u where u.status = 'held' and u.hold_reason = 'amount_changed' and (u.quote->>'at')::timestamptz <= $1::timestamptz - interval '24 hours'`,
    [d.now.toISOString()],
  );
  for (const r of due) tally[await chargeFirst(q, d, r.user_id, r.week_of)]++;
  return tally;
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
 */
export async function closeUnpaidTrials(q: Query, d: ChargeDeps): Promise<number> {
  const rows = await q<{ id: string; email: string; week_of: string; claim_id: string }>(
    `select u.id, u.email, to_char(c.week_of, 'YYYY-MM-DD') as week_of, c.id as claim_id
     from users u join lateral (
       select id, week_of, outcome, next_attempt_at from charge_attempts where user_id = u.id and purpose = 'first_charge' order by claimed_at desc limit 1
     ) c on true
     where u.status = 'held' and u.hold_reason = 'first_charge_failed'
       and c.outcome in ('declined', 'hard_declined', 'error') and c.next_attempt_at is null`,
  );
  let closed = 0;
  for (const r of rows) {
    if (d.now < closeTrialAt(r.week_of, d.settings.chargeAt)) continue;
    // A paying one-at-a-time member who switched to monthly goes back to one at a time: never "trial closed".
    const [done] = await q<{ restored: boolean }>(
      `update users u set
         status = case when u.switched_from_per_run_at is not null then 'active' else 'closed' end,
         plan = case when u.switched_from_per_run_at is not null then 'per_run' else u.plan end,
         hold_reason = case when u.switched_from_per_run_at is not null then null else u.hold_reason end,
         quote = case when u.switched_from_per_run_at is not null then null else u.quote end,
         plan_switched_at = case when u.switched_from_per_run_at is not null then now() else u.plan_switched_at end
       where u.id = $1 and u.status = 'held' and u.hold_reason = 'first_charge_failed'
         and not exists (select 1 from charge_attempts x where x.user_id = u.id and x.outcome in ('claimed', 'unknown'))
         and (select id from charge_attempts x where x.user_id = u.id and x.purpose = 'first_charge' order by claimed_at desc limit 1) = $2
       returning u.switched_from_per_run_at is not null as restored`,
      [r.id, r.claim_id],
    );
    if (!done) continue;
    closed++;
    if (done.restored) {
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
     -- As in applyResult: a first invoice that carried the month's difference leaves that month billed.
     f as (
       insert into pending_adjustments (user_id, period_start, amount_cents, currency, week_of, invoice_at, create_after, status, reason)
       select id, (billing_anchor at time zone 'America/Toronto')::date, extra_cents, coalesce(currency, 'USD'), week_of, billing_anchor, billing_anchor, 'invoiced', 'not_sharing'
       from r where extra_cents > 0
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
  o: { claimId: string; subscription: string; amountCents: number | null; currency: string | null; /** The subscription's billing cycle anchor (unix seconds), from the invoice's plan line. */ anchor?: number | null },
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
  return applyResult(q, { gw: d.gw as BillingGateway, ...d }, u, claim, { kind: "succeeded", object: o.subscription, amountCents: o.amountCents, currency: o.currency?.toUpperCase() ?? null, anchor: o.anchor ?? null });
}

/** The Monday a trial user's first charge would come next, for the "date moved" note. */
export function nextChargeMonday(week: string): string {
  return addDays(week, 7);
}
