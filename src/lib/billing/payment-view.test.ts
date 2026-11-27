import { describe, expect, it } from "vitest";
import type { MonthlyPreview } from "./gateway";
import { basePreview, billingErrors, canQuote, discountDuration, dueToday, fullMonthly, postalError, taxLine, thenLine, totalText } from "./payment-view";

/** Plan 2026-11-26-001, Unit 6: the Payment page's words and sums. */

describe("billing location messages (inline, on blur)", () => {
  it.each([
    ["CA", "M5V 2T6", null],
    ["CA", "m5v2t6", null],
    ["CA", "", "Enter your postal code."],
    ["CA", "12345", "Enter a postal code like A1A 1A1."],
    ["CA", "D5V 2T6", "Enter a postal code like A1A 1A1."],
    ["US", "10001", null],
    ["US", "", "Enter your ZIP code."],
    ["US", "1000", "Enter a 5-digit ZIP code."],
    ["US", "10001-1234", "Enter a 5-digit ZIP code."],
  ])("%s %s → %s", (country, postal, message) => {
    expect(postalError(country, postal)).toBe(message);
    expect(canQuote(country, postal)).toBe(message === null);
  });

  it("names every field with a problem; another country is told Roger is in Canada and the US for now", () => {
    expect(billingErrors({ name: " ", country: "CA", postal: "x" })).toEqual({ name: "Enter the name on your card.", postal: "Enter a postal code like A1A 1A1." });
    expect(billingErrors({ name: "Ana", country: "other", postal: "" })).toEqual({ country: "Roger is available in Canada and the US for now." });
    expect(billingErrors({ name: "Ana", country: "US", postal: "10001" })).toEqual({});
  });
});

describe("price lines", () => {
  it("the plan price before an address, with a percent or amount discount (never below zero)", () => {
    expect(basePreview("CAD", 28000, null)).toMatchObject({ discountCents: 0, tax: "pending", totalCents: 28000 });
    const pct = { code: "A", label: "A", duration: "forever" as const, durationInMonths: null, percentOff: 25, amountOffCents: null };
    expect(basePreview("CAD", 28000, pct)).toMatchObject({ discountCents: 7000, totalCents: 21000 });
    expect(basePreview("USD", 20000, { ...pct, percentOff: null, amountOffCents: 50000 })).toMatchObject({ discountCents: 20000, totalCents: 0 });
    expect(basePreview("USD", 20000, { ...pct, percentOff: null })).toMatchObject({ discountCents: 0 });
    expect(totalText(basePreview("CAD", 28000, null))).toBe("CA$280 + tax");
  });

  it("names the tax and its rate; Quebec reads GST only; no tax reads 'No sales tax'", () => {
    expect(taxLine({ currency: "CAD", subtotalCents: 28000, discountCents: 0, tax: "calculated", taxCents: 1400, taxName: "GST", taxRate: 5, totalCents: 29400 })).toEqual({ label: "GST 5%", value: "CA$14" });
    expect(taxLine({ currency: "USD", subtotalCents: 20000, discountCents: 0, tax: "calculated", taxCents: 0, taxName: null, taxRate: null, totalCents: 20000 })).toEqual({ label: "No sales tax", value: "US$0" });
    expect(taxLine(basePreview("CAD", 28000, null))).toEqual({ label: "Tax", value: "Calculated from your billing address" });
  });

  // Unit 8 review F5: the period and amount, and the regular amount after a discount that ends.
  describe("words each discount duration honestly", () => {
    const p = { code: "A", label: "A", duration: "once" as const, durationInMonths: null, percentOff: 20, amountOffCents: null };
    // CA$280 less 20% = CA$224, HST 13% = CA$29.12, total CA$253.12; the regular month is CA$316.40.
    const on: MonthlyPreview = { currency: "CAD", subtotalCents: 28000, discountCents: 5600, tax: "calculated", taxCents: 2912, taxName: "HST", taxRate: 13, totalCents: 25312 };
    it.each([
      ["once", null, "CA$56 off your first month", "Then CA$316.40 a month"],
      ["repeating", 1, "CA$56 off your first month", "Then CA$316.40 a month"],
      ["repeating", 3, "CA$56 off a month for your first 3 months", "Then CA$316.40 a month"],
      ["forever", null, "CA$56 off every month", null],
      [null, null, "", null],
    ] as const)("%s %s → %s / %s", (duration, months, words, then) => {
      const promo = { ...p, duration, durationInMonths: months };
      expect(discountDuration(promo, on)).toBe(words);
      expect(thenLine(promo, on)).toBe(then);
    });

    it("before an address the amount after reads '+ tax'; the US has none; nothing without a discount", () => {
      expect(thenLine(p, basePreview("CAD", 28000, p))).toBe("Then CA$280 + tax a month");
      const us: MonthlyPreview = { currency: "USD", subtotalCents: 20000, discountCents: 4000, tax: "calculated", taxCents: 0, taxName: null, taxRate: null, totalCents: 16000 };
      expect(thenLine(p, us)).toBe("Then US$200 a month");
      expect(discountDuration(p, { ...on, discountCents: 0 })).toBe("");
      expect(thenLine(p, { ...on, discountCents: 0 })).toBeNull();
      expect(thenLine(null, on)).toBeNull();
    });

    it("a first month free (discount = the price): no tax is charged, so the regular month reads '+ tax'", () => {
      const free: MonthlyPreview = { ...on, discountCents: 28000, taxCents: 0, taxName: null, taxRate: null, totalCents: 0 };
      expect(discountDuration({ ...p, percentOff: 100 }, free)).toBe("CA$280 off your first month");
      expect(fullMonthly(free)).toEqual({ cents: 28000, taxToCome: true });
      expect(thenLine(p, free)).toBe("Then CA$280 + tax a month");
    });
  });

  it("Due today is a plain $0 in both currencies", () => {
    expect(dueToday()).toEqual({ lead: "Due today: $0.", rest: "Your first charge comes with your third list." });

  });
});
