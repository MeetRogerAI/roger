import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { isCouponGone } from "./gateway";
import { firstLineLabel, lineLabel } from "./adjustment";
import { classify, stripeBilling } from "./subscriptions";

/**
 * The first charge's Stripe calls with the promo locked in at card save
 * (plan 2026-11-26-001, Unit 8): `discounts: [{coupon}]` on the preview and
 * on subscription create, and Stripe's coupon errors as the Unit 4 spike
 * recorded them (deleted → `resource_missing` on `discounts[0][coupon]`;
 * expired → `coupon_expired` on `discounts`).
 */
type Item = { id: string; metadata: Record<string, string>; description?: string };
function stubStripe(o: { createError?: unknown; previewError?: unknown; pending?: Item[] } = {}) {
  const calls: { method: string; params: Record<string, unknown>; opts?: unknown }[] = [];
  // The customer's pending invoice items, as `invoiceItems.list({ pending: true })` returns them.
  const pending: Item[] = [...(o.pending ?? [])];
  let n = 0;
  const s = {
    prices: { retrieve: async (id: string) => ({ id, product: "prod_roger_monthly", tax_behavior: "unspecified" }) },
    invoiceItems: {
      list: (params: Record<string, unknown>) => (calls.push({ method: "invoiceItems.list", params }), pending.slice()),
      create: async (params: Record<string, unknown>, opts: unknown) => {
        calls.push({ method: "invoiceItems.create", params, opts });
        const item = { id: `ii_${++n}`, metadata: params.metadata as Record<string, string>, description: params.description as string };
        pending.push(item);
        return item;
      },
      del: async (id: string) => {
        calls.push({ method: "invoiceItems.del", params: { id } });
        pending.splice(pending.findIndex((i) => i.id === id), 1);
        return { id, deleted: true };
      },
    },
    invoices: {
      createPreview: async (params: Record<string, unknown>) => {
        calls.push({ method: "invoices.createPreview", params });
        if (o.previewError) throw o.previewError;
        return {
          total: params.discounts ? 25312 : 31640,
          currency: "cad",
          total_discount_amounts: params.discounts ? [{ amount: 5600, discount: "di_1" }] : [],
          total_taxes: [{ amount: params.discounts ? 2912 : 3640 }],
        };
      },
    },
    subscriptions: {
      create: async (params: Record<string, unknown>, opts: unknown) => {
        calls.push({ method: "subscriptions.create", params, opts });
        if (o.createError) throw o.createError;
        // Stripe puts the customer's pending items on the new subscription's first invoice.
        pending.length = 0;
        return { id: "sub_1", billing_cycle_anchor: 1_800_000_000, latest_invoice: { amount_paid: 25312, currency: "cad" } };
      },
    },
  };
  return { s: s as unknown as Stripe, calls, pending };
}

const invalid = (code: string, param: string, message: string) => new Stripe.errors.StripeInvalidRequestError({ type: "invalid_request_error", code, param, message });
const create = { customer: "cus_1", price: "price_monthly_cad", claimId: "claim_1", userId: "u1", idempotencyKey: "first_charge:claim_1:1" };

describe("stripeBilling with a locked-in coupon", () => {
  it("previews and subscribes with discounts [{coupon}], and reads the discount off the preview", async () => {
    const { s, calls } = stubStripe();
    const gw = stripeBilling(s)!;
    expect(await gw.preview({ customer: "cus_1", price: "price_monthly_cad", coupon: "co_20" })).toEqual({ totalCents: 25312, currency: "CAD", discountCents: 5600, taxCents: 2912 });
    expect(await gw.createSubscription({ ...create, coupon: "co_20" })).toMatchObject({ kind: "succeeded", amountCents: 25312, currency: "CAD" });
    expect(calls.map((c) => c.params.discounts)).toEqual([[{ coupon: "co_20" }], [{ coupon: "co_20" }]]);
    expect(calls[1].opts).toEqual({ idempotencyKey: "first_charge:claim_1:1" });
  });

  it("sends no discounts without a coupon (unchanged)", async () => {
    const { s, calls } = stubStripe();
    const gw = stripeBilling(s)!;
    expect(await gw.preview({ customer: "cus_1", price: "price_monthly_cad", coupon: null })).toEqual({ totalCents: 31640, currency: "CAD", discountCents: 0, taxCents: 3640 });
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

  // Review F6 (shape assumed, not seen in the sandbox): an amount-off coupon without the invoice's currency.
  it("answers coupon_gone for an amount-off coupon without the invoice's currency; other invalid requests are not", async () => {
    const mismatch = invalid("", "discounts[0][coupon]", "Coupon co_10usd does not support the currency cad.");
    expect(isCouponGone(mismatch)).toBe(true);
    expect(await stripeBilling(stubStripe({ createError: mismatch }).s)!.createSubscription({ ...create, coupon: "co_10usd" })).toMatchObject({ kind: "coupon_gone" });
    expect(isCouponGone(invalid("", "currency", "Invalid currency: xyz"))).toBe(false);
    expect(isCouponGone(Object.assign(new Error("The coupon currency does not match"), {}))).toBe(false);
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

/**
 * S18 point c (Peter, 2026-11-27): the first invoice's higher-rate line is named for why it is owed. Endive's
 * add_invoice_items takes no description (sandbox: "Received unknown parameter: add_invoice_items[0][description]"),
 * so the line is a pending invoice item made just before the subscription; the sandbox showed Stripe puts it on the
 * subscription's first invoice (one invoice, one charge, taxed like the plan line, the coupon applied to both), and
 * that a declined create leaves it pending.
 */
describe("stripeBilling: the first invoice's higher-rate line", () => {
  const extra = { amountCents: 28000, currency: "CAD", description: "Higher monthly rate: Zack not sharing" };
  const mine = (calls: { method: string }[]) => calls.map((c) => c.method).filter((m) => m !== "invoiceItems.list");

  it("previews and charges the same named line on the plan's product, in one subscription create", async () => {
    const { s, calls, pending } = stubStripe();
    const gw = stripeBilling(s)!;
    await gw.preview({ customer: "cus_1", price: "price_monthly_cad", extra });
    expect(calls[0].params.invoice_items).toEqual([{ price_data: { currency: "cad", product: "prod_roger_monthly", unit_amount: 28000 }, description: extra.description }]);
    calls.length = 0;
    expect(await gw.createSubscription({ ...create, extra })).toMatchObject({ kind: "succeeded" });
    expect(mine(calls)).toEqual(["invoiceItems.create", "subscriptions.create"]);
    const item = calls.find((c) => c.method === "invoiceItems.create")!;
    expect(item.params).toEqual({
      customer: "cus_1",
      description: "Higher monthly rate: Zack not sharing",
      price_data: { currency: "cad", product: "prod_roger_monthly", unit_amount: 28000 },
      metadata: { kind: "first_month_higher_rate", claim_id: "claim_1" },
    });
    expect(item.opts).toEqual({ idempotencyKey: "first_charge:claim_1:1:higher-rate" });
    // The subscription itself carries no extra line: never two of them.
    expect(calls.find((c) => c.method === "subscriptions.create")!.params).not.toHaveProperty("add_invoice_items");
    expect(pending).toEqual([]);
  });

  it("makes no item without a difference", async () => {
    const { s, calls } = stubStripe();
    await stripeBilling(s)!.createSubscription(create);
    expect(mine(calls)).toEqual(["subscriptions.create"]);
  });

  it("removes another claim's leftover item first, and a repeat of the same claim reuses its own", async () => {
    const leftover = { id: "ii_old", metadata: { kind: "first_month_higher_rate", claim_id: "claim_0" } };
    const own = { id: "ii_own", metadata: { kind: "first_month_higher_rate", claim_id: "claim_1" } };
    const adjustment = { id: "ii_adj", metadata: { adjustment_id: "a1" } };
    const { s, calls } = stubStripe({ pending: [leftover, own, adjustment] });
    await stripeBilling(s)!.createSubscription({ ...create, extra });
    expect(mine(calls)).toEqual(["invoiceItems.del", "subscriptions.create"]);
    expect(calls.find((c) => c.method === "invoiceItems.del")!.params).toEqual({ id: "ii_old" });
  });

  it("a decline removes the item (nothing was created); an unknown outcome keeps it for the takeover", async () => {
    const declined = new Stripe.errors.StripeCardError({ type: "card_error", code: "card_declined", decline_code: "generic_decline", message: "Your card was declined." });
    const d = stubStripe({ createError: declined });
    expect(await stripeBilling(d.s)!.createSubscription({ ...create, extra })).toMatchObject({ kind: "declined" });
    expect(mine(d.calls)).toEqual(["invoiceItems.create", "subscriptions.create", "invoiceItems.del"]);
    expect(d.pending).toEqual([]);

    const u = stubStripe({ createError: new Stripe.errors.StripeConnectionError({ message: "socket hang up" }) });
    expect(await stripeBilling(u.s)!.createSubscription({ ...create, extra })).toMatchObject({ kind: "unknown" });
    expect(u.pending.map((i) => i.metadata.claim_id)).toEqual(["claim_1"]);
  });

  it("clearFirstExtras deletes only the first-invoice items still pending", async () => {
    const { s, pending } = stubStripe({
      pending: [{ id: "ii_old", metadata: { kind: "first_month_higher_rate", claim_id: "claim_0" } }, { id: "ii_adj", metadata: { adjustment_id: "a1" } }],
    });
    expect(await stripeBilling(s)!.clearFirstExtras!("cus_1")).toBe(1);
    expect(pending.map((i) => i.id)).toEqual(["ii_adj"]);
  });
});

describe("the first invoice's higher-rate line name", () => {
  it("reads like the later invoices' adjustment lines, for whichever reason applies", () => {
    expect(firstLineLabel(["not_sharing"])).toBe("Higher monthly rate: Zack not sharing");
    expect(firstLineLabel(["two_misses"])).toBe("Higher monthly rate: two missed weeks");
    expect(firstLineLabel(["not_sharing", "two_misses", "not_sharing"])).toBe("Higher monthly rate: Zack not sharing and two missed weeks");
    expect(lineLabel("December 14 to January 14, 2027", "two_misses")).toBe("Higher-rate adjustment for December 14 to January 14, 2027: two missed weeks");
    expect(firstLineLabel(["not_sharing"])).not.toContain("Roger Monthly");
  });
});
