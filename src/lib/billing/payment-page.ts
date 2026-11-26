import { heldTeaser, type HeldTeaser } from "@/lib/app/held";
import type { Query } from "@/lib/db-query";
import type { CardGateway, MonthlyPreview } from "./gateway";
import { isNoCardTrial } from "./has-card";
import { checkBillingLocation } from "./location";
import type { PromoView } from "./payment-view";
import { basePreview } from "./payment-view";
import { quoteMonthly, type PreviewCache } from "./preview";
import { clearPendingPromo } from "./promo";
import type { Currency } from "./prices";
import type { Counter } from "@/lib/rate-limit";

/**
 * The Payment page's server side (plan 2026-11-26-001, Unit 6): who may use
 * it, and the prices it shows. Every amount comes from here (the account's
 * currency, Stripe's preview, the stored promo), never from the browser,
 * which only sends a country and a postal code.
 */

export type PaymentAccount = {
  userId: string;
  name: string;
  currency: Currency;
  customer: string | null;
  promoCode: string | null;
  promoCoupon: string | null;
  promoLabel: string | null;
  held: HeldTeaser;
};

/**
 * The signed-in member, when Payment is for them: a trial with no card (not
 * sponsored) and a held list waiting for that card. Anyone else (no account,
 * a card already saved, a closed account, nothing held yet) gets null.
 */
export async function paymentAccount(q: Query, userId: string): Promise<PaymentAccount | null> {
  const [u] = await q<{
    name: string;
    status: string;
    trial_started_at: string | null;
    sponsored: boolean;
    currency: Currency | null;
    stripe_customer: string | null;
    promo_code: string | null;
    promo_coupon: string | null;
    promo_label: string | null;
  }>(
    `select name, status, trial_started_at, sponsor_id is not null as sponsored, currency, stripe_customer, promo_code, promo_coupon, promo_label
     from users where id = $1`,
    [userId],
  );
  if (!u || !isNoCardTrial({ status: u.status, trialStartedAt: u.trial_started_at, sponsored: u.sponsored })) return null;
  const held = await heldTeaser(q, userId);
  if (!held) return null;
  return {
    userId,
    name: u.name,
    currency: u.currency ?? "USD",
    customer: u.stripe_customer,
    promoCode: u.promo_code,
    promoCoupon: u.promo_coupon,
    promoLabel: u.promo_label,
    held,
  };
}

/**
 * The pending promo code as the Price Box shows it. Stripe is asked again for
 * the discount's shape (percent or amount, once or every month); a code that
 * no longer checks out still shows as applied, with no amount, and the card
 * save re-checks it (Unit 5).
 */
export async function pendingPromoView(gw: Pick<CardGateway, "findPromotion">, a: PaymentAccount): Promise<PromoView | null> {
  if (!a.promoCode) return null;
  const fallback: PromoView = { code: a.promoCode, label: a.promoLabel ?? a.promoCode, duration: null, durationInMonths: null, percentOff: null, amountOffCents: null };
  try {
    const p = await gw.findPromotion(a.promoCode, a.currency, { customer: a.customer });
    if (!p.valid || p.couponId !== a.promoCoupon) return fallback;
    return { code: p.code, label: p.label, duration: p.duration, durationInMonths: p.durationInMonths, percentOff: p.percentOff, amountOffCents: p.amountOffCents };
  } catch (e) {
    console.warn("[payment] promo lookup failed", { message: (e as Error)?.message });
    return fallback;
  }
}

export type PaymentPrice = {
  price: MonthlyPreview;
  promo: PromoView | null;
  /** Something the person should read (the code stopped applying, too many checks). */
  notice?: string;
  rateLimited?: boolean;
};

export const PROMO_GONE = "That code no longer applies, so the price is the regular one.";
export const TOO_MANY_CHECKS = "Too many tries. Wait a while and try again.";

/**
 * The Price Box's lines: without a valid billing location, the plan price
 * (the settings' display amount) with any discount and the tax still to come;
 * with one, Stripe's invoice preview (`quoteMonthly`: cached, rate-limited).
 * A coupon that Stripe no longer accepts is dropped from the pending
 * selection and the price shown without it.
 */
export async function paymentPrice(
  q: Query,
  gw: Pick<CardGateway, "previewMonthly">,
  o: {
    userId: string;
    ip: string;
    currency: Currency;
    subtotalCents: number;
    promo: PromoView | null;
    coupon: string | null;
    country?: unknown;
    postal?: unknown;
  },
  d: { now?: Date; counter?: Counter; cache?: PreviewCache } = {},
): Promise<PaymentPrice> {
  const base = (promo: PromoView | null) => basePreview(o.currency, o.subtotalCents, promo);
  if (!checkBillingLocation(o.country, o.postal).ok) return { price: base(o.promo), promo: o.promo };
  const ask = (coupon: string | null) =>
    quoteMonthly(q, gw, { userId: o.userId, ip: o.ip, currency: o.currency, country: o.country, postal: o.postal, coupon }, d);
  let r = await ask(o.coupon);
  let promo = o.promo;
  let notice: string | undefined;
  if (!r.ok && r.reason === "coupon_unavailable") {
    await clearPendingPromo(q, o.userId);
    promo = null;
    notice = PROMO_GONE;
    r = await ask(null);
  }
  if (r.ok) return { price: r.preview, promo, notice };
  if (r.reason === "rate_limited") return { price: base(promo), promo, notice: TOO_MANY_CHECKS, rateLimited: true };
  // invalid_location, unavailable, not_allowed: the plan price, tax still to come.
  return { price: base(promo), promo, notice };
}
