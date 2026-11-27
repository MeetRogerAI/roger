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
    expect(t).toContain("Due today: $0. Your first charge comes with your third list.");
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
    expect(t).toContain("Due today: $0.");
  });

  // Unit 8 review F5: how long the discount lasts, and the regular monthly amount after one that ends.
  it("a once-only discount: its label and 'off your first month', the first month's total, then the regular month", () => {
    const p = { ...ontario, discountCents: 5600, taxCents: 2912, totalCents: 25312 };
    const html = renderToStaticMarkup(<PriceBox price={p} promo={promo} />);
    const t = text(html);
    expect(t).toMatch(/Launch 20% CA\$56 off your first month\s*−\s*CA\$56/);
    expect(t).toContain("First month CA$253.12");
    expect(t).toContain("Then CA$316.40 a month");
    expect(t).toContain("CA$253.12 first month Details");
    expect(html).toMatch(/aria-live="polite"[^>]*>First month CA\$253.12. Then CA\$316.40 a month/);
  });

  it("a discount for some months says for how many; one that lasts says every month, with no 'Then' line", () => {
    const p = { ...ontario, discountCents: 5600, taxCents: 2912, totalCents: 25312 };
    const three = text(renderToStaticMarkup(<PriceBox price={p} promo={{ ...promo, duration: "repeating", durationInMonths: 3 }} />));
    expect(three).toContain("CA$56 off a month for your first 3 months");
    expect(three).toContain("Then CA$316.40 a month");
    const always = text(renderToStaticMarkup(<PriceBox price={p} promo={{ ...promo, duration: "forever" }} />));
    expect(always).toContain("CA$56 off every month");
    expect(always).toContain("Total per month CA$253.12");
    expect(always).not.toContain("Then");
  });

  it("the USD / CAD toggle is a labelled group of pressed buttons, at least 44px tall", () => {
    const html = renderToStaticMarkup(<PriceBox price={ontario} promo={null} />);
    expect(html).toContain('role="group" aria-label="Currency"');
    expect(html).toMatch(/aria-pressed="true"[^>]*min-h-11[^>]*>CAD</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>USD</);
  });

  it("the toggle sits on the same line as the price, on a phone and on a desktop (it is never inside the collapsible details)", () => {
    const html = renderToStaticMarkup(<PriceBox price={ontario} promo={null} />);
    const panel = html.search(/id="[^"]*-details"/);
    expect(panel).toBeGreaterThan(-1);
    const top = html.slice(0, panel);
    // The top row holds the phone total, the desktop monthly price and the toggle, before the details panel starts.
    expect(top).toContain("CA$316.40 / month");
    expect(top).toMatch(/Roger, per month<\/span><span[^>]*>CA\$280<\/span>/);
    expect(top).toContain('role="group" aria-label="Currency"');
    expect(html.slice(panel)).not.toContain('aria-label="Currency"');
  });

  it("on a phone: a '{total} / month' bar with Details that opens the box in place; the total is announced politely", () => {
    const html = renderToStaticMarkup(<PriceBox price={ontario} promo={null} />);
    expect(text(html)).toContain("CA$316.40 / month Details");
    expect(html).toMatch(/aria-expanded="false"[^>]*md:hidden/);
    expect(html).toMatch(/class="hidden [^"]*md:block/);
    expect(html).toMatch(/aria-live="polite"[^>]*>Total per month CA\$316.40/);
  });

  it("shows a notice from the server (e.g. a code that stopped applying)", () => {
    const t = text(renderToStaticMarkup(<PriceBox price={ontario} promo={null} notice="That code no longer applies, so the price is the regular one." />));
    expect(t).toContain("That code no longer applies");
  });
});
