import { hit, limits, postgresCounter, type Counter } from "@/lib/rate-limit";
import { CouponUnavailable, type CardGateway, type MonthlyPreview } from "./gateway";
import { checkBillingLocation } from "./location";
import type { Currency } from "./prices";

/**
 * The Payment page's live tax line (plan 2026-11-26-001, Unit 4). The price
 * and currency are the server's; the client sends only country and postal
 * code, which are validated before Stripe is asked.
 *
 * Previews are cached briefly per (currency, country, postal, coupon), so
 * typing the same code again, or many people in the same postal area, cost no
 * Stripe call; only a cache miss counts against the per-user and per-IP
 * limits. The cache is in memory, per server instance: on Vercel Fluid
 * Compute an instance serves many requests, so it absorbs repeats within one
 * person's visit, and a miss on another instance only costs one preview.
 * Nothing in it is personal: the preview is made without the customer, from
 * the inputs in the key alone. A "pending" tax answer is not cached (it is
 * usually Stripe's passing trouble).
 */

export type TaxQuote =
  | { ok: true; preview: MonthlyPreview; cached: boolean }
  | { ok: false; reason: "invalid_location" | "rate_limited" | "coupon_unavailable" };

export type PreviewCache = {
  get(key: string, now: Date): MonthlyPreview | null;
  set(key: string, value: MonthlyPreview, now: Date): void;
};

export function previewCache(ttlMs = 10 * 60 * 1000, max = 500): PreviewCache {
  const m = new Map<string, { at: number; value: MonthlyPreview }>();
  return {
    get(key, now) {
      const e = m.get(key);
      if (!e) return null;
      if (now.getTime() - e.at > ttlMs) {
        m.delete(key);
        return null;
      }
      return e.value;
    },
    set(key, value, now) {
      m.delete(key);
      m.set(key, { at: now.getTime(), value });
      // A Map keeps insertion order: the oldest entry goes first.
      while (m.size > max) m.delete(m.keys().next().value!);
    },
  };
}

/** The instance's own cache (see above). */
export const sharedPreviewCache = previewCache();

export async function quoteMonthly(
  gw: Pick<CardGateway, "previewMonthly">,
  o: { userId: string; ip: string; currency: Currency; country: unknown; postal: unknown; coupon?: string | null },
  d: { now?: Date; counter?: Counter; cache?: PreviewCache } = {},
): Promise<TaxQuote> {
  const loc = checkBillingLocation(o.country, o.postal);
  if (!loc.ok) return { ok: false, reason: "invalid_location" };
  const now = d.now ?? new Date();
  const cache = d.cache ?? sharedPreviewCache;
  const key = [o.currency, loc.location.country, loc.location.postal, o.coupon ?? ""].join("|");
  const hitCache = cache.get(key, now);
  if (hitCache) return { ok: true, preview: hitCache, cached: true };

  const counter = d.counter ?? postgresCounter;
  const allowed = [await hit(`tax:user:${o.userId}`, limits.taxPerUser, now, counter), await hit(`tax:ip:${o.ip}`, limits.taxPerIp, now, counter)];
  if (allowed.includes(false)) return { ok: false, reason: "rate_limited" };

  let preview: MonthlyPreview;
  try {
    preview = await gw.previewMonthly({ currency: o.currency, country: loc.location.country, postal: loc.location.postal, coupon: o.coupon ?? null });
  } catch (e) {
    if (e instanceof CouponUnavailable) return { ok: false, reason: "coupon_unavailable" };
    throw e;
  }
  if (preview.tax === "calculated") cache.set(key, preview, now);
  return { ok: true, preview, cached: false };
}
