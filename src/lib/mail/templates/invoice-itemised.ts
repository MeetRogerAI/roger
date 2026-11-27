import { creditParagraph, type DisplayCredit } from "@/lib/billing/credit-lines";
import { moneyCents, type Currency } from "@/lib/billing/prices";
import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

/**
 * Spec B.9 notice 5: three days before an invoice that carries a
 * higher-rate adjustment, the full amount, itemised, from Stripe's preview of
 * that invoice (spec check 26: the total matches the invoice). Referral
 * credit (B2 plan Unit 5) follows the total as "Credit applied · Card
 * charged", from the balance when the email is sent.
 */
export function invoiceItemisedEmail(o: {
  invoiceDate: string;
  lines: { description: string; amountCents: number }[];
  taxCents: number;
  totalCents: number;
  currency: Currency;
  credit?: DisplayCredit;
}): Rendered {
  const items = o.lines.map((l) => `${l.description || "Roger"}: ${moneyCents(l.amountCents, o.currency)}`);
  if (o.taxCents > 0) items.push(`Tax: ${moneyCents(o.taxCents, o.currency)}`);
  return renderEmail({
    subject: `Your invoice of ${longDate(o.invoiceDate)}, itemised`,
    preview: `${moneyCents(o.totalCents, o.currency)} in total.`,
    heading: "Your next invoice, itemised.",
    paragraphs: [
      `On ${longDate(o.invoiceDate)} we’ll charge ${moneyCents(o.totalCents, o.currency)}. It includes a higher-rate adjustment for a billing month. Here is every line:`,
      ...items,
      `Total: ${moneyCents(o.totalCents, o.currency)}`,
      ...creditParagraph(o.totalCents, o.currency, o.credit ?? null),
    ],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}
