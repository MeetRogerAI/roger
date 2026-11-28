import { draftMode } from "next/headers";
import { sameOrigin } from "@/lib/auth/origin";
import { exitAddress } from "@/lib/site/content/registry";

/**
 * "Exit preview", in the bar on every previewed page (plan U9): switches Draft
 * Mode off for this browser and reloads the page it was pressed on, now as
 * visitors see it. Anyone may end their own preview, so there is no admin
 * check; nothing is read but the address the browser came from, and that only
 * to pick one of the covered pages (exitAddress). Anything else lands on the
 * homepage.
 *
 * The answer is a full page load, so no page rendered with the drafts stays
 * in the browser's memory to be shown again by Back or by a link.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return new Response("Forbidden", { status: 403 });
  (await draftMode()).disable();
  let from: string | null = null;
  try {
    const referer = request.headers.get("referer");
    if (referer) from = new URL(referer).pathname;
  } catch {
    // No usable address: the homepage.
  }
  return new Response(null, { status: 303, headers: { location: exitAddress(from), "cache-control": "no-store" } });
}

export function GET() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
