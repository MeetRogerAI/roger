import { appUrl, COME_BACK_LINE, comeBackButton, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/**
 * Spec B.13 email 17, cancellation confirmed (spec B.9). During the trial the
 * account ends at once and the saved card is removed: "You have not been
 * charged." After that, access continues to the end of the paid month, with
 * no refund.
 */
export function cancelledEmail(o: { when: "now"; charged: boolean } | { when: "period_end"; accessEnds: string }): Rendered {
  if (o.when === "now") {
    return renderEmail({
      subject: "Your Roger account is cancelled",
      preview: o.charged ? "Nothing more will be charged." : "You have not been charged.",
      heading: "Your account is cancelled.",
      paragraphs: [
        o.charged ? "Nothing more will be charged." : "You have not been charged, and we removed your saved card.",
        "Your reports and the ideas you were sent stay readable when you sign in.",
        COME_BACK_LINE,
      ],
      button: comeBackButton(),
    });
  }
  return renderEmail({
    subject: "Your Roger plan is cancelled",
    preview: `Your Cora Curations continue until ${longDate(o.accessEnds)}.`,
    heading: "Your plan is cancelled.",
    paragraphs: [
      `Your Cora Curations continue until ${longDate(o.accessEnds)}, the end of the month you paid for. Nothing more will be charged, and there is no refund for the rest of the month.`,
      "Changed your mind? Undo it on the billing page before then and your plan continues as before.",
    ],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}

/** The cancellation was taken back before the paid month ended. */
export function cancelUndoneEmail(o: { renews: string | null }): Rendered {
  return renderEmail({
    subject: "Your Roger plan continues",
    preview: "Your cancellation is undone.",
    heading: "Your plan continues.",
    paragraphs: [
      o.renews ? `Your cancellation is undone. Your monthly plan renews on ${longDate(o.renews)}, as before.` : "Your cancellation is undone. Your monthly plan renews as before.",
    ],
    button: { label: "Billing", url: appUrl("/app/billing") },
  });
}
