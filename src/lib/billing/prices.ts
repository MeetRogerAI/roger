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

/** The difference between the higher and the standard monthly price, in cents of the currency (the contributor rule's month difference). */
export function differenceCents(s: V3Settings, currency: Currency): number {
  return Math.round((amount(s, "monthly", currency, "higher") - amount(s, "monthly", currency)) * 100);
}

/** A gateway that can read a Stripe price's unit amount (cents), or null when it cannot. */
export type PriceReader = { unitAmount?(price: string): Promise<number | null> };

/**
 * The month's difference as Stripe will bill it: the higher minus the
 * standard monthly price's unit amounts, read from Stripe where a gateway is
 * given; the settings' display amounts otherwise.
 */
export async function monthDifferenceCents(s: V3Settings, currency: Currency, gw?: PriceReader | null): Promise<number> {
  const standard = priceId("monthly", currency, "standard");
  const higher = priceId("monthly", currency, "higher");
  if (gw?.unitAmount && standard && higher) {
    const [h, st] = await Promise.all([gw.unitAmount(higher), gw.unitAmount(standard)]);
    if (h != null && st != null && h > st) return h - st;
  }
  return differenceCents(s, currency);
}

/**
 * The first monthly charge (plan Unit 14): the subscription is always at the
 * standard price; a member not sharing at the cutoff of their first paid
 * Monday has the month's difference added to the first invoice.
 */
export async function firstChargePricing(
  s: V3Settings,
  currency: Currency,
  sharingAtCutoff: string,
  gw?: PriceReader | null,
  /** Differences of earlier months carried to this first charge (a switch away and back, plan Unit 15). */
  carriedCents = 0,
): Promise<{ price: string | null; extraCents: number }> {
  return { price: priceId("monthly", currency, "standard"), extraCents: (sharingAtCutoff === "share" ? 0 : await monthDifferenceCents(s, currency, gw)) + carriedCents };
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
