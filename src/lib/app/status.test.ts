import { describe, expect, it } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";
import { nextMonthly, statusLine, type StatusFacts } from "./status";

const s = mergeV3([]);
const now = new Date("2026-12-14T12:05:00Z");
const f = (o: Partial<StatusFacts>): StatusFacts => ({
  status: "trial",
  plan: "monthly",
  sponsored: false,
  sharing: "share",
  currency: "USD",
  freeListsUsed: 1,
  freeRuns: 2,
  quote: null,
  firstChargeAt: null,
  orderCents: null,
  now,
  ...o,
});

describe("statusLine (spec B.8 item 3)", () => {
  it("trial: free list 1 of 2", () => {
    expect(statusLine(f({}), s)).toBe("Free list 1 of 2.");
  });

  it("trial, monthly, second list: the first paid date and the told amount", () => {
    expect(statusLine(f({ freeListsUsed: 2, quote: { totalCents: 22600, currency: "USD", week: "2026-12-21" } }), s)).toBe(
      "Free list 2 of 2. Your next list is your first paid one: Monday, December 21, US$226 with tax.",
    );
  });

  it("trial, one at a time, second list: how to order", () => {
    expect(statusLine(f({ plan: "per_run", freeListsUsed: 2 }), s)).toMatch(/^Free list 2 of 2\. Order your next list whenever you want one: US\$\d+ plus tax where it applies\.$/);
  });

  it("monthly: the next charge date and amount, and the contribution line", () => {
    const line = statusLine(f({ status: "active", firstChargeAt: "2026-11-30T11:05:00Z" }), s);
    expect(line).toMatch(/^Next charge Wednesday, December 30: US\$\d+ plus tax where it applies\. Zack’s report each week keeps you at this price\.$/);
  });

  it("one at a time: what this list cost", () => {
    expect(statusLine(f({ status: "active", plan: "per_run", orderCents: 5650 }), s)).toMatch(
      /^This list: US\$56\.50 with tax\. Order next Monday’s whenever you want one\. Monthly is US\$\d+ for every Monday\.$/,
    );
  });

  it("held, closed, cancelled and before the first list each say what is true", () => {
    expect(statusLine(f({ status: "held" }), s)).toMatch(/^Your payment didn’t go through/);
    expect(statusLine(f({ status: "closed" }), s)).toBe("Your account is closed. Nothing more will be charged.");
    expect(statusLine(f({ status: "cancelled", accessEndsAt: "2026-12-30T16:00:00Z" }), s)).toBe(
      "Your plan is cancelled. Your lists continue until Wednesday, December 30, and nothing more will be charged.",
    );
    expect(statusLine(f({ freeListsUsed: 0 }), s)).toBe("Your first 2 lists are free.");
  });

  it("finds the next monthly date, including short months", () => {
    expect(nextMonthly("2026-01-31T15:00:00Z", new Date("2026-02-10T15:00:00Z"))).toBe("2026-02-28");
    expect(nextMonthly("2026-11-30T15:00:00Z", now)).toBe("2026-12-30");
  });
});
