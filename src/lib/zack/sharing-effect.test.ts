import { describe, expect, it } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";
import { sharingEffect } from "./sharing-effect";

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

  it("for one list at a time: no price change; Zack off means no orders", () => {
    expect(sharingEffect({ ...o, plan: "per_run", from: "share", to: "match_only" })).toBeNull();
    expect(sharingEffect({ ...o, plan: "per_run", from: "share", to: "off" })).toContain("can’t be ordered");
  });
});
