import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { classify, stripeBilling } from "./subscriptions";

/**
 * The first charge's Stripe calls with the promo locked in at card save
 * (plan 2026-11-26-001, Unit 8): `discounts: [{coupon}]` on the preview and
 * on subscription create, and Stripe's coupon errors as the Unit 4 spike
 * recorded them (deleted → `resource_missing` on `discounts[0][coupon]`;
 * expired → `coupon_expired` on `discounts`).
 */
function stubStripe(o: { createError?: unknown; previewError?: unknown } = {}) {
  const calls: { method: string; params: Record<string, unknown>; opts?: unknown }[] = [];
  const s = {
    invoices: {
      createPreview: async (params: Record<string, unknown>) => {
        calls.push({ method: "invoices.createPreview", params });
        if (o.previewError) throw o.previewError;
        return { total: params.discounts ? 25312 : 31640, currency: "cad", total_discount_amounts: params.discounts ? [{ amount: 5600, discount: "di_1" }] : [] };
      },
    },
    subscriptions: {
      create: async (params: Record<string, unknown>, opts: unknown) => {
        calls.push({ method: "subscriptions.create", params, opts });
        if (o.createError) throw o.createError;
        return { id: "sub_1", billing_cycle_anchor: 1_800_000_000, latest_invoice: { amount_paid: 25312, currency: "cad" } };
      },
    },
  };
  return { s: s as unknown as Stripe, calls };
}

const invalid = (code: string, param: string, message: string) => new Stripe.errors.StripeInvalidRequestError({ type: "invalid_request_error", code, param, message });
const create = { customer: "cus_1", price: "price_monthly_cad", claimId: "claim_1", userId: "u1", idempotencyKey: "first_charge:claim_1:1" };

describe("stripeBilling with a locked-in coupon", () => {
  it("previews and subscribes with discounts [{coupon}], and reads the discount off the preview", async () => {
    const { s, calls } = stubStripe();
    const gw = stripeBilling(s)!;
    expect(await gw.preview({ customer: "cus_1", price: "price_monthly_cad", coupon: "co_20" })).toEqual({ totalCents: 25312, currency: "CAD", discountCents: 5600 });
    expect(await gw.createSubscription({ ...create, coupon: "co_20" })).toMatchObject({ kind: "succeeded", amountCents: 25312, currency: "CAD" });
    expect(calls.map((c) => c.params.discounts)).toEqual([[{ coupon: "co_20" }], [{ coupon: "co_20" }]]);
    expect(calls[1].opts).toEqual({ idempotencyKey: "first_charge:claim_1:1" });
  });

  it("sends no discounts without a coupon (unchanged)", async () => {
    const { s, calls } = stubStripe();
    const gw = stripeBilling(s)!;
    expect(await gw.preview({ customer: "cus_1", price: "price_monthly_cad", coupon: null })).toEqual({ totalCents: 31640, currency: "CAD", discountCents: 0 });
    await gw.createSubscription({ ...create });
    expect(calls.every((c) => !("discounts" in c.params))).toBe(true);
  });

  it("answers coupon_gone for a deleted or expired coupon on create; the preview throws Stripe's error for the caller", async () => {
    const deleted = invalid("resource_missing", "discounts[0][coupon]", "No such coupon: 'co_20'");
    const expired = invalid("coupon_expired", "discounts", "Coupon co_20 is expired and cannot be applied.");
    for (const e of [deleted, expired]) {
      expect(await stripeBilling(stubStripe({ createError: e }).s)!.createSubscription({ ...create, coupon: "co_20" })).toEqual({ kind: "coupon_gone", error: e.message });
      await expect(stripeBilling(stubStripe({ previewError: e }).s)!.preview({ customer: "cus_1", price: "price_monthly_cad", coupon: "co_20" })).rejects.toBe(e);
    }
    // Without a coupon in the call, a resource_missing is not a coupon problem.
    expect(await stripeBilling(stubStripe({ createError: invalid("resource_missing", "customer", "No such customer") }).s)!.createSubscription(create)).toMatchObject({ kind: "error" });
  });

  it("maps Endive's failed_tax_calculation on create to a tax address problem (held, admin alert)", async () => {
    const e = invalid("failed_tax_calculation", "", "We could not calculate tax for this customer.");
    expect(await stripeBilling(stubStripe({ createError: e }).s)!.createSubscription({ ...create, coupon: "co_20" })).toEqual({ kind: "tax_address", error: e.message });
    expect(classify(Object.assign(new Error("x"), { code: "failed_tax_calculation" }))).toMatchObject({ kind: "tax_address" });
    expect(classify(Object.assign(new Error("x"), { code: "customer_tax_location_invalid" }))).toMatchObject({ kind: "tax_address" });
    // A card decline is still a decline.
    expect(classify(new Stripe.errors.StripeCardError({ type: "card_error", code: "card_declined", decline_code: "insufficient_funds", message: "declined" }))).toMatchObject({ kind: "declined", hard: false });
  });
});
