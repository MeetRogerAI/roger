import { AsOfRefused } from "@/lib/clock";
import { stripeGateway } from "@/lib/billing/gateway";
import { stripeAdjustments, stripeBilling, stripeOrders, stripePlans } from "@/lib/billing/subscriptions";
import { cronAuthorized, cronNow } from "@/lib/cron";
import { query } from "@/lib/db-query";
import { runHourly, STRIPE_NOT_SET_UP } from "@/lib/housekeeping/job";
import { readV3Settings } from "@/lib/v3-settings";

export const maxDuration = 300;

/** The hourly pass (vercel.json): charge takeovers, retries, trial closes, and later units' tasks. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const now = await cronNow(request, { money: true });
    const gw = stripeBilling();
    // With no Stripe the pass still runs, for the tasks that need neither Stripe nor the paid cycle (the free-run purge).
    const out = await runHourly(query, { gw, orders: stripeOrders() ?? undefined, adjust: stripeAdjustments() ?? undefined, plans: stripePlans() ?? undefined, card: stripeGateway(), settings: await readV3Settings(), now });
    // The answer with no Stripe keeps its two fields, and adds what did run.
    return Response.json(gw ? out : { status: "skipped", note: STRIPE_NOT_SET_UP, ...out });
  } catch (e) {
    if (e instanceof AsOfRefused) return Response.json({ status: "refused", note: e.message }, { status: 400 });
    console.error("[hourly] cron", e instanceof Error ? e.message : e);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
