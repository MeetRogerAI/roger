import { appUrl, renderEmail, type Rendered } from "../layout";

/*
 * Emails around changing an account's address (src/lib/auth/email-change.ts).
 * The confirm link to the new address is confirmNewEmail in ./sign-in.ts.
 * Every link opens the confirm page, where only a button press acts on it.
 */

const link = (token: string) => appUrl(`/auth/confirm?t=${encodeURIComponent(token)}`);

/** Step 1, to the current address only: approve the change before anything goes to the new one. */
export function approveEmailChangeEmail(token: string, newEmail: string): Rendered {
  return renderEmail({
    subject: `Approve changing your Roger address to ${newEmail}`,
    heading: "Approve the change to your email address",
    paragraphs: [
      `Someone signed in to your Roger account asked to change its email address to ${newEmail}.`,
      `Nothing changes unless you approve it here, and then the link we send to ${newEmail} is opened. This button works once, for the next 60 minutes.`,
    ],
    button: { label: "Approve the change", url: link(token) },
    after: ["If this wasn’t you, don’t press the button, and write to us: someone may be signed in to your account."],
  });
}

/** Sent to an address that already has an account when someone asks to move another account to it. */
export function emailInUseEmail(): Rendered {
  return renderEmail({
    subject: "Someone tried to use this address on Roger",
    heading: "This address already has a Roger account",
    paragraphs: [
      "Someone asked to change another Roger account’s email to this address. Because this address already has an account, nothing was changed.",
      "If that was you, sign in with this address instead.",
    ],
    button: { label: "Sign in", url: appUrl("/signin") },
    after: ["If you didn’t ask, ignore this email."],
  });
}

/** Once a change is complete, to the old address. */
export function emailChangedEmail(o: { newEmail: string }): Rendered {
  return renderEmail({
    subject: "Your Roger email address changed",
    heading: "Your email address changed",
    paragraphs: [`Your Roger account now uses ${o.newEmail}. Sign-in links and emails go there from now on.`, "If you didn’t make this change, write to us straight away."],
  });
}
