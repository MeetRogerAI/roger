import { cookies } from "next/headers";
import { SIGNED_IN_HINT_COOKIE } from "@/lib/auth/hint-cookie";
import { safeNext } from "@/lib/auth/secrets";
import { findSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";

/**
 * Removes a session cookie that no longer works (expired, revoked, forged),
 * then moves on. A page cannot clear cookies while it renders, so the access
 * check sends a dead cookie here. A live session is left alone, so this link
 * cannot be used to sign someone out.
 */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"), "/signin");
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const live = token && hasDb() ? await findSession(query, token).catch(() => null) : null;
  if (!live) {
    jar.delete(SESSION_COOKIE);
    jar.delete(SIGNED_IN_HINT_COOKIE);
  }
  return new Response(null, { status: 303, headers: { location: next, "cache-control": "no-store" } });
}
