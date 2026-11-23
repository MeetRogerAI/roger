import { cookies } from "next/headers";
import { SIGNED_IN_HINT_COOKIE, SIGNED_IN_HINT_VALUE } from "./hint-cookie";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { revokeSession, SESSION_COOKIE, SESSION_DAYS } from "./session";

/**
 * Setting and clearing the session cookies. Only callable from a Server
 * Action or Route Handler (cookies cannot be set while a page renders).
 */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};

export const hintCookieOptions = { ...sessionCookieOptions, httpOnly: false };

export async function setSessionCookies(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions);
  jar.set(SIGNED_IN_HINT_COOKIE, SIGNED_IN_HINT_VALUE, hintCookieOptions);
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(SIGNED_IN_HINT_COOKIE);
}

/** Signs this browser out: ends the stored session (if it can) and clears both cookies. */
export async function endCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && hasDb()) await revokeSession(query, token).catch((e) => console.error("[auth] could not revoke session", e));
  await clearSessionCookies();
}
