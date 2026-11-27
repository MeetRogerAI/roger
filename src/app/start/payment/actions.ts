"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/access";
import { CHECKOUT_LIMITED, finishCardSave, openEmbeddedSetup, type EmbeddedSetup } from "@/lib/billing/card-setup";
import { stripeCredits, stripeGateway, type CardGateway, type MonthlyPreview } from "@/lib/billing/gateway";
import { NO_CARD_TRIAL_SQL } from "@/lib/billing/has-card";
import {
  finishedSavePath,
  paymentAccount,
  paymentPrice,
  paymentReturnUrl,
  pendingPromoView,
  planCents,
  storedPromoView,
  type PaymentAccount,
} from "@/lib/billing/payment-page";
import type { PromoView } from "@/lib/billing/payment-view";
import type { Currency } from "@/lib/billing/prices";
import { choosePromoCode, clearPendingPromo, PROMO_INVALID } from "@/lib/billing/promo";
import { query } from "@/lib/db-query";
import { clientIp } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * The Payment page's actions (plan 2026-11-26-001, Unit 6). Server actions
 * are public endpoints, so every one starts with the same guard: the
 * signed-in member, still a trial with no card and a held list. Anyone else
 * is refused before anything is read from Stripe or written. The browser
 * sends only a currency choice, a country and postal code, or a promo code;
 * every amount is worked out here. The rate limits live in the library calls
 * (`quoteMonthly`, `choosePromoCode`, `openEmbeddedSetup`).
 */

/** What the browser sends for the tax line (checked here, never trusted). */
export type BillingLocationInput = { country?: unknown; postal?: unknown };
export type Refused = { ok: false; message: string };
/**
 * `promo` absent: unchanged; null: no code pending (removed, or dropped because it no longer applies).
 * `taxRetry`: Stripe could not work out the tax for a valid location; the page asks again later.
 */
export type Priced = { ok: true; price: MonthlyPreview; promo?: PromoView | null; notice?: string; taxRetry?: boolean };
/** The account's currency and price, as the server holds them (`price.currency` is `currency`). */
export type Current = Priced & { currency: Currency };
/** A card session for the form, with the account's currency and price (always applied by the page). */
export type SessionOpened = Current & { sessionId: string; clientSecret: string };
/** A failed currency change: the account's currency and price when they could be read, so the page never shows a stale currency. */
export type SessionRefused = Refused & { current?: Current };

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

const joinNotices = (...n: (string | undefined)[]) => n.filter(Boolean).join(" ") || undefined;

async function priced(g: Guarded, currency: Currency, promo: PromoView | null, coupon: string | null, loc: BillingLocationInput = {}): Promise<Priced> {
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
  return { ok: true, price: r.price, promo: r.promo, notice: r.notice, ...(!r.rateLimited && r.taxRetry ? { taxRetry: true } : {}) };
}

/** The account's price in `currency`, with the pending code looked up again (a code that does not apply in that currency is dropped, with a notice). */
async function accountPrice(g: Guarded, currency: Currency, loc: BillingLocationInput): Promise<Current> {
  const account = { ...g.account, currency };
  const pending = await pendingPromoView(query, g.gw, account);
  const p = await priced({ ...g, account }, currency, pending.promo, pending.promo ? account.promoCoupon : null, loc);
  return { ...p, notice: joinNotices(pending.notice, p.notice), currency };
}

/**
 * A stored session that already holds a confirmed card: run the completion
 * (as the return page does) and send the member on. `redirect` throws, so it
 * is called outside any try.
 */
async function finishSaved(userId: string, gw: CardGateway, sessionId: string): Promise<never> {
  const r = await finishCardSave(query, gw, sessionId, { expectUserId: userId, getSettings: readV3Settings, credits: stripeCredits() ?? undefined });
  redirect(finishedSavePath(sessionId, r));
}

function refusal(r: Exclude<EmbeddedSetup, { ok: true }>): Refused {
  if (r.reason === "rate_limited") return { ok: false, message: CHECKOUT_LIMITED };
  if (r.reason === "not_allowed" || r.reason === "not_found") return { ok: false, message: NOT_HERE };
  return { ok: false, message: TRY_AGAIN };
}

const openSetup = (g: Guarded) => openEmbeddedSetup(query, g.gw, { userId: g.account.userId, ip: g.ip, returnUrl: paymentReturnUrl() });

/** The account's currency and price as stored now (after a failed change), or undefined when they cannot be read. */
async function currentState(g: Guarded, loc: BillingLocationInput): Promise<Current | undefined> {
  try {
    const account = await paymentAccount(query, g.account.userId);
    if (!account) return undefined;
    return await accountPrice({ ...g, account }, account.currency, loc);
  } catch (e) {
    console.warn("[payment] current price read failed", { message: (e as Error)?.message });
    return undefined;
  }
}

/**
 * The USD / CAD toggle (origin R15). Allowed until the card is saved (the
 * guard). Only the account's currency and the price change: the open card
 * session is kept (`openEmbeddedSetup` hands it back whatever currency it was
 * opened in, since saving a card does not depend on it and the first charge
 * uses the account's currency), so the card form does not reload and the
 * card-session limits are not touched. A session that completed in the
 * meantime is finished instead, in the currency it was saved in. When no
 * session can be opened the currency still changes, and the page gets the
 * account's currency and price as stored now (`current`) with a Retry. The
 * pending promo code is looked up again in the new currency; one that does
 * not apply there is dropped, with `PROMO_GONE`.
 */
export async function setPaymentCurrency(wanted: unknown, loc: BillingLocationInput = {}): Promise<SessionOpened | SessionRefused> {
  if (wanted !== "USD" && wanted !== "CAD") return { ok: false, message: "Choose US or Canadian dollars." };
  const currency: Currency = wanted;
  const g = await guard();
  if (!g.ok) return g;
  let completed: string | null = null;
  let opened: EmbeddedSetup | null = null;
  try {
    // The session is checked first: a card saved meanwhile (another tab) keeps the currency it was saved in.
    opened = await openSetup(g).catch((e) => {
      console.error("[payment] currency change: card session failed", { message: (e as Error)?.message });
      return null;
    });
    if (opened && !opened.ok && opened.reason === "complete") completed = opened.sessionId;
    else if (currency !== g.account.currency) {
      const changed = await query(`update users u set currency = $2 where u.id = $1 and ${NO_CARD_TRIAL_SQL("u")} returning id`, [g.account.userId, currency]);
      if (changed.length && opened?.ok) opened = { ...opened, currency };
    }
  } catch (e) {
    console.error("[payment] currency change failed", { message: (e as Error)?.message });
  }
  if (completed) return finishSaved(g.account.userId, g.gw, completed);
  if (opened?.ok) return { ...(await accountPrice(g, opened.currency, loc)), sessionId: opened.sessionId, clientSecret: opened.clientSecret };
  const refused = opened && !opened.ok ? refusal(opened) : { ok: false as const, message: TRY_AGAIN };
  return { ...refused, current: await currentState(g, loc) };
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
  const stored = storedPromoView(a);
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
  if (r.rateLimited) return { ok: false, message: r.notice };
  // The promo is sent back only when it changed (dropped because Stripe no longer accepts it).
  return { ok: true, price: r.price, ...(stored && !r.promo ? { promo: null } : {}), notice: r.notice, ...(r.taxRetry ? { taxRetry: true } : {}) };
}

/** "Have a promo code?" → Apply (origin R17). Checked by Stripe and Roger; any refusal reads the same. */
export async function applyPromo(code: unknown, loc: BillingLocationInput = {}): Promise<Priced | Refused> {
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
export async function removePromo(loc: BillingLocationInput = {}): Promise<Priced | Refused> {
  const g = await guard();
  if (!g.ok) return g;
  await clearPendingPromo(query, g.account.userId);
  return priced(g, g.account.currency, null, null, loc);
}

/**
 * The card form's session again (Stripe failed to load it, it expired while
 * the page was open, or a currency change failed), with the account's
 * currency and price, which the page applies: the session is always in the
 * account's stored currency.
 */
export async function openSession(loc: BillingLocationInput = {}): Promise<SessionOpened | Refused> {
  const g = await guard();
  if (!g.ok) return g;
  const r = await openSetup(g);
  if (!r.ok && r.reason === "complete") return finishSaved(g.account.userId, g.gw, r.sessionId);
  if (!r.ok) return refusal(r);
  return { ...(await accountPrice(g, r.currency, loc)), sessionId: r.sessionId, clientSecret: r.clientSecret };
}
