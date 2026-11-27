import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { HOURLY_TASKS, runHourly } from "@/lib/housekeeping/job";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { creditScenario, CREDIT_NOW } from "@/test-helpers/credit-scenario";
import { grantLateReferrals } from "./credit";
import { CreditBusy, LEASE_WORK_MS, WEBHOOK_LEASE } from "./credit-balance";
import { postPendingCredits } from "./credit-post";
import { lapseClosedCredits } from "./credit-reversal";

/**
 * B2 whole-branch review fixes for referral credit: the hourly pass's
 * deadline and task order, the webhook's shorter lease and its answer when
 * the credit is busy, the job clock on the webhook's ledger stamps, a
 * cancelled account's lapse, and sponsor invoices never touching credit.
 */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let t: Awaited<ReturnType<typeof creditScenario>>;
beforeEach(async () => {
  t = await creditScenario();
});

const day = (n: number) => new Date(CREDIT_NOW.getTime() + n * 86_400_000);

/** `n` grants waiting for Ana, who has just saved her card (pending_customer, ready to post). */
async function waitingGrants(n: number) {
  const a = await t.member("ana@example.com", { card: false });
  for (let i = 1; i <= n; i++) {
    const b = await t.referred(`b${i}@example.com`, a.id);
    await t.paid(b.customer!);
  }
  await t.query(`update users set stripe_customer = 'cus_ana', currency = 'CAD', trial_started_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
  return a;
}

describe("the hourly pass's credit tasks (reliability P1)", () => {
  const CREDIT_TASKS = ["referral_pending", "referral_credits", "referral_late_grants", "referral_credit_lapse"];

  it("run after the charge tasks; the database-only purges stay in front", () => {
    const names = HOURLY_TASKS.map((x) => x.name);
    const charges = ["charge_takeover", "charge_retries", "close_unpaid_trials"].map((n) => names.indexOf(n));
    for (const n of CREDIT_TASKS) expect(names.indexOf(n), n).toBeGreaterThan(Math.max(...charges));
    expect(Math.min(...charges)).toBeGreaterThan(names.indexOf("session_guest_retention"));
  });

  it("a slow Stripe can't stop charge_retries from running in the same pass, and the credit sweep stops at the deadline", async () => {
    await waitingGrants(3);
    const real = t.stripe.findBalanceTransaction.bind(t.stripe);
    const slow = vi.spyOn(t.stripe, "findBalanceTransaction").mockImplementation(async (...args) => {
      await new Promise((r) => setTimeout(r, 2_500));
      return real(...args);
    });
    const tasks = HOURLY_TASKS.filter((x) => [...CREDIT_TASKS, "charge_takeover", "charge_retries", "close_unpaid_trials"].includes(x.name));
    const d = { gw: {} as BillingGateway, settings: t.settings, now: CREDIT_NOW, query: t.query, transport: t.transport, sleep: async () => {}, credits: t.stripe };
    const out = await runHourly(t.query, d, tasks, { deadline: Date.now() + 2_000 });
    expect(out.charge_retries).toEqual(expect.objectContaining({ charged: 0 }));
    // One slow Stripe read, then nothing posted after the deadline and no further row taken.
    expect(out.referral_credits).toMatchObject({ posted: 0, busy: 1 });
    expect(slow).toHaveBeenCalledTimes(1);
    expect(t.posts()).toEqual([]);
    expect(out.referral_late_grants).toBe("out of time: next pass");
    expect((await t.ledger()).every((r) => r.status === "pending_customer")).toBe(true);
  }, 15_000);

  it("each sweep takes no row once its deadline has passed", async () => {
    await waitingGrants(2);
    const past = { deadline: 0 };
    expect(await postPendingCredits(t.query, t.deps(past))).toMatchObject({ posted: 0, busy: 0, waiting: 0, failed: 0 });
    expect(await grantLateReferrals(t.query, t.deps(past))).toEqual({ granted: 0, none: 0, failed: 0, busy: 0 });
    expect(await lapseClosedCredits(t.query, t.deps(past))).toEqual({ lapsed: 0, zeroed: 0, failed: 0 });
    expect(t.stripe.calls.filter((c) => c.startsWith("list:"))).toEqual([]);
  });
});

describe("credit from the Stripe webhook (P2)", () => {
  it("holds a 90-second lease and makes no Stripe write after 40 seconds", async () => {
    await waitingGrants(1);
    let ms = 1_000_000;
    let leaseSeconds = 0;
    const real = t.stripe.findBalanceTransaction.bind(t.stripe);
    vi.spyOn(t.stripe, "findBalanceTransaction").mockImplementation(async (...args) => {
      [{ s: leaseSeconds }] = await t.query<{ s: number }>(`select extract(epoch from until - now())::float as s from leases`);
      ms += WEBHOOK_LEASE.workMs + 1;
      return real(...args);
    });
    expect(WEBHOOK_LEASE.workMs + 1).toBeLessThan(LEASE_WORK_MS);
    expect(await postPendingCredits(t.query, t.deps({ clock: () => ms, leaseBudget: WEBHOOK_LEASE }))).toMatchObject({ posted: 0, busy: 1 });
    expect(leaseSeconds).toBeGreaterThan(80);
    expect(leaseSeconds).toBeLessThanOrEqual(90);
    expect(t.posts()).toEqual([]);
  });

  it("invoice.paid with the referrer's credit busy answers (no 500) with a note, and the hourly late-grant sweep grants it once", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id, { status: "active" });
    await t.query(`insert into leases (name, holder, until) values ($1, 'other', now() + interval '5 minutes')`, [`credit:${a.id}`]);
    const inv = t.pay(b.customer!, { id: "in_b1" });
    await expect(t.handle(t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }, "evt_busy"))).resolves.toBeDefined();
    expect(await t.query(`select status, error from stripe_events where id = 'evt_busy'`)).toEqual([{ status: "done", error: "referral credit busy: left to the hourly sweep" }]);
    expect(await t.ledger()).toEqual([]);
    await t.query(`delete from leases`);
    expect(await grantLateReferrals(t.query, t.deps())).toMatchObject({ granted: 1 });
    expect(await t.ledger()).toEqual([expect.objectContaining({ kind: "grant", status: "posted", amount_cents: 28000 })]);
    expect(t.posts()).toHaveLength(1);
  });

  it("charge.refunded with the credit busy still fails (500), since nothing hourly looks for a reversal", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const inv = await t.paid(b.customer!);
    t.stripe.refund(t.chargeOf(inv), inv.amountPaid);
    await t.query(`insert into leases (name, holder, until) values ($1, 'other', now() + interval '5 minutes')`, [`credit:${a.id}`]);
    await expect(t.handle(t.event("charge.refunded", { id: t.chargeOf(inv), object: "charge" }, "evt_refund"))).rejects.toBeInstanceOf(CreditBusy);
    expect((await t.query<{ status: string }>(`select status from stripe_events where id = 'evt_refund'`))[0].status).toBe("failed");
    await t.query(`delete from leases`);
    expect(await t.handle(t.event("charge.refunded", { id: t.chargeOf(inv), object: "charge" }, "evt_refund"))).toBe("handled");
    expect((await t.ledger()).map((r) => r.kind)).toEqual(["grant", "clawback"]);
  });

  it("an 'as of' replay in the future stamps the ledger at the real clock (creditsNow), not the job's", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const inv = t.pay(b.customer!, { id: "in_b1" });
    await handleStripeEvent(t.query, fakeGateway(), t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }), {
      getSettings: async () => t.settings,
      now: day(30),
      creditsNow: CREDIT_NOW,
      credits: t.stripe,
      query: t.query,
      transport: t.transport,
      sleep: async () => {},
    });
    const rows = await t.query<{ created_at: Date; posted_at: Date }>(`select created_at, posted_at from credits`);
    expect(rows).toEqual([{ created_at: CREDIT_NOW, posted_at: CREDIT_NOW }]);
    expect((await t.query<{ at: Date }>(`select paying_at as at from referrals`))[0].at).toEqual(CREDIT_NOW);
  });
});

describe("a cancelled account's credit (seam P2)", () => {
  it("lapses like a closed one once its access has ended, never while the paid month runs", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    expect(t.stripe.credit(a.customer!)).toBe(28000);
    await t.query(`update users set status = 'cancelled', cancel_requested_at = $2, access_ends_at = $3 where id = $1`, [a.id, day(-10).toISOString(), day(4).toISOString()]);
    expect(await lapseClosedCredits(t.query, t.deps())).toEqual({ lapsed: 0, zeroed: 0, failed: 0 });
    await t.query(`update users set access_ends_at = $2 where id = $1`, [a.id, day(-1).toISOString()]);
    expect(await lapseClosedCredits(t.query, t.deps())).toEqual({ lapsed: 0, zeroed: 1, failed: 0 });
    expect(t.stripe.credit(a.customer!)).toBe(0);
    expect(await lapseClosedCredits(t.query, t.deps())).toEqual({ lapsed: 0, zeroed: 0, failed: 0 });
  });

  it("a grant for a referrer cancelled with access over is never posted: it lapses", async () => {
    const a = await t.member("ana@example.com", { status: "cancelled" });
    await t.query(`update users set cancel_requested_at = $2, access_ends_at = $2 where id = $1`, [a.id, day(-2).toISOString()]);
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    expect(t.posts()).toEqual([]);
    await lapseClosedCredits(t.query, t.deps());
    expect((await t.ledger()).find((r) => r.kind === "grant")).toMatchObject({ status: "lapsed", reason: "account_closed" });
  });
});

describe("sponsor invoices never touch referral credit (isolation)", () => {
  it("a sponsor's invoice.paid, charge.refunded and charge.dispute.* through the webhook make no credit rows and no balance calls", async () => {
    await t.query(
      `insert into sponsors (name, currency, standard_cents, higher_cents, seats, code_hash, billing_email, stripe_customer)
       values ('Harbour Realty', 'CAD', 20000, 40000, 3, 'h', 'ap@harbour.example', 'cus_harbour')`,
    );
    const balance = vi.spyOn(t.stripe, "balance");
    const inv = t.pay("cus_harbour", { id: "in_sponsor", exTax: 60000, subscription: null });
    const charge = t.chargeOf(inv);
    t.stripe.refund(charge, 10000);
    const dispute = t.stripe.openDisputeOn(charge, 5000);
    await t.handle(t.event("invoice.paid", { id: inv.id, object: "invoice", customer: "cus_harbour" }));
    await t.handle(t.event("charge.refunded", { id: charge, object: "charge" }));
    await t.handle(t.event("charge.dispute.created", { id: dispute, object: "dispute" }));
    t.stripe.closeDispute(dispute, "lost");
    await t.handle(t.event("charge.dispute.closed", { id: dispute, object: "dispute" }));
    expect(await t.ledger()).toEqual([]);
    expect(t.posts()).toEqual([]);
    expect(t.stripe.calls.filter((c) => c.startsWith("list:"))).toEqual([]);
    expect(balance).not.toHaveBeenCalled();
  });
});
