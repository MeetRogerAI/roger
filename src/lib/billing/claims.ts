import { addDays, wallToInstant } from "@/lib/clock";
import type { Query } from "@/lib/db-query";

/**
 * Claim rows for money (plan "Claim first, then act" and "Every charge
 * carries its claim id"). A charge goes ahead only after its claim row is
 * inserted, in a statement that also checks the user may still be charged.
 * The Stripe idempotency key comes from the claim and its attempt number,
 * because Stripe replays a stored decline for a reused key.
 *
 * A claim ends as succeeded, declined (soft or hard), error (ours or Stripe's
 * refusal that a retry cannot fix), or unknown (the call may have happened).
 * Only a recorded decline or error moves to the next attempt number. An
 * unknown or unfinished claim is taken over after 15 minutes, and the object
 * is looked up by the claim id before anything is called again.
 */
export type Purpose = "first_charge" | "order" | "amount_changed";
export type Settled = "succeeded" | "declined" | "hard_declined" | "unknown" | "error";

export type Claim = { id: string; userId: string; purpose: Purpose; weekOf: string; attempt: number; claimedAt: string };

export const TAKEOVER_MINUTES = 15;

/**
 * Who may still be charged, checked inside the claiming statement, so a
 * cancel or a status change that lands first wins.
 */
const GUARD: Record<Purpose, string> = {
  // A trial user; or one held after a decline; or one held for a changed amount once the 24 hours have passed.
  first_charge: `u.plan = 'monthly' and u.cancel_requested_at is null and u.stripe_subscription is null
                 and (u.status = 'trial'
                      or (u.status = 'held' and u.hold_reason = 'first_charge_failed')
                      or (u.status = 'held' and u.hold_reason = 'amount_changed' and (u.quote->>'at')::timestamptz <= $8::timestamptz - interval '24 hours'))
                 -- A list already bought by order that Monday is never charged again as the first month.
                 and not exists (select 1 from orders o where o.user_id = u.id and o.week_of = $3 and o.status in ('charged', 'sent'))`,
  amount_changed: `u.status = 'held' and u.hold_reason = 'amount_changed' and u.cancel_requested_at is null and u.stripe_subscription is null`,
  // An open order for that week, and no monthly first charge already made for it (a switch the same Monday, spec check 41).
  order: `u.status in ('active', 'trial') and u.plan = 'per_run' and u.cancel_requested_at is null and u.stripe_subscription is null
          and exists (select 1 from orders o where o.user_id = u.id and o.week_of = $3 and o.status = 'ordered')
          and not exists (select 1 from charge_attempts f where f.user_id = u.id and f.week_of = $3 and f.purpose = 'first_charge' and f.outcome = 'succeeded')`,
};

type Row = { id: string; user_id: string; purpose: Purpose; week_of: string; attempt: number; claimed_at: string };
const toClaim = (r: Row): Claim => ({ id: r.id, userId: r.user_id, purpose: r.purpose, weekOf: r.week_of, attempt: r.attempt, claimedAt: r.claimed_at });

/**
 * Claims attempt `attempt` for (user, purpose, week). Returns null when the
 * attempt is already claimed or the user may not be charged now.
 */
export async function claimCharge(
  q: Query,
  o: { userId: string; purpose: Purpose; weekOf: string; attempt: number; price?: string | null; amountCents?: number | null; currency?: string | null; now?: Date },
): Promise<Claim | null> {
  // One charge in flight per user, whatever its purpose.
  const [r] = await q<Row>(
    `insert into charge_attempts (user_id, purpose, week_of, attempt, price, amount_cents, currency)
     -- $8 is the job's clock, used by the guard that waits 24 hours after a changed amount.
     select u.id, $2, $3, $4, $5, $6, $7 from users u where u.id = $1 and $8::timestamptz is not null and ${GUARD[o.purpose]}
       and not exists (select 1 from charge_attempts x where x.user_id = u.id and x.outcome in ('claimed', 'unknown'))
     on conflict (user_id, purpose, week_of, attempt) do nothing
     returning id, user_id, purpose, to_char(week_of, 'YYYY-MM-DD') as week_of, attempt, claimed_at::text`,
    [o.userId, o.purpose, o.weekOf, o.attempt, o.price ?? null, o.amountCents ?? null, o.currency ?? null, (o.now ?? new Date()).toISOString()],
  );
  return r ? toClaim(r) : null;
}

/**
 * The attempt number to claim next, or null when there is nothing to claim:
 * the last attempt succeeded, or is still open (claimed or unknown) and must
 * be settled first.
 */
export async function nextAttempt(q: Query, o: { userId: string; purpose: Purpose; weekOf: string; reset?: boolean }): Promise<number | null> {
  const [last] = await q<{ attempt: number; outcome: string }>(
    `select attempt, outcome from charge_attempts where user_id = $1 and purpose = $2 and week_of = $3 order by attempt desc limit 1`,
    [o.userId, o.purpose, o.weekOf],
  );
  if (!last) return 1;
  if (last.outcome === "declined" || last.outcome === "hard_declined") return last.attempt + 1;
  // A refusal a retry cannot fix (setup, tax address) stops the week until a new card or an admin resets it.
  if (last.outcome === "error") return o.reset ? last.attempt + 1 : null;
  return null;
}

/** For a takeover: the user may still be charged for this claim (the guard, as at the claim, minus "no open claim"). */
export async function stillChargeable(q: Query, claimId: string): Promise<boolean> {
  const [r] = await q<{ ok: boolean }>(
    `select exists (
       select 1 from charge_attempts c join users u on u.id = c.user_id
       where c.id = $1 and u.cancel_requested_at is null and (
         (c.purpose = 'first_charge' and u.plan = 'monthly' and u.stripe_subscription is null and u.status in ('trial', 'held'))
         or (c.purpose = 'order' and u.plan = 'per_run' and u.status in ('trial', 'active') and u.stripe_subscription is null
             and exists (select 1 from orders o where o.user_id = u.id and o.week_of = c.week_of and o.status = 'ordered'))
       )
     ) as ok`,
    [claimId],
  );
  return Boolean(r?.ok);
}

/** The price and amount a claim was made with: a takeover repeats exactly that call. */
export async function claimedPrice(q: Query, claimId: string): Promise<{ price: string | null; amountCents: number | null; currency: string | null }> {
  const [r] = await q<{ price: string | null; amount_cents: number | null; currency: string | null }>(`select price, amount_cents, currency from charge_attempts where id = $1`, [claimId]);
  return { price: r?.price ?? null, amountCents: r?.amount_cents ?? null, currency: r?.currency ?? null };
}

/** Records how a claim ended. Only an open claim (claimed or unknown) can be settled; returns whether it was. */
export async function settle(
  q: Query,
  claimId: string,
  outcome: Settled,
  f: { stripeObject?: string | null; declineCode?: string | null; error?: string | null; amountCents?: number | null; currency?: string | null; nextAttemptAt?: Date | null } = {},
): Promise<boolean> {
  const rows = await q(
    `update charge_attempts set outcome = $2, stripe_object = coalesce($3, stripe_object), decline_code = $4, error = $5,
       amount_cents = coalesce($6, amount_cents), currency = coalesce($7, currency), next_attempt_at = $8,
       settled_at = case when $2 = 'unknown' then null else now() end
     where id = $1 and outcome in ('claimed', 'unknown')
     returning id`,
    [claimId, outcome, f.stripeObject ?? null, f.declineCode ?? null, f.error?.slice(0, 1000) ?? null, f.amountCents ?? null, f.currency ?? null, f.nextAttemptAt?.toISOString() ?? null],
  );
  return rows.length > 0;
}

/** Claims left open past the takeover time, oldest first. */
export async function staleClaims(q: Query, limit = 50): Promise<Claim[]> {
  const rows = await q<Row>(
    `select id, user_id, purpose, to_char(week_of, 'YYYY-MM-DD') as week_of, attempt, claimed_at::text from charge_attempts
     where outcome in ('claimed', 'unknown') and claimed_at < now() - make_interval(mins => $1)
     order by claimed_at limit $2`,
    [TAKEOVER_MINUTES, limit],
  );
  return rows.map(toClaim);
}

/** Takes over a stale claim (one worker only); the caller must look the object up by claim id before calling Stripe again. */
export async function takeOver(q: Query, claimId: string): Promise<boolean> {
  const rows = await q(
    `update charge_attempts set claimed_at = now() where id = $1 and outcome in ('claimed', 'unknown') and claimed_at < now() - make_interval(mins => $2) returning id`,
    [claimId, TAKEOVER_MINUTES],
  );
  return rows.length > 0;
}

/** True while a charge for this week is in flight: a cancel or a plan switch waits ("try again in a few minutes"). */
export async function chargeInFlight(q: Query, userId: string): Promise<boolean> {
  const [r] = await q<{ open: boolean }>(`select exists (select 1 from charge_attempts where user_id = $1 and outcome in ('claimed', 'unknown')) as open`, [userId]);
  return Boolean(r?.open);
}

/** The idempotency key for the Stripe call of a claim: the same for a retried call, new for a new attempt. */
export function idempotencyKey(c: Pick<Claim, "id" | "purpose" | "attempt">): string {
  return `${c.purpose}:${c.id}:${c.attempt}`;
}

/**
 * The retry schedule for a declined first charge (spec B.9): days 1, 3 and 7
 * after the Monday it failed, at the charge time. After the day-7 attempt
 * fails, the trial closes. Returns null when there is no next attempt.
 */
export function nextRetryAt(week: string, failedAttempt: number, chargeAt: string): Date | null {
  const day = [1, 3, 7][failedAttempt - 1];
  return day == null ? null : wallToInstant(addDays(week, day), chargeAt);
}

/** The moment a declined first charge closes the trial: day 7 after the Monday, at the charge time, if nothing succeeded. */
export function closeTrialAt(week: string, chargeAt: string): Date {
  return wallToInstant(addDays(week, 7), chargeAt);
}

/** Card declines retrying cannot fix until the card changes (Stripe decline codes). */
const HARD = new Set([
  "stolen_card",
  "lost_card",
  "pickup_card",
  "fraudulent",
  "restricted_card",
  "card_not_supported",
  "currency_not_supported",
  "invalid_account",
  "new_account_information_available",
  "security_violation",
  "revocation_of_all_authorizations",
  "revocation_of_authorization",
  "stop_payment_order",
  "transaction_not_allowed",
  "incorrect_number",
  "invalid_number",
  "expired_card",
]);

export function isHardDecline(code: string | null | undefined): boolean {
  return Boolean(code && HARD.has(code));
}
