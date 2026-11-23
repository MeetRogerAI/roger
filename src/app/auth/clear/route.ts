import { cookies } from "next/headers";
import { SIGNED_IN_HINT_COOKIE } from "@/lib/auth/hint-cookie";
import { findSession, SESSION_COOKIE } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/tokens";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";

/**
 * Removes a session cookie that no longer works (expired, revoked, forged),
 * then moves on. A page cannot clear cookies while it renders, so the access
 * check sends a dead cookie here.
 *
 * Cookies are removed only when the database answered "no such session". A
 * live session is left alone, so this link cannot sign someone out, and so is
 * one that could not be checked, so a database blip signs nobody out.
 */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"), "/signin");
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  let dead = false;
  if (token && hasDb()) {
    try {
      dead = (await findSession(query, token)) === null;
    } catch (e) {
      console.error("[auth/clear] session lookup failed", e);
    }
  }
  if (dead) {
    jar.delete(SESSION_COOKIE);
    jar.delete(SIGNED_IN_HINT_COOKIE);
  }
  return new Response(null, { status: 303, headers: { location: next, "cache-control": "no-store" } });
}
