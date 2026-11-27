import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/*
 * Emails an admin sends from the operations screen and the user page
 * (spec B.12, plan Unit 17). Each is a fixed template: the admin picks one,
 * never writes the text, so nothing an admin types reaches a member's inbox.
 */

export const NUDGES = {
  no_run: "Zack’s report hasn’t arrived",
  connect_zack: "Connect Zack",
  finish_signup: "Finish setting up",
} as const;
export type Nudge = keyof typeof NUDGES;

export const isNudge = (v: string): v is Nudge => Object.hasOwn(NUDGES, v);

export function nudgeEmail(kind: Nudge, o: { week: string }): Rendered {
  switch (kind) {
    case "no_run":
      return renderEmail({
        subject: "Zack’s report hasn’t arrived yet",
        preview: `Your Cora Curation on ${longDate(o.week)} is built from it.`,
        heading: "Zack’s report hasn’t arrived yet.",
        paragraphs: [
          `Your Cora Curation on ${longDate(o.week)} is built from this week’s report, and it needs to arrive by Sunday night.`,
          "If Zack didn’t run, ask your agent to run him now, or paste his report on the Zack page.",
        ],
        button: { label: "Open the Zack page", url: appUrl("/app/zack") },
      });
    case "connect_zack":
      return renderEmail({
        subject: "Connect Zack to get your Cora Curation",
        heading: "Zack isn’t connected yet.",
        paragraphs: ["Roger builds your Cora Curation from Zack’s weekly report. Connecting him takes a few minutes, and the Zack page walks you through it."],
        button: { label: "Connect Zack", url: appUrl("/app/zack") },
      });
    case "finish_signup":
      return renderEmail({
        subject: "Finish setting up Roger",
        heading: "You’re nearly set up.",
        paragraphs: ["Your Roger account is waiting for its last step. Pick up where you left off and your first Cora Curations start on the next Monday."],
        button: { label: "Finish setting up", url: appUrl("/start") },
      });
  }
}

/** To the new address, when support changed a member's address for them (they lost the old one). */
export function addressChangedBySupportEmail(o: { newEmail: string }): Rendered {
  return renderEmail({
    subject: "Your Roger email address changed",
    heading: "Your email address changed",
    paragraphs: [
      `At your request, Roger support changed your account’s email address to ${o.newEmail}. Sign-in links, Cora Curations and receipts come here from now on.`,
      "You’ve been signed out everywhere. Sign in again with this address.",
    ],
    button: { label: "Sign in", url: appUrl("/signin") },
    after: ["If you didn’t ask for this, write to us straight away."],
  });
}

/** To the old address, so a change nobody asked for is noticed. */
export function addressMovedAwayEmail(o: { newEmail: string }): Rendered {
  return renderEmail({
    subject: "Your Roger email address changed",
    heading: "Your email address changed",
    paragraphs: [`Roger support changed your account’s email address to ${o.newEmail}, at a request sent to support. This address no longer signs in.`, "If you didn’t ask for this, write to us straight away."],
  });
}
