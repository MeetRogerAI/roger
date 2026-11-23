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

/** Google sign-in was linked to an existing account (plan Unit 18): told at the account's own address. */
export function googleLinkedEmail(): Rendered {
  return renderEmail({
    subject: "Google sign-in added to your Roger account",
    heading: "Google sign-in is now on",
    paragraphs: [
      "Someone just signed in to your Roger account with Google for the first time, using a Google account with this email address. From now on that Google account signs you in too.",
      "If that was you, there’s nothing to do. If it wasn’t, unlink Google on your settings page straight away, and write to us.",
    ],
    button: { label: "Open your settings", url: appUrl("/app/settings") },
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

/** Sign-up, step 2: confirm the address, then carry on to the plan step. */
export function startConfirmEmail(token: string): Rendered {
  return renderEmail({
    subject: "Confirm your email to start Roger",
    preview: "One click, then choose your plan.",
    heading: "Confirm your email",
    paragraphs: ["Use the button to confirm this address and carry on to choosing your plan. The link works once, for the next 15 minutes."],
    button: { label: "Confirm and continue", url: appUrl(`/auth/confirm?t=${encodeURIComponent(token)}`) },
    after: ["If you didn’t start signing up for Roger, ignore this email."],
  });
}
