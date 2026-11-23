/**
 * The signed-in hint. Set beside the real (httpOnly) session cookie so the
 * public header can show "Open Roger" without a server round trip. It holds a
 * constant "1" and nothing else, and it gates nothing: every page that shows
 * private data checks the real session itself.
 */
export const SIGNED_IN_HINT_COOKIE = "roger-in";
export const SIGNED_IN_HINT_VALUE = "1";

/** Whether a Cookie header string (or document.cookie) carries the hint. */
export function hasSignedInHint(cookieString: string): boolean {
  return cookieString.split(";").some((c) => c.trim() === `${SIGNED_IN_HINT_COOKIE}=${SIGNED_IN_HINT_VALUE}`);
}
