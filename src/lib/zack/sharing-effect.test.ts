import { describe, expect, it } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";
import { sharingEffect } from "./sharing-effect";

const s = mergeV3([]);
const o = { settings: s, plan: "monthly" as const, currency: "USD" as const, trialStartedAt: null, status: "active" };

describe("sharingEffect", () => {
  it("moves a monthly member to the higher rate when they stop sharing, and back", () => {
    expect(sharingEffect({ ...o, from: "share", to: "match_only" })).toMatch(/^From your next monthly charge you will pay US\$\d+/);
    expect(sharingEffect({ ...o, from: "off", to: "share" })).toMatch(/you will pay US\$\d+ a month\.$/);
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
