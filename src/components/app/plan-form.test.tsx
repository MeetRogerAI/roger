import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/start/billing-actions", () => ({ savePlan: async () => ({ status: "idle" }) }));

const { PlanForm } = await import("./plan-form");

const flat = (html: string) => html.replace(/\s+/g, " ");

describe("PlanForm (spec B.4 screen 3, 1.3)", () => {
  describe("at launch: monthly only (one at a time not offered, so no price for it is passed)", () => {
    const html = flat(renderToStaticMarkup(<PlanForm monthly="US$200" perRun={null} higher="US$400" zackLink="/zack" />));

    it("shows monthly as the plan, in terms of Cora Curations, with nothing to choose", () => {
      expect(html).toContain("Monthly, US$200 a month");
      expect(html).toContain("A Cora Curation every Monday. Charged once a month, starting with your third Cora Curation.");
      expect(html).not.toContain('type="radio"');
      expect(html).not.toContain('name="plan"');
      expect(html).not.toContain("Most people choose this");
    });

    it("names no other way to pay, and never calls the delivery a list", () => {
      expect(html).not.toMatch(/one at a time|per_run|each<|Order a/i);
      expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\blists?\b/i);
    });

    it("still asks for the consent, unticked, and states the higher rate for two missed weeks", () => {
      const consent = html.match(/<input[^>]*name="consent"[^>]*>/)?.[0] ?? "";
      expect(consent).toContain('type="checkbox"');
      expect(consent).toContain('value="yes"');
      expect(html).not.toContain("checked");
      expect(html).toContain("If Zack misses two weeks in a month, that month is US$400. We always tell you first.");
      expect(html).toContain("Continue to your card");
    });
  });

  describe("with one at a time offered (the switch on)", () => {
    const html = flat(renderToStaticMarkup(<PlanForm monthly="US$200" perRun="US$200" higher="US$400" zackLink="/zack" />));

    it("shows both prices, monthly first, selected and marked", () => {
      expect(html).toContain("Monthly, US$200 a month");
      expect(html).toContain("One Cora Curation at a time, US$200 each");
      expect(html.indexOf("Most people choose this")).toBeLessThan(html.indexOf("One Cora Curation at a time"));
      const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
      expect(radios).toHaveLength(2);
      expect(radios[0]).toContain('value="monthly"');
      expect(radios[0]).toContain("checked");
      expect(radios[1]).toContain('value="per_run"');
      expect(radios[1]).not.toContain("checked");
    });

    it("says monthly costs the same and brings one every Monday", () => {
      expect(html).toContain("Monthly costs the same and brings one every Monday.");
    });
  });
});
