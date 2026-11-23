"use server";

import { redirect } from "next/navigation";
import { setSessionCookies } from "@/lib/auth/cookies";
import { consumeToken, userForToken, type UsedToken } from "@/lib/auth/login-link";
import { createSession, findSession, revokeUserSessions } from "@/lib/auth/session";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";

/**
 * The button on the confirm page. Uses the token (once), then starts a new
 * session with a new id. After an email change, every other session ends.
 *
 * Anything that fails after the token is used sends the person back to
 * sign in with a plain "try again" note, never to an error page holding a
 * link that no longer works.
 */
export async function confirmSignIn(fd: FormData) {
  if (!hasDb()) redirect("/signin?e=expired");
  let used: UsedToken | null;
  try {
    used = await consumeToken(query, String(fd.get("t") ?? ""));
  } catch (e) {
    console.error("[confirm] could not use token", e);
    redirect("/signin?e=retry");
  }
  if (!used) redirect("/signin?e=expired");

  let target: string;
  try {
    const user = await userForToken(query, used);
    if (!user) {
      target = used.purpose === "signin" ? "/signin?e=noaccount" : "/signin?e=expired";
    } else {
      const { token } = await createSession(query, user.id, used.purpose === "pilot" ? "pilot" : "email");
      if (used.purpose === "email_change") {
        const mine = await findSession(query, token);
        await revokeUserSessions(query, user.id, mine?.idHash);
      }
      await setSessionCookies(token);
      target = used.nextPath;
    }
  } catch (e) {
    console.error("[confirm] sign-in failed after the token was used", e);
    target = "/signin?e=retry";
  }
  redirect(target);
}
