import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverWeek } from "@/lib/cora/deliver";
import type { Query } from "@/lib/db-query";
import { runHourly } from "@/lib/housekeeping/job";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import type { PlanDeps } from "./cancel";
import { runChargeJob } from "./charge-job";
import { repairPaidUsers } from "./first-charge";
import { carryToFirstCharge } from "./adjustment";
import { processContributions, recordWeek } from "./contribution";
import { placeOrder, sendOrderPrompts } from "./orders";
import type { BillingGateway, FoundSubscription, OrderGateway } from "./subscriptions";
import { switchLockedUntil, switchOffer, switchPlan } from "./switch";
import { handleStripeEvent } from "./webhook";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
// One at a time is not offered at launch (`plans.oneAtATimeOffered`, read through ./offered). Its machinery stays, and
// is tested here with the option on; "while one at a time is not offered" at the end turns it off.
const offer = vi.hoisted(() => ({ on: true }));
vi.mock("./offered", async (orig) => ({ ...(await orig<typeof import("./offered")>()), oneAtATimeOffered: () => offer.on }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const WEEK = "2026-12-14";
const SATURDAY = new Date("2026-12-12T15:00:00Z");
// Sunday 3:00 PM Toronto, before the 11:59 PM cutoff.
const SUNDAY = new Date("2026-12-13T20:00:00Z");
// Monday 3:00 AM Toronto: Sunday's cutoff has passed.
const MONDAY_3AM = new Date("2026-12-14T08:00:00Z");
const SIX_AM = new Date("2026-12-14T11:05:00Z");
// Tuesday 1:00 AM Toronto.
const TUESDAY = new Date("2026-12-15T06:00:00Z");
const FIRST = "2026-12-03T11:05:00Z";
const PERIOD_END = new Date("2027-01-03T11:05:00Z");

let plans: ReturnType<typeof fakePlans>;

/** Stripe's subscriptions: every create is counted (a charge), and the same claim never makes two. */
function fakeBilling() {
  const subs: FoundSubscription[] = [];
  // Tax at 13% on the extra too, so a told total shows whether the extra was in it.
  const total = (extra?: { amountCents: number } | null) => 22600 + Math.round((extra?.amountCents ?? 0) * 1.13);
  const g: BillingGateway & { created: () => number; subs: FoundSubscription[]; declining: boolean; extras: number[] } = {
    created: () => subs.length,
    subs,
    declining: false,
    extras: [],
    preview: async ({ extra }) => ({ totalCents: total(extra), currency: "USD" }),
    subscriptions: async () => subs,
    async createSubscription({ claimId, extra }) {
      g.extras.push(extra?.amountCents ?? 0);
      if (g.declining) return { kind: "declined", code: "stolen_card", hard: true };
      const s = subs.find((x) => x.claimId === claimId) ?? { id: `sub_${subs.length + 1}`, status: "active", claimId };
      if (!subs.includes(s)) subs.push(s);
      return { kind: "succeeded", object: s.id, amountCents: 22600, currency: "USD", anchor: Math.floor(SIX_AM.getTime() / 1000) };
    },
  };
  return g;
}

/** Order invoices: each paid one is a charge. */
function fakeOrders() {
  const paid: string[] = [];
  const o: OrderGateway & { paid: string[] } = {
    paid,
    previewOrder: async () => ({ totalCents: 5650, currency: "USD" }),
    findOrderInvoice: async () => null,
    createOrderInvoice: async ({ claimId }) => ({ ok: true, invoice: `in_${claimId.slice(0, 6)}` }),
    async payOrderInvoice(id) {
      paid.push(id);
      return { kind: "succeeded", object: id, amountCents: 5650, currency: "USD" };
    },
    voidInvoice: async () => {},
  };
  return o;
}

let billing: ReturnType<typeof fakeBilling>;
let orders: ReturnType<typeof fakeOrders>;
const deps = (now: Date): PlanDeps => ({ plans, gw: billing, settings, now, query, transport, sleep: async () => {} });
const chargeDeps = (now: Date) => ({ gw: billing, orders, plans, settings, now, query, transport, sleep: async () => {} });
const subjects = () => sent.filter((m) => !m.subject.startsWith("[Roger]")).map((m) => m.subject);
const user = async (id: string) =>
  (
    await query<{ status: string; plan: string; plan_change_to: string | null; cancel_requested_at: string | null; stripe_subscription: string | null; quote: { totalCents: number } | null }>(
      `select status, plan, plan_change_to, cancel_requested_at::text, stripe_subscription, quote from users where id = $1`,
      [id],
    )
  )[0];
const charges = () => billing.created() + orders.paid.length;

async function member(o: { status: string; plan: string; sub?: string; free?: number; first?: string }) {
  const customer = `cus_${Math.random().toString(36).slice(2, 8)}`;
  const [u] = await query<{ id: string }>(
    `insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, free_lists_used, first_charge_at, billing_anchor)
     values ($1, $2, $3, 'USD', 'share', $4, $5, $6, $7, $7) returning id`,
    [`${customer}@example.com`, o.status, o.plan, customer, o.sub ?? null, o.free ?? 2, o.first ?? null],
  );
  if (o.sub) plans.add(o.sub, customer, PERIOD_END);
  return u.id;
}

let play: string;
/** This week's run arrived and Cora picked a list for the user. */
async function ready(userId: string, week = WEEK) {
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready') on conflict do nothing", [week]);
  await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, $2, 'connector', 'hark', 'share', 'r', 'accepted')", [userId, week]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 1)", [userId, week]);
  await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, 1, $3, 70, 3, 'Fits.')", [userId, week, play]);
}

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  offer.on = true;
  plans = fakePlans();
  billing = fakeBilling();
  orders = fakeOrders();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  vi.stubEnv("STRIPE_PRICE_RUN_USD", "price_run_usd");
  const [p] = await query<{ id: string }>(
    `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
     values ('Inbox triage', 'Sales', 'Does it.', '1. Step.', 'Save it.', '2026-12-07', '2026-12-07', '{}', 70, 7, 7, 7, 7, 7) returning id`,
  );
  play = p.id;
});

describe("the switch window", () => {
  it("waits from Sunday's cutoff to the end of that Monday", () => {
    expect(switchLockedUntil(SUNDAY, settings)).toBeNull();
    expect(switchLockedUntil(MONDAY_3AM, settings)?.toISOString()).toBe("2026-12-15T05:00:00.000Z");
    expect(switchLockedUntil(TUESDAY, settings)).toBeNull();
  });
});

describe("monthly to one list at a time", () => {
  it("keeps lists to the end of the paid month, then only ordered lists are charged", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await query(
      `insert into pending_adjustments (user_id, period_start, amount_cents, currency, week_of, invoice_at, create_after, reason) values ($1, '2026-12-03', 20000, 'USD', '2026-12-07', $2, $3, 'two_misses')`,
      [id, PERIOD_END.toISOString(), SATURDAY.toISOString()],
    );
    // The effect is shown before the click.
    expect(await switchOffer(query, settings, SATURDAY, id)).toMatchObject({ to: "per_run", allowed: true, effect: expect.stringContaining("until Sunday, January 3") });
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" })).toMatchObject({ ok: true });
    expect(plans.calls).toEqual(["cancel_at_end:sub_a"]);
    expect(await user(id)).toMatchObject({ status: "active", plan: "monthly", plan_change_to: "per_run", stripe_subscription: "sub_a" });
    expect(subjects()).toEqual(["Your switch to one Cora Curation at a time is booked"]);
    expect(sent[0].text).toContain("Monthly is US$200 for every Monday.");
    // The month's difference will never be invoiced (no renewal): deleted.
    expect(await query("select status from pending_adjustments")).toEqual([{ status: "deleted" }]);

    // Monday lists continue inside the paid month.
    await ready(id);
    expect((await deliverWeek(query, id, WEEK, 2)).delivered).toBe(1);

    // The month ends: Stripe ends the subscription and the account orders one list at a time.
    plans.end("sub_a", PERIOD_END);
    const event = { id: "evt_end", type: "customer.subscription.deleted", data: { object: { id: "sub_a", ended_at: Math.floor(PERIOD_END.getTime() / 1000) } } } as unknown as Stripe.Event;
    await handleStripeEvent(query, fakeGateway(), event, { getSettings: async () => settings, plans, query, transport });
    expect(await user(id)).toMatchObject({ status: "active", plan: "per_run", plan_change_to: null, cancel_requested_at: null, stripe_subscription: null });

    // A Monday with no order: nothing charged. One with an order: the order only.
    await ready(id, "2027-01-04");
    await runChargeJob(query, chargeDeps(new Date("2027-01-04T11:05:00Z")), { week: "2027-01-04" });
    expect(charges()).toBe(0);
    expect(await placeOrder(query, { userId: id, week: "2027-01-11", now: new Date("2027-01-08T15:00:00Z"), settings, query, transport })).toEqual({ ok: true });
    await ready(id, "2027-01-11");
    await runChargeJob(query, chargeDeps(new Date("2027-01-11T11:05:00Z")), { week: "2027-01-11" });
    expect(orders.paid).toHaveLength(1);
    expect(billing.created()).toBe(0);
  });

  it("switching back before the month ends keeps the same subscription", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" });
    expect(await switchOffer(query, settings, SATURDAY, id)).toMatchObject({ to: "monthly" });
    expect(await switchPlan(query, deps(SUNDAY), { userId: id, to: "monthly" })).toMatchObject({ ok: true });
    expect(plans.calls).toEqual(["cancel_at_end:sub_a", "keep:sub_a"]);
    expect(await user(id)).toMatchObject({ status: "active", plan: "monthly", plan_change_to: null, cancel_requested_at: null, stripe_subscription: "sub_a" });
    expect(billing.created()).toBe(0);
  });

  it("in the trial, applies at once: nothing is charged automatically after the free lists", async () => {
    const id = await member({ status: "trial", plan: "monthly" });
    await query(`update users set quote = '{"totalCents": 22600, "currency": "USD", "price": "price_monthly_usd", "week": "2026-12-14", "at": "2026-12-08T12:00:00Z"}' where id = $1`, [id]);
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" })).toMatchObject({ ok: true });
    expect(await user(id)).toMatchObject({ status: "trial", plan: "per_run", quote: null });
    expect(plans.calls).toEqual([]);
    await ready(id);
    await runChargeJob(query, chargeDeps(SIX_AM), { week: WEEK });
    expect(charges()).toBe(0);
  });
});

describe("one list at a time to monthly", () => {
  it("starts the subscription with the next ready list, told first and charged once", async () => {
    const id = await member({ status: "trial", plan: "per_run" });
    expect(await switchOffer(query, settings, SATURDAY, id)).toMatchObject({ to: "monthly", effect: expect.stringContaining("Monthly starts with your next Cora Curation") });
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "monthly" })).toMatchObject({ ok: true });
    expect(await user(id)).toMatchObject({ status: "trial", plan: "monthly", quote: { totalCents: 22600 } });
    expect(subjects()).toEqual(["Your plan is now monthly"]);
    expect(sent[0].text).toContain("US$226, tax included");
    await ready(id);
    await runChargeJob(query, chargeDeps(SIX_AM), { week: WEEK });
    await runChargeJob(query, chargeDeps(new Date("2026-12-14T11:15:00Z")), { week: WEEK });
    expect(billing.created()).toBe(1);
    expect(await user(id)).toMatchObject({ status: "active", plan: "monthly", stripe_subscription: "sub_1" });
  });

  it("on a Sunday with an order placed for Monday, charges once (spec check 41)", async () => {
    // Already a paying one-at-a-time member.
    const id = await member({ status: "active", plan: "per_run" });
    expect(await placeOrder(query, { userId: id, week: WEEK, now: SATURDAY, settings, query, transport })).toEqual({ ok: true });
    expect(await switchOffer(query, settings, SUNDAY, id)).toMatchObject({ effect: expect.stringContaining("is replaced by it") });
    expect(await switchPlan(query, deps(SUNDAY), { userId: id, to: "monthly" })).toMatchObject({ ok: true });
    expect(await query("select status from orders")).toEqual([{ status: "cancelled" }]);
    await ready(id);
    await runChargeJob(query, chargeDeps(SIX_AM), { week: WEEK });
    expect(charges()).toBe(1);
    expect(billing.created()).toBe(1);
    expect(orders.paid).toEqual([]);
  });

  it("after Sunday's cutoff, Monday stays on the old plan and the switch happens on Tuesday: still one charge", async () => {
    const id = await member({ status: "active", plan: "per_run" });
    await placeOrder(query, { userId: id, week: WEEK, now: SATURDAY, settings, query, transport });
    expect(await switchPlan(query, deps(MONDAY_3AM), { userId: id, to: "monthly" })).toMatchObject({ ok: true, message: expect.stringContaining("Tuesday, December 15") });
    expect(await user(id)).toMatchObject({ plan: "per_run", plan_change_to: "monthly" });
    await ready(id);
    await runChargeJob(query, chargeDeps(SIX_AM), { week: WEEK });
    expect(orders.paid).toHaveLength(1);
    expect(billing.created()).toBe(0);
    // Before Tuesday nothing moves; on Tuesday the booked switch is made.
    await runHourly(query, chargeDeps(new Date("2026-12-14T20:00:00Z")));
    expect((await user(id)).plan).toBe("per_run");
    await runHourly(query, chargeDeps(TUESDAY));
    expect(await user(id)).toMatchObject({ status: "trial", plan: "monthly", plan_change_to: null });
    expect(charges()).toBe(1);
    // The hourly pass also delivered the paid order's list.
    expect(subjects()).toEqual(["Your Cora Curation is ordered", "Your switch to monthly is booked", "Your Cora Curation, and your receipt", "Your plan is now monthly"]);
  });

  it("a booked switch can be taken back before it happens", async () => {
    const id = await member({ status: "active", plan: "per_run" });
    await switchPlan(query, deps(MONDAY_3AM), { userId: id, to: "monthly" });
    expect(await switchOffer(query, settings, MONDAY_3AM, id)).toMatchObject({ to: "per_run", effect: expect.stringContaining("is booked for") });
    expect(await switchPlan(query, deps(MONDAY_3AM), { userId: id, to: "per_run" })).toMatchObject({ ok: true });
    await runHourly(query, chargeDeps(TUESDAY));
    expect(await user(id)).toMatchObject({ plan: "per_run", plan_change_to: null });
  });
});

describe("refusals", () => {
  it("refuses briefly while a charge claim is open", async () => {
    const id = await member({ status: "trial", plan: "per_run" });
    await query("insert into charge_attempts (user_id, purpose, week_of, attempt) values ($1, 'order', $2, 1)", [id, WEEK]);
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "monthly" })).toMatchObject({ ok: false, message: expect.stringContaining("Try again in a few minutes") });
    expect((await user(id)).plan).toBe("per_run");
  });

  it("asks a held account to update the card first", async () => {
    const id = await member({ status: "held", plan: "monthly" });
    expect(await switchOffer(query, settings, SATURDAY, id)).toMatchObject({ allowed: false });
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" })).toMatchObject({ ok: false, message: expect.stringContaining("Update your card") });
  });
});

describe("the Friday order prompt (spec B.13 email 23)", () => {
  const FRIDAY = new Date("2026-12-11T16:00:00Z"); // 11:00 AM Toronto

  it("goes once to one-at-a-time users without an order, can be switched off, and skips the rest", async () => {
    const plain = await member({ status: "active", plan: "per_run" });
    const off = await member({ status: "active", plan: "per_run" });
    await query(`update users set email_prefs = '{"friday_prompt": false}' where id = $1`, [off]);
    const ordered = await member({ status: "active", plan: "per_run" });
    await placeOrder(query, { userId: ordered, week: WEEK, now: SATURDAY, settings, query, transport });
    const noSharing = await member({ status: "active", plan: "per_run" });
    await query("update users set sharing = 'off' where id = $1", [noSharing]);
    await member({ status: "trial", plan: "per_run", free: 1 });
    await member({ status: "active", plan: "monthly", sub: "sub_m", first: FIRST });
    sent = [];

    expect(await sendOrderPrompts(query, { settings, now: new Date("2026-12-10T16:00:00Z"), query, transport })).toBe(0);
    expect(await sendOrderPrompts(query, { settings, now: FRIDAY, query, transport })).toBe(1);
    expect(await sendOrderPrompts(query, { settings, now: new Date("2026-12-11T17:00:00Z"), query, transport })).toBe(0);
    expect(sent.map((m) => m.subject)).toEqual(["Want a Cora Curation this Monday?"]);
    expect(sent[0].text).toContain("Monthly is US$200 for every Monday.");
    expect(await query("select recipient, status from notifications where kind = 'order_prompt' order by status")).toEqual([
      { recipient: plain, status: "sent" },
      { recipient: off, status: "skipped" },
    ]);
  });
});

describe("after review", () => {
  const customerOf = async (id: string) => (await query<{ stripe_customer: string }>("select stripe_customer from users where id = $1", [id]))[0].stripe_customer;
  const row = async (id: string) =>
    (
      await query<{ plan_change_to: string | null; plan_change_at: string | null; cancel: boolean }>(
        `select plan_change_to, to_char(plan_change_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as plan_change_at, cancel_requested_at is not null as cancel from users where id = $1`,
        [id],
      )
    )[0];

  it("refuses a switch to one at a time while a renewal invoice is open", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await query("update users set renewal_invoice = 'in_r1' where id = $1", [id]);
    expect(await switchOffer(query, settings, SATURDAY, id)).toMatchObject({ allowed: false, why: expect.stringContaining("Pay the open invoice first") });
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" })).toMatchObject({ ok: false, message: expect.stringContaining("Pay the open invoice first") });
    expect(plans.calls).toEqual([]);
  });

  it("a booked switch keeps its booking when Stripe is down, and is made the next hour", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await switchPlan(query, deps(MONDAY_3AM), { userId: id, to: "per_run" });
    expect(await row(id)).toEqual({ plan_change_to: "per_run", plan_change_at: "2026-12-15T05:00Z", cancel: false });
    plans.failNext(1);
    await runHourly(query, chargeDeps(TUESDAY));
    expect(await row(id)).toEqual({ plan_change_to: "per_run", plan_change_at: "2026-12-15T05:00Z", cancel: false });
    await runHourly(query, chargeDeps(new Date("2026-12-15T07:00:00Z")));
    expect(await row(id)).toEqual({ plan_change_to: "per_run", plan_change_at: "2027-01-03T11:05Z", cancel: true });
    expect(subjects().filter((x) => x.includes("didn’t happen"))).toEqual([]);
  });

  it("a booked switch Stripe made but whose answer was lost goes on as made", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await switchPlan(query, deps(MONDAY_3AM), { userId: id, to: "per_run" });
    plans.loseNextAnswer();
    await runHourly(query, chargeDeps(TUESDAY));
    expect(await row(id)).toEqual({ plan_change_to: "per_run", plan_change_at: "2027-01-03T11:05Z", cancel: true });
    expect(plans.calls.filter((c) => c.startsWith("cancel_at_end"))).toHaveLength(1);
  });

  it("a booked switch given up for good is told to the member", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await switchPlan(query, deps(MONDAY_3AM), { userId: id, to: "per_run" });
    await query("update users set renewal_invoice = 'in_r1' where id = $1", [id]);
    await runHourly(query, chargeDeps(TUESDAY));
    expect(await row(id)).toEqual({ plan_change_to: null, plan_change_at: null, cancel: false });
    expect(subjects()).toContain("Your switch to one Cora Curation at a time didn’t happen");
  });

  it("a paying one-at-a-time member whose first monthly charge fails for good goes back to one at a time, never 'trial closed'", async () => {
    const id = await member({ status: "active", plan: "per_run" });
    await switchPlan(query, deps(SATURDAY), { userId: id, to: "monthly" });
    expect((await query<{ switched: boolean }>("select switched_from_per_run_at is not null as switched from users where id = $1", [id]))[0].switched).toBe(true);
    await ready(id);
    billing.declining = true;
    await runChargeJob(query, chargeDeps(SIX_AM), { week: WEEK });
    expect(await user(id)).toMatchObject({ status: "held", plan: "monthly" });
    await runHourly(query, chargeDeps(new Date("2026-12-21T11:10:00Z")));
    expect(await user(id)).toMatchObject({ status: "active", plan: "per_run", quote: null });
    expect(subjects()).toContain("You’re back on one Cora Curation at a time");
    expect(subjects()).not.toContain("Your Roger trial has closed");
    expect((await query<{ s: boolean }>("select switched_from_per_run_at is not null as s from users where id = $1", [id]))[0].s).toBe(false);
  });

  it("the paid-user repair never reattaches a subscription from before a switch away and back", async () => {
    const id = await member({ status: "trial", plan: "per_run" });
    await switchPlan(query, deps(SATURDAY), { userId: id, to: "monthly" });
    await ready(id);
    await runChargeJob(query, chargeDeps(SIX_AM), { week: WEEK });
    expect(await user(id)).toMatchObject({ status: "active", stripe_subscription: "sub_1" });
    plans.add("sub_1", await customerOf(id), PERIOD_END);
    // Monthly to one at a time, the month ends, then back to monthly: waiting for a new first charge.
    await switchPlan(query, deps(new Date("2026-12-19T15:00:00Z")), { userId: id, to: "per_run" });
    plans.end("sub_1", PERIOD_END);
    await handleStripeEvent(query, fakeGateway(), { id: "evt_end", type: "customer.subscription.deleted", data: { object: { id: "sub_1", ended_at: Math.floor(PERIOD_END.getTime() / 1000) } } } as unknown as Stripe.Event, {
      getSettings: async () => settings,
      plans,
      query,
      transport,
    });
    expect(await switchPlan(query, deps(new Date("2027-01-09T15:00:00Z")), { userId: id, to: "monthly" })).toMatchObject({ ok: true });
    expect(await user(id)).toMatchObject({ status: "trial", plan: "monthly", stripe_subscription: null });
    // Even with Stripe still listing the old subscription as live, the repair leaves the account alone.
    expect(await repairPaidUsers(query, chargeDeps(new Date("2027-01-09T16:00:00Z")))).toBe(0);
    expect(await user(id)).toMatchObject({ status: "trial", stripe_subscription: null });
    // And a subscription Stripe has ended is never written back, whatever the dates.
    await query("update users set plan_switched_at = null where id = $1", [id]);
    billing.subs[0].status = "canceled";
    expect(await repairPaidUsers(query, chargeDeps(new Date("2027-01-09T16:00:00Z")))).toBe(0);
  });
});

describe("after the re-review", () => {
  const endEvent = (sub: string) =>
    ({ id: `evt_end_${sub}`, type: "customer.subscription.deleted", data: { object: { id: sub, ended_at: Math.floor(PERIOD_END.getTime() / 1000) } } }) as unknown as Stripe.Event;
  const hook = (e: Stripe.Event) => handleStripeEvent(query, fakeGateway(), e, { getSettings: async () => settings, plans, query, transport });
  const adjustments = () => query<{ status: string; deleted_reason: string | null; carried: boolean }>("select status, deleted_reason, carried_at is not null as carried from pending_adjustments order by created_at");

  it("switching away and back never dodges a month's difference: the first charge back carries it once, as told", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    // Sharing off at a December cutoff: December owes the difference.
    await query("update users set sharing = 'off' where id = $1", [id]);
    await query("insert into cora_weeks (week_of, status, phase) values ('2026-12-14', 'sent', 'ready')");
    await recordWeek(query, "2026-12-14", settings);
    await processContributions(query, deps(new Date("2026-12-14T13:00:00Z")));
    expect(await adjustments()).toEqual([{ status: "pending", deleted_reason: null, carried: false }]);
    // Switch to one at a time before the renewal: the difference is dropped, undoably.
    await switchPlan(query, deps(new Date("2026-12-19T15:00:00Z")), { userId: id, to: "per_run" });
    expect(await adjustments()).toEqual([{ status: "deleted", deleted_reason: "switching", carried: false }]);
    // The month ends: the switch is made, and the drop is final.
    plans.end("sub_a", PERIOD_END);
    await hook(endEvent("sub_a"));
    expect(await adjustments()).toEqual([{ status: "deleted", deleted_reason: "switch", carried: false }]);
    // Straight back to monthly, sharing on again: the first charge carries December's difference, and the email says so.
    await query("update users set sharing = 'share' where id = $1", [id]);
    sent = [];
    expect(await switchPlan(query, deps(new Date("2027-01-09T15:00:00Z")), { userId: id, to: "monthly" })).toMatchObject({ ok: true });
    expect(await adjustments()).toEqual([{ status: "deleted", deleted_reason: "switch", carried: true }]);
    const told = 22600 + Math.round(20000 * 1.13);
    expect(await user(id)).toMatchObject({ status: "trial", plan: "monthly", quote: { totalCents: told } });
    expect(sent[0].text).toContain("higher-rate difference of US$200");
    // The charge: once, with the difference, at the told amount; the month is then billed.
    await ready(id, "2027-01-11");
    await runChargeJob(query, chargeDeps(new Date("2027-01-11T11:05:00Z")), { week: "2027-01-11" });
    await runChargeJob(query, chargeDeps(new Date("2027-01-11T11:20:00Z")), { week: "2027-01-11" });
    expect(billing.extras).toEqual([20000]);
    expect(await user(id)).toMatchObject({ status: "active", plan: "monthly" });
    expect(await adjustments()).toEqual([{ status: "invoiced", deleted_reason: "switch", carried: true }]);
    expect((await query<{ s: boolean }>("select switched_from_per_run_at is not null as s from users where id = $1", [id]))[0].s).toBe(false);
  });

  it("carries only a switch's drop from the last 62 days, never a real cancellation's", async () => {
    const id = await member({ status: "trial", plan: "monthly" });
    const row = (reason: string, invoiceAt: string) =>
      query(`insert into pending_adjustments (user_id, period_start, amount_cents, currency, invoice_at, create_after, status, deleted_reason) values ($1, $2, 20000, 'USD', $3, $3, 'deleted', $4)`, [
        id,
        invoiceAt.slice(0, 10),
        invoiceAt,
        reason,
      ]);
    await row("cancel", "2026-12-03T11:05:00Z");
    await row("switch", "2026-09-03T11:05:00Z");
    expect(await carryToFirstCharge(query, id, new Date("2026-12-12T15:00:00Z"))).toBe(0);
    await row("switch", "2026-11-03T11:05:00Z");
    expect(await carryToFirstCharge(query, id, new Date("2026-12-12T15:00:00Z"))).toBe(20000);
  });

  it("a switch whose Stripe answer and read-back both failed stays marked, so the webhook reads a switch", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    plans.failNext(2);
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" })).toMatchObject({ ok: false });
    expect(await user(id)).toMatchObject({ status: "active", plan_change_to: "per_run", cancel_requested_at: null });
    // Stripe had made it after all: the change event arrives.
    plans.subs.set("sub_a", { ...plans.subs.get("sub_a")!, cancelAt: Math.floor(PERIOD_END.getTime() / 1000) });
    await hook({ id: "evt_u", type: "customer.subscription.updated", data: { object: { id: "sub_a" } } } as unknown as Stripe.Event);
    expect(await user(id)).toMatchObject({ status: "active", plan_change_to: "per_run" });
    expect((await user(id)).cancel_requested_at).not.toBeNull();
    expect(subjects()).not.toContain("Your Roger plan is cancelled");
  });

  it("a cancel replaces a booked switch, which then never happens", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await switchPlan(query, deps(MONDAY_3AM), { userId: id, to: "per_run" });
    const { cancelPlan } = await import("./cancel");
    expect(await cancelPlan(query, deps(new Date("2026-12-14T09:00:00Z")), { userId: id })).toMatchObject({ ok: true });
    expect(await user(id)).toMatchObject({ status: "active", plan_change_to: null });
    await runHourly(query, chargeDeps(TUESDAY));
    expect(await user(id)).toMatchObject({ status: "active", plan: "monthly", plan_change_to: null });
    expect(plans.calls.filter((c) => c.startsWith("cancel_at_end"))).toHaveLength(1);
  });

  it("a switch that ends while held for an unpaid renewal lifts the hold and tells admins about the open invoice", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" });
    await query("update users set status = 'held', hold_reason = 'renewal_unpaid', renewal_invoice = 'in_r1' where id = $1", [id]);
    plans.openInvoice("in_r1", (await query<{ c: string }>("select stripe_customer as c from users where id = $1", [id]))[0].c, "sub_a");
    plans.end("sub_a", PERIOD_END);
    await hook(endEvent("sub_a"));
    expect(await user(id)).toMatchObject({ status: "active", plan: "per_run", stripe_subscription: null });
    expect(sent.map((m) => m.subject)).toContain("[Roger] A switch to one at a time ended with a renewal unpaid");
  });
});

describe("while one at a time is not offered (the switch off, as at launch)", () => {
  beforeEach(() => {
    offer.on = false;
  });
  const REFUSAL = "Ordering one Cora Curation at a time isn’t offered at the moment. Monthly brings a Cora Curation every Monday.";

  it("offers a monthly subscriber no switch, and refuses one posted anyway: no Stripe call, nothing stored, nothing sent", async () => {
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    expect(await switchOffer(query, settings, SATURDAY, id)).toBeNull();
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" })).toEqual({ ok: false, message: REFUSAL });
    expect(plans.calls).toEqual([]);
    expect(await user(id)).toMatchObject({ status: "active", plan: "monthly", plan_change_to: null, cancel_requested_at: null, stripe_subscription: "sub_a" });
    expect(sent).toEqual([]);
  });

  it("refuses a member in the trial too, and inside the Monday window books nothing", async () => {
    const id = await member({ status: "trial", plan: "monthly", free: 1 });
    expect(await switchOffer(query, settings, SATURDAY, id)).toBeNull();
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" })).toEqual({ ok: false, message: REFUSAL });
    expect(await switchPlan(query, deps(MONDAY_3AM), { userId: id, to: "per_run" })).toEqual({ ok: false, message: REFUSAL });
    expect(await user(id)).toMatchObject({ status: "trial", plan: "monthly", plan_change_to: null });
    await runHourly(query, chargeDeps(TUESDAY));
    expect(await user(id)).toMatchObject({ status: "trial", plan: "monthly", plan_change_to: null });
    expect(sent).toEqual([]);
  });

  it("still offers monthly to an account already on one at a time, and makes that switch", async () => {
    const id = await member({ status: "active", plan: "per_run" });
    expect(await switchOffer(query, settings, SATURDAY, id)).toMatchObject({ to: "monthly", allowed: true, effect: expect.stringContaining("Monthly starts with your next Cora Curation") });
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "monthly" })).toMatchObject({ ok: true });
    expect(await user(id)).toMatchObject({ status: "trial", plan: "monthly" });
    expect(subjects()).toEqual(["Your plan is now monthly"]);
    // And there is no way back while the option is off.
    expect(await switchOffer(query, settings, SATURDAY, id)).toBeNull();
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" })).toEqual({ ok: false, message: REFUSAL });
    expect(await user(id)).toMatchObject({ plan: "monthly" });
  });

  it("a monthly member who is switching, from when it was offered, can still stay on monthly", async () => {
    offer.on = true;
    const id = await member({ status: "active", plan: "monthly", sub: "sub_a", first: FIRST });
    await switchPlan(query, deps(SATURDAY), { userId: id, to: "per_run" });
    offer.on = false;
    expect(await switchOffer(query, settings, SATURDAY, id)).toMatchObject({ to: "monthly", allowed: true });
    expect(await switchPlan(query, deps(SATURDAY), { userId: id, to: "monthly" })).toMatchObject({ ok: true });
    expect(await user(id)).toMatchObject({ status: "active", plan: "monthly", plan_change_to: null, cancel_requested_at: null });
  });

  it("sends no Friday order prompt, and takes no new order from an account on the plan", async () => {
    const id = await member({ status: "active", plan: "per_run" });
    expect(await sendOrderPrompts(query, { settings, now: new Date("2026-12-11T16:00:00Z"), query, transport })).toBe(0);
    expect(await placeOrder(query, { userId: id, week: WEEK, now: SATURDAY, settings, query, transport })).toEqual({ ok: false, message: `${REFUSAL} You can switch to monthly on the billing page.` });
    expect(await query("select 1 from orders")).toEqual([]);
    expect(await query("select 1 from notifications where kind = 'order_prompt'")).toEqual([]);
    expect(sent).toEqual([]);
  });
});
