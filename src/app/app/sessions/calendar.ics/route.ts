import { lookupSession } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { icsResponse, notFound } from "@/lib/growth/session-calendar";
import { nextSession, sessionAccess, sessionPlan, sessionsOn } from "@/lib/growth/sessions";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * "Add to calendar" for a member (B2 plan Unit 9): the next session's .ics,
 * which carries the Meet link, so only for paying and sponsored members
 * (`sessionAccess` full). Settings are read uncached and fail closed.
 */
export async function GET() {
  const l = await lookupSession();
  if (l.state === "error") return new Response("Try again in a minute.", { status: 503 });
  if (l.state === "none") return new Response("Not signed in.", { status: 401, headers: { "cache-control": "private, no-store" } });
  const [u] = await query<{ status: string; sponsored: boolean }>(`select status, sponsor_id is not null as sponsored from users where id = $1`, [l.session.userId]);
  const settings = await readV3Settings().catch(() => null);
  const plan = settings && sessionsOn(settings) ? sessionPlan(settings) : null;
  if (!u || !plan || sessionAccess(u) !== "full") return notFound();
  const now = new Date();
  return icsResponse(nextSession(plan, now), plan.link, now);
}
