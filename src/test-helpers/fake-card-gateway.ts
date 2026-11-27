import {
  CouponUnavailable,
  judgePromotion,
  normalizePromoCode,
  refusePromotion,
  type CardGateway,
  type MonthlyPreview,
  type PromoFacts,
  type SetupSession,
  type TaxLocation,
} from "@/lib/billing/gateway";
import type { Currency } from "@/lib/billing/prices";

/** The fake tax: HST 13% anywhere in Canada; nothing collected in the US (no registration there). */
export const FAKE_TAX: Record<string, { rate: number; name: string }> = { CA: { rate: 0.13, name: "HST" }, US: { rate: 0, name: "Sales Tax" } };

/** The fake monthly prices, in cents (the sandbox's: US$200, CA$280). */
export const FAKE_MONTHLY_CENTS: Record<Currency, number> = { USD: 20000, CAD: 28000 };

/** Stripe's refusal of an amount-off coupon with no amount in the invoice's currency (assumed shape, Unit 8 review F6). */
export const currencyMismatch = (coupon: string, currency: string) =>
  Object.assign(new Error(`Coupon ${coupon} does not support the currency ${currency.toLowerCase()}.`), { type: "StripeInvalidRequestError", param: "discounts[0][coupon]" });

export type FakePromo =Partial<Omit<PromoFacts, "coupon">> & { code: string; coupon?: Partial<NonNullable<PromoFacts["coupon"]>> | null };

/**
 * Promotion codes and the monthly preview, shared by the unit-test fake and
 * the scenario fake. Promotion codes are judged by the same `judgePromotion`
 * the Stripe gateway uses; previews use FAKE_TAX. A postal code in
 * `taxPending` answers like Stripe asking for more location inputs. A coupon
 * that is unknown, not valid or past `redeemBy` (by `now`, default the real
 * clock) throws CouponUnavailable, like Stripe's deleted and expired coupons.
 */
export function fakePaymentStripe(o: { monthlyCents?: Record<Currency, number>; tax?: typeof FAKE_TAX; now?: () => Date } = {}) {
  const monthly = o.monthlyCents ?? FAKE_MONTHLY_CENTS;
  const tax = o.tax ?? FAKE_TAX;
  const clock = o.now ?? (() => new Date());
  const promotions = new Map<string, PromoFacts>();
  const coupons = new Map<string, NonNullable<PromoFacts["coupon"]>>();
  const taxPending = new Set<string>();
  const previews: Parameters<CardGateway["previewMonthly"]>[0][] = [];
  let n = 0;

  const addPromotion = (p: FakePromo): PromoFacts => {
    const couponId = p.coupon?.id ?? `coupon_${++n}`;
    const coupon = p.coupon === null ? null : {
      id: couponId,
      valid: true,
      name: null,
      percentOff: p.coupon?.amountOff ? null : 20,
      amountOff: null,
      duration: "once" as const,
      durationInMonths: null,
      appliesToProducts: null,
      redeemBy: null,
      ...p.coupon,
    };
    const f: PromoFacts = {
      promotionCodeId: `promo_${++n}`,
      active: true,
      expiresAt: null,
      maxRedemptions: null,
      timesRedeemed: 0,
      customer: null,
      firstTimeOnly: false,
      minimums: {},
      ...p,
      coupon,
    };
    promotions.set(f.code.toUpperCase(), f);
    if (coupon) coupons.set(coupon.id, coupon);
    return f;
  };

  /**
   * A coupon applied by id to a first-charge preview or subscription create
   * (`discounts: [{coupon}]`): the amount it takes off `subtotal`, or Stripe's
   * own error for one deleted (`resource_missing` on `discounts[0][coupon]`)
   * or past `redeem_by` (`coupon_expired`), as the Unit 4 spike recorded.
   */
  const couponOff = (couponId: string, subtotal: number, currency: string): number => {
    const c = coupons.get(couponId);
    if (!c || !c.valid) throw Object.assign(new Error(`No such coupon: '${couponId}'`), { type: "StripeInvalidRequestError", code: "resource_missing", param: "discounts[0][coupon]" });
    if (c.redeemBy != null && c.redeemBy <= Math.floor(clock().getTime() / 1000)) {
      throw Object.assign(new Error(`Coupon ${c.id} is expired and cannot be applied.`), { type: "StripeInvalidRequestError", code: "coupon_expired", param: "discounts" });
    }
    if (c.percentOff != null) return Math.round((subtotal * c.percentOff) / 100);
    const off = c.amountOff?.[currency.toLowerCase()];
    // An amount-off coupon without this currency (assumed shape; see isCouponCurrencyMismatch).
    if (off == null) throw currencyMismatch(c.id, currency);
    return Math.min(subtotal, off);
  };

  const previewMonthly: CardGateway["previewMonthly"] = async (args) => {
    previews.push({ ...args });
    const subtotal = monthly[args.currency];
    let discount = 0;
    if (args.coupon) {
      const c = coupons.get(args.coupon);
      if (!c || !c.valid) throw new CouponUnavailable(`No such coupon: '${args.coupon}'`);
      // Stripe's coupon_expired: past its redeem_by.
      if (c.redeemBy != null && c.redeemBy <= Math.floor(clock().getTime() / 1000)) throw new CouponUnavailable(`Coupon ${c.id} is expired and cannot be applied.`);
      const off = c.amountOff?.[args.currency.toLowerCase()];
      if (c.percentOff == null && off == null) throw new CouponUnavailable(currencyMismatch(c.id, args.currency).message);
      discount = c.percentOff != null ? Math.round((subtotal * c.percentOff) / 100) : Math.min(subtotal, off ?? 0);
    }
    const base = { currency: args.currency, subtotalCents: subtotal, discountCents: discount };
    if (taxPending.has(args.postal)) return { ...base, tax: "pending", taxCents: 0, taxName: null, taxRate: null, totalCents: subtotal - discount };
    const t = tax[args.country] ?? { rate: 0, name: "" };
    const taxCents = Math.round((subtotal - discount) * t.rate);
    const p: MonthlyPreview = {
      ...base,
      tax: "calculated",
      taxCents,
      taxName: taxCents > 0 ? t.name : null,
      taxRate: taxCents > 0 ? t.rate * 100 : null,
      totalCents: subtotal - discount + taxCents,
    };
    return p;
  };

  const findPromotion: CardGateway["findPromotion"] = async (code, currency, opts = {}) => {
    const wanted = normalizePromoCode(code);
    if (!wanted) return refusePromotion(code, "malformed");
    const f = promotions.get(wanted.toUpperCase());
    // Stripe's list asks for active codes only, so an inactive one is "unknown" there too.
    if (!f || !f.active) return refusePromotion(wanted, "unknown");
    return judgePromotion(f, currency, { customer: opts.customer ?? null, now: opts.now ?? new Date(), price: { cents: monthly[currency], product: "prod_roger_monthly" } });
  };

  return { promotions, coupons, taxPending, previews, addPromotion, previewMonthly, findPromotion, couponOff };
}

/** A fake Stripe: one customer per user id (like the idempotency key), sessions held in memory. */
export function fakeGateway(tax: TaxLocation = "ok") {
  const customers = new Map<string, string>();
  const sessions = new Map<string, SetupSession>();
  const defaults = new Map<string, string>();
  const expired: string[] = [];
  const detached: string[] = [];
  const payment = fakePaymentStripe();
  let n = 0;
  const gw: CardGateway & {
    /** Confirms a session as Stripe.js would; `fingerprint` names the card (default: one card per session). */
    complete(id: string, country?: string, fingerprint?: string): void;
    /** What `checkTaxLocation` answers from now on (the member fixed their address). */
    setTax(t: TaxLocation): void;
    sessions: typeof sessions;
    defaults: typeof defaults;
    expired: typeof expired;
    /** Payment methods taken off their customer, in order. */
    detached: typeof detached;
    customersCreated: () => number;
    payment: typeof payment;
  } = {
    async createCustomer({ userId }) {
      if (!customers.has(userId)) customers.set(userId, `cus_${userId.slice(0, 8)}`);
      return customers.get(userId)!;
    },
    async createSetupSession({ userId, customer, currency, purpose }) {
      const id = `cs_${++n}`;
      sessions.set(id, { id, status: "open", customer, paymentMethod: null, userId, currency, country: null, purpose: purpose ?? null, clientSecret: null });
      return { id, url: `https://checkout.stripe.test/${id}` };
    },
    async createEmbeddedSetupSession({ userId, customer, currency }) {
      const id = `cs_${++n}`;
      const clientSecret = `${id}_secret_test`;
      sessions.set(id, { id, status: "open", customer, paymentMethod: null, userId, currency, country: null, purpose: null, clientSecret });
      return { id, clientSecret };
    },
    async expireSetupSession(id) {
      const s = sessions.get(id);
      if (s?.status === "open") {
        sessions.set(id, { ...s, status: "expired" });
        expired.push(id);
      }
    },
    async getSetupSession(id) {
      const s = sessions.get(id);
      if (!s) throw Object.assign(new Error(`No such checkout.session: ${id}`), { code: "resource_missing" });
      return s;
    },
    async setDefaultCard(customer, pm) {
      defaults.set(customer, pm);
    },
    async detachPaymentMethod(pm) {
      detached.push(pm);
      for (const [c, d] of defaults) if (d === pm) defaults.delete(c);
    },
    async checkTaxLocation() {
      return tax;
    },
    previewMonthly: payment.previewMonthly,
    findPromotion: payment.findPromotion,
    complete(id, country = "CA", fingerprint = `fp_${id}`) {
      const s = sessions.get(id)!;
      sessions.set(id, { ...s, status: "complete", paymentMethod: "pm_card", country, cardFingerprint: fingerprint });
    },
    setTax(t) {
      tax = t;
    },
    sessions,
    defaults,
    expired,
    detached,
    customersCreated: () => customers.size,
    payment,
  };
  return gw;
}
