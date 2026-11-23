import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { runHourly } from "@/lib/housekeeping/job";
import { runChargeJob } from "./charge-job";
import { chargeFirst, retryNow, type ChargeDeps } from "./first-charge";
import type { BillingGateway, ChargeResult, FoundSubscription } from "./subscriptions";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const WEEK = "2026-12-14";
// Monday 2026-12-14, 6:05 AM Toronto (EST) = 11:05 UTC.
const SIX_AM = new Date("2026-12-14T11:05:00Z");
const at = (iso: string) => new Date(iso);
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);

/** A fake Stripe: subscriptions per customer, scripted outcomes, every create recorded with its key. */
function fakeStripe() {
  const subs = new Map<string, FoundSubscription[]>();
  const keys: string[] = [];
  const script: (ChargeResult | "crash_after" | "crash_before")[] = [];
  let total = 23000;
  const gw: BillingGateway & { subs: typeof subs; keys: string[]; script: typeof script; setTotal(n: number): void; count(): number } = {
    subs,
    keys,
    script,
    setTotal: (n) => (total = n),
    count: () => [...subs.values()].flat().length,
    async preview() {
      return { totalCents: total, currency: "USD" };
    },
    async subscriptions(customer) {
      return subs.get(customer) ?? [];
    },
    async createSubscription({ customer, claimId, idempotencyKey }) {
      keys.push(idempotencyKey);
      const next = script.shift() ?? { kind: "succeeded", object: "", amountCents: total, currency: "USD" };
      if (next === "crash_before") throw new Error("process died before Stripe");
      // Stripe replays an idempotent create: the same key never makes a second subscription.
      const existing = (subs.get(customer) ?? []).find((s) => s.claimId === claimId);
      if (next === "crash_after" || next.kind === "succeeded") {
        const s = existing ?? { id: `sub_${claimId.slice(0, 6)}_${keys.length}`, status: "active", claimId };
        if (!existing) subs.set(customer, [...(subs.get(customer) ?? []), s]);
        if (next === "crash_after") throw new Error("process died after Stripe");
        return { kind: "succeeded", object: s.id, amountCents: total, currency: "USD" };
      }
      return next;
    },
  };
  return gw;
}

let gw: ReturnType<typeof fakeStripe>;
const deps = (now = SIX_AM, o: Partial<ChargeDeps> = {}): ChargeDeps => ({ gw, settings, now, query, transport, sleep: async () => {}, ...o });
const user = async () => (await query<{ status: string; hold_reason: string | null; stripe_subscription: string | null }>("select status, hold_reason, stripe_subscription from users where id = $1", [uid]))[0];
const attempts = () => query<{ attempt: number; outcome: string }>("select attempt, outcome from charge_attempts order by attempt");
const subjects = () => sent.map((m) => m.subject);
let uid: string;

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_HIGHER_USD", "price_monthly_higher_usd");
  gw = fakeStripe();
  [{ id: uid }] = await query<{ id: string }>(
    "insert into users (email, status, plan, currency, sharing, stripe_customer, free_lists_used, quote) values ('ana@example.com', 'trial', 'monthly', 'USD', 'share', 'cus_1', 2, $1) returning id",
    [JSON.stringify({ totalCents: 23000, currency: "USD", price: "price_monthly_usd" })],
  );
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [uid, WEEK]);
});

describe("the Monday charge job", () => {
  it("charges a trial user with two free lists and a ready third once: active, one receipt (spec check 19)", async () => {
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ status: "done", first: { charged: 1 } });
    expect(await user()).toMatchObject({ status: "active", hold_reason: null });
    expect(gw.count()).toBe(1);
    expect(subjects()).toEqual(["You’re subscribed"]);
  });

  it("charges once when run twice in the same minute", async () => {
    await Promise.all([runChargeJob(query, deps(), { week: WEEK }), runChargeJob(query, deps(), { week: WEEK })]);
    await runChargeJob(query, deps(), { week: WEEK });
    expect(gw.count()).toBe(1);
    expect(gw.keys).toHaveLength(1);
  });

  it("charges nobody before the charge time, on a week Cora has not finished, or with the cycle off", async () => {
    expect(await runChargeJob(query, deps(at("2026-12-14T10:55:00Z")), { week: WEEK })).toMatchObject({ status: "skipped" });
    expect(await runChargeJob(query, deps(SIX_AM, { settings: mergeV3([]) }), { week: WEEK })).toMatchObject({ status: "skipped" });
    await query("update cora_weeks set status = 'running'");
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ status: "skipped" });
    expect(gw.keys).toEqual([]);
  });

  it("does not charge a trial user with only one delivered list", async () => {
    await query("update users set free_lists_used = 1");
    await runChargeJob(query, deps(), { week: WEEK });
    expect(gw.keys).toEqual([]);
  });

  it("charges a two-idea third list in full (R14); a week with no eligible plays charges nothing and moves the date", async () => {
    await query("update cora_user_weeks set outcome = 'short', picked_count = 2");
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ first: { charged: 1 } });
    const [{ id: other }] = await query<{ id: string }>(
      "insert into users (email, status, plan, currency, stripe_customer, free_lists_used) values ('bo@example.com', 'trial', 'monthly', 'USD', 'cus_2', 2) returning id",
    );
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, $2, 'none')", [other, WEEK]);
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ dateMoved: 1 });
    expect(gw.subs.get("cus_2")).toBeUndefined();
    expect(subjects()).toContain("Your first charge moved");
  });

  it("finds a trial user's cancellation inside the claim, and charges nothing", async () => {
    await query("update users set cancel_requested_at = now()");
    await runChargeJob(query, deps(), { week: WEEK });
    expect(gw.keys).toEqual([]);
    expect(await attempts()).toEqual([]);
  });

  it("refuses to create a subscription when the customer already has a live one", async () => {
    gw.subs.set("cus_1", [{ id: "sub_old", status: "active", claimId: null }]);
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("error");
    expect(gw.keys).toEqual([]);
    expect(subjects()).toEqual(["[Roger] A first charge found a live subscription"]);
  });
});

describe("crashes and unknown outcomes", () => {
  it("after Stripe created the subscription but before recording: taken over after 15 minutes, found by claim id, one subscription", async () => {
    gw.script.push("crash_after");
    await expect(chargeFirst(query, deps(), uid, WEEK)).rejects.toThrow("process died after Stripe");
    expect(await attempts()).toEqual([{ attempt: 1, outcome: "claimed" }]);
    await runHourly(query, deps(at("2026-12-14T11:10:00Z")));
    expect(await attempts()).toEqual([{ attempt: 1, outcome: "claimed" }]); // not yet: under 15 minutes
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    await runHourly(query, deps(at("2026-12-14T12:00:00Z")));
    expect(await attempts()).toEqual([{ attempt: 1, outcome: "succeeded" }]);
    expect(gw.count()).toBe(1);
    expect(gw.keys).toHaveLength(1); // found, not called again
    expect(await user()).toMatchObject({ status: "active" });
  });

  it("before Stripe was reached: takeover repeats the call with the same attempt and key; one subscription", async () => {
    gw.script.push("crash_before");
    await expect(chargeFirst(query, deps(), uid, WEEK)).rejects.toThrow("before Stripe");
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    await runHourly(query, deps(at("2026-12-14T12:00:00Z")));
    expect(gw.keys).toHaveLength(2);
    expect(gw.keys[0]).toBe(gw.keys[1]);
    expect(await attempts()).toEqual([{ attempt: 1, outcome: "succeeded" }]);
    expect(gw.count()).toBe(1);
  });

  it("never records an unknown outcome as a decline, so it never moves to a new attempt number", async () => {
    gw.script.push({ kind: "unknown", error: "timeout" });
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("unknown");
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("open");
    expect(await attempts()).toEqual([{ attempt: 1, outcome: "unknown" }]);
    expect(await user()).toMatchObject({ status: "trial" });
  });
});

describe("declines and retries (spec check 22)", () => {
  it("holds on a decline, emails an update-card link, and retries on days 1, 3 and 7; success on day 3 makes the user active", async () => {
    gw.script.push({ kind: "declined", code: "insufficient_funds", hard: false }, { kind: "declined", code: "insufficient_funds", hard: false });
    await runChargeJob(query, deps(), { week: WEEK });
    expect(await user()).toMatchObject({ status: "held", hold_reason: "first_charge_failed" });
    expect(sent[0].text).toContain("/app/billing");
    expect(sent[0].text).toContain("Tuesday, December 15");
    // Nothing before day 1; day 1 fails; day 3 succeeds.
    await runHourly(query, deps(at("2026-12-15T10:00:00Z")));
    expect(gw.keys).toHaveLength(1);
    await runHourly(query, deps(at("2026-12-15T11:05:00Z")));
    expect(gw.keys).toHaveLength(2);
    await runHourly(query, deps(at("2026-12-17T11:05:00Z")));
    expect(await attempts()).toEqual([
      { attempt: 1, outcome: "declined" },
      { attempt: 2, outcome: "declined" },
      { attempt: 3, outcome: "succeeded" },
    ]);
    expect(await user()).toMatchObject({ status: "active" });
    expect(new Set(gw.keys).size).toBe(3);
  });

  it("closes the trial on day 7 when every retry fails, with nothing charged and one closing email", async () => {
    for (let i = 0; i < 4; i++) gw.script.push({ kind: "declined", code: "insufficient_funds", hard: false });
    await runChargeJob(query, deps(), { week: WEEK });
    for (const t of ["2026-12-15T11:05:00Z", "2026-12-17T11:05:00Z", "2026-12-21T11:05:00Z", "2026-12-21T12:05:00Z"]) await runHourly(query, deps(at(t)));
    expect((await attempts()).map((a) => a.outcome)).toEqual(["declined", "declined", "declined", "declined"]);
    expect(await user()).toMatchObject({ status: "closed" });
    expect(gw.count()).toBe(0);
    expect(subjects().filter((s) => s === "Your Roger trial has closed")).toHaveLength(1);
  });

  it("gives a hard decline no retries, and still closes the trial on day 7", async () => {
    gw.script.push({ kind: "declined", code: "stolen_card", hard: true });
    await runChargeJob(query, deps(), { week: WEEK });
    await runHourly(query, deps(at("2026-12-15T11:05:00Z")));
    await runHourly(query, deps(at("2026-12-17T11:05:00Z")));
    expect(gw.keys).toHaveLength(1);
    await runHourly(query, deps(at("2026-12-20T11:05:00Z")));
    expect(await user()).toMatchObject({ status: "held" });
    await runHourly(query, deps(at("2026-12-21T11:05:00Z")));
    expect(await user()).toMatchObject({ status: "closed" });
  });

  it("tries at once, with a new attempt number, when a declined card is replaced", async () => {
    gw.script.push({ kind: "declined", code: "stolen_card", hard: true });
    await runChargeJob(query, deps(), { week: WEEK });
    expect(await retryNow(query, deps(at("2026-12-16T15:00:00Z")), uid)).toBe("charged");
    expect(await attempts()).toEqual([
      { attempt: 1, outcome: "hard_declined" },
      { attempt: 2, outcome: "succeeded" },
    ]);
  });
});

describe("tax and amount checks", () => {
  it("alerts admins, not the user, when Stripe rejects the tax address", async () => {
    gw.script.push({ kind: "tax_address", error: "customer_tax_location_invalid" });
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("error");
    expect(subjects()).toEqual(["[Roger] Stripe couldn't work out tax for a customer's address"]);
    // Held for an admin to fix, and never tried again on its own (no loop every ten minutes).
    expect(await user()).toMatchObject({ status: "held", hold_reason: "first_charge_failed" });
    await runChargeJob(query, deps(at("2026-12-14T11:15:00Z")), { week: WEEK });
    await runHourly(query, deps(at("2026-12-15T11:05:00Z")));
    expect(gw.keys).toHaveLength(1);
  });

  it("holds the user when the amount differs from the quote, tells them, and charges 24 hours later (spec check 21)", async () => {
    gw.setTotal(25000);
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("held_amount");
    expect(gw.keys).toEqual([]);
    expect(await user()).toMatchObject({ status: "held", hold_reason: "amount_changed" });
    expect(subjects()).toEqual(["Your first charge amount changed", "[Roger] A first charge amount changed"]);
    await runHourly(query, deps(at("2026-12-15T10:00:00Z")));
    expect(gw.keys).toEqual([]);
    await runHourly(query, deps(at("2026-12-15T11:10:00Z")));
    expect(gw.keys).toHaveLength(1);
    expect(await user()).toMatchObject({ status: "active" });
  });

  it("charges the higher rate to a monthly member whose Zack doesn't share", async () => {
    await query("update users set sharing = 'match_only', quote = null");
    const calls: string[] = [];
    const spy = { ...gw, createSubscription: async (o: Parameters<BillingGateway["createSubscription"]>[0]) => (calls.push(o.price), gw.createSubscription(o)) };
    await chargeFirst(query, deps(SIX_AM, { gw: spy }), uid, WEEK);
    expect(calls).toEqual(["price_monthly_higher_usd"]);
  });
});

describe("review follow-ups (12a)", () => {
  it("treats a card that needs the bank's confirmation as a soft decline, never an error", async () => {
    const { classify } = await import("./subscriptions");
    expect(classify(Object.assign(new Error("This payment requires additional user action"), { code: "subscription_payment_intent_requires_action" }))).toEqual({
      kind: "declined",
      code: "subscription_payment_intent_requires_action",
      hard: false,
    });
    expect(classify(new Error("socket hang up"))).toMatchObject({ kind: "unknown" });
  });

  it("prices from sharing as it stood at the Sunday cutoff: a Monday-morning switch changes nothing this week", async () => {
    await query("update users set sharing = 'match_only'");
    await query("insert into zack_settings_history (user_id, sharing, plays_per_week) values ($1, 'match_only', 4)", [uid]);
    await query("update zack_settings_history set changed_at = '2026-12-14T10:30:00Z'");
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("charged");
  });

  it("keeps retrying on schedule after a charge held for a changed amount is declined", async () => {
    gw.setTotal(25000);
    await chargeFirst(query, deps(), uid, WEEK);
    gw.script.push({ kind: "declined", code: "insufficient_funds", hard: false });
    await runHourly(query, deps(at("2026-12-15T11:10:00Z")));
    expect(await user()).toMatchObject({ status: "held", hold_reason: "first_charge_failed" });
    await runHourly(query, deps(at("2026-12-17T11:05:00Z")));
    expect(await attempts()).toEqual([
      { attempt: 1, outcome: "declined" },
      { attempt: 2, outcome: "succeeded" },
    ]);
  });

  it("never closes a trial while a charge is in flight", async () => {
    gw.script.push({ kind: "declined", code: "stolen_card", hard: true }, { kind: "unknown", error: "timeout" });
    await runChargeJob(query, deps(), { week: WEEK });
    await retryNow(query, deps(at("2026-12-21T11:00:00Z")), uid);
    await runHourly(query, deps(at("2026-12-21T11:05:00Z")));
    expect(await user()).toMatchObject({ status: "held" });
  });

  it("takeover creates nothing for a user who cancelled meanwhile, and never re-creates a subscription its claim already made", async () => {
    gw.script.push("crash_before");
    await expect(chargeFirst(query, deps(), uid, WEEK)).rejects.toThrow();
    await query("update users set cancel_requested_at = now()");
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    await runHourly(query, deps(at("2026-12-14T12:00:00Z")));
    expect(gw.keys).toHaveLength(1);
    expect(await attempts()).toEqual([{ attempt: 1, outcome: "error" }]);
  });

  it("alerts admins when a charge succeeds for a user who was closed meanwhile, and the repair pass activates a paid user left held", async () => {
    gw.script.push("crash_after");
    await expect(chargeFirst(query, deps(), uid, WEEK)).rejects.toThrow();
    await query("update users set status = 'closed'");
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    await runHourly(query, deps(at("2026-12-14T12:00:00Z")));
    expect(subjects()).toContain("[Roger] A first charge succeeded for a user who is no longer in trial");
    // A paid claim whose user is held (an older crash): the repair pass makes them active.
    await query("update users set status = 'held', hold_reason = 'first_charge_failed', stripe_subscription = null");
    await runHourly(query, deps(at("2026-12-14T13:00:00Z")));
    expect(await user()).toMatchObject({ status: "active" });
  });
});
