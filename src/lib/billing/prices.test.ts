import { afterEach, describe, expect, it } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";
import { amount, chargeWords, money, moneyCents, monthlyWords, priceId, taxPhrase } from "./prices";

const s = mergeV3([]);
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("prices", () => {
  it("shows each set price in its own currency, never a bare $", () => {
    expect(money(amount(s, "monthly", "USD"), "USD")).toBe("US$200");
    expect(money(amount(s, "monthly", "CAD"), "CAD")).toBe("CA$280");
    expect(money(amount(s, "per_run", "USD"), "USD")).toBe("US$200");
    expect(money(amount(s, "per_run", "CAD"), "CAD")).toBe("CA$280");
    expect(money(amount(s, "monthly", "USD", "higher"), "USD")).toBe("US$400");
    expect(money(amount(s, "monthly", "CAD", "higher"), "CAD")).toBe("CA$560");
  });

  it("formats cents with two places when there are cents", () => {
    expect(moneyCents(31640, "CAD")).toBe("CA$316.40");
    expect(moneyCents(20000, "USD")).toBe("US$200");
  });

  it("names the tax the way spec A.4 does", () => {
    expect(taxPhrase("CAD")).toBe("plus HST");
    expect(taxPhrase("USD")).toBe("plus tax where it applies");
  });

  // S18 point a (Peter, 2026-11-27): the price plus the tax, never "tax included".
  it("says a charge as the price plus the tax, and just the amount when no tax is collected", () => {
    expect(chargeWords(31640, "CAD", 3640)).toBe("CA$316.40 (CA$280 plus CA$36.40 HST)");
    expect(chargeWords(63280, "CAD", 7280)).toBe("CA$632.80 (CA$560 plus CA$72.80 HST)");
    expect(chargeWords(20000, "USD", 0)).toBe("US$200");
    expect(chargeWords(22600, "USD", 2600)).toBe("US$226 (US$200 plus US$26 tax)");
    // An amount told before the tax was kept: no claim about the tax in it.
    expect(chargeWords(31640, "CAD", undefined)).toBe("CA$316.40 in total");
  });

  it("says a monthly amount as the price a month plus the tax", () => {
    expect(monthlyWords(31640, "CAD", 3640)).toBe("CA$280 a month plus HST");
    expect(monthlyWords(20000, "USD", 0)).toBe("US$200 a month");
  });

  it("finds each Stripe price id from its own variable, and says when one is missing", () => {
    process.env.STRIPE_PRICE_MONTHLY_CAD = "price_m_cad";
    process.env.STRIPE_PRICE_RUN_USD = "price_r_usd";
    delete process.env.STRIPE_PRICE_MONTHLY_HIGHER_USD;
    expect(priceId("monthly", "CAD")).toBe("price_m_cad");
    expect(priceId("per_run", "USD")).toBe("price_r_usd");
    expect(priceId("monthly", "USD", "higher")).toBeNull();
  });
});
