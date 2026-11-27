import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/admin/users";
import { reconcileEvents } from "@/lib/billing/reconcile";
import { creditScenario, CREDIT_NOW, REFERRALS_OFF, REFERRALS_ON } from "@/test-helpers/credit-scenario";
import { postPendingCredits } from "./credit-post";
import { lapseClosedCredits } from "./credit-reversal";
import { CreditBusy } from "./credit-balance";

/** B2 plan Unit 4: clawback on refunds and lost disputes, the dispute freeze, and lapse on close. */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let t: Awaited<ReturnType<typeof creditScenario>>;
beforeEach(async () => {
  t = await creditScenario();
});

async function credited() {
  const a = await t.member("ana@example.com");
  const b = await t.referred("ben@example.com", a.id);
  const inv = await t.paid(b.customer!);
  return { a, b, inv, charge: t.chargeOf(inv) };
}
const refunded = (charge: string) => t.handle(t.event("charge.refunded", { id: charge, object: "charge" }));
const disputeEvent = (type: "created" | "closed", id: string) => t.handle(t.event(`charge.dispute.${type}`, { id, object: "dispute" }));
const claws = async () => (await t.ledger()).filter((r) => r.kind === "clawback");

/** The ledger's account of the referral credit on the balance (no invoice has used any). */
async function ledgerNet(userId: string) {
  const [r] = await t.query<{ n: number }>(
    `select coalesce(sum(case kind when 'grant' then amount_cents when 'clawback' then -(amount_cents - uncollected_cents) else -amount_cents end), 0)::int as n
     from credits where user_id = $1 and status = 'posted' and (kind <> 'clawback' or reason is null or reason not like 'unposted_grant%')`,
    [userId],
  );
  return r.n;
}

describe("clawback", () => {
  it("a half refund claws back half; a later lost dispute on the rest takes the remainder, never more than the grant", async () => {
    const { a, charge, inv } = await credited();
    t.stripe.refund(charge, inv.amountPaid / 2);
    expect(await refunded(charge)).toBe("handled");
    expect(t.stripe.credit(a.customer!)).toBe(14000);
    const du = t.stripe.openDisputeOn(charge, inv.amountPaid / 2);
    await disputeEvent("created", du);
    t.stripe.closeDispute(du, "lost");
    expect(await disputeEvent("closed", du)).toBe("handled");
    await refunded(charge);
    expect((await claws()).map((r) => [r.amount_cents, r.uncollected_cents, r.status])).toEqual([
      [14000, 0, "posted"],
      [14000, 0, "posted"],
    ]);
    expect(t.stripe.balances.get(a.customer!)).toBe(0);
    const alerts = t.sent.filter((m) => m.subject.includes("clawed back"));
    expect(alerts).toHaveLength(2);
    for (const c of await claws()) expect(alerts.some((m) => m.text.includes(c.id) && m.text.includes(`/admin/users/${a.id}`))).toBe(true);
  });

  it("a partial lost dispute claws back only its own share", async () => {
    const { a, charge, inv } = await credited();
    const du = t.stripe.openDisputeOn(charge, inv.amountPaid / 4);
    t.stripe.closeDispute(du, "lost");
    await disputeEvent("closed", du);
    expect((await claws()).map((r) => r.amount_cents)).toEqual([7000]);
    expect(t.stripe.credit(a.customer!)).toBe(21000);
  });

  it("a lost dispute on the credited charge claws back the full amount when the balance covers it", async () => {
    const { a, charge } = await credited();
    const du = t.stripe.openDisputeOn(charge);
    t.stripe.closeDispute(du, "lost");
    await disputeEvent("closed", du);
    expect(await claws()).toEqual([expect.objectContaining({ amount_cents: 28000, uncollected_cents: 0, status: "posted" })]);
    expect(t.stripe.credit(a.customer!)).toBe(0);
  });

  it("a clawback larger than the balance leaves it at 0, never in debt, and the shortfall comes off the referrer's next grant", async () => {
    const { a, charge, inv } = await credited();
    t.pay(a.customer!, { id: "in_ana", exTax: 20000, tax: 0 });
    expect(t.stripe.credit(a.customer!)).toBe(8000);
    t.stripe.refund(charge, inv.amountPaid);
    await refunded(charge);
    expect((await claws())[0]).toMatchObject({ amount_cents: 28000, uncollected_cents: 20000, status: "posted" });
    expect(t.stripe.balances.get(a.customer!)).toBe(0);
    expect(t.sent.find((m) => m.subject.includes("clawed back"))?.text).toContain("CA$200 could not be taken");
    const c = await t.referred("cat@example.com", a.id);
    await t.paid(c.customer!);
    expect((await t.ledger()).find((r) => r.kind === "grant" && r.offset_cents > 0)).toMatchObject({ amount_cents: 8000, offset_cents: 20000, status: "posted" });
    expect(t.stripe.credit(a.customer!)).toBe(8000);
  });

  it("takes back only referral credit: credit on the balance from elsewhere is never taken", async () => {
    const { a, charge, inv } = await credited();
    // Ana spent all her referral credit, and support then gave her CA$500 of credit by hand in Stripe.
    t.pay(a.customer!, { id: "in_ana", exTax: 28000, tax: 0 });
    t.stripe.balances.set(a.customer!, -50000);
    t.stripe.refund(charge, inv.amountPaid);
    await refunded(charge);
    // The ledger still thinks 28000 is there, but the cap is the smaller of the two: 28000 taken, 0 short.
    expect((await claws())[0]).toMatchObject({ amount_cents: 28000, uncollected_cents: 0 });
    expect(t.stripe.credit(a.customer!)).toBe(22000);
  });

  it("two clawbacks for one member at once never take the same balance twice", async () => {
    const { a, charge, inv } = await credited();
    t.pay(a.customer!, { id: "in_ana", exTax: 20000, tax: 0 });
    t.stripe.refund(charge, inv.amountPaid / 2);
    t.stripe.refund(charge, inv.amountPaid / 2);
    const events = [1, 2].map(() => t.event("charge.refunded", { id: charge, object: "charge" }));
    const first = await Promise.allSettled(events.map((e) => t.handle(e)));
    for (const [i, r] of first.entries()) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(CreditBusy);
        await t.handle(events[i]);
      }
    }
    expect(t.stripe.balances.get(a.customer!)).toBe(0);
    expect((await claws()).reduce((n, r) => n + r.uncollected_cents, 0)).toBe(20000);
  });

  it("a refund on an unrelated payment does nothing", async () => {
    await credited();
    const x = await t.member("xen@example.com");
    const other = t.pay(x.customer!, { id: "in_x" });
    t.stripe.refund(t.chargeOf(other), 1000);
    expect(await refunded(t.chargeOf(other))).toBe("ignored");
    expect(await claws()).toEqual([]);
  });

  it("reconcile replays a missed charge.refunded or charge.dispute.closed, and each clawback happens once", async () => {
    const { a, charge, inv } = await credited();
    t.stripe.refund(charge, inv.amountPaid / 2);
    const du = t.stripe.openDisputeOn(charge, inv.amountPaid / 2);
    t.stripe.closeDispute(du, "lost");
    const old = Math.floor(CREDIT_NOW.getTime() / 1000) - 7200;
    const missed = [t.event("charge.refunded", { id: charge, object: "charge" }, "evt_r", old), t.event("charge.dispute.closed", { id: du, object: "dispute" }, "evt_d", old)];
    const source = async () => ({ events: missed, hasMore: false });
    await reconcileEvents(t.query, source, (e) => t.handle(e), { now: CREDIT_NOW });
    await reconcileEvents(t.query, source, (e) => t.handle(e), { now: CREDIT_NOW });
    await t.handle({ ...missed[1], id: "evt_dup" });
    expect(await claws()).toHaveLength(2);
    expect(t.posts()).toHaveLength(3);
    expect(t.stripe.credit(a.customer!)).toBe(0);
  });

  it("a refund after the referrer was deleted is recorded once, by its refund id, as all uncollected", async () => {
    const { a, charge, inv } = await credited();
    await t.query(`update users set status = 'closed' where id = $1`, [a.id]);
    await lapseClosedCredits(t.query, t.deps());
    expect(await deleteAccount(t.query, "peter@example.com", a.id, "ana@example.com")).toMatchObject({ ok: true });
    expect((await t.ledger()).map((r) => r.user_id)).toEqual([null, null]);
    t.stripe.refund(charge, inv.amountPaid);
    await refunded(charge);
    await refunded(charge);
    expect(await claws()).toEqual([expect.objectContaining({ amount_cents: 28000, uncollected_cents: 28000, status: "posted", user_id: null })]);
  });
});

describe("a reversal that came before the grant", () => {
  it("a refund processed before invoice.paid reduces the grant when it is made", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const inv = t.pay(b.customer!, { id: "in_b1" });
    t.stripe.refund(t.chargeOf(inv), inv.amountPaid / 2);
    expect(await refunded(t.chargeOf(inv))).toBe("ignored");
    await t.handle(t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }));
    expect((await t.ledger()).map((r) => [r.kind, r.amount_cents, r.status])).toEqual([
      ["grant", 14000, "posted"],
      ["clawback", 14000, "posted"],
    ]);
    expect(t.stripe.credit(a.customer!)).toBe(14000);
    // The refund's own event, replayed later, finds it recorded.
    await refunded(t.chargeOf(inv));
    expect(await claws()).toHaveLength(1);
  });

  it("a dispute already lost leaves a grant of nothing, never posted", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const inv = t.pay(b.customer!, { id: "in_b1" });
    const du = t.stripe.openDisputeOn(t.chargeOf(inv));
    t.stripe.closeDispute(du, "lost");
    await t.handle(t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }));
    expect((await t.ledger()).map((r) => [r.kind, r.amount_cents, r.status, r.reason])).toEqual([
      ["grant", 0, "lapsed", "clawed_back"],
      ["clawback", 28000, "posted", "unposted_grant:dispute_lost"],
    ]);
    expect(t.posts()).toEqual([]);
  });

  it("the same through a late attribution", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.member("ben@example.com", { status: "active" });
    const inv = t.pay(b.customer!, { id: "in_b1" });
    t.stripe.refund(t.chargeOf(inv), inv.amountPaid);
    const { retryPendingReferrals } = await import("./attribution");
    const { grantForReferredUser } = await import("./credit");
    await t.query(`update users set pending_referrer_id = $2 where id = $1`, [b.id, a.id]);
    await retryPendingReferrals(t.query, CREDIT_NOW, 10, { grant: (id) => grantForReferredUser(t.query, t.deps(), id) });
    expect((await t.ledger()).map((r) => [r.kind, r.amount_cents, r.status])).toEqual([
      ["grant", 0, "lapsed"],
      ["clawback", 28000, "posted"],
    ]);
    expect(t.posts()).toEqual([]);
  });
});

describe("disputes", () => {
  it("a dispute opened before posting freezes the grant (a card save does not post it); a won dispute posts it", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    const inv = await t.paid(b.customer!);
    const du = t.stripe.openDisputeOn(t.chargeOf(inv));
    await disputeEvent("created", du);
    expect((await t.ledger())[0]).toMatchObject({ status: "frozen", reason: `dispute:${du}` });
    await t.query(`update users set stripe_customer = 'cus_ana', currency = 'CAD', trial_started_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
    await postPendingCredits(t.query, t.deps());
    expect(t.posts()).toEqual([]);
    t.stripe.closeDispute(du, "won");
    expect(await disputeEvent("closed", du)).toBe("handled");
    expect((await t.ledger())[0]).toMatchObject({ status: "posted", reason: null });
    expect(t.stripe.credit("cus_ana")).toBe(28000);
  });

  it("with two disputes open, winning one keeps the grant frozen under the other; winning both releases it", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    const inv = await t.paid(b.customer!);
    const d1 = t.stripe.openDisputeOn(t.chargeOf(inv), 1000);
    const d2 = t.stripe.openDisputeOn(t.chargeOf(inv), 1000);
    await disputeEvent("created", d1);
    await disputeEvent("created", d2);
    t.stripe.closeDispute(d1, "won");
    await disputeEvent("closed", d1);
    expect((await t.ledger())[0]).toMatchObject({ status: "frozen", reason: `dispute:${d2}` });
    t.stripe.closeDispute(d2, "won");
    await disputeEvent("closed", d2);
    expect((await t.ledger())[0]).toMatchObject({ status: "pending_customer", reason: null });
  });

  it("a grant earned while a dispute is already open is recorded frozen", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const inv = t.pay(b.customer!, { id: "in_b1" });
    t.stripe.openDisputeOn(t.chargeOf(inv));
    await t.handle(t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }));
    expect((await t.ledger())[0]).toMatchObject({ status: "frozen" });
    expect(t.posts()).toEqual([]);
  });

  it("a lost dispute on a frozen grant lapses it, with nothing posted", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    const inv = await t.paid(b.customer!);
    const du = t.stripe.openDisputeOn(t.chargeOf(inv));
    await disputeEvent("created", du);
    t.stripe.closeDispute(du, "lost");
    await disputeEvent("closed", du);
    expect((await t.ledger()).map((r) => [r.kind, r.amount_cents, r.status])).toEqual([
      ["grant", 0, "lapsed"],
      ["clawback", 28000, "posted"],
    ]);
    expect(t.posts()).toEqual([]);
  });
});

describe("an unposted grant's clawback racing its posting", () => {
  it("a refund arriving while the grant is being posted waits for the lease, then takes the posted branch", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    const inv = await t.paid(b.customer!);
    await t.query(`update users set stripe_customer = 'cus_ana', currency = 'CAD', trial_started_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
    t.stripe.refund(t.chargeOf(inv), inv.amountPaid / 2);
    let during: unknown = null;
    t.stripe.onNextPost(async () => {
      during = await refunded(t.chargeOf(inv)).catch((e) => e);
    });
    await postPendingCredits(t.query, t.deps());
    expect(during).toBeInstanceOf(CreditBusy);
    expect(await refunded(t.chargeOf(inv))).toBe("handled");
    expect((await t.ledger()).map((r) => [r.kind, r.amount_cents, r.status])).toEqual([
      ["grant", 28000, "posted"],
      ["clawback", 14000, "posted"],
    ]);
    expect(t.stripe.credit("cus_ana")).toBe(14000);
  });

  it("the reduce statement never records a clawback for a grant that is no longer unposted", async () => {
    const { REDUCE_UNPOSTED_SQL } = await import("./credit-reversal");
    const { a } = await credited();
    const [g] = await t.ledger();
    const rows = await t.query<{ id: string | null }>(REDUCE_UNPOSTED_SQL, [g.id, 14000, 28000, CREDIT_NOW.toISOString(), 14000, 0, "unposted_grant:refund", "re_x"]);
    expect(rows[0].id).toBeNull();
    expect(await claws()).toEqual([]);
    expect((await t.ledger())[0]).toMatchObject({ amount_cents: 28000, status: "posted", user_id: a.id });
  });
});

describe("lapse on close", () => {
  it("a closed referrer's pending grant lapses and never posts, and their unused referral credit is taken back once", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    t.settings = REFERRALS_OFF;
    const c = await t.referred("cat@example.com", a.id);
    await t.paid(c.customer!);
    await t.query(`update users set status = 'closed', access_ends_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
    t.settings = REFERRALS_ON;
    // CA$100 of credit from elsewhere stays: only referral credit is taken.
    t.stripe.balances.set(a.customer!, -38000);
    expect(await lapseClosedCredits(t.query, t.deps())).toEqual({ lapsed: 1, zeroed: 1, failed: 0 });
    expect(await lapseClosedCredits(t.query, t.deps())).toEqual({ lapsed: 0, zeroed: 0, failed: 0 });
    await postPendingCredits(t.query, t.deps());
    expect((await t.ledger()).map((r) => [r.kind, r.status, r.reason, r.amount_cents])).toEqual([
      ["grant", "posted", null, 28000],
      ["grant", "lapsed", "account_closed", 28000],
      ["lapse", "posted", "account_closed", 28000],
    ]);
    expect(t.stripe.credit(a.customer!)).toBe(10000);
    expect(t.posts()).toHaveLength(2);
  });

  it("a lapse that fails to post is not picked again by the lapse, and the posting sweep finishes it", async () => {
    const { a } = await credited();
    await t.query(`update users set status = 'closed', access_ends_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
    t.stripe.failNext();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lapseClosedCredits(t.query, t.deps())).toMatchObject({ failed: 1 });
    errors.mockRestore();
    expect(await lapseClosedCredits(t.query, t.deps())).toEqual({ lapsed: 0, zeroed: 0, failed: 0 });
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ posted: 1 });
    expect(t.stripe.credit(a.customer!)).toBe(0);
  });

  it("deleteAccount refuses while credit is pending, frozen, or posted with no lapse yet; the ledger outlives the account", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    await t.query(`update users set status = 'closed', access_ends_at = '2026-11-01' where id = $1`, [a.id]);
    expect(await deleteAccount(t.query, "peter@example.com", a.id, "ana@example.com")).toMatchObject({ ok: false, message: expect.stringContaining("referral credit") });
    await lapseClosedCredits(t.query, t.deps());
    expect(await deleteAccount(t.query, "peter@example.com", a.id, "ana@example.com")).toMatchObject({ ok: true });
    expect(await t.ledger()).toEqual([expect.objectContaining({ kind: "grant", status: "lapsed", user_id: null })]);

    const { a: c } = await (async () => {
      const m = await t.member("cyd@example.com");
      const r = await t.referred("dee@example.com", m.id);
      await t.paid(r.customer!);
      return { a: m };
    })();
    await t.query(`update users set status = 'closed', access_ends_at = '2026-11-01' where id = $1`, [c.id]);
    expect(await deleteAccount(t.query, "peter@example.com", c.id, "cyd@example.com")).toMatchObject({ ok: false });
  });
});

describe("the ledger and the balance", () => {
  it("after grants, refunds, a lost dispute and a lapse, the ledger's posted credit equals the Stripe balance", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const c = await t.referred("cat@example.com", a.id);
    const d = await t.referred("dan@example.com", a.id);
    const ib = await t.paid(b.customer!);
    const ic = await t.paid(c.customer!, { exTax: 14000 });
    await t.paid(d.customer!);
    t.stripe.refund(t.chargeOf(ib), 10000);
    await refunded(t.chargeOf(ib));
    expect(await ledgerNet(a.id)).toBe(-(t.stripe.balances.get(a.customer!) ?? 0));
    const du = t.stripe.openDisputeOn(t.chargeOf(ic));
    t.stripe.closeDispute(du, "lost");
    await disputeEvent("closed", du);
    expect(await ledgerNet(a.id)).toBe(-(t.stripe.balances.get(a.customer!) ?? 0));
    await t.query(`update users set status = 'closed', access_ends_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
    await lapseClosedCredits(t.query, t.deps());
    expect(await ledgerNet(a.id)).toBe(0);
    expect(t.stripe.balances.get(a.customer!)).toBe(0);
  });
});

describe("reversals still waiting to post count against the cap (round 2)", () => {
  it("a clawback whose post failed holds its share: a second refund never takes the same credit, and the balance never goes into debt", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const c = await t.referred("cat@example.com", a.id);
    const ib = await t.paid(b.customer!);
    const ic = await t.paid(c.customer!);
    t.pay(a.customer!, { id: "in_ana", exTax: 46000, tax: 0 });
    expect(t.stripe.credit(a.customer!)).toBe(10000);
    t.stripe.refund(t.chargeOf(ib), ib.amountPaid);
    t.stripe.failNext();
    await expect(refunded(t.chargeOf(ib))).rejects.toThrow(/Stripe is down/);
    expect((await claws())[0]).toMatchObject({ amount_cents: 28000, uncollected_cents: 18000, status: "pending_customer" });
    t.stripe.refund(t.chargeOf(ic), ic.amountPaid);
    await refunded(t.chargeOf(ic));
    expect(t.stripe.balances.get(a.customer!)).toBeLessThanOrEqual(0);
    await postPendingCredits(t.query, t.deps());
    expect(t.stripe.balances.get(a.customer!)).toBe(0);
    const all = await claws();
    expect(all.reduce((n, r) => n + r.amount_cents - r.uncollected_cents, 0)).toBe(10000);
    expect(all.every((r) => r.status === "posted")).toBe(true);
  });

  it("a waiting clawback posted after an invoice used the credit posts what is left, the rest uncollected", async () => {
    const { a, charge, inv } = await credited();
    t.stripe.refund(charge, inv.amountPaid / 2);
    t.stripe.failNext();
    await expect(refunded(charge)).rejects.toThrow(/Stripe is down/);
    t.pay(a.customer!, { id: "in_ana", exTax: 20000, tax: 0 });
    expect(t.stripe.credit(a.customer!)).toBe(8000);
    await postPendingCredits(t.query, t.deps());
    expect((await claws())[0]).toMatchObject({ amount_cents: 14000, uncollected_cents: 6000, status: "posted" });
    expect(t.stripe.balances.get(a.customer!)).toBe(0);
  });
});

describe("lapse rotation (round 2)", () => {
  it("an account whose lapse keeps failing never starves another", async () => {
    const stuck = await t.member("stuck@example.com");
    const ok = await t.member("ok@example.com");
    for (const [m, r] of [
      [stuck, "s1@example.com"],
      [ok, "o1@example.com"],
    ] as const) {
      const x = await t.referred(r, m.id);
      await t.paid(x.customer!);
      await t.query(`update users set status = 'closed', access_ends_at = $2 where id = $1`, [m.id, CREDIT_NOW.toISOString()]);
    }
    t.stripe.failing.add(stuck.customer!);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await lapseClosedCredits(t.query, t.deps(), 1);
    await lapseClosedCredits(t.query, t.deps(), 1);
    errors.mockRestore();
    expect(t.stripe.credit(ok.customer!)).toBe(0);
  });
});

describe("deleteAccount inside a no-card reopen window (round 2)", () => {
  it("says the credit settles once the reopen window is over", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    await t.query(`update users set status = 'closed', closed_reason = 'no_card', access_ends_at = now() where id = $1`, [a.id]);
    const r = await deleteAccount(t.query, "peter@example.com", a.id, "ana@example.com");
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("can no longer reopen it") });
  });
});
