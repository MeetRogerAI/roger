import { cookies } from "next/headers";
import { beginGoogle, GOOGLE_STATE_COOKIE, googleConfig, googleStateCookie } from "@/lib/auth/google";
import { safeNext } from "@/lib/auth/tokens";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { clientIp, hit, limits } from "@/lib/rate-limit";

const go = (location: string) => new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });

/**
 * "Sign in with Google" from /signin (plan Unit 18): stores this sign-in's
 * state and sends the browser to Google. 404 unless Google's keys are set.
 * Sign-up starts from the account step's own action, which carries the
 * sign-up's details (src/app/start/actions.ts).
 */
export async function GET(request: Request) {
  const cfg = googleConfig();
  if (!cfg || !hasDb()) return new Response("Not found", { status: 404 });
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  try {
    if (!(await hit(`google:ip:${clientIp(request.headers)}`, limits.googleStartPerIp))) return go("/signin?e=limited");
    const { url, state } = await beginGoogle(query, cfg, { next });
    (await cookies()).set(GOOGLE_STATE_COOKIE, state, googleStateCookie());
    return go(url);
  } catch (e) {
    console.error("[google] start failed", e instanceof Error ? e.message : e);
    return go("/signin?e=google");
  }
}
