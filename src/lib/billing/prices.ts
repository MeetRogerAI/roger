import type { V3Settings } from "@/lib/v3-settings";

/**
 * Plans, prices and the words around them (spec 0.2, B.4, B.9). Amounts shown
 * to people come from the v3 settings; the Stripe price ids that are charged
 * come from environment variables, one per plan, rate and currency.
 */
export type Currency = "USD" | "CAD";
export type Plan = "monthly" | "per_run";
export type Rate = "standard" | "higher";

const ENV: Record<string, string> = {
  "monthly/standard/USD": "STRIPE_PRICE_MONTHLY_USD",
  "monthly/standard/CAD": "STRIPE_PRICE_MONTHLY_CAD",
  "monthly/higher/USD": "STRIPE_PRICE_MONTHLY_HIGHER_USD",
  "monthly/higher/CAD": "STRIPE_PRICE_MONTHLY_HIGHER_CAD",
  "per_run/standard/USD": "STRIPE_PRICE_RUN_USD",
  "per_run/standard/CAD": "STRIPE_PRICE_RUN_CAD",
};

/** The Stripe price id for a plan, or null when it has not been set up. */
export function priceId(plan: Plan, currency: Currency, rate: Rate = "standard"): string | null {
  const name = ENV[`${plan}/${rate}/${currency}`];
  return (name && process.env[name]) || null;
}

/** Every price variable, for an admin check that billing is fully set up. */
export const PRICE_ENV_NAMES = Object.values(ENV);

/** Whole-unit amount for display. */
export function amount(s: V3Settings, plan: Plan, currency: Currency, rate: Rate = "standard"): number {
  if (plan === "per_run") return currency === "CAD" ? s.priceRunCad : s.priceRunUsd;
  if (rate === "higher") return currency === "CAD" ? s.priceHigherCad : s.priceHigherUsd;
  return currency === "CAD" ? s.priceCad : s.priceUsd;
}

/** "US$200" or "CA$280": the currency is always named, never a bare "$" (spec A.16 check 5). */
export function money(value: number, currency: Currency): string {
  const v = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${currency === "CAD" ? "CA$" : "US$"}${v}`;
}

/** Money from Stripe's smallest unit (cents). */
export function moneyCents(cents: number, currency: Currency): string {
  return money(cents / 100, currency);
}

/**
 * The tax words before a billing address exists (spec A.4: "plus HST" for
 * CAD, "plus tax where it applies" for USD). Once the card is saved, exact
 * amounts come from Stripe's invoice preview instead.
 */
export function taxPhrase(currency: Currency): string {
  return currency === "CAD" ? "plus HST" : "plus tax where it applies";
}
