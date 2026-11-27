import { NextResponse, type NextRequest } from "next/server";
import { SIGNED_IN_HINT_COOKIE, SIGNED_IN_HINT_VALUE } from "@/lib/auth/hint-cookie";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth/session";
import { cleanSponsorCode, SPONSOR_COOKIE, sponsorCookieOptions } from "@/lib/sponsors/code";

/**
 * A cheap first filter for /app and /admin, from cookies alone. It never
 * reads the database and never grants access: every page and action checks
 * the session itself (src/lib/auth/access.ts).
 *
 * - /app with no session cookie goes to /signin.
 * - With a session cookie, both cookies' lifetimes are renewed on page loads
 *   (spec B.3, "renewed on use"). The proxy cannot tell a live session from a
 *   dead one; the stored session decides, and a dead cookie is removed by
 *   /auth/clear when a page checks it.
 * - /admin is left to its own gate, which still offers the shared password
 *   until the email check is confirmed on production.
 * - /start?sponsor= moves the sponsor code into a cookie (B2 Unit 10).
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = request.nextUrl;

  // /start?sponsor={code} (B2 Unit 10): the code goes into a cookie and the visitor is sent on to the same
  // URL without it, so it leaves the address bar and browser history. A malformed code is just dropped.
  // Nothing else happens on /start: session renewal is only for /app and /admin.
  if (pathname === "/start") return request.nextUrl.searchParams.has("sponsor") ? sponsorRedirect(request) : NextResponse.next();

  // /app/dev holds builder previews with made-up data (404 on production).
  if (!token && pathname.startsWith("/app") && !pathname.startsWith("/app/dev")) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  // Renew only on ordinary page loads. A form post or server action (sign-out among them)
  // may be clearing these cookies, and a renewal on the same response could put them back.
  const plainGet = request.method === "GET" && !request.headers.has("next-action");
  if (token && plainGet) {
    const base = { secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS * 86_400 };
    res.cookies.set(SESSION_COOKIE, token, { ...base, httpOnly: true });
    res.cookies.set(SIGNED_IN_HINT_COOKIE, SIGNED_IN_HINT_VALUE, { ...base, httpOnly: false });
  }
  return res;
}

/** The sponsor code moved from the query string into the `roger-sponsor` cookie, on a redirect to the clean URL. */
export function sponsorRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = cleanSponsorCode(url.searchParams.get("sponsor"));
  url.searchParams.delete("sponsor");
  const res = NextResponse.redirect(url, 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  if (code) res.cookies.set(SPONSOR_COOKIE, code, sponsorCookieOptions());
  return res;
}

export const config = { matcher: ["/app/:path*", "/admin/:path*", "/start"] };
