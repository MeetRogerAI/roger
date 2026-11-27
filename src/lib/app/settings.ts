import type { Query } from "@/lib/db-query";

/**
 * /app/settings (spec B.10): name, display name, time zone and which emails
 * to receive. Changing the email address is src/lib/auth/email-change.ts.
 *
 * Email preferences use the keys the mail layer reads (src/lib/mail/send.ts,
 * optionalKinds): "monday" for the Monday list, "friday_prompt" for the
 * one-at-a-time order prompt, "stats" for the Wednesday stats email (B2 Unit
 * 8; its unsubscribe link sets the same key). A key set to false switches
 * that email off; billing emails have no key and always go.
 */
export const EMAIL_PREF_KEYS = ["monday", "friday_prompt", "stats"] as const;
export type EmailPrefKey = (typeof EMAIL_PREF_KEYS)[number];

export const MAX_NAME = 80;

/** The time zones offered first; any valid IANA zone is accepted. */
export const COMMON_ZONES = [
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Winnipeg",
  "America/Regina",
  "America/Denver",
  "America/Edmonton",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

export function isTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `prefs`: only the keys to change; a key left out keeps its stored value. */
export type ProfileInput = { name: string; displayName: string; timezone: string; prefs: Partial<Record<EmailPrefKey, boolean>> };
export type ProfileErrors = Partial<Record<"name" | "displayName" | "timezone", string>>;

/** Control characters out, whitespace collapsed. */
const clean = (s: string) =>
  Array.from(s, (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

export function validateProfile(raw: { name: string; displayName: string; timezone: string }): { ok: true; value: Omit<ProfileInput, "prefs"> } | { ok: false; errors: ProfileErrors } {
  const name = clean(raw.name);
  const displayName = clean(raw.displayName);
  const errors: ProfileErrors = {};
  if (!name) errors.name = "Enter your name.";
  else if (name.length > MAX_NAME) errors.name = `Keep it under ${MAX_NAME} characters.`;
  if (displayName.length > MAX_NAME) errors.displayName = `Keep it under ${MAX_NAME} characters.`;
  if (!isTimeZone(raw.timezone)) errors.timezone = "Choose a time zone from the list.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, displayName, timezone: raw.timezone } };
}

/** Saves name, display name, time zone and email preferences for one user. Other preference keys are kept. */
export async function saveProfile(q: Query, userId: string, p: ProfileInput): Promise<void> {
  await q(
    `update users set name = $2, display_name = $3, timezone = $4, email_prefs = email_prefs || $5::jsonb where id = $1`,
    [userId, p.name, p.displayName, p.timezone, JSON.stringify(p.prefs)],
  );
}
