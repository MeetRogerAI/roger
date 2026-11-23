import { describe, expect, it } from "vitest";
import { cutoffInstant } from "@/lib/clock";
import { anniversary, countMisses, periodAt, placement } from "./period";

describe("the billing period (spec B.9: the subscription's own monthly period)", () => {
  // Monday 2026-11-30, 6:05 AM Toronto (EST) = 11:05 UTC.
  const FIRST = "2026-11-30T11:05:00.000Z";

  it("steps a month at a time from the first charge, clamping to short months and returning to the anchor day", () => {
    const jan31 = new Date("2026-01-31T11:00:00Z");
    expect(anniversary(jan31, 1).toISOString()).toBe("2026-02-28T11:00:00.000Z");
    expect(anniversary(jan31, 2).toISOString()).toBe("2026-03-31T11:00:00.000Z");
    expect(anniversary(jan31, 12).toISOString()).toBe("2027-01-31T11:00:00.000Z");
  });

  it("places a moment in the period that contains it", () => {
    const p = periodAt(FIRST, new Date("2026-12-14T05:00:00Z"))!;
    expect(p.start.toISOString()).toBe(FIRST);
    expect(p.end.toISOString()).toBe("2026-12-30T11:05:00.000Z");
    expect(p.startDate).toBe("2026-11-30");
    expect(p.endDate).toBe("2026-12-30");
    expect(periodAt(FIRST, new Date("2027-01-02T00:00:00Z"))!.startDate).toBe("2026-12-30");
  });

  it("has no period before the first charge", () => {
    expect(periodAt(FIRST, new Date("2026-11-30T05:00:00Z"))).toBeNull();
    expect(periodAt(null, new Date())).toBeNull();
  });

  it("puts the Sunday cutoff before a 6:00 AM Monday renewal in the period that is ending", () => {
    // First charged Monday 2026-06-01 at 6:05 AM Toronto (EDT); its anniversary 2027-02-01 is also a Monday.
    const first = "2026-06-01T10:05:00.000Z";
    const cutoff = cutoffInstant("2027-02-01"); // the end of Sunday 2027-01-31, Toronto
    const p = periodAt(first, cutoff)!;
    expect(p.startDate).toBe("2027-01-01");
    expect(p.end.toISOString()).toBe("2027-02-01T10:05:00.000Z");
    expect(p.end > cutoff).toBe(true);
  });

  it("counts only missed weeks: contributed, by choice and excused never count (spec check 25)", () => {
    expect(countMisses(["contributed", "missed", "by_choice", "excused", "missed"])).toBe(2);
    expect(countMisses(["excused", "by_choice"])).toBe(0);
  });

  it("puts an adjustment on the coming invoice when it is three or more days away", () => {
    const now = new Date("2026-12-14T12:00:00Z");
    const r = placement(FIRST, now)!;
    expect(r.carried).toBe(false);
    expect(r.invoiceAt.toISOString()).toBe("2026-12-30T11:05:00.000Z");
    expect(r.createAfter).toEqual(now);
  });

  it("waits two hours after a renewal before making an item, so it is not swept into that renewal's invoice", () => {
    const now = new Date("2026-12-30T12:00:00Z"); // 55 minutes after the renewal
    const r = placement(FIRST, now)!;
    expect(r.invoiceAt.toISOString()).toBe("2027-01-30T11:05:00.000Z");
    expect(r.createAfter.toISOString()).toBe("2026-12-30T13:05:00.000Z");
  });

  it("carries an adjustment found within three days of the renewal to the invoice after, created once the renewal has been made", () => {
    const now = new Date("2026-12-28T12:00:00Z"); // two days before the renewal
    const r = placement(FIRST, now)!;
    expect(r.carried).toBe(true);
    expect(r.invoiceAt.toISOString()).toBe("2027-01-30T11:05:00.000Z");
    expect(r.createAfter.toISOString()).toBe("2026-12-30T13:05:00.000Z");
  });
});
