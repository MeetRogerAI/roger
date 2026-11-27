import { asOfAllowed, AsOfRefused } from "@/lib/clock";
import { cronAuthorized, cronNow } from "@/lib/cron";
import { databaseMarkedNonProduction } from "@/lib/db-environment";
import { query } from "@/lib/db-query";
import { runStatsJob } from "@/lib/growth/stats-job";
import { readV3Settings } from "@/lib/v3-settings";

export const maxDuration = 300;

/**
 * Every ten minutes on Wednesdays, 12:00 to 18:00 UTC (vercel.json): the
 * Wednesday stats email (src/lib/growth/stats-job.ts), from `v3.statsAt`
 * Toronto time. The 18:00 UTC safety net is its own route,
 * `/api/cron/stats-check`; `?check=1` here does the same for manual runs.
 * `?asOf=` moves the clock and `?dryRun=1` only counts who is due; both only
 * on a preview with a test database, never on production.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const now = await cronNow(request);
    const params = new URL(request.url).searchParams;
    const dryRun = params.get("dryRun") === "1";
    const mode = params.get("check") === "1" ? "check" : "send";
    if (dryRun && !asOfAllowed({ deployment: process.env.VERCEL_ENV ?? "development", stripeKey: process.env.STRIPE_SECRET_KEY, databaseMarkedNonProduction: await databaseMarkedNonProduction() })) {
      throw new AsOfRefused("A dry run is not accepted here.");
    }
    return Response.json(await runStatsJob(query, { settings: await readV3Settings(), now, mode, dryRun, budgetMs: 240_000 }));
  } catch (e) {
    if (e instanceof AsOfRefused) return Response.json({ status: "refused", note: e.message }, { status: 400 });
    console.error("[stats] cron", e instanceof Error ? e.message : e);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
