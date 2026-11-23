import { query } from "@/lib/db-query";
import { appUrl } from "@/lib/mail/layout";
import { instructionsForUser } from "@/lib/zack/instructions";
import { authenticate, bare, PRIVATE_HEADERS } from "@/lib/zack/key";

/**
 * GET /api/zack/instructions?agent={slug} (spec B.5 "Fetch"): Zack 2.0 for
 * that agent, the user's own rules, then where to send. Read fresh on every
 * fetch, so a change on the Zack page applies to the next run.
 */
export async function GET(request: Request) {
  try {
    const user = await authenticate(query, request);
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const text = await instructionsForUser(query, user, { base: appUrl, askedAgent: url.searchParams.get("agent"), test: url.searchParams.get("test") === "1" });
    return new Response(text, { headers: { ...PRIVATE_HEADERS, "content-type": "text/markdown; charset=utf-8" } });
  } catch (e) {
    // Never log the request address: it may carry the key.
    console.error("[zack] instructions failed", e instanceof Error ? e.message : e);
    return bare(503);
  }
}
