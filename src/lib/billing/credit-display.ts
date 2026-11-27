import type { Query } from "@/lib/db-query";
import { creditBalance, writeBalanceCache } from "@/lib/referrals/credit-balance";
import { usableCredit, type DisplayCredit } from "./credit-lines";
import type { CreditGateway } from "./gateway";
import { periodAt } from "./period";
import type { Currency } from "./prices";

/**
 * The member's referral credit for a charge display (B2 plan Unit 5), read
 * from the cached balance (`creditBalance`, its only reader) with no Stripe
 * call. Null when it was never read, or when the last charge (the first
 * charge, or the latest monthly renewal) came well after the reading and may
 * have spent it. Never throws: a display without credit is the B1 display.
 */
export async function displayCredit(q: Query, userId: string, now: Date): Promise<DisplayCredit> {
  try {
    const b = await creditBalance(q, userId);
    if (!b) return null;
    const [u] = await q<{ first: Date | string | null; anchor: Date | string | null; sub: string | null }>(
      `select first_charge_at as first, coalesce(billing_anchor, first_charge_at) as anchor, stripe_subscription as sub from users where id = $1`,
      [userId],
    );
    const times = [u?.first ? new Date(u.first) : null, u?.sub ? (periodAt(u.anchor, now)?.start ?? null) : null].filter((t): t is Date => t != null && t <= now);
    const last = times.length ? new Date(Math.max(...times.map((t) => t.getTime()))) : null;
    return usableCredit(b, last);
  } catch (e) {
    console.warn("[credit] display balance unavailable", { userId, message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** What an email needs to read the live balance: Stripe's customer balance (Stripe's sign, negative is credit). */
export type BalanceReader = Pick<CreditGateway, "balance">;

/**
 * The credit for an email stating a coming charge (B2 plan Unit 5): the live
 * Stripe balance when a credits gateway is given (written to the cache too,
 * never over a newer reading), else the cache (`displayCredit`). The email
 * says it is the balance as it is sent. Never throws.
 */
export async function emailCredit(q: Query, userId: string, now: Date, credits?: BalanceReader | null): Promise<DisplayCredit> {
  if (credits) {
    try {
      const [u] = await q<{ customer: string | null; currency: Currency | null }>(`select stripe_customer as customer, currency from users where id = $1`, [userId]);
      if (u?.customer && u.currency) {
        const cents = Math.max(0, -(await credits.balance(u.customer)));
        // Stamped with the real clock at most: an "as of" clock ahead of it
        // would block every later real cache write (as creditDeps does).
        const readAt = new Date(Math.min(now.getTime(), Date.now()));
        await writeBalanceCache(q, userId, cents, readAt).catch(() => {});
        return cents > 0 ? { cents, currency: u.currency, asOf: now } : null;
      }
    } catch (e) {
      console.warn("[credit] live balance unavailable; using the cached one", { userId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return displayCredit(q, userId, now);
}

/**
 * An invoice that used or changed the customer balance (finalized or paid):
 * its `ending_balance` is the balance at its finalization, cached for the
 * member with no Stripe call, unless a newer reading is already cached.
 * Returns whether it applied to a member.
 */
export async function cacheInvoiceBalance(
  q: Query,
  inv: { customer: string | null; starting_balance?: number | null; ending_balance?: number | null; finalizedAt: Date },
): Promise<boolean> {
  if (!inv.customer || inv.ending_balance == null || inv.starting_balance == null || inv.ending_balance === inv.starting_balance) return false;
  const [u] = await q<{ id: string }>(`select id from users where stripe_customer = $1`, [inv.customer]);
  if (!u) return false;
  await writeBalanceCache(q, u.id, Math.max(0, -inv.ending_balance), inv.finalizedAt);
  return true;
}
