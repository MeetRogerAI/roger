import Stripe from "stripe";
import { isHardDecline } from "./claims";
import { stripe } from "./stripe";

/**
 * The Stripe calls for charging (plan "Every charge carries its claim id").
 * Subscriptions are created with the claim id in their metadata and
 * `error_if_incomplete`, so a failed first payment creates nothing. Before any
 * call is repeated, the subscription is looked up by its claim id.
 */
export type ChargeResult =
  | { kind: "succeeded"; object: string; amountCents: number | null; currency: string | null }
  | { kind: "declined"; code: string | null; hard: boolean }
  /** Stripe could not work out the tax for the address: an admin looks, the user is not asked for a new card. */
  | { kind: "tax_address"; error: string }
  /** The call may have happened: never treated as a decline; settled later by looking it up. */
  | { kind: "unknown"; error: string }
  /** Refused for a reason a retry cannot fix (our setup, a bad request). */
  | { kind: "error"; error: string };

export type FoundSubscription = { id: string; status: string; claimId: string | null };

export interface BillingGateway {
  /** The first invoice's total with tax, from Stripe's preview. */
  preview(o: { customer: string; price: string }): Promise<{ totalCents: number; currency: string }>;
  /** The customer's subscriptions that are live (or were made by a claim). */
  subscriptions(customer: string): Promise<FoundSubscription[]>;
  createSubscription(o: { customer: string; price: string; claimId: string; userId: string; idempotencyKey: string }): Promise<ChargeResult>;
}

const LIVE = new Set(["active", "trialing", "past_due", "unpaid"]);
export const isLive = (s: FoundSubscription) => LIVE.has(s.status);

/** How a Stripe error ends a claim. */
export function classify(e: unknown): ChargeResult {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string } | null)?.code ?? "";
  // The bank wants the person to confirm (3D Secure). Nobody is there at 6 AM: a soft decline, with the update-card email.
  if (/requires_action|authentication_required/i.test(code) || /requires_action|authentication_required|3d secure/i.test(msg)) {
    return { kind: "declined", code: code || "authentication_required", hard: false };
  }
  // The same key was used with different details: never retried blindly; an admin looks.
  if (e instanceof Stripe.errors.StripeIdempotencyError) return { kind: "error", error: `Idempotency conflict: ${msg}` };
  if (e instanceof Stripe.errors.StripeCardError) {
    const code = (e.decline_code as string | undefined) ?? e.code ?? null;
    return { kind: "declined", code, hard: isHardDecline(code) };
  }
  if (e instanceof Stripe.errors.StripeInvalidRequestError) {
    if (/tax/i.test(e.code ?? "") || /tax|location/i.test(msg)) return { kind: "tax_address", error: msg };
    // An idempotency mismatch or a stale object means we cannot know what happened: look it up later.
    if (e.code === "idempotency_key_in_use") return { kind: "unknown", error: msg };
    return { kind: "error", error: msg };
  }
  if (e instanceof Stripe.errors.StripeAuthenticationError || e instanceof Stripe.errors.StripePermissionError) return { kind: "error", error: msg };
  // Connection, rate limit, Stripe's own errors, timeouts: the charge may have gone through.
  return { kind: "unknown", error: msg };
}

export function stripeBilling(s: Stripe | null = stripe()): BillingGateway | null {
  if (!s) return null;
  return {
    async preview({ customer, price }) {
      const inv = await s.invoices.createPreview({ customer, automatic_tax: { enabled: true }, subscription_details: { items: [{ price }] } });
      return { totalCents: inv.total, currency: inv.currency.toUpperCase() };
    },

    async subscriptions(customer) {
      const list = await s.subscriptions.list({ customer, status: "all", limit: 20 });
      return list.data.map((x) => ({ id: x.id, status: x.status, claimId: x.metadata?.claim_id ?? null }));
    },

    async createSubscription({ customer, price, claimId, userId, idempotencyKey }) {
      try {
        const sub = await s.subscriptions.create(
          {
            customer,
            items: [{ price }],
            automatic_tax: { enabled: true },
            payment_behavior: "error_if_incomplete",
            // A merchant-initiated charge on the card saved for later use: no one is there to confirm it.
            off_session: true,
            metadata: { claim_id: claimId, user_id: userId },
            expand: ["latest_invoice"],
          },
          { idempotencyKey },
        );
        const inv = sub.latest_invoice as Stripe.Invoice | string | null;
        return {
          kind: "succeeded",
          object: sub.id,
          amountCents: inv && typeof inv !== "string" ? inv.amount_paid : null,
          currency: inv && typeof inv !== "string" ? inv.currency.toUpperCase() : null,
        };
      } catch (e) {
        return classify(e);
      }
    },
  };
}
