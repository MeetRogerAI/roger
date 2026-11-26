/**
 * Every amount the public site shows (plan KTD8, R8): prices, the higher rate,
 * the number of free lists and the days before an unused trial closes. They
 * come from the v3 settings, never from a copy file. Copy names an amount in
 * braces, such as "{monthlyUsd} a month", and fillAmounts puts the value in.
 */
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";
import type { V3Settings } from "@/lib/v3-settings";

export type Currency = "USD" | "CAD";

export type Amounts = {
  /** Monthly price, before tax. */
  monthly: Record<Currency, number>;
  /** One list at a time, before tax. */
  list: Record<Currency, number>;
  /** The monthly rate with sharing off, or after a second missed week. */
  higher: Record<Currency, number>;
  /** Lists delivered before any charge. */
  freeLists: number;
  /** Days a trial with no first list stays open. */
  trialCloseDays: number;
};

type AmountSettings = Pick<V3Settings, "priceUsd" | "priceCad" | "priceRunUsd" | "priceRunCad" | "priceHigherUsd" | "priceHigherCad" | "freeRuns" | "trialCloseDays">;

export function amountsFrom(s: AmountSettings): Amounts {
  return {
    monthly: { USD: s.priceUsd, CAD: s.priceCad },
    list: { USD: s.priceRunUsd, CAD: s.priceRunCad },
    higher: { USD: s.priceHigherUsd, CAD: s.priceHigherCad },
    freeLists: s.freeRuns,
    trialCloseDays: s.trialCloseDays,
  };
}

/** The amounts to show, cached with the settings they come from. */
export async function getAmounts(): Promise<Amounts> {
  return amountsFrom(await getV3SettingsForDisplay());
}

/** "US$200" or "CA$280": the dollar sign never appears without its country. */
export function money(currency: Currency, amount: number): string {
  return `${currency === "CAD" ? "CA" : "US"}$${amount.toLocaleString("en-US")}`;
}

/** "US$200 / month USD": the currency code always follows the amount. `per` is the copy's word for the unit. */
export function priceLine(currency: Currency, amount: number, per: string): string {
  return `${money(currency, amount)} / ${per} ${currency}`;
}

/** The note beside a price. Prices are shown before tax. */
export function taxNote(currency: Currency): string {
  return currency === "CAD" ? "plus HST" : "plus tax where it applies";
}

/** The default for a visitor's country, from the x-vercel-ip-country header. */
export function currencyForCountry(country: string | null | undefined): Currency {
  return country?.trim().toUpperCase() === "CA" ? "CAD" : "USD";
}

/** True when text shows a "$" without "US" or "CA" in front of it. */
export function hasBareDollar(text: string): boolean {
  return /(?<!US|CA)\$/.test(text);
}

// The settings allow up to ten free lists, so the first paid one is at most the eleventh.
const cardinals = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh"];

/** The names copy may use, with the text each stands for. */
export function amountNames(a: Amounts) {
  return {
    monthlyUsd: money("USD", a.monthly.USD),
    monthlyCad: money("CAD", a.monthly.CAD),
    listUsd: money("USD", a.list.USD),
    listCad: money("CAD", a.list.CAD),
    higherUsd: money("USD", a.higher.USD),
    higherCad: money("CAD", a.higher.CAD),
    /** "two", as in "two free Monday lists". */
    freeLists: cardinals[a.freeLists] ?? String(a.freeLists),
    /** "third", as in "charged with your third list". */
    firstPaidList: ordinals[a.freeLists] ?? `${a.freeLists + 1}th`,
    /** "21", as in "within 21 days". */
    trialCloseDays: String(a.trialCloseDays),
  };
}

export type AmountName = keyof ReturnType<typeof amountNames>;

/**
 * Replaces each {name} in a line of copy. A name that is not an amount throws,
 * so a misspelt one fails a test instead of reaching a page.
 */
export function fillAmounts(text: string, amounts: Amounts): string {
  const names: Record<string, string> = amountNames(amounts);
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!Object.hasOwn(names, name)) throw new Error(`Copy names an amount that does not exist: {${name}}`);
    return names[name];
  });
}
