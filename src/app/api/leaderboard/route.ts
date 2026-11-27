import { lookupSession } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { leaveLeaderboard, myBoardStanding } from "@/lib/growth/leaderboard";
import { joinAsMember } from "@/lib/growth/leaderboard-join";
import { featureOn } from "@/lib/v3-features";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

/**
 * /api/leaderboard (B2 Unit 7 review: the agent surface). Signed in with the
 * same session cookie as the app, and only ever about the caller:
 * - GET: the caller's own standing {points, rank, optedIn, name, open}.
 * - POST {"name": "..."}: join, or change the board name (same switch, rate
 *   limit and name rules as the page).
 * - DELETE: leave the board (always allowed, like the page).
 * Writes need a JSON body or no body, and a same-origin Origin when one is
 * sent, so a cross-site form cannot post here.
 */

type Me = { userId: string } | Response;

async function me(): Promise<Me> {
  const l = await lookupSession();
  if (l.state === "error") return Response.json({ error: "We couldn’t check your sign-in just now. Try again in a minute." }, { status: 503 });
  if (l.state === "none") return Response.json({ error: "Not signed in." }, { status: 401 });
  const [u] = await query<{ status: string }>(`select status from users where id = $1`, [l.session.userId]);
  if (!u || u.status === "signup") return Response.json({ error: "Finish signing up first." }, { status: 403 });
  return { userId: l.session.userId };
}

function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

async function standing(userId: string, status = 200): Promise<Response> {
  const [s, open] = await Promise.all([myBoardStanding(query, userId), getV3SettingsForDisplay().then((v) => featureOn(v, "leaderboardOn"))]);
  return Response.json({ points: s.points, rank: s.rank, optedIn: s.optedIn, name: s.optedIn ? s.name : null, open }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  const m = await me();
  if (m instanceof Response) return m;
  return standing(m.userId);
}

const STATUS = { closed: 409, limited: 429, invalid: 400, taken: 409, account: 403, not_on_board: 409 } as const;

export async function POST(request: Request) {
  if (crossSite(request)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return Response.json({ error: "Send JSON: {\"name\": \"...\"}." }, { status: 415 });
  const m = await me();
  if (m instanceof Response) return m;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (!body || typeof body.name !== "string") return Response.json({ error: "Send JSON: {\"name\": \"...\"}." }, { status: 400 });
  const r = await joinAsMember(query, m.userId, body.name.slice(0, 200));
  if (!r.ok) return Response.json({ error: r.message, reason: r.reason }, { status: STATUS[r.reason] });
  return standing(m.userId);
}

export async function DELETE(request: Request) {
  if (crossSite(request)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  const m = await me();
  if (m instanceof Response) return m;
  await leaveLeaderboard(query, m.userId);
  return standing(m.userId);
}
