import { moneyCents, type Currency } from "@/lib/billing/prices";
import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/** Spec B.13: the first charge succeeded and the subscription started. */
export function subscribedEmail(o: { amountCents: number | null; currency: Currency }): Rendered {
  const paid = o.amountCents != null ? `${moneyCents(o.amountCents, o.currency)}, tax included` : "your first month";
  return renderEmail({
    subject: "You’re subscribed",
    preview: "Your third list is ready.",
    heading: "You’re subscribed.",
    paragraphs: [`We charged ${paid}. Your third list is ready now, and a new one arrives every Monday.`, "You can cancel any time on the billing page, in one click."],
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
    paragraphs: ["We couldn’t charge your card, so your trial has closed. Nothing was charged.", "You can start again any time with a working card."],
    button: { label: "Start again", url: appUrl("/start") },
  });
}

/** The announced first-charge Monday passed without a list: the next possible date. */
export function chargeDateMovedEmail(o: { nextMonday: string }): Rendered {
  return renderEmail({
    subject: "Your first charge moved",
    preview: `No earlier than ${longDate(o.nextMonday)}.`,
    heading: "Your first charge moved.",
    paragraphs: [
      "This Monday there weren’t enough new ideas for your list, so nothing was charged.",
      `Your first charge will be no earlier than ${longDate(o.nextMonday)}, with your third list. We’ll email you before it happens.`,
    ],
  });
}

/** The amount changed after the reminder: the list waits a day so the user sees the new amount first. */
export function amountChangedEmail(o: { amountCents: number; currency: Currency }): Rendered {
  return renderEmail({
    subject: "Your first charge amount changed",
    preview: `It is now ${moneyCents(o.amountCents, o.currency)}.`,
    heading: "Your first charge amount changed.",
    paragraphs: [
      `Your first charge is now ${moneyCents(o.amountCents, o.currency)}, tax included, not the amount we told you before.`,
      "We’ll charge it tomorrow and send your list then. If you’d rather not, you can cancel on the billing page before then.",
    ],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}
