import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/start/billing-actions", () => ({ savePlan: async () => ({ status: "idle" }) }));

const { PlanForm } = await import("./plan-form");

describe("PlanForm (spec B.4 screen 3, 1.3)", () => {
  const html = renderToStaticMarkup(<PlanForm monthly="US$200" perRun="US$200" higher="US$400" zackLink="/zack" />);

  it("shows both prices, monthly first and marked", () => {
    expect(html).toContain("Monthly, US$200 a month");
    expect(html).toContain("One list at a time, US$200 each");
    expect(html.indexOf("Most people choose this")).toBeLessThan(html.indexOf("One list at a time"));
  });

  it("says monthly costs the same as one list and brings a list every Monday", () => {
    expect(html.replace(/\s+/g, " ")).toContain("Monthly costs the same and brings a list every Monday.");
  });
});
