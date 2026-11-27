import type Stripe from "stripe";
import { stripeCredits, stripeGateway } from "@/lib/billing/gateway";
import { stripe } from "@/lib/billing/stripe";
import { stripeAdjustments, stripeBilling, stripeOrders, stripePlans } from "@/lib/billing/subscriptions";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { readV3Settings } from "@/lib/v3-settings";

export const maxDuration = 60;

/**
 * Stripe's webhook (spec B.9). The signature is checked on the raw body
 * before anything else. Any failure answers 500 so Stripe sends the event
 * again; a bad signature answers 400 and does nothing.
 */
export async function POST(request: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const gw = stripeGateway(s);
  if (!s || !secret || !gw || !hasDb()) return new Response("Billing is not configured", { status: 503 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await s.webhooks.constructEventAsync(body, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  try {
    // Settings are read only by the events that need them, so a settings problem cannot block other events.
    const outcome = await handleStripeEvent(query, gw, event, {
      getSettings: readV3Settings,
      adjust: stripeAdjustments(s) ?? undefined,
      plans: stripePlans(s) ?? undefined,
      billing: stripeBilling(s) ?? undefined,
      orders: stripeOrders(s) ?? undefined,
      credits: stripeCredits(s) ?? undefined,
    });
    return Response.json({ received: true, outcome });
  } catch (e) {
    console.error(`[stripe] ${event.type} ${event.id} failed`, e);
    return new Response("Handler failed", { status: 500 });
  }
}
