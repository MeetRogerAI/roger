import { siteConfig } from "@/data/config";

/**
 * The sponsor code's form and the cookie that carries it to the quiz (B2
 * plan Unit 10). Kept apart from sponsors.ts, with nothing heavy imported,
 * because the proxy uses it.
 */

export const SPONSOR_COOKIE = "roger-sponsor";
const COOKIE_DAYS = 7;

/** What every refused code says, whatever the reason (unknown, revoked, full). */
export const SPONSOR_INVALID = `This sponsor link isn’t valid. Write to us at ${siteConfig.contactEmail}.`;

/** The sponsor cookie lives only under /start, like the sign-up draft. */
export const sponsorCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/start",
  maxAge: COOKIE_DAYS * 86_400,
});

/** A code as typed or pasted: case, spaces and dashes are ignored. Anything else is not a code. */
export function cleanSponsorCode(raw: string | null | undefined): string | null {
  const c = (raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z2-7]{12}$/.test(c) ? c : null;
}

