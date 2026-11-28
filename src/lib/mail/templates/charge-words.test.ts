import { describe, expect, it } from "vitest";
import { amountChangedEmail, subscribedEmail } from "./charges";
import { firstChargeReminderEmail, firstPaidNextEmail, quoteChangedEmail } from "./quote";

/**
 * S18 point a (Peter, 2026-11-27): every email that states a charge says the
 * price plus the tax ("CA$316.40 (CA$280 plus CA$36.40 HST)"), a monthly
 * amount as "CA$280 a month plus HST", and with no tax collected just the
 * amount. Never "tax included".
 */
const week = "2026-12-14";
const all = (tax: { cad: number; usd: number }) => [
  firstPaidNextEmail({ week, amountCents: 31640, currency: "CAD", taxCents: tax.cad }),
  firstChargeReminderEmail({ week, amountCents: 31640, currency: "CAD", taxCents: tax.cad }),
  quoteChangedEmail({ week, amountCents: 31640, currency: "CAD", taxCents: tax.cad }),
  amountChangedEmail({ amountCents: 31640, currency: "CAD", taxCents: tax.cad }),
  subscribedEmail({ amountCents: 31640, currency: "CAD", taxCents: tax.cad }),
  firstPaidNextEmail({ week, amountCents: 20000, currency: "USD", taxCents: tax.usd }),
  subscribedEmail({ amountCents: 20000, currency: "USD", taxCents: tax.usd }),
];

describe("amounts in the charge emails", () => {
  it("with tax: the price plus the tax", () => {
    const [paidNext, reminder, changed, atCharge, subscribed] = all({ cad: 3640, usd: 0 });
    expect(paidNext.text).toContain("that morning we’ll charge CA$316.40 (CA$280 plus CA$36.40 HST) for your first month.");
    expect(reminder.text).toContain("we’ll charge CA$316.40 (CA$280 plus CA$36.40 HST) for your first month.");
    expect(changed.text).toContain("will be CA$316.40 (CA$280 plus CA$36.40 HST).");
    expect(atCharge.text).toContain("Your first charge will be CA$316.40 (CA$280 plus CA$36.40 HST). That isn’t");
    expect(subscribed.text).toContain("We charged CA$316.40 (CA$280 plus CA$36.40 HST).");
  });

  it("no tax collected: just the amount", () => {
    const [, , , , , usNext, usSubscribed] = all({ cad: 3640, usd: 0 });
    expect(usNext.text).toContain("that morning we’ll charge US$200 for your first month.");
    expect(usSubscribed.text).toContain("We charged US$200. Your third Cora Curation");
  });

  it("never says tax included", () => {
    for (const m of all({ cad: 3640, usd: 0 })) expect(m.text).not.toMatch(/tax included|with tax/);
  });

  it("the amount after a discount that ends: the monthly price plus the tax", () => {
    const discount = { label: "WELCOME20", amountCents: 5600, duration: "once" as const, months: null };
    const cad = firstPaidNextEmail({ week, amountCents: 25312, currency: "CAD", taxCents: 2912, discount: { ...discount, thenCents: 31640, thenTaxCents: 3640 } });
    expect(cad.text).toContain("That includes your promo code WELCOME20: CA$56 off your first month. After that, it’s CA$280 a month plus HST.");
    const usd = firstPaidNextEmail({ week, amountCents: 16000, currency: "USD", taxCents: 0, discount: { ...discount, amountCents: 4000, thenCents: 20000, thenTaxCents: 0 } });
    expect(usd.text).toContain("After that, it’s US$200 a month.");
  });
});
