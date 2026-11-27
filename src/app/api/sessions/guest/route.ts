import { lookupSession } from "@/lib/auth/access";
import { crossSite } from "@/lib/api-origin";
import { query } from "@/lib/db-query";
import { inviteAsMember } from "@/lib/growth/session-guests";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * POST /api/sessions/guest {"name": "...", "email": "..."} (B2 Unit 9
 * review: the agent surface). Invites the caller's one guest to the next
 * session, through the same entry as the page (`inviteAsMember`: rate limit,
 * settings, access, name and address rules, the weekly and daily limits).
 * Needs a JSON body and a same-origin Origin when one is sent.
 */
const STATUS: Record<string, number> = { closed: 409, locked: 403, name: 400, email: 400, self: 400, blocked: 422, already: 409, recent: 409, cap: 429, limited: 429 };

export async function POST(request: Request) {
  if (crossSite(request)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
    return Response.json({ error: 'Send JSON: {"name": "...", "email": "..."}.' }, { status: 415 });
  const l = await lookupSession();
  if (l.state === "error") return Response.json({ error: "We couldn’t check your sign-in just now. Try again in a minute." }, { status: 503 });
  if (l.state === "none") return Response.json({ error: "Not signed in." }, { status: 401 });
  const [u] = await query<{ status: string }>(`select status from users where id = $1`, [l.session.userId]);
  if (!u || u.status === "signup") return Response.json({ error: "Finish signing up first." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; email?: unknown } | null;
  if (!body || typeof body.name !== "string" || typeof body.email !== "string") return Response.json({ error: 'Send JSON: {"name": "...", "email": "..."}.' }, { status: 400 });
  const settings = await readV3Settings().catch(() => null);
  const r = await inviteAsMember(query, { userId: l.session.userId, name: body.name.slice(0, 200), email: body.email.slice(0, 300), settings, now: new Date() });
  if (!r.ok) return Response.json({ error: r.message, reason: r.reason, field: r.field ?? null }, { status: STATUS[r.reason] ?? 400 });
  return Response.json({ invited: true, emailSent: r.sent === "sent" || r.sent === "already", message: r.message }, { status: r.sent === "failed" ? 202 : 201 });
}
