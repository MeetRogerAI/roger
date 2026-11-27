import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Counter } from "@/lib/rate-limit";
import { fakeGateway, type FakePromo } from "@/test-helpers/fake-card-gateway";
import { TEST_SPONSOR, testDb, testSponsor } from "@/test-helpers/pglite-db";
import { checkPromoCode } from "./promo";

/** An in-memory rate counter (the Postgres one is tested in rate-limit.pg.test.ts). */
function memoryCounter(): Counter {
  const m = new Map<string, number>();
  return async (key, start) => {
    const k = `${key}@${start}`;
    m.set(k, (m.get(k) ?? 0) + 1);
    return m.get(k)!;
  };
}

const NOW = new Date("2026-11-26T15:00:00Z");
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

let query: Query;
let userId: string;
let otherId: string;
let info: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  ({ query } = await testDb());
  [{ id: userId }, { id: otherId }] = await query<{ id: string }>(
    `insert into users (email, name, plan, currency, path, email_verified_at, signup_step, status, consent_at)
     values ('ana@example.com', 'Ana', 'monthly', 'CAD', 'new', now(), 'done', 'trial', now()),
            ('bo@example.com', 'Bo', 'monthly', 'CAD', 'new', now(), 'done', 'trial', now()) returning id`,
  );
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => info.mockRestore());

const check = (gw: ReturnType<typeof fakeGateway>, code: string, o: { currency?: "USD" | "CAD"; counter?: Counter; ip?: string; customer?: string } = {}) =>
  checkPromoCode(query, gw, { userId, ip: o.ip ?? "1.2.3.4", code, currency: o.currency ?? "CAD", customer: o.customer }, { now: NOW, counter: o.counter ?? memoryCounter() });

describe("checkPromoCode (plan 2026-11-26-001, Unit 4)", () => {
  it("accepts a valid code and returns the coupon id and label to store at save", async () => {
    const gw = fakeGateway();
    const p = gw.payment.addPromotion({ code: "WELCOME20", coupon: { id: "co_20", name: "Welcome 20%", percentOff: 20 } });
    const r = await check(gw, "welcome20");
    expect(r).toEqual({ ok: true, promotion: expect.objectContaining({ promotionCodeId: p.promotionCodeId, couponId: "co_20", label: "Welcome 20%", percentOff: 20, code: "WELCOME20" }) });
    // The preview with the coupon shows the discount and a lower total.
    const withCoupon = await gw.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6", coupon: "co_20" });
    expect(withCoupon).toMatchObject({ subtotalCents: 28000, discountCents: 5600, taxCents: 2912, totalCents: 25312 });
  });

  it("uses the code as the label when the coupon has no name", async () => {
    const gw = fakeGateway();
    gw.payment.addPromotion({ code: "FRIEND" });
    expect(await check(gw, "FRIEND")).toMatchObject({ ok: true, promotion: { label: "FRIEND" } });
  });

  const past = sec(NOW) - 60;
  const refused: [string, FakePromo, string, { currency?: "USD" | "CAD" }?][] = [
    ["an unknown code", { code: "SOMETHINGELSE" }, "unknown"],
    ["a malformed code", { code: "OK" }, "malformed"],
    ["an inactive code", { code: "OK", active: false }, "unknown"],
    ["an expired code", { code: "OK", expiresAt: past }, "expired"],
    ["a code at its Stripe limit", { code: "OK", maxRedemptions: 3, timesRedeemed: 3 }, "limit_reached"],
    ["a code whose coupon was deleted or used up", { code: "OK", coupon: { valid: false } }, "coupon_invalid"],
    ["a code whose coupon is past redeem_by", { code: "OK", coupon: { redeemBy: past } }, "coupon_invalid"],
    ["an amount-off code in the other currency", { code: "OK", coupon: { percentOff: null, amountOff: { usd: 5000 } } }, "wrong_currency", { currency: "CAD" }],
    ["a code with a minimum in the other currency only", { code: "OK", minimums: { usd: 100 } }, "wrong_currency", { currency: "CAD" }],
    ["a code with a minimum above the monthly price", { code: "OK", minimums: { cad: 50000 } }, "below_minimum"],
    ["a code for another product", { code: "OK", coupon: { appliesToProducts: ["prod_other"] } }, "wrong_product"],
    ["a code for another Stripe customer", { code: "OK", customer: "cus_someone" }, "other_customer"],
  ];

  it.each(refused)("refuses %s with the same generic answer, and logs the reason", async (_name, promo, reason, o) => {
    const gw = fakeGateway();
    gw.payment.addPromotion(promo);
    const typed = reason === "unknown" && promo.code === "SOMETHINGELSE" ? "NOTTHERE" : reason === "malformed" ? "OK OK!" : "OK";
    expect(await check(gw, typed, o)).toEqual({ ok: false, reason: "invalid" });
    expect(info).toHaveBeenCalledWith("[promo] code refused", expect.objectContaining({ reason }));
  });

  it("counts Roger's own reservations on top of Stripe's redemptions", async () => {
    const gw = fakeGateway();
    const p = gw.payment.addPromotion({ code: "TWO", maxRedemptions: 2, timesRedeemed: 1 });
    expect(await check(gw, "TWO")).toMatchObject({ ok: true });
    await query(`insert into promo_reservations (promotion_code, user_id, reserved_at) values ($1, $2, now())`, [p.promotionCodeId, otherId]);
    expect(await check(gw, "TWO")).toEqual({ ok: false, reason: "invalid" });
    expect(info).toHaveBeenCalledWith("[promo] code refused", expect.objectContaining({ code: '"TWO"', reason: "limit_reached" }));
  });

  const reserve = (code: string, user: string) => query(`insert into promo_reservations (promotion_code, user_id, reserved_at) values ($1, $2, now())`, [code, user]);

  it("does not count the caller's own reservation (redeemed 1, max 2)", async () => {
    const gw = fakeGateway();
    const p = gw.payment.addPromotion({ code: "MINE", maxRedemptions: 2, timesRedeemed: 1 });
    await reserve(p.promotionCodeId, userId);
    expect(await check(gw, "MINE")).toMatchObject({ ok: true });
  });

  it("accepts while redemptions plus other reservations stay under the limit (one other, max 3)", async () => {
    const gw = fakeGateway();
    const p = gw.payment.addPromotion({ code: "THREE", maxRedemptions: 3, timesRedeemed: 1 });
    await reserve(p.promotionCodeId, otherId);
    expect(await check(gw, "THREE")).toMatchObject({ ok: true });
  });

  it("ignores reservations for a code with no limit", async () => {
    const gw = fakeGateway();
    const p = gw.payment.addPromotion({ code: "OPEN", maxRedemptions: null, timesRedeemed: 50 });
    await reserve(p.promotionCodeId, otherId);
    expect(await check(gw, "OPEN")).toMatchObject({ ok: true });
  });

  it.each([
    ["a trial whose card is saved", "update users set trial_started_at = now() where id = $1"],
    ["a sponsored trial", `update users set sponsor_id = '${TEST_SPONSOR}' where id = $1`],
    ["an active member", "update users set status = 'active', trial_started_at = now() where id = $1"],
    ["an account still signing up", "update users set status = 'signup' where id = $1"],
  ])("refuses %s (not_allowed), without counting or asking Stripe", async (_n, sql) => {
    const gw = fakeGateway();
    gw.payment.addPromotion({ code: "WELCOME20" });
    const find = vi.spyOn(gw, "findPromotion");
    const counter = vi.fn(memoryCounter());
    await testSponsor(query);
    await query(sql, [userId]);
    expect(await check(gw, "WELCOME20", { counter })).toEqual({ ok: false, reason: "not_allowed" });
    expect(find).not.toHaveBeenCalled();
    expect(counter).not.toHaveBeenCalled();
  });

  it("never logs what was typed for a malformed code, only its length", async () => {
    const gw = fakeGateway();
    expect(await check(gw, "4242 4242 4242 4242")).toEqual({ ok: false, reason: "invalid" });
    expect(info).toHaveBeenCalledWith("[promo] code refused", { length: 19, reason: "malformed" });
    expect(JSON.stringify(info.mock.calls)).not.toContain("4242");
  });

  it("refuses the eleventh try in an hour from one person, before asking Stripe", async () => {
    const gw = fakeGateway();
    const find = vi.spyOn(gw, "findPromotion");
    const counter = memoryCounter();
    for (let i = 0; i < 10; i++) expect(await check(gw, `TRY${i}`, { counter, ip: `10.0.0.${i}` })).toEqual({ ok: false, reason: "invalid" });
    expect(await check(gw, "TRY10", { counter, ip: "10.0.0.99" })).toEqual({ ok: false, reason: "rate_limited" });
    expect(find).toHaveBeenCalledTimes(10);
  });

  it("refuses many tries from one IP across accounts", async () => {
    const gw = fakeGateway();
    const counter = memoryCounter();
    const ids = (
      await query<{ id: string }>(
        `insert into users (email, name, plan, currency, path, email_verified_at, signup_step, status, consent_at)
         select 'p' || i || '@example.com', 'P', 'monthly', 'CAD', 'new', now(), 'done', 'trial', now() from generate_series(1, 31) i returning id`,
      )
    ).map((r) => r.id);
    for (const id of ids.slice(0, 30)) {
      await checkPromoCode(query, gw, { userId: id, ip: "9.9.9.9", code: "X1", currency: "CAD" }, { now: NOW, counter });
    }
    expect(await checkPromoCode(query, gw, { userId: ids[30], ip: "9.9.9.9", code: "X1", currency: "CAD" }, { now: NOW, counter })).toEqual({ ok: false, reason: "rate_limited" });
  });
});
