import { describe, expect, it } from "vitest";
import { applySetup, describePlan, keyMode, LIVE_WEBHOOK_URL, planSetup, PRICES, WEBHOOK_EVENTS, type SetupClient } from "./live-setup";
import { STRIPE_API_VERSION } from "./stripe";

type Price = Awaited<ReturnType<SetupClient["prices"]["list"]>>["data"][number];
type Endpoint = Awaited<ReturnType<SetupClient["webhookEndpoints"]["list"]>>["data"][number];

/** An in-memory Stripe with just what the setup uses, counting every write. */
function fakeStripe(seed: { products?: { id: string; metadata: Record<string, string> }[]; prices?: Price[]; endpoints?: Endpoint[] } = {}) {
  const products = (seed.products ?? []).map((p) => ({ ...p, active: true }));
  const prices = [...(seed.prices ?? [])];
  const endpoints = [...(seed.endpoints ?? [])];
  const writes: string[] = [];
  let n = 0;
  const c: SetupClient = {
    products: {
      list: async () => ({ data: products }),
      create: async (p) => {
        writes.push("product");
        const row = { id: `prod_${++n}`, active: true, metadata: p.metadata };
        products.push(row);
        return row;
      },
    },
    prices: {
      list: async ({ lookup_keys }) => ({ data: prices.filter((p) => p.lookup_key && lookup_keys.includes(p.lookup_key)) }),
      create: async (p) => {
        writes.push(`price:${p.lookup_key}`);
        const row: Price = { id: `price_${++n}`, lookup_key: p.lookup_key, currency: p.currency, unit_amount: p.unit_amount, product: p.product, tax_behavior: p.tax_behavior, recurring: { interval: "month" } };
        prices.push(row);
        return row;
      },
    },
    webhookEndpoints: {
      list: async () => ({ data: endpoints }),
      create: async (p) => {
        writes.push("webhook");
        const row: Endpoint = { id: `we_${++n}`, url: p.url, enabled_events: p.enabled_events, api_version: p.api_version, status: "enabled" };
        endpoints.push(row);
        return { id: row.id, secret: "whsec_shown_once" };
      },
      update: async (id, p) => {
        writes.push(`webhook_update:${id}`);
        endpoints.find((e) => e.id === id)!.enabled_events = p.enabled_events;
        return { id };
      },
    },
  };
  return { c, writes, prices, endpoints };
}

describe("live Stripe setup (launch list g-live-prices, g-live-webhook)", () => {
  it("plans a product, four tax-exclusive monthly prices and the webhook on an empty account, and writes nothing", async () => {
    const f = fakeStripe();
    const plan = await planSetup(f.c, "live");
    expect(plan.steps.map((s) => `${s.kind}:${s.action}`)).toEqual(["product:create", "price:create", "price:create", "price:create", "price:create", "webhook:create"]);
    expect(f.writes).toEqual([]);
    const text = describePlan(plan).join("\n");
    expect(text).toContain("USD 200.00 monthly, tax exclusive (STRIPE_PRICE_MONTHLY_USD)");
    expect(text).toContain("CAD 560.00 monthly, tax exclusive (STRIPE_PRICE_MONTHLY_HIGHER_CAD)");
    expect(text).toContain(`Create webhook ${LIVE_WEBHOOK_URL} on ${STRIPE_API_VERSION} with 7 events`);
  });

  it("applies the plan, returning every price id and the signing secret shown once", async () => {
    const f = fakeStripe();
    const out = await applySetup(f.c, await planSetup(f.c, "live"));
    expect(Object.keys(out.priceIds).sort()).toEqual(PRICES.map((p) => p.env).sort());
    expect(out.webhookSecret).toBe("whsec_shown_once");
    expect(f.prices.map((p) => [p.currency, p.unit_amount, p.tax_behavior])).toEqual([
      ["usd", 20000, "exclusive"],
      ["cad", 28000, "exclusive"],
      ["usd", 40000, "exclusive"],
      ["cad", 56000, "exclusive"],
    ]);
    expect(f.endpoints[0]).toMatchObject({ url: LIVE_WEBHOOK_URL, api_version: STRIPE_API_VERSION, enabled_events: [...WEBHOOK_EVENTS] });
  });

  it("is safe to run twice: the second run finds everything and creates nothing", async () => {
    const f = fakeStripe();
    const first = await applySetup(f.c, await planSetup(f.c, "live"));
    const writes = f.writes.length;
    const plan = await planSetup(f.c, "live");
    expect(plan.steps.every((s) => s.action === "exists")).toBe(true);
    const second = await applySetup(f.c, plan);
    expect(f.writes.length).toBe(writes);
    expect(second.priceIds).toEqual(first.priceIds);
    expect(second.webhookSecret).toBeUndefined();
  });

  it("adds missing events to an existing endpoint, keeping the ones it has", async () => {
    const f = fakeStripe({ endpoints: [{ id: "we_1", url: LIVE_WEBHOOK_URL, enabled_events: ["invoice.paid", "charge.refunded"], api_version: STRIPE_API_VERSION, status: "enabled" }] });
    const plan = await planSetup(f.c, "live");
    expect(plan.steps.at(-1)).toMatchObject({ kind: "webhook", action: "add_events", missing: WEBHOOK_EVENTS.filter((e) => e !== "invoice.paid") });
    await applySetup(f.c, plan);
    expect(new Set(f.endpoints[0].enabled_events)).toEqual(new Set([...WEBHOOK_EVENTS, "charge.refunded"]));
  });

  it("refuses to apply when an endpoint is on another API version, or a price with our lookup key is wrong", async () => {
    const f = fakeStripe({
      endpoints: [{ id: "we_old", url: LIVE_WEBHOOK_URL, enabled_events: [...WEBHOOK_EVENTS], api_version: "2025-01-27.acacia", status: "enabled" }],
      prices: [{ id: "price_x", lookup_key: "roger_monthly_standard_usd", currency: "usd", unit_amount: 10000, product: "prod_x", tax_behavior: "exclusive", recurring: { interval: "month" } }],
    });
    const plan = await planSetup(f.c, "live");
    expect(describePlan(plan).filter((l) => l.startsWith("CONFLICT"))).toHaveLength(2);
    await expect(applySetup(f.c, plan)).rejects.toThrow(/2 conflict/);
    expect(f.writes).toEqual([]);
  });

  it("flags a matching price whose tax behaviour is not exclusive", async () => {
    const f = fakeStripe({
      products: [{ id: "prod_r", metadata: { roger_product: "monthly" } }],
      prices: [{ id: "price_u", lookup_key: "roger_monthly_standard_usd", currency: "usd", unit_amount: 20000, product: "prod_r", tax_behavior: "unspecified", recurring: { interval: "month" } }],
    });
    const plan = await planSetup(f.c, "live");
    expect(plan.steps.find((s) => s.kind === "price" && s.lookupKey === "roger_monthly_standard_usd")).toMatchObject({ action: "conflict", problem: expect.stringContaining("tax behaviour unspecified") });
  });

  it("tells a live key from a test key, and anything else from both", () => {
    expect(keyMode("sk_live_abc")).toBe("live");
    expect(keyMode("rk_live_abc")).toBe("live");
    expect(keyMode("sk_test_abc")).toBe("test");
    expect(keyMode("pk_live_abc")).toBeNull();
    expect(keyMode(undefined)).toBeNull();
  });

  it("never puts a secret in the dry run", async () => {
    const f = fakeStripe();
    await applySetup(f.c, await planSetup(f.c, "live"));
    expect(describePlan(await planSetup(f.c, "live")).join("\n")).not.toMatch(/whsec_|sk_live|sk_test/);
  });
});
