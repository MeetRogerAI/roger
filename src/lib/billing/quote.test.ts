import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { chargeFirst } from "./first-charge";
import { noticeQuoteChange, quotable, quoteFrozen, sendFirstChargeReminders, sendFirstPaidNext } from "./quote";
import type { BillingGateway } from "./subscriptions";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
let failNext = false;
const transport: Transport = async (m) => {
  if (failNext) {
    failNext = false;
    return { ok: false, error: "down", retryable: false };
  }
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const WEEK = "2026-12-14";
// Monday 2026-12-07, 10:00 AM Toronto: the second free list was delivered this morning.
const MONDAY_BEFORE = new Date("2026-12-07T15:00:00Z");
// Saturday 2026-12-12, 6:05 AM Toronto: 48 hours before Monday's 6:00 charge.
const SATURDAY = new Date("2026-12-12T11:05:00Z");
const MONDAY_CHARGE = new Date("2026-12-14T11:05:00Z");

/** Previews by price (the higher price costs more), plus a tax shift the test can switch on. */
const prices: Record<string, number> = { price_monthly_usd: 22600, price_monthly_higher_usd: 45200 };
let taxShift = 0;
const created: string[] = [];
const gw: BillingGateway = {
  // Not sharing at the cutoff: the standard price plus the month's difference on the first invoice (US$200 + 13%).
  preview: async ({ price, extra }) => ({ totalCents: prices[price] + (extra ? 22600 : 0) + taxShift, currency: "USD" }),
  subscriptions: async () => [],
  createSubscription: async ({ price, extra }) => (
    created.push(extra ? `${price}+${extra.amountCents}` : price), { kind: "succeeded", object: "sub_1", amountCents: prices[price] + (extra ? 22600 : 0) + taxShift, currency: "USD" }
  ),
};
const deps = (now: Date, s = settings) => ({ gw, settings: s, now, query, transport, sleep: async () => {} });
let uid: string;
const amounts = () => sent.map((m) => (m.text.match(/US\$\d+(?:\.\d{2})?/) ?? [""])[0]);
const told = async () => (await query<{ total: number | null; price: string | null; week: string | null }>("select (quote->>'totalCents')::int as total, quote->>'price' as price, quote->>'week' as week from users"))[0];
const switchSharing = async (to: string, at: string) => {
  await query("update users set sharing = $1", [to]);
  await query("insert into zack_settings_history (user_id, sharing, plays_per_week, changed_at) values ($1, $2, 4, $3)", [uid, to, at]);
};

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  created.length = 0;
  taxShift = 0;
  failNext = false;
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_HIGHER_USD", "price_monthly_higher_usd");
  vi.stubEnv("ADMIN_EMAILS", "");
  [{ id: uid }] = await query<{ id: string }>(
    "insert into users (email, status, plan, currency, sharing, stripe_customer, free_lists_used, trial_started_at) values ('ana@example.com', 'trial', 'monthly', 'USD', 'share', 'cus_1', 2, '2026-11-16T15:00:00Z') returning id",
  );
});

describe("the told amount (spec check 21)", () => {
  it("is the same in the second-list email, the 48-hour reminder and the charge", async () => {
    expect(await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid)).toBe(true);
    expect(await sendFirstChargeReminders(query, deps(new Date("2026-12-12T10:00:00Z")))).toBe(0); // before the window
    expect(await sendFirstChargeReminders(query, deps(SATURDAY))).toBe(1);
    expect(await sendFirstChargeReminders(query, deps(new Date("2026-12-12T12:05:00Z")))).toBe(0); // once
    expect(await chargeFirst(query, deps(MONDAY_CHARGE), uid, WEEK)).toBe("charged");
    expect(amounts().slice(0, 3)).toEqual(["US$226", "US$226", "US$226"]);
    expect(created).toEqual(["price_monthly_usd"]);
  });

  it("tells the user when a sharing switch before Monday moves the amount, and the charge matches", async () => {
    await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid);
    await switchSharing("off", "2026-12-09T15:00:00Z");
    expect(await noticeQuoteChange(query, deps(new Date("2026-12-09T15:00:00Z")), uid)).toBe(true);
    expect(sent.map((m) => m.subject)).toContain("Your first charge amount changed");
    expect(await chargeFirst(query, deps(MONDAY_CHARGE), uid, WEEK)).toBe("charged");
    // The standard price, with the month's difference on the first invoice only.
    expect(created).toEqual(["price_monthly_usd+20000"]);
  });

  it("tells the user each time they switch back and forth", async () => {
    await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid);
    for (const [to, at] of [
      ["off", "2026-12-09T15:00:00Z"],
      ["share", "2026-12-09T16:00:00Z"],
      ["off", "2026-12-09T17:00:00Z"],
    ]) {
      await switchSharing(to, at);
      expect(await noticeQuoteChange(query, deps(new Date(at)), uid)).toBe(true);
    }
    expect(sent.filter((m) => m.subject === "Your first charge amount changed")).toHaveLength(3);
  });

  it("does not store an amount whose email failed; the charge then holds and tells instead of charging it", async () => {
    await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid);
    await switchSharing("off", "2026-12-09T15:00:00Z");
    failNext = true;
    expect(await noticeQuoteChange(query, deps(new Date("2026-12-09T15:00:00Z")), uid)).toBe(false);
    expect((await told()).price).toBe("price_monthly_usd");
    expect(await chargeFirst(query, deps(MONDAY_CHARGE), uid, WEEK)).toBe("held_amount");
    expect(created).toEqual([]);
  });

  it("never re-quotes silently after the reminder: a later change is caught by the charge and told first", async () => {
    await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid);
    await sendFirstChargeReminders(query, deps(SATURDAY));
    taxShift = 400; // a new billing address on Sunday, with no hook
    await sendFirstChargeReminders(query, deps(new Date("2026-12-13T15:00:00Z")));
    expect((await told()).total).toBe(22600);
    expect(await chargeFirst(query, deps(MONDAY_CHARGE), uid, WEEK)).toBe("held_amount");
  });
});

describe("the freeze around the charge", () => {
  it("leaves the quote alone from the cutoff of its Monday to the end of that Monday", () => {
    expect(quoteFrozen({ week: WEEK }, new Date("2026-12-14T10:30:00Z"), settings)).toBe(true);
    expect(quoteFrozen({ week: WEEK }, new Date("2026-12-13T20:00:00Z"), settings)).toBe(false);
    expect(quoteFrozen({ week: WEEK }, new Date("2026-12-15T06:00:00Z"), settings)).toBe(false);
    // An earlier cutoff (20:00 Sunday) freezes from then.
    const early = mergeV3([{ key: "v3.runCutoff", value: "20:00" }]);
    expect(quoteFrozen({ week: WEEK }, new Date("2026-12-14T02:00:00Z"), early)).toBe(true); // Sunday 21:00 Toronto
  });

  it("a Monday-morning switch neither notifies nor upsets that Monday's charge", async () => {
    await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid);
    await switchSharing("off", "2026-12-14T10:30:00Z");
    expect(await noticeQuoteChange(query, deps(new Date("2026-12-14T10:30:00Z")), uid)).toBe(false);
    expect(await chargeFirst(query, deps(MONDAY_CHARGE), uid, WEEK)).toBe("charged");
    expect(created).toEqual(["price_monthly_usd"]);
  });

  it("a change on the Monday the second list arrives still refreshes the quote for the next Monday", async () => {
    await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid);
    await switchSharing("off", "2026-12-07T18:00:00Z");
    expect(await noticeQuoteChange(query, deps(new Date("2026-12-07T18:00:00Z")), uid)).toBe(true);
  });
});

describe("who is quoted", () => {
  it("only monthly trial users before their first charge; held users are left to the charge and its retries", async () => {
    await query("update users set status = 'held', hold_reason = 'first_charge_failed'");
    expect(await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid)).toBe(false);
    await query("update users set status = 'trial', plan = 'per_run'");
    expect(await sendFirstPaidNext(query, deps(MONDAY_BEFORE), uid)).toBe(false);
    await query("update users set plan = 'monthly', status = 'active'");
    expect(await sendFirstChargeReminders(query, deps(SATURDAY))).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("a trial with no card yet (plan 2026-11-26-001, Unit 1)", () => {
  it("is never quoted, even with a Stripe customer: no email, no stored amount, no preview", async () => {
    // Payment creates the Stripe customer before the card is saved; trial_started_at is "card saved".
    await query("update users set trial_started_at = null");
    let previews = 0;
    const counting = { ...deps(MONDAY_BEFORE), gw: { ...gw, preview: async (o: Parameters<BillingGateway["preview"]>[0]) => (previews++, gw.preview(o)) } };
    expect(await sendFirstPaidNext(query, counting, uid)).toBe(false);
    await switchSharing("off", "2026-12-08T12:00:00Z");
    expect(await noticeQuoteChange(query, { ...counting, now: new Date("2026-12-08T12:00:00Z") }, uid)).toBe(false);
    expect(await sendFirstChargeReminders(query, { ...counting, now: SATURDAY })).toBe(0);
    expect(previews).toBe(0);
    expect(sent).toEqual([]);
    expect((await told()).total).toBeNull();
  });

  it("quotable: a Stripe customer alone is not a card", () => {
    const base = { plan: "monthly", status: "trial", stripe_customer: "cus_1" };
    expect(quotable({ ...base, trial_started_at: null })).toBe(false);
    expect(quotable({ ...base, trial_started_at: "2026-11-16T15:00:00Z" })).toBe(true);
    expect(quotable({ ...base, stripe_customer: null, trial_started_at: "2026-11-16T15:00:00Z" })).toBe(false);
  });
});
