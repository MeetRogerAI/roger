import { query } from "@/lib/db-query";
import { icsResponse, notFound } from "@/lib/growth/session-calendar";
import { guestForToken } from "@/lib/growth/session-guests";
import { sessionOn, sessionPlan, sessionsOn } from "@/lib/growth/sessions";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * "Add to calendar" for a guest (B2 plan Unit 9): only after they said
 * they're coming, and only until the session ends. Anything else, a bad
 * token included, is the same 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await readV3Settings().catch(() => null);
  const plan = settings && sessionsOn(settings) ? sessionPlan(settings) : null;
  if (!plan) return notFound();
  let g;
  try {
    g = await guestForToken(query, token);
  } catch (e) {
    console.error("[g] calendar lookup failed", e instanceof Error ? e.message : e);
    return new Response("Try again in a minute.", { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  const now = new Date();
  if (!g || !g.rsvpAt) return notFound();
  const s = sessionOn(plan, g.sessionDate);
  if (s.end.getTime() <= now.getTime()) return notFound();
  return icsResponse(s, plan.link, now);
}
