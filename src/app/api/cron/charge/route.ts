import { AsOfRefused, currentMonday, wallParts } from "@/lib/clock";
import { runChargeJob } from "@/lib/billing/charge-job";
import { stripeBilling, stripeOrders } from "@/lib/billing/subscriptions";
import { cronAuthorized, cronNow } from "@/lib/cron";
import { query } from "@/lib/db-query";
import { readV3Settings } from "@/lib/v3-settings";

export const maxDuration = 300;

/** Every ten minutes on Monday mornings (vercel.json, UTC); acts from the charge time on a week Cora finished. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const now = await cronNow(request);
    if (wallParts(now).dow !== 1) return Response.json({ status: "skipped", note: "Charges run on Mondays." });
    const gw = stripeBilling();
    if (!gw) return Response.json({ status: "skipped", note: "Stripe is not configured." });
    const result = await runChargeJob(query, { gw, orders: stripeOrders() ?? undefined, settings: await readV3Settings(), now }, { week: currentMonday(now) });
    return Response.json(result);
  } catch (e) {
    if (e instanceof AsOfRefused) return Response.json({ status: "refused", note: e.message }, { status: 400 });
    console.error("[charge] cron", e instanceof Error ? e.message : e);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
