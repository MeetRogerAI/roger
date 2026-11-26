import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { handleStripeEvent } from "./webhook";
import { statusKey } from "@/lib/admin/ops";
import { loadInterest } from "@/lib/admin/interest";
import { giveExtraFreeList } from "@/lib/admin/users";
import { loadBilling } from "@/lib/app/billing";
import { statusLine, type StatusFacts } from "@/lib/app/status";
import { moneyAsOfAllowed } from "@/lib/clock";
import { loadUsers } from "@/lib/cora/context";
import { deliverWeek } from "@/lib/cora/deliver";
import { deliverLate } from "@/lib/cora/send-job";
import { whoGetsAList } from "@/lib/cora/who-gets-a-list";
import type { Query } from "@/lib/db-query";
import { runHourly } from "@/lib/housekeeping/job";
import { closeTrialsWithNoList } from "@/lib/housekeeping/trial";
import type { Transport } from "@/lib/mail/send";
import { cancelledEmail } from "@/lib/mail/templates/cancelled";
import { subscribedEmail, trialClosedEmail } from "@/lib/mail/templates/charges";
import { trialNoListClosedEmail } from "@/lib/mail/templates/zack-not-yet";
import { mergeV3 } from "@/lib/v3-settings";
import { sharingEffect } from "@/lib/zack/sharing-effect";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import { cancelPlan } from "./cancel";
import { runChargeJob } from "./charge-job";
import { recordWeek } from "./contribution";
import { sendFirstChargeReminders } from "./quote";
import { afterCardChange, renewalPaid, subscriptionEnded } from "./renewals";
import type { BillingGateway, ChargeResult } from "./subscriptions";
import { switchOffer, switchPlan } from "./switch";

/**
 * The whole-system review of the v3 app (the seams between Units 12 to 18):
 * one test or more per finding, each named for it.
 */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const subjects = () => sent.filter((m) => !m.subject.startsWith("[Roger]")).map((m) => m.subject);

// Monday 2026-12-14; Toronto is UTC-5 in December.
const WEEK = "2026-12-14";
const SIX_AM = new Date("2026-12-14T11:05:00Z");
const MONDAY_3AM = new Date("2026-12-14T08:00:00Z");
const TUESDAY = new Date("2026-12-15T06:00:00Z");

let plans: ReturnType<typeof fakePlans>;
/** Stripe's first-charge side: a preview total that can move, and scripted outcomes for creates. */
let total: number;
let script: ChargeResult[];
let creates: number;
const billing: BillingGateway = {
  preview: async () => ({ totalCents: total, currency: "USD" }),
  subscriptions: async () => [],
  async createSubscription({ claimId }) {
    creates++;
    return script.shift() ?? { kind: "succeeded", object: `sub_${claimId.slice(0, 6)}`, amountCents: total, currency: "USD" };
  },
};
const deps = (now: Date) => ({ plans, gw: billing, settings, now, query, transport, sleep: async () => {} });

let play: string;

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  plans = fakePlans();
  total = 23000;
  script = [];
  creates = 0;
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  const [p] = await query<{ id: string }>(
    `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
     values ('Inbox triage', 'Sales', 'Does it.', '1. Step.', 'Save it.', '2026-12-07', '2026-12-07', '{}', 70, 7, 7, 7, 7, 7) returning id`,
  );
  play = p.id;
});

async function member(o: { status: string; plan?: string; sub?: string | null; free?: number; first?: string | null; hold?: string | null; quote?: object | null; sponsor?: boolean }) {
  const customer = `cus_${Math.random().toString(36).slice(2, 8)}`;
  const [u] = await query<{ id: string }>(
    `insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, free_lists_used, first_charge_at, billing_anchor, hold_reason, quote, sponsor_id)
     values ($1, $2, $3, 'USD', 'share', $4, $5, $6, $7, $7, $8, $9, $10) returning id`,
    [
      `${customer}@example.com`,
      o.status,
      o.plan ?? "monthly",
      customer,
      o.sub ?? null,
      o.free ?? 2,
      o.first ?? null,
      o.hold ?? null,
      o.quote ? JSON.stringify(o.quote) : null,
      o.sponsor ? "00000000-0000-4000-8000-000000000001" : null,
    ],
  );
  plans.cards.set(customer, 1);
  return { id: u.id, customer };
}

/** Cora picked a list for the member this week (the week sent, as after Monday's send). */
async function picks(userId: string, week: string, status = "sent") {
  await query("insert into cora_weeks (week_of, status, phase) values ($1, $2, 'ready') on conflict do nothing", [week, status]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 1) on conflict do nothing", [userId, week]);
  await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, 1, $3, 70, 3, 'Fits.')", [userId, week, play]);
}
/** A first charge declined on Monday, day 1 and day 3; the day-7 retry (attempt 4) is due Monday 2026-12-21 at 6:00 AM. */
async function declinedAttempts(userId: string) {
  // claimed_at is the database's clock (a new claim gets now()), so these are dated before it, in order.
  const rows: [number, number, string | null][] = [
    [1, 3, null],
    [2, 2, null],
    [3, 1, "2026-12-21T11:00:00Z"],
  ];
  for (const [attempt, hoursAgo, next] of rows) {
    await query(
      `insert into charge_attempts (user_id, purpose, week_of, attempt, outcome, settled_at, next_attempt_at, claimed_at)
       values ($1, 'first_charge', $2, $3, 'declined', now(), $4::timestamptz, now() - $5::int * interval '1 hour')`,
      [userId, WEEK, attempt, next, hoursAgo],
    );
  }
}
const delivered = async (userId: string, week: string) =>
  (await query("select 1 from picks where user_id = $1 and week_of = $2 and delivered_at is not null", [userId, week])).length;
const row = async (id: string) =>
  (
    await query<{ status: string; hold_reason: string | null; closed_reason: string | null; plan: string; access_ends_at: string | null; quote: { totalCents: number; at: string } | null }>(
      `select status, hold_reason, closed_reason, plan, to_char(access_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as access_ends_at, quote from users where id = $1`,
      [id],
    )
  )[0];

describe("1 (P1): a cancelled account's week is covered only by a paid period that outlived it", () => {
  for (const hold of ["first_charge_failed", "amount_changed"]) {
    it(`a third-list member held (${hold}) who cancels never gets the held list`, async () => {
      const m = await member({ status: "held", hold, quote: { totalCents: 23000, currency: "USD", price: "price_monthly_usd", week: WEEK, at: SIX_AM.toISOString() } });
      await picks(m.id, WEEK);
      // Wednesday: well after Monday's charge time.
      const wednesday = new Date("2026-12-16T15:00:00Z");
      expect(await cancelPlan(query, deps(wednesday), { userId: m.id })).toMatchObject({ ok: true });
      expect(await row(m.id)).toMatchObject({ status: "cancelled", access_ends_at: "2026-12-16T15:00:00Z" });
      expect(await deliverLate(query, { settings, now: wednesday, query, transport })).toBe(0);
      expect(await delivered(m.id, WEEK)).toBe(0);
    });
  }

  it("an unpaid renewal's end leaves access at the start of the unpaid month: its weeks are never delivered, a paid week still is", async () => {
    // First charge Thursday 2026-12-03; the renewal on 2027-01-03 fails.
    const FIRST = "2026-12-03T11:05:00Z";
    const m = await member({ status: "held", hold: "renewal_unpaid", sub: "sub_a", first: FIRST });
    await query("update users set renewal_failed_at = '2027-01-03T12:00:00Z', renewal_invoice = 'in_r1' where id = $1", [m.id]);
    plans.add("sub_a", m.customer, new Date("2027-02-03T11:05:00Z"));
    plans.openInvoice("in_r1", m.customer, "sub_a");
    await picks(m.id, "2026-12-28");
    await picks(m.id, "2027-01-04");
    const now = new Date("2027-01-11T15:00:00Z");
    expect(await cancelPlan(query, deps(now), { userId: m.id })).toMatchObject({ ok: true });
    expect(await row(m.id)).toMatchObject({ status: "cancelled", access_ends_at: "2027-01-03T11:05:00Z" });
    // The week of January 4 is in the unpaid month: never delivered.
    expect(await deliverLate(query, { settings, now, query, transport })).toBe(0);
    expect(await delivered(m.id, "2027-01-04")).toBe(0);
    // The week of December 28 was paid for: it still arrives, even late.
    expect((await deliverWeek(query, m.id, "2026-12-28", 2)).delivered).toBe(1);
  });

  it("a subscription Stripe ends with a renewal unpaid sets access the same way", async () => {
    const m = await member({ status: "held", hold: "renewal_unpaid", sub: "sub_b", first: "2026-12-03T11:05:00Z" });
    await query("update users set renewal_failed_at = '2027-01-03T12:00:00Z' where id = $1", [m.id]);
    await picks(m.id, "2027-01-04");
    expect(await subscriptionEnded(query, deps(new Date("2027-01-20T12:00:00Z")), { subscription: "sub_b", endedAt: new Date("2027-01-20T12:00:00Z") })).toBe("cancelled");
    expect(await row(m.id)).toMatchObject({ status: "cancelled", access_ends_at: "2027-01-03T11:05:00Z" });
    expect((await deliverWeek(query, m.id, "2027-01-04", 2)).delivered).toBe(0);
  });
});

describe("2 (P2): access is compared by Toronto date", () => {
  it("a paid month ending Monday at 6:00:20 AM gives no list that Monday, and Cora does not pick for it", async () => {
    const m = await member({ status: "active", sub: "sub_a", first: "2026-11-14T11:00:20Z" });
    await query("update users set cancel_requested_at = '2026-12-01T12:00:00Z', access_ends_at = '2026-12-14T11:00:20Z' where id = $1", [m.id]);
    await picks(m.id, "2026-12-07");
    await picks(m.id, WEEK);
    expect((await deliverWeek(query, m.id, "2026-12-07", 2)).delivered).toBe(1);
    expect((await deliverWeek(query, m.id, WEEK, 2)).delivered).toBe(0);
    // Cora at Monday 1:00 AM (the job's clock) reads the same rule.
    const [u] = await loadUsers(query, WEEK, { onlyIds: [m.id], now: new Date("2026-12-14T06:00:00Z") });
    expect(u.facts.accessEnded).toBe(true);
    expect(whoGetsAList(u.facts, "pick").gets).toBe(false);
    const [before] = await loadUsers(query, "2026-12-07", { onlyIds: [m.id], now: new Date("2026-12-07T06:00:00Z") });
    expect(whoGetsAList(before.facts, "pick").gets).toBe(true);
  });
});

describe("3 (P2): a switch booked in the lock with the renewal before the lock lifts", () => {
  it("is told, and made, from the month the renewal starts, so Monday's list comes and Stripe does what the email said", async () => {
    // The paid month renews Monday 2026-12-14 at 6:05 AM; the member books the switch at 3:00 AM.
    const m = await member({ status: "active", sub: "sub_a", first: "2026-11-14T11:05:00Z" });
    plans.add("sub_a", m.customer, new Date("2026-12-14T11:05:00Z"));
    const offer = await switchOffer(query, settings, MONDAY_3AM, m.id);
    expect(offer?.effect).toContain("renews on Monday, December 14 as usual");
    expect(offer?.effect).toContain("until Thursday, January 14");
    expect(await switchPlan(query, deps(MONDAY_3AM), { userId: m.id, to: "per_run" })).toMatchObject({ ok: true });
    expect(sent.at(-1)?.text).toContain("until Thursday, January 14");
    expect(plans.calls.filter((c) => c.startsWith("cancel_at_end"))).toEqual([]);
    // Stripe renews at 6:05; Monday's list is on the plan as it stood.
    plans.add("sub_a", m.customer, new Date("2027-01-14T11:05:00Z"));
    await picks(m.id, WEEK);
    expect((await deliverWeek(query, m.id, WEEK, 2)).delivered).toBe(1);
    // Tuesday: the booked switch is made, and Stripe ends the month the email named.
    await runHourly(query, deps(TUESDAY));
    expect(await row(m.id)).toMatchObject({ status: "active", access_ends_at: "2027-01-14T11:05:00Z" });
    expect(plans.subs.get("sub_a")?.cancelAt).toBe(Math.floor(Date.parse("2027-01-14T11:05:00Z") / 1000));
  });
});

describe("4 (P2): a first charge held because its amount changed", () => {
  const quote = { totalCents: 24000, currency: "USD" as const, price: "price_monthly_usd", extraCents: 0, week: WEEK, at: SIX_AM.toISOString() };

  it("the status line and the billing page state the new amount and when it is charged; switching says why not", async () => {
    const m = await member({ status: "held", hold: "amount_changed", quote });
    const facts: StatusFacts = { status: "held", holdReason: "amount_changed", plan: "monthly", sponsored: false, sharing: "share", currency: "USD", freeListsUsed: 2, freeRuns: 2, quote, firstChargeAt: null, orderCents: null, hasCard: true, now: SIX_AM };
    const line = statusLine(facts, settings);
    expect(line).toContain("US$240");
    expect(line).toContain("Tuesday, December 15");
    const view = await loadBilling(query, m.id, { settings, now: SIX_AM });
    expect(view?.nextCharge).toContain("US$240");
    expect(view?.nextCharge).toContain("Tuesday, December 15");
    expect(view?.offer).toMatchObject({ allowed: false, why: expect.stringContaining("amount changed") });
    expect(await switchPlan(query, deps(SIX_AM), { userId: m.id, to: "per_run" })).toMatchObject({ ok: false, message: expect.stringContaining("amount changed") });
  });

  it("a new card re-previews and tells the new amount again, without charging before the 24 hours", async () => {
    const m = await member({ status: "held", hold: "amount_changed", quote });
    total = 25000;
    const later = new Date("2026-12-14T18:00:00Z");
    expect(await afterCardChange(query, deps(later), m.id, "cs_1")).toBe("amount_changed:held_amount");
    expect(await row(m.id)).toMatchObject({ status: "held", hold_reason: "amount_changed", quote: { totalCents: 25000, at: later.toISOString() } });
    expect(subjects()).toEqual(["Your first charge amount changed"]);
    expect(creates).toBe(0);
  });

  /** A failed first charge with attempts 1 to 3 declined (the day-7 retry still to come). */
  async function failing(o: { switched?: boolean } = {}) {
    const m = await member({ status: "held", hold: "first_charge_failed", quote: { ...quote, totalCents: 23000 } });
    if (o.switched) await query("update users set switched_from_per_run_at = '2026-12-10T12:00:00Z' where id = $1", [m.id]);
    await declinedAttempts(m.id);
    return m;
  }

  it("moved to 'amount changed' by the day-7 retry, still reaches the close: charged 24 hours later or closed, with one email", async () => {
    const m = await failing();
    total = 24000;
    await runHourly(query, deps(new Date("2026-12-21T11:10:00Z")));
    expect(await row(m.id)).toMatchObject({ status: "held", hold_reason: "amount_changed" });
    expect(subjects()).toEqual(["Your first charge amount changed"]);
    sent = [];
    script.push({ kind: "declined", code: "insufficient_funds", hard: false });
    await runHourly(query, deps(new Date("2026-12-22T11:15:00Z")));
    expect(creates).toBe(1);
    expect(await row(m.id)).toMatchObject({ status: "closed" });
    expect(subjects()).toEqual(["Your Roger trial has closed"]);
  });

  it("a switched member moved to 'amount changed' goes back to one at a time instead", async () => {
    const m = await failing({ switched: true });
    total = 24000;
    await runHourly(query, deps(new Date("2026-12-21T11:10:00Z")));
    sent = [];
    script.push({ kind: "declined", code: "stolen_card", hard: true });
    await runHourly(query, deps(new Date("2026-12-22T11:15:00Z")));
    expect(await row(m.id)).toMatchObject({ status: "active", plan: "per_run" });
    expect(subjects()).toEqual(["You’re back on one list at a time"]);
  });

  it("after a refusal a new card fixed, a changed amount is still charged 24 hours later (not left waiting for an admin)", async () => {
    const m = await member({ status: "held", hold: "amount_changed", quote: { ...quote, at: "2026-12-15T12:00:00Z" } });
    await query(`insert into charge_attempts (user_id, purpose, week_of, attempt, outcome, settled_at) values ($1, 'first_charge', $2, 1, 'error', now())`, [m.id, WEEK]);
    total = 24000;
    await runHourly(query, deps(new Date("2026-12-16T12:30:00Z")));
    expect(creates).toBe(1);
    expect(await row(m.id)).toMatchObject({ status: "active" });
  });
});

describe("5 (P2): the day-7 decline with the close due", () => {
  it("sends only the closing email in the one hourly pass", async () => {
    const m = await member({ status: "held", hold: "first_charge_failed", quote: { totalCents: 23000, currency: "USD", price: "price_monthly_usd", extraCents: 0, week: WEEK, at: SIX_AM.toISOString() } });
    await declinedAttempts(m.id);
    script.push({ kind: "declined", code: "insufficient_funds", hard: false });
    await runHourly(query, deps(new Date("2026-12-21T11:10:00Z")));
    expect(creates).toBe(1);
    expect(await row(m.id)).toMatchObject({ status: "closed" });
    expect(subjects()).toEqual(["Your Roger trial has closed"]);
  });
});

describe("6 (P2, decision): Cora picks for a member held for an unpaid renewal", () => {
  it("held, picked, paid: the waiting list is delivered", async () => {
    const m = await member({ status: "held", hold: "renewal_unpaid", sub: "sub_a", first: "2026-12-03T11:05:00Z" });
    await query("update users set renewal_failed_at = '2027-01-03T12:00:00Z', renewal_invoice = 'in_r1' where id = $1", [m.id]);
    plans.add("sub_a", m.customer, new Date("2027-02-03T11:05:00Z"));
    plans.openInvoice("in_r1", m.customer, "sub_a");
    // Cora, Monday January 11 at 1:00 AM: the member is considered and picked for.
    const [u] = await loadUsers(query, "2027-01-11", { onlyIds: [m.id], now: new Date("2027-01-11T06:00:00Z") });
    expect(u?.facts).toMatchObject({ status: "held", holdReason: "renewal_unpaid" });
    expect(whoGetsAList(u.facts, "pick").gets).toBe(true);
    expect(whoGetsAList(u.facts, "send").gets).toBe(false);
    await picks(m.id, "2027-01-11");
    const monday = new Date("2027-01-11T13:00:00Z");
    expect(await deliverLate(query, { settings, now: monday, query, transport })).toBe(0);
    // Paid on Wednesday: released, and the week's list goes out.
    plans.bills[0].status = "paid";
    expect(await renewalPaid(query, deps(new Date("2027-01-13T15:00:00Z")), { subscription: "sub_a" })).toBe("released");
    expect(await delivered(m.id, "2027-01-11")).toBe(1);
  });
});

describe("7 (P2, decision): no restart path yet", () => {
  it("the closing emails invite the member to write to support instead of 'Start again'", () => {
    for (const e of [trialClosedEmail(), cancelledEmail({ when: "now", charged: false }), trialNoListClosedEmail()]) {
      expect(e.text).toContain("Want to come back? Write to us: mailto:");
      expect(e.text).not.toContain("Start again");
      expect(e.html).not.toContain("/start");
    }
  });
});

describe("8 (P3): a renewal that failed, not yet held", () => {
  it("the status line says when lists pause", () => {
    const f: StatusFacts = { status: "active", plan: "monthly", sponsored: false, sharing: "share", currency: "USD", freeListsUsed: 2, freeRuns: 2, quote: null, firstChargeAt: "2026-12-03T11:05:00Z", orderCents: null, renewalFailedAt: "2027-01-03T12:00:00Z", hasCard: true, now: new Date("2027-01-05T12:00:00Z") };
    expect(statusLine(f, settings)).toBe("Your payment didn’t go through; lists pause on Sunday, January 10 unless it’s paid.");
  });
});

describe("9 (P3): a trial past its free lists whose first paid list never comes", () => {
  it("is told the date moved when no run arrived, and closes 21 days after its last list with one email", async () => {
    const m = await member({ status: "trial", quote: { totalCents: 23000, currency: "USD", price: "price_monthly_usd", week: WEEK, at: "2026-12-12T11:00:00Z" } });
    await query("update users set trial_started_at = '2026-11-20T12:00:00Z' where id = $1", [m.id]);
    // The second free list went out on December 7.
    await query("insert into cora_weeks (week_of, status, phase) values ('2026-12-07', 'sent', 'ready')");
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, delivered_at) values ($1, '2026-12-07', 1, $2, 70, 3, 'Fits.', '2026-12-07T12:00:00Z')", [m.id, play]);
    // December 14: no run, so Cora passed the member over.
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
    await query("insert into cora_user_weeks (user_id, week_of, outcome, note) values ($1, $2, 'not_eligible', 'trial, no run this week')", [m.id, WEEK]);
    await runChargeJob(query, deps(SIX_AM), { week: WEEK });
    expect(subjects()).toEqual(["Your first charge moved"]);
    expect(sent[0].text).toContain("didn’t arrive by Sunday night");
    expect(creates).toBe(0);
    sent = [];
    // Day 20 after the last list: still open. Day 21: closed, no charge, one email.
    expect(await closeTrialsWithNoList(query, { settings, now: new Date("2026-12-27T12:00:00Z"), query, transport })).toBe(0);
    expect(await closeTrialsWithNoList(query, { settings, now: new Date("2026-12-28T13:00:00Z"), query, transport })).toBe(1);
    expect(await row(m.id)).toMatchObject({ status: "closed", closed_reason: "no_first_charge" });
    expect(subjects()).toEqual(["Your Roger trial has closed"]);
    expect(sent[0].text).toContain("Nothing was charged");
  });
});

describe("10 (P3): members who switched from one at a time, and switches to it", () => {
  it("ops shows a switch as switching, and a switched member as monthly", () => {
    expect(statusKey({ status: "active", plan: "monthly", sponsored: false, cancelRequested: true, switching: true })).toBe("switching");
    expect(statusKey({ status: "active", plan: "monthly", sponsored: false, cancelRequested: true, switching: false })).toBe("cancelled");
    expect(statusKey({ status: "trial", plan: "monthly", sponsored: false, cancelRequested: false, switched: true })).toBe("monthly");
  });

  it("refuses an extra free list, counts them as monthly, leaves switches out of cancel reasons, and words their emails and price notes", async () => {
    const m = await member({ status: "trial" });
    await query("update users set switched_from_per_run_at = now() where id = $1", [m.id]);
    const s = await member({ status: "active", sub: "sub_s", first: "2026-12-03T11:05:00Z" });
    await query("update users set cancel_requested_at = now(), access_ends_at = '2027-01-03T11:05:00Z', plan_change_to = 'per_run' where id = $1", [s.id]);
    expect(await giveExtraFreeList(query, "admin@example.com", m.id)).toMatchObject({ ok: false, message: expect.stringContaining("not on the trial") });
    const i = await loadInterest(query);
    expect(i.plans).toMatchObject({ monthly: 2, trial: 0 });
    expect(i.cancelReasons).toEqual([]);
    expect(subscribedEmail({ amountCents: 22600, currency: "USD", switched: true }).text).toContain("This week’s list is ready now");
    const effect = sharingEffect({ settings, plan: "monthly", currency: "USD", from: "share", to: "off", trialStartedAt: "2026-01-05T12:00:00Z", status: "trial", switchedFromPerRun: true });
    expect(effect).toContain("before your first monthly charge,");
    expect(effect).not.toContain("no earlier than");
  });
});

describe("11 (P3): 'as of' runs", () => {
  it("a job that can charge runs 'as of' only with a Stripe test key on a database marked non-production", () => {
    const c = { deployment: "preview", databaseMarkedNonProduction: true };
    expect(moneyAsOfAllowed({ ...c, stripeKey: "sk_test_x" })).toBe(true);
    expect(moneyAsOfAllowed({ ...c, stripeKey: undefined })).toBe(false);
    expect(moneyAsOfAllowed({ ...c, stripeKey: "sk_live_x" })).toBe(false);
    expect(moneyAsOfAllowed({ ...c, stripeKey: "sk_test_x", databaseMarkedNonProduction: false })).toBe(false);
  });
});

describe("C (scenario tests): the Monday crons and the webhook's clock", () => {
  it("the cora, charge and send crons run on Monday from 1:00 AM Toronto (05:00 UTC in EDT, 06:00 in EST) to 11:00 AM EST (16:00 UTC)", () => {
    const file = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    for (const path of ["/api/cron/cora", "/api/cron/charge", "/api/cron/send"]) {
      const [, hours, , , dow] = file.crons.find((c) => c.path === path)!.schedule.split(" ");
      const [from, to] = hours.split("-").map(Number);
      expect({ path, dow, covers: from <= 5 && to >= 16 }).toEqual({ path, dow: "1", covers: true });
    }
  });

  it("a first charge settled from a replayed invoice.paid is recorded at the job's clock", async () => {
    const m = await member({ status: "trial" });
    const [c] = await query<{ id: string }>("insert into charge_attempts (user_id, purpose, week_of, attempt, outcome) values ($1, 'first_charge', $2, 1, 'unknown') returning id", [m.id, WEEK]);
    const event = {
      id: "evt_paid",
      type: "invoice.paid",
      data: { object: { id: "in_1", billing_reason: "subscription_create", amount_paid: 23000, currency: "usd", lines: { data: [] }, parent: { subscription_details: { subscription: "sub_new", metadata: { claim_id: c.id } } } } },
    } as unknown as Stripe.Event;
    expect(await handleStripeEvent(query, fakeGateway(), event, { getSettings: async () => settings, query, transport, now: SIX_AM })).toBe("handled");
    const [u] = await query<{ status: string; first: string }>(`select status, to_char(first_charge_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as first from users where id = $1`, [m.id]);
    expect(u).toEqual({ status: "active", first: "2026-12-14T11:05:00Z" });
  });
});

describe("12 (P3): sponsored members", () => {
  it("are never charged a first month, reminded of one, or given contribution results", async () => {
    const trial = await member({ status: "trial", sponsor: true });
    await picks(trial.id, WEEK, "ready");
    await runChargeJob(query, deps(SIX_AM), { week: WEEK });
    expect(creates).toBe(0);
    // Saturday 2026-12-12, inside the 48 hours before the charge.
    expect(await sendFirstChargeReminders(query, { gw: billing, settings, now: new Date("2026-12-12T12:00:00Z"), query, transport })).toBe(0);
    const active = await member({ status: "active", sponsor: true });
    expect(await recordWeek(query, WEEK, settings)).toBe(0);
    expect(await query("select 1 from contribution_weeks where user_id = $1", [active.id])).toEqual([]);
    expect(await row(trial.id)).toMatchObject({ status: "trial" });
  });
});
