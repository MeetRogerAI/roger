import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";

// The one-at-a-time switch (`plans.oneAtATimeOffered`, read through billing/offered): off, as at launch, unless a test turns it on.
const offer = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/offered")>()), oneAtATimeOffered: () => offer.on }));

const { nextMonthly, statusLine } = await import("./status");
type StatusFacts = import("./status").StatusFacts;

beforeEach(() => {
  offer.on = false;
});

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
  it("trial: free Cora Curation 1 of 2", () => {
    expect(statusLine(f({}), s)).toBe("Free Cora Curation 1 of 2.");
  });

  it("trial, monthly, second Cora Curation: the first paid date and the told amount", () => {
    expect(statusLine(f({ freeListsUsed: 2, quote: { totalCents: 22600, currency: "USD", week: "2026-12-21" } }), s)).toBe(
      "Free Cora Curation 2 of 2. Your next Cora Curation is your first paid one: Monday, December 21, US$226 with tax.",
    );
  });

  it("trial, one at a time, second Cora Curation: how to order, while that plan is offered", () => {
    offer.on = true;
    expect(statusLine(f({ plan: "per_run", freeListsUsed: 2 }), s)).toMatch(/^Free Cora Curation 2 of 2\. Order your next one whenever you want it: US\$\d+ plus tax where it applies\.$/);
  });

  it("an account still on one at a time while it is not offered: no invitation to order and no price for one, only the way to monthly", () => {
    const way = "Ordering one Cora Curation at a time isn’t offered at the moment. Monthly brings a Cora Curation every Monday. You can switch to monthly on the billing page; nothing is charged unless you do.";
    expect(statusLine(f({ plan: "per_run", freeListsUsed: 1 }), s)).toBe("Free Cora Curation 1 of 2.");
    expect(statusLine(f({ plan: "per_run", freeListsUsed: 2 }), s)).toBe(`Free Cora Curation 2 of 2. ${way}`);
    expect(statusLine(f({ status: "active", plan: "per_run" }), s)).toBe(way);
    // The week of an order placed before the option was withdrawn still says what it cost.
    expect(statusLine(f({ status: "active", plan: "per_run", orderCents: 5650 }), s)).toBe(`This Cora Curation: US$56.50 with tax. ${way}`);
    for (const facts of [f({ plan: "per_run", freeListsUsed: 2 }), f({ status: "active", plan: "per_run" })]) expect(statusLine(facts, s)).not.toMatch(/Order |US\$200/);
  });

  it("names one at a time to no monthly member while it is not offered", () => {
    const monthly = [f({}), f({ freeListsUsed: 0 }), f({ freeListsUsed: 2 }), f({ status: "active", firstChargeAt: "2026-11-30T11:05:00Z" }), f({ status: "held" }), f({ status: "cancelled" })];
    for (const facts of monthly) expect(statusLine(facts, s)).not.toMatch(/one at a time|order/i);
  });

  it("monthly: contributing, the month's forgiven misses, and the next charge (spec B.9 notice 2)", () => {
    const line = statusLine(f({ status: "active", firstChargeAt: "2026-11-30T11:05:00Z" }), s);
    expect(line).toBe("Contributing. This month: 0 of 1 forgiven misses used. Next charge Wednesday, December 30: US$200 plus tax where it applies.");
  });

  const contribution = { used: 1, missed: 1, allowed: 1, periodEnd: "2026-12-30", missedThisWeek: true, cancelling: false, alreadyBilled: false, adjustment: null };
  const active = { status: "active", firstChargeAt: "2026-11-30T11:05:00Z" };

  it("monthly, first miss this week: forgiven, and what a second would cost (notice 3)", () => {
    expect(statusLine(f({ ...active, contribution }), s)).toBe(
      "Zack didn’t send a report this week. This one is forgiven. A second miss before Wednesday, December 30 makes this month US$400. Next charge Wednesday, December 30: US$200 plus tax where it applies.",
    );
    expect(statusLine(f({ ...active, contribution: { ...contribution, missedThisWeek: false } }), s)).toMatch(/^Contributing\. This month: 1 of 1 forgiven misses used\. Next charge/);
  });

  it("never calls a miss forgiven when the month is already past its forgiven misses", () => {
    expect(statusLine(f({ ...active, contribution: { ...contribution, missed: 3 } }), s)).toMatch(/^Contributing\. This month: 1 of 1 forgiven misses used\./);
  });

  it("drops the contribution words once a cancellation is scheduled", () => {
    expect(statusLine(f({ ...active, contribution: { ...contribution, cancelling: true } }), s)).toBe("Next charge Wednesday, December 30: US$200 plus tax where it applies.");
  });

  it("monthly, second miss: the higher month and the invoice it is on (notice 4)", () => {
    const adjustment = { invoiceDate: "2026-12-30", amountCents: 20000, currency: "USD" as const, periodEnd: "2026-12-30", current: true, reason: "two_misses" as const };
    expect(statusLine(f({ ...active, contribution: { ...contribution, adjustment } }), s)).toBe(
      "This is your second missed week this month, so this month is billed at US$400. The difference of US$200 will be on your invoice of Wednesday, December 30.",
    );
  });

  it("monthly with sharing off: the standard next charge and what a cutoff with sharing off does", () => {
    expect(statusLine(f({ ...active, sharing: "off", contribution: { ...contribution, missed: 0, used: 0, missedThisWeek: false } }), s)).toBe(
      "Next charge Wednesday, December 30: US$200 plus tax where it applies. With sharing off at a Sunday cutoff, that month is billed at US$400; the difference is added to your next invoice.",
    );
  });

  it("a month owing the difference for not sharing says so, whatever sharing is now", () => {
    const adjustment = { invoiceDate: "2026-12-30", amountCents: 20000, currency: "USD" as const, periodEnd: "2026-12-30", current: true, reason: "not_sharing" as const };
    expect(statusLine(f({ ...active, contribution: { ...contribution, adjustment } }), s)).toBe(
      "Zack wasn’t sharing at a Sunday cutoff this month, so this month is billed at US$400. The difference of US$200 will be on your invoice of Wednesday, December 30.",
    );
  });

  it("words a carried adjustment from its own month and still shows the new month's count", () => {
    const adjustment = { invoiceDate: "2027-01-30", amountCents: 20000, currency: "USD" as const, periodEnd: "2026-12-30", current: false, reason: "two_misses" as const };
    expect(statusLine(f({ ...active, contribution: { ...contribution, used: 0, missed: 0, missedThisWeek: false, periodEnd: "2027-01-30", adjustment } }), s)).toBe(
      "Your billing month to Wednesday, December 30 had two missed weeks, so it is billed at US$400. The difference of US$200 will be on your invoice of Saturday, January 30. Contributing. This month: 0 of 1 forgiven misses used. Next charge Saturday, January 30: US$200 plus tax where it applies.",
    );
  });


  it("one at a time, while it is offered: what this Cora Curation cost", () => {
    offer.on = true;
    expect(statusLine(f({ status: "active", plan: "per_run", orderCents: 5650 }), s)).toMatch(
      /^This Cora Curation: US\$56\.50 with tax\. Order next Monday’s whenever you want one\. Monthly is US\$\d+ for every Monday\.$/,
    );
  });

  it("held, closed, cancelled and before the first Cora Curation each say what is true", () => {
    expect(statusLine(f({ status: "held" }), s)).toMatch(/^Your payment didn’t go through/);
    expect(statusLine(f({ status: "closed" }), s)).toBe("Your account is closed. Nothing more will be charged.");
    expect(statusLine(f({ status: "cancelled", accessEndsAt: "2026-12-30T16:00:00Z" }), s)).toBe(
      "Your plan is cancelled. Your Cora Curations continue until Wednesday, December 30, and nothing more will be charged.",
    );
    expect(statusLine(f({ freeListsUsed: 0 }), s)).toBe("Your first 2 Cora Curations are free.");
  });

  it("a member cancelling is told the end date, and a one-at-a-time member switched to monthly is not shown trial words (Unit 15 review)", () => {
    expect(statusLine(f({ status: "active", firstChargeAt: "2026-12-03T11:05:00Z", endingAt: "2027-01-03T11:05:00Z" }), s)).toBe(
      "Your plan is cancelled. Your Cora Curations continue until Sunday, January 3, and nothing more will be charged.",
    );
    expect(statusLine(f({ freeListsUsed: 2, switchedFromPerRun: true, quote: { totalCents: 22600, currency: "USD", week: "2026-12-21" } }), s)).toBe(
      "Monthly starts with your next Cora Curation: Monday, December 21 at the earliest, US$226 with tax.",
    );
  });

  it("a renewal hold, a cancellation that has ended, and a switch waiting for the month's end (Unit 15)", () => {
    expect(statusLine(f({ status: "held", holdReason: "renewal_unpaid" }), s)).toMatch(/^Your monthly payment didn’t go through, so your Cora Curations are paused\./);
    expect(statusLine(f({ status: "cancelled", accessEndsAt: "2026-12-12T15:00:00Z" }), s)).toBe("Your plan is cancelled, and nothing more will be charged.");
    expect(statusLine(f({ status: "active", firstChargeAt: "2026-12-03T11:05:00Z", switchingAt: "2027-01-03T11:05:00Z" }), s)).toBe(
      "Monthly continues until Sunday, January 3, with a Cora Curation every Monday. After that you order them one at a time.",
    );
  });

  it("finds the next monthly date, including short months", () => {
    expect(nextMonthly("2026-01-31T15:00:00Z", new Date("2026-02-10T15:00:00Z"))).toBe("2026-02-28");
    expect(nextMonthly("2026-11-30T15:00:00Z", now)).toBe("2026-12-30");
  });
});
