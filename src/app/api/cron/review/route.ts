import { asOfAllowed, AsOfRefused } from "@/lib/clock";
import { cronAuthorized, cronNow } from "@/lib/cron";
import { databaseMarkedNonProduction } from "@/lib/db-environment";
import { query } from "@/lib/db-query";
import { runReviewJob } from "@/lib/review/job";
import { gatewayReviewModel } from "@/lib/review/model";
import { readV3Settings } from "@/lib/v3-settings";

/** The review model's call has a 240-second timeout (src/lib/review/model.ts); the run's claim lease is 330 seconds. */
export const maxDuration = 300;

/**
 * Fridays at :15 and :45 past 14, 15 and 16 UTC (vercel.json): the weekly
 * review bot (src/lib/review/job.ts), once per review week, behind
 * `v3.reviewBotOn`. /api/cron/review-close at 17:15 UTC (same handler) is the
 * close tick: the job reads the clock (any Friday tick from 17:00 only closes
 * the window: no claim, no lease, no model call), so the mode never depends
 * on a cron keeping a query string, as with /api/cron/stats-check. `?asOf=` moves the clock and `?dryRun=1` only reports
 * what a tick would do; both only on a preview with a test database, never
 * on production.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const now = await cronNow(request);
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    if (dryRun && !asOfAllowed({ deployment: process.env.VERCEL_ENV ?? "development", stripeKey: process.env.STRIPE_SECRET_KEY, databaseMarkedNonProduction: await databaseMarkedNonProduction() })) {
      throw new AsOfRefused("A dry run is not accepted here.");
    }
    return Response.json(await runReviewJob(query, { settings: await readV3Settings(), now, model: gatewayReviewModel, trigger: "schedule", dryRun }));
  } catch (e) {
    if (e instanceof AsOfRefused) return Response.json({ status: "refused", note: e.message }, { status: 400 });
    console.error("[review] cron", e instanceof Error ? e.name : "Error");
    return Response.json({ status: "error" }, { status: 500 });
  }
}
