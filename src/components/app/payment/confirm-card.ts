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

/** The part of Stripe's Checkout Elements value this needs (`useCheckoutElements().checkout`): its actions and the session's status. */
export type CardCheckout = {
  updateBillingAddress(a: StripeCheckoutContact | null): Promise<Result>;
  confirm(args?: { redirect?: "always" | "if_required" }): Promise<Result>;
  status?: { type: string };
};

export const CONFIRM_FAILED = "We couldn’t save your card. Check the details and try again.";

export type ConfirmResult = { ok: true } | { ok: false; message: string; expired?: boolean };

/**
 * Stripe's errors carry no code for a session that has expired or closed
 * (`AnyBuyerError` has `code: null`), so the session's own status is read
 * first and the message second.
 */
const EXPIRED = /expired|no longer (?:active|available|valid|open)|session (?:is )?(?:closed|not found|missing)|no such checkout/i;
function isExpired(checkout: CardCheckout, message: string): boolean {
  return checkout.status?.type === "expired" || EXPIRED.test(message);
}

export async function confirmCard(checkout: CardCheckout, f: { name: string; country: string; postal: string }): Promise<ConfirmResult> {
  const loc = checkBillingLocation(f.country, f.postal);
  if (!loc.ok) return { ok: false, message: CONFIRM_FAILED };
  const failed = (message: string): ConfirmResult => (isExpired(checkout, message) ? { ok: false, message: message || CONFIRM_FAILED, expired: true } : { ok: false, message: message || CONFIRM_FAILED });
  try {
    const u = await checkout.updateBillingAddress({ name: f.name.trim(), address: { country: loc.location.country, postal_code: loc.location.postal } });
    if (u.type === "error") return failed(u.error.message);
    const c = await checkout.confirm({ redirect: "if_required" });
    if (c.type === "error") return failed(c.error.message);
    return { ok: true };
  } catch (e) {
    console.error("[payment] confirm failed", (e as Error)?.message);
    return failed("");
  }
}

/**
 * One change at a time on the Payment page: the card confirm, a currency
 * switch, a promo apply or remove, a fresh card session. `run` answers null
 * without calling while another holds it. The holder is a plain variable (not
 * React state), set before any await, so two clicks in the same frame cannot
 * both pass, and it lives in the page (not the card form), so a remount of
 * the card form does not forget it. `keep(result)`: the holder is not
 * released (after a confirmed card the page is leaving).
 */
export function exclusive() {
  let holder: string | null = null;
  return {
    held: () => holder,
    async run<R>(name: string, fn: () => Promise<R>, keep?: (r: R) => boolean): Promise<R | null> {
      if (holder) return null;
      holder = name;
      let kept = false;
      try {
        const r = await fn();
        kept = Boolean(keep?.(r));
        return r;
      } finally {
        if (!kept) holder = null;
      }
    },
  };
}

/** Where the page goes after a confirmed card: Unit 5's return page, which finishes the save. */
export const returnPath = (sessionId: string) => `/start/payment/done?session_id=${encodeURIComponent(sessionId)}`;
