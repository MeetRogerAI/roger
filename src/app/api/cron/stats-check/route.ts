import { cronAuthorized, cronNow } from "@/lib/cron";
import { query } from "@/lib/db-query";
import { runStatsJob } from "@/lib/growth/stats-job";
import { readV3Settings } from "@/lib/v3-settings";

export const maxDuration = 60;

/**
 * Wednesdays at 18:00 UTC (vercel.json): the safety net after the stats
 * window closes. It sends nothing; it only counts members still unsent and
 * alerts the admins once (deduped with the send runs' alert). A separate path
 * rather than `/api/cron/stats?check=1`, so it doesn't depend on a cron
 * keeping a query string.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const now = await cronNow(request);
    return Response.json(await runStatsJob(query, { settings: await readV3Settings(), now, mode: "check" }));
  } catch (e) {
    console.error("[stats] check cron", e instanceof Error ? e.message : e);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
