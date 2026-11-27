import { beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";

// A plain function, not vi.fn(): a vi.fn() whose promise rejects is reported
// as an unhandled rejection even when the code under test catches it.
let respond: () => Promise<unknown> = async () => [];
vi.mock("./db", () => ({ hasDb: () => true, sql: () => respond() }));

const { mergeV3, readV3Settings, saveV3Settings, SettingsUnavailable } = await import("./v3-settings");

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

  it("has the B2 switches, off by default, and takes a saved true", () => {
    const s = mergeV3([]);
    for (const k of ["referralsOn", "leaderboardOn", "statsOn", "sponsorsOn"] as const) {
      expect(s[k]).toBe(false);
      expect(mergeV3([{ key: `v3.${k}`, value: true }])[k]).toBe(true);
      expect(() => mergeV3([{ key: `v3.${k}`, value: "on" }])).toThrow();
    }
  });

  it("has the B3 switches, off by default, takes a saved true, and fails closed on an invalid value", () => {
    const s = mergeV3([]);
    for (const k of ["reviewBotOn", "feedbackOn", "coraUpgradesOn"] as const) {
      expect(s[k]).toBe(false);
      expect(mergeV3([{ key: `v3.${k}`, value: true }])[k]).toBe(true);
      expect(() => mergeV3([{ key: `v3.${k}`, value: "on" }])).toThrow();
    }
  });

  it("still reads a saved set from before B3, with the B3 switches off", () => {
    // Every key B2 knew, saved: none of the B3 switches is among them.
    const b2Rows = Object.entries(mergeV3([]))
      .filter(([k]) => !["reviewBotOn", "feedbackOn", "coraUpgradesOn"].includes(k))
      .map(([k, value]) => ({ key: `v3.${k}`, value: k === "cycleLive" ? true : value }));
    const s = mergeV3(b2Rows);
    expect(s.cycleLive).toBe(true);
    expect([s.reviewBotOn, s.feedbackOn, s.coraUpgradesOn]).toEqual([false, false, false]);
  });

  it("loads a stored stats time outside 08:00 to 12:00 as the default instead of failing", () => {
    expect(mergeV3([]).statsAt).toBe("09:00");
    expect(mergeV3([{ key: "v3.statsAt", value: "13:00" }]).statsAt).toBe("09:00");
    expect(mergeV3([{ key: "v3.statsAt", value: "07:59" }]).statsAt).toBe("09:00");
    expect(mergeV3([{ key: "v3.statsAt", value: "08:00" }]).statsAt).toBe("08:00");
    expect(mergeV3([{ key: "v3.statsAt", value: "12:00" }]).statsAt).toBe("12:00");
    expect(mergeV3([{ key: "v3.statsAt", value: "12:01" }]).statsAt).toBe("09:00");
    // A malformed value still fails closed.
    expect(() => mergeV3([{ key: "v3.statsAt", value: "9am" }])).toThrow();
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

  it("reads a stored stats time of 13:00 as 09:00 without throwing", async () => {
    respond = async () => [{ key: "v3.statsAt", value: "13:00" }];
    expect((await readV3Settings()).statsAt).toBe("09:00");
  });
});

describe("saveV3Settings", () => {
  let writes = 0;
  beforeEach(() => {
    writes = 0;
    respond = async () => {
      writes++;
      return [];
    };
  });

  it("saves a stats time only between 08:00 and 12:00", async () => {
    for (const t of ["13:30", "07:59", "12:01"]) await expect(saveV3Settings({ statsAt: t })).rejects.toThrow();
    expect(writes).toBe(0);
    for (const t of ["08:00", "12:00"]) await expect(saveV3Settings({ statsAt: t })).resolves.toBeUndefined();
    // Each accepted save reads the settings, then writes them.
    expect(writes).toBe(4);
  });
});
