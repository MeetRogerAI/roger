import { endCurrentSession } from "@/lib/auth/cookies";
import { sameOrigin } from "@/lib/auth/origin";

/**
 * Sign out: POST only, from a page on this site. Ends the stored session,
 * clears both cookies, and answers with a full page load of the home page so
 * no signed-in page stays in the browser's memory.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return new Response("Forbidden", { status: 403 });
  await endCurrentSession();
  return new Response(null, { status: 303, headers: { location: "/", "cache-control": "no-store" } });
}

export function GET() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
