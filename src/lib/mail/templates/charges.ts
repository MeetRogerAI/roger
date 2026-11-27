import { moneyCents, type Currency } from "@/lib/billing/prices";
import { appUrl, COME_BACK_LINE, comeBackButton, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

/** Spec B.13: the first charge succeeded and the subscription started. */
export function subscribedEmail(o: { amountCents: number | null; currency: Currency; /** A one-at-a-time member's first monthly charge: not a third list. */ switched?: boolean }): Rendered {
  const paid = o.amountCents != null ? `${moneyCents(o.amountCents, o.currency)}, tax included` : "your first month";
  const list = o.switched ? "This week’s list" : "Your third list";
  // A promo that covers the whole first invoice (Unit 8 review F7): Stripe starts the subscription and charges nothing.
  const charged = o.amountCents === 0 ? "Your first month is covered by your promo code, so nothing was charged." : `We charged ${paid}.`;
  return renderEmail({
    subject: "You’re subscribed",
    preview: `${list} is ready.`,
    heading: "You’re subscribed.",
    paragraphs: [`${charged} ${list} is ready now, and a new one arrives every Monday.`, "You can cancel any time on the billing page, in one click."],
    button: { label: "Open this week’s list", url: appUrl("/app") },
  });
}

/** The card was declined: the list waits, with a link to update the card. */
export function chargeFailedEmail(o: { hard: boolean; retries: string[] }): Rendered {
  return renderEmail({
    subject: "Your card didn’t go through",
    preview: "Your list is waiting.",
    heading: "Your card didn’t go through.",
    paragraphs: [
      "Your list is ready and waiting. Update your card and we’ll send it straight away.",
      o.hard || !o.retries.length
        ? "Your bank declined this card, so we won’t try it again. Add a different card to continue."
        : `If you don’t, we’ll try again on ${o.retries.join(", ")}.`,
    ],
    button: { label: "Update your card", url: appUrl("/app/billing") },
  });
}

/** Day 7 with no successful charge: the trial closes; nothing was charged. */
export function trialClosedEmail(): Rendered {
  return renderEmail({
    subject: "Your Roger trial has closed",
    preview: "Nothing was charged.",
    heading: "Your trial has closed.",
    paragraphs: ["We couldn’t charge your card, so your trial has closed. Nothing was charged.", COME_BACK_LINE],
    button: comeBackButton(),
  });
}

/** The announced first-charge Monday passed without a list: the next possible date. */
export function chargeDateMovedEmail(o: { nextMonday: string; reason?: "no_plays" | "no_run" }): Rendered {
  return renderEmail({
    subject: "Your first charge moved",
    preview: `No earlier than ${longDate(o.nextMonday)}.`,
    heading: "Your first charge moved.",
    paragraphs: [
      o.reason === "no_run"
        ? "Zack’s report for this Monday didn’t arrive by Sunday night, and your list is built from it, so there was no list and nothing was charged."
        : "This Monday there weren’t enough new ideas for your list, so nothing was charged.",
      `Your first charge will be no earlier than ${longDate(o.nextMonday)}, with your third list. We’ll email you before it happens.`,
    ],
  });
}

/** The amount changed after the reminder: the list waits a day so the user sees the new amount first. */
export function amountChangedEmail(o: { amountCents: number; currency: Currency; /** The label of a locked-in discount Stripe no longer applies. */ discountEnded?: string | null }): Rendered {
  return renderEmail({
    subject: "Your first charge amount changed",
    preview: `It is now ${moneyCents(o.amountCents, o.currency)}.`,
    heading: "Your first charge amount changed.",
    paragraphs: [
      ...(o.discountEnded ? [`Your promo code’s discount (${o.discountEnded}) has ended and can no longer be applied, so your first charge is at the full price.`] : []),
      `Your first charge will be ${moneyCents(o.amountCents, o.currency)}, tax included. That isn’t the amount we last told you, so we’re telling you now, before charging.`,
      "We’ll charge it tomorrow and send your list then. If you’d rather not, you can cancel on the billing page before then.",
    ],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}

/** An order was placed (spec B.9, one list at a time). */
export function listOrderedEmail(o: { week: string; price: string }): Rendered {
  return renderEmail({
    subject: "Your list is ordered",
    preview: `For ${longDate(o.week)}.`,
    heading: "Your list is ordered.",
    paragraphs: [
      `You’ll get your three ideas on ${longDate(o.week)}, charged ${o.price} that morning, once Zack’s report for the week has arrived.`,
      "You can cancel until Sunday night.",
    ],
    button: { label: "Open Roger", url: appUrl("/app") },
  });
}

/** An ordered week with no list: nothing charged, and why. */
export function orderNoListEmail(o: { week: string; reason: "no_run" | "no_plays" }): Rendered {
  return renderEmail({
    subject: "No list this week, and no charge",
    preview: `For ${longDate(o.week)}.`,
    heading: "No list this week, and no charge.",
    paragraphs: [
      o.reason === "no_run"
        ? `Zack’s report for ${longDate(o.week)} didn’t arrive by Sunday night, and your list is built from it, so nothing was charged.`
        : `There weren’t enough new ideas for you this week, so nothing was charged.`,
      "Your order doesn’t carry over. Order again for any Monday you want a list.",
    ],
    button: { label: "Open Roger", url: appUrl("/app") },
  });
}

/** The order's payment failed: no list, the invoice is cancelled. */
export function orderFailedEmail(o: { week: string }): Rendered {
  return renderEmail({
    subject: "Your card didn’t go through",
    preview: `No list for ${longDate(o.week)}.`,
    heading: "Your card didn’t go through.",
    paragraphs: [`We couldn’t charge your card for the list on ${longDate(o.week)}, so it wasn’t sent and nothing is owed.`, "Update your card before ordering again."],
    button: { label: "Update your card", url: appUrl("/app/billing") },
  });
}
