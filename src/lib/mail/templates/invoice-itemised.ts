import { moneyCents, type Currency } from "@/lib/billing/prices";
import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/**
 * Spec B.9 notice 5: three days before an invoice that carries a
 * higher-rate adjustment, the full amount, itemised, from Stripe's preview of
 * that invoice (spec check 26: the total matches the invoice).
 */
export function invoiceItemisedEmail(o: {
  invoiceDate: string;
  lines: { description: string; amountCents: number }[];
  taxCents: number;
  totalCents: number;
  currency: Currency;
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
    ],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}
