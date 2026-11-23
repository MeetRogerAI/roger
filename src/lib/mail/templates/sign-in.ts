import { appUrl, renderEmail, type Rendered } from "../layout";

/** Email 1 (spec B.13): the sign-in link. */
export function signInLinkEmail(token: string): Rendered {
  return renderEmail({
    subject: "Your Roger sign-in link",
    preview: "It works once, for the next 15 minutes.",
    heading: "Sign in to Roger",
    paragraphs: ["Use the button to sign in. The link works once, for the next 15 minutes."],
    button: { label: "Sign in", url: appUrl(`/auth/confirm?t=${encodeURIComponent(token)}`) },
    after: ["If you didn’t ask to sign in, ignore this email. Nobody can sign in without it."],
  });
}

/** Asked to sign in with an address that has no account: say so, and where to start. */
export function noAccountEmail(): Rendered {
  return renderEmail({
    subject: "Your Roger sign-in link",
    heading: "There’s no Roger account for this address",
    paragraphs: [
      "Someone asked to sign in to Roger with this email address, but there is no account for it.",
      "If that was you, you may have used another address. Or start here:",
    ],
    button: { label: "Start Roger", url: appUrl("/start") },
    after: ["If you didn’t ask, ignore this email."],
  });
}

/** The link that confirms a new email address before it replaces the old one. */
export function confirmNewEmail(token: string): Rendered {
  return renderEmail({
    subject: "Confirm your new Roger email address",
    heading: "Confirm this address",
    paragraphs: ["Use the button to make this your Roger email address. Until you do, your old address keeps working. The link works once, for the next 15 minutes."],
    button: { label: "Confirm this address", url: appUrl(`/auth/confirm?t=${encodeURIComponent(token)}`) },
    after: ["If you didn’t ask for this, ignore this email."],
  });
}
