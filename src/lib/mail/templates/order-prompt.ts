import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/**
 * Spec B.13 email 23, "Want a list this Monday?": Fridays, to one-at-a-time
 * users without an order. It can be switched off in settings (kind
 * order_prompt, preference friday_prompt).
 */
export function orderPromptEmail(o: { week: string; price: string; monthlyLine: string }): Rendered {
  return renderEmail({
    subject: "Want a list this Monday?",
    preview: `Order by Sunday night for ${longDate(o.week)}.`,
    heading: "Want a list this Monday?",
    paragraphs: [
      `Order by Sunday night and your three ideas arrive on ${longDate(o.week)}. ${o.price}, charged that morning once Zack’s report has arrived. No report, no charge.`,
    ],
    button: { label: "Get next Monday’s list", url: appUrl("/app/billing") },
    after: [o.monthlyLine],
    footer: "You can switch these Friday reminders off in your settings.",
  });
}
