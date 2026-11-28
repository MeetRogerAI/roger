import { cookies } from "next/headers";
import { setSessionCookies } from "@/lib/auth/cookies";
import { completeGoogle, exchangeCode, GOOGLE_STATE_COOKIE, googleConfig, googleKeys, googleStateCookie, type RefusedReason } from "@/lib/auth/google";
import { findSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { clientIp, hit, limits } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";

const go = (location: string) => new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });

/** Where each refusal sends the visitor: the sign-in page with a plain note. */
const NOTE: Record<RefusedReason, string> = {
  state: "google",
  token: "google",
  unverified: "google_unverified",
  noaccount: "noaccount",
  other_google: "google_other",
  email_first: "google_email_first",
  signup_closed: "google_closed",
  limited: "limited",
};

/** Sign-up is open only when the uncached setting says so; any doubt means closed. */
async function signupOpen(): Promise<boolean> {
  try {
    return (await readV3Settings()).signupOpen;
  } catch {
    return false;
  }
}

/**
 * Google sends the browser back here (plan Unit 18). 404 unless Google's keys
 * are set. The state cookie is cleared whatever happens; a session is made
 * only when src/lib/auth/google.ts accepts the sign-in.
 */
export async function GET(request: Request) {
  const cfg = googleConfig();
  if (!cfg || !hasDb()) return new Response("Not found", { status: 404 });
  const sp = new URL(request.url).searchParams;
  const jar = await cookies();
  const cookieState = jar.get(GOOGLE_STATE_COOKIE)?.value ?? null;
  jar.set(GOOGLE_STATE_COOKIE, "", { ...googleStateCookie(), maxAge: 0 });
  // The person pressed "Cancel" at Google, or Google refused: nothing to use.
  if (sp.get("error")) return go("/signin?e=google_cancelled");
  try {
    if (!(await hit(`signin:ip:${clientIp(request.headers)}`, limits.signinPerIp))) return go("/signin?e=limited");
    // An account this browser already holds by email link may be linked to any Google address.
    const current = await findSession(query, jar.get(SESSION_COOKIE)?.value);
    const signedInAs = current && current.method !== "google" ? current.userId : null;
    const out = await completeGoogle(
      query,
      cfg,
      { state: sp.get("state"), cookieState, code: sp.get("code"), signedInAs },
      { exchange: exchangeCode, keys: googleKeys, signupOpen },
    );
    if (out.kind === "refused") return go(`/signin?e=${NOTE[out.reason]}`);
    if (out.kind === "email_sent") return go("/signin?e=google_check_email");
    await setSessionCookies(out.token);
    return go(out.next);
  } catch (e) {
    // The message only: never the code or a token.
    console.error("[google] callback failed", e instanceof Error ? e.message : "unknown error");
    return go("/signin?e=google");
  }
}
