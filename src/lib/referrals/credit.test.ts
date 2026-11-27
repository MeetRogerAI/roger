import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeCardSetup } from "@/lib/billing/card-setup";
import { HANDLED_EVENT_TYPES, reconcileEvents } from "@/lib/billing/reconcile";
import { HOURLY_TASKS, type HourlyDeps } from "@/lib/housekeeping/job";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { creditScenario, CREDIT_NOW, REFERRALS_OFF, REFERRALS_ON } from "@/test-helpers/credit-scenario";
import { REFERRAL_RETRY_ATTEMPTS, retryPendingReferrals } from "./attribution";
import { grantLateReferrals, LATE_GRANT_ATTEMPTS } from "./credit";
import { convertCents, convertGrant, grantCents } from "./credit-money";
import { postPendingCredits } from "./credit-post";
import type { Query } from "@/lib/db-query";

/** B2 plan Unit 4: grants, posting and the sweeps, against a fake Stripe balance. */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let t: Awaited<ReturnType<typeof creditScenario>>;
beforeEach(async () => {
  t = await creditScenario();
});

describe("the fake Stripe balance (Unit 4 spike)", () => {
  it("refuses a reused idempotency key with other parameters, and answers the same parameters with the first transaction", async () => {
    const o = { customer: "cus_x", amountCents: -100, currency: "CAD" as const, ledgerId: "l1", description: "d", idempotencyKey: "credit:l1" };
    const r = await t.stripe.postBalance(o);
    expect(await t.stripe.postBalance(o)).toEqual(r);
    await expect(t.stripe.postBalance({ ...o, amountCents: -101 })).rejects.toMatchObject({ type: "StripeIdempotencyError" });
    expect(t.stripe.txns).toHaveLength(1);
  });

  it("fixes a customer's currency like Stripe: another currency is refused", async () => {
    await t.stripe.postBalance({ customer: "cus_x", amountCents: -100, currency: "CAD", ledgerId: "l1", description: "d", idempotencyKey: "k1" });
    await expect(t.stripe.postBalance({ customer: "cus_x", amountCents: -100, currency: "USD", ledgerId: "l2", description: "d", idempotencyKey: "k2" })).rejects.toThrow(/currency/);
  });

  it("the reconcile replays the refund and dispute events too", () => {
    expect(HANDLED_EVENT_TYPES).toEqual(expect.arrayContaining(["invoice.paid", "charge.refunded", "charge.dispute.created", "charge.dispute.closed"]));
  });
});

describe("the amount", () => {
  it("is one month at the referrer's price, at most the invoice's value before tax, converted at 7:5", () => {
    expect(grantCents(REFERRALS_ON, { totalExcludingTax: 28000, currency: "CAD" }, "CAD")).toBe(28000);
    expect(grantCents(REFERRALS_ON, { totalExcludingTax: 14000, currency: "CAD" }, "CAD")).toBe(14000);
    expect(grantCents(REFERRALS_ON, { totalExcludingTax: 28000, currency: "CAD" }, "USD")).toBe(20000);
    expect(grantCents(REFERRALS_ON, { totalExcludingTax: 20000, currency: "USD" }, "CAD")).toBe(28000);
    expect(grantCents(REFERRALS_ON, { totalExcludingTax: 40000, currency: "USD" }, "USD")).toBe(20000);
    expect(convertCents(14000, "CAD", "USD")).toBe(10000);
  });

  it("a converted grant's amount and offset always add up to the converted gross", () => {
    for (const [amount, offset] of [
      [1, 1],
      [8001, 19999],
      [27999, 1],
      [3, 4],
      [0, 28000],
    ]) {
      for (const [from, to] of [
        ["CAD", "USD"],
        ["USD", "CAD"],
      ] as const) {
        const c = convertGrant({ amount, offset }, from, to);
        expect(c.amount + c.offset).toBe(convertCents(amount + offset, from, to));
        expect(c.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("the grant", () => {
  it("a CAD member's first CA$280 invoice gives the CAD referrer CA$280 on their balance, which comes off their next invoice", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    const [g] = await t.ledger();
    expect(g).toMatchObject({ kind: "grant", amount_cents: 28000, currency: "CAD", status: "posted", user_id: a.id });
    expect(g.stripe_txn).toMatch(/^cbtxn_/);
    expect(t.stripe.credit(a.customer!)).toBe(28000);
    expect(await t.stage(b.referral)).toBe("paying");
    expect((await t.query<{ posted_at: Date }>(`select posted_at from credits`))[0].posted_at.toISOString()).toBe(CREDIT_NOW.toISOString());
    expect((await t.query<{ c: number }>(`select credit_balance_cents as c from users where id = $1`, [a.id]))[0].c).toBe(28000);
    expect(t.sent.map((m) => [m.to[0], m.subject])).toEqual([["ana@example.com", "You earned CA$280 of Roger credit"]]);
    // The referrer's next invoice (CA$316.40 with tax): the card pays only what the credit does not cover.
    expect(t.pay(a.customer!, { id: "in_ana_1" }).amountPaid).toBe(3640);
    expect(t.stripe.credit(a.customer!)).toBe(0);
  });

  it("a promo making the first invoice CA$140 gives CA$140", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!, { exTax: 14000 });
    expect((await t.ledger())[0]).toMatchObject({ amount_cents: 14000, status: "posted" });
  });

  it("is based on the invoice's value: the member's own credit paying most of it still earns the full month", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    t.stripe.balances.set(b.customer!, -27000);
    const inv = await t.paid(b.customer!);
    expect(inv.amountPaid).toBe(31640 - 27000);
    expect((await t.ledger())[0]).toMatchObject({ amount_cents: 28000, status: "posted" });
  });

  it("a USD referrer and a CAD payer at CA$280: US$200", async () => {
    const a = await t.member("ana@example.com", { currency: "USD" });
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    expect((await t.ledger())[0]).toMatchObject({ amount_cents: 20000, currency: "USD", status: "posted" });
  });

  it("only a subscription invoice earns", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!, { subscription: null });
    expect(await t.ledger()).toEqual([]);
    expect(await t.stage(b.referral)).toBe("trial");
  });

  it("a 100%-off first invoice earns nothing; the next invoice above 0 grants, once", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!, { exTax: 0 });
    expect(await t.ledger()).toEqual([]);
    expect(await t.stage(b.referral)).toBe("trial");
    await t.paid(b.customer!);
    await t.paid(b.customer!);
    expect(await t.ledger()).toHaveLength(1);
    expect(t.posts()).toHaveLength(1);
  });

  it("an invoice for a member with no referral never reads Stripe", async () => {
    const x = await t.member("xen@example.com");
    const inv = t.pay(x.customer!, { id: "in_x" });
    expect(await t.handle(t.event("invoice.paid", { id: inv.id, object: "invoice", customer: x.customer }))).toBe("ignored");
    expect(t.stripe.calls.filter((c) => c.startsWith("invoice:"))).toEqual([]);
  });

  it("the same invoice.paid delivered twice, as two events, or replayed by the reconcile gives one ledger row and one Stripe call", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const inv = t.pay(b.customer!, { id: "in_b1" });
    const e = t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }, "evt_paid", Math.floor(CREDIT_NOW.getTime() / 1000) - 7200);
    await reconcileEvents(t.query, async () => ({ events: [e], hasMore: false }), (x) => t.handle(x), { now: CREDIT_NOW });
    expect(await t.handle(e)).toBe("duplicate");
    expect(await t.handle(t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }))).toBe("handled");
    expect(await t.ledger()).toHaveLength(1);
    expect(t.posts()).toHaveLength(1);
    expect(t.sent).toHaveLength(1);
  });

  it("a referrer with no card gets a pending grant, which posts once when their card is saved, then comes off their first invoice", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    expect((await t.ledger())[0]).toMatchObject({ status: "pending_customer", amount_cents: 28000, currency: "CAD" });
    expect(t.posts()).toEqual([]);
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ posted: 0, failed: 0 });

    // The card is saved on the Payment page: the completion posts what was waiting.
    const gw = fakeGateway();
    await t.query(`update users set stripe_customer = 'cus_ana', consent_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
    const s = await gw.createEmbeddedSetupSession({ userId: a.id, customer: "cus_ana", currency: "CAD", returnUrl: "https://x.test" });
    await t.query(`update users set setup_session = $2 where id = $1`, [a.id, s.id]);
    gw.complete(s.id, "CA", "fp_ana_card");
    expect(await completeCardSetup(t.query, gw, s.id, { getSettings: async () => t.settings, now: CREDIT_NOW, credits: t.stripe, query: t.query, transport: t.transport, sleep: async () => {} })).toBe(
      "done",
    );
    expect((await t.ledger())[0]).toMatchObject({ status: "posted" });
    expect(t.stripe.credit("cus_ana")).toBe(28000);
    await postPendingCredits(t.query, t.deps());
    expect(t.posts()).toHaveLength(1);
    expect(t.pay("cus_ana", { id: "in_ana" }).amountPaid).toBe(3640);
  });

  it("a grant kept in the invoice's currency is converted when the referrer's card fixes theirs", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    await t.query(`update users set stripe_customer = 'cus_ana', currency = 'USD', trial_started_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
    await postPendingCredits(t.query, t.deps(), { userId: a.id });
    expect((await t.ledger())[0]).toMatchObject({ status: "posted", amount_cents: 20000, currency: "USD" });
    expect(t.stripe.credit("cus_ana")).toBe(20000);
  });

  it("recorded while v3.referralsOn is off is pending_switch with no Stripe call; switching it on posts it once", async () => {
    t.settings = REFERRALS_OFF;
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    expect((await t.ledger())[0]).toMatchObject({ status: "pending_switch" });
    expect(t.posts()).toEqual([]);
    await postPendingCredits(t.query, t.deps());
    expect(t.posts()).toEqual([]);
    t.settings = REFERRALS_ON;
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ posted: 1, failed: 0, emails: 1 });
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ posted: 0 });
    expect(t.posts()).toHaveLength(1);
    expect(t.sent.map((m) => m.to[0])).toEqual(["ana@example.com"]);
  });

  it("a lost answer replayed after Stripe forgot the key adopts the transaction, and caches the balance as it is now", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    t.stripe.loseNextAnswer();
    const inv = t.pay(b.customer!, { id: "in_b1" });
    const e = t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer });
    await expect(t.handle(e)).rejects.toThrow(/connection dropped/);
    expect((await t.ledger())[0]).toMatchObject({ status: "pending_customer", stripe_txn: null });
    // Meanwhile Ana's own invoice used CA$200 of the credit.
    t.pay(a.customer!, { id: "in_ana", exTax: 20000, tax: 0 });
    t.stripe.expireKeys();
    t.now = new Date(CREDIT_NOW.getTime() + 25 * 3_600_000);
    expect(await t.handle(e)).toBe("handled");
    expect(t.stripe.txns).toHaveLength(1);
    expect((await t.ledger())[0]).toMatchObject({ status: "posted", stripe_txn: t.stripe.txns[0].id });
    expect((await t.query<{ c: number }>(`select credit_balance_cents as c from users where id = $1`, [a.id]))[0].c).toBe(8000);
  });

  it("a failed Stripe call leaves the row unposted and the webhook failing; the retry posts with the same key", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    t.stripe.failNext();
    const inv = t.pay(b.customer!, { id: "in_b1" });
    const e = t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer });
    await expect(t.handle(e)).rejects.toThrow(/Stripe is down/);
    expect((await t.ledger())[0]).toMatchObject({ status: "pending_customer" });
    expect((await t.query<{ status: string }>(`select status from stripe_events where id = $1`, [e.id]))[0].status).toBe("failed");
    expect(await t.handle(e)).toBe("handled");
    expect(t.stripe.txns).toHaveLength(1);
    expect(t.stripe.credit(a.customer!)).toBe(28000);
  });

  it("an email failure after posting never fails the webhook; the sweep sends it, and gives up after the attempt cap", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    t.failMail = true;
    const inv = t.pay(b.customer!, { id: "in_b1" });
    expect(await t.handle(t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }))).toBe("handled");
    expect((await t.ledger())[0]).toMatchObject({ status: "posted" });
    let tried = 0;
    const counting = async (m: Parameters<typeof t.transport>[0]) => {
      if (m.to[0] === "ana@example.com") tried++;
      return t.transport(m);
    };
    await postPendingCredits(t.query, t.deps({ transport: counting }));
    await postPendingCredits(t.query, t.deps({ transport: counting }));
    expect(tried).toBeGreaterThan(0);
    expect(await t.query(`select status, attempts from notifications where kind = 'credit_earned'`)).toEqual([{ status: "skipped", attempts: 3 }]);
    const before = tried;
    t.failMail = false;
    await postPendingCredits(t.query, t.deps({ transport: counting }));
    expect(tried).toBe(before);

    // A healthy one: the sweep sends what the webhook could not.
    const c = await t.referred("cat@example.com", a.id);
    t.failMail = true;
    await t.paid(c.customer!);
    t.failMail = false;
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ emails: 1 });
  });

  it("a sponsored referred member gives no grant; a sponsored referrer's grant is lapsed ('sponsored')", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id, { sponsored: true });
    await t.paid(b.customer!);
    expect(await t.ledger()).toEqual([]);

    const s = await t.member("sam@example.com", { sponsored: true });
    const c = await t.referred("cat@example.com", s.id);
    await t.paid(c.customer!);
    expect(await t.ledger()).toEqual([expect.objectContaining({ kind: "grant", status: "lapsed", reason: "sponsored", offset_cents: 0 })]);
    expect(t.posts()).toEqual([]);
  });

  it("a referrer who became sponsored before their grant posted: it lapses ('sponsored'), never posted", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    const { testSponsor } = await import("@/test-helpers/pglite-db");
    await t.query(`update users set sponsor_id = $2 where id = $1`, [a.id, await testSponsor(t.query)]);
    await postPendingCredits(t.query, t.deps());
    expect((await t.ledger())[0]).toMatchObject({ status: "lapsed", reason: "sponsored" });
    expect(t.posts()).toEqual([]);
  });

  it("the same card as the referrer's at payment voids the referral and grants nothing", async () => {
    const a = await t.member("ana@example.com", { fingerprint: "fp_shared" });
    const b = await t.referred("ben@example.com", a.id, { fingerprint: "fp_shared" });
    await t.paid(b.customer!);
    expect(await t.ledger()).toEqual([]);
    expect(await t.stage(b.referral)).toBe("void");
  });

  it("a deleted referrer or a closed one gets nothing; the referral still moves to paying", async () => {
    const b = await t.referred("ben@example.com", null);
    await t.paid(b.customer!);
    const c = await t.member("cat@example.com", { status: "closed" });
    const d = await t.referred("dan@example.com", c.id);
    await t.paid(d.customer!);
    expect(await t.ledger()).toEqual([]);
    expect([await t.stage(b.referral), await t.stage(d.referral)]).toEqual(["paying", "paying"]);
  });

  it("the stage guard and the lease hold when the same invoice races itself", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    const inv = t.pay(b.customer!, { id: "in_b1" });
    const events = [1, 2, 3].map(() => t.event("invoice.paid", { id: inv.id, object: "invoice", customer: b.customer }));
    const first = await Promise.allSettled(events.map((e) => t.handle(e)));
    for (const [i, r] of first.entries()) if (r.status === "rejected") await t.handle(events[i]);
    expect(await t.ledger()).toHaveLength(1);
    expect(t.stripe.credit(a.customer!)).toBe(28000);
  });

  it("two grants for one referrer at once never use the same shortfall twice", async () => {
    const a = await t.member("ana@example.com");
    // Ana owes CA$200 from an earlier clawback.
    await t.query(
      `insert into credits (user_id, kind, amount_cents, uncollected_cents, currency, status, source_object_id) values ($1, 'clawback', 20000, 20000, 'CAD', 'posted', 're_old')`,
      [a.id],
    );
    const b = await t.referred("ben@example.com", a.id);
    const c = await t.referred("cat@example.com", a.id);
    const events = [b, c].map((m) => t.event("invoice.paid", { id: t.pay(m.customer!).id, object: "invoice", customer: m.customer }));
    const first = await Promise.allSettled(events.map((e) => t.handle(e)));
    for (const [i, r] of first.entries()) if (r.status === "rejected") await t.handle(events[i]);
    const grants = (await t.ledger()).filter((r) => r.kind === "grant");
    expect(grants).toHaveLength(2);
    expect(grants.reduce((n, g) => n + g.offset_cents, 0)).toBe(20000);
    expect(t.stripe.credit(a.customer!)).toBe(56000 - 20000);
  });
});

describe("late attribution", () => {
  it("a referral recorded after the member's first invoice was paid still grants, once", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.member("ben@example.com", { status: "active" });
    t.pay(b.customer!, { id: "in_b1" });
    await t.query(`update users set pending_referrer_id = $2 where id = $1`, [b.id, a.id]);
    const task = HOURLY_TASKS.find((x) => x.name === "referral_pending")!;
    const hd = { now: CREDIT_NOW, settings: t.settings, credits: t.stripe, query: t.query, transport: t.transport, sleep: async () => {} } as unknown as HourlyDeps;
    expect(await task.run(t.query, hd, { deadline: Date.now() + 60_000 })).toEqual({ done: 1, failed: 0 });
    expect(await task.run(t.query, hd, { deadline: Date.now() + 60_000 })).toEqual({ done: 0, failed: 0 });
    expect(await t.ledger()).toEqual([expect.objectContaining({ kind: "grant", amount_cents: 28000, status: "posted" })]);
    expect(t.posts()).toHaveLength(1);
  });

  it("a late grant that fails is retried by the hourly late-grant sweep, and granted exactly once", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id, { status: "active" });
    t.pay(b.customer!, { id: "in_b1" });
    const spy = vi.spyOn(t.stripe, "paidInvoices").mockRejectedValueOnce(new Error("Stripe is down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await grantLateReferrals(t.query, t.deps())).toEqual({ granted: 0, none: 0, failed: 1, busy: 0 });
    // Too soon to try again in the same hour.
    expect(await grantLateReferrals(t.query, t.deps())).toEqual({ granted: 0, none: 0, failed: 0, busy: 0 });
    const later = t.deps({ now: new Date(CREDIT_NOW.getTime() + 3_600_000) });
    expect(await grantLateReferrals(t.query, later)).toEqual({ granted: 1, none: 0, failed: 0, busy: 0 });
    expect(await grantLateReferrals(t.query, t.deps({ now: new Date(CREDIT_NOW.getTime() + 3 * 86_400_000) }))).toEqual({ granted: 0, none: 0, failed: 0, busy: 0 });
    errors.mockRestore();
    spy.mockRestore();
    expect((await t.ledger()).filter((r) => r.kind === "grant")).toHaveLength(1);
    expect(t.posts()).toHaveLength(1);
  });

  it("the late-grant sweep gives up after its cap and tells admins once", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id, { status: "active" });
    vi.spyOn(t.stripe, "paidInvoices").mockRejectedValue(new Error("Stripe is down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < LATE_GRANT_ATTEMPTS + 2; i++) await grantLateReferrals(t.query, t.deps({ now: new Date(CREDIT_NOW.getTime() + i * 3_600_000) }));
    errors.mockRestore();
    expect((await t.query<{ n: number }>(`select grant_attempts as n from referrals where id = $1`, [b.referral]))[0].n).toBe(LATE_GRANT_ATTEMPTS);
    const alerts = t.sent.filter((m) => m.subject.includes("could not be granted"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain(`/admin/users/${b.id}`);
  });

  it("the pending retry gives up on a row after its attempt cap, telling admins once, so newer rows still run", async () => {
    const a = await t.member("ana@example.com");
    const [stuck] = await t.query<{ id: string }>(`insert into users (email, pending_referrer_id, created_at) values ('old@example.com', $1, '2026-01-01') returning id`, [a.id]);
    const real = t.query;
    const failing = (async (text: string, params?: unknown[]) => {
      if (text.includes("update users set referred_by") && params?.[0] === stuck.id) throw new Error("bad row");
      return real(text, params);
    }) as Query;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < REFERRAL_RETRY_ATTEMPTS; i++) expect(await retryPendingReferrals(failing, CREDIT_NOW, 1, { mail: { transport: t.transport } })).toEqual({ done: 0, failed: 1 });
    const [fresh] = await t.query<{ id: string }>(`insert into users (email, pending_referrer_id) values ('new@example.com', $1) returning id`, [a.id]);
    expect(await retryPendingReferrals(failing, CREDIT_NOW, 1, { mail: { transport: t.transport } })).toEqual({ done: 1, failed: 0 });
    errors.mockRestore();
    expect((await t.query<{ r: string | null }>(`select referred_by as r from users where id = $1`, [fresh.id]))[0].r).toBe(a.id);
    const alerts = t.sent.filter((m) => m.subject.includes("could not be recorded"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain(`/admin/users/${stuck.id}`);
  });
});

describe("the posting sweep", () => {
  it("rows that keep failing never starve a postable one", async () => {
    const stuck = await t.member("stuck@example.com");
    const ok = await t.member("ok@example.com");
    const old = new Date(CREDIT_NOW.getTime() - 86_400_000).toISOString();
    await t.query(
      `insert into credits (user_id, kind, amount_cents, currency, status, source_object_id, created_at, updated_at)
       select $1, 'lapse', 100, 'CAD', 'pending_customer', 'close:' || g, $2, $2 from generate_series(1, 201) g`,
      [stuck.id, old],
    );
    await t.query(
      `insert into credits (user_id, kind, amount_cents, currency, status, source_object_id, created_at, updated_at) values ($1, 'lapse', 100, 'CAD', 'pending_customer', 'close:ok', $2, $3)`,
      [ok.id, old, new Date(CREDIT_NOW.getTime() - 3_600_000).toISOString()],
    );
    // Both have referral credit to take back, so each lapse needs a Stripe call.
    for (const m of [stuck, ok]) {
      await t.query(`insert into credits (user_id, kind, amount_cents, currency, status, posted_at) values ($1, 'grant', 1000000, 'CAD', 'posted', $2)`, [m.id, old]);
      t.stripe.balances.set(m.customer!, -1000000);
    }
    t.stripe.failing.add(stuck.customer!);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ posted: 0, failed: 200 });
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ posted: 1 });
    errors.mockRestore();
    expect(t.stripe.txns.map((x) => x.customer)).toEqual([ok.customer]);
  });

  it("only selects grants that can post now: a referrer with no card is not even tried", async () => {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    const spy = vi.spyOn(t.stripe, "findBalanceTransaction");
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ posted: 0, waiting: 0 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("a clawback or lapse for a member with no Stripe customer is settled as 'no_customer', with nothing posted", async () => {
    const a = await t.member("ana@example.com", { card: false });
    await t.query(`insert into credits (user_id, kind, amount_cents, currency, status, source_object_id) values ($1, 'clawback', 500, 'CAD', 'pending_customer', 're_x')`, [a.id]);
    await postPendingCredits(t.query, t.deps());
    expect((await t.ledger())[0]).toMatchObject({ status: "posted", reason: "no_customer", uncollected_cents: 500 });
    expect(t.posts()).toEqual([]);
  });
});

describe("the hourly tasks", () => {
  const names = ["referral_credits", "referral_late_grants", "referral_credit_lapse"];

  it("include and run the credit tasks with a credits gateway, and say Stripe is not set up without one", async () => {
    const tasks = HOURLY_TASKS.filter((x) => names.includes(x.name));
    expect(tasks.map((x) => x.name)).toEqual(names);
    const base = { now: CREDIT_NOW, settings: t.settings, query: t.query, transport: t.transport, sleep: async () => {} };
    const ctx = { deadline: Date.now() + 60_000 };
    for (const task of tasks) {
      expect(await task.run(t.query, { ...base, credits: null } as unknown as HourlyDeps, ctx)).toBe("Stripe is not set up.");
      expect(await task.run(t.query, { ...base, credits: t.stripe } as unknown as HourlyDeps, ctx)).toEqual(expect.any(Object));
    }
  });
});

describe("round 2", () => {
  it("a busy referrer is not a failure of the late grant: retried next pass, not counted", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id, { status: "active" });
    t.pay(b.customer!, { id: "in_b1" });
    await t.query(`insert into leases (name, holder, until) values ($1, 'other', now() + interval '5 minutes')`, [`credit:${a.id}`]);
    expect(await grantLateReferrals(t.query, t.deps())).toEqual({ granted: 0, none: 0, failed: 0, busy: 1 });
    expect((await t.query<{ n: number }>(`select grant_attempts as n from referrals where id = $1`, [b.referral]))[0].n).toBe(0);
    await t.query(`delete from leases`);
    expect(await grantLateReferrals(t.query, t.deps())).toMatchObject({ granted: 1 });
  });

  it("an offset used by a grant that lapsed before posting is owed again", async () => {
    const a = await t.member("ana@example.com");
    await t.query(
      `insert into credits (user_id, kind, amount_cents, uncollected_cents, currency, status, source_object_id) values ($1, 'clawback', 20000, 20000, 'CAD', 'posted', 're_old')`,
      [a.id],
    );
    await t.query(`insert into credits (user_id, kind, amount_cents, offset_cents, currency, status, reason) values ($1, 'grant', 8000, 20000, 'CAD', 'lapsed', 'account_closed')`, [a.id]);
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    expect((await t.ledger()).find((r) => r.kind === "grant" && r.status === "posted")).toMatchObject({ amount_cents: 8000, offset_cents: 20000 });
  });
});
