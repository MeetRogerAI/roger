import { describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { amountNames, amountsFrom, currencyForCountry, fillAmounts, getAmounts, hasBareDollar, money, priceLine, taxNote } from "./amounts";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const amounts = amountsFrom(v3Defaults);

describe("the amounts in the defaults", () => {
  // Plan R8. A change here is a price change: the copy, the legal text and Stripe must change with it.
  it("are R8's six prices", () => {
    expect({
      priceUsd: v3Defaults.priceUsd,
      priceCad: v3Defaults.priceCad,
      priceRunUsd: v3Defaults.priceRunUsd,
      priceRunCad: v3Defaults.priceRunCad,
      priceHigherUsd: v3Defaults.priceHigherUsd,
      priceHigherCad: v3Defaults.priceHigherCad,
    }).toEqual({ priceUsd: 200, priceCad: 280, priceRunUsd: 200, priceRunCad: 280, priceHigherUsd: 400, priceHigherCad: 560 });
  });

  it("give two free lists and a 21-day close", () => {
    expect(amounts.freeLists).toBe(2);
    expect(amounts.trialCloseDays).toBe(21);
  });

  it("are what the site shows when there is no database", async () => {
    expect(await getAmounts()).toEqual(amounts);
  });
});

describe("price wording", () => {
  it("writes USD with its code after the amount and the general tax note", () => {
    expect(priceLine("USD", amounts.monthly.USD, "month")).toBe("US$200 / month USD");
    expect(priceLine("USD", amounts.list.USD, "list")).toBe("US$200 / list USD");
    expect(taxNote("USD")).toBe("plus tax where it applies");
  });

  it("writes CAD with its code after the amount and HST", () => {
    expect(priceLine("CAD", amounts.monthly.CAD, "month")).toBe("CA$280 / month CAD");
    expect(priceLine("CAD", amounts.list.CAD, "list")).toBe("CA$280 / list CAD");
    expect(taxNote("CAD")).toBe("plus HST");
  });

  it("never writes a bare dollar sign", () => {
    const written = [
      ...(["USD", "CAD"] as const).flatMap((c) => [money(c, 1200), priceLine(c, amounts.monthly[c], "month"), priceLine(c, amounts.higher[c], "month"), taxNote(c)]),
      ...Object.values(amountNames(amounts)),
    ];
    for (const text of written) expect(hasBareDollar(text), text).toBe(false);
    expect(money("USD", 1200)).toBe("US$1,200");
  });

  it("spots a bare dollar sign", () => {
    expect(hasBareDollar("It costs $200.")).toBe(true);
    expect(hasBareDollar("US$200 or CA$280")).toBe(false);
  });
});

describe("amounts named in copy", () => {
  it("fills prices, the higher rate, the free lists and the close", () => {
    expect(fillAmounts("{monthlyUsd} a month, or {listUsd} for one list at a time. In Canada it is {monthlyCad} a month or {listCad} a list.", amounts)).toBe(
      "US$200 a month, or US$200 for one list at a time. In Canada it is CA$280 a month or CA$280 a list.",
    );
    expect(fillAmounts("the price becomes {higherUsd} a month ({higherCad})", amounts)).toBe("the price becomes US$400 a month (CA$560)");
    expect(fillAmounts("Your first {freeLists} Monday lists are free. On monthly it is charged with your {firstPaidList} list.", amounts)).toBe(
      "Your first two Monday lists are free. On monthly it is charged with your third list.",
    );
    expect(fillAmounts("within {trialCloseDays} days", amounts)).toBe("within 21 days");
  });

  it("follows a changed setting", () => {
    const changed = amountsFrom({ ...v3Defaults, priceUsd: 250, freeRuns: 3 });
    expect(fillAmounts("{monthlyUsd}, {freeLists} free, charged with the {firstPaidList}", changed)).toBe("US$250, three free, charged with the fourth");
  });

  it("refuses a name that is not an amount", () => {
    expect(() => fillAmounts("{monthlyEur} a month", amounts)).toThrow(/monthlyEur/);
    expect(fillAmounts("No names here.", amounts)).toBe("No names here.");
  });
});

describe("the currency default", () => {
  it("is CAD for Canada and USD for everywhere else", () => {
    expect(currencyForCountry("CA")).toBe("CAD");
    expect(currencyForCountry("ca")).toBe("CAD");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry(null)).toBe("USD");
  });
});
