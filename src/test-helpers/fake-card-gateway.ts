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

export type FakePromo = Partial<Omit<PromoFacts, "coupon">> & { code: string; coupon?: Partial<NonNullable<PromoFacts["coupon"]>> | null };

/**
 * Promotion codes and the monthly preview, shared by the unit-test fake and
 * the scenario fake. Promotion codes are judged by the same `judgePromotion`
 * the Stripe gateway uses; previews use FAKE_TAX. A postal code in
 * `taxPending` answers like Stripe asking for more location inputs.
 */
export function fakePaymentStripe(o: { monthlyCents?: Record<Currency, number>; tax?: typeof FAKE_TAX } = {}) {
  const monthly = o.monthlyCents ?? FAKE_MONTHLY_CENTS;
  const tax = o.tax ?? FAKE_TAX;
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

  const previewMonthly: CardGateway["previewMonthly"] = async (args) => {
    previews.push({ ...args });
    const subtotal = monthly[args.currency];
    let discount = 0;
    if (args.coupon) {
      const c = coupons.get(args.coupon);
      if (!c || !c.valid) throw new CouponUnavailable(`No such coupon: '${args.coupon}'`);
      discount = c.percentOff != null ? Math.round((subtotal * c.percentOff) / 100) : Math.min(subtotal, c.amountOff?.[args.currency.toLowerCase()] ?? 0);
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

  return { promotions, coupons, taxPending, previews, addPromotion, previewMonthly, findPromotion };
}

/** A fake Stripe: one customer per user id (like the idempotency key), sessions held in memory. */
export function fakeGateway(tax: TaxLocation = "ok") {
  const customers = new Map<string, string>();
  const sessions = new Map<string, SetupSession>();
  const defaults = new Map<string, string>();
  const expired: string[] = [];
  const payment = fakePaymentStripe();
  let n = 0;
  const gw: CardGateway & {
    complete(id: string, country?: string): void;
    sessions: typeof sessions;
    defaults: typeof defaults;
    expired: typeof expired;
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
    async checkTaxLocation() {
      return tax;
    },
    previewMonthly: payment.previewMonthly,
    findPromotion: payment.findPromotion,
    complete(id, country = "CA") {
      const s = sessions.get(id)!;
      sessions.set(id, { ...s, status: "complete", paymentMethod: "pm_card", country });
    },
    sessions,
    defaults,
    expired,
    customersCreated: () => customers.size,
    payment,
  };
  return gw;
}
