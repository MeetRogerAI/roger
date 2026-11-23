import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { adminEmails } from "./admin-emails";
import { findSession, SESSION_COOKIE, sessionIsAdmin, type SessionInfo } from "./session";
import { safeNext } from "./tokens";

/**
 * The one access check (plan, Unit 4). Every page, server action and route
 * handler that shows or changes private data calls one of these itself. A
 * layout is not a security boundary, and the proxy only redirects visitors
 * with no cookie at all.
 *
 * Reads cookies, so a page that calls it must render it inside <Suspense>.
 */

/**
 * What the session cookie means right now. "error" (the database could not
 * be asked) is kept apart from "none" (asked, and there is no such session),
 * so a blip never signs anyone out.
 */
export type SessionLookup = { state: "live"; session: SessionInfo } | { state: "none"; hasCookie: boolean } | { state: "error" };

export const lookupSession = cache(async (): Promise<SessionLookup> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { state: "none", hasCookie: false };
  if (!hasDb()) return { state: "error" };
  try {
    const session = await findSession(query, token);
    return session ? { state: "live", session } : { state: "none", hasCookie: true };
  } catch (e) {
    console.error("[auth] session lookup failed", e);
    return { state: "error" };
  }
});

/** The session for this request, or null (no session, or it could not be checked). */
export async function getSession(): Promise<SessionInfo | null> {
  const l = await lookupSession();
  return l.state === "live" ? l.session : null;
}

export class SessionCheckUnavailable extends Error {
  constructor() {
    super("We couldn’t check your sign-in just now. Try again in a minute.");
  }
}

/**
 * The signed-in user's session, or a redirect: to /signin when there is no
 * cookie, and through /auth/clear when the cookie is dead, so a stale cookie
 * is removed instead of bouncing the browser around. When the database can't
 * be reached it throws, so the page shows an error and the cookie survives.
 */
export async function requireUser(next: string = "/app"): Promise<SessionInfo> {
  const l = await lookupSession();
  if (l.state === "live") return l.session;
  if (l.state === "error") throw new SessionCheckUnavailable();
  const signin = `/signin?next=${encodeURIComponent(safeNext(next))}`;
  redirect(l.hasCookie ? `/auth/clear?next=${encodeURIComponent(signin)}` : signin);
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

/** The raw session cookie value, for ending the session. */
export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
