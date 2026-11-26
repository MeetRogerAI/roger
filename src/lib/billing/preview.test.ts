import { describe, expect, it, vi } from "vitest";
import type { Counter } from "@/lib/rate-limit";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { previewCache, quoteMonthly } from "./preview";

function memoryCounter(): Counter {
  const m = new Map<string, number>();
  return async (key, start) => {
    const k = `${key}@${start}`;
    m.set(k, (m.get(k) ?? 0) + 1);
    return m.get(k)!;
  };
}

const NOW = new Date("2026-11-26T15:00:00Z");
const quote = (gw: ReturnType<typeof fakeGateway>, o: { currency?: "USD" | "CAD"; country: unknown; postal: unknown; coupon?: string; userId?: string }, d: { cache?: ReturnType<typeof previewCache>; counter?: Counter; now?: Date } = {}) =>
  quoteMonthly(gw, { userId: o.userId ?? "u1", ip: "1.2.3.4", currency: o.currency ?? "CAD", country: o.country, postal: o.postal, coupon: o.coupon }, { now: d.now ?? NOW, counter: d.counter ?? memoryCounter(), cache: d.cache ?? previewCache() });

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

  it("serves repeated identical inputs from the cache, without a Stripe call or a rate-limit count", async () => {
    const gw = fakeGateway();
    const cache = previewCache();
    const counter = vi.fn(memoryCounter());
    await quote(gw, { country: "CA", postal: "M5V 2T6" }, { cache, counter });
    const again = await quote(gw, { country: "CA", postal: "m5v 2t6", userId: "u2" }, { cache, counter });
    expect(again).toMatchObject({ ok: true, cached: true, preview: { totalCents: 31640 } });
    expect(gw.payment.previews).toHaveLength(1);
    expect(counter).toHaveBeenCalledTimes(2); // the user and IP counts of the first (missed) call only
  });

  it("keys the cache by currency, country, postal code and coupon, and forgets after ten minutes", async () => {
    const gw = fakeGateway();
    gw.payment.addPromotion({ code: "C", coupon: { id: "co_c" } });
    const cache = previewCache();
    await quote(gw, { country: "CA", postal: "M5V 2T6" }, { cache });
    await quote(gw, { country: "CA", postal: "M5V 2T6", coupon: "co_c" }, { cache });
    await quote(gw, { currency: "USD", country: "CA", postal: "M5V 2T6" }, { cache });
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
});
