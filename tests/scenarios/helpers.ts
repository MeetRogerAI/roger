/**
 * Scenario tests (plan Unit 19): the real job functions (Cora, charge, send,
 * the hourly pass, the Stripe webhook handler) driven week by week by a
 * simulated clock, from a clean baseline for every scenario.
 *
 * WHERE A SCENARIO RUNS: `SCENARIO_TARGET`
 *
 * - `fakes` (the default; what `npx vitest run` uses): a fresh in-process
 *   Postgres with `db/schema.sql` applied (`testDb()`), one in-memory fake of
 *   Stripe that implements every gateway the app has (card step, billing,
 *   orders, plans, adjustments) and produces the webhook events Stripe would,
 *   a recording mail transport, and fake models for intake, merge and Fit.
 *
 * - `sandbox` (a seam only, not built): the same scenarios against the
 *   scenario-test Neon branch (`SCENARIO_DATABASE_URL`, reset to its baseline
 *   before each scenario and holding the non-production marker row) and the
 *   Stripe sandbox (`STRIPE_SECRET_KEY` = an `sk_test_` key, the six test
 *   `STRIPE_PRICE_*` ids). `newWorld` would then build the gateways with
 *   `stripeGateway()`, `stripeBilling()`, `stripeOrders()`, `stripePlans()`
 *   and `stripeAdjustments()`, create a Stripe test clock per scenario and
 *   attach each customer to it, and `World.advance` would move the test clock
 *   with the app clock, wait for the clock to be ready, and run the reconcile
 *   (events, then accounts) instead of delivering fake events. The `Stripe`
 *   type below is the contract both sides meet. Asking for `sandbox` today
 *   throws, so a run never mistakes fakes for the sandbox.
 *
 * Every scenario moves the clock forward only; amounts are in cents.
 */
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { vi } from "vitest";
import { addDays, currentMonday, isAtOrPast, wallParts, wallToInstant } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { finishCardSave, openEmbeddedSetup } from "@/lib/billing/card-setup";
import type { CardSaveResult } from "@/lib/billing/card-saved";
import { choosePromoCode } from "@/lib/billing/promo";
import { finishSignup, sendSignupWelcome } from "@/lib/signup/finish";
import { placeOrder } from "@/lib/billing/orders";
import { runChargeJob, type ChargeJobResult } from "@/lib/billing/charge-job";
import type { ChargeDeps } from "@/lib/billing/first-charge";
import { isCouponGone, type CardGateway, type SetupSession } from "@/lib/billing/gateway";
import { anniversary } from "@/lib/billing/period";
import type {
  AdjustmentGateway,
  BillingGateway,
  ChargeResult,
  FirstExtra,
  InvoiceRow,
  OrderGateway,
  PlanGateway,
  SubscriptionInfo,
} from "@/lib/billing/subscriptions";
import { handleStripeEvent, type EventOutcome } from "@/lib/billing/webhook";
import { runCoraJob, type CoraDeps, type JobResult } from "@/lib/cora/job";
import { importSeedRun } from "@/lib/cora/seed-import";
import { runSendJob, type SendResult } from "@/lib/cora/send-job";
import { runHourly } from "@/lib/housekeeping/job";
import type { Transport } from "@/lib/mail/send";
import { mergeV3, type V3Settings } from "@/lib/v3-settings";
import { storeReport } from "@/lib/zack/receive";
import { fakePaymentStripe } from "@/test-helpers/fake-card-gateway";
import { testDb } from "@/test-helpers/pglite-db";

// A scenario walks weeks of jobs; with every test file running at once it needs more than the unit-test limit.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

export type Target = "fakes" | "sandbox";

export function scenarioTarget(): Target {
  const t = (process.env.SCENARIO_TARGET ?? "fakes").trim().toLowerCase();
  if (t !== "fakes" && t !== "sandbox") throw new Error(`SCENARIO_TARGET must be "fakes" or "sandbox", not "${t}".`);
  return t;
}

// ---------------------------------------------------------------------------
// Prices, as the six STRIPE_PRICE_* variables would name them in the sandbox.

export const PRICES = {
  price_monthly_usd: { cents: 20000, currency: "USD", product: "Roger monthly" },
  price_monthly_cad: { cents: 28000, currency: "CAD", product: "Roger monthly" },
  price_monthly_higher_usd: { cents: 40000, currency: "USD", product: "Roger monthly (higher rate)" },
  price_monthly_higher_cad: { cents: 56000, currency: "CAD", product: "Roger monthly (higher rate)" },
  price_run_usd: { cents: 10000, currency: "USD", product: "Roger list" },
  price_run_cad: { cents: 14000, currency: "CAD", product: "Roger list" },
} as const;
type PriceId = keyof typeof PRICES;

const PRICE_ENV: Record<string, PriceId> = {
  STRIPE_PRICE_MONTHLY_USD: "price_monthly_usd",
  STRIPE_PRICE_MONTHLY_CAD: "price_monthly_cad",
  STRIPE_PRICE_MONTHLY_HIGHER_USD: "price_monthly_higher_usd",
  STRIPE_PRICE_MONTHLY_HIGHER_CAD: "price_monthly_higher_cad",
  STRIPE_PRICE_RUN_USD: "price_run_usd",
  STRIPE_PRICE_RUN_CAD: "price_run_cad",
};

/** HST in Ontario; Stripe collects nothing in the US until the accountant says otherwise (plan, Needs a Decision). */
export const TAX_RATE: Record<string, number> = { CA: 0.13, US: 0 };

// ---------------------------------------------------------------------------
// The fake Stripe.

export type Line = { kind: "plan" | "extra" | "item" | "order" | "tax"; description: string; amountCents: number; invoiceItem: string | null; price: string | null };
export type FakeInvoice = {
  id: string;
  customer: string;
  subscription: string | null;
  claimId: string | null;
  billingReason: "subscription_create" | "subscription_cycle" | "manual";
  status: "draft" | "open" | "paid" | "void";
  currency: string;
  lines: Line[];
  totalCents: number;
  /** The locked-in promo's discount (`discounts: [{coupon}]`), taken off before tax. */
  discountCents?: number;
  created: number;
  periodStart: number | null;
};
type FakeSub = { id: string; customer: string; price: PriceId; claimId: string; userId: string; status: string; anchor: number; periodEnd: number; cancelAt: number | null; endedAt: number | null };
type FakeItem = { id: string; customer: string; subscription: string; amountCents: number; currency: string; description: string; metadata: Record<string, string>; invoice: string | null };
type FakeCustomer = { id: string; userId: string; email: string; country: string | null; cards: number };
export type Call = { method: string; args: Record<string, unknown> };

export type FakeStripe = CardGateway &
  BillingGateway &
  OrderGateway &
  PlanGateway &
  AdjustmentGateway & {
    calls: Call[];
    customers: Map<string, FakeCustomer>;
    subs: Map<string, FakeSub>;
    invoiceList: FakeInvoice[];
    items: Map<string, FakeItem>;
    sessions: Map<string, SetupSession>;
    /** Promotion codes and the Payment page's tax preview (shared with the unit-test fake). */
    payment: ReturnType<typeof fakePaymentStripe>;
    /** The next payments for a customer (first charge, order or renewal), in order; a success when none is queued. */
    script(customer: string, ...results: ("ok" | "soft" | "hard")[]): void;
    /** Stripe's hosted Checkout finished: the card and billing address are saved. */
    completeSession(id: string, country: "CA" | "US"): void;
    /** Stripe's own clock: renews or ends every subscription whose period is over, and returns the events it would send. */
    advance(now: Date): Stripe.Event[];
    callsTo(method: string): Call[];
    invoicesFor(customer: string): FakeInvoice[];
  };

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

export function fakeStripe(now: () => Date): FakeStripe {
  const customers = new Map<string, FakeCustomer>();
  const subs = new Map<string, FakeSub>();
  const invoiceList: FakeInvoice[] = [];
  const items = new Map<string, FakeItem>();
  const sessions = new Map<string, SetupSession>();
  const scripts = new Map<string, ("ok" | "soft" | "hard")[]>();
  const replays = new Map<string, ChargeResult>();
  /** The parameters each subscription-create idempotency key was first used with. */
  const keyParams = new Map<string, string>();
  const itemKeys = new Map<string, string>();
  const calls: Call[] = [];
  const payment = fakePaymentStripe({
    monthlyCents: { USD: PRICES.price_monthly_usd.cents, CAD: PRICES.price_monthly_cad.cents },
    tax: { CA: { rate: TAX_RATE.CA, name: "HST" }, US: { rate: TAX_RATE.US, name: "Sales Tax" } },
    now,
  });
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;
  const call = (method: string, args: Record<string, unknown>) => calls.push({ method, args: structuredClone(args) });

  const price = (p: string) => {
    const x = PRICES[p as PriceId];
    if (!x) throw new Error(`No such price: ${p}`);
    return x;
  };
  const country = (customer: string) => customers.get(customer)?.country ?? "US";
  /** Lines plus tax as its own row where tax is collected; a coupon's discount comes off before tax, as in Stripe. */
  const priced = (customer: string, lines: Line[], discountCents = 0) => {
    const subtotal = lines.reduce((s, l) => s + l.amountCents, 0) - discountCents;
    const tax = Math.round(subtotal * (TAX_RATE[country(customer)] ?? 0));
    const all = tax > 0 ? [...lines, { kind: "tax" as const, description: "HST (13%)", amountCents: tax, invoiceItem: null, price: null }] : lines;
    return { lines: all, totalCents: subtotal + tax, ...(discountCents ? { discountCents } : {}) };
  };
  /** The tax rows of an invoice or preview (Stripe's `total_taxes`). */
  const taxIn = (lines: Line[]) => lines.filter((l) => l.kind === "tax").reduce((t, l) => t + l.amountCents, 0);
  /** The coupon's amount off a first invoice's lines (throws Stripe's error for a deleted or expired coupon). */
  const couponOff = (coupon: string | null | undefined, p: string, lines: Line[]) =>
    coupon ? payment.couponOff(coupon, lines.reduce((s, l) => s + l.amountCents, 0), price(p).currency) : 0;
  const planLines = (p: string, extra?: FirstExtra): Line[] => [
    { kind: "plan", description: `1 × ${price(p).product}`, amountCents: price(p).cents, invoiceItem: null, price: p },
    // A pending invoice item with its own name, made just before the subscription, lands on its first invoice (S18 point c).
    ...(extra?.amountCents ? [{ kind: "extra" as const, description: extra.description, amountCents: extra.amountCents, invoiceItem: null, price: null }] : []),
  ];
  const nextPayment = (customer: string): ChargeResult | null => {
    const s = scripts.get(customer)?.shift();
    if (s === "soft") return { kind: "declined", code: "insufficient_funds", hard: false };
    if (s === "hard") return { kind: "declined", code: "stolen_card", hard: true };
    return null;
  };
  const invoice = (o: Omit<FakeInvoice, "id" | "created" | "lines" | "totalCents">, lines: Line[]): FakeInvoice => {
    const inv: FakeInvoice = { ...o, id: id("in"), created: sec(now()) + n, ...priced(o.customer, lines, o.discountCents ?? 0) };
    invoiceList.unshift(inv);
    return inv;
  };
  const row = (i: FakeInvoice): InvoiceRow => ({
    id: i.id,
    number: i.id.toUpperCase(),
    created: i.created,
    totalCents: i.totalCents,
    currency: i.currency,
    status: i.status,
    hostedUrl: `https://invoice.stripe.test/${i.id}`,
    subscription: i.subscription,
  });
  const info = (s: FakeSub): SubscriptionInfo => ({ id: s.id, status: s.status, customer: s.customer, cancelAt: s.cancelAt, periodEnd: s.periodEnd, endedAt: s.endedAt });

  const gw: FakeStripe = {
    calls,
    customers,
    subs,
    invoiceList,
    items,
    sessions,
    payment,
    callsTo: (m) => calls.filter((c) => c.method === m),
    invoicesFor: (c) => invoiceList.filter((i) => i.customer === c),
    script(customer, ...results) {
      scripts.set(customer, [...(scripts.get(customer) ?? []), ...results]);
    },

    // --- the card step (CardGateway)
    async createCustomer({ userId, email }) {
      call("customers.create", { userId, email });
      const found = [...customers.values()].find((c) => c.userId === userId);
      if (found) return found.id;
      const c = { id: id("cus"), userId, email, country: null, cards: 0 };
      customers.set(c.id, c);
      return c.id;
    },
    async createSetupSession({ userId, customer, currency, purpose }) {
      call("checkout.sessions.create", { userId, customer, currency, mode: "setup", purpose: purpose ?? null });
      const sid = id("cs");
      sessions.set(sid, { id: sid, status: "open", customer, paymentMethod: null, userId, currency, country: null, purpose: purpose ?? null });
      return { id: sid, url: `https://checkout.stripe.test/${sid}` };
    },
    async createEmbeddedSetupSession({ userId, customer, currency, returnUrl }) {
      call("checkout.sessions.create", { userId, customer, currency, mode: "setup", ui_mode: "elements", returnUrl });
      const sid = id("cs");
      const clientSecret = `${sid}_secret_test`;
      sessions.set(sid, { id: sid, status: "open", customer, paymentMethod: null, userId, currency, country: null, purpose: null, clientSecret });
      return { id: sid, clientSecret };
    },
    async expireSetupSession(sid) {
      call("checkout.sessions.expire", { id: sid });
      const s = sessions.get(sid);
      if (s?.status === "open") sessions.set(sid, { ...s, status: "expired" });
    },
    async getSetupSession(sid) {
      const s = sessions.get(sid);
      if (!s) throw Object.assign(new Error(`No such checkout.session: ${sid}`), { code: "resource_missing" });
      return { ...s };
    },
    // --- the Payment page's price box (Unit 4): the same fake tax as invoices (HST 13% in CA, none in the US)
    async previewMonthly(args) {
      call("invoices.createPreview.monthly", { ...args });
      return payment.previewMonthly(args);
    },
    async findPromotion(code, currency, opts) {
      call("promotionCodes.list", { code, currency });
      return payment.findPromotion(code, currency, opts);
    },
    async setDefaultCard(customer, pm) {
      call("customers.update.default_payment_method", { customer, pm });
    },
    async detachPaymentMethod(pm) {
      call("payment_methods.detach", { pm });
      const s = [...sessions.values()].find((x) => x.paymentMethod === pm);
      const c = s?.customer ? customers.get(s.customer) : undefined;
      if (c && c.cards > 0) c.cards -= 1;
    },
    async checkTaxLocation(customer) {
      return (TAX_RATE[country(customer)] ?? 0) > 0 ? "ok" : "not_collecting";
    },
    completeSession(sid, ctry) {
      const s = sessions.get(sid)!;
      sessions.set(sid, { ...s, status: "complete", paymentMethod: id("pm"), country: ctry });
      const c = customers.get(s.customer!)!;
      c.country = ctry;
      c.cards += 1;
    },

    // --- the first charge (BillingGateway)
    async unitAmount(p) {
      return price(p).cents;
    },
    async preview({ customer, price: p, extra, coupon }) {
      call("invoices.createPreview", { customer, price: p, extra: extra ?? null, coupon: coupon ?? null, automatic_tax: true });
      const lines = planLines(p, extra);
      const discountCents = couponOff(coupon, p, lines);
      const inv = priced(customer, lines, discountCents);
      return { totalCents: inv.totalCents, currency: price(p).currency, discountCents, taxCents: taxIn(inv.lines) };
    },
    async subscriptions(customer) {
      return [...subs.values()].filter((s) => s.customer === customer).map((s) => ({ id: s.id, status: s.status, claimId: s.claimId, anchor: s.anchor }));
    },
    async createSubscription({ customer, price: p, extra, coupon, claimId, userId, idempotencyKey }) {
      call("subscriptions.create", { customer, price: p, extra: extra ?? null, coupon: coupon ?? null, claimId, userId, idempotencyKey, payment_behavior: "error_if_incomplete", off_session: true, automatic_tax: true });
      // Stripe refuses a key reused with other parameters (StripeIdempotencyError), and replays the stored answer
      // for a reused key with the same ones, declines included.
      const sent = JSON.stringify([customer, p, extra ?? null, coupon ?? null, claimId, userId]);
      if ((keyParams.get(idempotencyKey) ?? sent) !== sent) {
        throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters they were first used with."), { type: "StripeIdempotencyError" });
      }
      keyParams.set(idempotencyKey, sent);
      const replay = replays.get(idempotencyKey);
      if (replay) return replay;
      let discountCents = 0;
      try {
        discountCents = couponOff(coupon, p, planLines(p, extra));
      } catch (e) {
        // A deleted or expired coupon: Stripe refuses the create (nothing made), as the real gateway maps it.
        if (coupon && isCouponGone(e)) return { kind: "coupon_gone", error: (e as Error).message };
        throw e;
      }
      const declined = nextPayment(customer);
      if (declined) {
        replays.set(idempotencyKey, declined);
        return declined;
      }
      const at = now();
      const s: FakeSub = { id: id("sub"), customer, price: p as PriceId, claimId, userId, status: "active", anchor: sec(at), periodEnd: sec(anniversary(at, 1)), cancelAt: null, endedAt: null };
      subs.set(s.id, s);
      const inv = invoice({ customer, subscription: s.id, claimId, billingReason: "subscription_create", status: "paid", currency: price(p).currency, periodStart: s.anchor, ...(discountCents ? { discountCents } : {}) }, planLines(p, extra));
      const r: ChargeResult = { kind: "succeeded", object: s.id, amountCents: inv.totalCents, currency: inv.currency, taxCents: taxIn(inv.lines), anchor: s.anchor };
      replays.set(idempotencyKey, r);
      return r;
    },

    // --- one list at a time (OrderGateway)
    async previewOrder({ customer, price: p }) {
      call("invoices.createPreview.order", { customer, price: p });
      const inv = priced(customer, [{ kind: "order", description: `1 × ${price(p).product}`, amountCents: price(p).cents, invoiceItem: null, price: p }]);
      return { totalCents: inv.totalCents, currency: price(p).currency, taxCents: taxIn(inv.lines) };
    },
    async findOrderInvoice(customer, claimId) {
      const i = invoiceList.find((x) => x.customer === customer && x.claimId === claimId);
      return i ? { id: i.id, status: i.status, amountPaid: i.status === "paid" ? i.totalCents : 0, currency: i.currency } : null;
    },
    async createOrderInvoice({ customer, price: p, claimId, idempotencyKey }) {
      call("invoices.create.order", { customer, price: p, claimId, idempotencyKey, pending_invoice_items_behavior: "exclude", auto_advance: false });
      const existing = invoiceList.find((x) => x.claimId === claimId);
      if (existing) return { ok: true, invoice: existing.id };
      const inv = invoice({ customer, subscription: null, claimId, billingReason: "manual", status: "draft", currency: price(p).currency, periodStart: null }, [
        { kind: "order", description: `1 × ${price(p).product}`, amountCents: price(p).cents, invoiceItem: null, price: p },
      ]);
      return { ok: true, invoice: inv.id };
    },
    async payOrderInvoice(invoiceId, o) {
      call("invoices.pay.order", { invoiceId, idempotencyKey: o.idempotencyKey });
      const inv = invoiceList.find((x) => x.id === invoiceId)!;
      if (inv.status === "draft") inv.status = "open";
      if (inv.status === "paid") return { kind: "succeeded", object: inv.id, amountCents: inv.totalCents, currency: inv.currency, receiptUrl: `https://invoice.stripe.test/${inv.id}` };
      const declined = nextPayment(inv.customer);
      if (declined) return declined;
      inv.status = "paid";
      return { kind: "succeeded", object: inv.id, amountCents: inv.totalCents, currency: inv.currency, receiptUrl: `https://invoice.stripe.test/${inv.id}` };
    },
    async voidInvoice(invoiceId) {
      call("invoices.void", { invoiceId });
      const inv = invoiceList.find((x) => x.id === invoiceId);
      if (inv && (inv.status === "open" || inv.status === "draft")) inv.status = "void";
    },

    // --- the billing page (PlanGateway)
    async getSubscription(sid) {
      const s = subs.get(sid);
      return s ? info(s) : null;
    },
    async cancelAtPeriodEnd(sid) {
      call("subscriptions.update.cancel_at_period_end", { sid });
      const s = subs.get(sid)!;
      s.cancelAt = s.periodEnd;
      return info(s);
    },
    async keepSubscription(sid) {
      call("subscriptions.update.keep", { sid });
      const s = subs.get(sid)!;
      if (s.status !== "canceled") s.cancelAt = null;
      return info(s);
    },
    async cancelNow(sid) {
      call("subscriptions.cancel", { sid });
      const s = subs.get(sid)!;
      s.status = "canceled";
      s.endedAt = sec(now());
      return info(s);
    },
    async removeCards(customer) {
      call("payment_methods.detach_all", { customer });
      const c = customers.get(customer)!;
      const k = c.cards;
      c.cards = 0;
      return k;
    },
    async invoices(customer) {
      return invoiceList.filter((i) => i.customer === customer && i.status !== "draft").map(row);
    },
    async unpaidInvoice(sid) {
      return (await gw.openInvoices(sid))[0] ?? null;
    },
    async openInvoices(sid) {
      return invoiceList.filter((i) => i.subscription === sid && i.status === "open").sort((a, b) => a.created - b.created).map(row);
    },
    async invoice(iid) {
      const i = invoiceList.find((x) => x.id === iid);
      return i ? row(i) : null;
    },
    async payInvoice(iid, key) {
      call("invoices.pay", { iid, key });
      const i = invoiceList.find((x) => x.id === iid)!;
      if (i.status === "open") i.status = "paid";
      return { kind: "succeeded", object: iid, amountCents: i.totalCents, currency: i.currency };
    },

    // --- the contributor rule (AdjustmentGateway)
    async createInvoiceItem({ customer, subscription, amountCents, currency, description, metadata, idempotencyKey }) {
      call("invoiceItems.create", { customer, subscription, amountCents, currency, description, metadata, idempotencyKey });
      const known = itemKeys.get(idempotencyKey);
      if (known) return known;
      const it: FakeItem = { id: id("ii"), customer, subscription, amountCents, currency: currency.toUpperCase(), description, metadata, invoice: null };
      items.set(it.id, it);
      itemKeys.set(idempotencyKey, it.id);
      return it.id;
    },
    async deleteInvoiceItem(iid) {
      call("invoiceItems.del", { iid });
      const it = items.get(iid);
      if (it?.invoice) return "locked";
      items.delete(iid);
      return "deleted";
    },
    async pendingInvoiceItems(customer) {
      return [...items.values()]
        .filter((i) => i.customer === customer && !i.invoice)
        .map((i) => ({ id: i.id, adjustmentId: i.metadata.adjustment_id ?? null, subscription: i.subscription, kind: i.metadata.kind ?? null }));
    },
    async previewRenewal({ customer, subscription }) {
      const s = subs.get(subscription)!;
      const pending = [...items.values()].filter((i) => i.subscription === subscription && !i.invoice);
      const inv = priced(customer, [...planLines(s.price), ...pending.map((i) => ({ kind: "item" as const, description: i.description, amountCents: i.amountCents, invoiceItem: i.id, price: null }))]);
      return { totalCents: inv.totalCents, taxCents: taxIn(inv.lines), currency: price(s.price).currency, lines: inv.lines.map((l) => ({ description: l.description, amountCents: l.amountCents, invoiceItem: l.invoiceItem })) };
    },

    // --- Stripe's own clock
    advance(at) {
      const events: Stripe.Event[] = [];
      for (const s of subs.values()) {
        while (s.status !== "canceled" && s.periodEnd <= sec(at)) {
          if (s.cancelAt && s.cancelAt <= s.periodEnd) {
            s.status = "canceled";
            s.endedAt = s.cancelAt;
            events.push(event("customer.subscription.deleted", { id: s.id, object: "subscription", ended_at: s.endedAt, status: "canceled" }));
            break;
          }
          // The renewal sweeps the subscription's pending items onto its invoice (Stripe's documented default).
          const pending = [...items.values()].filter((i) => i.subscription === s.id && !i.invoice);
          const start = s.periodEnd;
          const inv = invoice({ customer: s.customer, subscription: s.id, claimId: s.claimId, billingReason: "subscription_cycle", status: "open", currency: price(s.price).currency, periodStart: start }, [
            ...planLines(s.price),
            ...pending.map((i) => ({ kind: "item" as const, description: i.description, amountCents: i.amountCents, invoiceItem: i.id, price: null })),
          ]);
          for (const i of pending) i.invoice = inv.id;
          s.periodEnd = sec(anniversary(new Date(s.anchor * 1000), monthsSince(s.anchor, start) + 1));
          events.push(invoiceEvent("invoice.finalized", inv, s));
          if (!nextPayment(s.customer)) {
            inv.status = "paid";
            events.push(invoiceEvent("invoice.paid", inv, s));
          } else {
            events.push(invoiceEvent("invoice.payment_failed", inv, s));
          }
        }
      }
      return events;
    },
  };
  return gw;
}

function monthsSince(anchor: number, at: number): number {
  const a = new Date(anchor * 1000);
  const b = new Date(at * 1000);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
}

let eventN = 0;
/** A webhook event as Stripe would send it, with only the fields the handler reads. */
export function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: `evt_${++eventN}`, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object } } as unknown as Stripe.Event;
}

function invoiceEvent(type: string, inv: FakeInvoice, s: FakeSub): Stripe.Event {
  return event(type, {
    id: inv.id,
    object: "invoice",
    customer: inv.customer,
    status: inv.status,
    billing_reason: inv.billingReason,
    attempt_count: 1,
    amount_paid: inv.status === "paid" ? inv.totalCents : 0,
    currency: inv.currency.toLowerCase(),
    total_taxes: inv.lines.filter((l) => l.kind === "tax").map((l) => ({ amount: l.amountCents })),
    metadata: {},
    parent: { subscription_details: { subscription: s.id, metadata: { claim_id: s.claimId, user_id: s.userId } } },
    lines: {
      data: inv.lines
        .filter((l) => l.kind !== "tax")
        .map((l) => ({
          description: l.description,
          amount: l.amountCents,
          period: { start: inv.periodStart ?? inv.created },
          parent: l.invoiceItem ? { invoice_item_details: { invoice_item: l.invoiceItem } } : l.kind === "plan" ? { subscription_item_details: { subscription: s.id } } : null,
        })),
    },
  });
}

// ---------------------------------------------------------------------------
// The world: one scenario's database, Stripe, mail, models and clock.

export type Sent = { to: string; subject: string; text: string };

export type World = {
  query: Query;
  stripe: FakeStripe;
  sent: Sent[];
  settings: V3Settings;
  now: Date;
  cora: CoraDeps;
  /** Moves the app clock (never backwards); Stripe's clock follows and its events are delivered to the webhook. */
  at(iso: string | Date): Promise<void>;
  mail(email: string): Sent[];
  subjects(email: string): string[];
  charge(): ChargeDeps;
  webhook(e: Stripe.Event): Promise<EventOutcome>;
};

const mailOf = (w: { query: Query; transport: Transport }) => ({ query: w.query, transport: w.transport, sleep: async () => {} });

export async function newWorld(o: { start: string; settings?: { key: string; value: unknown }[] }): Promise<World> {
  if (scenarioTarget() === "sandbox") {
    throw new Error("SCENARIO_TARGET=sandbox is a seam only: the Stripe sandbox and the scenario Neon branch are not wired yet (see the top of tests/scenarios/helpers.ts).");
  }
  vi.stubEnv("ADMIN_EMAILS", "peter@example.com,ehab@example.com");
  for (const [k, v] of Object.entries(PRICE_ENV)) vi.stubEnv(k, v);
  const { query } = await testDb();
  const sent: Sent[] = [];
  const transport: Transport = async (m) => {
    sent.push({ to: m.to.join(","), subject: m.subject, text: m.text });
    return { ok: true };
  };
  const settings = mergeV3([{ key: "v3.cycleLive", value: true }, ...(o.settings ?? [])]);
  // The cycle went live before anyone in the scenario saved a card.
  await query(`insert into settings (key, value) values ('v3.cycleLive', 'true'::jsonb), ('v3.cycleLiveSince', to_jsonb($1::text)) on conflict (key) do nothing`, [new Date(o.start).toISOString()]);

  let clock = new Date(o.start);
  const stripe = fakeStripe(() => clock);
  const mail = mailOf({ query, transport });
  const cora: CoraDeps = {
    // Every scenario run carries a roger-run block, so intake parses by code; the review finds nothing.
    intake: { readRun: async () => Promise.reject(new Error("scenario runs carry a roger-run block")), review: async () => [] },
    // When in doubt, keep them separate: every play is its own pool play.
    merge: { sameJob: async () => null },
    fit: { fit: async (_u, cands) => cands.map((c) => ({ id: c.id, fit: 3 as const, frictionMatch: false, why: "category" as const })) },
    ...mail,
  };
  const w: World = {
    query,
    stripe,
    sent,
    settings,
    cora,
    get now() {
      return clock;
    },
    async at(t: string | Date) {
      const next = new Date(t);
      if (next < clock) throw new Error(`The clock only moves forward (${clock.toISOString()} -> ${next.toISOString()}).`);
      clock = next;
      for (const e of stripe.advance(clock)) await w.webhook(e);
    },
    mail: (email: string) => sent.filter((m) => m.to === email),
    subjects: (email: string) => sent.filter((m) => m.to === email).map((m) => m.subject),
    charge: (): ChargeDeps => ({ gw: stripe, orders: stripe, adjust: stripe, plans: stripe, settings, now: clock, ...mail }),
    webhook: (e: Stripe.Event) =>
      handleStripeEvent(query, stripe, e, { getSettings: async () => settings, now: clock, adjust: stripe, plans: stripe, billing: stripe, orders: stripe, ...mail }),
  };
  return w;
}

// ---------------------------------------------------------------------------
// The job clock: what Vercel Cron would call, through the same gates as the routes.

/** Toronto wall time on a date, as an instant (so a test reads like the spec: "Monday 6:00 AM"). */
export const toronto = (date: string, hm: string) => wallToInstant(date, hm);

/** One call Vercel Cron made, and what the job said. */
export type CronCall = { at: string; route: "cora" | "charge" | "send" | "housekeeping"; status: string; result: unknown };

/** One field of a cron expression (`*`, `*\/n`, `a-b`, `a-b/n`, numbers, comma lists) against a value. */
function cronField(field: string, value: number): boolean {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    let lo: number, hi: number;
    if (range === "*") [lo, hi] = [0, 59];
    else if (range.includes("-")) [lo, hi] = range.split("-").map(Number) as [number, number];
    else [lo, hi] = [Number(range), stepText ? 59 : Number(range)];
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

/** The cron schedules in vercel.json, read from the file, so a schedule change is tested as shipped. */
const SCHEDULES: Record<CronCall["route"], string> = (() => {
  const crons = (JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] }).crons;
  const of = (route: string) => {
    const c = crons.find((x) => x.path === `/api/cron/${route}`);
    if (!c) throw new Error(`vercel.json has no cron for /api/cron/${route}`);
    return c.schedule;
  };
  return { cora: of("cora"), charge: of("charge"), send: of("send"), housekeeping: of("housekeeping") };
})();

/** Whether a five-field UTC cron schedule fires at this minute (day of month and month are not used by Roger's). */
export function cronFires(schedule: string, at: Date): boolean {
  const [minute, hour, dom, month, dow] = schedule.trim().split(/\s+/);
  return (
    cronField(minute, at.getUTCMinutes()) &&
    cronField(hour, at.getUTCHours()) &&
    cronField(dom, at.getUTCDate()) &&
    cronField(month, at.getUTCMonth() + 1) &&
    cronField(dow, at.getUTCDay())
  );
}

/**
 * Vercel Cron, unattended, from now until `until`: each route at the UTC
 * minutes `vercel.json` schedules it (read from the file), passed through the
 * same gates the route applies before calling its job.
 */
export async function vercelCron(w: World, until: Date): Promise<CronCall[]> {
  const log: CronCall[] = [];
  const step = 5 * 60_000;
  for (let t = Math.ceil(w.now.getTime() / step) * step; t <= until.getTime(); t += step) {
    await w.at(new Date(t));
    const d = new Date(t);
    const at = d.toISOString();
    const torontoMonday = wallParts(w.now).dow === 1;
    const today = currentMonday(w.now);
    if (cronFires(SCHEDULES.cora, d) && torontoMonday && isAtOrPast(w.now, today, w.settings.coraAt)) {
      const r = await runCoraJob(w.query, w.cora, { now: w.now, settings: w.settings, week: today, budgetMs: 240_000 });
      log.push({ at, route: "cora", status: r.status, result: r });
    }
    if (cronFires(SCHEDULES.charge, d) && torontoMonday) {
      const r = await runChargeJob(w.query, w.charge(), { week: today });
      log.push({ at, route: "charge", status: r.status, result: r });
    }
    if (cronFires(SCHEDULES.send, d) && torontoMonday) {
      const c = w.charge();
      const r = await runSendJob(w.query, { settings: c.settings, now: c.now, gw: c.gw, adjust: c.adjust, query: c.query, transport: c.transport, sleep: c.sleep }, { week: today });
      log.push({ at, route: "send", status: r.status, result: r });
    }
    if (cronFires(SCHEDULES.housekeeping, d)) {
      const r = await hourly(w);
      log.push({ at, route: "housekeeping", status: "done", result: r });
    }
  }
  return log;
}

export async function hourly(w: World): Promise<Record<string, unknown>> {
  // The route's tasks, unmodified: the no-card close is handed this world's fake Stripe as the pass's card gateway.
  return runHourly(w.query, { ...w.charge(), card: w.stripe });
}

/** A Monday as the jobs see it: Cora from 1:00 AM, the charge at 6:00, the send at 7:00, with hourly passes between. */
export async function monday(w: World, week: string): Promise<{ cora: JobResult; charge: ChargeJobResult; send: SendResult }> {
  await w.at(toronto(week, "01:05"));
  const cora = await runCoraJob(w.query, w.cora, { now: w.now, settings: w.settings, week, budgetMs: 240_000 });
  await w.at(toronto(week, "02:05"));
  await hourly(w);
  await w.at(toronto(week, "06:05"));
  const charge = await runChargeJob(w.query, w.charge(), { week });
  await w.at(toronto(week, "07:05"));
  const d = w.charge();
  const send = await runSendJob(w.query, { settings: d.settings, now: d.now, gw: d.gw, adjust: d.adjust, query: d.query, transport: d.transport, sleep: d.sleep }, { week });
  await w.at(toronto(week, "08:05"));
  await hourly(w);
  return { cora, charge, send };
}

/** For each Monday: every member's Zack sends a run on the Sunday afternoon before, then the Monday runs. */
export async function weeksWithRuns(w: World, members: Pick<Member, "id" | "email">[], weeks: string[]): Promise<{ cora: JobResult; charge: ChargeJobResult; send: SendResult }[]> {
  const out = [];
  for (const week of weeks) {
    await w.at(wallToInstant(addDays(week, -1), "15:00"));
    for (const m of members) await sendRun(w, m);
    out.push(await monday(w, week));
  }
  return out;
}

/** Hourly passes from now until `until`, every `stepHours` hours (the real cron runs every hour). */
export async function passHours(w: World, until: Date, stepHours = 1): Promise<void> {
  for (let t = w.now.getTime() + stepHours * 3_600_000; t <= until.getTime(); t += stepHours * 3_600_000) {
    await w.at(new Date(t));
    await hourly(w);
  }
}

// ---------------------------------------------------------------------------
// People and runs.

/**
 * A member. `customer` is their Stripe customer: empty until the Payment page
 * first opens for them (it creates the customer), filled in by `saveCard`.
 */
export type Member = { id: string; email: string; customer: string; country: "CA" | "US" };

const PAYMENT_RETURN = "https://roger.test/start/payment/done?session_id={CHECKOUT_SESSION_ID}";
/** The address the Payment page's requests come from (the rate limits count by it). */
const MEMBER_IP = "203.0.113.7";

/**
 * Sign-up as it is now (plan 2026-11-26-001, Units 2 and 10): Steps 1 and 2
 * (the quiz and a verified account) leave the account at Step 3; Step 3,
 * Product and Pricing, records the consent and ends sign-up with exactly the
 * two calls `savePlan` makes (`finishSignup`, then `sendSignupWelcome` with
 * the action's clock). The account is a monthly trial with no card
 * (`trial_started_at` null) and no Stripe customer: the card is asked for when
 * the first list is ready (`saveCard`). `sponsored` sets `sponsor_id` (R29:
 * lists from the first Monday, never asked for a card).
 */
export async function signUp(
  w: World,
  o: { email: string; currency: "USD" | "CAD"; country: "CA" | "US"; sharing?: "share" | "match_only" | "off"; sponsored?: boolean },
): Promise<Member> {
  const [{ id }] = await w.query<{ id: string }>(
    `insert into users (email, name, status, plan, sharing, currency, signup_step, email_verified_at, sponsor_id)
     values ($1, 'Test', 'signup', 'monthly', $2, $3, 'plan', $4, $5) returning id`,
    [o.email, o.sharing ?? "share", o.currency, w.now.toISOString(), o.sponsored ? crypto.randomUUID() : null],
  );
  const c = w.charge();
  if (!(await finishSignup(w.query, id, c.now))) throw new Error("Step 3 did not end sign-up");
  await sendSignupWelcome(w.query, id, { settings: c.settings, now: c.now, query: c.query, transport: c.transport, sleep: c.sleep });
  const [u] = await w.query<{ status: string; signup_step: string; trial_started_at: string | null; stripe_customer: string | null }>(
    `select status, signup_step, trial_started_at, stripe_customer from users where id = $1`,
    [id],
  );
  if (u.status !== "trial" || u.signup_step !== "done" || u.trial_started_at !== null || u.stripe_customer !== null) {
    throw new Error(`Sign-up ended in ${JSON.stringify(u)}, not a trial with no card`);
  }
  return { id, email: o.email, customer: "", country: o.country };
}

/**
 * The Payment page (Step 4), driven as its server code is: the embedded setup
 * session is opened (or the open one reused) by `openEmbeddedSetup`, the
 * member confirms the card in Stripe's Payment Element (the fake completes the
 * session with the billing country), then the return page runs
 * `finishCardSave` and Stripe's `checkout.session.completed` reaches the
 * webhook (both are the same idempotent completion). `via: "webhook"` is a
 * member who closed the tab before the return page loaded. Fills in
 * `m.customer`.
 */
export async function saveCard(w: World, m: Member, o: { via?: "return_page" | "webhook"; country?: "CA" | "US" } = {}): Promise<CardSaveResult> {
  const sid = await openPayment(w, m);
  w.stripe.completeSession(sid, o.country ?? m.country);
  const c = w.charge();
  let result: CardSaveResult = { outcome: "pending" };
  if ((o.via ?? "return_page") === "return_page") {
    result = await finishCardSave(w.query, w.stripe, sid, { expectUserId: m.id, getSettings: async () => w.settings, now: c.now, query: c.query, transport: c.transport, sleep: c.sleep });
  }
  const outcome = await w.webhook(event("checkout.session.completed", { id: sid, object: "checkout.session", mode: "setup", metadata: { user_id: m.id } }));
  if (outcome !== "handled") throw new Error(`The card-save webhook was ${outcome}`);
  const [u] = await w.query<{ stripe_customer: string; trial_started_at: string | null }>(`select stripe_customer, trial_started_at from users where id = $1`, [m.id]);
  if (u.trial_started_at == null) throw new Error("The card was not saved");
  m.customer = u.stripe_customer;
  return result;
}

/** The Payment page opened (the member has not confirmed a card): the stored session's id. Fills in `m.customer`. */
export async function openPayment(w: World, m: Member): Promise<string> {
  const opened = await openEmbeddedSetup(w.query, w.stripe, { userId: m.id, ip: MEMBER_IP, returnUrl: PAYMENT_RETURN, now: w.now });
  if (!opened.ok) throw new Error(`Payment did not open: ${opened.reason}`);
  const [u] = await w.query<{ stripe_customer: string }>(`select stripe_customer from users where id = $1`, [m.id]);
  m.customer = u.stripe_customer;
  return opened.sessionId;
}

/** "Have a promo code?" → Apply on the Payment page (`applyPromo` → `choosePromoCode`), before the card is saved. */
export async function applyPromo(w: World, m: Member, code: string) {
  const [u] = await w.query<{ currency: "USD" | "CAD" }>(`select currency from users where id = $1`, [m.id]);
  return choosePromoCode(w.query, w.stripe, { userId: m.id, ip: MEMBER_IP, code, currency: u.currency }, { now: w.now });
}

/**
 * The new order's first list: Zack's run on the Sunday afternoon, the Monday
 * (the list is held: a titles-only teaser, nothing delivered, no free list
 * used), then the card saved on Payment at `cardAt` (default the Wednesday
 * after, at noon), which delivers that held list as free list 1.
 */
export async function firstList(w: World, members: Member[], week: string, o: { cardAt?: Date } = {}) {
  await w.at(wallToInstant(addDays(week, -1), "15:00"));
  for (const m of members) await sendRun(w, m);
  const r = await monday(w, week);
  for (const m of members) {
    if ((await delivered(w, m.id, week)).length) throw new Error(`${m.email}: the first list was delivered before a card was saved`);
  }
  await w.at(o.cardAt ?? toronto(addDays(week, 2), "12:00"));
  for (const m of members) {
    await saveCard(w, m);
    if (!(await delivered(w, m.id, week)).length) throw new Error(`${m.email}: the held list was not unlocked by the card`);
  }
  return r;
}

/**
 * Baseline shortcut for scenarios about a later state: a member who signed up
 * and saved a card before any list was held (Payment opened from a link). The
 * completion has nothing to unlock, and the next Monday delivers as usual.
 */
export async function withCard(w: World, o: Parameters<typeof signUp>[1]): Promise<Member> {
  const m = await signUp(w, o);
  await saveCard(w, m);
  return m;
}

/**
 * A leftover one-at-a-time account (preview data from before monthly became
 * the only plan): no sign-up path makes one now, so the account is moved to
 * `per_run` by hand after sign-up and its card saved. Only the dormant per-run
 * code (orders, switches) is exercised through it (plan Scope Boundaries).
 */
export async function leftoverPerRun(w: World, o: Parameters<typeof signUp>[1]): Promise<Member> {
  const m = await signUp(w, o);
  await w.query(`update users set plan = 'per_run' where id = $1`, [m.id]);
  await saveCard(w, m);
  return m;
}

/**
 * Baseline shortcuts for scenarios about a later state (thin weeks): the
 * member has had both free lists, as the trial scenario proves they can.
 * `told` stores the amount the second-list email would have told them, so the
 * third-list charge is not held as "amount changed".
 */
export async function afterFreeLists(w: World, m: Member, o: { told?: boolean } = {}): Promise<void> {
  const [u] = await w.query<{ plan: string; currency: "USD" | "CAD" }>(`select plan, currency from users where id = $1`, [m.id]);
  let quote: string | null = null;
  if (o.told && u.plan === "monthly") {
    const price = u.currency === "CAD" ? "price_monthly_cad" : "price_monthly_usd";
    const p = await w.stripe.preview({ customer: m.customer, price, extra: null });
    quote = JSON.stringify({ totalCents: p.totalCents, currency: p.currency, price, extraCents: 0, at: w.now.toISOString(), week: currentMonday(w.now) });
  }
  await w.query(`update users set free_lists_used = $2, quote = coalesce($3::jsonb, quote) where id = $1`, [m.id, w.settings.freeRuns, quote]);
}

/** Baseline shortcut: a monthly subscriber, subscribed now through the fake Stripe (as the first charge would). */
export async function subscribed(w: World, m: Member): Promise<string> {
  const [u] = await w.query<{ currency: "USD" | "CAD" }>(`select currency from users where id = $1`, [m.id]);
  const r = await w.stripe.createSubscription({ customer: m.customer, price: u.currency === "CAD" ? "price_monthly_cad" : "price_monthly_usd", claimId: crypto.randomUUID(), userId: m.id, idempotencyKey: `fixture:${m.id}` });
  if (r.kind !== "succeeded") throw new Error("fixture subscription failed");
  await w.query(
    `update users set status = 'active', free_lists_used = $2, stripe_subscription = $3, first_charge_at = $4, billing_anchor = $4 where id = $1`,
    [m.id, w.settings.freeRuns, r.object, new Date((r.anchor ?? 0) * 1000).toISOString()],
  );
  return r.object;
}

export const CATEGORIES = ["Email and calendar", "Listings", "Client follow-up", "Operations", "Marketing", "Research", "Sales"] as const;

let playN = 0;
/** One play in Zack 2.0's roger-run block shape. `link` puts a web link in the playbook, which intake always flags. */
export function play(title?: string, o: { category?: string; link?: boolean } = {}) {
  const k = ++playN;
  const t = title ?? `Play ${k}`;
  return {
    set: "A",
    title: t,
    category: o.category ?? CATEGORIES[k % CATEGORIES.length],
    job: `job${k} ${t.toLowerCase()}`,
    description: `${t}.`,
    minutes_saved_each: 10 + (k % 7) * 5,
    current_hours_week: 1 + (k % 4),
    confidence: "Medium",
    basis: "Implied",
    playbook_md: o.link ? "1. Open https://example.com/form and fill it in.\n2. Check it." : "1. Do the thing.\n2. Check it.",
    install_notes: "Save as a skill.",
  };
}

/** A Zack 2.0 report: at most four plays, two in each set (spec B.5). */
export const report = (plays: ReturnType<typeof play>[]) =>
  `# Zack v2.0\n\n\`\`\`roger-run\n${JSON.stringify({ zack_version: "2.0", plays: plays.map((p, i) => ({ ...p, set: i < 2 ? "A" : "B" })) })}\n\`\`\`\n`;

/** Zack sends this week's run through the connector, at the current time. */
export async function sendRun(w: World, m: Pick<Member, "id" | "email">, plays: ReturnType<typeof play>[] = [play(), play()]) {
  const [u] = await w.query<{ sharing: "share" | "match_only" | "off" }>(`select sharing from users where id = $1`, [m.id]);
  return storeReport(w.query, { id: m.id, email: m.email, sharing: u.sharing, agent: "hark" }, { text: report(plays), kind: "run" }, { route: "connector", test: false, cutoff: w.settings.runCutoff, now: w.now });
}

/** "Get next Monday's list" (spec B.9), as the order action calls it. */
export function order(w: World, m: Pick<Member, "id">, week: string) {
  const d = w.charge();
  return placeOrder(w.query, { userId: m.id, week, now: d.now, settings: d.settings, query: d.query, transport: d.transport, sleep: d.sleep });
}

/** Seed runs under hidden contributor records, merged into the pool at once (R23, R25). */
export async function seedPool(w: World, o: { contributors: number; playsEach: number; ranOn: string; labelPrefix?: string }): Promise<{ label: string; contributorId: string; titles: string[] }[]> {
  const out: { label: string; contributorId: string; titles: string[] }[] = [];
  for (let c = 0; c < o.contributors; c++) {
    const label = `${o.labelPrefix ?? "Seed"} ${c + 1}`;
    const plays = Array.from({ length: o.playsEach }, (_, i) => play(`${label} idea ${i + 1}`));
    const r = await importSeedRun(w.query, { label, agent: "hark", text: report(plays), ranOn: o.ranOn }, { model: w.cora.intake, merge: w.cora.merge, ...mailOf({ query: w.query, transport: w.cora.transport! }) });
    if (r.intake !== "accepted") throw new Error(`Seed run ${label} was ${r.intake}`);
    out.push({ label, contributorId: r.contributorId, titles: plays.map((p) => p.title) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading state back.

export async function userRow(w: World, id: string) {
  const [u] = await w.query<{
    status: string;
    plan: string;
    hold_reason: string | null;
    free_lists_used: number;
    stripe_subscription: string | null;
    quote: { totalCents: number; currency: string; price: string } | null;
    cancel_requested_at: string | null;
    access_ends_at: string | null;
    closed_reason: string | null;
    plan_change_to: string | null;
  }>(
    `select status, plan, hold_reason, free_lists_used, stripe_subscription, quote, cancel_requested_at::text, access_ends_at::text, closed_reason, plan_change_to from users where id = $1`,
    [id],
  );
  return u;
}

/** The titles delivered to a member for a week, in order. */
export async function delivered(w: World, userId: string, week: string): Promise<string[]> {
  const rows = await w.query<{ title: string }>(
    `select pp.title from picks k join pool_plays pp on pp.id = k.pool_play_id where k.user_id = $1 and k.week_of = $2 and not k.dry_run and k.delivered_at is not null order by k.position`,
    [userId, week],
  );
  return rows.map((r) => r.title);
}

export async function outcome(w: World, userId: string, week: string): Promise<string | null> {
  const [r] = await w.query<{ outcome: string }>(`select outcome from cora_user_weeks where user_id = $1 and week_of = $2 and not dry_run`, [userId, week]);
  return r?.outcome ?? null;
}

export const dollars = (cents: number, currency: string) => `${currency === "CAD" ? "CA$" : "US$"}${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`;
