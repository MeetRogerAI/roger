import type Stripe from "stripe";
import { priceId, type Currency } from "./prices";
import { stripe } from "./stripe";

/**
 * The few Stripe calls the app makes, behind one small interface so the rules
 * around them can be tested with a fake. Every call that creates something
 * passes an idempotency key, so a retried request cannot create it twice.
 */
export type TaxLocation = "ok" | "not_collecting" | "invalid";

/** Stripe could not work out the tax this time; worth trying again, not the person's fault. */
export class TaxLookupUnavailable extends Error {}

export type SetupSession = {
  id: string;
  status: "open" | "complete" | "expired";
  customer: string | null;
  paymentMethod: string | null;
  userId: string | null;
  currency: "USD" | "CAD" | null;
  country: string | null;
  /** "card_update" for a card replaced from /app/billing; null for the sign-up card step. */
  purpose?: string | null;
  /** The embedded (elements-mode) session's client secret, for Stripe.js; null for hosted pages. */
  clientSecret?: string | null;
};

/**
 * The monthly price for a billing location (plan 2026-11-26-001, Unit 4), from
 * Stripe's invoice preview: the same Billing logic as the real first invoice.
 * `tax` is "pending" when Stripe cannot place the location yet (it asks for
 * more location inputs, or the calculation failed): the page then says "Tax
 * will be calculated from your billing address", and the amounts carry no tax.
 */
export type MonthlyPreview = {
  currency: Currency;
  subtotalCents: number;
  discountCents: number;
  tax: "calculated" | "pending";
  /** Tax charged (0 where Stripe collects none, e.g. a US state with no registration). */
  taxCents: number;
  /** "HST", "GST", or null when no tax is charged. */
  taxName: string | null;
  /** Effective rate in percent (13 for Ontario HST), or null when unknown or none. */
  taxRate: number | null;
  totalCents: number;
};

/** A promotion code Roger may apply: the coupon is what is stored and applied (Stripe has no customer-level discounts). */
export type Promotion = {
  valid: true;
  promotionCodeId: string;
  /** The code as Stripe holds it (lookups ignore case). */
  code: string;
  couponId: string;
  label: string;
  percentOff: number | null;
  /** Amount off in the requested currency's cents. */
  amountOffCents: number | null;
  duration: "once" | "repeating" | "forever";
  durationInMonths: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  firstTimeOnly: boolean;
};

export type PromotionLookup = Promotion | { valid: false };

/** The stored coupon no longer applies (deleted, or past its `redeem_by`). */
export class CouponUnavailable extends Error {}

export type CardGateway = {
  createCustomer(o: { userId: string; email: string; name: string }): Promise<string>;
  createSetupSession(o: {
    userId: string;
    customer: string;
    currency: "USD" | "CAD";
    successUrl: string;
    cancelUrl: string;
    purpose?: "card_update";
  }): Promise<{ id: string; url: string }>;
  /**
   * The Payment page's card form (Unit 4): a setup-mode Checkout Session in
   * `ui_mode: 'elements'`, mounted in Roger's page with Stripe.js. Cards only;
   * the name and address the page sends through `updateBillingAddress` are
   * written to the customer (`customer_update`) for Stripe Tax.
   */
  createEmbeddedSetupSession(o: { userId: string; customer: string; currency: Currency; returnUrl: string }): Promise<{ id: string; clientSecret: string }>;
  /** Closes an open session so it can no longer be confirmed; one already closed is left as it is. */
  expireSetupSession(id: string): Promise<void>;
  getSetupSession(id: string): Promise<SetupSession>;
  setDefaultCard(customer: string, paymentMethod: string): Promise<void>;
  checkTaxLocation(customer: string): Promise<TaxLocation>;
  /** The monthly plan's first invoice for a country and postal code, optionally with a coupon. Throws CouponUnavailable for a coupon that no longer applies. */
  previewMonthly(o: { customer?: string | null; currency: Currency; country: BillingCountry; postal: string; coupon?: string | null }): Promise<MonthlyPreview>;
  /** A promotion code checked against Stripe's own limits; the reason for a refusal is logged, never returned. */
  findPromotion(code: string, currency: Currency, o?: { customer?: string | null; now?: Date }): Promise<PromotionLookup>;
};

/** Roger bills in Canada and the US only (Peter, 2026-11-26). */
export type BillingCountry = "CA" | "US";

export function stripeGateway(s: Stripe | null = stripe()): CardGateway | null {
  if (!s) return null;
  return {
    async createCustomer({ userId, email, name }) {
      try {
        const c = await s.customers.create({ email, name, metadata: { user_id: userId } }, { idempotencyKey: `customer:${userId}` });
        return c.id;
      } catch (e) {
        // The same key with other parameters (the name or email changed within Stripe's 24 hours):
        // the customer exists already, so it is found by the user id it carries.
        if (!isIdempotencyMismatch(e)) throw e;
        const found = await s.customers.search({ query: `metadata['user_id']:'${userId.replace(/['\\]/g, "")}'`, limit: 1 });
        if (found.data[0]) return found.data[0].id;
        throw e;
      }
    },

    async createSetupSession({ userId, customer, currency, successUrl, cancelUrl, purpose }) {
      const session = await s.checkout.sessions.create({
        mode: "setup",
        customer,
        currency: currency.toLowerCase(),
        billing_address_collection: "required",
        customer_update: { address: "auto", name: "auto" },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { user_id: userId, currency, ...(purpose ? { purpose } : {}) },
        setup_intent_data: { metadata: { user_id: userId } },
      });
      if (!session.url) throw new Error("Stripe returned no Checkout URL");
      return { id: session.id, url: session.url };
    },

    async createEmbeddedSetupSession({ userId, customer, currency, returnUrl }) {
      const session = await s.checkout.sessions.create({
        mode: "setup",
        ui_mode: "elements",
        customer,
        currency: currency.toLowerCase(),
        // Endive: `payment_method_types` is refused on Checkout Sessions; this filters to cards.
        allowed_payment_method_types: ["card"],
        // No billing_address_collection: "required" would demand a full street address. The page
        // sends name, country and postal code; customer_update writes them to the customer.
        customer_update: { address: "auto", name: "auto" },
        return_url: returnUrl,
        metadata: { user_id: userId, currency },
        setup_intent_data: { metadata: { user_id: userId } },
      });
      if (!session.client_secret) throw new Error("Stripe returned no client secret");
      return { id: session.id, clientSecret: session.client_secret };
    },

    async expireSetupSession(id) {
      try {
        await s.checkout.sessions.expire(id);
      } catch (e) {
        // Already complete or expired ("Only Checkout Sessions with a status in ["open"] can be expired"), or gone.
        const err = e as { code?: string; message?: string };
        if (err.code === "resource_missing" || /status in \["open"\]/.test(err.message ?? "")) return;
        throw e;
      }
    },

    async previewMonthly({ customer, currency, country, postal, coupon }) {
      const price = priceId("monthly", currency);
      if (!price) throw new Error(`STRIPE_PRICE_MONTHLY_${currency} is not set`);
      const base = {
        ...(customer ? { customer } : {}),
        customer_details: { address: { country, postal_code: postal } },
        subscription_details: { items: [{ price }] },
        // A customer's own discounts are never inherited: only the coupon Roger applies counts.
        ...(coupon ? { discounts: [{ coupon }] } : customer ? { discounts: "" as const } : {}),
      };
      try {
        const inv = await s.invoices.createPreview({ ...base, automatic_tax: { enabled: true }, expand: ["total_taxes.tax_rate_details.tax_rate"] });
        return monthlyPreviewFrom(inv, currency);
      } catch (e) {
        if (isCouponGone(e)) throw new CouponUnavailable((e as Error).message);
        if (!isTaxPreviewError(e)) throw e;
        // Stripe could not work the tax out: the price without tax, and the tax line "pending".
        let inv: Stripe.Invoice;
        try {
          inv = await s.invoices.createPreview({ ...base, automatic_tax: { enabled: false } });
        } catch (e2) {
          if (isCouponGone(e2)) throw new CouponUnavailable((e2 as Error).message);
          throw e2;
        }
        return { ...monthlyPreviewFrom(inv, currency), tax: "pending", taxCents: 0, taxName: null, taxRate: null };
      }
    },

    async findPromotion(code, currency, o = {}) {
      const wanted = normalizePromoCode(code);
      if (!wanted) return refusePromotion(code, "malformed");
      const list = await s.promotionCodes.list({ code: wanted, active: true, limit: 1, expand: ["data.promotion.coupon"] });
      const pc = list.data[0];
      if (!pc) return refusePromotion(wanted, "unknown");
      const facts = promoFacts(pc);
      // The price is only read when the code restricts the amount or the product.
      const needsPrice = Object.keys(facts.minimums).length > 0 || facts.coupon?.appliesToProducts != null;
      let price: PromoPrice | null = null;
      if (needsPrice) {
        const id = priceId("monthly", currency);
        const p = id ? await s.prices.retrieve(id) : null;
        price = p ? { cents: p.unit_amount ?? 0, product: typeof p.product === "string" ? p.product : p.product.id } : null;
      }
      return judgePromotion(facts, currency, { customer: o.customer ?? null, now: o.now ?? new Date(), price });
    },

    async getSetupSession(id) {
      const session = await s.checkout.sessions.retrieve(id, { expand: ["setup_intent"] });
      const intent = session.setup_intent as Stripe.SetupIntent | string | null;
      const pm = intent && typeof intent !== "string" ? intent.payment_method : null;
      const cur = session.metadata?.currency;
      return {
        id: session.id,
        status: (session.status ?? "open") as SetupSession["status"],
        customer: typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null),
        paymentMethod: typeof pm === "string" ? pm : (pm?.id ?? null),
        userId: session.metadata?.user_id ?? null,
        currency: cur === "USD" || cur === "CAD" ? cur : null,
        country: session.customer_details?.address?.country ?? null,
        purpose: session.metadata?.purpose ?? null,
        clientSecret: session.client_secret ?? null,
      };
    },

    async setDefaultCard(customer, paymentMethod) {
      await s.customers.update(customer, { invoice_settings: { default_payment_method: paymentMethod } });
    },

    async checkTaxLocation(customer) {
      try {
        const c = await s.customers.update(customer, { tax: { validate_location: "immediately" }, expand: ["tax"] });
        return taxStatus(c.tax?.automatic_tax);
      } catch (e) {
        if ((e as { code?: string }).code === "customer_tax_location_invalid") return "invalid";
        throw e;
      }
    },
  };
}

/**
 * Stripe Tax's verdict on a customer's address. Only "unrecognized_location"
 * means the address is not good enough; "failed" (or no answer) is Stripe's
 * problem and is retried, never blamed on the person.
 */
export function taxStatus(status: string | null | undefined): TaxLocation {
  if (status === "supported") return "ok";
  if (status === "not_collecting") return "not_collecting";
  if (status === "unrecognized_location") return "invalid";
  throw new TaxLookupUnavailable(`Stripe Tax answered ${status ?? "nothing"}`);
}

type StripeErrorish = { code?: string; param?: string; message?: string; type?: string; rawType?: string } | null;

/** Stripe's idempotency error: a key reused with different parameters. */
export function isIdempotencyMismatch(e: unknown): boolean {
  const err = e as StripeErrorish;
  return err?.type === "StripeIdempotencyError" || err?.rawType === "idempotency_error";
}

/**
 * A coupon applied by id that Stripe will no longer apply. Seen in the
 * sandbox on Endive (Unit 4 spike): a deleted coupon is `resource_missing`
 * with param `discounts[0][coupon]` ("No such coupon: '…'"); one past its
 * `redeem_by` is `coupon_expired` with param `discounts`. Both on
 * `invoices.createPreview` and `subscriptions.create` alike.
 */
export function isCouponGone(e: unknown): boolean {
  const err = e as StripeErrorish;
  if (err?.code === "coupon_expired") return true;
  return err?.code === "resource_missing" && (err.param ?? "").startsWith("discounts");
}

/** The invalid-request codes that mean Stripe could not work the tax out for this location. */
const TAX_PREVIEW_CODES = new Set(["failed_tax_calculation", "customer_tax_location_invalid", "taxes_calculation_failed"]);

/**
 * Stripe could not place the location for tax (Endive `failed_tax_calculation`,
 * an invalid tax location): a Stripe invalid-request error with one of the
 * known tax codes. Anything else (a timeout, a 5xx, another 400) is not this.
 */
export function isTaxPreviewError(e: unknown): boolean {
  const err = e as StripeErrorish;
  const invalidRequest = err?.type === "StripeInvalidRequestError" || err?.rawType === "invalid_request_error";
  return invalidRequest && TAX_PREVIEW_CODES.has(err?.code ?? "");
}

/** Reads an invoice preview into the Price Box's lines. Only taxes actually charged are named. */
export function monthlyPreviewFrom(inv: Stripe.Invoice, currency: Currency): MonthlyPreview {
  const discountCents = (inv.total_discount_amounts ?? []).reduce((n, d) => n + d.amount, 0);
  const base = { currency, subtotalCents: inv.subtotal, discountCents, totalCents: inv.total };
  // "requires_location_inputs" (e.g. a postal code Stripe cannot place) or "failed": no tax yet.
  if (inv.automatic_tax?.enabled && inv.automatic_tax.status !== "complete") {
    return { ...base, tax: "pending", taxCents: 0, taxName: null, taxRate: null };
  }
  const charged = (inv.total_taxes ?? []).filter((t) => t.amount > 0);
  const rates = charged.map((t) => {
    // Typed as an id; an object when the preview expands `total_taxes.tax_rate_details.tax_rate`.
    const r = t.tax_rate_details?.tax_rate as string | Stripe.TaxRate | undefined;
    return r && typeof r !== "string" ? r : null;
  });
  const names = [...new Set(rates.map((r) => r?.display_name).filter((x): x is string => Boolean(x)))];
  const known = rates.every((r) => r && (r.effective_percentage ?? r.percentage) != null);
  const taxRate = charged.length && known ? Math.round(rates.reduce((n, r) => n + (r!.effective_percentage ?? r!.percentage), 0) * 1000) / 1000 : null;
  return {
    ...base,
    tax: "calculated",
    taxCents: charged.reduce((n, t) => n + t.amount, 0),
    taxName: names.length ? names.join(" + ") : null,
    taxRate,
  };
}

// --- Promotion codes ---------------------------------------------------------

/** Why a code was refused. Logged only: the person always reads "That code isn't valid". */
export type PromoRefusal =
  | "malformed"
  | "unknown"
  | "inactive"
  | "expired"
  | "limit_reached"
  | "coupon_invalid"
  | "wrong_currency"
  | "below_minimum"
  | "wrong_product"
  | "other_customer";

/** A promotion code and its coupon, as Roger judges them (from Stripe, or a fake). */
export type PromoFacts = {
  promotionCodeId: string;
  code: string;
  active: boolean;
  /** Unix seconds. */
  expiresAt: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  /** A code only for one Stripe customer. */
  customer: string | null;
  firstTimeOnly: boolean;
  /** Minimum order per lowercase currency, in cents. */
  minimums: Record<string, number>;
  coupon: {
    id: string;
    valid: boolean;
    name: string | null;
    percentOff: number | null;
    /** Amount off per lowercase currency, in cents; null for a percentage coupon. */
    amountOff: Record<string, number> | null;
    duration: Promotion["duration"];
    durationInMonths: number | null;
    /** Products the coupon is limited to, or null for any. */
    appliesToProducts: string[] | null;
    /** Unix seconds. */
    redeemBy: number | null;
  } | null;
};

export type PromoPrice = { cents: number; product: string };

/** Codes are letters, digits, "-" and "_" (Stripe's own rule is looser; anything else is refused unseen). */
export function normalizePromoCode(code: string): string | null {
  const c = code.trim();
  return /^[A-Za-z0-9_-]{1,50}$/.test(c) ? c : null;
}

/** Logs a refusal. A malformed code is never logged (only its length); others are quoted and cut to 50 characters. */
export function refusePromotion(code: string, reason: PromoRefusal): { valid: false } {
  if (reason === "malformed") console.info("[promo] code refused", { length: code.length, reason });
  else console.info("[promo] code refused", { code: JSON.stringify(code.slice(0, 50)), reason });
  return { valid: false };
}

/** Stripe's promotion code (Clover+ shape: `promotion.coupon`, expanded) as facts. */
export function promoFacts(pc: Stripe.PromotionCode): PromoFacts {
  const c = pc.promotion.coupon;
  const coupon = c && typeof c !== "string" ? c : null;
  const minimums: Record<string, number> = {};
  const r = pc.restrictions;
  if (r.minimum_amount != null && r.minimum_amount_currency) minimums[r.minimum_amount_currency.toLowerCase()] = r.minimum_amount;
  for (const [cur, o] of Object.entries(r.currency_options ?? {})) minimums[cur.toLowerCase()] = o.minimum_amount;
  let amountOff: Record<string, number> | null = null;
  if (coupon?.amount_off != null) {
    amountOff = {};
    if (coupon.currency) amountOff[coupon.currency.toLowerCase()] = coupon.amount_off;
    for (const [cur, o] of Object.entries(coupon.currency_options ?? {})) amountOff[cur.toLowerCase()] = o.amount_off;
  }
  return {
    promotionCodeId: pc.id,
    code: pc.code,
    active: pc.active,
    expiresAt: pc.expires_at,
    maxRedemptions: pc.max_redemptions,
    timesRedeemed: pc.times_redeemed,
    customer: typeof pc.customer === "string" ? pc.customer : (pc.customer?.id ?? null),
    firstTimeOnly: r.first_time_transaction,
    minimums,
    coupon: coupon
      ? {
          id: coupon.id,
          valid: coupon.valid,
          name: coupon.name ?? null,
          percentOff: coupon.percent_off ?? null,
          amountOff,
          duration: coupon.duration as Promotion["duration"],
          durationInMonths: coupon.duration_in_months ?? null,
          appliesToProducts: coupon.applies_to?.products ?? null,
          redeemBy: coupon.redeem_by ?? null,
        }
      : null,
  };
}

/**
 * Stripe's own limits on a code, checked by Roger because the coupon is
 * applied directly and Stripe never redeems the code itself. Roger's own
 * reservations (Unit 5) are counted on top of `timesRedeemed` by the caller.
 */
export function judgePromotion(
  f: PromoFacts,
  currency: Currency,
  o: { customer: string | null; now: Date; price: PromoPrice | null },
): PromotionLookup {
  const cur = currency.toLowerCase();
  const nowSec = Math.floor(o.now.getTime() / 1000);
  const refuse = (reason: PromoRefusal) => refusePromotion(f.code, reason);
  if (!f.active) return refuse("inactive");
  if (f.expiresAt != null && f.expiresAt <= nowSec) return refuse("expired");
  if (f.maxRedemptions != null && f.timesRedeemed >= f.maxRedemptions) return refuse("limit_reached");
  if (f.customer && f.customer !== o.customer) return refuse("other_customer");
  const c = f.coupon;
  if (!c || !c.valid) return refuse("coupon_invalid");
  if (c.redeemBy != null && c.redeemBy <= nowSec) return refuse("coupon_invalid");
  if (c.amountOff && c.amountOff[cur] == null) return refuse("wrong_currency");
  if (Object.keys(f.minimums).length) {
    if (f.minimums[cur] == null) return refuse("wrong_currency");
    if (!o.price || o.price.cents < f.minimums[cur]) return refuse("below_minimum");
  }
  if (c.appliesToProducts && (!o.price || !c.appliesToProducts.includes(o.price.product))) return refuse("wrong_product");
  return {
    valid: true,
    promotionCodeId: f.promotionCodeId,
    code: f.code,
    couponId: c.id,
    label: c.name?.trim() || f.code,
    percentOff: c.percentOff,
    amountOffCents: c.amountOff ? c.amountOff[cur] : null,
    duration: c.duration,
    durationInMonths: c.durationInMonths,
    maxRedemptions: f.maxRedemptions,
    timesRedeemed: f.timesRedeemed,
    firstTimeOnly: f.firstTimeOnly,
  };
}
