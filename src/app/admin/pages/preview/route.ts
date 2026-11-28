import { draftMode } from "next/headers";
import { isAdmin } from "@/lib/admin-auth";
import { sameOrigin } from "@/lib/auth/origin";
import { PAGES_ADDRESS } from "@/lib/site/content/labels";
import { previewAddress } from "@/lib/site/content/registry";

/**
 * Preview (plan U9, R14, KTD7): the Preview buttons of the Pages screens post
 * here, with the id of the page to preview. For an admin it switches on Next's
 * Draft Mode for this browser and sends it to that page's public address,
 * where the pages show the drafts (src/lib/site/content/read.ts).
 *
 * A route handler and not a server action, because the button opens the page
 * in a new tab (a form with target="_blank"), which a server action's form
 * cannot do; and the answer is a full page load, so the new tab starts with
 * nothing cached from before.
 *
 * - The admin check comes first, before anything sent is read. Anyone else
 *   is sent to the admin's sign-in, and Draft Mode stays off.
 * - The form gives a page id, never an address. The address is looked up in
 *   the registry; an id that is no page's sends the admin back to Pages. So
 *   this can never send a browser anywhere outside the site's covered pages.
 * - POST only, from a page of this site (the sign-out route's check).
 */
const to = (location: string) => new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!(await isAdmin())) return to("/admin");
  if (!sameOrigin(request.headers)) return new Response("Forbidden", { status: 403 });
  let page: FormDataEntryValue | null = null;
  try {
    page = (await request.formData()).get("page");
  } catch {
    // Not a form: no page.
  }
  const address = typeof page === "string" ? previewAddress(page) : null;
  if (!address) return to(PAGES_ADDRESS);
  (await draftMode()).enable();
  return to(address);
}

export function GET() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
