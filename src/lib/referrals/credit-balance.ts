import { randomUUID } from "node:crypto";
import type { Query } from "@/lib/db-query";
import type { Currency } from "@/lib/billing/prices";
import { pastDeadline, type CreditDeps } from "./credit-money";

/**
 * A member's referral credit balance (B2 plan Unit 4): the one lease that
 * serialises every change to it, the credit that can be taken back, and the
 * cached figure pages show.
 */

/**
 * Someone else is changing this member's credit right now, or the caller ran out of time: try again shortly (a
 * sweep moves on; the webhook leaves a grant to the hourly sweep and answers 500 for a reversal: see webhook.ts).
 */
export class CreditBusy extends Error {}

/** Longer than any function runs (Vercel's 300 seconds), so a live holder's lease cannot expire under it. */
export const LEASE_SECONDS = 360;
/** No Stripe write starts after this long holding the lease: with Stripe's own timeouts it ends well inside LEASE_SECONDS. */
export const LEASE_WORK_MS = 240_000;
/**
 * The Stripe webhook's budget (its route runs for at most 60 seconds): a lease of 90 seconds, so a webhook
 * killed at its limit frees the member's credit within half a minute, and no Stripe write after 40 seconds.
 */
export const WEBHOOK_LEASE = { seconds: 90, workMs: 40_000 } as const;

/**
 * Runs `fn` holding the member's balance lease (`leases` row
 * `credit:<user id>`), so two grants, clawbacks or lapses for one member
 * never read the same balance or the same shortfall at once. Neon over HTTP
 * has no transactions, so this is the lock. A nested call for the same
 * member (`d.lease`) does not take it again. No member (deleted): no lease.
 *
 * Every Stripe write inside it calls `guardLease` first (docs/solutions/
 * best-practices/lease-must-guard-every-write-not-just-entry): the lease is
 * renewed with this holder in the condition, and the work stops with
 * CreditBusy if the renewal fails or LEASE_WORK_MS has passed. The ledger
 * writes that follow a Stripe write take seconds, so the elapsed limit is
 * what keeps them inside the lease: it cannot expire while they run.
 */
export async function withBalanceLease<T>(q: Query, d: CreditDeps, userId: string | null, fn: (d: CreditDeps) => Promise<T>): Promise<T> {
  if (!userId || d.lease?.userId === userId) return fn(d);
  const holder = randomUUID();
  const name = `credit:${userId}`;
  const seconds = d.leaseBudget?.seconds ?? LEASE_SECONDS;
  const workMs = d.leaseBudget?.workMs ?? LEASE_WORK_MS;
  const got = await q(
    `insert into leases (name, holder, until) values ($1, $2, now() + make_interval(secs => $3))
     on conflict (name) do update set holder = excluded.holder, until = excluded.until
     where leases.until < now()
     returning name`,
    [name, holder, seconds],
  );
  if (!got.length) throw new CreditBusy(`Referral credit for ${userId} is being changed; try again shortly`);
  try {
    return await fn({ ...d, lease: { userId, holder, startedAt: (d.clock ?? Date.now)(), seconds, workMs } });
  } finally {
    await q(`delete from leases where name = $1 and holder = $2`, [name, holder]).catch(() => {});
  }
}

/**
 * Before a Stripe write inside the lease: renews it (only while this holder
 * still has it) and checks the time spent, and the caller's deadline. Throws
 * CreditBusy to stop with nothing half-written. Outside a lease (a deleted
 * member) only the deadline is checked.
 */
export async function guardLease(q: Query, d: CreditDeps): Promise<void> {
  if (pastDeadline(d)) throw new CreditBusy("Out of time for this pass; the next one goes on");
  if (!d.lease) return;
  if ((d.clock ?? Date.now)() - d.lease.startedAt > d.lease.workMs) throw new CreditBusy(`Out of time holding the credit lease for ${d.lease.userId}; the next pass goes on`);
  const renewed = await q(`update leases set until = now() + make_interval(secs => $3) where name = $1 and holder = $2 returning name`, [
    `credit:${d.lease.userId}`,
    d.lease.holder,
    d.lease.seconds,
  ]);
  if (!renewed.length) throw new CreditBusy(`The credit lease for ${d.lease.userId} was lost`);
}

/**
 * The referral credit the ledger says the member still has: posted grants,
 * less what clawbacks and lapses took or are about to take (posted or still
 * waiting to post: their collectable part). A clawback that reduced a grant
 * before it posted (`unposted_grant:*`) moved no money, so it is not counted
 * (the grant's own amount already reflects it). Credit spent on invoices is
 * not in the ledger, so this is an upper bound. `except`: a row left out
 * (the one being posted, re-capping itself).
 */
export async function ledgerCreditCents(q: Query, userId: string, except: string | null = null): Promise<number> {
  const [r] = await q<{ n: number }>(
    `select coalesce(sum(case kind when 'grant' then case when status = 'posted' then amount_cents else 0 end
         when 'clawback' then -(amount_cents - uncollected_cents) else -amount_cents end), 0)::int as n
     from credits where user_id = $1 and ($2::uuid is null or id <> $2::uuid)
       and (status = 'posted' or (kind <> 'grant' and status in ('pending_customer', 'pending_switch')))
       and (kind <> 'clawback' or reason is null or reason not like 'unposted_grant%')`,
    [userId, except],
  );
  return r?.n ?? 0;
}

/** Clawbacks and lapses written but not posted yet: their collectable part, about to leave the balance. */
async function pendingReversalCents(q: Query, userId: string, except: string | null): Promise<number> {
  const [r] = await q<{ n: number }>(
    `select coalesce(sum(case kind when 'clawback' then amount_cents - uncollected_cents else amount_cents end), 0)::int as n
     from credits where user_id = $1 and kind <> 'grant' and status in ('pending_customer', 'pending_switch') and ($2::uuid is null or id <> $2::uuid)`,
    [userId, except],
  );
  return r?.n ?? 0;
}

/**
 * What a clawback or lapse may take back: the credit on the Stripe balance,
 * but never more than the referral credit the ledger still holds (a balance
 * can carry credit from elsewhere, which is not Roger's to take), both less
 * what reversals still waiting to post will take. Read under the member's
 * lease. `except`: the row being posted (it re-caps itself).
 */
export async function takeableCredit(q: Query, d: CreditDeps, userId: string, customer: string, except: string | null = null): Promise<number> {
  const stripeCredit = Math.max(0, -(await d.credits.balance(customer)) - (await pendingReversalCents(q, userId, except)));
  return Math.max(0, Math.min(stripeCredit, await ledgerCreditCents(q, userId, except)));
}

/**
 * Caches the balance (credit as positive cents) read at `at`. Never
 * overwrites a newer reading: a slow writer with an older figure loses.
 */
export async function writeBalanceCache(q: Query, userId: string, cents: number, at: Date): Promise<void> {
  await q(
    `update users set credit_balance_cents = $2, credit_balance_at = $3
     where id = $1 and (credit_balance_at is null or credit_balance_at <= $3::timestamptz)`,
    [userId, cents, at.toISOString()],
  );
}

/**
 * Members whose cached balance is older than their last posted credit row
 * (a cache write that failed after a post): read again and written. Bounded.
 */
export async function refreshStaleBalances(q: Query, d: CreditDeps, limit = 50): Promise<number> {
  const rows = await q<{ id: string; customer: string }>(
    `select u.id, u.stripe_customer as customer from users u
     where u.stripe_customer is not null
       and exists (select 1 from credits c where c.user_id = u.id and c.status = 'posted' and c.stripe_txn is not null
                   and c.posted_at > coalesce(u.credit_balance_at, '-infinity'::timestamptz))
     order by u.credit_balance_at nulls first, u.id limit $1`,
    [limit],
  );
  let n = 0;
  for (const u of rows) {
    if (pastDeadline(d)) break;
    try {
      await writeBalanceCache(q, u.id, Math.max(0, -(await d.credits.balance(u.customer))), d.now);
      n++;
    } catch (e) {
      console.error("[credits] balance refresh failed", u.id, e instanceof Error ? e.message : e);
    }
  }
  return n;
}

/**
 * The member's referral credit as last read from Stripe, for display (Units 5
 * and 8 read it here, never the column):
 * - `cents` is credit they can spend, positive (Stripe's balance negated, 0
 *   when Stripe says they owe);
 * - `asOf` is when it was read. It goes stale as invoices use the credit:
 *   Stripe applies it without telling Roger, and the next post or the hourly
 *   refresh reads it again. Show it as "as of", or read Stripe for money.
 * Null when it was never read.
 */
export async function creditBalance(q: Query, userId: string): Promise<{ cents: number; currency: Currency | null; asOf: Date } | null> {
  const [u] = await q<{ cents: number | null; currency: Currency | null; at: Date | null }>(
    `select credit_balance_cents as cents, currency, credit_balance_at as at from users where id = $1`,
    [userId],
  );
  if (!u || u.cents == null || !u.at) return null;
  return { cents: Math.max(0, u.cents), currency: u.currency, asOf: new Date(u.at) };
}

export type CreditLedgerSummary = {
  /** Referral credit posted to the member's balance, in cents. */
  earnedCents: number;
  /** Grants not posted yet: waiting for a card or the switch, or held by an open dispute. */
  waitingCents: number;
  /** Taken back from the balance: clawbacks (refunds, lost disputes) and a lapse on close. */
  takenBackCents: number;
  /** The ledger's currency (a referrer's is fixed by their card); null with no rows. */
  currency: Currency | null;
};

/**
 * The member's credit ledger in three figures, for the agent surface
 * (GET /api/referrals, B2 whole-branch review). The money figure to show is
 * `creditBalance` (Stripe's balance, as of when it was read); this is the
 * record of how it came to be. A clawback that only reduced a grant before it
 * posted moved no money and is not counted.
 */
export async function creditLedgerSummary(q: Query, userId: string): Promise<CreditLedgerSummary> {
  const [r] = await q<{ earned: number; waiting: number; taken: number; currency: Currency | null }>(
    `select coalesce(sum(amount_cents) filter (where kind = 'grant' and status = 'posted'), 0)::int as earned,
       coalesce(sum(amount_cents) filter (where kind = 'grant' and status in ('pending_customer', 'pending_switch', 'frozen')), 0)::int as waiting,
       coalesce(sum(amount_cents - uncollected_cents) filter (where kind in ('clawback', 'lapse') and status = 'posted'
         and (reason is null or reason not like 'unposted_grant%')), 0)::int as taken,
       (array_agg(currency order by created_at desc))[1] as currency
     from credits where user_id = $1`,
    [userId],
  );
  return { earnedCents: r?.earned ?? 0, waitingCents: r?.waiting ?? 0, takenBackCents: r?.taken ?? 0, currency: r?.currency ?? null };
}
