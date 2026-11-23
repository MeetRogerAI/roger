import Stripe from "stripe";

/**
 * The Stripe client, pinned to the API version this code was written
 * against. Webhook endpoints must be created with the same version so event
 * payloads match these types.
 *
 * Returns null when STRIPE_SECRET_KEY is not set: pages then say billing is
 * not switched on, instead of failing.
 */
export const STRIPE_API_VERSION = "2026-11-18.endive" as const;

let client: Stripe | null | undefined;

export function stripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  client = key ? new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 1, timeout: 10_000, typescript: true }) : null;
  return client;
}

/** "test", "live", or "off": shown to admins so nobody confuses a sandbox with real money (R12). */
export function stripeMode(): "test" | "live" | "off" {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return "off";
}
