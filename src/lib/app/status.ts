import { addDays, torontoDate } from "@/lib/clock";
import { amount, money, moneyCents, taxPhrase, type Currency } from "@/lib/billing/prices";
import { longDate } from "@/lib/mail/templates/welcome";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * The one status line under every Monday list (spec B.8 item 3), built from
 * stored facts and the told quote. The Monday email, `/app` and the week pages
 * all use it, so they always say the same thing.
 */
export type StatusFacts = {
  status: string;
  plan: "monthly" | "per_run";
  sponsored: boolean;
  sharing: "share" | "match_only" | "off";
  currency: Currency | null;
  freeListsUsed: number;
  freeRuns: number;
  /** The told quote for the first charge (monthly trial). */
  quote: { totalCents: number; currency: Currency; week: string } | null;
  firstChargeAt: string | null;
  /** One at a time: what this week's list cost, with tax. */
  orderCents: number | null;
  /** Cancelled: when access ends. */
  accessEndsAt?: string | null;
  now: Date;
};

/** The next monthly anniversary of the first charge, on or after today (Toronto dates). */
export function nextMonthly(firstChargeAt: string, now: Date): string {
  const first = torontoDate(new Date(firstChargeAt));
  const today = torontoDate(now);
  const [y, m, d] = first.split("-").map(Number);
  for (let k = 1; k < 600; k++) {
    const total = m - 1 + k;
    const year = y + Math.floor(total / 12);
    const month = (total % 12) + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const date = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    if (date >= today) return date;
  }
  return addDays(today, 30);
}

export function statusLine(f: StatusFacts, s: V3Settings): string {
  const cur = f.currency ?? "USD";
  const tax = taxPhrase(cur);
  if (f.status === "held") return "Your payment didn’t go through, so your list is waiting. Update your card on the billing page and it comes straight away.";
  if (f.status === "closed") return "Your account is closed. Nothing more will be charged.";
  if (f.status === "cancelled") {
    return f.accessEndsAt
      ? `Your plan is cancelled. Your lists continue until ${longDate(torontoDate(new Date(f.accessEndsAt)))}, and nothing more will be charged.`
      : "Your plan is cancelled, and nothing more will be charged.";
  }
  if (f.sponsored) return "Your lists are covered by your sponsor.";
  if (f.status === "trial") {
    if (f.freeListsUsed === 0) return `Your first ${f.freeRuns} lists are free.`;
    const n = Math.min(f.freeListsUsed, f.freeRuns);
    if (n < f.freeRuns) return `Free list ${n} of ${f.freeRuns}.`;
    if (f.plan === "per_run") return `Free list ${n} of ${f.freeRuns}. Order your next list whenever you want one: ${money(amount(s, "per_run", cur), cur)} ${tax}.`;
    const next = f.quote
      ? `${longDate(f.quote.week)}, ${moneyCents(f.quote.totalCents, f.quote.currency)} with tax`
      : `${money(amount(s, "monthly", cur, f.sharing === "share" ? "standard" : "higher"), cur)} ${tax}`;
    return `Free list ${n} of ${f.freeRuns}. Your next list is your first paid one: ${next}.`;
  }
  if (f.plan === "per_run") {
    const paid = f.orderCents != null ? `${moneyCents(f.orderCents, cur)} with tax` : `${money(amount(s, "per_run", cur), cur)} ${tax}`;
    // Spec B.9: every email to a one-at-a-time user says what monthly costs.
    return `This list: ${paid}. Order next Monday’s whenever you want one. Monthly is ${money(amount(s, "monthly", cur), cur)} for every Monday.`;
  }
  const rate = f.sharing === "share" ? "standard" : "higher";
  const when = f.firstChargeAt ? `Next charge ${longDate(nextMonthly(f.firstChargeAt, f.now))}: ` : "Next charge: ";
  const line = `${when}${money(amount(s, "monthly", cur, rate), cur)} ${tax}.`;
  // The contribution line (spec B.9): Unit 14 adds the month's count.
  return f.sharing === "share"
    ? `${line} Zack’s report each week keeps you at this price.`
    : `${line} With Zack not sharing, this is the rate for members who don’t contribute.`;
}
