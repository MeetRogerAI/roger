/**
 * For POST route handlers (server actions get this check from Next.js): the
 * request must come from a page on this site. A missing Origin is refused.
 */
export function sameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
