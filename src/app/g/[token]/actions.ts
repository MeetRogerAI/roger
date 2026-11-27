"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import type { Query } from "@/lib/db-query";
import { query } from "@/lib/db-query";
import { guestForToken, rsvpGuest } from "@/lib/growth/session-guests";
import { sessionPassed, sessionPlan, sessionsOn } from "@/lib/growth/sessions";
import { ensureReferralCode } from "@/lib/referrals/code";
import { rememberReferrer } from "@/lib/referrals/cookie";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * The guest page's actions (B2 plan Unit 9). Both are public: the token is
 * the only key. A page can't set cookies while it renders, so the page calls
 * `rememberInviterAction` once it has loaded, and the RSVP sets it too.
 */

/** Remembers the inviter as this browser's referrer (signed `roger-ref`, purpose "guest"), unless one is already held. */
async function rememberInviter(q: Query, inviterId: string, now: Date): Promise<boolean> {
  const code = await ensureReferralCode(q, inviterId);
  if (!code) return false;
  return rememberReferrer(q, await cookies(), code, "guest", now);
}

export async function rememberInviterAction(token: string): Promise<void> {
  if (typeof token !== "string") return;
  try {
    const g = await guestForToken(query, token);
    if (g) await rememberInviter(query, g.inviterId, new Date());
  } catch (e) {
    console.error("[g] inviter not remembered", e instanceof Error ? e.message : e);
  }
}

export type RsvpState = { status: "idle" | "error"; at?: number };

/** "I'm coming": records the RSVP, which shows the Meet link. Refused once the session has passed, or when settings can't be read. */
export async function rsvpAction(_prev: RsvpState, fd: FormData): Promise<RsvpState> {
  const token = typeof fd.get("token") === "string" ? String(fd.get("token")) : "";
  const now = new Date();
  const settings = await readV3Settings().catch(() => null);
  const plan = settings && sessionsOn(settings) ? sessionPlan(settings) : null;
  const g = await guestForToken(query, token).catch(() => null);
  if (!g || !plan || sessionPassed(plan, g.sessionDate, now)) {
    refresh();
    return { status: "error", at: Date.now() };
  }
  if (!(await rsvpGuest(query, token, now))) return { status: "error", at: Date.now() };
  await rememberInviter(query, g.inviterId, now).catch((e) => console.error("[g] inviter not remembered", e instanceof Error ? e.message : e));
  refresh();
  return { status: "idle", at: Date.now() };
}
