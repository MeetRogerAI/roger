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
import { cancelPlan, undoCancel, type PlanDeps } from "./cancel";
import { claimCharge } from "./claims";
import { recordWeek } from "./contribution";
import type { BillingGateway } from "./subscriptions";
import { handleStripeEvent } from "./webhook";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
let plans: ReturnType<typeof fakePlans>;
let created: number;
const gw: BillingGateway = {
  preview: async () => ({ totalCents: 22600, currency: "USD" }),
  subscriptions: async () => [],
  createSubscription: async () => {
    created++;
    return { kind: "error", error: "unused" };
  },
};
const deps = (now: Date): PlanDeps => ({ plans, gw, settings, now, query, transport, sleep: async () => {} });
const subjects = () => sent.filter((m) => !m.subject.startsWith("[Roger]")).map((m) => m.subject);
const user = async (id: string) =>
  (
    await query<{ status: string; cancel_requested_at: string | null; access_ends_at: string | null; cancel_reason: string | null; cards_removed_at: string | null; stripe_subscription: string | null }>(
      `select status, cancel_requested_at::text, to_char(access_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as access_ends_at, cancel_reason, cards_removed_at::text, stripe_subscription from users where id = $1`,
      [id],
    )
  )[0];

// Saturday 2026-12-12 and the following days; the first charge was Thursday 2026-12-03, 6:05 AM Toronto.
const SATURDAY = new Date("2026-12-12T15:00:00Z");
const FIRST = "2026-12-03T11:05:00Z";
const PERIOD_END = new Date("2027-01-03T11:05:00Z");

async function member(o: { status: string; plan?: string; sub?: string | null; free?: number; first?: string | null; noCard?: boolean }) {
  const [u] = await query<{ id: string }>(
    `insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, free_lists_used, first_charge_at, billing_anchor, trial_started_at)
     values ($1, $2, $3, 'USD', 'share', $4, $5, $6, $7, $7, $8) returning id`,
    [`m${Math.random().toString(36).slice(2, 8)}@example.com`, o.status, o.plan ?? "monthly", `cus_${Math.random().toString(36).slice(2, 8)}`, o.sub ?? null, o.free ?? 2, o.first ?? null, o.noCard ? null : "2026-11-16T15:00:00Z"],
  );
  const [c] = await query<{ stripe_customer: string }>(`select stripe_customer from users where id = $1`, [u.id]);
  plans.cards.set(c.stripe_customer, 1);
  if (o.sub) plans.add(o.sub, c.stripe_customer, PERIOD_END);
  return u.id;
}

let plays: string[];
async function picks(userId: string, week: string) {
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready') on conflict do nothing", [week]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 1)", [userId, week]);
  await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, 1, $3, 70, 3, 'Fits.')", [userId, week, plays[0]]);
}

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  created = 0;
  plans = fakePlans();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  const [p] = await query<{ id: string }>(
    `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
     values ('Inbox triage', 'Sales', 'Does it.', '1. Step.', 'Save it.', '2026-12-07', '2026-12-07', '{}', 70, 7, 7, 7, 7, 7) returning id`,
  );
  plays = [p.id];
});

describe("cancelling in the trial", () => {
  it("ends at once, removes the saved card, cancels an open order, and says 'You have not been charged'", async () => {
    const id = await member({ status: "trial", plan: "per_run" });
    await query("insert into orders (user_id, week_of) values ($1, '2026-12-14')", [id]);
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id, reason: "  Not for me right now. " })).toMatchObject({ ok: true });
    const u = await user(id);
    expect(u).toMatchObject({ status: "cancelled", cancel_reason: "Not for me right now.", access_ends_at: "2026-12-12T15:00Z" });
    expect(u.cards_removed_at).not.toBeNull();
    expect([...plans.cards.values()]).toEqual([0]);
    expect(await query("select status from orders")).toEqual([{ status: "cancelled" }]);
    expect(subjects()).toEqual(["Your Roger account is cancelled"]);
    expect(sent[0].text).toContain("You have not been charged, and we removed your saved card.");
    // The Monday charge finds the cancellation: nothing can be claimed.
    expect(await claimCharge(query, { userId: id, purpose: "first_charge", weekOf: "2026-12-14", attempt: 1, now: SATURDAY })).toBeNull();
    expect(await claimCharge(query, { userId: id, purpose: "order", weekOf: "2026-12-14", attempt: 1, now: SATURDAY })).toBeNull();
    expect(plans.calls.filter((c) => !c.startsWith("remove_cards"))).toEqual([]);
  });

  it("a trial with no card yet (sign-up ends without one) ends at once with 'You have not been charged' and no card to remove", async () => {
    const id = await member({ status: "trial", free: 0, noCard: true });
    const [{ stripe_customer }] = await query<{ stripe_customer: string }>(`select stripe_customer from users where id = $1`, [id]);
    plans.cards.set(stripe_customer, 0);
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id })).toMatchObject({ ok: true, message: expect.stringContaining("nothing more will be charged") });
    expect(await user(id)).toMatchObject({ status: "cancelled", access_ends_at: "2026-12-12T15:00Z", stripe_subscription: null });
    expect(subjects()).toEqual(["Your Roger account is cancelled"]);
    expect(sent[0].text).toContain("You have not been charged.");
    expect(sent[0].text).not.toContain("removed your saved card");
    // Nothing is subscribed or charged: at most the (empty) card removal touches Stripe.
    expect(plans.calls.filter((c) => !c.startsWith("remove_cards"))).toEqual([]);
    expect(created).toBe(0);
  });

  it("is refused while this week's charge is going through, and changes nothing", async () => {
    const id = await member({ status: "trial" });
    await query("insert into charge_attempts (user_id, purpose, week_of, attempt) values ($1, 'first_charge', '2026-12-14', 1)", [id]);
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id })).toMatchObject({ ok: false, message: expect.stringContaining("Try again in a few minutes") });
    expect((await user(id)).status).toBe("trial");
    expect(sent).toEqual([]);
  });

  it("removes the card on a later pass when Stripe failed the first time, and emails once", async () => {
    const id = await member({ status: "trial" });
    plans.failNext(1);
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id })).toMatchObject({ ok: true });
    expect((await user(id)).cards_removed_at).toBeNull();
    await runHourly(query, { ...deps(new Date("2026-12-12T16:00:00Z")), gw });
    expect((await user(id)).cards_removed_at).not.toBeNull();
    await runHourly(query, { ...deps(new Date("2026-12-12T17:00:00Z")), gw });
    expect(subjects()).toEqual(["Your Roger account is cancelled"]);
  });

  it("treats a first charge still held as never charged", async () => {
    const id = await member({ status: "held" });
    await query("update users set hold_reason = 'first_charge_failed' where id = $1", [id]);
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id })).toMatchObject({ ok: true });
    expect(await user(id)).toMatchObject({ status: "cancelled" });
    expect(sent[0].text).toContain("You have not been charged");
  });
});

describe("cancelling a monthly plan (spec check 27)", () => {
  it("keeps access and lists until the paid month ends, then nothing more", async () => {
    const id = await member({ status: "active", sub: "sub_a", first: FIRST });
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id })).toMatchObject({ ok: true, message: expect.stringContaining("Sunday, January 3") });
    expect(plans.calls).toEqual(["cancel_at_end:sub_a"]);
    // Still active (cancelling) until the subscription actually ends.
    expect(await user(id)).toMatchObject({ status: "active", access_ends_at: "2027-01-03T11:05Z", cards_removed_at: null, stripe_subscription: "sub_a" });
    expect((await user(id)).cancel_requested_at).not.toBeNull();
    expect(subjects()).toEqual(["Your Roger plan is cancelled"]);
    expect(sent[0].text).toContain("Your lists continue until Sunday, January 3");

    // A Monday inside the paid month still gets its list; the first Monday after it does not.
    await picks(id, "2026-12-14");
    expect((await deliverWeek(query, id, "2026-12-14", 2)).delivered).toBe(1);
    await picks(id, "2027-01-04");
    expect((await deliverWeek(query, id, "2027-01-04", 2)).delivered).toBe(0);

    // Stripe ends the subscription at the period end: the account stays cancelled, nothing else is sent.
    plans.end("sub_a", PERIOD_END);
    const event = { id: "evt_end", type: "customer.subscription.deleted", data: { object: { id: "sub_a", ended_at: Math.floor(PERIOD_END.getTime() / 1000) } } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(query, fakeGateway(), event, { getSettings: async () => settings, plans, query, transport })).toBe("handled");
    expect(await user(id)).toMatchObject({ status: "cancelled", access_ends_at: "2027-01-03T11:05Z" });
    expect(sent.filter((m) => m.subject.startsWith("[Roger]"))).toEqual([]);
    expect(created).toBe(0);
  });

  it("deletes a month's difference that a cancellation means will never be invoiced", async () => {
    const id = await member({ status: "active", sub: "sub_a", first: FIRST });
    await query(
      `insert into pending_adjustments (user_id, period_start, amount_cents, currency, week_of, invoice_at, create_after, reason) values ($1, '2026-12-03', 20000, 'USD', '2026-12-14', $2, $3, 'two_misses')`,
      [id, PERIOD_END.toISOString(), SATURDAY.toISOString()],
    );
    await cancelPlan(query, deps(SATURDAY), { userId: id });
    expect(await query("select status, deleted_reason from pending_adjustments")).toEqual([{ status: "deleted", deleted_reason: "cancel" }]);
  });

  it("can be undone before the month ends: the same subscription continues, no second charge, the difference comes back", async () => {
    const id = await member({ status: "active", sub: "sub_a", first: FIRST });
    // Two missed weeks this month, both settled: the month owes the difference.
    for (const w of ["2026-12-07", "2026-12-14"]) {
      await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready') on conflict do nothing", [w]);
      await query("insert into contribution_weeks (user_id, week_of, result, period_start) values ($1, $2, 'missed', '2026-12-03')", [id, w]);
    }
    await query(
      `insert into pending_adjustments (user_id, period_start, amount_cents, currency, week_of, invoice_at, create_after, reason) values ($1, '2026-12-03', 20000, 'USD', '2026-12-14', $2, $3, 'two_misses')`,
      [id, PERIOD_END.toISOString(), SATURDAY.toISOString()],
    );
    await cancelPlan(query, deps(new Date("2026-12-15T15:00:00Z")), { userId: id });
    expect(await undoCancel(query, deps(new Date("2026-12-16T15:00:00Z")), { userId: id })).toMatchObject({ ok: true });
    expect(plans.calls).toEqual(["cancel_at_end:sub_a", "keep:sub_a"]);
    expect(plans.subs.get("sub_a")).toMatchObject({ status: "active", cancelAt: null });
    expect(await user(id)).toMatchObject({ status: "active", cancel_requested_at: null, access_ends_at: null, stripe_subscription: "sub_a" });
    expect(created).toBe(0);
    expect(await query("select status from pending_adjustments order by created_at")).toEqual([{ status: "deleted" }, { status: "pending" }]);
    // The difference raised again has its own notice (Unit 14: one notice per row).
    expect(subjects()).toEqual(["Your Roger plan is cancelled", "Your second missed week this month", "Your Roger plan continues"]);
  });

  it("can't be undone once the paid month has ended", async () => {
    const id = await member({ status: "active", sub: "sub_a", first: FIRST });
    await cancelPlan(query, deps(SATURDAY), { userId: id });
    expect(await undoCancel(query, deps(new Date("2027-01-04T15:00:00Z")), { userId: id })).toMatchObject({ ok: false });
    expect(plans.calls).toEqual(["cancel_at_end:sub_a"]);
  });

  it("changes nothing when Stripe can't be reached", async () => {
    const id = await member({ status: "active", sub: "sub_a", first: FIRST });
    plans.failNext(1);
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id })).toMatchObject({ ok: false });
    expect((await user(id)).status).toBe("active");
    expect(sent).toEqual([]);
  });

  it("ends a subscription held for an unpaid renewal now, and tells admins about the open invoice", async () => {
    const id = await member({ status: "held", sub: "sub_a", first: FIRST });
    await query("update users set hold_reason = 'renewal_unpaid', renewal_invoice = 'in_9' where id = $1", [id]);
    const [{ stripe_customer }] = await query<{ stripe_customer: string }>("select stripe_customer from users where id = $1", [id]);
    plans.openInvoice("in_9", stripe_customer, "sub_a");
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id })).toMatchObject({ ok: true });
    expect(plans.calls[0]).toBe("cancel_now:sub_a");
    // Admins are told to collect: the saved card stays.
    expect(plans.calls.filter((c) => c.startsWith("remove_cards"))).toEqual([]);
    expect((await user(id)).cards_removed_at).toBeNull();
    expect(await user(id)).toMatchObject({ status: "cancelled", access_ends_at: "2026-12-12T15:00Z" });
    expect(sent.map((m) => m.subject)).toContain("[Roger] A member cancelled with a renewal unpaid");
    expect(sent.find((m) => m.subject === "Your Roger account is cancelled")?.text).toContain("Nothing more will be charged.");
  });
});

describe("cancelling, after review", () => {
  it("keeps recording the month while cancelling, and an undo settles it again: cancel, stop sharing, undo still owes the month", async () => {
    const id = await member({ status: "active", sub: "sub_a", first: FIRST });
    await cancelPlan(query, deps(SATURDAY), { userId: id });
    // Sharing off at Sunday's cutoff while cancelling: the week is still recorded (the member is active until the end).
    await query("update users set sharing = 'off' where id = $1", [id]);
    await query("insert into cora_weeks (week_of, status, phase) values ('2026-12-14', 'sent', 'ready')");
    expect(await recordWeek(query, "2026-12-14", settings)).toBe(1);
    expect(await query("select result from contribution_weeks where user_id = $1", [id])).toEqual([{ result: "by_choice" }]);
    expect(await query("select 1 from pending_adjustments")).toHaveLength(0);
    // The undo settles the current month from its cutoffs: the difference is owed.
    expect(await undoCancel(query, deps(new Date("2026-12-15T15:00:00Z")), { userId: id })).toMatchObject({ ok: true });
    expect(await query("select status, reason from pending_adjustments")).toEqual([{ status: "pending", reason: "not_sharing" }]);
  });

  it("still delivers a one-at-a-time list already charged for the week, and keeps the card of a member who paid", async () => {
    const id = await member({ status: "active", plan: "per_run" });
    await picks(id, "2026-12-14");
    await query("insert into orders (user_id, week_of, status) values ($1, '2026-12-14', 'charged')", [id]);
    await query("insert into charge_attempts (user_id, purpose, week_of, attempt, outcome) values ($1, 'order', '2026-12-14', 1, 'succeeded')", [id]);
    // Monday 6:30 AM: charged, not yet sent.
    const now = new Date("2026-12-14T11:30:00Z");
    expect(await cancelPlan(query, deps(now), { userId: id })).toMatchObject({ ok: true });
    expect((await user(id)).status).toBe("cancelled");
    expect((await deliverWeek(query, id, "2026-12-14", 2)).delivered).toBe(1);
    expect(plans.calls).toEqual([]);
    expect(sent[0].text).toContain("Nothing more will be charged.");
    expect(sent[0].text).not.toContain("removed your saved card");
  });

  it("ends with the month when Stripe says a remembered renewal failure was paid after all", async () => {
    const id = await member({ status: "active", sub: "sub_a", first: FIRST });
    await query("update users set renewal_invoice = 'in_old', renewal_failed_at = now() where id = $1", [id]);
    expect(await cancelPlan(query, deps(SATURDAY), { userId: id })).toMatchObject({ ok: true });
    expect(plans.calls).toEqual(["cancel_at_end:sub_a"]);
    expect(await query("select status, renewal_invoice from users where id = $1", [id])).toEqual([{ status: "active", renewal_invoice: null }]);
  });

  it("a claim can't be made once the cancel has landed", async () => {
    const id = await member({ status: "active", plan: "per_run" });
    await query("insert into orders (user_id, week_of) values ($1, '2026-12-14')", [id]);
    await cancelPlan(query, deps(SATURDAY), { userId: id });
    expect(await claimCharge(query, { userId: id, purpose: "order", weekOf: "2026-12-14", attempt: 1, now: SATURDAY })).toBeNull();
    expect(await query("select 1 from charge_attempts")).toHaveLength(0);
  });
});

describe("delivery, after the re-review", () => {
  it("a paid order's list is delivered whatever the account's state, without using a free list", async () => {
    // A paying one-at-a-time member switched to monthly after Monday's cutoff: "trial" by Tuesday, the order paid Monday.
    const id = await member({ status: "trial", plan: "monthly" });
    await query("update users set switched_from_per_run_at = now() where id = $1", [id]);
    await picks(id, "2026-12-14");
    await query("insert into orders (user_id, week_of, status) values ($1, '2026-12-14', 'charged')", [id]);
    expect((await deliverWeek(query, id, "2026-12-14", 2)).delivered).toBe(1);
    expect(await query("select free_lists_used, (select bool_or(is_free_list) from picks) as free from users where id = $1", [id])).toEqual([{ free_lists_used: 2, free: false }]);
  });

  it("a list for a week inside the paid month still arrives when delivered after access ended", async () => {
    const id = await member({ status: "active", sub: "sub_a", first: FIRST });
    await cancelPlan(query, deps(SATURDAY), { userId: id });
    await picks(id, "2026-12-14");
    // The subscription ended (access over); the list held from December 14 goes out late.
    plans.end("sub_a", PERIOD_END);
    await query("update users set status = 'cancelled' where id = $1", [id]);
    expect((await deliverWeek(query, id, "2026-12-14", 2)).delivered).toBe(1);
  });
});
