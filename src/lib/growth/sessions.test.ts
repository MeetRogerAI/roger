import { describe, expect, it } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";
import { cleanGuestName, inviterLabel } from "./session-guests";
import { icsEscape, nextSession, parseSessionDay, parseSessionTime, sessionAccess, sessionIcs, sessionOn, sessionPlan, sessionsOn, sessionWhen } from "./sessions";

/** B2 plan Unit 9: the next session, who sees it, and the calendar file. Guests: session-guests.test.ts. */

const plan = { dow: 2, hm: "12:00", link: "https://meet.google.com/abc-defg-hij" };
const live = { ...mergeV3([]), signupOpen: true, cycleLive: true, sessionDay: "Tuesday", sessionTime: "12:00", sessionLink: plan.link };

describe("reading the S11 settings", () => {
  it("reads day names leniently", () => {
    expect(["Tuesday", "tue", "Tuesdays", " TUES "].map(parseSessionDay)).toEqual([2, 2, 2, 2]);
    expect(parseSessionDay("Sunday")).toBe(0);
    expect(parseSessionDay("")).toBeNull();
    expect(parseSessionDay("Tu")).toBeNull();
    expect(parseSessionDay("someday")).toBeNull();
  });

  it("reads 24-hour and am/pm times", () => {
    expect(parseSessionTime("12:00")).toBe("12:00");
    expect(parseSessionTime("09:30")).toBe("09:30");
    expect(parseSessionTime("1:30 pm")).toBe("13:30");
    expect(parseSessionTime("12 PM")).toBe("12:00");
    expect(parseSessionTime("12:15 a.m.")).toBe("00:15");
    expect(parseSessionTime("noon")).toBe("12:00");
    expect(parseSessionTime("13")).toBeNull();
    expect(parseSessionTime("25:00")).toBeNull();
    expect(parseSessionTime("13:00 pm")).toBeNull();
    expect(parseSessionTime("")).toBeNull();
  });

  it("has no session while any setting is empty or unreadable", () => {
    expect(sessionPlan(live)).toEqual(plan);
    expect(sessionPlan({ ...live, sessionDay: "" })).toBeNull();
    expect(sessionPlan({ ...live, sessionTime: "" })).toBeNull();
    expect(sessionPlan({ ...live, sessionLink: "" })).toBeNull();
    expect(sessionPlan({ ...live, sessionTime: "lunchtime" })).toBeNull();
    expect(sessionPlan({ ...live, sessionLink: "http://meet.google.com/x" })).toBeNull();
  });

  it("is on only with the v3 app live and every setting set (origin R2)", () => {
    expect(sessionsOn(live)).toBe(true);
    expect(sessionsOn({ ...live, cycleLive: false })).toBe(false);
    expect(sessionsOn({ ...live, signupOpen: false })).toBe(false);
    expect(sessionsOn({ ...live, sessionLink: "" })).toBe(false);
    expect(sessionsOn(mergeV3([]))).toBe(false);
  });
});

describe("the next session (Toronto time)", () => {
  it("is the coming Tuesday at noon, from a Monday", () => {
    const s = nextSession(plan, new Date("2026-11-30T15:00:00Z"));
    expect(s.date).toBe("2026-12-01");
    expect(s.start.toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(sessionWhen(s)).toBe("Tuesday, December 1 at 12:00 PM Toronto time");
  });

  it("stays on today's session while it runs, then moves a week on", () => {
    expect(nextSession(plan, new Date("2026-12-01T17:30:00Z")).date).toBe("2026-12-01");
    expect(nextSession(plan, new Date("2026-12-01T18:00:00Z")).date).toBe("2026-12-08");
  });

  it("keeps the wall time across the autumn clock change", () => {
    // Tuesday Oct 27 is summer time (UTC-4); Tuesday Nov 3 is winter time (UTC-5).
    const before = nextSession(plan, new Date("2026-10-26T12:00:00Z"));
    expect(before.start.toISOString()).toBe("2026-10-27T16:00:00.000Z");
    const after = nextSession(plan, new Date("2026-10-28T12:00:00Z"));
    expect(after.date).toBe("2026-11-03");
    expect(after.start.toISOString()).toBe("2026-11-03T17:00:00.000Z");
  });

  it("keeps the wall time across the spring clock change, and when today is the clock-change Sunday", () => {
    const sunday = { ...plan, dow: 0, hm: "10:00" };
    const s = nextSession(sunday, new Date("2027-03-14T05:00:00Z"));
    expect(s.date).toBe("2027-03-14");
    expect(s.start.toISOString()).toBe("2027-03-14T14:00:00.000Z");
    expect(nextSession(plan, new Date("2027-03-10T12:00:00Z")).start.toISOString()).toBe("2027-03-16T16:00:00.000Z");
  });
});

describe("who sees the session", () => {
  it("paying and sponsored members get it all; trials and the rest see it locked", () => {
    expect(sessionAccess({ status: "active", sponsored: false })).toBe("full");
    expect(sessionAccess({ status: "trial", sponsored: true })).toBe("full");
    expect(sessionAccess({ status: "active", sponsored: true })).toBe("full");
    expect(sessionAccess({ status: "trial", sponsored: false })).toBe("locked");
    expect(sessionAccess({ status: "held", sponsored: false })).toBe("locked");
    expect(sessionAccess({ status: "cancelled", sponsored: false })).toBe("locked");
  });

  it("shows a guest the inviter's display name only when it passes the name rules", () => {
    expect(inviterLabel("Ken R.")).toBe("Ken R.");
    expect(inviterLabel("")).toBe("A Roger member");
    expect(inviterLabel("Roger Support")).toBe("A Roger member");
    expect(inviterLabel("Rоger")).toBe("A Roger member"); // Cyrillic o
    expect(inviterLabel(null)).toBe("A Roger member");
  });

  it("takes guest names in letters only", () => {
    expect(cleanGuestName("  Zoë   Gauthier ")).toBe("Zoë Gauthier");
    expect(cleanGuestName("O’Brien-Smith")).toBe("O’Brien-Smith");
    expect(cleanGuestName("")).toBeNull();
    expect(cleanGuestName("Visit www.spam.example")).toBeNull();
    expect(cleanGuestName("Ana 2")).toBeNull();
    expect(cleanGuestName("J.R. Smith")).toBe("J.R. Smith");
    expect(cleanGuestName("x".repeat(61))).toBeNull();
  });
});

describe("the calendar file", () => {
  const s = sessionOn(plan, "2026-12-01");
  const ics = sessionIcs(s, plan.link, new Date("2026-11-27T10:00:00Z"));

  it("is a one-event calendar in UTC with CRLF lines", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261201T170000Z\r\n");
    expect(ics).toContain("DTEND:20261201T180000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261127T100000Z\r\n");
    expect(ics).toContain("UID:roger-session-2026-12-01@meetroger.ai\r\n");
    expect(ics).toContain("SUMMARY:Roger group session\r\n");
    expect(ics).toContain(`LOCATION:${plan.link}\r\n`);
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("escapes text values", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const odd = sessionIcs(s, "https://meet.example/x?a=1,2;3", new Date("2026-11-27T10:00:00Z"));
    expect(odd).toContain("LOCATION:https://meet.example/x?a=1\\,2\\;3");
  });

  it("folds long lines without splitting a character", () => {
    const long = sessionIcs(s, `https://meet.google.com/${"é".repeat(60)}`, new Date("2026-11-27T10:00:00Z"));
    const unfolded = long.replace(/\r\n /g, "");
    expect(unfolded).toContain(`LOCATION:https://meet.google.com/${"é".repeat(60)}`);
    expect(long.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe("the next session around midnight and the clock changes", () => {
  it("returns yesterday's late session while it is still running (23:30 at 00:10)", () => {
    const late = { ...plan, hm: "23:30" };
    const s = nextSession(late, new Date("2026-12-02T05:10:00Z")); // Wednesday 00:10 Toronto
    expect(s.date).toBe("2026-12-01");
    expect(s.start.toISOString()).toBe("2026-12-02T04:30:00.000Z");
    expect(nextSession(late, new Date("2026-12-02T05:31:00Z")).date).toBe("2026-12-08");
  });

  it("handles a late Saturday session running into the autumn clock-change Sunday", () => {
    const sat = { ...plan, dow: 6, hm: "23:30" };
    // Sunday Nov 1 2026, 00:10 summer time (04:10Z); the session began 23:30 EDT Saturday (03:30Z).
    const s = nextSession(sat, new Date("2026-11-01T04:10:00Z"));
    expect(s.date).toBe("2026-10-31");
    expect(s.start.toISOString()).toBe("2026-11-01T03:30:00.000Z");
  });

  it("reads a start time in the repeated autumn hour as the first one", () => {
    const sun = { ...plan, dow: 0, hm: "01:30" };
    expect(nextSession(sun, new Date("2026-10-30T12:00:00Z")).start.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("moves a start time skipped in spring (02:30) to the hour after", () => {
    const sun = { ...plan, dow: 0, hm: "02:30" };
    const s = nextSession(sun, new Date("2027-03-12T12:00:00Z"));
    expect(s.date).toBe("2027-03-14");
    expect(s.start.toISOString()).toBe("2027-03-14T07:30:00.000Z"); // 03:30 EDT
    expect(s.end.getTime() - s.start.getTime()).toBe(3_600_000);
  });
});
