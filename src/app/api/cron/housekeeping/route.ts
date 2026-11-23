import { AsOfRefused } from "@/lib/clock";
import { stripeBilling, stripeOrders } from "@/lib/billing/subscriptions";
import { cronAuthorized, cronNow } from "@/lib/cron";
import { query } from "@/lib/db-query";
import { runHourly } from "@/lib/housekeeping/job";
import { readV3Settings } from "@/lib/v3-settings";

export const maxDuration = 300;

/** The hourly pass (vercel.json): charge takeovers, retries, trial closes, and later units' tasks. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const now = await cronNow(request);
    const gw = stripeBilling();
    if (!gw) return Response.json({ status: "skipped", note: "Stripe is not configured." });
    return Response.json(await runHourly(query, { gw, orders: stripeOrders() ?? undefined, settings: await readV3Settings(), now }));
  } catch (e) {
    if (e instanceof AsOfRefused) return Response.json({ status: "refused", note: e.message }, { status: 400 });
    console.error("[hourly] cron", e instanceof Error ? e.message : e);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
