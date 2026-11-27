import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

/**
 * Spec B.5, the upload fallback: members who send Zack's report by hand get
 * a reminder at 6:00 PM their time on Sunday when no run has arrived for the
 * coming Monday's list.
 */
export function uploadReminderEmail(o: { week: string }): Rendered {
  return renderEmail({
    subject: "Zack’s report for Monday hasn’t arrived",
    preview: "Upload it tonight for Monday’s list.",
    heading: "Zack’s report hasn’t arrived yet.",
    paragraphs: [
      `Your list for ${longDate(o.week)} is picked from this week’s report, and we haven’t had it yet.`,
      "Run Zack, then paste or upload his report on the Zack page before the Sunday cutoff.",
    ],
    button: { label: "Upload the report", url: appUrl("/app/zack") },
  });
}
