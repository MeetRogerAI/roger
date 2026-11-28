import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Trust } from "@/components/app/payment/trust";
import { circlesTerms } from "./circles-legal";
import { rogerMonthlyTerms, terms } from "./legal";

describe("Roger monthly terms (approved 2026-11-26)", () => {
  it("are a section of both terms docs, so /terms#roger-monthly works in either site mode", () => {
    for (const doc of [terms, circlesTerms]) {
      expect(doc.sections.filter((s) => s.id === "roger-monthly")).toEqual([rogerMonthlyTerms]);
    }
  });

  it("say no refunds, cancel any time, and the mistaken-charge exception", () => {
    const text = rogerMonthlyTerms.body.join(" ");
    expect(rogerMonthlyTerms.heading).toBe("Roger monthly: no refunds, cancel any time");
    expect(text).toContain("we don’t refund charges already made");
    expect(text).toContain("we refund the mistaken charge in full");
    expect(text).toContain("Due today: $0");
    expect(text).not.toMatch(/14-day|money-back/i);
  });

  it("the Payment page's 'Terms and refunds' link opens that section", () => {
    const html = renderToStaticMarkup(<Trust supportEmail="hello@meetroger.ai" />);
    expect(html).toMatch(/href="\/terms#roger-monthly"[^>]*>Terms and refunds/);
  });
});
