import { appUrl, COME_BACK_LINE, comeBackButton, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

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

/** The free lists were used, but no report came for the first paid list in the trial's last 21 days: it closes with no charge. */
export function trialNoChargeClosedEmail(): Rendered {
  return renderEmail({
    subject: "Your Roger trial has closed",
    preview: "Nothing was charged.",
    heading: "Your trial has closed.",
    paragraphs: [
      "Your free lists went out, but we haven’t had a report from Zack in the three weeks since, so your first paid list never came and your trial has closed. Nothing was charged.",
      COME_BACK_LINE,
    ],
    button: comeBackButton(),
  });
}

/**
 * Plan 2026-11-26-001, Unit 7 (origin R11): a no-card trial whose first list
 * was held closes 14 days after its first teaser with no card added. The
 * same closing email, worded for the held list. Drafted copy, for S18 sign-off.
 */
export function trialNoCardClosedEmail(): Rendered {
  return renderEmail({
    subject: "Your Roger trial has closed",
    preview: "Nothing was charged.",
    heading: "Your trial has closed.",
    paragraphs: ["Your first ideas were ready, but no card was added, so your trial has closed. Nothing was charged.", COME_BACK_LINE],
    button: comeBackButton(),
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
      COME_BACK_LINE,
    ],
    button: comeBackButton(),
  });
}
