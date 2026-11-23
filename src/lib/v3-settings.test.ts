import { beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";

// A plain function, not vi.fn(): a vi.fn() whose promise rejects is reported
// as an unhandled rejection even when the code under test catches it.
let respond: () => Promise<unknown> = async () => [];
vi.mock("./db", () => ({ hasDb: () => true, sql: () => respond() }));

const { mergeV3, readV3Settings, SettingsUnavailable } = await import("./v3-settings");

describe("mergeV3", () => {
  it("gives every spec 0.9 key a default that passes validation", () => {
    const s = mergeV3([]);
    expect(s.priceUsd).toBe(200);
    expect(s.signupOpen).toBe(false);
    expect(s.cycleLive).toBe(false);
    expect(Object.keys(s).sort()).toEqual(Object.keys(v3Defaults).sort());
  });

  it("overlays saved v3 rows and ignores everything else", () => {
    const s = mergeV3([
      { key: "v3.priceUsd", value: 250 },
      { key: "v3.unknown", value: 1 },
      { key: "setupPrice", value: 9 },
    ]);
    expect(s.priceUsd).toBe(250);
    expect(s).not.toHaveProperty("unknown");
  });

  it("refuses a job time outside 1:00 to 11:00 AM", () => {
    expect(() => mergeV3([{ key: "v3.sendAt", value: "12:00" }])).toThrow();
    expect(() => mergeV3([{ key: "v3.coraAt", value: "00:30" }])).toThrow();
  });

  it("refuses jobs out of order", () => {
    expect(() => mergeV3([{ key: "v3.chargeAt", value: "08:00" }])).toThrow();
  });

  it("refuses a cutoff in the small hours", () => {
    expect(() => mergeV3([{ key: "v3.runCutoff", value: "02:00" }])).toThrow();
  });

  it("refuses a malformed value", () => {
    expect(() => mergeV3([{ key: "v3.priceUsd", value: "200" }])).toThrow();
    expect(() => mergeV3([{ key: "v3.signupOpen", value: "yes" }])).toThrow();
  });
});

describe("readV3Settings", () => {
  beforeEach(() => {
    respond = async () => [];
  });

  it("returns merged settings", async () => {
    respond = async () => [{ key: "v3.cycleLive", value: true }];
    expect((await readV3Settings()).cycleLive).toBe(true);
  });

  it("throws instead of returning defaults when the database cannot be read", async () => {
    respond = async () => {
      throw new Error("connection refused");
    };
    await expect(readV3Settings()).rejects.toBeInstanceOf(SettingsUnavailable);
  });

  it("throws when a saved value is invalid", async () => {
    respond = async () => [{ key: "v3.priceUsd", value: -5 }];
    await expect(readV3Settings()).rejects.toBeInstanceOf(SettingsUnavailable);
  });
});
