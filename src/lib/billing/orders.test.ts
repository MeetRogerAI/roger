import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { runHourly } from "@/lib/housekeeping/job";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { runChargeJob } from "./charge-job";
import { cancelOrder, placeOrder } from "./orders";
import type { BillingGateway, ChargeResult, FoundInvoice, OrderGateway } from "./subscriptions";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const WEEK = "2026-12-14";
const SIX_AM = new Date("2026-12-14T11:05:00Z");
const SATURDAY = new Date("2026-12-12T15:00:00Z");
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);

/** A fake Stripe for orders: invoices with states, scripted payment outcomes, every step recorded. */
function fakeInvoices() {
  const invoices = new Map<string, FoundInvoice & { claimId: string; customer: string }>();
  const steps: string[] = [];
  const pay: (ChargeResult | "crash_before_pay")[] = [];
  const create: ("refuse_tax" | "item_fails")[] = [];
  let voidFails = false;
  const o: OrderGateway & { invoices: typeof invoices; steps: string[]; pay: typeof pay; create: typeof create; failVoid(): void; items: Set<string> } = {
    invoices,
    steps,
    pay,
    create,
    failVoid: () => (voidFails = true),
    items: new Set<string>(),
    async previewOrder() {
      return { totalCents: 5650, currency: "USD" };
    },
    async findOrderInvoice(customer, claimId) {
      return [...invoices.values()].find((i) => i.customer === customer && i.claimId === claimId) ?? null;
    },
    async createOrderInvoice({ customer, claimId, idempotencyKey }) {
      steps.push(`create:${idempotencyKey}`);
      const how = create.shift();
      if (how === "refuse_tax") return { ok: false, result: { kind: "tax_address", error: "customer_tax_location_invalid" } };
      const existing = [...invoices.values()].find((i) => i.claimId === claimId);
      if (existing) return { ok: true, invoice: existing.id };
      const id = `in_${invoices.size + 1}`;
      invoices.set(id, { id, status: "draft", amountPaid: 0, currency: "USD", claimId, customer });
      if (how === "item_fails") throw new Error("process died before the item");
      o.items.add(id);
      return { ok: true, invoice: id };
    },
    async payOrderInvoice(id, call) {
      steps.push(`pay:${call.idempotencyKey}`);
      const next = pay.shift() ?? { kind: "succeeded", object: id, amountCents: 5650, currency: "USD" };
      if (next === "crash_before_pay") throw new Error("process died before paying");
      // Like the real gateway: a draft gets its item (once, by key) before it is finalized.
      if (invoices.get(id)!.status === "draft") o.items.add(id);
      const inv = invoices.get(id)!;
      if (next.kind === "succeeded") invoices.set(id, { ...inv, status: "paid", amountPaid: 5650 });
      else if (inv.status === "draft") invoices.set(id, { ...inv, status: "open" });
      return next.kind === "succeeded" ? { ...next, object: id } : next;
    },
    async voidInvoice(id) {
      if (voidFails) {
        voidFails = false;
        throw new Error("Stripe was unreachable");
      }
      const inv = invoices.get(id);
      if (!inv) return;
      if (inv.status === "draft") invoices.delete(id);
      else if (inv.status === "open") invoices.set(id, { ...inv, status: "void" });
    },
  };
  return o;
}
const noSubs: BillingGateway = {
  preview: async () => ({ totalCents: 0, currency: "USD" }),
  subscriptions: async () => [],
  createSubscription: async () => ({ kind: "error", error: "unused" }),
};

let orders: ReturnType<typeof fakeInvoices>;
const deps = (now = SIX_AM) => ({ gw: noSubs, orders, settings, now, query, transport, sleep: async () => {} });
let uid: string;
const order = async () => (await query<{ status: string }>("select status from orders where user_id = $1", [uid]))[0]?.status;

async function arrive(o: { run?: boolean; picked?: boolean } = {}) {
  if (o.run ?? true) await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, $2, 'connector', 'hark', 'share', 'r', 'accepted')", [uid, WEEK]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, $2, $3)", [uid, WEEK, (o.picked ?? true) ? "picked" : "none"]);
}

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_RUN_USD", "price_run_usd");
  orders = fakeInvoices();
  [{ id: uid }] = await query<{ id: string }>(
    "insert into users (email, status, plan, currency, sharing, stripe_customer, free_lists_used) values ('ana@example.com', 'active', 'per_run', 'USD', 'share', 'cus_1', 2) returning id",
  );
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
});

describe("placing and cancelling", () => {
  it("orders the coming Monday and confirms by email; refuses after the Sunday cutoff", async () => {
    expect(await placeOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings, query, transport })).toEqual({ ok: true });
    expect(await order()).toBe("ordered");
    expect(sent.map((m) => m.subject)).toEqual(["Your list is ordered"]);
    expect(await placeOrder(query, { userId: uid, week: WEEK, now: SIX_AM, settings })).toMatchObject({ ok: false });
  });

  it("refuses an order with sharing off, in the action itself (spec check 39)", async () => {
    await query("update users set sharing = 'off'");
    expect(await placeOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings })).toMatchObject({ ok: false, message: expect.stringContaining("Zack is off") });
    expect(await order()).toBeUndefined();
  });

  it("cancels before the cutoff, and can re-order", async () => {
    await placeOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings });
    expect(await cancelOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings })).toEqual({ ok: true });
    expect(await order()).toBe("cancelled");
    await placeOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings });
    expect(await order()).toBe("ordered");
  });
});

describe("charging orders on Monday", () => {
  beforeEach(async () => {
    await placeOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings });
    sent = [];
  });

  it("invoices, pays and marks an order with a run charged, once", async () => {
    await arrive();
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ orders: { charged: 1 } });
    await runChargeJob(query, deps(), { week: WEEK });
    expect(await order()).toBe("charged");
    expect([...orders.invoices.values()].map((i) => i.status)).toEqual(["paid"]);
    expect(orders.steps.filter((s) => s.startsWith("pay"))).toHaveLength(1);
  });

  it("charges nothing and explains, once, when no run arrived (spec check 38) or no ideas were found", async () => {
    await arrive({ run: false });
    await runChargeJob(query, deps(), { week: WEEK });
    expect(await order()).toBe("no_run");
    expect(orders.steps).toEqual([]);
    expect(sent.map((m) => m.subject)).toEqual(["No list this week, and no charge"]);
    await runChargeJob(query, deps(), { week: WEEK });
    expect(sent).toHaveLength(1);
  });

  it("voids the invoice, fails the order and sends one email on a decline, leaving nothing owed", async () => {
    await arrive();
    orders.pay.push({ kind: "declined", code: "insufficient_funds", hard: false });
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ orders: { declined: 1 } });
    expect(await order()).toBe("failed");
    expect([...orders.invoices.values()].map((i) => i.status)).toEqual(["void"]);
    expect(sent.map((m) => m.subject)).toEqual(["Your card didn’t go through"]);
  });

  it("after a crash between making the invoice and paying it, the takeover finds the invoice and pays it once", async () => {
    await arrive();
    orders.pay.push("crash_before_pay");
    await runChargeJob(query, deps(), { week: WEEK });
    expect(await order()).toBe("ordered");
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    await runHourly(query, deps(new Date("2026-12-14T12:00:00Z")));
    expect(await order()).toBe("charged");
    expect(orders.invoices.size).toBe(1);
    expect(orders.steps.filter((s) => s.startsWith("create"))).toHaveLength(1);
  });

  it("never charges a one-at-a-time user who did not order (spec check 37)", async () => {
    await query("delete from orders");
    await arrive();
    await runChargeJob(query, deps(), { week: WEEK });
    expect(orders.steps).toEqual([]);
  });

  it("charges at most once when the user switched from monthly that Monday (spec check 41)", async () => {
    await arrive();
    await query(
      "insert into charge_attempts (user_id, purpose, week_of, attempt, outcome) values ($1, 'first_charge', $2, 1, 'succeeded')",
      [uid, WEEK],
    );
    await runChargeJob(query, deps(), { week: WEEK });
    expect(orders.steps).toEqual([]);
  });

  it("refuses to cancel while the charge is going through", async () => {
    await arrive();
    orders.pay.push("crash_before_pay");
    await runChargeJob(query, deps(), { week: WEEK });
    expect(await cancelOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings })).toMatchObject({ ok: false, message: expect.stringContaining("Try again") });
  });
});

describe("review follow-ups (12b)", () => {
  beforeEach(async () => {
    await placeOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings });
    await arrive();
    sent = [];
  });

  it("adds the missing item when a crash left a draft with none, and records the real amount", async () => {
    orders.create.push("item_fails");
    await runChargeJob(query, deps(), { week: WEEK });
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    await runHourly(query, deps(new Date("2026-12-14T12:00:00Z")));
    expect(await order()).toBe("charged");
    expect(orders.items.size).toBe(1);
    expect((await query<{ amount_cents: number }>("select amount_cents from orders"))[0].amount_cents).toBe(5650);
  });

  it("settles a definite refusal to make the invoice at once: no open claim, no takeover loop", async () => {
    orders.create.push("refuse_tax");
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ orders: { error: 1 } });
    expect(await order()).toBe("failed");
    expect(await query("select 1 from charge_attempts where outcome in ('claimed', 'unknown')")).toEqual([]);
  });

  it("gives up an order claim still open after its Monday, without charging late", async () => {
    orders.pay.push("crash_before_pay");
    await runChargeJob(query, deps(), { week: WEEK });
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    await runHourly(query, deps(new Date("2026-12-15T06:00:00Z")));
    expect(await order()).toBe("failed");
    expect(orders.steps.filter((s) => s.startsWith("pay"))).toHaveLength(1);
  });

  it("ends a one-at-a-time user's trial when an order is paid", async () => {
    await query("update users set status = 'trial'");
    await runChargeJob(query, deps(), { week: WEEK });
    expect((await query<{ status: string }>("select status from users"))[0].status).toBe("active");
  });

  it("voids an invoice later when the void failed right after a decline", async () => {
    orders.pay.push({ kind: "declined", code: "insufficient_funds", hard: false });
    orders.failVoid();
    await runChargeJob(query, deps(), { week: WEEK });
    expect([...orders.invoices.values()].map((i) => i.status)).toEqual(["open"]);
    await runHourly(query, deps(new Date("2026-12-14T12:00:00Z")));
    expect([...orders.invoices.values()].map((i) => i.status)).toEqual(["void"]);
  });

  it("cancels, without charging, an order whose account has since subscribed monthly", async () => {
    await query("update users set stripe_subscription = 'sub_1'");
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ orders: { cancelled: 1 } });
    expect(orders.steps).toEqual([]);
  });

  it("never charges the first month for a Monday already bought by order", async () => {
    await runChargeJob(query, deps(), { week: WEEK });
    await query("update users set plan = 'monthly', status = 'trial'");
    const { claimCharge } = await import("./claims");
    expect(await claimCharge(query, { userId: uid, purpose: "first_charge", weekOf: WEEK, attempt: 1 })).toBeNull();
  });

  it("reports when there is nothing to cancel", async () => {
    await query("delete from orders");
    expect(await cancelOrder(query, { userId: uid, week: WEEK, now: SATURDAY, settings })).toMatchObject({ ok: false });
  });
});
