import { lookupSession } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { myGuest } from "@/lib/growth/session-guests";
import { nextSession, sessionAccess, sessionPlan, sessionsOn } from "@/lib/growth/sessions";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * GET /api/sessions/next (B2 Unit 9 review: the agent surface). The caller's
 * view of the next group session, signed in with the app's session cookie:
 * {open, start, end, access, link, guest}. `link` is the Meet link for
 * paying and sponsored members only (null otherwise), and `guest` is the
 * caller's own guest for that session (name and email state) or null.
 * `open: false` while sessions are off.
 */
export async function GET() {
  const l = await lookupSession();
  if (l.state === "error") return Response.json({ error: "We couldn’t check your sign-in just now. Try again in a minute." }, { status: 503 });
  if (l.state === "none") return Response.json({ error: "Not signed in." }, { status: 401 });
  const [u] = await query<{ status: string; sponsored: boolean }>(`select status, sponsor_id is not null as sponsored from users where id = $1`, [l.session.userId]);
  if (!u || u.status === "signup") return Response.json({ error: "Finish signing up first." }, { status: 403 });
  const headers = { "cache-control": "private, no-store" };
  const settings = await readV3Settings().catch(() => null);
  const plan = settings && sessionsOn(settings) ? sessionPlan(settings) : null;
  if (!plan) return Response.json({ open: false }, { headers });
  const now = new Date();
  const s = nextSession(plan, now);
  const access = sessionAccess(u);
  const guest = access === "full" ? await myGuest(query, l.session.userId, s.date, now) : null;
  return Response.json(
    {
      open: true,
      date: s.date,
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      access,
      link: access === "full" ? plan.link : null,
      guest: guest ? { name: guest.name, emailState: guest.emailState } : null,
    },
    { headers },
  );
}
