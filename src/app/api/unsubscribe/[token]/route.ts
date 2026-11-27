import { NextResponse, type NextRequest } from "next/server";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { unsubscribe } from "@/lib/mail/unsubscribe";

/**
 * The List-Unsubscribe target of the stats email (B2 plan Unit 8).
 *
 * - POST is RFC 8058 one-click: the mail app posts
 *   `List-Unsubscribe=One-Click` and the stats email is switched off for the
 *   token's member (Monday emails unchanged). No cookie or session is needed;
 *   the signed token is the authority. A bad token changes nothing.
 * - GET never changes anything (link scanners follow links): it goes to the
 *   page at /u/{token}, where one button does it.
 *
 * The page cannot live at the same path as a route handler, hence this
 * separate address.
 */
const headers = { "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" };

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!hasDb()) return new NextResponse("Unavailable", { status: 503, headers });
  try {
    const done = await unsubscribe(query, token);
    if (!done) return new NextResponse("This link isn’t valid.", { status: 400, headers });
    return new NextResponse("You won’t get the Wednesday stats email any more.", { status: 200, headers });
  } catch (e) {
    console.error("[unsubscribe] one-click", e instanceof Error ? e.message : e);
    return new NextResponse("Something went wrong. Try again.", { status: 500, headers });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = NextResponse.redirect(new URL(`/u/${encodeURIComponent(token)}`, request.url), 303);
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}
