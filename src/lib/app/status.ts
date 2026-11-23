import { addDays, torontoDate } from "@/lib/clock";
import { amount, money, moneyCents, taxPhrase, type Currency } from "@/lib/billing/prices";
import type { ContributionStatus } from "@/lib/billing/contribution";
import { forgivenText } from "@/lib/mail/templates/missed-forgiven";
import { carriedMissText, notSharingText, secondMissText } from "@/lib/mail/templates/second-miss";
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
  /** Monthly and sharing: the month's misses and any adjustment (contribution.ts). */
  contribution?: ContributionStatus | null;
  /** Held: why (a renewal unpaid reads differently from a first charge). */
  holdReason?: string | null;
  /** A monthly member switching to one at a time: when the paid month ends. */
  switchingAt?: string | null;
  /** A monthly member who cancelled (still active until the subscription ends): when the paid month ends. */
  endingAt?: string | null;
  /** A paying one-at-a-time member who switched to monthly and awaits the first charge (status trial, but not a trial). */
  switchedFromPerRun?: boolean;
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
  if (f.status === "held" && f.holdReason === "renewal_unpaid") {
    return "Your monthly payment didn’t go through, so your lists are paused. Update your card on the billing page and they start again straight away.";
  }
  if (f.status === "held") return "Your payment didn’t go through, so your list is waiting. Update your card on the billing page and it comes straight away.";
  if (f.status === "closed") return "Your account is closed. Nothing more will be charged.";
  if (f.status === "cancelled") {
    return f.accessEndsAt && new Date(f.accessEndsAt) > f.now
      ? `Your plan is cancelled. Your lists continue until ${longDate(torontoDate(new Date(f.accessEndsAt)))}, and nothing more will be charged.`
      : "Your plan is cancelled, and nothing more will be charged.";
  }
  if (f.status === "active" && f.endingAt) {
    return new Date(f.endingAt) > f.now
      ? `Your plan is cancelled. Your lists continue until ${longDate(torontoDate(new Date(f.endingAt)))}, and nothing more will be charged.`
      : "Your plan is cancelled, and nothing more will be charged.";
  }
  if (f.status === "trial" && f.switchedFromPerRun) {
    const next = f.quote ? `${longDate(f.quote.week)} at the earliest, ${moneyCents(f.quote.totalCents, f.quote.currency)} with tax` : `${money(amount(s, "monthly", cur), cur)} ${tax}`;
    return `Monthly starts with your next list: ${next}.`;
  }
  if (f.plan === "monthly" && f.switchingAt) {
    return `Monthly continues until ${longDate(torontoDate(new Date(f.switchingAt)))}, with a list every Monday. After that you order lists one at a time.`;
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
  const c = f.contribution ?? null;
  const higher = money(amount(s, "monthly", cur, "higher"), cur);
  // The renewal ending this billing month (from the subscription's anchor), else the first charge's anniversary.
  // The subscription is always at the standard price; a month's higher-rate difference is its own invoice line.
  const next = c?.periodEnd ?? (f.firstChargeAt ? nextMonthly(f.firstChargeAt, f.now) : null);
  const line = `${next ? `Next charge ${longDate(next)}: ` : "Next charge: "}${money(amount(s, "monthly", cur), cur)} ${tax}.`;
  // A cancellation is scheduled: the contributor rule no longer applies.
  if (c?.cancelling) return line;
  // The contribution line (spec B.9 notices 2 to 4).
  const adjustment = adjustmentLine(c, s, cur);
  if (adjustment && c?.adjustment?.current) return adjustment;
  const lead = adjustment ? `${adjustment} ` : "";
  // This month was already billed at the higher rate (the first month, charged up front): nothing more can be added to it.
  if (c?.alreadyBilled) return `${lead}This month is already billed at ${higher}. ${line}`;
  if (f.sharing !== "share") return `${lead}${line} ${SHARING_OFF(higher)}`;
  if (c?.missedThisWeek && c.missed > 0 && c.missed <= c.allowed) return `${lead}${forgivenText({ periodEnd: c.periodEnd, higher })} ${line}`;
  return `${lead}Contributing. This month: ${c?.used ?? 0} of ${c?.allowed ?? s.forgivenMissesPerMonth} forgiven misses used. ${line}`;
}

/** What sharing off means under the contributor rule (the strip, and the sharing confirmation on /app/zack). */
export const SHARING_OFF = (higher: string) => `With sharing off at a Sunday cutoff, that month is billed at ${higher}; the difference is added to your next invoice.`;

/**
 * Notice 4, or the not-sharing notice, for a month's difference still to be
 * invoiced (the strip and the /app banner): this month's wording, or, once a
 * new month has started, worded from the month it is owed for.
 */
export function adjustmentLine(c: ContributionStatus | null | undefined, s: V3Settings, cur: Currency): string | null {
  if (!c?.adjustment || c.cancelling) return null;
  const a = c.adjustment;
  const o = { higher: money(amount(s, "monthly", cur, "higher"), cur), difference: moneyCents(a.amountCents, a.currency), invoiceDate: a.invoiceDate };
  if (!a.current) return carriedMissText({ ...o, periodEnd: a.periodEnd, reason: a.reason });
  return a.reason === "not_sharing" ? notSharingText(o) : secondMissText(o);
}
