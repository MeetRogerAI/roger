import { addDays, isoDate, wallParts, wallToInstant } from "@/lib/clock";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * The weekly group session (spec B.15 "Group session", B2 plan Unit 9,
 * origin R13). Admins set the day, time and Google Meet link (launch list
 * S11: `v3.sessionDay`, `v3.sessionTime`, `v3.sessionLink`). While any of
 * the three is empty, or the day or time can't be read, there is no session:
 * the card, the nav link and invitations all stay hidden (origin R2).
 *
 * The settings schema keeps day and time as free text (tightening a
 * fail-closed read schema would brick saved data), so they are read here,
 * leniently: "Tuesday", "Tue" or "Tuesdays"; "12:00", "12:00 PM", "noon".
 * Times are Toronto wall times, so a session stays at the same local hour
 * across the clock changes. Guests live in session-guests.ts.
 */

export type SessionSettings = Pick<V3Settings, "sessionDay" | "sessionTime" | "sessionLink">;
export type SessionPlan = { dow: number; hm: string; link: string };
/** One session: its Toronto date ("YYYY-MM-DD") and when it starts and ends. */
export type Session = { date: string; start: Date; end: Date };

/** How long a session lasts: the calendar entry's length, and when a guest's page expires. */
export const SESSION_MINUTES = 60;

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** 0 (Sunday) to 6, or null. */
export function parseSessionDay(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!s) return null;
  const i = DAYS.findIndex((d) => s === d || s === `${d}s` || (s.length >= 3 && d.startsWith(s)));
  return i < 0 ? null : i;
}

/** "HH:MM" (24-hour), or null. Accepts "13:30", "1:30 pm", "1 PM", "12 noon", "noon". */
export function parseSessionTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/\./g, "");
  if (!s) return null;
  if (s === "noon" || s === "12 noon") return "12:00";
  const m = /^(\d{1,2})(?::([0-5]\d))? ?(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (!m[2] || h > 23) return null;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/** The session plan, or null while any S11 setting is empty or unreadable. */
export function sessionPlan(s: SessionSettings): SessionPlan | null {
  const link = s.sessionLink.trim();
  if (!link || !/^https:\/\//i.test(link)) return null;
  const dow = parseSessionDay(s.sessionDay);
  const hm = parseSessionTime(s.sessionTime);
  return dow === null || hm === null ? null : { dow, hm, link };
}

/**
 * Whether group sessions show at all: the v3 app is live (sign-up open and
 * the cycle running, origin R2) and all three S11 settings are filled.
 * Sessions have no switch of their own.
 */
export function sessionsOn(s: SessionSettings & Pick<V3Settings, "signupOpen" | "cycleLive">): boolean {
  return s.signupOpen === true && s.cycleLive === true && sessionPlan(s) !== null;
}

/** The session on a given Toronto date, at the plan's time (the date's weekday is not checked). */
export function sessionOn(plan: Pick<SessionPlan, "hm">, date: string): Session {
  const start = wallToInstant(date, plan.hm);
  return { date, start, end: new Date(start.getTime() + SESSION_MINUTES * 60_000) };
}

/**
 * The next session that hasn't ended at `now`: one in progress counts, even
 * one that began yesterday (a 23:30 session at 00:10). Toronto wall time, so
 * DST-safe; a start time skipped in spring reads as the hour after
 * (`wallToInstant`).
 */
export function nextSession(plan: SessionPlan, now: Date): Session {
  const p = wallParts(now);
  const today = isoDate(p.year, p.month, p.day);
  for (let d = -1; d <= 7; d++) {
    const date = addDays(today, d);
    if ((p.dow + d + 7) % 7 !== plan.dow) continue;
    const s = sessionOn(plan, date);
    if (s.end.getTime() > now.getTime()) return s;
  }
  return sessionOn(plan, addDays(today, 7 + ((plan.dow - p.dow + 7) % 7)));
}

/** "Tuesday, December 1 at 12:00 PM Toronto time". */
export function sessionWhen(s: Session): string {
  const day = s.start.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Toronto" });
  const time = s.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });
  return `${day} at ${time} Toronto time`;
}

/** Whether `date` is a session that has already ended at `now`. */
export const sessionPassed = (plan: Pick<SessionPlan, "hm">, date: string, now: Date) => sessionOn(plan, date).end.getTime() <= now.getTime();

// ---------------------------------------------------------------------------
// Who sees what

/**
 * - `full`: paying members (status active) and sponsored members (trial or
 *   active): the card, the Meet link, "Add to calendar" and one guest.
 * - `locked`: everyone else signed in (a trial, a held or cancelled
 *   account): the card greyed out, "Opens when you subscribe", and no link
 *   anywhere in the page.
 */
export type SessionAccess = "full" | "locked";
export function sessionAccess(u: { status: string; sponsored: boolean }): SessionAccess {
  if (u.status === "active") return "full";
  if (u.sponsored && u.status === "trial") return "full";
  return "locked";
}

// ---------------------------------------------------------------------------
// Calendar file

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (RFC 5545 3.1), never inside a UTF-8 character. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * The calendar file for one session, with the Meet link as its location.
 * Times in UTC. Served only to someone allowed the link
 * (/app/sessions/calendar.ics, /g/{token}/calendar.ics).
 */
export function sessionIcs(s: Session, link: string, now: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Roger//Group session//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:roger-session-${s.date}@meetroger.ai`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(s.start)}`,
    `DTEND:${icsTime(s.end)}`,
    `SUMMARY:${icsEscape("Roger group session")}`,
    `DESCRIPTION:${icsEscape(`Join on Google Meet: ${link}`)}`,
    `LOCATION:${icsEscape(link)}`,
    `URL:${link.replace(/[\r\n]/g, "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

