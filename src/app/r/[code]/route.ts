import { NextResponse, type NextRequest } from "next/server";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { rememberReferrer } from "@/lib/referrals/cookie";

/**
 * A referral link, /r/{code} (spec B.15, B2 plan Unit 3). A valid code is
 * remembered for 60 days in the signed `roger-ref` cookie, which sign-up
 * reads when the sign-up link is asked for; an unknown code stores nothing.
 * Either way the visitor goes to the home page. (Codes are 50 random bits,
 * so whether a cookie was set is not an oracle worth hiding.) The first
 * referrer wins (`rememberReferrer`).
 *
 * Works whatever `v3.referralsOn` says, so links shared before the switch is
 * on are not lost. The cookie is set on the redirect response itself.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.headers.set("cache-control", "no-store");
  res.headers.set("x-robots-tag", "noindex");
  if (!hasDb()) return res;
  try {
    await rememberReferrer(query, { get: (name) => request.cookies.get(name), set: (name, value, options) => res.cookies.set(name, value, options) }, code, "link", new Date());
  } catch (e) {
    console.error("[r] referral link not stored", e instanceof Error ? e.message : e);
  }
  return res;
}
