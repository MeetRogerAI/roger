import { cookies } from "next/headers";
import { SIGNED_IN_HINT_COOKIE } from "@/lib/auth/hint-cookie";
import { sameOrigin } from "@/lib/auth/origin";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";

/**
 * Sign out: POST only, from a page on this site. Ends the stored session,
 * clears both cookies, and answers with a full page load of the home page so
 * no signed-in page stays in the browser's memory.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return new Response("Forbidden", { status: 403 });
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && hasDb()) await revokeSession(query, token).catch(() => {});
  jar.delete(SESSION_COOKIE);
  jar.delete(SIGNED_IN_HINT_COOKIE);
  return new Response(null, { status: 303, headers: { location: "/", "cache-control": "no-store" } });
}

export function GET() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
