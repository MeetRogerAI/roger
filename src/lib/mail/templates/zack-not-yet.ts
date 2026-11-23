import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/**
 * Spec B.13 email 4, "Zack hasn't sent a report yet": trial days 3, 10 and 17
 * with no run and no first list (spec B.9, the 21-day close). `closesOn` is
 * the Toronto date the trial closes if no list has gone out by then.
 */
export function zackNotYetEmail(o: { day: number; closesOn: string }): Rendered {
  const last = o.day >= 17;
  return renderEmail({
    subject: last ? "Your Roger trial closes soon" : "Zack hasn’t sent a report yet",
    preview: `Your free lists start with Zack’s first report.`,
    heading: "Zack hasn’t sent a report yet.",
    paragraphs: [
      "Your free lists start with Zack’s first weekly report. We haven’t had one from him yet, so there’s nothing to pick from.",
      "The Zack page shows how to connect him. If your agent can’t send it, you can paste or upload the report there yourself.",
      `If no list has gone out by ${longDate(o.closesOn)}, your trial closes. Nothing is charged either way.`,
    ],
    button: { label: "Connect Zack", url: appUrl("/app/zack") },
  });
}

/** Spec B.13 email 11, the day-21 form: no first list in the trial's 21 days, so it closes with no charge. */
export function trialNoListClosedEmail(): Rendered {
  return renderEmail({
    subject: "Your Roger trial has closed",
    preview: "Nothing was charged.",
    heading: "Your trial has closed.",
    paragraphs: [
      "We didn’t get a report from Zack in your trial’s 21 days, so no list went out and your trial has closed. Nothing was charged.",
      "You can start again any time.",
    ],
    button: { label: "Start again", url: appUrl("/start") },
  });
}
