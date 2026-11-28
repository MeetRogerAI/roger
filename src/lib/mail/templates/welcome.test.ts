import { describe, expect, it } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";
import { longDate } from "@/lib/dates";
import { welcomeEmail } from "./welcome";

const settings = mergeV3([]);

describe("welcomeEmail (sent when sign-up ends at Step 3; plan 2026-11-26-001 Unit 2)", () => {
  const ca = welcomeEmail({ name: "Ana Silva", currency: "CAD", path: "running", settings });
  const us = welcomeEmail({ name: "Sam Lee", currency: "USD", path: "new", settings });

  it("says the first two lists are free, without saying when the card is asked for", () => {
    expect(ca.subject).toBe("Welcome to Roger");
    expect(ca.text).toContain("Welcome, Ana.");
    expect(ca.text).toContain("Your first two Cora Curations are free.");
    for (const m of [ca, us]) expect(m.text).not.toContain("ask for your card");
  });

  // Peter, 2026-11-27: both prices for every member, then the member's own tax words.
  it("states both monthly prices, from the settings, with the tax phrase for the currency", () => {
    expect(ca.text).toContain("After that, Roger is US$200 / CA$280 a month plus HST. Your first charge comes with your third Cora Curation");
    expect(us.text).toContain("After that, Roger is US$200 / CA$280 a month plus tax where it applies.");
    const raised = welcomeEmail({ name: "Ana", currency: "CAD", path: "running", settings: { ...settings, priceUsd: 210, priceCad: 290 } });
    expect(raised.text).toContain("Roger is US$210 / CA$290 a month plus HST.");
  });

  it("has no 'no earlier than' date, no higher rate and no one list at a time", () => {
    for (const m of [ca, us]) {
      expect(m.text).not.toMatch(/no earlier than/i);
      expect(m.text).not.toMatch(/US\$400|CA\$560|misses two weeks/);
      expect(m.text).not.toMatch(/one (list )?at a time|order a list/i);
      expect(m.text).not.toMatch(/card is charged only/);
    }
  });

  it("gives the next step for the person's path, linking to /app", () => {
    expect(ca.text).toMatch(/connect Zack to your AI agent/);
    expect(us.text).toMatch(/set up your AI agent and the starter team/);
    expect(ca.text).toMatch(/\/app\b/);
  });

  it("formats a Monday for other templates (longDate)", () => {
    expect(longDate("2026-12-07")).toBe("Monday, December 7");
  });
});
