import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/** An order closed because Roger's week failed (closeFailedWeekOrders): nothing charged. */
export function orderClosedRogerFailedEmail(o: { week: string }): Rendered {
  return renderEmail({
    subject: "No Cora Curation this week, and no charge",
    preview: `For ${longDate(o.week)}.`,
    heading: "No Cora Curation this week, and no charge.",
    paragraphs: [
      `Something went wrong on our side and we couldn’t make the Cora Curations for ${longDate(o.week)}, so your order wasn’t charged. We’re sorry.`,
      "Your order doesn’t carry over. Order again for any Monday you want one.",
    ],
    button: { label: "Open Roger", url: appUrl("/app") },
  });
}
