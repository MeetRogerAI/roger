import { describe, expect, it } from "vitest";
import { amountChangedEmail, subscribedEmail } from "@/lib/mail/templates/charges";
import { invoiceItemisedEmail } from "@/lib/mail/templates/invoice-itemised";
import { firstChargeReminderEmail, firstPaidNextEmail, quoteChangedEmail } from "@/lib/mail/templates/quote";
import { CREDIT_AS_SENT, creditLeftText, creditLines, creditLinesFromInvoice, creditLineText, creditParagraph, invoiceCreditCents, moneyExact, usableCredit } from "./credit-lines";
import type { MonthlyPreview } from "./gateway";
import { creditRows } from "./payment-view";

/** B2 plan Unit 5: referral credit in every B1 charge display. */

const cad = (cents: number) => ({ cents, currency: "CAD" as const });

describe("creditLines", () => {
  it("CA$280 credit against CA$316.40: CA$280 applied, CA$36.40 to the card", () => {
    const l = creditLines(31640, "CAD", cad(28000));
    expect(l).toEqual({ totalCents: 31640, creditAppliedCents: 28000, cardChargedCents: 3640, creditLeftCents: 0 });
    expect(creditLineText(l, "CAD")).toBe("Credit applied −CA$280.00 · Card charged CA$36.40");
  });

  it("credit above the total: the card is charged CA$0.00 and the rest stays", () => {
    const l = creditLines(31640, "CAD", cad(50000));
    expect(l).toEqual({ totalCents: 31640, creditAppliedCents: 31640, cardChargedCents: 0, creditLeftCents: 18360 });
    expect(creditLineText(l, "CAD")).toBe("Credit applied −CA$316.40 · Card charged CA$0.00");
  });

  it.each([
    ["no credit", null],
    ["zero credit", cad(0)],
    ["credit in the other currency", { cents: 28000, currency: "USD" as const }],
  ])("%s: nothing applied and no line", (_, credit) => {
    const l = creditLines(31640, "CAD", credit);
    expect(l).toEqual({ totalCents: 31640, creditAppliedCents: 0, cardChargedCents: 31640, creditLeftCents: 0 });
    expect(creditLineText(l, "CAD")).toBeNull();
    expect(creditParagraph(31640, "CAD", credit)).toEqual([]);
  });

  it("a total of 0 (a promo covering the month) uses no credit", () => {
    expect(creditLines(0, "USD", { cents: 5000, currency: "USD" })).toMatchObject({ creditAppliedCents: 0, cardChargedCents: 0 });
  });

  it("money with two decimals", () => {
    expect(moneyExact(28000, "CAD")).toBe("CA$280.00");
    expect(moneyExact(3640, "USD")).toBe("US$36.40");
  });
});

describe("usableCredit: only a balance read after the last charge", () => {
  const asOf = new Date("2026-12-10T12:00:00Z");
  it("never read, no currency or nothing on it: null", () => {
    expect(usableCredit(null, null)).toBeNull();
    expect(usableCredit({ cents: 28000, currency: null, asOf }, null)).toBeNull();
    expect(usableCredit({ cents: 0, currency: "CAD", asOf }, null)).toBeNull();
  });
  it("read before the last charge (it may have been spent): null; after it, or with no charge yet: the credit", () => {
    expect(usableCredit({ cents: 28000, currency: "CAD", asOf }, new Date("2026-12-14T11:05:00Z"))).toBeNull();
    // The charge's own invoice, finalized seconds before Roger records the charge: still that invoice's balance.
    expect(usableCredit({ cents: 28000, currency: "CAD", asOf: new Date("2026-12-14T11:04:50Z") }, new Date("2026-12-14T11:05:00Z"))).not.toBeNull();
    expect(usableCredit({ cents: 28000, currency: "CAD", asOf }, new Date("2026-12-01T11:05:00Z"))).toEqual({ cents: 28000, currency: "CAD", asOf });
    expect(usableCredit({ cents: 28000, currency: "CAD", asOf }, null)).toEqual({ cents: 28000, currency: "CAD", asOf });
  });
});

describe("invoiceCreditCents: a paid invoice's real figures", () => {
  it.each([
    ["credit used in full", -28000, 0, 28000],
    ["credit above the invoice", -50000, -18360, 31640],
    ["no balance", 0, 0, 0],
    ["a debt collected is not credit", 500, 0, 0],
    ["not finalized yet", -28000, null, 0],
  ])("%s", (_, start, end, applied) => {
    expect(invoiceCreditCents({ starting_balance: start, ending_balance: end })).toBe(applied);
  });
});

describe("the emails with credit", () => {
  const week = "2026-12-14";
  it("the 48-hour email: the total, then the credit line and that it is the balance at sending", () => {
    const m = firstChargeReminderEmail({ week, amountCents: 31640, currency: "CAD", credit: cad(28000) });
    expect(m.text).toContain("we’ll charge CA$316.40, tax included, for your first month.");
    expect(m.text).toContain(`Credit applied −CA$280.00 · Card charged CA$36.40. ${CREDIT_AS_SENT}`);
    expect(m.html).toContain("Credit applied −CA$280.00 · Card charged CA$36.40");
  });

  it("credit above the total: CA$0.00 charged and the rest named", () => {
    const m = firstChargeReminderEmail({ week, amountCents: 31640, currency: "CAD", credit: cad(50000) });
    expect(m.text).toContain("Credit applied −CA$316.40 · Card charged CA$0.00. CA$183.60 of credit stays on your balance.");
  });

  it("the second-list, quote-changed, amount-changed and itemised emails carry the line", () => {
    for (const m of [
      firstPaidNextEmail({ week, amountCents: 31640, currency: "CAD", credit: cad(28000) }),
      quoteChangedEmail({ week, amountCents: 31640, currency: "CAD", credit: cad(28000) }),
      amountChangedEmail({ amountCents: 31640, currency: "CAD", credit: cad(28000) }),
      invoiceItemisedEmail({ invoiceDate: "2027-01-03", lines: [{ description: "Roger", amountCents: 28000 }], taxCents: 3640, totalCents: 31640, currency: "CAD", credit: cad(28000) }),
    ]) {
      expect(m.text).toContain("Credit applied −CA$280.00 · Card charged CA$36.40.");
      expect(m.text).toContain(CREDIT_AS_SENT);
    }
  });

  it("credit in another currency changes nothing", () => {
    const a = firstChargeReminderEmail({ week, amountCents: 31640, currency: "CAD", credit: { cents: 28000, currency: "USD" } });
    expect(a.text).toBe(firstChargeReminderEmail({ week, amountCents: 31640, currency: "CAD" }).text);
  });

  it("the subscribed email uses the paid invoice's figures", () => {
    expect(subscribedEmail({ amountCents: 3640, currency: "CAD", creditAppliedCents: 28000 }).text).toContain(
      "Your first month is CA$316.40, tax included. Credit applied −CA$280.00 · Card charged CA$36.40. Your third list is ready now",
    );
    const all = subscribedEmail({ amountCents: 0, currency: "CAD", creditAppliedCents: 31640 }).text;
    expect(all).toContain("Your first month is CA$316.40, tax included, and your referral credit covered all of it. Credit applied −CA$316.40 · Card charged CA$0.00.");
    expect(all).not.toContain("promo code");
    expect(subscribedEmail({ amountCents: 31640, currency: "CAD", creditAppliedCents: 0 }).text).toBe(subscribedEmail({ amountCents: 31640, currency: "CAD" }).text);
  });
});

describe("the Price Box's credit rows", () => {
  const ontario: MonthlyPreview = { currency: "CAD", subtotalCents: 28000, discountCents: 0, tax: "calculated", taxCents: 3640, taxName: "HST", taxRate: 13, totalCents: 31640 };
  it("in the balance's currency, once the tax is known, with the month after it", () => {
    expect(creditRows(ontario, cad(28000))).toEqual({
      credit: { label: "Credit applied to your first charge", value: "−CA$280.00" },
      card: { label: "Card charged then", value: "CA$36.40" },
      then: "Then CA$316.40 a month",
    });
    expect(creditRows(ontario, cad(50000))).toMatchObject({ credit: { value: "−CA$316.40" }, card: { value: "CA$0.00" } });
  });
  it("credit exactly equal to the total: all of it applied, CA$0.00 to the card, nothing left", () => {
    expect(creditRows(ontario, cad(31640))).toMatchObject({ credit: { value: "−CA$316.40" }, card: { value: "CA$0.00" } });
    const l = creditLines(31640, "CAD", cad(31640));
    expect(l).toEqual({ totalCents: 31640, creditAppliedCents: 31640, cardChargedCents: 0, creditLeftCents: 0 });
    expect(creditLeftText(l, "CAD")).toBeNull();
  });
  it("a promo that ends plus credit above the discounted total: the promo's own Then line stays, and the rest of the credit is named", () => {
    const promo = { code: "A", label: "A", duration: "once" as const, durationInMonths: null, percentOff: 20, amountOffCents: null };
    const discounted: MonthlyPreview = { ...ontario, discountCents: 5600, taxCents: 2912, totalCents: 25312 };
    expect(creditRows(discounted, cad(28000), promo)).toEqual({
      credit: { label: "Credit applied to your first charge", value: "−CA$253.12" },
      card: { label: "Card charged then", value: "CA$0.00" },
      then: null,
    });
    expect(creditParagraph(25312, "CAD", cad(28000))[0]).toContain("Credit applied −CA$253.12 · Card charged CA$0.00. CA$26.88 of credit stays on your balance.");
  });
  it("none when the toggle shows the other currency, the tax is to come, or there is no credit", () => {
    expect(creditRows({ ...ontario, currency: "USD", subtotalCents: 20000, totalCents: 20000 }, cad(28000))).toBeNull();
    expect(creditRows({ ...ontario, tax: "pending", taxCents: 0, taxName: null, taxRate: null, totalCents: 28000 }, cad(28000))).toBeNull();
    expect(creditRows(ontario, null)).toBeNull();
    expect(creditRows(ontario, undefined)).toBeNull();
  });
});

describe("credit lines from an invoice's own figures", () => {
  it("paid reads Card charged; open reads Card due", () => {
    const l = creditLinesFromInvoice(31640, 28000, 3640);
    expect(creditLineText(l, "CAD")).toBe("Credit applied −CA$280.00 · Card charged CA$36.40");
    expect(creditLineText(l, "CAD", { due: true })).toBe("Credit applied −CA$280.00 · Card due CA$36.40");
    expect(creditLineText(creditLinesFromInvoice(31640, 0, 31640), "CAD")).toBeNull();
  });
});
