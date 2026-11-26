"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/access";
import { cardSavePath } from "@/lib/billing/card-saved";
import { CHECKOUT_LIMITED, discardSetupSession, finishCardSave, openEmbeddedSetup, type EmbeddedSetup } from "@/lib/billing/card-setup";
import { stripeGateway, type CardGateway, type MonthlyPreview } from "@/lib/billing/gateway";
import { NO_CARD_TRIAL_SQL } from "@/lib/billing/has-card";
import { paymentAccount, paymentPrice, pendingPromoView, type PaymentAccount } from "@/lib/billing/payment-page";
import type { PromoView } from "@/lib/billing/payment-view";
import { amount, type Currency } from "@/lib/billing/prices";
import { choosePromoCode, clearPendingPromo, PROMO_INVALID } from "@/lib/billing/promo";
import { query } from "@/lib/db-query";
import { appUrl } from "@/lib/mail/layout";
import { clientIp } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

/**
 * The Payment page's actions (plan 2026-11-26-001, Unit 6). Server actions
 * are public endpoints, so every one starts with the same guard: the
 * signed-in member, still a trial with no card and a held list. Anyone else
 * is refused before anything is read from Stripe or written. The browser
 * sends only a currency choice, a country and postal code, or a promo code;
 * every amount is worked out here. The rate limits live in the library calls
 * (`quoteMonthly`, `choosePromoCode`, `openEmbeddedSetup`).
 */

export type Location = { country?: unknown; postal?: unknown };
export type Refused = { ok: false; message: string };
/** `promo` absent: unchanged; null: no code pending (removed, or dropped because it no longer applies). */
export type Priced = { ok: true; price: MonthlyPreview; promo?: PromoView | null; notice?: string };
export type SessionOpened = { ok: true; sessionId: string; clientSecret: string };

const SIGNED_OUT = "Your sign-in has ended. Sign in again to add your card.";
const NOT_HERE = "There’s no card to add here. Go back to Roger.";
const OFF = "Card payments aren’t switched on yet. Try again soon, or write to us.";
const TRY_AGAIN = "We couldn’t open the card form. Try again in a moment.";

type Guarded = { ok: true; account: PaymentAccount; gw: CardGateway; ip: string };

/** The one guard (see above). Reads only; refuses with a message. */
async function guard(): Promise<Guarded | Refused> {
  const s = await getSession();
  if (!s) return { ok: false, message: SIGNED_OUT };
  const account = await paymentAccount(query, s.userId);
  if (!account) return { ok: false, message: NOT_HERE };
  const gw = stripeGateway();
  if (!gw) return { ok: false, message: OFF };
  return { ok: true, account, gw, ip: clientIp(await headers()) };
}

/** The plan price in cents for display before Stripe's preview (the settings' amount). */
async function planCents(currency: Currency): Promise<number> {
  return Math.round(amount(await getV3SettingsForDisplay(), "monthly", currency) * 100);
}

async function priced(g: Guarded, currency: Currency, promo: PromoView | null, coupon: string | null, loc: Location = {}): Promise<Priced> {
  const r = await paymentPrice(query, g.gw, {
    userId: g.account.userId,
    ip: g.ip,
    currency,
    subtotalCents: await planCents(currency),
    promo,
    coupon,
    country: loc.country,
    postal: loc.postal,
  });
  return { ok: true, price: r.price, promo: r.promo, notice: r.notice };
}

/**
 * A stored session that already holds a confirmed card: run the completion
 * (as the return page does) and send the member on. `redirect` throws, so it
 * is called outside any try.
 */
async function finishSaved(userId: string, gw: CardGateway, sessionId: string): Promise<never> {
  const r = await finishCardSave(query, gw, sessionId, { expectUserId: userId, getSettings: readV3Settings });
  redirect(r.outcome === "pending" ? `/start/payment/done?session_id=${encodeURIComponent(sessionId)}` : r.outcome === "not_yours" ? "/app" : cardSavePath(r));
}

function sessionAnswer(r: EmbeddedSetup): SessionOpened | Refused {
  if (r.ok) return { ok: true, sessionId: r.sessionId, clientSecret: r.clientSecret };
  if (r.reason === "rate_limited") return { ok: false, message: CHECKOUT_LIMITED };
  if (r.reason === "not_allowed" || r.reason === "not_found") return { ok: false, message: NOT_HERE };
  return { ok: false, message: TRY_AGAIN };
}

async function open(g: Guarded): Promise<SessionOpened | Refused> {
  const r = await openEmbeddedSetup(query, g.gw, { userId: g.account.userId, ip: g.ip, returnUrl: paymentReturnUrl() });
  if (!r.ok && r.reason === "complete") return finishSaved(g.account.userId, g.gw, r.sessionId);
  return sessionAnswer(r);
}

/** Where Stripe sends the person after confirming (Unit 5's return page). */
function paymentReturnUrl(): string {
  return `${appUrl("/start/payment/done")}?session_id={CHECKOUT_SESSION_ID}`;
}

/**
 * The USD / CAD toggle (origin R15). Allowed until the card is saved (the
 * guard). The open card session is in the old currency, so it is closed
 * (`discardSetupSession`) and a new one opened; a session that completed in
 * the meantime is finished instead. The pending promo code is kept: the card
 * save re-checks it in the new currency.
 */
export async function setPaymentCurrency(
  wanted: unknown,
  loc: Location = {},
): Promise<(Priced & SessionOpened & { currency: Currency }) | Refused> {
  if (wanted !== "USD" && wanted !== "CAD") return { ok: false, message: "Choose US or Canadian dollars." };
  const currency: Currency = wanted;
  const g = await guard();
  if (!g.ok) return g;
  if (currency !== g.account.currency) {
    const d = await discardSetupSession(query, g.gw, g.account.userId);
    if (d === "complete") {
      const [u] = await query<{ setup_session: string | null }>(`select setup_session from users where id = $1`, [g.account.userId]);
      if (u?.setup_session) return finishSaved(g.account.userId, g.gw, u.setup_session);
    }
    await query(`update users u set currency = $2 where u.id = $1 and ${NO_CARD_TRIAL_SQL("u")}`, [g.account.userId, currency]);
  }
  const s = await open(g);
  if (!s.ok) return s;
  const account = { ...g.account, currency };
  const promo = await pendingPromoView(g.gw, account);
  const p = await priced({ ...g, account }, currency, promo, account.promoCoupon, loc);
  return { ...p, ...s, currency };
}

/**
 * The live tax line (origin R16): the client sends the country and postal
 * code once both are valid (debounced). Previews are cached and rate-limited
 * in `quoteMonthly`; a refused or failed preview shows the plan price with
 * the tax still to come.
 */
export async function quoteTax(country: unknown, postal: unknown): Promise<Priced | Refused> {
  const g = await guard();
  if (!g.ok) return g;
  // No promo lookup on every keystroke: Stripe's preview carries the discount. The stored code only
  // matters here if the preview fails (the plan price is then shown without a discount amount).
  const a = g.account;
  const stored: PromoView | null = a.promoCode
    ? { code: a.promoCode, label: a.promoLabel ?? a.promoCode, duration: null, durationInMonths: null, percentOff: null, amountOffCents: null }
    : null;
  const r = await paymentPrice(query, g.gw, {
    userId: a.userId,
    ip: g.ip,
    currency: a.currency,
    subtotalCents: await planCents(a.currency),
    promo: stored,
    coupon: a.promoCoupon,
    country,
    postal,
  });
  if (r.rateLimited) return { ok: false, message: r.notice! };
  // The promo is sent back only when it changed (dropped because Stripe no longer accepts it).
  return { ok: true, price: r.price, ...(stored && !r.promo ? { promo: null } : {}), notice: r.notice };
}

/** "Have a promo code?" → Apply (origin R17). Checked by Stripe and Roger; any refusal reads the same. */
export async function applyPromo(code: unknown, loc: Location = {}): Promise<Priced | Refused> {
  if (typeof code !== "string" || !code.trim()) return { ok: false, message: "Enter a code." };
  const g = await guard();
  if (!g.ok) return g;
  const r = await choosePromoCode(query, g.gw, {
    userId: g.account.userId,
    ip: g.ip,
    code: code.trim().slice(0, 60),
    currency: g.account.currency,
    customer: g.account.customer,
  });
  if (!r.ok) return { ok: false, message: r.reason === "rate_limited" ? "Too many tries. Wait a while and try again." : r.reason === "not_allowed" ? NOT_HERE : PROMO_INVALID };
  const p = r.promotion;
  const promo: PromoView = { code: p.code, label: p.label, duration: p.duration, durationInMonths: p.durationInMonths, percentOff: p.percentOff, amountOffCents: p.amountOffCents };
  return priced(g, g.account.currency, promo, p.couponId, loc);
}

/** "Remove": back to the full price. */
export async function removePromo(loc: Location = {}): Promise<Priced | Refused> {
  const g = await guard();
  if (!g.ok) return g;
  await clearPendingPromo(query, g.account.userId);
  return priced(g, g.account.currency, null, null, loc);
}

/** The card form's session again (Stripe failed to load it, or it expired while the page was open). */
export async function openSession(): Promise<SessionOpened | Refused> {
  const g = await guard();
  if (!g.ok) return g;
  return open(g);
}
