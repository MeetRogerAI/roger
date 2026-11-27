import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelPlan, undoCancel, type PlanDeps } from "@/lib/billing/cancel";
import { switchPlan } from "@/lib/billing/switch";
import { delivered, dollars, monday, newWorld, order, outcome, passHours, seedPool, sendRun, signUp, toronto, userRow, weeksWithRuns, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
// One at a time is not offered at launch (`plans.oneAtATimeOffered` in src/data/config.ts, read through
// src/lib/billing/offered.ts). Switching to and from it stays in place and is driven here with the option on;
// "while one at a time is not offered" turns it off, as it is at launch.
const offer = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/offered")>()), oneAtATimeOffered: () => offer.on }));

/**
 * Switching and cancelling (spec B.9 "Changing and cancelling"; checks 27,
 * 41): monthly to one at a time takes effect when the paid month ends; one at
 * a time to monthly starts the subscription with the next list and replaces an
 * order for that Monday, so it is charged once; cancelling in the trial ends at
 * once with the card removed; cancelling a subscription leaves the paid month,
 * can be undone, and the month that follows is charged once.
 */
let w: World;

beforeEach(async () => {
  offer.on = true;
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 12, playsEach: 4, ranOn: "2026-11-26" });
  await w.at("2026-12-02T16:00:00Z");
});

const plan = (): PlanDeps => {
  const d = w.charge();
  return { plans: w.stripe, gw: w.stripe, adjust: w.stripe, settings: d.settings, now: d.now, query: d.query, transport: d.transport, sleep: d.sleep };
};
/** Mondays where the member's Zack sends nothing (monthly members still get their list). */
async function quietMondays(weeks: string[]) {
  for (const week of weeks) {
    await passHours(w, toronto(week, "00:30"), 6);
    await monday(w, week);
  }
}
const firstCharges = () => w.stripe.callsTo("subscriptions.create");

async function subscriber(email: string): Promise<Member> {
  const m = await signUp(w, { email, currency: "USD", country: "US" });
  await weeksWithRuns(w, [m], ["2026-12-07", "2026-12-14", "2026-12-21"]);
  expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "monthly" });
  return m;
}

describe("switching plans", () => {
  it("monthly to one at a time: lists continue to the end of the paid month, then only ordered lists, and nothing renews", async () => {
    const m = await subscriber("mo@example.com");
    await w.at(toronto("2026-12-23", "10:00"));
    expect(await switchPlan(w.query, plan(), { userId: m.id, to: "per_run" })).toMatchObject({ ok: true });
    expect(w.stripe.callsTo("subscriptions.update.cancel_at_period_end")).toHaveLength(1);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "monthly", plan_change_to: "per_run" });
    expect(w.subjects(m.email)).toContain("Your switch to one Cora Curation at a time is booked");

    // The paid month runs to January 21: every Monday in it still has a list.
    await quietMondays(["2026-12-28", "2027-01-04", "2027-01-11", "2027-01-18"]);
    for (const week of ["2026-12-28", "2027-01-04", "2027-01-11", "2027-01-18"]) expect(await delivered(w, m.id, week)).toHaveLength(3);

    // Stripe ends the subscription with the month; its webhook moves the account to one at a time.
    await passHours(w, new Date("2027-01-21T14:00:00Z"), 3);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "per_run", stripe_subscription: null, plan_change_to: null });
    expect(w.subjects(m.email)).toContain("Your plan is now one Cora Curation at a time");
    expect(w.stripe.invoiceList.filter((i) => i.billingReason === "subscription_cycle")).toEqual([]);

    // A Monday with a run but no order: no charge, no list (spec check 37).
    await w.at(toronto("2027-01-24", "15:00"));
    await sendRun(w, m);
    await monday(w, "2027-01-25");
    expect(await outcome(w, m.id, "2027-01-25")).toBe("not_eligible");
    expect(w.stripe.invoiceList).toHaveLength(1);
    expect(firstCharges()).toHaveLength(1);
  });

  it("one at a time to monthly: the order for that Monday is replaced, and the Monday is charged once, at the amount the email stated (spec check 41)", async () => {
    const m = await signUp(w, { email: "uno@example.com", currency: "USD", country: "US", plan: "per_run" });
    await weeksWithRuns(w, [m], ["2026-12-07", "2026-12-14"]);
    await w.at(toronto("2026-12-19", "12:00"));
    expect(await order(w, m, "2026-12-21")).toEqual({ ok: true });
    await weeksWithRuns(w, [m], ["2026-12-21"]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "per_run" });

    // Tuesday: an order for next Monday; Wednesday: the switch to monthly.
    await w.at(toronto("2026-12-22", "10:00"));
    expect(await order(w, m, "2026-12-28")).toEqual({ ok: true });
    await w.at(toronto("2026-12-23", "10:00"));
    expect(await switchPlan(w.query, plan(), { userId: m.id, to: "monthly" })).toMatchObject({ ok: true });
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", plan: "monthly" });
    expect(await w.query(`select status from orders where user_id = $1 and week_of = '2026-12-28'`, [m.id])).toEqual([{ status: "cancelled" }]);
    const changed = w.mail(m.email).find((x) => x.subject === "Your plan is now monthly")!;
    expect(changed.text).toContain(dollars(20000, "USD"));

    const [r] = await weeksWithRuns(w, [m], ["2026-12-28"]);
    expect(r.charge.first).toMatchObject({ charged: 1 });
    expect(r.charge.orders?.charged ?? 0).toBe(0);
    // One order invoice from December 21 and one subscription invoice for December 28: never two for one Monday.
    expect(w.stripe.callsTo("invoices.create.order")).toHaveLength(1);
    expect(firstCharges()).toHaveLength(1);
    expect(w.stripe.invoiceList.map((i) => i.billingReason).sort()).toEqual(["manual", "subscription_create"]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "monthly" });
    expect(await delivered(w, m.id, "2026-12-28")).toHaveLength(3);
  });
});

describe("while one at a time is not offered (the switch off, as at launch)", () => {
  beforeEach(() => {
    offer.on = false;
  });

  it("a monthly subscriber cannot switch to it: Stripe is not called, nothing is stored or emailed, and the month renews as usual", async () => {
    const m = await subscriber("mona@example.com");
    await w.at(toronto("2026-12-23", "10:00"));
    const before = w.mail(m.email).length;
    expect(await switchPlan(w.query, plan(), { userId: m.id, to: "per_run" })).toEqual({
      ok: false,
      message: "Ordering one Cora Curation at a time isn’t offered at the moment. Monthly brings a Cora Curation every Monday.",
    });
    expect(w.stripe.callsTo("subscriptions.update.cancel_at_period_end")).toEqual([]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "monthly", plan_change_to: null, cancel_requested_at: null });
    expect(w.mail(m.email)).toHaveLength(before);

    // The paid month ends on January 21 and renews once, at the monthly price: the refusal changed nothing about the money.
    await weeksWithRuns(w, [m], ["2026-12-28", "2027-01-04", "2027-01-11", "2027-01-18"]);
    await passHours(w, new Date("2027-01-21T14:00:00Z"), 6);
    const renewals = w.stripe.invoiceList.filter((i) => i.billingReason === "subscription_cycle");
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ status: "paid", totalCents: 20000 });
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "monthly" });
  });

  it("a member still in the trial cannot switch to it either, and is charged with the third Cora Curation as told", async () => {
    const m = await signUp(w, { email: "tia@example.com", currency: "USD", country: "US" });
    await weeksWithRuns(w, [m], ["2026-12-07"]);
    await w.at(toronto("2026-12-09", "10:00"));
    expect(await switchPlan(w.query, plan(), { userId: m.id, to: "per_run" })).toMatchObject({ ok: false });
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", plan: "monthly" });
    await weeksWithRuns(w, [m], ["2026-12-14", "2026-12-21"]);
    expect(firstCharges()).toHaveLength(1);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "monthly" });
  });

  it("an account already on one at a time can still move to monthly, which is charged once with the next Cora Curation", async () => {
    offer.on = true;
    const m = await signUp(w, { email: "una@example.com", currency: "USD", country: "US", plan: "per_run" });
    await weeksWithRuns(w, [m], ["2026-12-07", "2026-12-14"]);
    offer.on = false;
    await w.at(toronto("2026-12-23", "10:00"));
    expect(await switchPlan(w.query, plan(), { userId: m.id, to: "monthly" })).toMatchObject({ ok: true });
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", plan: "monthly" });
    expect(w.subjects(m.email)).toContain("Your plan is now monthly");
    const [r] = await weeksWithRuns(w, [m], ["2026-12-28"]);
    expect(r.charge.first).toMatchObject({ charged: 1 });
    expect(firstCharges()).toHaveLength(1);
    expect(w.stripe.callsTo("invoices.create.order")).toEqual([]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "monthly" });
  });
});

describe("cancelling", () => {
  it("in the trial: ends at once, removes the saved card, says nothing was charged, and no list follows", async () => {
    const m = await signUp(w, { email: "tom@example.com", currency: "USD", country: "US" });
    await weeksWithRuns(w, [m], ["2026-12-07"]);
    await w.at(toronto("2026-12-09", "10:00"));
    expect(await cancelPlan(w.query, plan(), { userId: m.id, reason: "Not for me" })).toMatchObject({ ok: true });
    expect(await userRow(w, m.id)).toMatchObject({ status: "cancelled" });
    expect(w.stripe.callsTo("payment_methods.detach_all")).toHaveLength(1);
    expect(w.stripe.customers.get(m.customer)!.cards).toBe(0);
    const email = w.mail(m.email).find((x) => x.subject === "Your Roger account is cancelled")!;
    expect(email.text).toContain("You have not been charged");
    await weeksWithRuns(w, [m], ["2026-12-14"]);
    expect(await delivered(w, m.id, "2026-12-14")).toEqual([]);
    expect(firstCharges()).toEqual([]);
  });

  it("a subscriber: one click leaves the paid month, an undo keeps the same subscription with one renewal, and a later cancel ends with the month (spec check 27)", async () => {
    const m = await subscriber("cam@example.com");
    await w.at(toronto("2026-12-23", "10:00"));
    expect(await cancelPlan(w.query, plan(), { userId: m.id })).toMatchObject({ ok: true });
    let u = await userRow(w, m.id);
    expect(u.status).toBe("active");
    expect(u.cancel_requested_at).not.toBeNull();
    expect(new Date(u.access_ends_at!).toISOString()).toBe("2027-01-21T11:05:00.000Z");
    expect(w.mail(m.email).find((x) => x.subject === "Your Roger plan is cancelled")!.text).toContain("January 21");
    await weeksWithRuns(w, [m], ["2026-12-28"]);
    expect(await delivered(w, m.id, "2026-12-28")).toHaveLength(3);

    // Undo before the month ends: the same subscription simply continues.
    await w.at(toronto("2026-12-30", "10:00"));
    expect(await undoCancel(w.query, plan(), { userId: m.id })).toMatchObject({ ok: true });
    expect(w.subjects(m.email)).toContain("Your Roger plan continues");
    expect((await userRow(w, m.id)).cancel_requested_at).toBeNull();
    await weeksWithRuns(w, [m], ["2027-01-04", "2027-01-11", "2027-01-18"]);
    await passHours(w, new Date("2027-01-21T14:00:00Z"), 6);
    const renewals = () => w.stripe.invoiceList.filter((i) => i.billingReason === "subscription_cycle");
    expect(renewals()).toHaveLength(1);
    expect(renewals()[0]).toMatchObject({ status: "paid", totalCents: 20000 });
    expect(w.stripe.subs.size).toBe(1);

    // Cancel again: lists to February 21, then the account is cancelled and nothing more is charged or sent.
    await w.at(toronto("2027-01-22", "10:00"));
    expect(await cancelPlan(w.query, plan(), { userId: m.id })).toMatchObject({ ok: true });
    await quietMondays(["2027-01-25", "2027-02-01", "2027-02-08", "2027-02-15"]);
    expect(await delivered(w, m.id, "2027-02-15")).toHaveLength(3);
    await passHours(w, new Date("2027-02-21T14:00:00Z"), 6);
    u = await userRow(w, m.id);
    expect(u.status).toBe("cancelled");
    await quietMondays(["2027-02-22"]);
    expect(await delivered(w, m.id, "2027-02-22")).toEqual([]);
    expect(renewals()).toHaveLength(1);
    expect(firstCharges()).toHaveLength(1);
  });
});
