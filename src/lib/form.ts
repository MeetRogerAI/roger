/**
 * Small helpers shared by the v3 forms and server actions, so validation
 * reads the same everywhere.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A plausible email address, at most 254 characters. */
export function isEmail(s: string): boolean {
  return s.length <= 254 && EMAIL_SHAPE.test(s);
}

/** A trimmed string field from a form, capped. Anything that is not a string becomes "". */
export function field(fd: FormData, name: string, max = 300): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** The hidden "_gotcha" field was filled in: a bot. Pair with <Honeypot /> in the form. */
export function honeypotTripped(fd: FormData): boolean {
  return field(fd, "_gotcha").length > 0;
}
