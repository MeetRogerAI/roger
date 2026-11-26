import type { Query } from "@/lib/db-query";
import { counterFor, hit, limits, type Counter } from "@/lib/rate-limit";
import { refusePromotion, type CardGateway, type Promotion } from "./gateway";
import type { Currency } from "./prices";

/**
 * "Have a promo code?" on the Payment page (plan 2026-11-26-001, Unit 4).
 * Checked on the server only, rate-limited per user and per IP. Stripe's own
 * limits are judged in the gateway; Roger then adds its own reservations
 * (written at card save, Unit 5), because the coupon is applied directly and
 * Stripe never counts the redemption. A refusal is always the same generic
 * answer; the reason is logged.
 */
export type PromoCheck = { ok: true; promotion: Promotion } | { ok: false; reason: "invalid" | "rate_limited" };

export async function checkPromoCode(
  q: Query,
  gw: Pick<CardGateway, "findPromotion">,
  o: { userId: string; ip: string; code: string; currency: Currency; customer?: string | null },
  d: { now?: Date; counter?: Counter } = {},
): Promise<PromoCheck> {
  const now = d.now ?? new Date();
  const counter = d.counter ?? counterFor(q);
  const allowed = [await hit(`promo:user:${o.userId}`, limits.promoPerUser, now, counter), await hit(`promo:ip:${o.ip}`, limits.promoPerIp, now, counter)];
  if (allowed.includes(false)) return { ok: false, reason: "rate_limited" };

  const found = await gw.findPromotion(o.code, o.currency, { customer: o.customer ?? null, now });
  if (!found.valid) return { ok: false, reason: "invalid" };
  if (found.maxRedemptions != null) {
    const [r] = await q<{ n: number | string }>(`select count(*) as n from promo_reservations where promotion_code = $1 and user_id <> $2`, [found.promotionCodeId, o.userId]);
    if (found.timesRedeemed + Number(r.n) >= found.maxRedemptions) {
      refusePromotion(found.code, "limit_reached");
      return { ok: false, reason: "invalid" };
    }
  }
  return { ok: true, promotion: found };
}

/** What the person reads for any refused code. */
export const PROMO_INVALID = "That code isn’t valid.";
