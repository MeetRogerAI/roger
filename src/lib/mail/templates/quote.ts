import { discountEnds, discountWords, type DiscountTerms } from "@/lib/billing/discount-words";
import { moneyCents, type Currency } from "@/lib/billing/prices";
import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

type Amount = { week: string; amountCents: number; currency: Currency };
/**
 * The promo locked in at card save: its label, the amount it takes off the first charge, how long it lasts, and
 * (for one that ends) the monthly amount after it, tax included.
 */
export type DiscountLine = ({ label: string; amountCents: number; thenCents?: number | null } & Partial<DiscountTerms>) | null;

/**
 * The discount line, when a locked-in promo applies to the first charge (plan 2026-11-26-001, Unit 8): "That
 * includes your promo code LABEL: CA$56 off your first month. After that, it’s CA$316.40 a month, tax included."
 * The period only when the coupon's duration is known; the amount after only for a discount that ends. Drafted
 * copy for Peter's sign-off (S18).
 */
export const discountLine = (d: DiscountLine | undefined, currency: Currency): string[] => {
  if (!d || d.amountCents <= 0) return [];
  const terms: DiscountTerms = { duration: d.duration ?? null, months: d.months ?? null };
  const after = discountEnds(terms) && d.thenCents != null ? ` After that, it’s ${moneyCents(d.thenCents, currency)} a month, tax included.` : "";
  return [`That includes your promo code ${d.label}: ${discountWords(d.amountCents, currency, terms)}.${after}`];
};

/** Spec B.13 email 7 (monthly): after the second free list, the date and the exact amount of the first charge. */
export function firstPaidNextEmail(o: Amount & { discount?: DiscountLine }): Rendered {
  return renderEmail({
    subject: "Your next list is your first paid one",
    preview: `${moneyCents(o.amountCents, o.currency)}, no earlier than ${longDate(o.week)}.`,
    heading: "Your next list is your first paid one.",
    paragraphs: [
      `Your free lists are done. Your next list follows Zack’s next report, no earlier than ${longDate(o.week)}, and that morning we’ll charge ${moneyCents(o.amountCents, o.currency)}, tax included, for your first month.`,
      ...discountLine(o.discount, o.currency),
      "If you’d rather not continue, cancel before then and nothing is charged.",
    ],
    button: { label: "Cancel or change plan", url: appUrl("/app/billing") },
  });
}

/** Spec B.13 email 8: 48 hours before the first charge, the same date and amount. */
export function firstChargeReminderEmail(o: Amount & { discount?: DiscountLine }): Rendered {
  return renderEmail({
    subject: "Your first charge could be on Monday",
    preview: `${moneyCents(o.amountCents, o.currency)}, no earlier than ${longDate(o.week)}.`,
    heading: "Your first charge could be on Monday.",
    paragraphs: [
      `If Zack’s report arrives by Sunday night, your third list comes on ${longDate(o.week)} and we’ll charge ${moneyCents(o.amountCents, o.currency)}, tax included, for your first month. If it doesn’t, nothing is charged and we’ll tell you the next date.`,
      ...discountLine(o.discount, o.currency),
      "To stop, cancel before then and nothing is charged.",
    ],
    button: { label: "Cancel or change plan", url: appUrl("/app/billing") },
  });
}

/** A change (sharing, plan, currency, address) moved the first charge's amount: the new amount before it happens. */
export function quoteChangedEmail(o: Amount): Rendered {
  return renderEmail({
    subject: "Your first charge amount changed",
    preview: `Now ${moneyCents(o.amountCents, o.currency)}.`,
    heading: "Your first charge amount changed.",
    paragraphs: [`After your change, your first charge, no earlier than ${longDate(o.week)}, will be ${moneyCents(o.amountCents, o.currency)}, tax included.`],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}
