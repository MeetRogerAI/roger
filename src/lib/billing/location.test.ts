import { describe, expect, it } from "vitest";
import { checkBillingLocation } from "./location";

describe("checkBillingLocation (plan 2026-11-26-001, Unit 4)", () => {
  it("accepts Canadian postal codes with or without the space, in any case, and normalises them", () => {
    expect(checkBillingLocation("CA", "M5V 2T6")).toEqual({ ok: true, location: { country: "CA", postal: "M5V 2T6" } });
    expect(checkBillingLocation("ca", " m5v2t6 ")).toEqual({ ok: true, location: { country: "CA", postal: "M5V 2T6" } });
    expect(checkBillingLocation("CA", "H2X 1Y4")).toMatchObject({ ok: true });
  });

  it("accepts five-digit US ZIP codes", () => {
    expect(checkBillingLocation("US", "10001")).toEqual({ ok: true, location: { country: "US", postal: "10001" } });
    expect(checkBillingLocation("US", "02134")).toMatchObject({ ok: true });
  });

  it("refuses every country but Canada and the US", () => {
    for (const c of ["GB", "FR", "MX", "", null, undefined, 1]) expect(checkBillingLocation(c, "10001")).toEqual({ ok: false, reason: "country" });
  });

  it("refuses postal codes in the wrong shape for the country", () => {
    for (const [c, p] of [
      ["CA", "10001"],
      ["CA", "M5V-2T6"],
      ["CA", "M5V  2T6"],
      ["CA", "W5V 2T6"],
      ["CA", "M5V 2T"],
      ["US", "M5V 2T6"],
      ["US", "1000"],
      ["US", "10001-1234"],
      ["US", ""],
      ["US", undefined],
    ] as const) {
      expect(checkBillingLocation(c, p)).toEqual({ ok: false, reason: "postal" });
    }
  });
});
