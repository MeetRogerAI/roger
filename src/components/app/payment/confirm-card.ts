import type { StripeCheckoutContact } from "@stripe/stripe-js";
import { checkBillingLocation } from "@/lib/billing/location";

/**
 * "Start free trial" on the Payment page (plan 2026-11-26-001, Unit 6), kept
 * apart from the component so it can be tested without a browser.
 *
 * Roger's own name, country and postal code go to the Checkout Session with
 * `updateBillingAddress` (Endive validates billing details strictly, and the
 * Payment Element's own address fields are off), then the session is
 * confirmed. `redirect: 'if_required'`: a card, even one that needs 3D
 * Secure, is confirmed in place, and the page then goes to the return page
 * itself; Stripe redirects only for methods that need it (none, cards only).
 */

type Result = { type: "success" } | { type: "error"; error: { message: string } };

/** The part of Stripe's Checkout Elements actions this needs (`useCheckoutElements().checkout`). */
export type CardCheckout = {
  updateBillingAddress(a: StripeCheckoutContact | null): Promise<Result>;
  confirm(args?: { redirect?: "always" | "if_required" }): Promise<Result>;
};

export const CONFIRM_FAILED = "We couldn’t save your card. Check the details and try again.";

export async function confirmCard(checkout: CardCheckout, f: { name: string; country: string; postal: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  const loc = checkBillingLocation(f.country, f.postal);
  if (!loc.ok) return { ok: false, message: CONFIRM_FAILED };
  try {
    const u = await checkout.updateBillingAddress({ name: f.name.trim(), address: { country: loc.location.country, postal_code: loc.location.postal } });
    if (u.type === "error") return { ok: false, message: u.error.message || CONFIRM_FAILED };
    const c = await checkout.confirm({ redirect: "if_required" });
    if (c.type === "error") return { ok: false, message: c.error.message || CONFIRM_FAILED };
    return { ok: true };
  } catch (e) {
    console.error("[payment] confirm failed", (e as Error)?.message);
    return { ok: false, message: CONFIRM_FAILED };
  }
}

/**
 * One call at a time: a second press while the first is still with Stripe
 * returns null without calling. The guard is a plain flag (not React state),
 * so two clicks in the same frame cannot both pass. After success the flag
 * stays set (the page is leaving).
 */
export function oneAtATime<A extends unknown[], R extends { ok: boolean }>(fn: (...a: A) => Promise<R>) {
  let busy = false;
  return async (...a: A): Promise<R | null> => {
    if (busy) return null;
    busy = true;
    let r: R | undefined;
    try {
      r = await fn(...a);
      return r;
    } finally {
      if (!r?.ok) busy = false;
    }
  };
}

/** Where the page goes after a confirmed card: Unit 5's return page, which finishes the save. */
export const returnPath = (sessionId: string) => `/start/payment/done?session_id=${encodeURIComponent(sessionId)}`;
