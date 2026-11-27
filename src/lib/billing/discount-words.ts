import { moneyCents, type Currency } from "./prices";

/**
 * How long a locked-in promo's discount lasts, in words (plan 2026-11-26-001,
 * Unit 8 review fixes), shared by the Payment page's Price Box and the
 * first-charge emails. Client-safe (no server imports). Drafted copy for
 * Peter's sign-off (S18).
 *
 * Stripe's coupon `duration`: `once` (the first invoice), `repeating` (for
 * `duration_in_months` months), or `forever`. Null when it is not known (a
 * code stored before durations were kept): then no period is claimed.
 */
export type DiscountDuration = "once" | "repeating" | "forever";
export type DiscountTerms = { duration: DiscountDuration | null; months: number | null };

export const asDuration = (v: unknown): DiscountDuration | null => (v === "once" || v === "repeating" || v === "forever" ? v : null);

/** Whether the discount stops after a while (once, or repeating), so the full monthly amount follows. Null when unknown. */
export function discountEnds(t: DiscountTerms): boolean | null {
  if (t.duration === "forever") return false;
  if (t.duration === "once") return true;
  if (t.duration === "repeating" && t.months) return true;
  return null;
}

/** "CA$56 off your first month", "CA$56 off a month for your first 3 months", "CA$56 off every month", or "CA$56 off". */
export function discountWords(amountCents: number, currency: Currency, t: DiscountTerms): string {
  const off = `${moneyCents(amountCents, currency)} off`;
  if (t.duration === "once" || (t.duration === "repeating" && t.months === 1)) return `${off} your first month`;
  if (t.duration === "repeating" && t.months) return `${off} a month for your first ${t.months} months`;
  if (t.duration === "forever") return `${off} every month`;
  return off;
}

/** "Then CA$316.40 a month" (or "Then CA$280 + tax a month" while the tax is still to come). */
export function thenWords(cents: number, currency: Currency, taxToCome = false): string {
  return `Then ${moneyCents(cents, currency)}${taxToCome ? " + tax" : ""} a month`;
}
