import { describe, expect, it } from "vitest";
import { basePreview, billingErrors, canQuote, discountDuration, dueToday, postalError, taxLine, totalText } from "./payment-view";

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

  it("words a limited discount honestly", () => {
    const p = { code: "A", label: "A", duration: "once" as const, durationInMonths: null, percentOff: 20, amountOffCents: null };
    expect(discountDuration(p)).toBe("first month only");
    expect(discountDuration({ ...p, duration: "repeating", durationInMonths: 3 })).toBe("first 3 months");
    expect(discountDuration({ ...p, duration: "forever" })).toBe("");
  });

  it("Due today names the currency (never a bare $)", () => {
    expect(dueToday("CAD")).toEqual({ lead: "Due today: CA$0.", rest: "Your first charge comes with your third list." });
    expect(dueToday("USD").lead).toBe("Due today: US$0.");
  });
});
