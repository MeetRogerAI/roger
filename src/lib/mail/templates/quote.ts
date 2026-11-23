import { moneyCents, type Currency } from "@/lib/billing/prices";
import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

type Amount = { week: string; amountCents: number; currency: Currency };

/** Spec B.13 email 7 (monthly): after the second free list, the date and the exact amount of the first charge. */
export function firstPaidNextEmail(o: Amount): Rendered {
  return renderEmail({
    subject: "Your next list is your first paid one",
    preview: `${moneyCents(o.amountCents, o.currency)}, no earlier than ${longDate(o.week)}.`,
    heading: "Your next list is your first paid one.",
    paragraphs: [
      `Your free lists are done. Your next list follows Zack’s next report, no earlier than ${longDate(o.week)}, and that morning we’ll charge ${moneyCents(o.amountCents, o.currency)}, tax included, for your first month.`,
      "If you’d rather not continue, cancel before then and nothing is charged.",
    ],
    button: { label: "Cancel or change plan", url: appUrl("/app/billing") },
  });
}

/** Spec B.13 email 8: 48 hours before the first charge, the same date and amount. */
export function firstChargeReminderEmail(o: Amount): Rendered {
  return renderEmail({
    subject: "Your first charge could be on Monday",
    preview: `${moneyCents(o.amountCents, o.currency)}, no earlier than ${longDate(o.week)}.`,
    heading: "Your first charge could be on Monday.",
    paragraphs: [
      `If Zack’s report arrives by Sunday night, your third list comes on ${longDate(o.week)} and we’ll charge ${moneyCents(o.amountCents, o.currency)}, tax included, for your first month. If it doesn’t, nothing is charged and we’ll tell you the next date.`,
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
