import { beforeEach, describe, expect, it, vi } from "vitest";
import { creditScenario, CREDIT_NOW } from "@/test-helpers/credit-scenario";
import { creditBalance, CreditBusy, LEASE_WORK_MS, refreshStaleBalances, withBalanceLease, writeBalanceCache } from "./credit-balance";
import { postPendingCredits } from "./credit-post";

/** B2 plan Unit 4: the member's balance lease and the cached balance pages read. */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let t: Awaited<ReturnType<typeof creditScenario>>;
beforeEach(async () => {
  t = await creditScenario();
});

const at = (h: number) => new Date(CREDIT_NOW.getTime() + h * 3_600_000);

describe("the cached balance", () => {
  it("is read through creditBalance as positive credit with when it was read; never written over by an older reading", async () => {
    const a = await t.member("ana@example.com");
    expect(await creditBalance(t.query, a.id)).toBeNull();
    await writeBalanceCache(t.query, a.id, 5000, at(2));
    await writeBalanceCache(t.query, a.id, 9000, at(1));
    expect(await creditBalance(t.query, a.id)).toEqual({ cents: 5000, currency: "CAD", asOf: at(2) });
    await writeBalanceCache(t.query, a.id, 7000, at(3));
    expect((await creditBalance(t.query, a.id))?.cents).toBe(7000);
  });

  it("heals itself: a member whose cache is older than their last posted row is read again by the sweep", async () => {
    const a = await t.member("ana@example.com");
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    // The cache write after the post was lost.
    await t.query(`update users set credit_balance_cents = null, credit_balance_at = null where id = $1`, [a.id]);
    expect(await refreshStaleBalances(t.query, t.deps())).toBe(1);
    expect(await creditBalance(t.query, a.id)).toEqual({ cents: 28000, currency: "CAD", asOf: CREDIT_NOW });
    expect(await refreshStaleBalances(t.query, t.deps())).toBe(0);
    await t.query(`update users set credit_balance_at = $2 where id = $1`, [a.id, at(-1).toISOString()]);
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ refreshed: 1 });
  });
});

describe("the balance lease", () => {
  it("lets one change at a time per member, is re-entrant for the holder, and is released after", async () => {
    const a = await t.member("ana@example.com");
    const inner = await withBalanceLease(t.query, t.deps(), a.id, async (d) => {
      await expect(withBalanceLease(t.query, t.deps(), a.id, async () => "other")).rejects.toBeInstanceOf(CreditBusy);
      return withBalanceLease(t.query, d, a.id, async () => "nested");
    });
    expect(inner).toBe("nested");
    expect(await withBalanceLease(t.query, t.deps(), a.id, async () => "again")).toBe("again");
    expect(await t.query(`select name from leases`)).toEqual([]);
  });
});

describe("the lease's guard on Stripe writes (round 2)", () => {
  async function waiting() {
    const a = await t.member("ana@example.com", { card: false });
    const b = await t.referred("ben@example.com", a.id);
    await t.paid(b.customer!);
    await t.query(`update users set stripe_customer = 'cus_ana', currency = 'CAD', trial_started_at = $2 where id = $1`, [a.id, CREDIT_NOW.toISOString()]);
  }

  it("stops with CreditBusy, nothing posted, once the lease has been held too long", async () => {
    await waiting();
    let ms = 1_000_000;
    const real = t.stripe.findBalanceTransaction.bind(t.stripe);
    vi.spyOn(t.stripe, "findBalanceTransaction").mockImplementation(async (...args) => {
      ms += LEASE_WORK_MS + 1;
      return real(...args);
    });
    expect(await postPendingCredits(t.query, t.deps({ clock: () => ms }))).toMatchObject({ posted: 0, busy: 1 });
    expect(t.posts()).toEqual([]);
    expect((await t.ledger())[0]).toMatchObject({ status: "pending_customer" });
    expect(await t.query(`select name from leases`)).toEqual([]);
  });

  it("stops with CreditBusy when the lease was lost to someone else", async () => {
    await waiting();
    vi.spyOn(t.stripe, "findBalanceTransaction").mockImplementation(async () => {
      await t.query(`update leases set holder = 'someone-else'`);
      return null;
    });
    expect(await postPendingCredits(t.query, t.deps())).toMatchObject({ posted: 0, busy: 1 });
    expect(t.posts()).toEqual([]);
  });
});
