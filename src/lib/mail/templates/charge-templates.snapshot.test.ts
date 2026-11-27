import { describe, expect, it } from "vitest";
import { amountChangedEmail, subscribedEmail } from "./charges";
import { invoiceItemisedEmail } from "./invoice-itemised";
import { firstChargeReminderEmail, firstPaidNextEmail, quoteChangedEmail } from "./quote";

/**
 * B2 plan Unit 5: with no referral credit, every charge email is exactly what B1 sent. The snapshots were written
 * from the templates as they were before Unit 5 (B1), so a change to the no-credit output fails here.
 */
describe("charge emails with no credit are unchanged", () => {
  const discount = { label: "Launch 20%", amountCents: 5600, duration: "once" as const, months: null, thenCents: 31640 };
  it.each([
    ["second list", () => firstPaidNextEmail({ week: "2026-12-14", amountCents: 31640, currency: "CAD" })],
    ["second list, with a discount", () => firstPaidNextEmail({ week: "2026-12-14", amountCents: 25312, currency: "CAD", discount })],
    ["48-hour", () => firstChargeReminderEmail({ week: "2026-12-14", amountCents: 31640, currency: "CAD" })],
    ["48-hour, with a discount", () => firstChargeReminderEmail({ week: "2026-12-14", amountCents: 25312, currency: "CAD", discount })],
    ["quote changed", () => quoteChangedEmail({ week: "2026-12-14", amountCents: 22600, currency: "USD" })],
    ["amount changed", () => amountChangedEmail({ amountCents: 31640, currency: "CAD", discountEnded: "Launch 20%" })],
    ["subscribed", () => subscribedEmail({ amountCents: 31640, currency: "CAD" })],
    ["subscribed, promo covered it", () => subscribedEmail({ amountCents: 0, currency: "USD", switched: true })],
    ["subscribed, amount unknown", () => subscribedEmail({ amountCents: null, currency: "USD" })],
    [
      "itemised",
      () =>
        invoiceItemisedEmail({
          invoiceDate: "2027-01-03",
          lines: [
            { description: "Roger monthly", amountCents: 28000 },
            { description: "Higher-rate difference", amountCents: 28000 },
          ],
          taxCents: 7280,
          totalCents: 63280,
          currency: "CAD",
        }),
    ],
  ])("%s", (_, make) => {
    const m = make();
    expect({ subject: m.subject, text: m.text, html: m.html }).toMatchSnapshot();
  });
});
