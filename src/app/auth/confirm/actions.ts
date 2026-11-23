"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { setSessionCookies } from "@/lib/auth/cookies";
import { approveEmailChange, confirmEmailChange, noticeEmailChanged, syncCustomerEmail } from "@/lib/auth/email-change";
import { consumeToken, userForToken, type UsedToken } from "@/lib/auth/login-link";
import { createSession, findSession, revokeUserSessions, SESSION_COOKIE } from "@/lib/auth/session";
import { stripe } from "@/lib/billing/stripe";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";

const log = (what: string) => (e: unknown) => console.error(`[confirm] ${what}`, e instanceof Error ? e.message : e);

/** Stripe's customer gets the account's current address. A failure never undoes the change: the hourly pass retries. */
async function syncStripe(userId: string) {
  const s = stripe();
  if (s) await syncCustomerEmail(query, userId, async (customer, email) => void (await s.customers.update(customer, { email }))).catch(log("stripe sync"));
}

/**
 * Step 3 of an email change (src/lib/auth/email-change.ts). The browser is
 * signed in only if it already holds a live session for this user: a link
 * alone never makes a session. Returns where to go next.
 */
async function confirmChange(used: UsedToken): Promise<string> {
  const changed = await confirmEmailChange(query, used);
  // Stale, superseded, or the address was taken meanwhile: a neutral note, never a hint about who.
  if (!changed) return "/app/settings?email=failed";

  const mine = await findSession(query, (await cookies()).get(SESSION_COOKIE)?.value);
  let target: string;
  if (mine && mine.userId === changed.id) {
    const { token } = await createSession(query, changed.id, "email");
    const fresh = await findSession(query, token);
    await revokeUserSessions(query, changed.id, fresh?.idHash);
    await setSessionCookies(token);
    target = used.nextPath;
  } else {
    await revokeUserSessions(query, changed.id);
    target = "/signin?e=changed";
  }
  await syncStripe(changed.id);
  await noticeEmailChanged(query, changed, used.hash).catch(log("old-address notice"));
  return target;
}

/**
 * The button on the confirm page. Uses the token (once).
 * - Sign-in and pilot links start a new session with a new id.
 * - An approval (email change, step 2) signs nobody in. Its work runs after
 *   the response, so the reply and its timing never depend on the outcome.
 * - A confirmation (email change, step 3) applies the change.
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

  if (used.purpose === "email_approve") {
    const approved = used;
    after(() => approveEmailChange(query, approved).catch(log("approve")));
    redirect("/signin?e=approved");
  }

  let target: string;
  try {
    if (used.purpose === "email_change") {
      target = await confirmChange(used);
    } else {
      const user = await userForToken(query, used);
      if (!user) {
        target = used.purpose === "signin" ? "/signin?e=noaccount" : "/signin?e=expired";
      } else {
        const { token } = await createSession(query, user.id, used.purpose === "pilot" ? "pilot" : "email");
        await setSessionCookies(token);
        target = used.nextPath;
      }
    }
  } catch (e) {
    console.error("[confirm] failed after the link was used", e);
    target = "/signin?e=retry";
  }
  redirect(target);
}
