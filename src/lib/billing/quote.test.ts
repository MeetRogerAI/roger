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

  // S18 point a review: a quote told before the tax was kept is refreshed with its tax, silently when the amount is the same.
  it("refreshes a quote told without its tax silently, keeping when it was told, and still tells a changed amount", async () => {
    const taxed: BillingGateway = { ...gw, preview: async (o) => ({ ...(await gw.preview(o)), taxCents: 2600 }) };
    const old = { totalCents: 22600, currency: "USD", price: "price_monthly_usd", extraCents: 0, at: "2026-12-07T15:00:00.000Z", week: WEEK };
    await query("update users set quote = $1", [JSON.stringify(old)]);
    expect(await noticeQuoteChange(query, { ...deps(new Date("2026-12-09T15:00:00Z")), gw: taxed }, uid)).toBe(false);
    expect(sent).toEqual([]);
    const [{ quote }] = await query<{ quote: Record<string, unknown> }>("select quote from users");
    expect(quote).toMatchObject({ totalCents: 22600, taxCents: 2600, at: old.at, week: WEEK });
    // Now kept with its tax: the same amount again changes nothing.
    expect(await noticeQuoteChange(query, { ...deps(new Date("2026-12-09T16:00:00Z")), gw: taxed }, uid)).toBe(false);
    // A different amount is still told.
    await switchSharing("off", "2026-12-09T17:00:00Z");
    expect(await noticeQuoteChange(query, { ...deps(new Date("2026-12-09T17:00:00Z")), gw: taxed }, uid)).toBe(true);
    expect(sent.map((m) => m.subject)).toEqual(["Your first charge amount changed"]);
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

describe("a promo locked in at card save (plan 2026-11-26-001, Unit 8)", () => {
  // US$200 at 13% tax; the coupon takes 20% off before tax: (20000 - 4000) * 1.13 = 18080.
  const gone = new Set<string>();
  const coupons: (string | null)[] = [];
  const created: (string | null)[] = [];
  const promoGw: BillingGateway = {
    preview: async ({ coupon }) => {
      coupons.push(coupon ?? null);
      if (coupon && gone.has(coupon)) throw Object.assign(new Error(`No such coupon: '${coupon}'`), { code: "resource_missing", param: "discounts[0][coupon]" });
      const off = coupon ? 4000 : 0;
      return { totalCents: Math.round((20000 - off) * 1.13), currency: "USD", discountCents: off, taxCents: Math.round((20000 - off) * 0.13) };
    },
    subscriptions: async () => [],
    createSubscription: async ({ coupon }) => (created.push(coupon ?? null), { kind: "succeeded", object: "sub_1", amountCents: coupon ? 18080 : 22600, currency: "USD" }),
  };
  const pdeps = (now: Date) => ({ ...deps(now), gw: promoGw });
  const promo = async () => (await query<{ coupon: string | null; label: string | null }>("select promo_coupon as coupon, promo_label as label from users"))[0];

  beforeEach(async () => {
    gone.clear();
    coupons.length = 0;
    created.length = 0;
    await query("update users set promo_code = 'WELCOME20', promo_coupon = 'co_20', promo_label = 'WELCOME20'");
  });

  it("the second-list email, the reminder and the charge all carry the discount, at the same told amount", async () => {
    expect(await sendFirstPaidNext(query, pdeps(MONDAY_BEFORE), uid)).toBe(true);
    expect((await query<{ quote: unknown }>("select quote from users"))[0].quote).toMatchObject({ totalCents: 18080, coupon: "co_20", discountCents: 4000, week: WEEK });
    expect(await sendFirstChargeReminders(query, pdeps(SATURDAY))).toBe(1);
    for (const m of sent) {
      expect(m.text).toContain("US$180.80");
      expect(m.text).toContain("That includes your promo code WELCOME20: US$40 off.");
    }
    expect(await chargeFirst(query, pdeps(MONDAY_CHARGE), uid, WEEK)).toBe("charged");
    expect(coupons).toEqual(["co_20", "co_20", "co_20"]);
    expect(created).toEqual(["co_20"]);
  });

  it("a coupon deleted before the second-list email is dropped: the full price is told, with no discount line", async () => {
    gone.add("co_20");
    expect(await sendFirstPaidNext(query, pdeps(MONDAY_BEFORE), uid)).toBe(true);
    expect(await told()).toMatchObject({ total: 22600 });
    expect(await promo()).toEqual({ coupon: null, label: null });
    expect(sent[0].text).toContain("US$226");
    expect(sent[0].text).not.toContain("promo code");
    expect(await chargeFirst(query, pdeps(MONDAY_CHARGE), uid, WEEK)).toBe("charged");
    expect(created).toEqual([null]);
  });

  it("no promo: the emails have no discount line and the quote records no coupon", async () => {
    await query("update users set promo_code = null, promo_coupon = null, promo_label = null");
    await sendFirstPaidNext(query, pdeps(MONDAY_BEFORE), uid);
    expect(sent[0].text).not.toContain("promo code");
    expect((await query<{ quote: unknown }>("select quote from users"))[0].quote).toMatchObject({ totalCents: 22600, coupon: null, discountCents: 0 });
  });

  // Review F5: how long the discount lasts, in both emails, and the regular month after one that ends.
  it.each([
    ["once", null, "That includes your promo code WELCOME20: US$40 off your first month. After that, it’s US$200 a month plus tax.", 22600],
    ["repeating", 1, "That includes your promo code WELCOME20: US$40 off your first month. After that, it’s US$200 a month plus tax.", 22600],
    ["repeating", 3, "That includes your promo code WELCOME20: US$40 off a month for your first 3 months. After that, it’s US$200 a month plus tax.", 22600],
    ["forever", null, "That includes your promo code WELCOME20: US$40 off every month.", undefined],
  ])("a %s discount (%s months): both emails word it, and the quote notes the amount after", async (duration, months, line, recurring) => {
    await query("update users set promo_duration = $1, promo_duration_months = $2", [duration, months]);
    expect(await sendFirstPaidNext(query, pdeps(MONDAY_BEFORE), uid)).toBe(true);
    expect(await sendFirstChargeReminders(query, pdeps(SATURDAY))).toBe(1);
    expect(sent).toHaveLength(2);
    for (const m of sent) {
      // The price plus the tax, never "tax included" (S18 point a).
      expect(m.text).toContain("US$180.80 (US$160 plus US$20.80 tax)");
      expect(m.text).not.toContain("tax included");
      expect(m.text).toContain(line);
    }
    const q = (await query<{ quote: Record<string, unknown> }>("select quote from users"))[0].quote;
    expect(q).toMatchObject({ totalCents: 18080, coupon: "co_20", discountCents: 4000 });
    expect(q.recurringCents).toBe(recurring);
    // The amount after is a plain preview (no coupon); the charge is still the told, discounted amount.
    expect(await chargeFirst(query, pdeps(MONDAY_CHARGE), uid, WEEK)).toBe("charged");
    expect(created).toEqual(["co_20"]);
  });

  it("the amount after the discount cannot be previewed: the email still goes, without that sentence", async () => {
    await query("update users set promo_duration = 'once'");
    const flaky: BillingGateway = { ...promoGw, preview: async (o) => (o.coupon ? promoGw.preview(o) : Promise.reject(new Error("Stripe down"))) };
    expect(await sendFirstPaidNext(query, { ...deps(MONDAY_BEFORE), gw: flaky }, uid)).toBe(true);
    expect(sent[0].text).toContain("That includes your promo code WELCOME20: US$40 off your first month.");
    expect(sent[0].text).not.toContain("After that");
  });

  // Review F4: a quote told before Unit 8 has no coupon field, so a coupon alone never makes it "changed".
  it("a quote from before Unit 8 (no coupon field) at the same amount is not told again", async () => {
    await query("update users set quote = $1", [JSON.stringify({ totalCents: 18080, currency: "USD", price: "price_monthly_usd", extraCents: 0, at: "2026-12-07T15:00:00Z", week: WEEK })]);
    expect(await noticeQuoteChange(query, pdeps(new Date("2026-12-09T15:00:00Z")), uid)).toBe(false);
    expect(sent).toEqual([]);
    // With the field, a different coupon is a change.
    await query("update users set quote = quote || '{\"coupon\": null}'::jsonb");
    expect(await noticeQuoteChange(query, pdeps(new Date("2026-12-09T15:00:00Z")), uid)).toBe(true);
  });

  // Review F7: an expired coupon (past redeem_by) at the quote, then at the charge.
  it("a coupon past its redeem_by at the reminder: the full price is told, and the charge matches it", async () => {
    await sendFirstPaidNext(query, pdeps(MONDAY_BEFORE), uid);
    const expired: BillingGateway = {
      ...promoGw,
      preview: async (o) => {
        if (o.coupon) throw Object.assign(new Error(`Coupon ${o.coupon} is expired and cannot be applied.`), { type: "StripeInvalidRequestError", code: "coupon_expired", param: "discounts" });
        return promoGw.preview(o);
      },
    };
    expect(await sendFirstChargeReminders(query, { ...deps(SATURDAY), gw: expired })).toBe(1);
    expect(sent[1].text).toContain("US$226");
    expect(sent[1].text).not.toContain("promo code");
    expect(await promo()).toEqual({ coupon: null, label: null });
    expect(await chargeFirst(query, { ...deps(MONDAY_CHARGE), gw: expired }, uid, WEEK)).toBe("charged");
    expect(created).toEqual([null]);
  });
});
