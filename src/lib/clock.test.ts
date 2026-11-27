import { describe, expect, it } from "vitest";
import {
  addDays,
  addWallDays,
  asOfAllowed,
  AsOfRefused,
  currentMonday,
  cutoffInstant,
  daysBetween,
  isAtOrPast,
  jobNow,
  parseHm,
  wallParts,
  wallToInstant,
  weekOf,
} from "./clock";

const at = (iso: string) => new Date(iso);

describe("addWallDays", () => {
  it("keeps the Toronto wall time across the clock changes (23- and 25-hour days)", () => {
    // Monday 2027-03-01 7:05 AM EST + 14 days = Monday 2027-03-15 7:05 AM EDT.
    expect(addWallDays(at("2027-03-01T12:05:00Z"), 14).toISOString()).toBe("2027-03-15T11:05:00.000Z");
    // Monday 2027-10-25 7:05 AM EDT + 14 days = Monday 2027-11-08 7:05 AM EST.
    expect(addWallDays(at("2027-10-25T11:05:00Z"), 14).toISOString()).toBe("2027-11-08T12:05:00.000Z");
    // Seconds and milliseconds are kept; no change in between is plain 24-hour days.
    expect(addWallDays(at("2026-12-01T15:00:07.250Z"), 21).toISOString()).toBe("2026-12-22T15:00:07.250Z");
  });
});

describe("weekOf", () => {
  it("counts Sunday 11:58 PM Toronto toward the next day", () => {
    // Sunday 2026-11-22 23:58 EST = 2026-11-23 04:58 UTC
    expect(weekOf(at("2026-11-23T04:58:00Z"))).toBe("2026-11-23");
  });

  it("counts the cutoff minute itself toward the next day", () => {
    expect(weekOf(at("2026-11-23T04:59:30Z"))).toBe("2026-11-23");
  });

  it("counts Monday 12:00 AM toward the following Monday", () => {
    expect(weekOf(at("2026-11-23T05:00:00Z"))).toBe("2026-11-30");
  });

  it("counts mid-week toward the coming Monday", () => {
    // Wednesday 2026-11-25 noon EST
    expect(weekOf(at("2026-11-25T17:00:00Z"))).toBe("2026-11-30");
  });

  it("honours a different cutoff", () => {
    // Sunday 2026-11-22 21:30 EST
    const m = at("2026-11-23T02:30:00Z");
    expect(weekOf(m, "21:00")).toBe("2026-11-30");
    expect(weekOf(m, "22:00")).toBe("2026-11-23");
  });

  it("maps each moment of the 25-hour Sunday (clocks back, 2026-11-01) to one week", () => {
    // 1:30 AM happens twice that Sunday; both belong to Monday 2026-11-02.
    expect(weekOf(at("2026-11-01T05:30:00Z"))).toBe("2026-11-02"); // 1:30 EDT
    expect(weekOf(at("2026-11-01T06:30:00Z"))).toBe("2026-11-02"); // 1:30 EST
    expect(weekOf(at("2026-11-02T04:59:00Z"))).toBe("2026-11-02"); // 23:59 EST
    expect(weekOf(at("2026-11-02T05:00:00Z"))).toBe("2026-11-09"); // Mon 00:00 EST
  });

  it("maps each moment of the 23-hour Sunday (clocks forward, 2027-03-14) to one week", () => {
    expect(weekOf(at("2027-03-14T06:59:00Z"))).toBe("2027-03-15"); // 1:59 EST
    expect(weekOf(at("2027-03-14T07:00:00Z"))).toBe("2027-03-15"); // 3:00 EDT
    expect(weekOf(at("2027-03-15T03:59:00Z"))).toBe("2027-03-15"); // 23:59 EDT
    expect(weekOf(at("2027-03-15T04:00:00Z"))).toBe("2027-03-22"); // Mon 00:00 EDT
  });
});

describe("Toronto wall times", () => {
  it("puts 1:00 AM Monday at 05:00 UTC in summer and 06:00 UTC in winter", () => {
    expect(wallToInstant("2026-07-06", "01:00").toISOString()).toBe("2026-07-06T05:00:00.000Z");
    expect(wallToInstant("2026-11-23", "01:00").toISOString()).toBe("2026-11-23T06:00:00.000Z");
  });

  it("gates on the local hour, not the UTC hour", () => {
    // Summer Monday: 05:00 UTC is 1:00 AM; 06:00 UTC is 2:00 AM.
    expect(isAtOrPast(at("2026-07-06T05:00:00Z"), "2026-07-06", "01:00")).toBe(true);
    expect(isAtOrPast(at("2026-07-06T04:59:00Z"), "2026-07-06", "01:00")).toBe(false);
    // Winter Monday: 05:00 UTC is midnight, not yet 1:00 AM.
    expect(isAtOrPast(at("2026-11-23T05:00:00Z"), "2026-11-23", "01:00")).toBe(false);
    expect(isAtOrPast(at("2026-11-23T06:00:00Z"), "2026-11-23", "01:00")).toBe(true);
  });

  it("takes the first of the two 1:30 AMs on the night the clocks go back", () => {
    expect(wallToInstant("2026-11-01", "01:30").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("moves a time in the skipped spring hour forward", () => {
    expect(wallToInstant("2027-03-14", "02:30").toISOString()).toBe("2027-03-14T07:30:00.000Z");
  });

  // A summer date on purpose. British Columbia stopped changing its clocks in
  // 2026, so Vancouver's winter offset depends on how new the runtime's time
  // zone data is; in July it is seven hours behind UTC under old and new rules.
  it("resolves Sunday 6:00 PM in Vancouver to the right instant", () => {
    expect(wallToInstant("2026-07-12", "18:00", "America/Vancouver").toISOString()).toBe("2026-07-13T01:00:00.000Z");
    expect(wallParts(at("2026-07-13T01:00:00Z"), "America/Vancouver")).toMatchObject({ hour: 18, dow: 0 });
  });

  it("agrees with itself in a Vancouver winter, whatever the runtime's time zone data says", () => {
    const sixPm = wallToInstant("2026-12-13", "18:00", "America/Vancouver");
    expect(wallParts(sixPm, "America/Vancouver")).toMatchObject({ year: 2026, month: 12, day: 13, hour: 18, minute: 0, dow: 0 });
  });

  it("closes intake one minute after the cutoff minute begins", () => {
    expect(cutoffInstant("2026-11-23").toISOString()).toBe("2026-11-23T05:00:00.000Z");
    expect(weekOf(new Date(cutoffInstant("2026-11-23").getTime() - 1))).toBe("2026-11-23");
    expect(weekOf(cutoffInstant("2026-11-23"))).toBe("2026-11-30");
  });

  it("finds the Monday of the running week", () => {
    expect(currentMonday(at("2026-11-23T06:00:00Z"))).toBe("2026-11-23");
    expect(currentMonday(at("2026-11-29T23:00:00Z"))).toBe("2026-11-23"); // Sunday 6 PM EST
  });
});

describe("date helpers", () => {
  it("adds calendar days across months and the clock change", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-11-23", -1)).toBe("2026-11-22");
    expect(daysBetween("2026-10-30", "2026-11-20")).toBe(21);
  });

  it("refuses a malformed time of day", () => {
    expect(() => parseHm("7:00")).toThrow();
    expect(() => parseHm("24:00")).toThrow();
    expect(parseHm("06:30")).toBe(390);
  });
});

describe("as of", () => {
  const ok = { deployment: "preview", stripeKey: "sk_test_abc", databaseMarkedNonProduction: true };

  it("is allowed only when all three conditions hold", () => {
    expect(asOfAllowed(ok)).toBe(true);
    expect(asOfAllowed({ ...ok, deployment: "production" })).toBe(false);
    expect(asOfAllowed({ ...ok, stripeKey: "sk_live_abc" })).toBe(false);
    expect(asOfAllowed({ ...ok, databaseMarkedNonProduction: false })).toBe(false);
    expect(asOfAllowed({ ...ok, stripeKey: undefined })).toBe(true);
  });

  it("returns the real time when no as-of value is given", () => {
    const real = at("2026-11-22T12:00:00Z");
    expect(jobNow(undefined, false, real)).toBe(real);
    expect(jobNow("", true, real)).toBe(real);
  });

  it("uses an allowed as-of value", () => {
    expect(jobNow("2026-12-07T11:00:00Z", true).toISOString()).toBe("2026-12-07T11:00:00.000Z");
  });

  it("refuses an as-of value where it is not allowed, instead of ignoring it", () => {
    expect(() => jobNow("2026-12-07T11:00:00Z", false)).toThrow(AsOfRefused);
  });

  it("refuses a malformed as-of value", () => {
    expect(() => jobNow("next monday", true)).toThrow(AsOfRefused);
  });
});
