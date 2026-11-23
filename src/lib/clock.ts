/**
 * Roger's one clock. Every job and date rule asks this module what week a
 * moment belongs to and when a Toronto wall time falls, so the weekly cycle
 * behaves the same across the clock changes.
 *
 * Nothing here reads the current time on its own: callers pass the moment in.
 * Jobs get it from `jobNow()`, which honours an "as of" value only where the
 * guard allows (never on production).
 */

export const TORONTO = "America/Toronto";

const DAY_MS = 86_400_000;

export type WallParts = { year: number; month: number; day: number; hour: number; minute: number; dow: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** What a wall clock in `timeZone` reads at `moment`. */
export function wallParts(moment: Date, timeZone = TORONTO): WallParts {
  const p = Object.fromEntries(fmt(timeZone).formatToParts(moment).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, dow: DOW[p.weekday] };
}

/** "YYYY-MM-DD" for a calendar date. */
export function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** Calendar arithmetic on "YYYY-MM-DD" strings (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "HH:MM" → minutes after midnight. Throws on anything else. */
export function parseHm(hm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm);
  if (!m) throw new Error(`Not a time of day: ${hm}`);
  return +m[1] * 60 + +m[2];
}

/**
 * The instant at which a wall clock in `timeZone` reads `date` `hm`.
 * In the hour skipped in spring this gives the instant an hour later; in the
 * hour repeated in autumn it gives the first of the two.
 */
export function wallToInstant(date: string, hm: string, timeZone = TORONTO): Date {
  const mins = parseHm(hm);
  const [y, mo, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, mo - 1, d, Math.floor(mins / 60), mins % 60);
  const offsetAt = (instant: number) => {
    const p = wallParts(new Date(instant), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(instant / 60_000) * 60_000;
  };
  // The zone's offset a day either side of the date covers any single change.
  const before = offsetAt(wall - DAY_MS);
  const after = offsetAt(wall + DAY_MS);
  const candidates = [...new Set([before, after])].map((o) => wall - o).filter((t) => offsetAt(t) === wall - t);
  if (candidates.length) return new Date(Math.min(...candidates));
  // The wall time was skipped: read it with the offset in force before the gap.
  return new Date(wall - before);
}

/**
 * The Monday ("YYYY-MM-DD") whose list a moment counts toward. Anything up to
 * and including the cutoff minute on Sunday (Toronto) counts for the next
 * day; anything after it counts for the Monday a week later.
 */
export function weekOf(moment: Date, cutoff = "23:59"): string {
  const p = wallParts(moment);
  const today = isoDate(p.year, p.month, p.day);
  const ahead = (8 - p.dow) % 7 || 7; // Sun → 1, Mon → 7, Tue → 6 …
  const afterCutoff = p.dow === 0 && p.hour * 60 + p.minute > parseHm(cutoff);
  return addDays(today, afterCutoff ? ahead + 7 : ahead);
}

/** The Monday of the week a moment is in (Toronto), i.e. the week now running. */
export function currentMonday(moment: Date): string {
  const p = wallParts(moment);
  const back = (p.dow + 6) % 7; // Mon → 0, Sun → 6
  return addDays(isoDate(p.year, p.month, p.day), -back);
}

/** The instant of the Sunday cutoff that closes intake for the list on `monday`. */
export function cutoffInstant(monday: string, cutoff = "23:59"): Date {
  // The cutoff minute itself still counts, so intake closes at its end.
  return new Date(wallToInstant(addDays(monday, -1), cutoff).getTime() + 60_000);
}

/** Toronto calendar date ("YYYY-MM-DD") of a moment. */
export function torontoDate(moment: Date): string {
  const p = wallParts(moment);
  return isoDate(p.year, p.month, p.day);
}

/** Whole Toronto calendar days from `from` to `to` (dates, "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** True when `moment` is at or after Toronto `hm` on `date`. */
export function isAtOrPast(moment: Date, date: string, hm: string): boolean {
  return moment.getTime() >= wallToInstant(date, hm).getTime();
}

// ---------------------------------------------------------------------------
// "As of": moving the clock for tests and previews, never on production.

export type AsOfConditions = {
  /** VERCEL_ENV, or "development" locally. */
  deployment: string | undefined;
  /** STRIPE_SECRET_KEY, or undefined when not configured. */
  stripeKey: string | undefined;
  /** Whether the database holds the non-production marker row. */
  databaseMarkedNonProduction: boolean;
};

/**
 * An "as of" value may be used only when all three hold: the deployment is
 * not production, Stripe is in test mode (or not configured), and the
 * database says it is not production.
 */
export function asOfAllowed(c: AsOfConditions): boolean {
  if (c.deployment === "production") return false;
  if (c.stripeKey && !c.stripeKey.startsWith("sk_test_") && !c.stripeKey.startsWith("rk_test_")) return false;
  return c.databaseMarkedNonProduction;
}

/**
 * A job that can move money (the charge job, the hourly pass, "charge and
 * send") run "as of" another time: only where an "as of" is allowed at all
 * (so on a database marked non-production) and with a Stripe key that is
 * clearly a test key; never with no key, never a live one.
 *
 * Stripe does not follow the "as of" time: subscriptions, invoices and
 * renewals happen at Stripe's own clock. A run "as of" a later date therefore
 * gets a subscription anchored at the real time, and renewals that never come
 * at the simulated dates. To move through billing months, attach the sandbox
 * customers to a Stripe test clock and advance it to the same time as the
 * "as of" value (plan Unit 19's scenario runs).
 */
export function moneyAsOfAllowed(c: AsOfConditions): boolean {
  return asOfAllowed(c) && Boolean(c.stripeKey && (c.stripeKey.startsWith("sk_test_") || c.stripeKey.startsWith("rk_test_")));
}

/**
 * The moment a job should act as of. `asOf` (an ISO timestamp, usually from a
 * request) is used only when allowed; a malformed value is refused rather
 * than silently ignored, so a test never runs against the real time by
 * mistake.
 */
export function jobNow(asOf: string | null | undefined, allowed: boolean, real: Date = new Date()): Date {
  if (asOf == null || asOf === "") return real;
  if (!allowed) throw new AsOfRefused("An as-of time is not accepted here.");
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) throw new AsOfRefused(`Not a timestamp: ${asOf}`);
  return new Date(t);
}

export class AsOfRefused extends Error {}

/** True for a real calendar date written "YYYY-MM-DD" (2026-13-45 is not one). */
export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
