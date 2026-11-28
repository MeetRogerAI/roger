import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";

// The one-at-a-time switch (`plans.oneAtATimeOffered`, read through billing/offered): off, as at launch, unless a test turns it on.
const offer = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/offered")>()), oneAtATimeOffered: () => offer.on }));

const { sharingEffect } = await import("./sharing-effect");

beforeEach(() => {
  offer.on = false;
});

const s = mergeV3([]);
const o = { settings: s, plan: "monthly" as const, currency: "USD" as const, trialStartedAt: null, status: "active" };

describe("sharingEffect", () => {
  it("says what sharing off at a Sunday cutoff costs a monthly member, and what sharing on gives back", () => {
    expect(sharingEffect({ ...o, from: "share", to: "match_only" })).toBe(
      "With sharing off at a Sunday cutoff, that month is billed at US$400; the difference is added to your next invoice.",
    );
    expect(sharingEffect({ ...o, from: "off", to: "share" })).toBe("A month with sharing on at every Sunday cutoff is US$200. A month that already had sharing off at a cutoff stays at US$400.");
  });

  it("says nothing changes between two choices on the same rate", () => {
    expect(sharingEffect({ ...o, from: "match_only", to: "off" })).toBeNull();
  });

  it("gives the first-charge date during the trial", () => {
    expect(sharingEffect({ ...o, status: "trial", trialStartedAt: "2026-11-24T15:00:00Z", from: "share", to: "off" })).toContain("no earlier than Monday, December 14");
  });

  it("gives no first-charge date to a trial with no card yet (plan 2026-11-26-001, Unit 1)", () => {
    const off = sharingEffect({ ...o, status: "trial", trialStartedAt: null, from: "share", to: "off" });
    expect(off).toContain("before your first monthly charge");
    expect(off).toContain("US$400");
    expect(off).not.toContain("no earlier than");
    // Even with a stale told Monday: no card means no date.
    expect(sharingEffect({ ...o, status: "trial", trialStartedAt: null, quoteWeek: "2026-12-14", from: "off", to: "share" })).not.toContain("no earlier than");
  });

  it("for one at a time, while it is offered: no price change; Zack off means no orders", () => {
    offer.on = true;
    expect(sharingEffect({ ...o, plan: "per_run", from: "share", to: "match_only" })).toBeNull();
    expect(sharingEffect({ ...o, plan: "per_run", from: "share", to: "off" })).toBe("With Zack off, Cora Curations can’t be ordered until sharing is back on. Your price doesn’t change.");
  });

  it("for an account still on one at a time while it is not offered: nothing about ordering, since nothing can be ordered either way", () => {
    expect(sharingEffect({ ...o, plan: "per_run", from: "share", to: "match_only" })).toBeNull();
    expect(sharingEffect({ ...o, plan: "per_run", from: "share", to: "off" })).toBeNull();
  });
});
