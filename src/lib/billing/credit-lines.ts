import type { Currency } from "./prices";

/**
 * Referral credit in the charge displays (B2 plan Unit 5; origin R7 "What
 * members see"): from a total (Stripe's preview, a told quote, an invoice)
 * and the member's credit, how much of it the credit covers and what the card
 * is charged. Pure and client-safe (the Payment page's Price Box uses it too).
 *
 * The total stays what is compared and stored (`first-charge.ts`, `quote.ts`):
 * credit only changes the words, so it can never cause an "amount changed"
 * hold. Stripe applies the customer balance to the invoice by itself.
 */

/** Credit a display may count on: positive cents, in a currency, read at `asOf`. Null when unknown or not usable. */
export type DisplayCredit = { cents: number; currency: Currency; asOf?: Date } | null;

export type CreditLines = {
  totalCents: number;
  /** 0 when there is no credit, it is in another currency, or the total is 0. */
  creditAppliedCents: number;
  cardChargedCents: number;
  /** Credit still on the balance after this charge. */
  creditLeftCents: number;
};

/**
 * Credit applied = min(credit, total); card charged = total − applied. Only
 * credit in the total's own currency counts (a balance is in the customer's
 * currency, fixed at card save; the Payment page's toggle can show the other).
 */
export function creditLines(totalCents: number, currency: Currency | string, credit: DisplayCredit): CreditLines {
  const usable = credit && credit.currency === currency && credit.cents > 0 ? credit.cents : 0;
  const applied = Math.max(0, Math.min(usable, totalCents));
  return { totalCents, creditAppliedCents: applied, cardChargedCents: totalCents - applied, creditLeftCents: usable - applied };
}

/**
 * Credit lines from an invoice's own figures (a paid or open invoice, B2 plan
 * Unit 5): the credit it used and what is left for the card, as Stripe
 * recorded them, never recomputed from the balance.
 */
export function creditLinesFromInvoice(totalCents: number, appliedCents: number, cardCents: number): CreditLines {
  return { totalCents, creditAppliedCents: Math.max(0, appliedCents), cardChargedCents: cardCents, creditLeftCents: 0 };
}

/** The words of a credit line, shared by every display (emails, the billing page, the status line). */
export const CREDIT_APPLIED = "Credit applied";
export const CARD_CHARGED = "Card charged";
/** An open invoice: the card has not paid it yet. */
export const CARD_DUE = "Card due";
/** The Payment page's rows (drafted for Peter's sign-off): the credit goes to the first charge, which comes later. */
export const PRICE_BOX_CREDIT = "Credit applied to your first charge";
export const PRICE_BOX_CARD = "Card charged then";

/** Always two decimals ("CA$280.00"), so the two figures of a credit line read alike. */
export function moneyExact(cents: number, currency: Currency | string): string {
  return `${currency === "CAD" ? "CA$" : "US$"}${(cents / 100).toFixed(2)}`;
}

/**
 * "Credit applied −CA$280.00 · Card charged CA$36.40" ("Card due" for an open invoice), or null when no credit
 * applies (the display is then unchanged).
 */
export function creditLineText(l: CreditLines, currency: Currency | string, o: { due?: boolean } = {}): string | null {
  if (l.creditAppliedCents <= 0) return null;
  return `${CREDIT_APPLIED} −${moneyExact(l.creditAppliedCents, currency)} · ${o.due ? CARD_DUE : CARD_CHARGED} ${moneyExact(l.cardChargedCents, currency)}`;
}

/** "CA$43.60 of credit stays on your balance.", or null when none is left (or none applied). */
export function creditLeftText(l: CreditLines, currency: Currency | string): string | null {
  if (l.creditAppliedCents <= 0 || l.creditLeftCents <= 0) return null;
  return `${moneyExact(l.creditLeftCents, currency)} of credit stays on your balance.`;
}

/** Emails state the credit as it stands when they are sent (plan, Key Technical Decisions "Displays"). */
export const CREDIT_AS_SENT = "The credit shown is your referral credit balance as this email is sent.";

/**
 * An email's credit sentences: the line, what is left, and that it is the
 * balance at sending. Empty when no credit applies, so the email is unchanged.
 */
export function creditParagraph(totalCents: number, currency: Currency | string, credit: DisplayCredit): string[] {
  const l = creditLines(totalCents, currency, credit);
  const line = creditLineText(l, currency);
  if (!line) return [];
  return [[`${line}.`, creditLeftText(l, currency), CREDIT_AS_SENT].filter(Boolean).join(" ")];
}

/**
 * A charge's own invoice is finalized (and its balance cached from the invoice
 * webhook) a little before Roger records the charge (`first_charge_at` is
 * written after Stripe answers): a reading this close before the charge is
 * that invoice's own ending balance.
 */
export const CHARGE_GRACE_MS = 15 * 60_000;

/**
 * The cached balance as a display may use it: null when it was never read,
 * or when a charge since its reading may have spent it (a reading from well
 * before the member's last charge is not shown; the invoice webhooks cache
 * each invoice's ending balance, so a charge normally leaves a fresh one).
 */
export function usableCredit(b: { cents: number; currency: Currency | null; asOf: Date } | null, lastChargeAt: Date | null): DisplayCredit {
  if (!b || !b.currency || b.cents <= 0) return null;
  if (lastChargeAt && b.asOf.getTime() < lastChargeAt.getTime() - CHARGE_GRACE_MS) return null;
  return { cents: b.cents, currency: b.currency, asOf: b.asOf };
}

/**
 * A paid (or open) invoice's real credit, from Stripe's own figures: the
 * customer balance it used is `ending_balance − starting_balance` (both
 * Stripe's sign, negative is credit; a debt it collected is not credit).
 * `ending_balance` is null before the invoice is finalized: nothing applied.
 */
export function invoiceCreditCents(inv: { starting_balance?: number | null; ending_balance?: number | null }): number {
  if (inv.ending_balance == null || inv.starting_balance == null) return 0;
  return Math.max(0, Math.min(inv.ending_balance, 0) - inv.starting_balance);
}
