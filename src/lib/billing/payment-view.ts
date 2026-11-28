import { discountEnds, discountWords, thenWords, type DiscountTerms } from "./discount-words";
import type { BillingCountry, MonthlyPreview } from "./gateway";
import { checkBillingLocation, OUTSIDE_COVERAGE } from "./location";
import { moneyCents, type Currency } from "./prices";

/**
 * The Payment page's words and sums (plan 2026-11-26-001, Unit 6), shared by
 * the server (which works out every amount) and the browser (which only
 * shows them). No secrets and no server imports: safe in a client bundle.
 */

/** The pending promo code as the page shows it. Amount fields are null when unknown (the page then shows no discount amount). */
export type PromoView = {
  code: string;
  label: string;
  duration: "once" | "repeating" | "forever" | null;
  durationInMonths: number | null;
  percentOff: number | null;
  amountOffCents: number | null;
};

/** The price before a billing location is known: the plan price, any discount, tax still to come. */
export function basePreview(currency: Currency, subtotalCents: number, promo: PromoView | null): MonthlyPreview {
  const discount = !promo
    ? 0
    : promo.percentOff != null
      ? Math.round((subtotalCents * promo.percentOff) / 100)
      : promo.amountOffCents != null
        ? Math.min(subtotalCents, promo.amountOffCents)
        : 0;
  return { currency, subtotalCents, discountCents: discount, tax: "pending", taxCents: 0, taxName: null, taxRate: null, totalCents: subtotalCents - discount };
}

const termsOf = (p: PromoView): DiscountTerms => ({ duration: p.duration, months: p.durationInMonths });

/**
 * Under the discount's label, how long it lasts (Unit 8 review F5): "CA$56 off your first month", "CA$56 off a
 * month for your first 3 months", "CA$56 off every month". "" when there is no discount or its period is unknown.
 */
export function discountDuration(p: PromoView | null, price: Pick<MonthlyPreview, "discountCents" | "currency">): string {
  if (!p || price.discountCents <= 0 || discountEnds(termsOf(p)) == null) return "";
  return discountWords(price.discountCents, price.currency, termsOf(p));
}

/**
 * The regular monthly total, before any discount: the plan price plus its tax at the preview's rate (Stripe names
 * the rate of every tax it charges). With the tax still to come, or a discount that leaves nothing taxed (so no
 * rate is known), the plan price and `taxToCome`.
 */
export function fullMonthly(p: MonthlyPreview): { cents: number; taxToCome: boolean } {
  if (p.tax === "pending") return { cents: p.subtotalCents, taxToCome: true };
  if (p.taxRate != null) return { cents: p.subtotalCents + Math.round((p.subtotalCents * p.taxRate) / 100), taxToCome: false };
  if (p.discountCents >= p.subtotalCents) return { cents: p.subtotalCents, taxToCome: true };
  return { cents: p.subtotalCents, taxToCome: false };
}

/** For a discount that ends (once, or for some months): "Then CA$316.40 a month". Null otherwise. */
export function thenLine(p: PromoView | null, price: MonthlyPreview): string | null {
  if (!p || price.discountCents <= 0 || !discountEnds(termsOf(p))) return null;
  const full = fullMonthly(price);
  return thenWords(full.cents, price.currency, full.taxToCome);
}

/** Before a billing address: the tax line's words (origin R16). */
export const TAX_PENDING = "Calculated from your billing address";

/** Stripe could not work out the tax for a valid billing address (the page asks again later). */
export const TAX_UNAVAILABLE = "We couldn’t work out the tax just now. It will be added to your total.";

/** The tax line: its label and its amount ("HST 13%" / CA$36.40; "No sales tax"; or pending). */
export function taxLine(p: MonthlyPreview): { label: string; value: string } {
  if (p.tax === "pending") return { label: "Tax", value: TAX_PENDING };
  if (!p.taxName || p.taxCents === 0) return { label: "No sales tax", value: moneyCents(0, p.currency) };
  const rate = p.taxRate != null ? ` ${Number(p.taxRate.toFixed(3))}%` : "";
  return { label: `${p.taxName}${rate}`, value: moneyCents(p.taxCents, p.currency) };
}

/** "CA$316.40", or "CA$280 + tax" while the tax is still to come. */
export function totalText(p: MonthlyPreview): string {
  return p.tax === "pending" ? `${moneyCents(p.totalCents, p.currency)} + tax` : moneyCents(p.totalCents, p.currency);
}

/**
 * The last line (origin R16). A plain "$0" in both currencies (Peter, 2026-11-26): nothing is
 * charged, so naming the currency adds nothing here. Every other amount still names it (spec A.16 check 5).
 */
export function dueToday(): { lead: string; rest: string } {
  return { lead: "Due today: $0.", rest: "Your first charge comes with your third list." };
}

/** The country picker: Canada and the US (Peter, 2026-11-26), plus "Another country", which only explains. */
export const OTHER_COUNTRY = "other";
export const COUNTRIES: { value: BillingCountry | typeof OTHER_COUNTRY; label: string }[] = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: OTHER_COUNTRY, label: "Another country" },
];

/** The inline message for a postal code, or null when it is fine (CA `A1A 1A1`, US five digits). */
export function postalError(country: string, postal: string): string | null {
  if (country !== "CA" && country !== "US") return null;
  if (!postal.trim()) return country === "CA" ? "Enter your postal code." : "Enter your ZIP code.";
  if (checkBillingLocation(country, postal).ok) return null;
  return country === "CA" ? "Enter a postal code like A1A 1A1." : "Enter a 5-digit ZIP code.";
}

/** The billing fields' inline messages (only the ones with a problem). */
export function billingErrors(f: { name: string; country: string; postal: string }): Partial<Record<"name" | "country" | "postal", string>> {
  const e: Partial<Record<"name" | "country" | "postal", string>> = {};
  if (!f.name.trim()) e.name = "Enter the name on your card.";
  if (f.country === OTHER_COUNTRY) e.country = OUTSIDE_COVERAGE;
  else if (f.country !== "CA" && f.country !== "US") e.country = "Choose your country.";
  else {
    const p = postalError(f.country, f.postal);
    if (p) e.postal = p;
  }
  return e;
}

/** Whether the tax can be asked for (a valid country and postal code). */
export function canQuote(country: string, postal: string): boolean {
  return checkBillingLocation(country, postal).ok;
}
