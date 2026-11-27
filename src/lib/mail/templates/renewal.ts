import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

/**
 * A monthly renewal that did not go through (spec B.9: "retried by Stripe;
 * after 7 days unpaid, lists are held until it is paid; the user is emailed
 * at each step"). Stripe's own emails are switched off, so these are the
 * only messages.
 */
export function renewalFailedEmail(o: { holdOn: string }): Rendered {
  return renderEmail({
    subject: "Your monthly payment didn’t go through",
    preview: "Update your card to keep your lists coming.",
    heading: "Your monthly payment didn’t go through.",
    paragraphs: [
      "We couldn’t charge your card for this month. Your lists keep coming for now, and we’ll try the card again over the next few days.",
      `If it is still unpaid on ${longDate(o.holdOn)}, your Monday lists pause until it is paid. Updating your card charges it straight away.`,
    ],
    button: { label: "Update your card", url: appUrl("/app/billing") },
  });
}

export function renewalHeldEmail(): Rendered {
  return renderEmail({
    subject: "Your Monday lists are paused",
    preview: "Your monthly payment is still unpaid.",
    heading: "Your Monday lists are paused.",
    paragraphs: [
      "Your monthly payment is still unpaid after seven days, so your lists are paused. Nothing else changes.",
      "Update your card and we’ll charge it straight away; your lists start again the moment it is paid.",
    ],
    button: { label: "Update your card", url: appUrl("/app/billing") },
  });
}

export function renewalPaidEmail(): Rendered {
  return renderEmail({
    subject: "Your payment went through",
    preview: "Your lists are back on.",
    heading: "Your payment went through.",
    paragraphs: ["Thank you. Your monthly plan is paid, and any list that was waiting is on its way."],
    button: { label: "Open Roger", url: appUrl("/app") },
  });
}
