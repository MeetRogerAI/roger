import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeAdjustments } from "@/test-helpers/fake-adjustments";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import {
  finishReconcilePass,
  reconcileEvents,
  reconcilePassUnderway,
  reconcilePendingItems,
  reconcileUsers,
  settleOpenClaims,
  type EventSource,
} from "./reconcile";
import type { BillingGateway } from "./subscriptions";
import { handleStripeEvent } from "./webhook";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let stripe: ReturnType<typeof fakeAdjustments>;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const deps = () => ({ settings: mergeV3([]), now: new Date("2026-12-15T09:00:00Z"), adjust: stripe, query, transport, sleep: async () => {} });
const adjustment = async (status: string, item: string | null = null) =>
  (
    await query<{ id: string }>(
      "insert into pending_adjustments (user_id, period_start, amount_cents, currency, status, stripe_item) select id, '2026-12-03', 20000, 'USD', $1, $2 from users returning id",
      [status, item],
    )
  )[0].id;

beforeEach(async () => {
  ({ query } = await testDb());
  stripe = fakeAdjustments();
  sent = [];
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  await query(
    "insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, first_charge_at) values ('ana@example.com', 'active', 'monthly', 'USD', 'cus_1', 'sub_1', '2026-12-03T11:05:00Z')",
  );
});

describe("the pending-item reconcile", () => {
  it("deletes one of our pending items with no stored id for it, and keeps the stored one", async () => {
    const id = await adjustment("pending");
    const kept = await stripe.createInvoiceItem({ customer: "cus_1", subscription: "sub_1", amountCents: 20000, currency: "USD", description: "x", metadata: { adjustment_id: id }, idempotencyKey: "k1" });
    await query("update pending_adjustments set stripe_item = $1", [kept]);
    const orphan = stripe.stray("cus_1", "sub_1", { adjustment_id: "00000000-0000-0000-0000-000000000000" });
    expect(await reconcilePendingItems(query, deps())).toEqual({ checked: 2, deleted: 1, adopted: 0, foreign: 0, finished: true });
    expect(stripe.pending().map((i) => i.id)).toEqual([kept]);
    expect(stripe.items.has(orphan)).toBe(false);
  });

  it("deletes the item of an adjustment the app already deleted (a failed Stripe delete), and records it gone", async () => {
    const item = stripe.stray("cus_1", "sub_1", { adjustment_id: "x" });
    await adjustment("deleted", item);
    expect(await reconcilePendingItems(query, deps())).toMatchObject({ deleted: 1 });
    expect(stripe.pending()).toEqual([]);
    expect(await query("select stripe_deleted_at is not null as gone from pending_adjustments")).toEqual([{ gone: true }]);
  });

  it("adopts an item made for a live adjustment whose id was never stored", async () => {
    const id = await adjustment("pending");
    const item = await stripe.createInvoiceItem({ customer: "cus_1", subscription: "sub_1", amountCents: 20000, currency: "USD", description: "x", metadata: { adjustment_id: id }, idempotencyKey: "k1" });
    expect(await reconcilePendingItems(query, deps())).toMatchObject({ adopted: 1, deleted: 0 });
    expect(await query("select stripe_item from pending_adjustments")).toEqual([{ stripe_item: item }]);
  });

  it("stops when its time is up and carries on from there on the next pass", async () => {
    await query(
      "insert into users (email, status, plan, currency, stripe_customer, stripe_subscription) values ('bo@example.com', 'active', 'monthly', 'USD', 'cus_2', 'sub_2'), ('cy@example.com', 'active', 'monthly', 'USD', 'cus_3', 'sub_3')",
    );
    for (const c of ["cus_1", "cus_2", "cus_3"]) stripe.stray(c, "sub", { adjustment_id: "gone" });
    // Time for one customer per pass.
    const ticking = () => {
      let t = 0;
      return () => (t += 600);
    };
    expect(await reconcilePendingItems(query, deps(), { budgetMs: 1000, clock: ticking() })).toMatchObject({ deleted: 1, finished: false });
    expect(stripe.pending().map((i) => i.customer)).toEqual(["cus_2", "cus_3"]);
    expect(await reconcilePendingItems(query, deps(), { budgetMs: 1000, clock: ticking() })).toMatchObject({ deleted: 1, finished: false });
    expect(await reconcilePendingItems(query, deps(), { budgetMs: 1000, clock: ticking() })).toMatchObject({ deleted: 1, finished: true });
    expect(stripe.pending()).toEqual([]);
  });

  it("leaves a pending item Roger did not make, and tells admins once", async () => {
    const theirs = stripe.stray("cus_1", "sub_1");
    expect(await reconcilePendingItems(query, deps())).toMatchObject({ foreign: 1, deleted: 0 });
    await reconcilePendingItems(query, deps());
    expect(stripe.items.has(theirs)).toBe(true);
    expect(sent.map((m) => m.subject)).toEqual(["[Roger] A pending invoice item Roger did not make"]);
  });

  // S18 point c: the first charge's named higher-rate item waits pending for the subscription; the charge looks after it.
  it("leaves a first charge's higher-rate item alone, with no alert", async () => {
    const first = stripe.stray("cus_1", "sub_1", { kind: "first_month_higher_rate", claim_id: "claim_1" });
    expect(await reconcilePendingItems(query, deps())).toMatchObject({ foreign: 0, deleted: 0 });
    expect(stripe.items.has(first)).toBe(true);
    expect(sent).toEqual([]);
  });
});

describe("missed Stripe events", () => {
  const NOW = new Date("2026-12-15T09:00:00Z");
  const sec = (d: Date) => Math.floor(d.getTime() / 1000);
  const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
  const handle = (e: Stripe.Event) => handleStripeEvent(query, fakeGateway(), e, { getSettings: async () => settings, query, transport, now: NOW });
  let claim: string;

  beforeEach(async () => {
    const [{ id }] = await query<{ id: string }>(
      "insert into users (email, status, plan, currency, stripe_customer, free_lists_used) values ('bo@example.com', 'trial', 'monthly', 'USD', 'cus_bo', 2) returning id",
    );
    [{ id: claim }] = await query<{ id: string }>(
      "insert into charge_attempts (user_id, purpose, week_of, attempt, outcome, price, amount_cents, currency) values ($1, 'first_charge', '2026-12-14', 1, 'unknown', 'price_m', 22600, 'USD') returning id",
      [id],
    );
  });

  const paid = (id: string, created: Date) =>
    ({
      id,
      type: "invoice.paid",
      created: sec(created),
      data: {
        object: {
          id: `in_${id}`,
          billing_reason: "subscription_create",
          amount_paid: 22600,
          currency: "usd",
          lines: { data: [] },
          parent: { subscription_details: { subscription: "sub_bo", metadata: { claim_id: claim } } },
        },
      },
    }) as unknown as Stripe.Event;
  const pages = (...p: Stripe.Event[][]): EventSource & { calls: (string | undefined)[] } => {
    const calls: (string | undefined)[] = [];
    const src = async ({ startingAfter }: { since: number; startingAfter?: string }) => {
      calls.push(startingAfter);
      const i = startingAfter ? p.findIndex((page) => page.at(-1)?.id === startingAfter) + 1 : 0;
      return { events: p[i] ?? [], hasMore: i < p.length - 1 };
    };
    return Object.assign(src, { calls });
  };

  it("finds a paid invoice whose event never arrived and settles the user", async () => {
    const src = pages([paid("evt_paid", new Date(NOW.getTime() - 2 * 3_600_000))]);
    expect(await reconcileEvents(query, src, handle, { now: NOW })).toEqual({ seen: 1, handled: 1, failed: 0, finished: true });
    expect(await query("select status, stripe_subscription from users where email = 'bo@example.com'")).toEqual([{ status: "active", stripe_subscription: "sub_bo" }]);
    expect(await query("select outcome from charge_attempts where id = $1", [claim])).toEqual([{ outcome: "succeeded" }]);
    expect(sent).toHaveLength(1);
    // Handled once: the next pass skips it.
    expect(await reconcileEvents(query, src, handle, { now: NOW })).toMatchObject({ seen: 1, handled: 0 });
  });

  it("leaves an event the webhook already handled, and one still under an hour old", async () => {
    await query("insert into stripe_events (id, type, status) values ('evt_done', 'invoice.paid', 'done')");
    const src = pages([paid("evt_fresh", new Date(NOW.getTime() - 10 * 60_000)), paid("evt_done", new Date(NOW.getTime() - 5 * 3_600_000))]);
    expect(await reconcileEvents(query, src, handle, { now: NOW })).toEqual({ seen: 2, handled: 0, failed: 0, finished: true });
    expect(await query("select status from users where email = 'bo@example.com'")).toEqual([{ status: "trial" }]);
  });

  it("stops when its time is up and carries on from the last event it reached", async () => {
    const old = new Date(NOW.getTime() - 3 * 3_600_000);
    const src = pages([paid("evt_a", old)], [paid("evt_b", old)]);
    // Time for one event per pass.
    let t = 0;
    const clock = () => (t += 300);
    expect(await reconcileEvents(query, src, async () => {}, { now: NOW, budgetMs: 1000, clock })).toMatchObject({ seen: 1, finished: false });
    expect(await query("select value from settings where key = 'reconcile.eventsCursor'")).toEqual([{ value: { since: sec(NOW) - 7 * 86_400, after: "evt_a" } }]);
    t = 0;
    expect(await reconcileEvents(query, src, async () => {}, { now: NOW, budgetMs: 1000, clock })).toMatchObject({ seen: 1, finished: true });
    expect(src.calls).toEqual([undefined, "evt_a", "evt_a"]);
    expect(await query("select 1 from settings where key = 'reconcile.eventsCursor'")).toEqual([]);
  });

  it("counts a handler failure and goes on to the next event", async () => {
    const old = new Date(NOW.getTime() - 3 * 3_600_000);
    const src = pages([paid("evt_x", old), paid("evt_y", old)]);
    let n = 0;
    const flaky = async () => {
      if (n++ === 0) throw new Error("boom");
    };
    expect(await reconcileEvents(query, src, flaky, { now: NOW })).toEqual({ seen: 2, handled: 1, failed: 1, finished: true });
  });
});

describe("unsettled accounts", () => {
  const NOW = new Date("2026-12-15T09:00:00Z");
  const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
  let plans: ReturnType<typeof fakePlans>;
  const rdeps = (gw?: BillingGateway) => ({ settings, now: NOW, plans, gw, query, transport, sleep: async () => {} });

  beforeEach(() => {
    plans = fakePlans();
  });

  it("moves an account whose subscription ended in Stripe to cancelled", async () => {
    plans.add("sub_1", "cus_1", new Date("2027-01-03T11:05:00Z"));
    plans.end("sub_1", new Date("2026-12-14T11:05:00Z"));
    expect(await reconcileUsers(query, rdeps())).toMatchObject({ checked: 1, changed: 1, finished: true });
    expect(await query("select status from users where email = 'ana@example.com'")).toEqual([{ status: "cancelled" }]);
  });

  it("releases a renewal hold once Stripe has nothing open, and keeps one that is still unpaid", async () => {
    plans.add("sub_1", "cus_1", new Date("2027-01-03T11:05:00Z"));
    await query("update users set status = 'held', hold_reason = 'renewal_unpaid', renewal_failed_at = '2026-12-03T12:00:00Z'");
    await query(
      "insert into users (email, status, hold_reason, plan, currency, stripe_customer, stripe_subscription, renewal_failed_at) values ('bo@example.com', 'held', 'renewal_unpaid', 'monthly', 'USD', 'cus_2', 'sub_2', '2026-12-03T12:00:00Z')",
    );
    plans.add("sub_2", "cus_2", new Date("2027-01-03T11:05:00Z"));
    plans.openInvoice("in_2", "cus_2", "sub_2");
    await reconcileUsers(query, rdeps());
    expect(await query("select email, status from users order by email")).toEqual([
      { email: "ana@example.com", status: "active" },
      { email: "bo@example.com", status: "held" },
    ]);
  });

  it("reports a live subscription for a first-charge account that Roger does not count, once", async () => {
    await query("insert into users (email, status, plan, currency, stripe_customer, free_lists_used) values ('cy@example.com', 'trial', 'monthly', 'USD', 'cus_cy', 2)");
    plans.add("sub_1", "cus_1", new Date("2027-01-03T11:05:00Z"));
    const gw = { subscriptions: async (c: string) => (c === "cus_cy" ? [{ id: "sub_stray", status: "active", claimId: null }] : []) } as unknown as BillingGateway;
    expect(await reconcileUsers(query, rdeps(gw))).toMatchObject({ alerts: 1 });
    await reconcileUsers(query, rdeps(gw));
    expect(sent.map((m) => m.subject)).toEqual(["[Roger] Stripe has a live subscription Roger does not count"]);
  });

  it("stops when its time is up and carries on from the next account", async () => {
    plans.add("sub_1", "cus_1", new Date("2027-01-03T11:05:00Z"));
    await query("insert into users (email, status, plan, currency, stripe_customer, stripe_subscription) values ('bo@example.com', 'active', 'monthly', 'USD', 'cus_2', 'sub_2')");
    plans.add("sub_2", "cus_2", new Date("2027-01-03T11:05:00Z"));
    let t = 0;
    const clock = () => (t += 600);
    expect(await reconcileUsers(query, rdeps(), { budgetMs: 1000, clock })).toMatchObject({ checked: 1, finished: false });
    t = 0;
    expect(await reconcileUsers(query, rdeps(), { budgetMs: 1000, clock })).toMatchObject({ checked: 1, finished: true });
  });
});

describe("the daily pass", () => {
  const at = (iso: string) => new Date(iso);
  const keys = async () => (await query<{ key: string }>("select key from settings where key like 'reconcile.%' order by key")).map((r) => r.key);

  it("starts when none has finished in 24 hours, at any hour, with both cursors written before Stripe is asked", async () => {
    expect(await reconcilePassUnderway(query, at("2026-12-15T15:00:00Z"))).toBe(true);
    expect(await keys()).toEqual(["reconcile.eventsCursor", "reconcile.usersCursor"]);
    // Part-way: still under way the next hour, whatever the clock says.
    expect(await reconcilePassUnderway(query, at("2026-12-15T16:00:00Z"))).toBe(true);
    expect(await finishReconcilePass(query, at("2026-12-15T16:00:00Z"), at("2026-12-15T16:00:00Z"))).toBe(false);
    await query("delete from settings where key in ('reconcile.eventsCursor', 'reconcile.usersCursor')");
    expect(await finishReconcilePass(query, at("2026-12-15T16:00:00Z"), at("2026-12-15T16:00:00Z"))).toBe(true);
    expect(await reconcilePassUnderway(query, at("2026-12-16T15:00:00Z"))).toBe(false);
    expect(await reconcilePassUnderway(query, at("2026-12-16T16:00:00Z"))).toBe(true);
  });
});

describe("open claims", () => {
  it("reports a claim still open nine days after its Monday, once", async () => {
    await query("insert into charge_attempts (user_id, purpose, week_of, outcome) select id, 'first_charge', '2026-12-01', 'unknown' from users");
    const d = { gw: {} as BillingGateway, settings: mergeV3([]), now: new Date("2026-12-09T12:00:00Z"), query, transport, sleep: async () => {} };
    await settleOpenClaims(query, d);
    expect(sent).toEqual([]);
    await settleOpenClaims(query, { ...d, now: new Date("2026-12-11T12:00:00Z") });
    await settleOpenClaims(query, { ...d, now: new Date("2026-12-11T13:00:00Z") });
    expect(sent.map((m) => m.subject)).toEqual(["[Roger] A charge claim is still open"]);
  });
});
