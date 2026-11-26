/**
 * Every amount the public site shows (plan KTD8, R8): prices, the higher rate,
 * the number of free lists and the days before an unused trial closes. They
 * come from the v3 settings, never from a copy file. Copy names an amount in
 * braces, such as "{monthlyUsd} a month", and fillAmounts puts the value in.
 */
import { cacheLife, cacheTag } from "next/cache";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";
import type { V3Settings } from "@/lib/v3-settings";
import { captionNames } from "./compounding";

export type Currency = "USD" | "CAD";

/**
 * Both currencies, in the order they are shown. A client component takes this
 * as a prop from its server parent: importing it there would pull this file's
 * settings reader into the browser bundle.
 */
export const currencies: readonly Currency[] = ["USD", "CAD"];

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

/**
 * The amounts to show, cached with the settings they come from.
 *
 * It has its own cache with a five-minute client lifetime. The settings
 * reader's is one minute, and Next leaves anything under five minutes out of a
 * route's app shell: a page that awaited the reader directly, outside
 * Suspense, would block navigation and log an "instant" error in development
 * (cacheLife, "Prerendering behavior"). Saving a price in the admin still
 * clears this entry through the "settings" tag.
 */
export async function getAmounts(): Promise<Amounts> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
  cacheTag("settings");
  return amountsFrom(await getV3SettingsForDisplay());
}

/** "US$200" or "CA$280": the dollar sign never appears without its country. */
export function money(currency: Currency, amount: number): string {
  return `${currency === "CAD" ? "CA" : "US"}$${amount.toLocaleString("en-US")}`;
}

/**
 * "US$200 / month USD": the currency code always follows the amount. `per` is
 * the copy's word for the unit. The tax note that goes under a price is copy
 * too: `price.tax` in a version's copy file.
 */
export function priceLine(currency: Currency, amount: number, per: string): string {
  return `${money(currency, amount)} / ${per} ${currency}`;
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
    /** "second", as in "we email you after your second list". */
    lastFreeList: ordinals[a.freeLists - 1] ?? `${a.freeLists}th`,
    /** "21", as in "within 21 days". */
    trialCloseDays: String(a.trialCloseDays),
  };
}

export type AmountName = keyof ReturnType<typeof amountNames>;

/**
 * Replaces each {name} in a line of copy. A name that is not an amount throws,
 * so a misspelt one fails a test instead of reaching a page. The two names of
 * a brick-stack caption, {week} and {bricks}, are left as they are: they are
 * filled per stack, by compoundingCaption.
 */
export function fillAmounts(text: string, amounts: Amounts): string {
  const names: Record<string, string> = amountNames(amounts);
  return text.replace(/\{(\w+)\}/g, (whole: string, name: string) => {
    if (captionNames.includes(name)) return whole;
    if (!Object.hasOwn(names, name)) throw new Error(`Copy names an amount that does not exist: {${name}}`);
    return names[name];
  });
}

/**
 * Fills every string in a copy object, however deep, and returns the same
 * shape. A version's copy file is filled once per page and its blocks are
 * handed finished text.
 */
export function fillCopy<T>(copy: T, amounts: Amounts): T {
  if (typeof copy === "string") return fillAmounts(copy, amounts) as T;
  if (Array.isArray(copy)) return copy.map((item) => fillCopy(item, amounts)) as T;
  if (copy && typeof copy === "object") return Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, fillCopy(value, amounts)])) as T;
  return copy;
}
