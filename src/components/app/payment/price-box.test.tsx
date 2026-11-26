import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MonthlyPreview } from "@/lib/billing/gateway";
import { basePreview, type PromoView } from "@/lib/billing/payment-view";
import { PriceBox } from "./price-box";

/** Plan 2026-11-26-001, Unit 6 (origin R14–R16): the Price Box. */

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const ontario: MonthlyPreview = { currency: "CAD", subtotalCents: 28000, discountCents: 0, tax: "calculated", taxCents: 3640, taxName: "HST", taxRate: 13, totalCents: 31640 };
const promo: PromoView = { code: "SAVE20", label: "Launch 20%", duration: "once", durationInMonths: null, percentOff: 20, amountOffCents: null };

describe("PriceBox", () => {
  it("before an address: Roger monthly, the tax still to come, the total before tax and Due today", () => {
    const t = text(renderToStaticMarkup(<PriceBox price={basePreview("CAD", 28000, null)} promo={null} />));
    expect(t).toContain("Roger monthly CA$280");
    expect(t).toContain("Tax Calculated from your billing address");
    expect(t).toContain("Total per month CA$280 + tax");
    expect(t).toContain("Due today: CA$0. Your first charge comes with your third list.");
  });

  it("with an Ontario address: HST with its rate, and the total", () => {
    const t = text(renderToStaticMarkup(<PriceBox price={ontario} promo={null} />));
    expect(t).toContain("HST 13% CA$36.40");
    expect(t).toContain("Total per month CA$316.40");
  });

  it("a US state where Stripe collects nothing reads 'No sales tax'", () => {
    const us: MonthlyPreview = { currency: "USD", subtotalCents: 20000, discountCents: 0, tax: "calculated", taxCents: 0, taxName: null, taxRate: null, totalCents: 20000 };
    const t = text(renderToStaticMarkup(<PriceBox price={us} promo={null} />));
    expect(t).toContain("No sales tax US$0");
    expect(t).toContain("Total per month US$200");
    expect(t).toContain("Due today: US$0.");
  });

  it("a discount line names the code's label and, for a once-only code, that it is the first month only", () => {
    const p = { ...ontario, discountCents: 5600, taxCents: 2912, totalCents: 25312 };
    const t = text(renderToStaticMarkup(<PriceBox price={p} promo={promo} />));
    expect(t).toMatch(/Launch 20% first month only\s*−\s*CA\$56/);
    expect(t).toContain("Total per month CA$253.12");
  });

  it("the USD / CAD toggle is a labelled group of pressed buttons, at least 44px tall", () => {
    const html = renderToStaticMarkup(<PriceBox price={ontario} promo={null} />);
    expect(html).toContain('role="group" aria-label="Currency"');
    expect(html).toMatch(/aria-pressed="true"[^>]*min-h-11[^>]*>CAD</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>USD</);
  });

  it("on a phone: a '{total} / month · Details' bar that opens the box in place; the total is announced politely", () => {
    const html = renderToStaticMarkup(<PriceBox price={ontario} promo={null} />);
    expect(text(html)).toContain("CA$316.40 / month · Details");
    expect(html).toMatch(/aria-expanded="false"[^>]*md:hidden/);
    expect(html).toMatch(/class="hidden [^"]*md:block/);
    expect(html).toMatch(/aria-live="polite"[^>]*>Total per month CA\$316.40/);
  });

  it("shows a notice from the server (e.g. a code that stopped applying)", () => {
    const t = text(renderToStaticMarkup(<PriceBox price={ontario} promo={null} notice="That code no longer applies, so the price is the regular one." />));
    expect(t).toContain("That code no longer applies");
  });
});
