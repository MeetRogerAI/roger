/**
 * The words of the group session pages (B2 plan Unit 9), kept out of the page
 * files, which may only export what Next.js expects.
 */

/** The words of /app/sessions (listed for sign-off in artifacts/wording-signoff.md). */
export const SESSION_WORDS = {
  title: "Group session",
  comingSoon: "Group sessions are coming soon. We’ll let you know when the first one is set.",
  cardHeading: "This week’s group session",
  cardBody: "An hour on Google Meet with the Roger team and other members. Bring your questions about setting up your ideas.",
  join: "Join on Google Meet",
  calendar: "Add to calendar",
  locked: "Opens when you subscribe",
  guestHeading: "Bring a guest",
  guestBody: "You can invite one guest to each session. We email them an invitation with the day and time, and the link once they say they’re coming. They see your display name from your settings, or “A Roger member” if you haven’t set one.",
  guestSent: (name: string) => `You’ve invited ${name} to this session.`,
  guestSending: (name: string) => `You’ve invited ${name}. Their invitation is on its way.`,
  guestFailed: (name: string) => `You’ve invited ${name}, but the invitation email didn’t go.`,
  guestNext: "You can invite someone else to next week’s session.",
  guestStuck: (name: string) => `You’ve invited ${name}, but the invitation email hasn’t gone yet.`,
  lockedNote: "Not available on your plan.",
  loading: "Loading…",
  guestName: "Your guest’s name",
  guestEmail: "Their email",
  send: "Send the invitation",
  sending: "Sending…",
  resend: "Send it again",
} as const;

/** What inviting a guest can answer (the page, the actions and /api/sessions/guest). */
export const INVITE_WORDS = {
  locked: "Inviting a guest opens when you subscribe.",
  closed: "There’s no session to invite a guest to just now.",
  name: "Enter your guest’s name, in letters only.",
  email: "Enter your guest’s email address.",
  self: "That’s your own address. Invite someone else.",
  already: "You’ve already invited a guest to this session.",
  recent: "That person was already invited to a session this week. Try again next week.",
  cap: "We’ve sent all the invitations we can today. Try again tomorrow.",
  limited: "Too many tries. Try again in an hour.",
  blocked: "We can’t send email to that address. Ask your guest for another one.",
  sent: (name: string) => `We’ve sent ${name} an invitation.`,
  failed: "Your invitation is saved, but the email didn’t go. Try sending it again in a minute.",
  exhausted: "We couldn’t send this invitation after several tries. Check the address with your guest, or write to us.",
  resent: (name: string) => `We’ve sent ${name} the invitation again.`,
  alreadySent: "The invitation has already been sent.",
  notYet: "Your invitation is on its way. If it hasn’t gone in a few minutes, you can send it again.",
  noGuest: "You haven’t invited a guest to this session.",
} as const;

/** The words of /g/{token}, a guest's invitation page (listed for sign-off in artifacts/wording-signoff.md). */
export const GUEST_WORDS = {
  tabTitle: "Your invitation",
  invalidTitle: "This invitation link isn’t valid.",
  invalidBody: "It may have been mistyped, or replaced by a newer invitation. Ask the person who invited you to send it again.",
  passedTitle: "This session has passed.",
  passedBody: "Thanks for your interest in Roger. Ask the person who invited you about the next one.",
  heading: (inviter: string) => `${inviter} invited you to Roger’s group session.`,
  body: "An hour on Google Meet with the Roger team and members, about getting more out of your AI agent.",
  rsvp: "I’m coming",
  rsvpError: "That didn’t work. Try again.",
  unavailableTitle: "We can’t open invitations just now.",
  unavailableBody: "Try again in a minute.",
  coming: "You’re on the list. Here’s the link to join.",
  join: "Join on Google Meet",
  calendar: "Add to calendar",
  more: "Learn about Roger",
  loading: "Opening your invitation…",
} as const;

/** The words of /admin/sessions (admins only). */
export const ADMIN_SESSION_WORDS = {
  datesNav: "Session dates",
  nextSuffix: " (next)",
  attended: "Attended",
  markAttended: "Mark attended",
  saving: "Saving…",
  forPerson: (name: string) => ` for ${name}`,
} as const;
