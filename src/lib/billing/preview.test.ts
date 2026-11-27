import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Counter } from "@/lib/rate-limit";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { TEST_SPONSOR, testDb, testSponsor } from "@/test-helpers/pglite-db";
import { previewCache, quoteMonthly } from "./preview";

/** An in-memory counter that honours refunds (`by` -1). */
function memoryCounter(): Counter & { counts: Map<string, number> } {
  const m = new Map<string, number>();
  const c = async (key: string, start: number, _exp: Date, by = 1) => {
    const k = `${key}@${start}`;
    m.set(k, Math.max(0, (m.get(k) ?? 0) + by));
    return m.get(k)!;
  };
  return Object.assign(c, { counts: m });
}

const NOW = new Date("2026-11-26T15:00:00Z");
let query: Query;
let u1: string;
let u2: string;

const insertTrials = async (n: number) =>
  (
    await query<{ id: string }>(
      `insert into users (email, name, plan, currency, path, email_verified_at, signup_step, status, consent_at)
       select 't' || i || '-' || gen_random_uuid() || '@example.com', 'T', 'monthly', 'CAD', 'new', now(), 'done', 'trial', now()
       from generate_series(1, $1::int) i returning id`,
      [n],
    )
  ).map((r) => r.id);

beforeEach(async () => {
  ({ query } = await testDb());
  [u1, u2] = await insertTrials(2);
});

type QuoteArgs = { currency?: "USD" | "CAD"; country: unknown; postal: unknown; coupon?: string; userId?: string; ip?: string };
const quote = (gw: ReturnType<typeof fakeGateway>, o: QuoteArgs, d: { cache?: ReturnType<typeof previewCache>; counter?: Counter; now?: Date } = {}) =>
  quoteMonthly(
    query,
    gw,
    { userId: o.userId ?? u1, ip: o.ip ?? "1.2.3.4", currency: o.currency ?? "CAD", country: o.country, postal: o.postal, coupon: o.coupon },
    { now: d.now ?? NOW, counter: d.counter ?? memoryCounter(), cache: d.cache ?? previewCache() },
  );

describe("quoteMonthly (plan 2026-11-26-001, Unit 4)", () => {
  it("CAD and a Toronto postal code: CA$280.00, HST at 13%, total CA$316.40", async () => {
    const gw = fakeGateway();
    expect(await quote(gw, { country: "CA", postal: "m5v2t6" })).toEqual({
      ok: true,
      cached: false,
      preview: { currency: "CAD", subtotalCents: 28000, discountCents: 0, tax: "calculated", taxCents: 3640, taxName: "HST", taxRate: 13, totalCents: 31640 },
    });
    // The postal code reaches Stripe normalised.
    expect(gw.payment.previews[0]).toMatchObject({ currency: "CAD", country: "CA", postal: "M5V 2T6", coupon: null });
  });

  it("a US ZIP where Roger collects no tax: tax 0 and no tax name (the page says \"No sales tax\")", async () => {
    const gw = fakeGateway();
    expect(await quote(gw, { currency: "USD", country: "US", postal: "10001" })).toMatchObject({
      ok: true,
      preview: { subtotalCents: 20000, tax: "calculated", taxCents: 0, taxName: null, totalCents: 20000 },
    });
  });

  it("says the tax is pending when Stripe cannot place the location, and does not cache that answer", async () => {
    const gw = fakeGateway();
    gw.payment.taxPending.add("X0X 0X0");
    const cache = previewCache();
    expect(await quote(gw, { country: "CA", postal: "X0X 0X0" }, { cache })).toMatchObject({ ok: true, preview: { tax: "pending", taxCents: 0, totalCents: 28000 } });
    await quote(gw, { country: "CA", postal: "X0X 0X0" }, { cache });
    expect(gw.payment.previews).toHaveLength(2);
  });

  it("applies a coupon: a discount line and a lower total", async () => {
    const gw = fakeGateway();
    gw.payment.addPromotion({ code: "WELCOME20", coupon: { id: "co_20", percentOff: 20 } });
    expect(await quote(gw, { country: "CA", postal: "M5V 2T6", coupon: "co_20" })).toMatchObject({ ok: true, preview: { discountCents: 5600, totalCents: 25312 } });
  });

  it("reports a coupon that no longer applies, so the page can drop it", async () => {
    const gw = fakeGateway();
    expect(await quote(gw, { country: "CA", postal: "M5V 2T6", coupon: "co_gone" })).toEqual({ ok: false, reason: "coupon_unavailable" });
  });

  it("never caches a preview with a coupon: a coupon deleted since is reported at once", async () => {
    const gw = fakeGateway();
    gw.payment.addPromotion({ code: "WELCOME20", coupon: { id: "co_20", percentOff: 20 } });
    const cache = previewCache();
    expect(await quote(gw, { country: "CA", postal: "M5V 2T6", coupon: "co_20" }, { cache })).toMatchObject({ ok: true, cached: false });
    gw.payment.coupons.delete("co_20");
    expect(await quote(gw, { country: "CA", postal: "M5V 2T6", coupon: "co_20" }, { cache })).toEqual({ ok: false, reason: "coupon_unavailable" });
    expect(gw.payment.previews).toHaveLength(2);
  });

  it.each([
    ["another country", "GB", "SW1A 1AA"],
    ["no country", "", "M5V 2T6"],
    ["a malformed Canadian postal code", "CA", "M5V"],
    ["a Canadian code with a letter Canada Post never uses", "CA", "D5V 2T6"],
    ["a ZIP+4", "US", "10001-1234"],
    ["a four-digit ZIP", "US", "1000"],
    ["a non-string", "CA", 12345],
  ])("refuses %s without asking Stripe", async (_n, country, postal) => {
    const gw = fakeGateway();
    expect(await quote(gw, { country, postal })).toEqual({ ok: false, reason: "invalid_location" });
    expect(gw.payment.previews).toHaveLength(0);
  });

  it.each([
    ["a trial whose card is saved", "update users set trial_started_at = now() where id = $1"],
    ["a sponsored trial", `update users set sponsor_id = '${TEST_SPONSOR}' where id = $1`],
    ["an active member", "update users set status = 'active', trial_started_at = now() where id = $1"],
  ])("refuses %s (not_allowed), without counting or asking Stripe", async (_n, sql) => {
    const gw = fakeGateway();
    const counter = vi.fn(memoryCounter());
    await testSponsor(query);
    await query(sql, [u1]);
    expect(await quote(gw, { country: "CA", postal: "M5V 2T6" }, { counter })).toEqual({ ok: false, reason: "not_allowed" });
    expect(counter).not.toHaveBeenCalled();
    expect(gw.payment.previews).toHaveLength(0);
  });

  it("serves repeated identical inputs from the cache, without a Stripe call or a rate-limit count", async () => {
    const gw = fakeGateway();
    const cache = previewCache();
    const counter = vi.fn(memoryCounter());
    await quote(gw, { country: "CA", postal: "M5V 2T6" }, { cache, counter });
    const again = await quote(gw, { country: "CA", postal: "m5v 2t6", userId: u2 }, { cache, counter });
    expect(again).toMatchObject({ ok: true, cached: true, preview: { totalCents: 31640 } });
    expect(gw.payment.previews).toHaveLength(1);
    expect(counter).toHaveBeenCalledTimes(2); // the user and IP counts of the first (missed) call only
  });

  it("keys the cache by currency, country and postal code, and forgets after ten minutes", async () => {
    const gw = fakeGateway();
    const cache = previewCache();
    await quote(gw, { country: "CA", postal: "M5V 2T6" }, { cache });
    await quote(gw, { currency: "USD", country: "CA", postal: "M5V 2T6" }, { cache });
    await quote(gw, { country: "CA", postal: "M5V 2T7" }, { cache });
    expect(gw.payment.previews).toHaveLength(3);
    await quote(gw, { country: "CA", postal: "M5V 2T6" }, { cache, now: new Date(NOW.getTime() + 5 * 60 * 1000) });
    expect(gw.payment.previews).toHaveLength(3);
    await quote(gw, { country: "CA", postal: "M5V 2T6" }, { cache, now: new Date(NOW.getTime() + 11 * 60 * 1000) });
    expect(gw.payment.previews).toHaveLength(4);
  });

  it("drops the oldest entry once full", () => {
    const cache = previewCache(60_000, 2);
    const p = { currency: "CAD", subtotalCents: 1, discountCents: 0, tax: "calculated", taxCents: 0, taxName: null, taxRate: null, totalCents: 1 } as const;
    cache.set("a", p, NOW);
    cache.set("b", p, NOW);
    cache.set("c", p, NOW);
    expect([cache.get("a", NOW), cache.get("b", NOW), cache.get("c", NOW)].map(Boolean)).toEqual([false, true, true]);
  });

  it("rate-limits uncached previews per user", async () => {
    const gw = fakeGateway();
    const counter = memoryCounter();
    const cache = previewCache();
    const zips = Array.from({ length: 41 }, (_, i) => String(10000 + i));
    const results = [];
    for (const z of zips) results.push(await quote(gw, { currency: "USD", country: "US", postal: z }, { cache, counter }));
    expect(results.slice(0, 40).every((r) => r.ok)).toBe(true);
    expect(results[40]).toEqual({ ok: false, reason: "rate_limited" });
    expect(gw.payment.previews).toHaveLength(40);
  });

  it("rate-limits uncached previews per IP across accounts", async () => {
    const gw = fakeGateway();
    const counter = memoryCounter();
    const cache = previewCache();
    const ids = await insertTrials(121);
    const results = [];
    for (const [i, id] of ids.entries()) results.push(await quote(gw, { currency: "USD", country: "US", postal: String(20000 + i), userId: id, ip: "9.9.9.9" }, { cache, counter }));
    expect(results.slice(0, 120).every((r) => r.ok)).toBe(true);
    expect(results[120]).toEqual({ ok: false, reason: "rate_limited" });
    expect(gw.payment.previews).toHaveLength(120);
  });

  describe("when Stripe fails (timeout, 5xx, network)", () => {
    let error: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      error = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => error.mockRestore());

    it("answers unavailable instead of throwing, and gives the attempt back to both limits", async () => {
      const gw = fakeGateway();
      vi.spyOn(gw, "previewMonthly").mockRejectedValue(Object.assign(new Error("Request timed out"), { type: "StripeConnectionError" }));
      const counter = memoryCounter();
      const cache = previewCache();
      expect(await quote(gw, { country: "CA", postal: "M5V 2T6" }, { counter, cache })).toEqual({ ok: false, reason: "unavailable" });
      expect([...counter.counts.values()]).toEqual([0, 0]);
      expect(error).toHaveBeenCalledWith("[tax] preview failed", { message: "Request timed out" });
      // Nothing was cached: the next try asks Stripe again.
      vi.mocked(gw.previewMonthly).mockRestore();
      expect(await quote(gw, { country: "CA", postal: "M5V 2T6" }, { counter, cache })).toMatchObject({ ok: true, cached: false });
    });

    it("never spends the person's budget on failures: 50 failures, then a preview still goes through", async () => {
      const gw = fakeGateway();
      const spy = vi.spyOn(gw, "previewMonthly").mockRejectedValue(Object.assign(new Error("api down"), { type: "StripeAPIError", statusCode: 503 }));
      const counter = memoryCounter();
      for (let i = 0; i < 50; i++) expect(await quote(gw, { country: "CA", postal: "M5V 2T6" }, { counter })).toEqual({ ok: false, reason: "unavailable" });
      spy.mockRestore();
      expect(await quote(gw, { country: "CA", postal: "M5V 2T6" }, { counter })).toMatchObject({ ok: true });
    });
  });
});

describe("the fake preview's coupons", () => {
  it("throws CouponUnavailable for a coupon past its redeem_by, like Stripe's coupon_expired", async () => {
    const gw = fakeGateway();
    gw.payment.addPromotion({ code: "LATE", coupon: { id: "co_late", redeemBy: Math.floor(Date.now() / 1000) - 60 } });
    gw.payment.addPromotion({ code: "SOON", coupon: { id: "co_soon", redeemBy: Math.floor(Date.now() / 1000) + 3600 } });
    await expect(gw.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6", coupon: "co_late" })).rejects.toThrow("expired");
    await expect(gw.previewMonthly({ currency: "CAD", country: "CA", postal: "M5V 2T6", coupon: "co_soon" })).resolves.toMatchObject({ discountCents: 5600 });
    expect(await quote(gw, { country: "CA", postal: "M5V 2T6", coupon: "co_late" })).toEqual({ ok: false, reason: "coupon_unavailable" });
  });
});
