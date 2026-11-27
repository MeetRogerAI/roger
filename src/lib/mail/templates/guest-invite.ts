import { appUrl, renderEmail, type Rendered } from "../layout";

/**
 * Spec email 22, "You're invited to a Roger session" (B2 plan Unit 9): sent
 * once to a guest a member invited. It names the inviter only by their
 * display name, or "A Roger member" (origin R13), and carries no Meet link:
 * the link shows on the /g page once the guest says they're coming.
 */
export function guestInviteEmail(o: { guestName: string; inviterName: string; when: string; token: string }): Rendered {
  const url = appUrl(`/g/${o.token}`);
  return renderEmail({
    subject: "You’re invited to a Roger session",
    preview: `${o.inviterName} invited you to Roger’s group session, ${o.when}.`,
    heading: `${o.guestName}, you’re invited to a Roger session.`,
    paragraphs: [
      `${o.inviterName} invited you to Roger’s weekly group session, ${o.when}. It’s an hour on Google Meet with the Roger team and members, about getting more out of your AI agent.`,
      "Open your invitation to say you’re coming and get the link to join.",
    ],
    button: { label: "Open your invitation", url },
    after: ["This invitation is for you only and works until the session ends. If you weren’t expecting it, you can ignore this email."],
  });
}
