import { query } from "@/lib/db-query";
import { appUrl } from "@/lib/mail/layout";
import { instructionAgent, instructionsForUser, recordInstructionFetch } from "@/lib/zack/instructions";
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
    const askedAgent = url.searchParams.get("agent");
    const test = url.searchParams.get("test") === "1";
    const text = await instructionsForUser(query, user, { base: appUrl, askedAgent, test });
    // Which version this run will use (B3 plan Unit 2). Recording it never fails the fetch.
    await recordInstructionFetch(query, { userId: user.id, test, agent: instructionAgent(user, askedAgent) }).catch((e) =>
      console.error("[zack] instructions fetch not recorded", e instanceof Error ? e.message : e),
    );
    return new Response(text, { headers: { ...PRIVATE_HEADERS, "content-type": "text/markdown; charset=utf-8" } });
  } catch (e) {
    // Never log the request address: it may carry the key.
    console.error("[zack] instructions failed", e instanceof Error ? e.message : e);
    return bare(503);
  }
}
