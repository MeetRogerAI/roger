import { appUrl, renderEmail, type Rendered } from "../layout";

/**
 * Spec B.13 email 15 (the plan half): a switch between monthly and one list
 * at a time, with what it does and when. Every email to a one-at-a-time user
 * ends with the monthly line (spec B.9).
 */
export function planChangedEmail(o: { to: "monthly" | "per_run"; effect: string; later?: boolean; monthlyLine?: string | null }): Rendered {
  const name = o.to === "monthly" ? "monthly" : "one list at a time";
  return renderEmail({
    subject: o.later ? `Your switch to ${name} is booked` : `Your plan is now ${name}`,
    preview: o.effect,
    heading: o.later ? `Your switch to ${name} is booked.` : `Your plan is now ${name}.`,
    paragraphs: [o.effect, "If you didn’t make this change, open the billing page and switch back, then write to us."],
    button: { label: "Billing", url: appUrl("/app/billing") },
    after: o.monthlyLine ? [o.monthlyLine] : undefined,
  });
}

/** A switch to monthly whose first charge failed for seven days: back to one list at a time, nothing charged. */
export function backToPerRunEmail(): Rendered {
  return renderEmail({
    subject: "You’re back on one list at a time",
    preview: "Your monthly plan didn’t start. Nothing was charged.",
    heading: "You’re back on one list at a time.",
    paragraphs: [
      "We couldn’t charge your card for your first monthly payment, so monthly didn’t start and nothing was charged. That week’s list isn’t sent.",
      "You can still order a list for any Monday you want one. Update your card first on the billing page.",
    ],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}

/** A switch booked for after Monday that could not be made. */
export function bookedSwitchDroppedEmail(o: { to: "monthly" | "per_run"; why: string }): Rendered {
  const name = o.to === "monthly" ? "monthly" : "one list at a time";
  return renderEmail({
    subject: `Your switch to ${name} didn’t happen`,
    preview: o.why,
    heading: `Your switch to ${name} didn’t happen.`,
    paragraphs: [`Your plan is unchanged: ${o.why}`, "You can try again on the billing page."],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}
