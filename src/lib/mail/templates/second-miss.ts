import { appUrl, renderEmail, type Rendered } from "../layout";
import { MISSED_FIX } from "./missed-forgiven";
import { longDate } from "./welcome";

type Owed = { higher: string; difference: string; invoiceDate: string };
/** For an email: when the month it is owed for has already ended, it is named instead of "this month". */
type OwedMail = Owed & { ended?: { periodEnd: string } | null };

/** Spec B.9 notice 4 (the second miss): this month at the higher rate, with the fix and the option to switch plans. */
export function secondMissText(o: Owed): string {
  return `This is your second missed week this month, so this month is billed at ${o.higher}. The difference of ${o.difference} will be on your invoice of ${longDate(o.invoiceDate)}.`;
}

/** A Sunday cutoff found sharing off: that month is billed at the higher rate. */
export function notSharingText(o: Owed): string {
  return `Zack wasn’t sharing at a Sunday cutoff this month, so this month is billed at ${o.higher}. The difference of ${o.difference} will be on your invoice of ${longDate(o.invoiceDate)}.`;
}

/** Either, once a new billing month has started: worded from the month it was owed for. */
export function carriedMissText(o: Owed & { periodEnd: string; reason: "two_misses" | "not_sharing" }): string {
  const why = o.reason === "not_sharing" ? "a Sunday cutoff with Zack not sharing" : "two missed weeks";
  return `Your billing month to ${longDate(o.periodEnd)} had ${why}, so it is billed at ${o.higher}. The difference of ${o.difference} will be on your invoice of ${longDate(o.invoiceDate)}.`;
}

export function secondMissEmail(o: OwedMail): Rendered {
  return renderEmail({
    subject: o.ended ? "Two missed weeks in your last billing month" : "Your second missed week this month",
    preview: `${o.ended ? "That month" : "This month"} is billed at ${o.higher}.`,
    heading: o.ended ? `Zack missed two weeks in your billing month to ${longDate(o.ended.periodEnd)}.` : "Zack missed a second week this month.",
    paragraphs: [
      o.ended ? carriedMissText({ ...o, periodEnd: o.ended.periodEnd, reason: "two_misses" }) : secondMissText(o),
      MISSED_FIX,
      `If a weekly report doesn’t suit you, you can switch to one list at a time on the billing page (${appUrl("/app/billing")}). If you cancel before that invoice, the difference isn’t collected.`,
    ],
    button: { label: "Check Zack", url: appUrl("/app/zack") },
  });
}

/** The first time a month owes the difference because sharing was off at a cutoff (the sharing confirmation already said the price). */
export function notSharingMonthEmail(o: OwedMail): Rendered {
  return renderEmail({
    subject: o.ended ? "Your last billing month is billed at the higher rate" : "This month is billed at the higher rate",
    preview: `${o.difference} on your invoice of ${longDate(o.invoiceDate)}.`,
    heading: o.ended ? "Your last billing month is billed at the higher rate." : "This month is billed at the higher rate.",
    paragraphs: [
      o.ended ? carriedMissText({ ...o, periodEnd: o.ended.periodEnd, reason: "not_sharing" }) : notSharingText(o),
      "Months with sharing on at every Sunday cutoff stay at the standard price. You can change sharing on the Zack page.",
    ],
    button: { label: "Zack settings", url: appUrl("/app/zack") },
  });
}
