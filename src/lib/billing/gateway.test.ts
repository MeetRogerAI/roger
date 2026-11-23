import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { stripeGateway, taxStatus, TaxLookupUnavailable } from "./gateway";

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
