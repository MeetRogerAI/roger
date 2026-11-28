import { describe, expect, it } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";
import { nextMonthly, PLAN_QUESTIONS, statusLine, statusLink, type StatusFacts } from "./status";

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
  hasCard: true,
  now,
  ...o,
});

describe("statusLine (spec B.8 item 3)", () => {
  it("trial: free list 1 of 2", () => {
    expect(statusLine(f({}), s)).toBe("Free list 1 of 2.");
  });

  it("trial, monthly, second list: the first paid date and the told amount", () => {
    expect(statusLine(f({ freeListsUsed: 2, quote: { totalCents: 22600, taxCents: 2600, currency: "USD", week: "2026-12-21" } }), s)).toBe(
      "Free list 2 of 2. Your next list is your first paid one: Monday, December 21, US$226 (US$200 plus US$26 tax).",
    );
  });

  // S18 point a (Peter, 2026-11-27): the price plus the tax, never "with tax".
  it("the told amount: price plus HST with tax, the bare amount with none, and a quote told before the tax was kept", () => {
    const line = (quote: NonNullable<StatusFacts["quote"]>) => statusLine(f({ freeListsUsed: 2, quote }), s);
    expect(line({ totalCents: 31640, taxCents: 3640, currency: "CAD", week: "2026-12-14" })).toBe(
      "Free list 2 of 2. Your next list is your first paid one: Monday, December 14, CA$316.40 (CA$280 plus CA$36.40 HST).",
    );
    expect(line({ totalCents: 20000, taxCents: 0, currency: "USD", week: "2026-12-14" })).toBe("Free list 2 of 2. Your next list is your first paid one: Monday, December 14, US$200.");
    expect(line({ totalCents: 31640, currency: "CAD", week: "2026-12-14" })).toBe("Free list 2 of 2. Your next list is your first paid one: Monday, December 14, CA$316.40 in total.");
    for (const q of [{ totalCents: 31640, taxCents: 3640 }, { totalCents: 20000, taxCents: 0 }]) expect(line({ ...q, currency: "CAD", week: "2026-12-14" })).not.toMatch(/with tax|tax included/);
  });

  it("trial, leftover one at a time, second list: no ordering promised (review fixes Unit 9, F2)", () => {
    const line = statusLine(f({ plan: "per_run", freeListsUsed: 2 }), s);
    expect(line).toBe(`Free list 2 of 2. ${PLAN_QUESTIONS}`);
    expect(line).not.toMatch(/order/i);
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


  it("leftover one at a time: what this list cost, and no ordering promised (review fixes Unit 9, F2)", () => {
    expect(statusLine(f({ status: "active", plan: "per_run", orderCents: 5650 }), s)).toBe(`This list: US$56.50 in total. ${PLAN_QUESTIONS}`);
    expect(statusLine(f({ status: "active", plan: "per_run", orderCents: null }), s)).toMatch(/^This list: US\$\d+ plus tax where it applies\. Monthly is now the only plan\./);
    expect(PLAN_QUESTIONS).not.toMatch(/order|one (list )?at a time/i);
  });

  it("held, closed, cancelled and before the first list each say what is true", () => {
    expect(statusLine(f({ status: "held" }), s)).toMatch(/^Your payment didn’t go through/);
    expect(statusLine(f({ status: "closed" }), s)).toBe("Your account is closed. Nothing more will be charged.");
    expect(statusLine(f({ status: "cancelled", accessEndsAt: "2026-12-30T16:00:00Z" }), s)).toBe(
      "Your plan is cancelled. Your lists continue until Wednesday, December 30, and nothing more will be charged.",
    );
    expect(statusLine(f({ freeListsUsed: 0 }), s)).toBe("Your first 2 lists are free.");
  });

  it("a member cancelling is told the end date, and a one-at-a-time member switched to monthly is not shown trial words (Unit 15 review)", () => {
    expect(statusLine(f({ status: "active", firstChargeAt: "2026-12-03T11:05:00Z", endingAt: "2027-01-03T11:05:00Z" }), s)).toBe(
      "Your plan is cancelled. Your lists continue until Sunday, January 3, and nothing more will be charged.",
    );
    expect(statusLine(f({ freeListsUsed: 2, switchedFromPerRun: true, quote: { totalCents: 22600, taxCents: 2600, currency: "USD", week: "2026-12-21" } }), s)).toBe(
      "Monthly starts with your next list: Monday, December 21 at the earliest, US$226 (US$200 plus US$26 tax).",
    );
  });

  it("a renewal hold, a cancellation that has ended, and a switch waiting for the month's end (Unit 15)", () => {
    expect(statusLine(f({ status: "held", holdReason: "renewal_unpaid" }), s)).toMatch(/^Your monthly payment didn’t go through, so your lists are paused\./);
    expect(statusLine(f({ status: "cancelled", accessEndsAt: "2026-12-12T15:00:00Z" }), s)).toBe("Your plan is cancelled, and nothing more will be charged.");
    expect(statusLine(f({ status: "active", firstChargeAt: "2026-12-03T11:05:00Z", switchingAt: "2027-01-03T11:05:00Z" }), s)).toBe(
      `Monthly continues until Sunday, January 3, with a list every Monday. ${PLAN_QUESTIONS}`,
    );
  });

  it("finds the next monthly date, including short months", () => {
    expect(nextMonthly("2026-01-31T15:00:00Z", new Date("2026-02-10T15:00:00Z"))).toBe("2026-02-28");
    expect(nextMonthly("2026-11-30T15:00:00Z", now)).toBe("2026-12-30");
  });
});

describe("a trial with no card yet (plan 2026-11-26-001, Unit 1)", () => {
  const noCard = (o: Partial<StatusFacts> = {}) => f({ hasCard: false, freeListsUsed: 0, ...o });

  it("before any teaser: the first list follows Zack's first report, or Monday with sharing off; no link", () => {
    expect(statusLine(noCard(), s)).toBe("Your first list arrives after Zack’s first report.");
    expect(statusLine(noCard({ sharing: "match_only" }), s)).toBe("Your first list arrives after Zack’s first report.");
    expect(statusLine(noCard({ sharing: "off" }), s)).toBe("Your first list arrives on Monday.");
    expect(statusLink(noCard())).toBeNull();
  });

  it("with a held list (a teaser sent): the ideas are ready, with a link to Payment", () => {
    const facts = noCard({ firstTeaserAt: "2026-12-14T12:00:00Z" });
    expect(statusLine(facts, s)).toBe("Your first ideas are ready — add a card to see them.");
    expect(statusLink(facts)).toEqual({ href: "/start/payment", label: "Add your card" });
  });

  it("never names a price, a free-list count or a charge date", () => {
    for (const facts of [noCard(), noCard({ firstTeaserAt: "2026-12-14T12:00:00Z" }), noCard({ sharing: "off" })]) {
      expect(statusLine(facts, s)).not.toMatch(/US\$|free list|charge|earliest/i);
    }
  });

  it("a sponsored trial needs no card; a trial with a card reads as before", () => {
    expect(statusLine(noCard({ sponsored: true, firstTeaserAt: "2026-12-14T12:00:00Z" }), s)).toBe("Your lists are covered by your sponsor.");
    expect(statusLink(noCard({ sponsored: true, firstTeaserAt: "2026-12-14T12:00:00Z" }))).toBeNull();
    expect(statusLine(f({ freeListsUsed: 0 }), s)).toBe("Your first 2 lists are free.");
    expect(statusLink(f({ firstTeaserAt: "2026-12-14T12:00:00Z" }))).toBeNull();
  });
});
