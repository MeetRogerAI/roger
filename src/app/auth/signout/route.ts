import { draftMode } from "next/headers";
import { endCurrentSession } from "@/lib/auth/cookies";
import { sameOrigin } from "@/lib/auth/origin";

/**
 * Sign out: POST only, from a page on this site. Ends the stored session,
 * clears both cookies, and answers with a full page load of the home page so
 * no signed-in page stays in the browser's memory.
 *
 * It also ends an admin's preview of the drafts (Draft Mode, plan U9): an
 * admin who signed in by email link is signed out of the admin here too.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return new Response("Forbidden", { status: 403 });
  await endCurrentSession();
  (await draftMode()).disable();
  return new Response(null, { status: 303, headers: { location: "/", "cache-control": "no-store" } });
}

export function GET() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
