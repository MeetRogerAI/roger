import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { adminEmails } from "@/lib/mail/send";
import { safeNext } from "./secrets";
import { findSession, SESSION_COOKIE, sessionIsAdmin, type SessionInfo } from "./session";

/**
 * The one access check (plan, Unit 4). Every page, server action and route
 * handler that shows or changes private data calls one of these itself. A
 * layout is not a security boundary, and the proxy only redirects visitors
 * with no cookie at all.
 *
 * Reads cookies, so a page that calls it must render it inside <Suspense>.
 */

/** The session for this request, or null. Deduplicated within one render. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  if (!hasDb()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await findSession(query, token);
  } catch {
    return null;
  }
});

/**
 * The signed-in user's session, or a redirect: to /signin when there is no
 * cookie, and through /auth/clear when the cookie is dead, so a stale cookie
 * is removed instead of bouncing the browser around.
 */
export async function requireUser(next: string = "/app"): Promise<SessionInfo> {
  const s = await getSession();
  if (s) return s;
  const hasCookie = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  const signin = `/signin?next=${encodeURIComponent(safeNext(next))}`;
  redirect(hasCookie ? `/auth/clear?next=${encodeURIComponent(signin)}` : signin);
}

/** True when this request comes from an admin signed in by email link (spec B.3). */
export async function isEmailAdmin(): Promise<boolean> {
  const s = await getSession();
  return Boolean(s && sessionIsAdmin(s, adminEmails()));
}

/** For server actions and route handlers that must not run for anyone else. */
export async function requireUserForAction(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) throw new Error("Not signed in");
  return s;
}
