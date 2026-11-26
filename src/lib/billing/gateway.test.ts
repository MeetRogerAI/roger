import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CouponUnavailable, isCouponGone, isTaxPreviewError, stripeGateway, taxStatus, TaxLookupUnavailable } from "./gateway";

describe("taxStatus", () => {
  it("blames the address only when Stripe says it does not recognise it", () => {
    expect(taxStatus("supported")).toBe("ok");
    expect(taxStatus("not_collecting")).toBe("not_collecting");
    expect(taxStatus("unrecognized_location")).toBe("invalid");
  });

  it("treats Stripe's own failure, or no answer, as something to try again", () => {
    expect(() => taxStatus("failed")).toThrow(TaxLookupUnavailable);
    expect(() => taxStatus(undefined)).toThrow(TaxLookupUnavailable);
  });
});

/** A stand-in for the Stripe client that records requests and returns Stripe-shaped objects. */
function stubStripe(over: { session?: Record<string, unknown>; taxStatus?: string; taxError?: string } = {}) {
  const calls: { method: string; params: unknown; opts?: unknown }[] = [];
  const s = {
    customers: {
      create: async (params: unknown, opts: unknown) => {
        calls.push({ method: "customers.create", params, opts });
        return { id: "cus_1" };
      },
      update: async (_id: string, params: { tax?: unknown }) => {
        calls.push({ method: "customers.update", params });
        if (params.tax && over.taxError) throw Object.assign(new Error("bad"), { code: over.taxError });
        return { id: "cus_1", tax: { automatic_tax: over.taxStatus ?? "supported" } };
      },
    },
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          calls.push({ method: "sessions.create", params });
          return { id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" };
        },
        retrieve: async () => ({
          id: "cs_1",
          status: "complete",
          customer: "cus_1",
          setup_intent: { id: "seti_1", payment_method: "pm_1" },
          metadata: { user_id: "u1", currency: "CAD" },
          customer_details: { address: { country: "CA" } },
          ...over.session,
        }),
      },
    },
  };
  return { s: s as unknown as Stripe, calls };
}

describe("stripeGateway", () => {
  it("opens a setup-mode page that saves a card with a billing address and charges nothing", async () => {
    const { s, calls } = stubStripe();
    const gw = stripeGateway(s)!;
    await gw.createCustomer({ userId: "u1", email: "a@example.com", name: "Ana" });
    await gw.createSetupSession({ userId: "u1", customer: "cus_1", currency: "CAD", successUrl: "https://x/ok", cancelUrl: "https://x/no" });
    expect(calls[0].opts).toEqual({ idempotencyKey: "customer:u1" });
    const p = calls[1].params as Record<string, unknown>;
    expect(p).toMatchObject({ mode: "setup", customer: "cus_1", currency: "cad", billing_address_collection: "required" });
    expect(p).not.toHaveProperty("line_items");
    expect(p).not.toHaveProperty("subscription_data");
  });

  it("reads a finished session whether Stripe sends nested objects or bare ids", async () => {
    const asObjects = stubStripe({ session: { customer: { id: "cus_1" }, setup_intent: { id: "seti", payment_method: { id: "pm_9" } } } });
    expect(await stripeGateway(asObjects.s)!.getSetupSession("cs_1")).toMatchObject({ customer: "cus_1", paymentMethod: "pm_9", userId: "u1", currency: "CAD", country: "CA" });
    const asIds = stubStripe({ session: { setup_intent: "seti_1", metadata: {}, customer_details: null } });
    expect(await stripeGateway(asIds.s)!.getSetupSession("cs_1")).toMatchObject({ paymentMethod: null, userId: null, currency: null, country: null });
  });

  it("reads the saved card's fingerprint from the expanded payment method (Unit 5, first-time-only codes)", async () => {
    let expand: unknown;
    const { s } = stubStripe({ session: { setup_intent: { id: "seti", payment_method: { id: "pm_9", card: { fingerprint: "fp_abc" } } } } });
    const retrieve = s.checkout.sessions.retrieve.bind(s.checkout.sessions);
    (s.checkout.sessions as unknown as { retrieve: unknown }).retrieve = async (id: string, o: { expand: unknown }) => {
      expand = o.expand;
      return retrieve(id);
    };
    expect(await stripeGateway(s)!.getSetupSession("cs_1")).toMatchObject({ paymentMethod: "pm_9", cardFingerprint: "fp_abc" });
    expect(expand).toEqual(["setup_intent.payment_method"]);
    // A bare payment method id has no fingerprint to read.
    expect(await stripeGateway(stubStripe().s)!.getSetupSession("cs_1")).toMatchObject({ paymentMethod: "pm_1", cardFingerprint: null });
  });

  it("maps Stripe Tax's answer, and its invalid-location error, to the address check", async () => {
    expect(await stripeGateway(stubStripe({ taxStatus: "not_collecting" }).s)!.checkTaxLocation("cus_1")).toBe("not_collecting");
    expect(await stripeGateway(stubStripe({ taxError: "customer_tax_location_invalid" }).s)!.checkTaxLocation("cus_1")).toBe("invalid");
    await expect(stripeGateway(stubStripe({ taxError: "rate_limit" }).s)!.checkTaxLocation("cus_1")).rejects.toThrow();
    await expect(stripeGateway(stubStripe({ taxStatus: "failed" }).s)!.checkTaxLocation("cus_1")).rejects.toThrow(TaxLookupUnavailable);
  });

  it("is not available without a Stripe key", () => {
    expect(stripeGateway(null)).toBeNull();
  });
});

// --- Unit 4 (plan 2026-11-26-001): the Payment page's Stripe calls ----------------------------
// The shapes below are trimmed from the Endive sandbox responses recorded in the Unit 4 spike.

const taxLine = (amount: number, display_name: string, effective_percentage: number, reason = "standard_rated") => ({
  amount,
  taxable_amount: amount ? 28000 : 0,
  taxability_reason: reason,
  tax_behavior: "exclusive",
  type: "tax_rate_details",
  tax_rate_details: { tax_rate: { display_name, percentage: effective_percentage || 9.975, effective_percentage } },
});
const invoice = (o: Record<string, unknown> = {}) => ({
  currency: "cad",
  subtotal: 28000,
  total: 31640,
  total_discount_amounts: [],
  automatic_tax: { enabled: true, status: "complete" },
  total_taxes: [taxLine(3640, "HST", 13)],
  ...o,
});

function stubPayments(o: { previews?: (Record<string, unknown> | Error)[]; promos?: unknown[] } = {}) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const previews = [...(o.previews ?? [invoice()])];
  const s = {
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          calls.push({ method: "sessions.create", params });
          return { id: "cs_e1", url: null, client_secret: "cs_e1_secret_x" };
        },
        expire: async (id: string) => {
          calls.push({ method: "sessions.expire", params: { id } });
          if (id === "cs_done") throw Object.assign(new Error('Only Checkout Sessions with a status in ["open"] can be expired.'), { type: "StripeInvalidRequestError" });
          if (id === "cs_down") throw Object.assign(new Error("api down"), { type: "StripeAPIError" });
          return { id, status: "expired" };
        },
      },
    },
    invoices: {
      createPreview: async (params: Record<string, unknown>) => {
        calls.push({ method: "invoices.createPreview", params });
        const next = previews.shift();
        if (next instanceof Error) throw next;
        return next ?? invoice();
      },
    },
    promotionCodes: {
      list: async (params: Record<string, unknown>) => {
        calls.push({ method: "promotionCodes.list", params });
        return { data: o.promos ?? [] };
      },
    },
    prices: { retrieve: async () => ({ unit_amount: 28000, product: "prod_roger" }) },
  };
  return { s: s as unknown as Stripe, calls };
}

describe("stripeGateway: the embedded card session (Unit 4)", () => {
  it("opens an elements-mode setup session for cards only, without demanding a full address, and returns its client secret", async () => {
    const { s, calls } = stubPayments();
    const r = await stripeGateway(s)!.createEmbeddedSetupSession({ userId: "u1", customer: "cus_1", currency: "CAD", returnUrl: "https://x/start/payment/done?session_id={CHECKOUT_SESSION_ID}" });
    expect(r).toEqual({ id: "cs_e1", clientSecret: "cs_e1_secret_x" });
    const p = calls[0].params;
    expect(p).toMatchObject({
      mode: "setup",
      ui_mode: "elements",
      customer: "cus_1",
      currency: "cad",
      allowed_payment_method_types: ["card"],
      customer_update: { address: "auto", name: "auto" },
      return_url: "https://x/start/payment/done?session_id={CHECKOUT_SESSION_ID}",
      metadata: { user_id: "u1", currency: "CAD" },
    });
    // Endive refuses payment_method_types on sessions; "required" would ask for a street address.
    expect(p).not.toHaveProperty("payment_method_types");
    expect(p).not.toHaveProperty("billing_address_collection");
    expect(p).not.toHaveProperty("success_url");
  });

  it("reads the client secret back from a stored session, so it can be reused", async () => {
    const { s } = stubStripe({ session: { status: "open", client_secret: "cs_1_secret_y", setup_intent: { id: "seti_1", payment_method: null } } });
    expect(await stripeGateway(s)!.getSetupSession("cs_1")).toMatchObject({ status: "open", clientSecret: "cs_1_secret_y", paymentMethod: null });
  });

  it("expires an open session, leaves a closed one alone, and lets other failures through", async () => {
    const { s, calls } = stubPayments();
    const gw = stripeGateway(s)!;
    await gw.expireSetupSession("cs_open");
    await gw.expireSetupSession("cs_done");
    await expect(gw.expireSetupSession("cs_down")).rejects.toThrow("api down");
    expect(calls.map((c) => c.params.id)).toEqual(["cs_open", "cs_done", "cs_down"]);
  });
});

describe("stripeGateway.previewMonthly (Unit 4)", () => {
  const vars = { STRIPE_PRICE_MONTHLY_CAD: "price_cad", STRIPE_PRICE_MONTHLY_USD: "price_usd" };
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    Object.assign(process.env, vars);
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("previews the CAD monthly price for a Toronto postal code: subtotal, HST at 13%, total", async () => {
    const { s, calls } = stubPayments();
    expect(await stripeGateway(s)!.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6" })).toEqual({
      currency: "CAD",
      subtotalCents: 28000,
      discountCents: 0,
      tax: "calculated",
      taxCents: 3640,
      taxName: "HST",
      taxRate: 13,
      totalCents: 31640,
    });
    expect(calls[0].params).toMatchObject({
      customer_details: { address: { country: "CA", postal_code: "M5V 2T6" } },
      automatic_tax: { enabled: true },
      subscription_details: { items: [{ price: "price_cad" }] },
      expand: ["total_taxes.tax_rate_details.tax_rate"],
    });
    expect(calls[0].params).not.toHaveProperty("customer");
    expect(calls[0].params).not.toHaveProperty("discounts");
  });

  it("passes the coupon as a discount, and never inherits a customer's own discounts", async () => {
    const { s, calls } = stubPayments({
      previews: [invoice({ total: 25312, total_discount_amounts: [{ amount: 5600, discount: "di_1" }], total_taxes: [taxLine(2912, "HST", 13)] }), invoice()],
    });
    const gw = stripeGateway(s)!;
    expect(await gw.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6", coupon: "co_20" })).toMatchObject({ discountCents: 5600, taxCents: 2912, totalCents: 25312 });
    expect(calls[0].params.discounts).toEqual([{ coupon: "co_20" }]);
    await gw.previewMonthly({ customer: "cus_1", currency: "CAD", country: "CA", postal: "M5V 2T6" });
    expect(calls[1].params).toMatchObject({ customer: "cus_1", discounts: "" });
  });

  it("names only the taxes charged: Quebec charges GST, and QST (not registered) is left out", async () => {
    const { s } = stubPayments({ previews: [invoice({ total: 29400, total_taxes: [taxLine(1400, "GST", 5), taxLine(0, "QST", 0, "not_collecting")] })] });
    expect(await stripeGateway(s)!.previewMonthly({ currency: "CAD", country: "CA", postal: "H2X 1Y4" })).toMatchObject({ taxCents: 1400, taxName: "GST", taxRate: 5, totalCents: 29400 });
  });

  it("shows no tax line for a US state where Roger has no registration", async () => {
    const { s, calls } = stubPayments({ previews: [invoice({ currency: "usd", subtotal: 20000, total: 20000, total_taxes: [taxLine(0, "Sales Tax", 0, "not_collecting")] })] });
    expect(await stripeGateway(s)!.previewMonthly({ currency: "USD", country: "US", postal: "10001" })).toEqual({
      currency: "USD",
      subtotalCents: 20000,
      discountCents: 0,
      tax: "calculated",
      taxCents: 0,
      taxName: null,
      taxRate: null,
      totalCents: 20000,
    });
    expect(calls[0].params).toMatchObject({ subscription_details: { items: [{ price: "price_usd" }] } });
  });

  it("says the tax is pending when Stripe needs more location inputs (a postal code it cannot place)", async () => {
    const { s } = stubPayments({ previews: [invoice({ total: 28000, total_taxes: [], automatic_tax: { enabled: true, status: "requires_location_inputs" } })] });
    expect(await stripeGateway(s)!.previewMonthly({ currency: "CAD", country: "CA", postal: "X0X 0X0" })).toMatchObject({ tax: "pending", taxCents: 0, taxName: null, totalCents: 28000 });
  });

  it("falls back to a preview without tax when the tax calculation fails (Endive failed_tax_calculation)", async () => {
    const failed = Object.assign(new Error("Tax could not be calculated"), { type: "StripeInvalidRequestError", code: "failed_tax_calculation" });
    const { s, calls } = stubPayments({ previews: [failed, invoice({ total: 28000, total_taxes: [], automatic_tax: { enabled: false, status: null } })] });
    expect(await stripeGateway(s)!.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6" })).toMatchObject({ tax: "pending", taxCents: 0, totalCents: 28000 });
    expect(calls[1].params).toMatchObject({ automatic_tax: { enabled: false } });
  });

  it("raises CouponUnavailable when the coupon fails on the fallback preview too", async () => {
    const failed = Object.assign(new Error("Tax could not be calculated"), { type: "StripeInvalidRequestError", code: "failed_tax_calculation" });
    const expired = Object.assign(new Error("Coupon co_y is expired and cannot be applied."), { type: "StripeInvalidRequestError", code: "coupon_expired", param: "discounts" });
    const { s, calls } = stubPayments({ previews: [failed, expired] });
    await expect(stripeGateway(s)!.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6", coupon: "co_y" })).rejects.toThrow(CouponUnavailable);
    expect(calls).toHaveLength(2);
  });

  it("raises CouponUnavailable for a deleted or expired coupon (the error shapes seen in the sandbox)", async () => {
    const deleted = Object.assign(new Error("No such coupon: 'co_x'"), { code: "resource_missing", param: "discounts[0][coupon]" });
    const expired = Object.assign(new Error("Coupon co_y is expired and cannot be applied."), { code: "coupon_expired", param: "discounts" });
    const { s } = stubPayments({ previews: [deleted, expired] });
    const gw = stripeGateway(s)!;
    await expect(gw.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6", coupon: "co_x" })).rejects.toThrow(CouponUnavailable);
    await expect(gw.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6", coupon: "co_y" })).rejects.toThrow(CouponUnavailable);
  });

  it("lets any other error through", async () => {
    const { s } = stubPayments({ previews: [Object.assign(new Error("rate limited"), { code: "rate_limit" })] });
    await expect(stripeGateway(s)!.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6" })).rejects.toThrow("rate limited");
  });
});

describe("isCouponGone / isTaxPreviewError", () => {
  it("tells a coupon that no longer applies from a missing customer", () => {
    expect(isCouponGone({ code: "resource_missing", param: "discounts[0][coupon]" })).toBe(true);
    expect(isCouponGone({ code: "coupon_expired", param: "discounts" })).toBe(true);
    expect(isCouponGone({ code: "resource_missing", param: "customer" })).toBe(false);
  });

  it("treats only Stripe invalid-request errors with a known tax code as a tax preview error", () => {
    const bad = { type: "StripeInvalidRequestError" };
    expect(isTaxPreviewError({ ...bad, code: "failed_tax_calculation" })).toBe(true);
    expect(isTaxPreviewError({ ...bad, code: "customer_tax_location_invalid" })).toBe(true);
    expect(isTaxPreviewError({ rawType: "invalid_request_error", code: "taxes_calculation_failed" })).toBe(true);
    expect(isTaxPreviewError({ ...bad, code: "resource_missing", message: "No such price" })).toBe(false);
    // Not the person's location: a timeout, Stripe's own 5xx, or a message that merely mentions tax.
    expect(isTaxPreviewError({ type: "StripeAPIError", code: "failed_tax_calculation" })).toBe(false);
    expect(isTaxPreviewError({ type: "StripeConnectionError", message: "tax request timed out" })).toBe(false);
    expect(isTaxPreviewError({ ...bad, message: "Invalid location for tax" })).toBe(false);
    expect(isTaxPreviewError({ code: "failed_tax_calculation" })).toBe(false);
  });
});

describe("stripeGateway.createCustomer: an idempotency key reused with other details", () => {
  function stub(o: { createError?: unknown; found?: { id: string }[] }) {
    const searches: unknown[] = [];
    const s = {
      customers: {
        create: async () => {
          if (o.createError) throw o.createError;
          return { id: "cus_new" };
        },
        search: async (params: unknown) => {
          searches.push(params);
          return { data: o.found ?? [] };
        },
      },
    };
    return { s: s as unknown as Stripe, searches };
  }
  const mismatch = Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters they were first used with."), { type: "StripeIdempotencyError", rawType: "idempotency_error" });

  it("finds the customer already made for this user by its user_id metadata", async () => {
    const { s, searches } = stub({ createError: mismatch, found: [{ id: "cus_first" }] });
    expect(await stripeGateway(s)!.createCustomer({ userId: "u-1", email: "new@example.com", name: "Ana B" })).toBe("cus_first");
    expect(searches).toEqual([{ query: "metadata['user_id']:'u-1'", limit: 1 }]);
  });

  it("lets the error through when no customer is found, and leaves other errors alone", async () => {
    await expect(stripeGateway(stub({ createError: mismatch }).s)!.createCustomer({ userId: "u-1", email: "a@example.com", name: "A" })).rejects.toThrow("idempotent");
    const other = stub({ createError: Object.assign(new Error("api down"), { type: "StripeAPIError" }) });
    await expect(stripeGateway(other.s)!.createCustomer({ userId: "u-1", email: "a@example.com", name: "A" })).rejects.toThrow("api down");
    expect(other.searches).toHaveLength(0);
  });
});

/** A promotion code as Endive lists it with `expand: ["data.promotion.coupon"]` (from the spike). */
const promotionCode = (o: Record<string, unknown> = {}, coupon: Record<string, unknown> = {}) => ({
  id: "promo_1",
  object: "promotion_code",
  active: true,
  code: "WELCOME20",
  customer: null,
  expires_at: null,
  max_redemptions: 2,
  times_redeemed: 0,
  restrictions: { first_time_transaction: false, minimum_amount: null, minimum_amount_currency: null },
  promotion: {
    type: "coupon",
    coupon: { id: "co_20", valid: true, name: "Welcome 20%", percent_off: 20, amount_off: null, currency: null, duration: "once", duration_in_months: null, redeem_by: null, ...coupon },
  },
  ...o,
});

describe("stripeGateway.findPromotion (Unit 4)", () => {
  it("finds an active code (any case) and returns its coupon, label and limits", async () => {
    const { s, calls } = stubPayments({ promos: [promotionCode()] });
    expect(await stripeGateway(s)!.findPromotion("  welcome20 ", "CAD")).toEqual({
      valid: true,
      promotionCodeId: "promo_1",
      code: "WELCOME20",
      couponId: "co_20",
      label: "Welcome 20%",
      percentOff: 20,
      amountOffCents: null,
      duration: "once",
      durationInMonths: null,
      maxRedemptions: 2,
      timesRedeemed: 0,
      firstTimeOnly: false,
    });
    expect(calls[0].params).toEqual({ code: "welcome20", active: true, limit: 1, expand: ["data.promotion.coupon"] });
  });

  it("reads an amount-off coupon in the asked currency only", async () => {
    const amountOff = promotionCode({}, { percent_off: null, amount_off: 5000, currency: "usd" });
    expect(await stripeGateway(stubPayments({ promos: [amountOff] }).s)!.findPromotion("WELCOME20", "USD")).toMatchObject({ valid: true, amountOffCents: 5000 });
    expect(await stripeGateway(stubPayments({ promos: [amountOff] }).s)!.findPromotion("WELCOME20", "CAD")).toEqual({ valid: false });
  });

  it("refuses a malformed code without asking Stripe, and an unknown one after asking", async () => {
    const { s, calls } = stubPayments();
    const gw = stripeGateway(s)!;
    expect(await gw.findPromotion("no spaces!", "CAD")).toEqual({ valid: false });
    expect(calls).toHaveLength(0);
    expect(await gw.findPromotion("NOPE", "CAD")).toEqual({ valid: false });
    expect(calls).toHaveLength(1);
  });
});
