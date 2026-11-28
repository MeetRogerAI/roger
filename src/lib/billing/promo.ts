import type { Query } from "@/lib/db-query";
import { counterFor, hit, limits, type Counter } from "@/lib/rate-limit";
import { refusePromotion, type CardGateway, type Promotion } from "./gateway";
import { isNoCardTrialUser, NO_CARD_TRIAL_SQL } from "./has-card";
import type { Currency } from "./prices";

/**
 * "Have a promo code?" on the Payment page (plan 2026-11-26-001, Unit 4).
 * Checked on the server only, rate-limited per user and per IP. Stripe's own
 * limits are judged in the gateway; Roger then adds its own reservations
 * (written at card save, Unit 5), because the coupon is applied directly and
 * Stripe never counts the redemption. A refusal is always the same generic
 * answer; the reason is logged. Only a trial still waiting for its card may
 * ask (the Unit 6 action checks too).
 */
export type PromoCheck = { ok: true; promotion: Promotion } | { ok: false; reason: "invalid" | "rate_limited" | "not_allowed" };

export async function checkPromoCode(
  q: Query,
  gw: Pick<CardGateway, "findPromotion">,
  o: { userId: string; ip: string; code: string; currency: Currency; customer?: string | null },
  d: { now?: Date; counter?: Counter } = {},
): Promise<PromoCheck> {
  if (!(await isNoCardTrialUser(q, o.userId))) return { ok: false, reason: "not_allowed" };
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

/**
 * The pending promo selection (plan 2026-11-26-001, Unit 5): the code the
 * person applied on the Payment page, kept on the user until the card is
 * saved. `users.promo_code` is the code as Stripe holds it (the completion
 * looks it up again by this text), `promo_coupon` the coupon applied at
 * preview and at the first charge, `promo_label` what the Price Box shows.
 * At card save the completion re-checks the code and either locks it in (a
 * `promo_reservations` row) or clears all three and stamps `promo_refused_at`.
 * Only a trial still waiting for its card can change it; once the card is
 * saved the selection is fixed. Returns whether it was stored.
 */
export async function setPendingPromo(
  q: Query,
  userId: string,
  p: Pick<Promotion, "code" | "couponId" | "label"> & Partial<Pick<Promotion, "duration" | "durationInMonths">>,
): Promise<boolean> {
  // The coupon's duration is kept with it (Unit 8 review F5), for the Price Box and the first-charge emails.
  const rows = await q(
    `update users u set promo_code = $2, promo_coupon = $3, promo_label = $4, promo_duration = $5, promo_duration_months = $6, promo_refused_at = null
     where u.id = $1 and ${NO_CARD_TRIAL_SQL("u")} returning u.id`,
    [userId, p.code, p.couponId, p.label, p.duration ?? null, p.durationInMonths ?? null],
  );
  return rows.length > 0;
}

/** "Remove" on the Payment page: no code pending. Only before the card is saved. */
export async function clearPendingPromo(q: Query, userId: string): Promise<boolean> {
  const rows = await q(
    `update users u set promo_code = null, promo_coupon = null, promo_label = null, promo_duration = null, promo_duration_months = null
     where u.id = $1 and ${NO_CARD_TRIAL_SQL("u")} returning u.id`,
    [userId],
  );
  return rows.length > 0;
}

/**
 * "Apply" on the Payment page: the code is checked (`checkPromoCode`: limits,
 * Stripe, Roger's reservations) and, if valid, stored as the pending
 * selection. Unit 6's `applyPromo` action calls this after its own guard.
 */
export async function choosePromoCode(
  q: Query,
  gw: Pick<CardGateway, "findPromotion">,
  o: { userId: string; ip: string; code: string; currency: Currency; customer?: string | null },
  d: { now?: Date; counter?: Counter } = {},
): Promise<PromoCheck> {
  const r = await checkPromoCode(q, gw, o, d);
  if (!r.ok) return r;
  if (!(await setPendingPromo(q, o.userId, r.promotion))) return { ok: false, reason: "not_allowed" };
  return r;
}
