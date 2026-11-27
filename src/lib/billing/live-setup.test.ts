import { describe, expect, it } from "vitest";
import { applySetup, describePlan, existingNames, keyMode, LIVE_WEBHOOK_URL, planSetup, PRICES, VERCEL_NAMES, WEBHOOK_EVENTS, type SetupClient } from "./live-setup";
import { STRIPE_API_VERSION } from "./stripe";

type Price = Awaited<ReturnType<SetupClient["prices"]["list"]>>["data"][number];
type Endpoint = Awaited<ReturnType<SetupClient["webhookEndpoints"]["list"]>>["data"][number];
type Product = { id: string; active: boolean; metadata: Record<string, string> };

const price = (over: Partial<Price> & { lookup_key: string }): Price => ({
  id: `price_${over.lookup_key}`,
  active: true,
  currency: "usd",
  unit_amount: 20000,
  product: "prod_r",
  tax_behavior: "exclusive",
  recurring: { interval: "month" },
  ...over,
});
const endpoint = (over: Partial<Endpoint> = {}): Endpoint => ({ id: "we_1", url: LIVE_WEBHOOK_URL, enabled_events: [...WEBHOOK_EVENTS], api_version: STRIPE_API_VERSION, status: "enabled", ...over });

/** An in-memory Stripe with just what the setup uses, counting every write. */
function fakeStripe(seed: { products?: Product[]; prices?: Price[]; endpoints?: Endpoint[] } = {}) {
  const products = [...(seed.products ?? [])];
  const prices = [...(seed.prices ?? [])];
  const endpoints = [...(seed.endpoints ?? [])];
  const writes: string[] = [];
  let n = 0;
  const c: SetupClient = {
    accounts: { retrieve: async () => ({ id: "acct_roger", country: "CA", business_profile: { name: "Roger" } }) },
    tax: {
      settings: { retrieve: async () => ({ defaults: { tax_code: "txcd_10103001", tax_behavior: "exclusive" }, head_office: { address: { country: "CA", state: "ON" } } }) },
      registrations: { list: async () => ({ data: [{ country: "CA", status: "active" }] }) },
    },
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
        const row = price({ id: `price_${++n}`, lookup_key: p.lookup_key, currency: p.currency, unit_amount: p.unit_amount, product: p.product, tax_behavior: p.tax_behavior });
        prices.push(row);
        return row;
      },
    },
    webhookEndpoints: {
      list: async () => ({ data: endpoints }),
      create: async (p) => {
        writes.push("webhook");
        const row = endpoint({ id: `we_${++n}`, url: p.url, enabled_events: p.enabled_events, api_version: p.api_version });
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

const conflicts = (lines: string[]) => lines.filter((l) => l.startsWith("CONFLICT"));

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

  it("shows which account the key opens and its tax settings before anything is applied", async () => {
    const lines = describePlan(await planSetup(fakeStripe().c, "live"));
    expect(lines[0]).toBe('Account acct_roger "Roger" (CA)');
    expect(lines[1]).toBe("Stripe Tax: default tax code txcd_10103001, default tax behaviour exclusive, head office ON, CA, active registrations: CA");
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
    const f = fakeStripe({ endpoints: [endpoint({ enabled_events: ["invoice.paid", "charge.refunded"] })] });
    const plan = await planSetup(f.c, "live");
    expect(plan.steps.at(-1)).toMatchObject({ kind: "webhook", action: "add_events", missing: WEBHOOK_EVENTS.filter((e) => e !== "invoice.paid") });
    await applySetup(f.c, plan);
    expect(new Set(f.endpoints[0].enabled_events)).toEqual(new Set([...WEBHOOK_EVENTS, "charge.refunded"]));
  });

  it("refuses to apply when an endpoint is on another API version, or a price with our lookup key is wrong", async () => {
    const f = fakeStripe({ endpoints: [endpoint({ id: "we_old", api_version: "2025-01-27.acacia" })], prices: [price({ lookup_key: "roger_monthly_standard_usd", unit_amount: 10000 })] });
    const plan = await planSetup(f.c, "live");
    expect(conflicts(describePlan(plan))).toHaveLength(2);
    await expect(applySetup(f.c, plan)).rejects.toThrow(/2 conflict/);
    expect(f.writes).toEqual([]);
  });

  it("flags a matching price whose tax behaviour is not exclusive", async () => {
    const f = fakeStripe({ prices: [price({ lookup_key: "roger_monthly_standard_usd", tax_behavior: "unspecified" })] });
    const plan = await planSetup(f.c, "live");
    expect(plan.steps.find((s) => s.kind === "price" && s.lookupKey === "roger_monthly_standard_usd")).toMatchObject({ action: "conflict", problem: expect.stringContaining("tax behaviour unspecified") });
  });

  it("treats an archived price holding our lookup key as a conflict, since the key stays taken", async () => {
    const f = fakeStripe({ prices: [price({ lookup_key: "roger_monthly_standard_cad", currency: "cad", unit_amount: 28000, active: false })] });
    expect(conflicts(describePlan(await planSetup(f.c, "live")))).toEqual(["CONFLICT price roger_monthly_standard_cad is archived (its lookup key is still taken)"]);
  });

  it("takes the product from existing prices, and refuses an archived one or two marked products", async () => {
    const onArchived = fakeStripe({ products: [{ id: "prod_r", active: false, metadata: { roger_product: "monthly" } }], prices: [price({ lookup_key: "roger_monthly_standard_usd" })] });
    expect(conflicts(describePlan(await planSetup(onArchived.c, "live")))).toEqual(["CONFLICT product prod_r is archived"]);
    const two = fakeStripe({
      products: [
        { id: "prod_a", active: true, metadata: { roger_product: "monthly" } },
        { id: "prod_b", active: true, metadata: { roger_product: "monthly" } },
      ],
    });
    expect(conflicts(describePlan(await planSetup(two.c, "live")))).toEqual(["CONFLICT product  2 active products carry the marker: prod_a, prod_b"]);
    const fromPrices = fakeStripe({ prices: [price({ lookup_key: "roger_monthly_standard_usd", product: "prod_existing" })] });
    expect((await planSetup(fromPrices.c, "live")).steps[0]).toEqual({ kind: "product", action: "exists", id: "prod_existing" });
  });

  it("treats a disabled endpoint, or two on our URL, as a conflict", async () => {
    expect(conflicts(describePlan(await planSetup(fakeStripe({ endpoints: [endpoint({ status: "disabled" })] }).c, "live")))).toEqual(["CONFLICT webhook we_1 is disabled"]);
    expect(conflicts(describePlan(await planSetup(fakeStripe({ endpoints: [endpoint(), endpoint({ id: "we_2" })] }).c, "live")))).toEqual(["CONFLICT webhook we_1 2 endpoints share this URL"]);
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

  it("reads which of its variables already exist from `vercel env ls` output", () => {
    const out = [
      "> Environment Variables found for helix3/roger [288ms]",
      "",
      " name                                       value                       type      environments                created    ",
      " NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY         eyJ2Ij…                     Config    Production                  19h ago    ",
      " STRIPE_PRICE_MONTHLY_USD                   Hidden                      Secret    Production                  2d ago     ",
      " STRIPE_WEBHOOK_SECRET_OLD                  Hidden                      Secret    Production                  2d ago     ",
    ].join("\n");
    expect(existingNames(out)).toEqual(["STRIPE_PRICE_MONTHLY_USD"]);
    expect(VERCEL_NAMES[0]).toBe("STRIPE_WEBHOOK_SECRET");
  });
});
