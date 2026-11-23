import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeAdjustments } from "@/test-helpers/fake-adjustments";
import { testDb } from "@/test-helpers/pglite-db";
import { reconcilePendingItems } from "./reconcile";

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
});
