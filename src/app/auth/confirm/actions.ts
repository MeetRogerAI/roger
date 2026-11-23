"use server";

import { redirect } from "next/navigation";
import { setSessionCookies } from "@/lib/auth/cookies";
import { consumeToken, userForToken } from "@/lib/auth/login-link";
import { createSession, findSession, revokeUserSessions } from "@/lib/auth/session";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";

/**
 * The button on the confirm page. Uses the token (once), then starts a new
 * session with a new id. After an email change, every other session ends.
 */
export async function confirmSignIn(fd: FormData) {
  if (!hasDb()) redirect("/signin?e=expired");
  const used = await consumeToken(query, String(fd.get("t") ?? ""));
  if (!used) redirect("/signin?e=expired");
  const user = await userForToken(query, used);
  if (!user) redirect(used.purpose === "signin" ? "/signin?e=noaccount" : "/signin?e=expired");

  const { token } = await createSession(query, user.id, used.purpose === "pilot" ? "pilot" : "email");
  if (used.purpose === "email_change") {
    const mine = await findSession(query, token);
    await revokeUserSessions(query, user.id, mine?.idHash);
  }
  await setSessionCookies(token);
  redirect(used.nextPath);
}
