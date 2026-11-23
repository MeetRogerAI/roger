import { asOfAllowed, AsOfRefused, isAtOrPast, jobNow, wallParts } from "@/lib/clock";
import { runCoraJob } from "@/lib/cora/job";
import { gatewayFitModel } from "@/lib/cora/fit";
import { gatewayMergeModel } from "@/lib/cora/merge";
import { databaseMarkedNonProduction } from "@/lib/db-environment";
import { query } from "@/lib/db-query";
import { gatewayModel } from "@/lib/intake/model";
import { readV3Settings } from "@/lib/v3-settings";

export const maxDuration = 300;

/**
 * Every ten minutes on Monday (vercel.json, in UTC so it covers 1:00 AM to
 * noon in Toronto in both summer and winter time). It does nothing before
 * Cora's start time; each run continues the week from its recorded phase.
 * `?asOf=` moves the clock on a preview with a test database, never on
 * production.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const asOf = url.searchParams.get("asOf");
    const allowed = asOf
      ? asOfAllowed({ deployment: process.env.VERCEL_ENV ?? "development", stripeKey: process.env.STRIPE_SECRET_KEY, databaseMarkedNonProduction: await databaseMarkedNonProduction() })
      : false;
    const now = jobNow(asOf, allowed);
    const settings = await readV3Settings();
    const p = wallParts(now);
    if (p.dow !== 1) return Response.json({ status: "skipped", note: "Cora runs on Mondays." });
    const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    if (!isAtOrPast(now, today, settings.coraAt)) return Response.json({ status: "skipped", note: `Before ${settings.coraAt} Toronto.` });
    const result = await runCoraJob(query, { intake: gatewayModel, merge: gatewayMergeModel, fit: gatewayFitModel }, { now, settings, week: today, budgetMs: 240_000 });
    return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (e) {
    if (e instanceof AsOfRefused) return Response.json({ status: "refused", note: e.message }, { status: 400 });
    console.error("[cora] cron", e instanceof Error ? e.message : e);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
