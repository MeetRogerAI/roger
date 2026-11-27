import { heldTeaser, type HeldTeaser } from "@/lib/app/held";
import type { Query } from "@/lib/db-query";
import type { CardGateway, MonthlyPreview } from "./gateway";
import { isNoCardTrial } from "./has-card";
import { checkBillingLocation } from "./location";
import { asDuration } from "./discount-words";
import { displayCredit } from "./credit-display";
import type { DisplayCredit } from "./credit-lines";
import type { PromoView } from "./payment-view";
import { basePreview, TAX_UNAVAILABLE } from "./payment-view";
import { quoteMonthly, type PreviewCache } from "./preview";
import { clearPendingPromo } from "./promo";
import { amount, type Currency } from "./prices";
import { cardSavePath, type CardSaveResult } from "./card-saved";
import { appUrl } from "@/lib/mail/layout";
import type { Counter } from "@/lib/rate-limit";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

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
  /** The pending coupon's duration, stored with the code (Unit 8 review F5). */
  promoDuration: PromoView["duration"];
  promoDurationMonths: number | null;
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
    promo_duration: string | null;
    promo_duration_months: number | null;
  }>(
    `select name, status, trial_started_at, sponsor_id is not null as sponsored, currency, stripe_customer, promo_code, promo_coupon, promo_label,
       promo_duration, promo_duration_months
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
    promoDuration: asDuration(u.promo_duration),
    promoDurationMonths: u.promo_duration_months,
    held,
  };
}

/** The pending code as stored on the account (no amounts: the page then shows no discount amount). Null when none is pending. */
export function storedPromoView(a: Pick<PaymentAccount, "promoCode" | "promoLabel"> & Partial<Pick<PaymentAccount, "promoDuration" | "promoDurationMonths">>): PromoView | null {
  if (!a.promoCode) return null;
  return { code: a.promoCode, label: a.promoLabel ?? a.promoCode, duration: a.promoDuration ?? null, durationInMonths: a.promoDurationMonths ?? null, percentOff: null, amountOffCents: null };
}

export const PROMO_GONE = "That code no longer applies, so the price is the regular one.";
export const TOO_MANY_CHECKS = "Too many tries. Wait a while and try again.";

/**
 * The pending promo code as the Price Box shows it. Stripe is asked again for
 * the discount's shape (percent or amount, once or every month). A code that
 * Stripe refuses for the account's currency (an amount-off code in the other
 * currency, or one that has ended) is cleared from the pending selection and
 * the page says so (`PROMO_GONE`), with or without a billing location. A code
 * whose coupon changed, or a failed lookup, still shows as applied with no
 * amount, and the card save re-checks it (Unit 5).
 */
export async function pendingPromoView(
  q: Query,
  gw: Pick<CardGateway, "findPromotion">,
  a: PaymentAccount,
): Promise<{ promo: PromoView | null; notice?: string }> {
  const fallback = storedPromoView(a);
  if (!a.promoCode || !fallback) return { promo: null };
  try {
    const p = await gw.findPromotion(a.promoCode, a.currency, { customer: a.customer });
    if (!p.valid) {
      await clearPendingPromo(q, a.userId);
      return { promo: null, notice: PROMO_GONE };
    }
    if (p.couponId !== a.promoCoupon) return { promo: fallback };
    return { promo: { code: p.code, label: p.label, duration: p.duration, durationInMonths: p.durationInMonths, percentOff: p.percentOff, amountOffCents: p.amountOffCents } };
  } catch (e) {
    console.warn("[payment] promo lookup failed", { message: (e as Error)?.message });
    return { promo: fallback };
  }
}

/** The Price Box's answer. A refused (rate-limited) preview always carries its notice. */
export type PaymentPrice = {
  price: MonthlyPreview;
  promo: PromoView | null;
} & (
  | {
      rateLimited?: false;
      /** Something the person should read (the code stopped applying, the tax could not be worked out). */
      notice?: string;
      /** Stripe could not work out the tax for a valid location: ask again on the next interaction or before confirming. */
      taxRetry?: boolean;
    }
  | { rateLimited: true; notice: string }
);

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
  if (r.reason === "unavailable") {
    return { price: base(promo), promo, notice: [notice, TAX_UNAVAILABLE].filter(Boolean).join(" "), taxRetry: true };
  }
  // invalid_location, not_allowed: the plan price, tax still to come.
  return { price: base(promo), promo, notice };
}

/**
 * Referral credit already on the member's balance, for the Price Box (B2 plan Unit 5): plain cents and currency
 * (the browser gets nothing else). Null when none, or not usable (`displayCredit`).
 */
export async function paymentCredit(q: Query, userId: string, now: Date): Promise<DisplayCredit> {
  const c = await displayCredit(q, userId, now);
  return c ? { cents: c.cents, currency: c.currency } : null;
}

/** The plan price in cents for display before Stripe's preview (the settings' amount). */
export async function planCents(currency: Currency): Promise<number> {
  return Math.round(amount(await getV3SettingsForDisplay(), "monthly", currency) * 100);
}

/** Where Stripe sends the person after confirming (Unit 5's return page). */
export function paymentReturnUrl(): string {
  return `${appUrl("/start/payment/done")}?session_id={CHECKOUT_SESSION_ID}`;
}

/**
 * Where a stored session that already holds a confirmed card sends the
 * member, once `finishCardSave` has run (page and actions alike). Never back
 * to `/start/payment` (that would loop): a pending save waits on the return
 * page with the session id (`cardSavePath`'s bare return page would bounce
 * back here), and `not_yours` goes to `/app`.
 */
export function finishedSavePath(sessionId: string, r: CardSaveResult): string {
  if (r.outcome === "pending") return `/start/payment/done?session_id=${encodeURIComponent(sessionId)}`;
  if (r.outcome === "not_yours") return "/app";
  return cardSavePath(r);
}
