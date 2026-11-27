import { STRIPE_API_VERSION } from "./stripe";

/**
 * The Stripe objects production needs (launch list g-live-prices,
 * g-live-webhook; spec 1.4, S13 and S16), found or created so a second run
 * changes nothing. Used by scripts/stripe-live-setup.ts.
 *
 * Objects are found by our own markers, never by name: the product by
 * metadata `roger_product = monthly`, each price by its lookup key, the
 * webhook endpoint by its URL. Prices are monthly and tax exclusive ("before
 * tax"); Stripe Tax adds HST or nothing.
 */

export const PRODUCT_MARKER = { roger_product: "monthly" } as const;
export const PRODUCT = { name: "Roger Monthly", description: "Monthly Subscription to AI Intelligence Sharing" } as const;

export type PriceSpec = { env: string; lookupKey: string; currency: "usd" | "cad"; amount: number; nickname: string };

/** The four monthly prices, in cents (US$200, CA$280, US$400, CA$560 before tax). */
export const PRICES: PriceSpec[] = [
  { env: "STRIPE_PRICE_MONTHLY_USD", lookupKey: "roger_monthly_standard_usd", currency: "usd", amount: 20000, nickname: "Monthly USD" },
  { env: "STRIPE_PRICE_MONTHLY_CAD", lookupKey: "roger_monthly_standard_cad", currency: "cad", amount: 28000, nickname: "Monthly CAD" },
  { env: "STRIPE_PRICE_MONTHLY_HIGHER_USD", lookupKey: "roger_monthly_higher_usd", currency: "usd", amount: 40000, nickname: "Monthly higher rate USD" },
  { env: "STRIPE_PRICE_MONTHLY_HIGHER_CAD", lookupKey: "roger_monthly_higher_cad", currency: "cad", amount: 56000, nickname: "Monthly higher rate CAD" },
];

/** The seven events the webhook handles (S16). */
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.finalized",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.updated",
] as const;

export const LIVE_WEBHOOK_URL = "https://meetroger.ai/api/stripe/webhook";

/** The slice of the Stripe client this needs, so tests can pass a fake. */
export type SetupClient = {
  products: {
    list(p: { active: boolean; limit: number }): Promise<{ data: { id: string; active: boolean; metadata: Record<string, string> }[] }>;
    create(p: { name: string; description: string; metadata: Record<string, string> }): Promise<{ id: string }>;
  };
  prices: {
    list(p: { lookup_keys: string[]; active?: boolean; limit: number }): Promise<{
      data: { id: string; lookup_key: string | null; currency: string; unit_amount: number | null; product: string | { id: string }; tax_behavior: string | null; recurring: { interval: string } | null }[];
    }>;
    create(p: {
      product: string;
      currency: string;
      unit_amount: number;
      recurring: { interval: "month" };
      tax_behavior: "exclusive";
      lookup_key: string;
      nickname: string;
    }): Promise<{ id: string }>;
  };
  webhookEndpoints: {
    list(p: { limit: number }): Promise<{ data: { id: string; url: string; enabled_events: string[]; api_version: string | null; status: string }[] }>;
    create(p: { url: string; enabled_events: string[]; api_version: string; description: string }): Promise<{ id: string; secret?: string }>;
    update(id: string, p: { enabled_events: string[] }): Promise<{ id: string }>;
  };
};

export type Mode = "live" | "test";

/** The key's own mode, or null when it is not a secret or restricted key. */
export function keyMode(key: string | undefined): Mode | null {
  if (!key) return null;
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return null;
}

export type Step =
  | { kind: "product"; action: "exists" | "create"; id?: string }
  | { kind: "price"; env: string; lookupKey: string; action: "exists" | "create" | "conflict"; id?: string; problem?: string }
  | { kind: "webhook"; action: "exists" | "create" | "add_events" | "conflict"; id?: string; missing?: string[]; problem?: string };

export type Plan = { mode: Mode; steps: Step[] };

const productId = (p: string | { id: string }) => (typeof p === "string" ? p : p.id);

/** What applying would do. Reads only. */
export async function planSetup(c: SetupClient, mode: Mode, webhookUrl = LIVE_WEBHOOK_URL): Promise<Plan> {
  const steps: Step[] = [];
  // Listed, not searched: search lags a create by up to a minute, so a quick second run would make a duplicate.
  const found = (await c.products.list({ active: true, limit: 100 })).data.filter((p) => p.metadata?.roger_product === PRODUCT_MARKER.roger_product);
  const product = found[0]?.id;
  steps.push(product ? { kind: "product", action: "exists", id: product } : { kind: "product", action: "create" });

  const existing = (await c.prices.list({ lookup_keys: PRICES.map((p) => p.lookupKey), active: true, limit: 10 })).data;
  for (const spec of PRICES) {
    const p = existing.find((x) => x.lookup_key === spec.lookupKey);
    if (!p) {
      steps.push({ kind: "price", env: spec.env, lookupKey: spec.lookupKey, action: "create" });
      continue;
    }
    const problem =
      p.currency !== spec.currency || p.unit_amount !== spec.amount || p.recurring?.interval !== "month"
        ? `is ${p.currency} ${p.unit_amount} per ${p.recurring?.interval ?? "one-off"}, expected ${spec.currency} ${spec.amount} per month`
        : product && productId(p.product) !== product
          ? `belongs to ${productId(p.product)}, not ${product}`
          : p.tax_behavior !== "exclusive"
            ? `has tax behaviour ${p.tax_behavior}, expected exclusive`
            : undefined;
    steps.push(problem ? { kind: "price", env: spec.env, lookupKey: spec.lookupKey, action: "conflict", id: p.id, problem } : { kind: "price", env: spec.env, lookupKey: spec.lookupKey, action: "exists", id: p.id });
  }

  const ep = (await c.webhookEndpoints.list({ limit: 100 })).data.find((e) => e.url === webhookUrl);
  if (!ep) steps.push({ kind: "webhook", action: "create" });
  else if (ep.api_version !== STRIPE_API_VERSION) {
    // The version cannot be changed on an existing endpoint: someone has to delete it first.
    steps.push({ kind: "webhook", action: "conflict", id: ep.id, problem: `is on API version ${ep.api_version ?? "(account default)"}, expected ${STRIPE_API_VERSION}` });
  } else {
    const missing = WEBHOOK_EVENTS.filter((e) => !ep.enabled_events.includes(e) && !ep.enabled_events.includes("*"));
    steps.push(missing.length ? { kind: "webhook", action: "add_events", id: ep.id, missing } : { kind: "webhook", action: "exists", id: ep.id });
  }
  return { mode, steps };
}

export type Applied = {
  productId: string;
  priceIds: Record<string, string>;
  webhookId: string;
  /** Only when the endpoint was created now: Stripe shows a signing secret once. */
  webhookSecret?: string;
};

/** Carries out a plan. Refuses a plan with a conflict: those need a person. */
export async function applySetup(c: SetupClient, plan: Plan, webhookUrl = LIVE_WEBHOOK_URL): Promise<Applied> {
  const conflicts = plan.steps.filter((s) => s.action === "conflict");
  if (conflicts.length) throw new Error(`Not applied: ${conflicts.length} conflict(s) need a person first.`);

  const ps = plan.steps.find((s): s is Extract<Step, { kind: "product" }> => s.kind === "product")!;
  const product = ps.id ?? (await c.products.create({ ...PRODUCT, metadata: { ...PRODUCT_MARKER } })).id;

  const priceIds: Record<string, string> = {};
  for (const spec of PRICES) {
    const s = plan.steps.find((x): x is Extract<Step, { kind: "price" }> => x.kind === "price" && x.lookupKey === spec.lookupKey)!;
    priceIds[spec.env] =
      s.id ??
      (
        await c.prices.create({
          product,
          currency: spec.currency,
          unit_amount: spec.amount,
          recurring: { interval: "month" },
          tax_behavior: "exclusive",
          lookup_key: spec.lookupKey,
          nickname: spec.nickname,
        })
      ).id;
  }

  const ws = plan.steps.find((s): s is Extract<Step, { kind: "webhook" }> => s.kind === "webhook")!;
  if (ws.action === "create") {
    const ep = await c.webhookEndpoints.create({ url: webhookUrl, enabled_events: [...WEBHOOK_EVENTS], api_version: STRIPE_API_VERSION, description: "Roger production" });
    return { productId: product, priceIds, webhookId: ep.id, webhookSecret: ep.secret };
  }
  if (ws.action === "add_events") {
    const current = (await c.webhookEndpoints.list({ limit: 100 })).data.find((e) => e.id === ws.id)!;
    await c.webhookEndpoints.update(ws.id!, { enabled_events: [...new Set([...current.enabled_events, ...WEBHOOK_EVENTS])] });
  }
  return { productId: product, priceIds, webhookId: ws.id! };
}

/** One line per step, for the dry run Peter reads before saying yes. Never includes a secret. */
export function describePlan(plan: Plan): string[] {
  return plan.steps.map((s) => {
    if (s.kind === "product") return s.action === "create" ? `Create product "${PRODUCT.name}"` : `Product exists (${s.id})`;
    if (s.kind === "price") {
      const spec = PRICES.find((p) => p.lookupKey === s.lookupKey)!;
      const what = `${spec.currency.toUpperCase()} ${(spec.amount / 100).toFixed(2)} monthly, tax exclusive (${spec.env})`;
      return s.action === "create" ? `Create price ${what}` : s.action === "exists" ? `Price exists: ${what} (${s.id})` : `CONFLICT price ${s.lookupKey} ${s.problem}`;
    }
    if (s.action === "create") return `Create webhook ${LIVE_WEBHOOK_URL} on ${STRIPE_API_VERSION} with ${WEBHOOK_EVENTS.length} events`;
    if (s.action === "add_events") return `Add events to webhook ${s.id}: ${s.missing!.join(", ")}`;
    if (s.action === "exists") return `Webhook exists with every event (${s.id})`;
    return `CONFLICT webhook ${s.id} ${s.problem}`;
  });
}
