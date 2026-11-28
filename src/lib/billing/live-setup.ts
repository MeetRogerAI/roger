import { STRIPE_API_VERSION } from "./stripe";

/**
 * The Stripe objects production needs (launch list g-live-prices,
 * g-live-webhook; spec 1.4, S13 and S16), found or created so a second run
 * changes nothing. Used by scripts/stripe-live-setup.ts.
 *
 * Objects are found by our own markers, never by name: the product by
 * metadata `roger_product = monthly`, each price by its lookup key (archived
 * ones included, since a lookup key stays taken), the webhook endpoint by its
 * URL. Prices are monthly and tax exclusive ("before tax"); Stripe Tax adds
 * HST or nothing. Only the four monthly prices: production needs no one-list
 * price (spec 1.4; launch list S13, 2026-11-26).
 *
 * A second product, "Higher monthly rate" (metadata `roger_product =
 * higher_rate`, the same tax code), names the first invoice's higher-rate line
 * (S18 point c): Stripe names a line after its product. It has no prices of
 * its own; the first charge makes a one-off price on it (price_data).
 */

export const PRODUCT_MARKER = { roger_product: "monthly" } as const;
/** Tax code: SaaS for business use, on the accountant's word (Peter, 2026-11-27, launch list g-accountant). */
export const PRODUCT = { name: "Roger Monthly", description: "Monthly Subscription to AI Intelligence Sharing", tax_code: "txcd_10103001" } as const;

export const HIGHER_RATE_MARKER = { roger_product: "higher_rate" } as const;
/** The first invoice's higher-rate line is named after this product; taxed exactly like the plan (the same tax code). */
export const HIGHER_RATE_PRODUCT = {
  name: "Higher monthly rate",
  description: "The difference to the higher monthly rate, on the first invoice of a member whose Zack is not sharing",
  tax_code: PRODUCT.tax_code,
} as const;
/** The variable the app reads the higher-rate product id from (src/lib/billing/subscriptions.ts). */
export const HIGHER_RATE_ENV = "STRIPE_PRODUCT_HIGHER_RATE";

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

type StripePrice = {
  id: string;
  active: boolean;
  lookup_key: string | null;
  currency: string;
  unit_amount: number | null;
  product: string | { id: string };
  tax_behavior: string | null;
  recurring: { interval: string } | null;
};

/** The slice of the Stripe client this needs, so tests can pass a fake. */
export type SetupClient = {
  accounts: { retrieve(): Promise<{ id: string; country?: string | null; business_profile?: { name?: string | null } | null; settings?: { dashboard?: { display_name?: string | null } } | null }> };
  tax: {
    settings: { retrieve(): Promise<{ defaults?: { tax_code?: string | null; tax_behavior?: string | null } | null; head_office?: { address?: { country?: string | null; state?: string | null } | null } | null; status?: string }> };
    registrations: { list(p: { limit: number; status?: string }): Promise<{ data: { country: string; status: string }[] }> };
  };
  products: {
    list(p: { limit: number; active?: boolean }): Promise<{ data: { id: string; active: boolean; metadata: Record<string, string>; name?: string; tax_code?: string | { id: string } | null }[] }>;
    create(p: { name: string; description: string; tax_code: string; metadata: Record<string, string> }): Promise<{ id: string }>;
  };
  prices: {
    list(p: { lookup_keys: string[]; limit: number }): Promise<{ data: StripePrice[] }>;
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
  | { kind: "product"; action: "exists" | "create" | "conflict"; id?: string; problem?: string }
  | { kind: "higher_product"; action: "exists" | "create" | "conflict"; id?: string; problem?: string }
  | { kind: "price"; env: string; lookupKey: string; action: "exists" | "create" | "conflict"; id?: string; problem?: string }
  | { kind: "webhook"; action: "exists" | "create" | "add_events" | "conflict"; id?: string; missing?: string[]; problem?: string };

/** What the operator should see about the account before saying yes: never a secret. */
export type AccountFacts = { id: string; name: string; country: string; taxCode: string; taxBehavior: string; headOffice: string; registrations: string[] };

export type Plan = { mode: Mode; account: AccountFacts; steps: Step[] };

const productId = (p: string | { id: string }) => (typeof p === "string" ? p : p.id);

async function accountFacts(c: SetupClient): Promise<AccountFacts> {
  const a = await c.accounts.retrieve();
  const t = await c.tax.settings.retrieve().catch(() => null);
  const regs = await c.tax.registrations.list({ limit: 100 }).catch(() => ({ data: [] }));
  const ho = t?.head_office?.address;
  return {
    id: a.id,
    name: a.business_profile?.name || a.settings?.dashboard?.display_name || "(no name)",
    country: a.country ?? "?",
    taxCode: t?.defaults?.tax_code ?? "(none set)",
    taxBehavior: t?.defaults?.tax_behavior ?? "(none set)",
    headOffice: ho ? [ho.state, ho.country].filter(Boolean).join(", ") : "(none set)",
    registrations: regs.data.filter((r) => r.status === "active").map((r) => r.country),
  };
}

/** What applying would do. Reads only. */
export async function planSetup(c: SetupClient, mode: Mode, webhookUrl = LIVE_WEBHOOK_URL): Promise<Plan> {
  const account = await accountFacts(c);
  const steps: Step[] = [];

  // Archived prices too: a lookup key stays taken by an archived price.
  const existing = (await c.prices.list({ lookup_keys: PRICES.map((p) => p.lookupKey), limit: 10 })).data;
  // Listed, not searched: search lags a create by up to a minute, so a quick second run would make a duplicate.
  const marked = (await c.products.list({ limit: 100 })).data.filter((p) => p.metadata?.roger_product === PRODUCT_MARKER.roger_product);
  const fromPrices = [...new Set(existing.map((p) => productId(p.product)))];

  let product: string | undefined;
  if (fromPrices.length > 1) steps.push({ kind: "product", action: "conflict", problem: `the prices sit on ${fromPrices.length} products: ${fromPrices.join(", ")}` });
  else if (fromPrices.length === 1) {
    product = fromPrices[0];
    const p = marked.find((m) => m.id === product);
    steps.push(p && !p.active ? { kind: "product", action: "conflict", id: product, problem: "is archived" } : { kind: "product", action: "exists", id: product });
  } else {
    const active = marked.filter((m) => m.active);
    if (active.length > 1) steps.push({ kind: "product", action: "conflict", problem: `${active.length} active products carry the marker: ${active.map((m) => m.id).join(", ")}` });
    else if (active.length === 1) steps.push({ kind: "product", action: "exists", id: (product = active[0].id) });
    else steps.push({ kind: "product", action: "create" });
  }

  // The higher-rate product, by its own marker (archived ones are left alone; a new one is made).
  const higher = (await c.products.list({ limit: 100 })).data.filter((p) => p.active && p.metadata?.roger_product === HIGHER_RATE_MARKER.roger_product);
  if (higher.length > 1) steps.push({ kind: "higher_product", action: "conflict", problem: `${higher.length} active products carry the marker: ${higher.map((m) => m.id).join(", ")}` });
  else if (higher.length === 1) {
    const h = higher[0];
    const code = typeof h.tax_code === "string" ? h.tax_code : (h.tax_code?.id ?? null);
    steps.push(
      code !== HIGHER_RATE_PRODUCT.tax_code
        ? { kind: "higher_product", action: "conflict", id: h.id, problem: `has tax code ${code ?? "(none)"}, expected ${HIGHER_RATE_PRODUCT.tax_code} (the plan's)` }
        : { kind: "higher_product", action: "exists", id: h.id },
    );
  } else steps.push({ kind: "higher_product", action: "create" });

  for (const spec of PRICES) {
    const p = existing.find((x) => x.lookup_key === spec.lookupKey);
    if (!p) {
      steps.push({ kind: "price", env: spec.env, lookupKey: spec.lookupKey, action: "create" });
      continue;
    }
    const problem = !p.active
      ? "is archived (its lookup key is still taken)"
      : p.currency !== spec.currency || p.unit_amount !== spec.amount || p.recurring?.interval !== "month"
        ? `is ${p.currency} ${p.unit_amount} per ${p.recurring?.interval ?? "one-off"}, expected ${spec.currency} ${spec.amount} per month`
        : p.tax_behavior !== "exclusive"
          ? `has tax behaviour ${p.tax_behavior}, expected exclusive`
          : undefined;
    steps.push(problem ? { kind: "price", env: spec.env, lookupKey: spec.lookupKey, action: "conflict", id: p.id, problem } : { kind: "price", env: spec.env, lookupKey: spec.lookupKey, action: "exists", id: p.id });
  }

  const eps = (await c.webhookEndpoints.list({ limit: 100 })).data.filter((e) => e.url === webhookUrl);
  const ep = eps[0];
  if (!ep) steps.push({ kind: "webhook", action: "create" });
  else if (eps.length > 1) steps.push({ kind: "webhook", action: "conflict", id: ep.id, problem: `${eps.length} endpoints share this URL` });
  else if (ep.status !== "enabled") steps.push({ kind: "webhook", action: "conflict", id: ep.id, problem: `is ${ep.status}` });
  else if (ep.api_version !== STRIPE_API_VERSION) {
    // The version cannot be changed on an existing endpoint: someone has to delete it first.
    steps.push({ kind: "webhook", action: "conflict", id: ep.id, problem: `is on API version ${ep.api_version ?? "(account default)"}, expected ${STRIPE_API_VERSION}` });
  } else {
    const missing = WEBHOOK_EVENTS.filter((e) => !ep.enabled_events.includes(e) && !ep.enabled_events.includes("*"));
    steps.push(missing.length ? { kind: "webhook", action: "add_events", id: ep.id, missing } : { kind: "webhook", action: "exists", id: ep.id });
  }
  return { mode, account, steps };
}

export type Applied = {
  productId: string;
  /** The "Higher monthly rate" product, written as STRIPE_PRODUCT_HIGHER_RATE. */
  higherRateProductId: string;
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
  const hs = plan.steps.find((s): s is Extract<Step, { kind: "higher_product" }> => s.kind === "higher_product")!;
  const higherRateProductId = hs.id ?? (await c.products.create({ ...HIGHER_RATE_PRODUCT, metadata: { ...HIGHER_RATE_MARKER } })).id;

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
    return { productId: product, higherRateProductId, priceIds, webhookId: ep.id, webhookSecret: ep.secret };
  }
  if (ws.action === "add_events") {
    const current = (await c.webhookEndpoints.list({ limit: 100 })).data.find((e) => e.id === ws.id)!;
    await c.webhookEndpoints.update(ws.id!, { enabled_events: [...new Set([...current.enabled_events, ...WEBHOOK_EVENTS])] });
  }
  return { productId: product, higherRateProductId, priceIds, webhookId: ws.id! };
}

/** The dry run Peter reads before saying yes. Never includes a secret. */
export function describePlan(plan: Plan): string[] {
  const a = plan.account;
  const head = [
    `Account ${a.id} "${a.name}" (${a.country})`,
    `Stripe Tax: default tax code ${a.taxCode}, default tax behaviour ${a.taxBehavior}, head office ${a.headOffice}, active registrations: ${a.registrations.join(", ") || "none"}`,
  ];
  return [
    ...head,
    ...plan.steps.map((s) => {
      if (s.kind === "product") return s.action === "create" ? `Create product "${PRODUCT.name}" with tax code ${PRODUCT.tax_code}` : s.action === "exists" ? `Product exists (${s.id})` : `CONFLICT product ${s.id ?? ""} ${s.problem}`;
      if (s.kind === "higher_product") {
        const what = `"${HIGHER_RATE_PRODUCT.name}" (${HIGHER_RATE_ENV})`;
        return s.action === "create"
          ? `Create product ${what} with tax code ${HIGHER_RATE_PRODUCT.tax_code}`
          : s.action === "exists"
            ? `Product ${what} exists (${s.id})`
            : `CONFLICT product ${what} ${s.id ?? ""} ${s.problem}`;
      }
      if (s.kind === "price") {
        const spec = PRICES.find((p) => p.lookupKey === s.lookupKey)!;
        const what = `${spec.currency.toUpperCase()} ${(spec.amount / 100).toFixed(2)} monthly, tax exclusive (${spec.env})`;
        return s.action === "create" ? `Create price ${what}` : s.action === "exists" ? `Price exists: ${what} (${s.id})` : `CONFLICT price ${s.lookupKey} ${s.problem}`;
      }
      if (s.action === "create") return `Create webhook ${LIVE_WEBHOOK_URL} on ${STRIPE_API_VERSION} with ${WEBHOOK_EVENTS.length} events`;
      if (s.action === "add_events") return `Add events to webhook ${s.id}: ${s.missing!.join(", ")}`;
      if (s.action === "exists") return `Webhook exists with every event (${s.id})`;
      return `CONFLICT webhook ${s.id} ${s.problem}`;
    }),
  ];
}

/** The Vercel Production variables a run writes: the signing secret when the endpoint is new, the four price ids, and the higher-rate product id. */
export const VERCEL_NAMES = ["STRIPE_WEBHOOK_SECRET", ...PRICES.map((p) => p.env), HIGHER_RATE_ENV];

/** Names that already exist in Vercel and would block `vercel env add`, from `vercel env ls` output. */
export function existingNames(envLsOutput: string, wanted: string[] = VERCEL_NAMES): string[] {
  const present = new Set(envLsOutput.split(/\r?\n/).map((l) => /^\s*([A-Z][A-Z0-9_]+)\s/.exec(l)?.[1]).filter(Boolean));
  return wanted.filter((n) => present.has(n));
}
