import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/** The fix for a missed week, shared by both miss notices. */
export const MISSED_FIX =
  "To fix it, check that Zack is still set to run each week and can reach Roger. The Zack page shows when his last report arrived, and you can upload one there by hand.";

/**
 * Spec B.9 notice 3: the first missed week in a billing month is forgiven.
 * `periodEnd` is null when that month has already ended (the week before a
 * Monday renewal), so there is no "second miss before" to warn about.
 */
function forgiven(o: { periodEnd: string | null; higher: string }): string {
  return `This one is forgiven.${o.periodEnd ? ` A second miss before ${longDate(o.periodEnd)} makes this month ${o.higher}.` : ""}`;
}

export function forgivenText(o: { periodEnd: string | null; higher: string }): string {
  return `Zack didn’t send a report this week. ${forgiven(o)}`;
}

export function missedForgivenEmail(o: { periodEnd: string | null; higher: string }): Rendered {
  return renderEmail({
    subject: "Zack didn’t send a report this week",
    preview: "This one is forgiven.",
    heading: "Zack didn’t send a report this week.",
    paragraphs: [forgiven(o), MISSED_FIX],
    button: { label: "Check Zack", url: appUrl("/app/zack") },
  });
}
