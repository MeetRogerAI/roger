import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/start/billing-actions", () => ({ savePlan: async () => ({ status: "idle" }) }));

const { PlanForm } = await import("./plan-form");

describe("PlanForm (Step 3, Product and Pricing; plan 2026-11-26-001 Unit 2)", () => {
  const html = renderToStaticMarkup(<PlanForm usd="US$200" cad="CA$280" zackLink="/start/zack/hark" />);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("has a Product paragraph, then the consent and the Zack link under it, then Pricing", () => {
    const product = text.indexOf("Product");
    const consent = text.indexOf("I agree that Zack");
    const link = text.indexOf("Read what Zack does first");
    const pricing = text.indexOf("Pricing");
    expect(product).toBeGreaterThanOrEqual(0);
    expect(product).toBeLessThan(consent);
    expect(consent).toBeLessThan(link);
    expect(link).toBeLessThan(pricing);
    expect(html).toContain('href="/start/zack/hark"');
    expect(text).toContain("Cora curates three ideas picked for you, every Monday.");
  });

  it("states both prices and the trial in lists, not weeks", () => {
    expect(text).toContain("Roger is US$200 a month or CA$280 a month, plus tax.");
    expect(text).toContain("We’ll ask for your card before your first full Cora Curation is shown.");
    expect(text).toContain("Your free trial includes your first two Cora Curations, two Mondays.");
  });

  it("offers no plan picker, no higher rate and no one-at-a-time; the consent box starts unticked", () => {
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('name="plan"');
    expect(text).not.toMatch(/US\$400|CA\$560|one list at a time/i);
    const box = html.match(/<input type="checkbox"[^>]*>/g) ?? [];
    expect(box).toHaveLength(1);
    expect(box[0]).toContain('name="consent"');
    expect(box[0]).not.toContain("checked");
  });

  it("drops the removed card wording and says Continue", () => {
    expect(text).not.toMatch(/Nothing is charged today|no earlier than|Roger never sees the number/);
    expect(text).toContain("Continue");
    expect(text).not.toContain("Continue to your card");
  });
});
