import { addDays, torontoDate } from "@/lib/clock";
import { amount, money, moneyCents, taxPhrase, type Currency } from "@/lib/billing/prices";
import type { ContributionStatus } from "@/lib/billing/contribution";
import { ONE_AT_A_TIME_NOT_OFFERED, oneAtATimeOffered } from "@/lib/billing/offered";
import { holdDate } from "@/lib/billing/period";
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
  /** The told quote for the first charge (monthly trial; held for a changed amount: the new amount and when it was told). */
  quote: { totalCents: number; currency: Currency; week: string; at?: string } | null;
  /** A monthly renewal Stripe could not collect (first failure), not yet held. */
  renewalFailedAt?: string | null;
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

/** For an account still on one at a time while that plan is not offered: nothing can be ordered, and the billing page offers monthly. */
export const STAYS_ON_ONE_AT_A_TIME = `${ONE_AT_A_TIME_NOT_OFFERED} You can switch to monthly on the billing page; nothing is charged unless you do.`;

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
    return "Your monthly payment didn’t go through, so your Cora Curations are paused. Update your card on the billing page and they start again straight away.";
  }
  if (f.status === "held" && f.holdReason === "amount_changed") return amountChangedLine(f.quote);
  if (f.status === "held") return "Your payment didn’t go through, so your Cora Curation is waiting. Update your card on the billing page and it comes straight away.";
  if (f.status === "closed") return "Your account is closed. Nothing more will be charged.";
  if (f.status === "cancelled") {
    return f.accessEndsAt && new Date(f.accessEndsAt) > f.now
      ? `Your plan is cancelled. Your Cora Curations continue until ${longDate(torontoDate(new Date(f.accessEndsAt)))}, and nothing more will be charged.`
      : "Your plan is cancelled, and nothing more will be charged.";
  }
  if (f.status === "active" && f.endingAt) {
    return new Date(f.endingAt) > f.now
      ? `Your plan is cancelled. Your Cora Curations continue until ${longDate(torontoDate(new Date(f.endingAt)))}, and nothing more will be charged.`
      : "Your plan is cancelled, and nothing more will be charged.";
  }
  if (f.status === "trial" && f.switchedFromPerRun) {
    const next = f.quote ? `${longDate(f.quote.week)} at the earliest, ${moneyCents(f.quote.totalCents, f.quote.currency)} with tax` : `${money(amount(s, "monthly", cur), cur)} ${tax}`;
    return `Monthly starts with your next Cora Curation: ${next}.`;
  }
  if (f.plan === "monthly" && f.switchingAt) {
    return `Monthly continues until ${longDate(torontoDate(new Date(f.switchingAt)))}, with a Cora Curation every Monday. After that you order them one at a time.`;
  }
  if (f.sponsored) return "Your Cora Curations are covered by your sponsor.";
  // An account still on one at a time while that plan is not offered (billing/offered.ts): no order can be placed, and monthly is the way on.
  const offered = oneAtATimeOffered();
  if (f.status === "trial") {
    if (f.freeListsUsed === 0) return `Your first ${f.freeRuns} Cora Curations are free.`;
    const n = Math.min(f.freeListsUsed, f.freeRuns);
    if (n < f.freeRuns) return `Free Cora Curation ${n} of ${f.freeRuns}.`;
    if (f.plan === "per_run" && !offered) return `Free Cora Curation ${n} of ${f.freeRuns}. ${STAYS_ON_ONE_AT_A_TIME}`;
    if (f.plan === "per_run") return `Free Cora Curation ${n} of ${f.freeRuns}. Order your next one whenever you want it: ${money(amount(s, "per_run", cur), cur)} ${tax}.`;
    const next = f.quote
      ? `${longDate(f.quote.week)}, ${moneyCents(f.quote.totalCents, f.quote.currency)} with tax`
      : `${money(amount(s, "monthly", cur, f.sharing === "share" ? "standard" : "higher"), cur)} ${tax}`;
    return `Free Cora Curation ${n} of ${f.freeRuns}. Your next Cora Curation is your first paid one: ${next}.`;
  }
  if (f.plan === "per_run" && !offered) {
    // What an order placed before the option was withdrawn cost, when there is one for this week; then the way on.
    return f.orderCents != null ? `This Cora Curation: ${moneyCents(f.orderCents, cur)} with tax. ${STAYS_ON_ONE_AT_A_TIME}` : STAYS_ON_ONE_AT_A_TIME;
  }
  if (f.plan === "per_run") {
    const paid = f.orderCents != null ? `${moneyCents(f.orderCents, cur)} with tax` : `${money(amount(s, "per_run", cur), cur)} ${tax}`;
    // Spec B.9: every email to a one-at-a-time user says what monthly costs.
    return `This Cora Curation: ${paid}. Order next Monday’s whenever you want one. Monthly is ${money(amount(s, "monthly", cur), cur)} for every Monday.`;
  }
  // A renewal Stripe could not collect: Cora Curations continue for now, and pause on the hold date unless it is paid.
  if (f.status === "active" && f.renewalFailedAt) return `Your payment didn’t go through; Cora Curations pause on ${longDate(holdDate(f.renewalFailedAt))} unless it’s paid.`;
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

/**
 * A first charge held because its amount changed: charged at the first hourly
 * pass 24 hours after the new amount was told (first-charge.ts dueRetries).
 */
export function changedAmountChargeDate(quote: Pick<NonNullable<StatusFacts["quote"]>, "at"> | null): string | null {
  const at = quote?.at ? Date.parse(quote.at) : NaN;
  return Number.isNaN(at) ? null : torontoDate(new Date(at + 24 * 3600_000));
}

function amountChangedLine(quote: StatusFacts["quote"]): string {
  const when = changedAmountChargeDate(quote);
  if (!quote || !when) return "Your first charge amount changed, so your Cora Curation waits a day while we tell you the new amount.";
  return `Your first charge is now ${moneyCents(quote.totalCents, quote.currency)} with tax, not the amount we told you before. We charge it on ${longDate(when)}, and your Cora Curation comes straight after; if you’d rather not, cancel on the billing page before then.`;
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
