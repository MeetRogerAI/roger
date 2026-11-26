import { CARD_SAVED_NOTICE, type CardSavedNotice as Notice } from "@/lib/billing/card-saved";

/**
 * The one line shown after a card is saved on the Payment page (plan
 * 2026-11-26-001, Unit 5): the return page sends the person to the unlocked
 * week (or `/app`) with `?card=saved|waiting|promo`. Anything else in the
 * query shows nothing.
 */
export function CardSavedNotice({ card }: { card: string | string[] | undefined }) {
  const key = typeof card === "string" && Object.hasOwn(CARD_SAVED_NOTICE, card) ? (card as Notice) : null;
  if (!key) return null;
  return (
    <p role="status" className="rounded-[8px] border border-rule bg-surface px-4 py-3 text-small">
      {CARD_SAVED_NOTICE[key]}
    </p>
  );
}
