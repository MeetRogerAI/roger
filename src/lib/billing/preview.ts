import type { Query } from "@/lib/db-query";
import { counterFor, hit, limits, refund, type Counter } from "@/lib/rate-limit";
import { CouponUnavailable, type CardGateway, type MonthlyPreview } from "./gateway";
import { isNoCardTrialUser } from "./has-card";
import { checkBillingLocation } from "./location";
import type { Currency } from "./prices";

/**
 * The Payment page's live tax line (plan 2026-11-26-001, Unit 4). The price
 * and currency are the server's; the client sends only country and postal
 * code, which are validated before Stripe is asked. Only a trial still waiting
 * for its card may ask (the Unit 6 action checks too).
 *
 * Previews are cached briefly per (currency, country, postal), so typing the
 * same code again, or many people in the same postal area, cost no Stripe
 * call; only a cache miss counts against the per-user and per-IP limits. The
 * cache is in memory, per server instance: on Vercel Fluid Compute an
 * instance serves many requests, so it absorbs repeats within one person's
 * visit, and a miss on another instance only costs one preview. Nothing in it
 * is personal: the preview is made without the customer, from the inputs in
 * the key alone. Not cached: a "pending" tax answer (usually Stripe's passing
 * trouble) and any preview with a coupon (a coupon deleted or used up since
 * must not keep showing its discount).
 *
 * Stripe failing (timeout, 5xx, network) answers "unavailable", and the
 * attempt is given back to both limits: it was not the person's doing.
 */

export type TaxQuote =
  | { ok: true; preview: MonthlyPreview; cached: boolean }
  | { ok: false; reason: "invalid_location" | "rate_limited" | "coupon_unavailable" | "unavailable" | "not_allowed" };

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
  q: Query,
  gw: Pick<CardGateway, "previewMonthly">,
  o: { userId: string; ip: string; currency: Currency; country: unknown; postal: unknown; coupon?: string | null },
  d: { now?: Date; counter?: Counter; cache?: PreviewCache } = {},
): Promise<TaxQuote> {
  const loc = checkBillingLocation(o.country, o.postal);
  if (!loc.ok) return { ok: false, reason: "invalid_location" };
  if (!(await isNoCardTrialUser(q, o.userId))) return { ok: false, reason: "not_allowed" };
  const now = d.now ?? new Date();
  const cache = d.cache ?? sharedPreviewCache;
  const coupon = o.coupon || null;
  const key = [o.currency, loc.location.country, loc.location.postal].join("|");
  const hitCache = coupon ? null : cache.get(key, now);
  if (hitCache) return { ok: true, preview: hitCache, cached: true };

  const counter = d.counter ?? counterFor(q);
  const keys = [`tax:user:${o.userId}`, `tax:ip:${o.ip}`] as const;
  const allowed = [await hit(keys[0], limits.taxPerUser, now, counter), await hit(keys[1], limits.taxPerIp, now, counter)];
  if (allowed.includes(false)) return { ok: false, reason: "rate_limited" };

  let preview: MonthlyPreview;
  try {
    preview = await gw.previewMonthly({ currency: o.currency, country: loc.location.country, postal: loc.location.postal, coupon });
  } catch (e) {
    if (e instanceof CouponUnavailable) return { ok: false, reason: "coupon_unavailable" };
    console.error("[tax] preview failed", { message: (e as Error)?.message });
    await refund(keys[0], limits.taxPerUser, now, counter).catch(() => {});
    await refund(keys[1], limits.taxPerIp, now, counter).catch(() => {});
    return { ok: false, reason: "unavailable" };
  }
  if (preview.tax === "calculated" && !coupon) cache.set(key, preview, now);
  return { ok: true, preview, cached: false };
}
