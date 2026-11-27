import { appUrl, esc, renderEmail, type Rendered } from "../layout";
import { optOutHeaders, optOutPageUrl } from "../unsubscribe";

/** The guest invitation's opt-out line (listed for sign-off in artifacts/wording-signoff.md, section 12). */
export const GUEST_OPT_OUT_WORDS = {
  lead: "You got this because a Roger member entered your address.",
  link: "Stop all invitations from Roger to this address",
} as const;

/**
 * Spec email 22, "You're invited to a Roger session" (B2 plan Unit 9): sent
 * once to a guest a member invited. It names the inviter only by their
 * display name, or "A Roger member" (origin R13), and carries no Meet link:
 * the link shows on the /g page once the guest says they're coming.
 *
 * The guest is not a member, so the email ends with a signed opt-out link
 * and carries List-Unsubscribe one-click headers (B2 whole-branch review;
 * CASL and CAN-SPAM): `optOutToken` is the guest's address token
 * (unsubscribe.ts `guestOptOutToken`), and opting out stops every further
 * invitation to that address, from any member.
 */
export function guestInviteEmail(o: { guestName: string; inviterName: string; when: string; token: string; optOutToken: string }): Rendered & { headers: Record<string, string> } {
  const url = appUrl(`/g/${o.token}`);
  const optOut = optOutPageUrl(o.optOutToken);
  return {
    ...renderEmail({
      subject: "You’re invited to a Roger session",
      preview: `${o.inviterName} invited you to Roger’s group session, ${o.when}.`,
      heading: `${o.guestName}, you’re invited to a Roger session.`,
      paragraphs: [
        `${o.inviterName} invited you to Roger’s weekly group session, ${o.when}. It’s an hour on Google Meet with the Roger team and members, about getting more out of your AI agent.`,
        "Open your invitation to say you’re coming and get the link to join.",
      ],
      button: { label: "Open your invitation", url },
      after: ["This invitation is for you only and works until the session ends. If you weren’t expecting it, you can ignore this email."],
      raw: {
        text: `${GUEST_OPT_OUT_WORDS.lead} ${GUEST_OPT_OUT_WORDS.link}: ${optOut}`,
        html:
          `<p style="margin:0 0 16px;font-size:13px;line-height:1.4;color:#5d5d63">${esc(GUEST_OPT_OUT_WORDS.lead)} ` +
          `<a href="${esc(optOut)}" style="color:#5d5d63">${esc(GUEST_OPT_OUT_WORDS.link)}</a>.</p>`,
      },
    }),
    headers: optOutHeaders(o.optOutToken),
  };
}
