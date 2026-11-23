import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeFailedWeekOrders } from "@/lib/billing/orders";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { chargeAndSendNow } from "./cora";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const WEEK = "2026-12-14";
/** Monday 2026-12-14, 7:05 AM Toronto: after both the charge and the send times. */
const SEVEN_AM = new Date("2026-12-14T12:05:00Z");
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
let creates: string[];
const gw: BillingGateway = {
  preview: async () => ({ totalCents: 23000, currency: "USD" }),
  subscriptions: async () => [],
  createSubscription: async ({ claimId }) => {
    creates.push(claimId);
    return { kind: "succeeded", object: "sub_new", amountCents: 23000, currency: "USD" };
  },
};
const deps = (s = settings) => ({ gw, settings: s, now: SEVEN_AM, query, transport, sleep: async () => {} });
let uid: string;
const delivered = async () => (await query("select 1 from picks where user_id = $1 and delivered_at is not null", [uid])).length;

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  creates = [];
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_HIGHER_USD", "price_monthly_higher_usd");
  // A trial member whose third list (the first paid one) is waiting this week.
  [{ id: uid }] = await query<{ id: string }>(
    "insert into users (email, status, plan, currency, sharing, stripe_customer, free_lists_used, quote) values ('ana@example.com', 'trial', 'monthly', 'USD', 'share', 'cus_1', 2, $1) returning id",
    [JSON.stringify({ totalCents: 23000, currency: "USD", week: WEEK, price: "price_monthly_usd" })],
  );
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [uid, WEEK]);
  for (let i = 1; i <= 3; i++) {
    const [{ id }] = await query<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ($1, 'Sales', 'd', 'p', 'i', $2, $2) returning id",
      [`Play ${i}`, WEEK],
    );
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, 'Fits.')", [uid, WEEK, i, id]);
  }
});

describe("Charge and send now", () => {
  it("on a week that is not ready does nothing and says why", async () => {
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'running', 'merged')", [WEEK]);
    const r = await chargeAndSendNow(query, deps(), WEEK);
    expect(r).toEqual({ done: false, reason: "Cora is still working on this week (phase: merged)." });
    await query("update cora_weeks set status = 'failed'");
    expect(await chargeAndSendNow(query, deps(), WEEK)).toMatchObject({ done: false, reason: expect.stringMatching(/failed/) });
    await query("delete from cora_weeks");
    expect(await chargeAndSendNow(query, deps(), WEEK)).toMatchObject({ done: false, reason: "Cora hasn’t started this week." });
    await query("insert into cora_weeks (week_of, status, phase, dry_run) values ($1, 'ready', 'ready', true)", [WEEK]);
    expect(await chargeAndSendNow(query, deps(), WEEK)).toMatchObject({ done: false, reason: expect.stringMatching(/dry run/) });
    expect(creates).toEqual([]);
    expect(await delivered()).toBe(0);
    expect(sent).toEqual([]);
  });

  it("does nothing while the cycle is not live", async () => {
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
    expect(await chargeAndSendNow(query, deps(mergeV3([])), WEEK)).toMatchObject({ done: false });
    expect(creates).toEqual([]);
  });

  it("before the charge time does nothing, and between charge and send charges but reports the send as not done", async () => {
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
    // 5:30 AM Toronto.
    const early = await chargeAndSendNow(query, { ...deps(), now: new Date("2026-12-14T10:30:00Z") }, WEEK);
    expect(early).toMatchObject({ done: false, reason: expect.stringMatching(/^Before/) });
    expect(creates).toEqual([]);
    // 6:30 AM: the charge runs, the send waits for 7:00.
    const between = await chargeAndSendNow(query, { ...deps(), now: new Date("2026-12-14T11:30:00Z") }, WEEK);
    expect(between).toMatchObject({ done: false, reason: expect.stringMatching(/^Before/), charge: { status: "done" }, send: { status: "skipped" } });
    expect(creates).toHaveLength(1);
    expect(await delivered()).toBe(0);
  });

  it("on a ready week charges before it sends, so the paid third list goes out", async () => {
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
    const r = await chargeAndSendNow(query, deps(), WEEK);
    expect(r).toMatchObject({ done: true, charge: { status: "done", first: { charged: 1 } }, send: { status: "done", delivered: 1 } });
    expect(creates).toHaveLength(1);
    // Sending first would have found the list unpaid and held it back.
    expect(await delivered()).toBe(3);
    expect((await query<{ status: string }>("select status from users"))[0].status).toBe("active");
    expect((await query<{ status: string }>("select status from cora_weeks"))[0].status).toBe("sent");
  });
});

describe("orders in a failed week (Unit 12b leftover)", () => {
  it("are closed with no list and no charge, the member told once; other weeks are left alone", async () => {
    await query("update users set plan = 'per_run', status = 'active'");
    await query("insert into cora_weeks (week_of, status, phase, error) values ($1, 'failed', 'merged', 'noon')", [WEEK]);
    await query("insert into cora_weeks (week_of, status, phase) values ('2026-12-21', 'running', 'started')");
    await query("insert into orders (user_id, week_of) values ($1, $2), ($1, '2026-12-21')", [uid, WEEK]);
    expect(await closeFailedWeekOrders(query, { query, transport, sleep: async () => {} })).toBe(1);
    expect(await closeFailedWeekOrders(query, { query, transport, sleep: async () => {} })).toBe(0);
    expect(await query("select to_char(week_of, 'YYYY-MM-DD') as week, status from orders order by week_of")).toEqual([
      { week: WEEK, status: "no_run" },
      { week: "2026-12-21", status: "ordered" },
    ]);
    expect(sent.map((m) => m.subject)).toEqual(["No list this week, and no charge"]);
  });
});
