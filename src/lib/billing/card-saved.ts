/**
 * Where a card save on the Payment page leads (plan 2026-11-26-001, Unit 5),
 * kept apart from the completion so pages and components can read it without
 * the billing code. `finishCardSave` (card-setup.ts) produces the result.
 */
import { siteConfig } from "@/data/config";

export type CardSaveResult =
  /** The card is saved. `week` is the list it unlocked (null while there is none yet, e.g. Cora still picking); `promoRefused` when the pending code could not be applied. */
  | { outcome: "done"; week: string | null; promoRefused: boolean }
  /** Not saved yet. `problem`: the check failed on our side (not Stripe still confirming); the page says so once its checks run out. */
  | { outcome: "pending"; problem?: boolean }
  | { outcome: "address_invalid" }
  /** Not this person's card session (or not one that can be completed here): back to Payment. */
  | { outcome: "not_yours" };

/** The notice the page shows after a card save (`?card=` on the week page or /app). */
export const CARD_SAVED_NOTICE = {
  saved: "Your card is saved. Here are your ideas.",
  waiting: "Your card is saved. Your ideas will be here as soon as your list is ready.",
  promo: "Your card is saved; that code couldn’t be applied, so the price is the regular one.",
} as const;

export type CardSavedNotice = keyof typeof CARD_SAVED_NOTICE;

/** Whether a `?card=` value names one of the notices (anything else in the query shows nothing). */
export function isCardSavedNotice(v: unknown): v is CardSavedNotice {
  return typeof v === "string" && Object.hasOwn(CARD_SAVED_NOTICE, v);
}

/** What the return page says when its checks ran out after a failure on our side (not Stripe still confirming). */
export const SAVE_PROBLEM = `We hit a problem saving your card. We’ll finish it shortly — or write to us at ${siteConfig.contactEmail}.`;

/** The Payment page's flag for an address Stripe could not place for tax (`/start/payment?error=address`). */
export const ADDRESS_ERROR_FLAG = "address";

/** What the Payment page shows above the form for that flag (Unit 6). */
export const ADDRESS_MESSAGE = "Stripe couldn’t use that billing address to work out the tax. Check your country and postal code, then add your card again.";

/** Where a card save result sends the person. */
export function cardSavePath(r: CardSaveResult): string {
  switch (r.outcome) {
    case "done": {
      const notice: CardSavedNotice = r.promoRefused ? "promo" : r.week ? "saved" : "waiting";
      return r.week ? `/app/week/${r.week}?card=${notice}` : `/app?card=${notice}`;
    }
    case "address_invalid":
      return `/start/payment?error=${ADDRESS_ERROR_FLAG}`;
    case "not_yours":
      return "/start/payment";
    case "pending":
      return "/start/payment/done";
  }
}
