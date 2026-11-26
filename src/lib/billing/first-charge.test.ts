import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { runHourly } from "@/lib/housekeeping/job";
import { runChargeJob } from "./charge-job";
import { currencyMismatch } from "@/test-helpers/fake-card-gateway";
import { chargeFirst, previewFirst, repairPaidUsers, retryNow, settleFromInvoice, type ChargeDeps } from "./first-charge";
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

/**
 * A fake Stripe: subscriptions per customer, scripted outcomes, every create recorded with its key. Coupons
 * (`couponOff`, cents off the total) apply to previews and creates; one in `gone` is refused as Stripe refuses a
 * deleted coupon (the preview throws Stripe's error; the create answers `coupon_gone`, as the gateway maps it).
 */
function fakeStripe() {
  const subs = new Map<string, FoundSubscription[]>();
  const keys: string[] = [];
  const script: (ChargeResult | "crash_after" | "crash_before")[] = [];
  const couponOff = new Map<string, number>();
  const gone = new Set<string>();
  const previewCoupons: (string | null)[] = [];
  const createCoupons: (string | null)[] = [];
  const keyParams = new Map<string, string>();
  let total = 23000;
  const amount = (coupon?: string | null) => total - (coupon ? (couponOff.get(coupon) ?? 0) : 0);
  const gw: BillingGateway & {
    subs: typeof subs;
    keys: string[];
    script: typeof script;
    couponOff: typeof couponOff;
    gone: typeof gone;
    previewCoupons: typeof previewCoupons;
    createCoupons: typeof createCoupons;
    setTotal(n: number): void;
    count(): number;
  } = {
    subs,
    keys,
    script,
    couponOff,
    gone,
    previewCoupons,
    createCoupons,
    setTotal: (n) => (total = n),
    count: () => [...subs.values()].flat().length,
    async preview({ coupon }) {
      previewCoupons.push(coupon ?? null);
      if (coupon && gone.has(coupon)) throw Object.assign(new Error(`No such coupon: '${coupon}'`), { type: "StripeInvalidRequestError", code: "resource_missing", param: "discounts[0][coupon]" });
      return { totalCents: amount(coupon), currency: "USD", discountCents: coupon ? (couponOff.get(coupon) ?? 0) : 0 };
    },
    async subscriptions(customer) {
      return subs.get(customer) ?? [];
    },
    async createSubscription({ customer, claimId, idempotencyKey, coupon, price, extra }) {
      keys.push(idempotencyKey);
      createCoupons.push(coupon ?? null);
      // Stripe refuses a key reused with other parameters.
      const sent = JSON.stringify([customer, price, extra ?? null, coupon ?? null, claimId]);
      if ((keyParams.get(idempotencyKey) ?? sent) !== sent) {
        throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters they were first used with."), { type: "StripeIdempotencyError" });
      }
      keyParams.set(idempotencyKey, sent);
      if (coupon && gone.has(coupon)) return { kind: "coupon_gone", error: `No such coupon: '${coupon}'` };
      const total = amount(coupon);
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

  it("charges a member not sharing at the cutoff the standard price plus one first-invoice item, and records that month as billed", async () => {
    await query("update users set sharing = 'match_only', quote = $1", [JSON.stringify({ totalCents: 23000, currency: "USD", price: "price_monthly_usd", extraCents: 20000 })]);
    const calls: { price: string; extra: unknown }[] = [];
    const previews: unknown[] = [];
    const spy = {
      ...gw,
      preview: async (o: Parameters<BillingGateway["preview"]>[0]) => (previews.push(o.extra), gw.preview(o)),
      createSubscription: async (o: Parameters<BillingGateway["createSubscription"]>[0]) => (calls.push({ price: o.price, extra: o.extra }), gw.createSubscription(o)),
    };
    expect(await chargeFirst(query, deps(SIX_AM, { gw: spy }), uid, WEEK)).toBe("charged");
    // The preview the told amount came from carries the same item.
    expect(previews).toEqual([{ amountCents: 20000, currency: "USD" }]);
    expect(calls).toEqual([{ price: "price_monthly_usd", extra: { amountCents: 20000, currency: "USD" } }]);
    expect(await query("select status, reason, amount_cents, to_char(period_start, 'YYYY-MM-DD') as period_start from pending_adjustments")).toEqual([
      { status: "invoiced", reason: "not_sharing", amount_cents: 20000, period_start: WEEK },
    ]);
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

describe("an amount never told", () => {
  it("holds and tells, rather than charging, when no amount was ever sent to the user", async () => {
    await query("update users set quote = null");
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("held_amount");
    expect(gw.keys).toEqual([]);
    expect(subjects()[0]).toBe("Your first charge amount changed");
  });
});

describe("the billing anchor comes from Stripe", () => {
  const anchorOf = async () => (await query<{ a: string }>("select billing_anchor::text as a from users where id = $1", [uid]))[0].a;
  const claim = async () =>
    (await query<{ id: string }>("insert into charge_attempts (user_id, purpose, week_of, attempt, outcome, stripe_object, settled_at) values ($1, 'first_charge', $2, 1, $3, 'sub_x', $4) returning id", [uid, WEEK, "claimed", null]))[0].id;

  it("a charge settled by the webhook stores the anchor from the invoice's plan line", async () => {
    const id = await claim();
    await settleFromInvoice(query, { claimId: id, subscription: "sub_x", amountCents: 23000, currency: "usd", anchor: Date.parse("2026-12-14T11:04:30Z") / 1000 }, deps(at("2026-12-14T12:00:00Z")));
    expect(await anchorOf()).toBe("2026-12-14 11:04:30+00");
  });

  it("the repair pass reads the subscription's anchor from Stripe", async () => {
    await query("insert into charge_attempts (user_id, purpose, week_of, attempt, outcome, stripe_object, settled_at) values ($1, 'first_charge', $2, 1, 'succeeded', 'sub_x', '2026-12-14T12:30:00Z')", [uid, WEEK]);
    gw.subs.set("cus_1", [{ id: "sub_x", status: "active", claimId: null, anchor: Date.parse("2026-12-14T11:04:30Z") / 1000 }]);
    expect(await repairPaidUsers(query, deps())).toBe(1);
    expect(await anchorOf()).toBe("2026-12-14 11:04:30+00");
  });
});

describe("the promo locked in at card save (plan 2026-11-26-001, Unit 8)", () => {
  // The told amount, with 20% off the plan before tax: 23000 - 4600.
  const TOLD = 18400;
  const promo = async () => (await query<{ coupon: string | null; label: string | null }>("select promo_coupon as coupon, promo_label as label from users where id = $1", [uid]))[0];
  const quote = async () => (await query<{ quote: Record<string, unknown> }>("select quote from users where id = $1", [uid]))[0].quote;

  beforeEach(async () => {
    gw.couponOff.set("co_20", 4600);
    await query("update users set promo_code = 'WELCOME20', promo_coupon = 'co_20', promo_label = 'WELCOME20', quote = $1", [
      JSON.stringify({ totalCents: TOLD, currency: "USD", price: "price_monthly_usd", coupon: "co_20", discountCents: 4600 }),
    ]);
  });

  it("previews and subscribes with the coupon; the charge is the told, discounted amount", async () => {
    expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ first: { charged: 1 } });
    expect(gw.previewCoupons).toEqual(["co_20"]);
    expect(gw.createCoupons).toEqual(["co_20"]);
    expect(await query("select amount_cents, outcome from charge_attempts")).toEqual([{ amount_cents: TOLD, outcome: "succeeded" }]);
    expect(await user()).toMatchObject({ status: "active" });
  });

  it("holds when the told quote had no coupon but the preview carries one (the coupon is part of the told amount)", async () => {
    await query("update users set quote = $1", [JSON.stringify({ totalCents: TOLD, currency: "USD", price: "price_monthly_usd", coupon: null })]);
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("held_amount");
    expect(gw.keys).toEqual([]);
  });

  // Review F4: a quote told before Unit 8 has no coupon field; only its amount is compared.
  it("a quote from before Unit 8 (no coupon field) with the same amount is charged, not held", async () => {
    await query("update users set quote = $1", [JSON.stringify({ totalCents: TOLD, currency: "USD", price: "price_monthly_usd" })]);
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("charged");
    expect(gw.createCoupons).toEqual(["co_20"]);
  });

  it("a coupon deleted before the charge: held for the changed amount, told, the promo dropped; 24 hours later charged the full price", async () => {
    gw.gone.add("co_20");
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("held_amount");
    expect(gw.keys).toEqual([]);
    expect(await user()).toMatchObject({ status: "held", hold_reason: "amount_changed" });
    expect(await promo()).toEqual({ coupon: null, label: null });
    expect(await quote()).toMatchObject({ totalCents: 23000, coupon: null, discountCents: 0, week: WEEK });
    expect(subjects()).toEqual(["Your first charge amount changed", "[Roger] A first charge amount changed"]);
    expect(sent[0].text).toContain("(WELCOME20) has ended");
    expect(sent[0].text).toContain("US$230");
    expect(sent[1].text).toContain("no longer applies");
    // The 10-minute re-runs leave the hold alone; the 24-hour retry charges the full price, without the coupon.
    await runChargeJob(query, deps(at("2026-12-14T11:15:00Z")), { week: WEEK });
    await runHourly(query, deps(at("2026-12-15T10:00:00Z")));
    expect(gw.keys).toEqual([]);
    await runHourly(query, deps(at("2026-12-15T11:10:00Z")));
    expect(gw.createCoupons).toEqual([null]);
    expect(await query("select attempt, amount_cents, outcome from charge_attempts")).toEqual([{ attempt: 1, amount_cents: 23000, outcome: "succeeded" }]);
    expect(await user()).toMatchObject({ status: "active" });
  });

  it("a coupon deleted between the preview and the create: the claim ends, held and told at full price in one go; the retry is a new attempt", async () => {
    const real = gw.createSubscription.bind(gw);
    const racing = { ...gw, createSubscription: async (o: Parameters<BillingGateway["createSubscription"]>[0]) => (gw.gone.add("co_20"), real(o)) };
    expect(await chargeFirst(query, deps(SIX_AM, { gw: racing }), uid, WEEK)).toBe("held_amount");
    expect(await attempts()).toEqual([{ attempt: 1, outcome: "error" }]);
    expect(await user()).toMatchObject({ status: "held", hold_reason: "amount_changed" });
    expect(await promo()).toEqual({ coupon: null, label: null });
    expect(await quote()).toMatchObject({ totalCents: 23000, coupon: null });
    expect(subjects()).toEqual(["Your first charge amount changed", "[Roger] A first charge amount changed"]);
    expect(gw.count()).toBe(0);
    await runHourly(query, deps(at("2026-12-15T11:10:00Z")));
    expect(await attempts()).toEqual([
      { attempt: 1, outcome: "error" },
      { attempt: 2, outcome: "succeeded" },
    ]);
    expect(gw.createCoupons).toEqual(["co_20", null]);
    expect(await user()).toMatchObject({ status: "active" });
  });

  it("a takeover repeats the claimed call with the same coupon and key", async () => {
    gw.script.push("crash_before");
    await expect(chargeFirst(query, deps(), uid, WEEK)).rejects.toThrow("before Stripe");
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    await runHourly(query, deps(at("2026-12-14T12:00:00Z")));
    expect(gw.createCoupons).toEqual(["co_20", "co_20"]);
    expect(gw.keys[0]).toBe(gw.keys[1]);
    expect(await query("select amount_cents, outcome from charge_attempts")).toEqual([{ amount_cents: TOLD, outcome: "succeeded" }]);
  });
});

describe("no promo (plan 2026-11-26-001, Unit 8 regression)", () => {
  it("previews and subscribes with no coupon", async () => {
    await runChargeJob(query, deps(), { week: WEEK });
    expect(gw.previewCoupons).toEqual([null]);
    expect(gw.createCoupons).toEqual([null]);
  });
});

describe("Stripe Endive's failed_tax_calculation on create (plan 2026-11-26-001, Unit 8)", () => {
  it("is classified as a tax address problem whatever its class: held, an admin alert, never retried on its own", async () => {
    const { classify } = await import("./subscriptions");
    const Stripe = (await import("stripe")).default;
    const endive = new Stripe.errors.StripeInvalidRequestError({ type: "invalid_request_error", code: "failed_tax_calculation", message: "Tax could not be calculated." });
    expect(classify(endive)).toEqual({ kind: "tax_address", error: "Tax could not be calculated." });
    expect(classify(Object.assign(new Error("Could not calculate."), { code: "failed_tax_calculation" }))).toMatchObject({ kind: "tax_address" });
    gw.script.push(classify(endive));
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("error");
    expect(await user()).toMatchObject({ status: "held", hold_reason: "first_charge_failed" });
    expect(subjects()).toEqual(["[Roger] Stripe couldn't work out tax for a customer's address"]);
    await runChargeJob(query, deps(at("2026-12-14T11:15:00Z")), { week: WEEK });
    await runHourly(query, deps(at("2026-12-15T11:05:00Z")));
    expect(gw.keys).toHaveLength(1);
  });
});

describe("a week whose delivered list was a free list (plan 2026-11-26-001, Unit 8)", () => {
  const deliver = async (free: boolean) => {
    const [{ id }] = await query<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('P', 'Sales', 'd', 'p', 'x', '2026-12-01', '2026-12-01') returning id",
    );
    await query(
      "insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, delivered_at, is_free_list) values ($1, $2, 1, $3, 5, 3, 'r', '2026-12-14T12:05:00Z', $4)",
      [uid, WEEK, id, free],
    );
  };

  it("is never charged that Monday, by the job's re-runs or a direct call", async () => {
    await deliver(true);
    for (const t of ["2026-12-14T12:15:00Z", "2026-12-14T13:05:00Z", "2026-12-14T17:55:00Z"]) {
      // `skipped: 0`: the job's own `due` query leaves the member out (Unit 8 review F7: each layer has its own test;
      // the direct call below is chargeFirst's).
      expect(await runChargeJob(query, deps(at(t)), { week: WEEK })).toMatchObject({ first: { charged: 0, skipped: 0 } });
    }
    expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("skipped");
    expect(gw.keys).toEqual([]);
    expect(await attempts()).toEqual([]);
  });

  it("a third list (delivered, not free) is charged once over the job's re-runs", async () => {
    await deliver(false);
    for (const t of ["2026-12-14T11:05:00Z", "2026-12-14T12:15:00Z", "2026-12-14T13:05:00Z"]) await runChargeJob(query, deps(at(t)), { week: WEEK });
    expect(gw.keys).toHaveLength(1);
    expect(gw.count()).toBe(1);
    expect(await user()).toMatchObject({ status: "active" });
  });
});

describe("review fixes (plan 2026-11-26-001, Unit 8)", () => {
  const TOLD = 18400;
  const promo = async () =>
    (await query<{ coupon: string | null; label: string | null; ended: string | null }>("select promo_coupon as coupon, promo_label as label, promo_ended_label as ended from users where id = $1", [uid]))[0];
  const claims = () => query<{ attempt: number; outcome: string; coupon: string | null; amount_cents: number | null }>("select attempt, outcome, coupon, amount_cents from charge_attempts order by attempt");
  const age = () => query("update charge_attempts set claimed_at = now() - interval '16 minutes'");

  beforeEach(async () => {
    gw.couponOff.set("co_20", 4600);
    await query("update users set promo_code = 'WELCOME20', promo_coupon = 'co_20', promo_label = 'WELCOME20', promo_duration = 'once', quote = $1", [
      JSON.stringify({ totalCents: TOLD, currency: "USD", price: "price_monthly_usd", coupon: "co_20", discountCents: 4600 }),
    ]);
  });

  describe("F1: the claim records its coupon; a takeover repeats exactly that", () => {
    it("records the coupon on the claim", async () => {
      gw.script.push("crash_before");
      await expect(chargeFirst(query, deps(), uid, WEEK)).rejects.toThrow("before Stripe");
      expect(await claims()).toEqual([{ attempt: 1, outcome: "claimed", coupon: "co_20", amount_cents: TOLD }]);
    });

    it.each([
      ["changed to another coupon", "'co_other'"],
      ["dropped", "null"],
    ])("an unknown claim whose member's coupon was %s meanwhile: the takeover sends the claimed coupon, same key, no idempotency error", async (_what, value) => {
      gw.script.push({ kind: "unknown", error: "timeout" });
      expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("unknown");
      await query(`update users set promo_coupon = ${value}`);
      await age();
      await runHourly(query, deps(at("2026-12-14T12:00:00Z")));
      expect(gw.createCoupons).toEqual(["co_20", "co_20"]);
      expect(gw.keys[0]).toBe(gw.keys[1]);
      expect(await claims()).toEqual([{ attempt: 1, outcome: "succeeded", coupon: "co_20", amount_cents: TOLD }]);
      expect(await user()).toMatchObject({ status: "active" });
    });

    it("the fake refuses a reused key with other parameters, as Stripe does (so the test above would catch a changed coupon)", async () => {
      const o = { customer: "cus_1", price: "price_monthly_usd", claimId: "c1", userId: uid, idempotencyKey: "first_charge:c1:1" };
      await gw.createSubscription({ ...o, coupon: "co_20" });
      await expect(gw.createSubscription({ ...o, coupon: null })).rejects.toMatchObject({ type: "StripeIdempotencyError" });
    });

    it("a quote's preview while a claim is open never drops the coupon; the takeover finds it gone and ends the claim with the hold", async () => {
      gw.script.push("crash_before");
      await expect(chargeFirst(query, deps(), uid, WEEK)).rejects.toThrow("before Stripe");
      gw.gone.add("co_20");
      const r = await previewFirst(query, gw, { id: uid, promo_coupon: "co_20", stripe_customer: "cus_1" }, "price_monthly_usd", null);
      expect(r).toMatchObject({ coupon: null, preview: { totalCents: 23000 } });
      expect(await promo()).toMatchObject({ coupon: "co_20", ended: null });
      await age();
      await runHourly(query, deps(at("2026-12-14T12:00:00Z")));
      expect(gw.createCoupons).toEqual(["co_20", "co_20"]);
      expect(await claims()).toEqual([{ attempt: 1, outcome: "error", coupon: "co_20", amount_cents: TOLD }]);
      expect(await user()).toMatchObject({ status: "held", hold_reason: "amount_changed" });
      expect(await promo()).toEqual({ coupon: null, label: null, ended: null });
      expect(sent.find((m) => m.subject === "Your first charge amount changed")!.text).toContain("(WELCOME20) has ended");
    });
  });

  describe("F2: coupon gone at create for a member who can no longer be charged", () => {
    it.each([
      ["cancelled", "update users set status = 'cancelled', cancel_requested_at = now()"],
      ["closed", "update users set status = 'closed'"],
      ["asked to cancel", "update users set cancel_requested_at = now()"],
    ])("%s between the claim and the answer: the claim ends as an error with an admin alert; the member is not held", async (_what, change) => {
      const real = gw.createSubscription.bind(gw);
      const racing = {
        ...gw,
        createSubscription: async (o: Parameters<BillingGateway["createSubscription"]>[0]) => {
          gw.gone.add("co_20");
          await query(change);
          return real(o);
        },
      };
      expect(await chargeFirst(query, deps(SIX_AM, { gw: racing }), uid, WEEK)).toBe("error");
      expect(await claims()).toEqual([{ attempt: 1, outcome: "error", coupon: "co_20", amount_cents: TOLD }]);
      const [c] = await query<{ error: string }>("select error from charge_attempts");
      expect(c.error).toMatch(/^The user can no longer be charged\. Coupon no longer applies/);
      expect((await user()).hold_reason).toBeNull();
      expect(subjects()).toEqual(["[Roger] A first charge claim ended: the member can no longer be charged"]);
      // Nothing is left for the takeover.
      await age();
      await runHourly(query, deps(at("2026-12-14T12:00:00Z")));
      expect(gw.keys).toHaveLength(1);
    });
  });

  describe("F3: the discount-ended line survives a failed pass", () => {
    it("the full-price preview fails after the drop: the next pass's hold email still says the discount ended", async () => {
      gw.gone.add("co_20");
      let fail = true;
      const flaky = {
        ...gw,
        preview: async (o: Parameters<BillingGateway["preview"]>[0]) => {
          if (!o.coupon && fail) {
            fail = false;
            throw new Error("Stripe timed out");
          }
          return gw.preview(o);
        },
      };
      await expect(chargeFirst(query, deps(SIX_AM, { gw: flaky }), uid, WEEK)).rejects.toThrow("timed out");
      expect(await promo()).toEqual({ coupon: null, label: null, ended: "WELCOME20" });
      expect(sent).toEqual([]);
      expect(await chargeFirst(query, deps(at("2026-12-14T11:15:00Z")), uid, WEEK)).toBe("held_amount");
      expect(sent[0].subject).toBe("Your first charge amount changed");
      expect(sent[0].text).toContain("(WELCOME20) has ended");
      expect(sent[1].text).toContain("(WELCOME20) no longer applies");
      expect((await promo()).ended).toBeNull();
    });

    it("a charge that goes through forgets a kept label", async () => {
      await query("update users set promo_ended_label = 'OLD'");
      expect(await chargeFirst(query, deps(), uid, WEEK)).toBe("charged");
      expect((await promo()).ended).toBeNull();
    });
  });

  describe("F6: an amount-off coupon without the member's currency reaches the charge", () => {
    it("is treated like a coupon that is gone: dropped, held and told the full price, and later passes do not throw", async () => {
      const mismatch = {
        ...gw,
        preview: async (o: Parameters<BillingGateway["preview"]>[0]) => {
          if (o.coupon) throw currencyMismatch(o.coupon, "USD");
          return gw.preview(o);
        },
      };
      expect(await chargeFirst(query, deps(SIX_AM, { gw: mismatch }), uid, WEEK)).toBe("held_amount");
      expect(await promo()).toEqual({ coupon: null, label: null, ended: null });
      expect(await user()).toMatchObject({ status: "held", hold_reason: "amount_changed" });
      expect(sent[0].text).toContain("(WELCOME20) has ended");
      await runChargeJob(query, deps(at("2026-12-14T11:15:00Z"), { gw: mismatch }), { week: WEEK });
      expect(gw.keys).toEqual([]);
    });
  });

  describe("F7: a promo that covers the whole first invoice", () => {
    it("starts the subscription with nothing charged, as told (0 is the told amount), and says so", async () => {
      gw.couponOff.set("co_free", 23000);
      await query("update users set promo_coupon = 'co_free', promo_label = 'FREEMONTH', quote = $1", [
        JSON.stringify({ totalCents: 0, currency: "USD", price: "price_monthly_usd", coupon: "co_free", discountCents: 23000 }),
      ]);
      expect(await runChargeJob(query, deps(), { week: WEEK })).toMatchObject({ first: { charged: 1 } });
      expect(await claims()).toEqual([{ attempt: 1, outcome: "succeeded", coupon: "co_free", amount_cents: 0 }]);
      expect(await user()).toMatchObject({ status: "active" });
      expect(subjects()).toEqual(["You’re subscribed"]);
      expect(sent[0].text).toContain("Your first month is covered by your promo code, so nothing was charged.");
    });
  });
});
