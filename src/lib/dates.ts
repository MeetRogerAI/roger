/**
 * Date words shared by pages and emails (moved from the welcome email,
 * whole-branch review W8, so pages and billing no longer import an email
 * template for them).
 */

/** "Monday, December 7" for a "YYYY-MM-DD" Monday. */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
