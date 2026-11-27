/**
 * The sample play bundled with the site (plan R11, KTD7). The public sample
 * card shows it until a play is chosen in the admin.
 *
 * SOURCE: the 2026-11-14 pilot Zack run, Play 1 ("Client email in two
 * tones"), written on Claude.
 *
 * Approved by Peter on November 26, 2026 (plan R12). The full cleaned text and
 * the list of what was removed are in section 2.2 of
 * docs/site/v1-copy-changes.md. A change to this text needs his approval again.
 *
 * Cleaning rules applied to the source:
 * - Every time-saved figure, run count, yearly total and range is removed, so
 *   `figures` is empty and nothing here is a number about time or money.
 * - The source names no person, client, company, brokerage, address or amount
 *   inside this play; its placeholders ([Name], [your seller]) are kept.
 * - "member" became "user", and "real estate agents" in the heavy-use line
 *   became "people in real estate" (vocabulary rule, spec 0.4).
 * - The playbook's eight numbered parts are kept in order with their numbers,
 *   because the install prompt refers to them by number. The source's ninth
 *   part is the install prompt itself, held in `pasteToInstall`. No step was
 *   added.
 * - Cora has not scored this play, so every score is null and the card shows
 *   no score section for it. No score is made up.
 */
import type { SamplePlay } from "@/lib/site/sample";

const playbookMd = `## 1. Play
Client email in two tones. Turns a rough note or an incoming message into two polished replies you can send as is.

## 2. Trigger
A request, any time you need to reply to a client, a colleague or [your seller].

## 3. Setup first
- How do you sign your emails?
- What tone do you want by default (warm, efficient, never pushy)?
- Do you want two variants every time, or one?
- Is there a file Claude should check first for listing or client details (for example a saved note about [your listing])?

## 4. Steps
1. Read the incoming message or the user’s rough draft in full.
2. Pull out every fact and ask in it (what to send, what to ask, any dates or next steps). Keep all of them.
3. If a listing or client is named and there is saved context about it, check that first so details match.
4. Write two versions with clearly different goals, for example “Light touch” and “Helpful next step”, or “Warm” and “Short and direct”. Each gets its own subject line.
5. Use placeholders like [Name] and [phone number] for anything not given. Never invent a name.
6. If the ask includes a soft sell (such as offering a home evaluation), make it one gentle sentence with “no obligation” framing, placed after the main reply.
7. For updates on showings or negotiations, lead with the positive fact, then the honest status, then the next step.
8. Flag anything that looks like a typo in a name before the user sends.
9. When the user asks to change one paragraph, rewrite only that paragraph and give two options for it.

## 5. Guardrails
Claude drafts only. It never sends. It never invents facts about a property, a price or a person. If an attachment is mentioned (“attached are the floor plans”), remind the user to attach it.

## 6. Output
Two email drafts, each with a label, a subject line and a body signed with the user’s sign-off. One or two lines on how they differ.

## 7. Pitfalls seen
- A “subtle” ask came out sounding salesy. Fix: write it as genuine curiosity and offer help with no pressure; ask the user if it should be “more genuine” before finalising.
- A thank-you came out generic. Fix: add specific, concrete details and tell the user to change any that did not happen.
- Mentioning an attachment the user might forget. Fix: add a one-line reminder.

## 8. Done when
The user can paste either version and send it with no more than a name swap.`;

export const samplePlay: SamplePlay = {
  id: "bundled-sample",
  title: "Client email in two tones",
  category: "Client email",
  description:
    "The user pastes a rough note or a client’s message, and Claude returns two ready-to-send versions in different tones, signed and ready to go. It covers replies to buyers, updates to sellers, negotiation updates and quick messages to colleagues. When a line feels off, one short ask fixes just that part.",
  heavyUseFor: "people in real estate and other client service roles with a busy inbox",
  playbookMd,
  pasteToInstall:
    "Written by another user. Read sections 1 to 8 before pasting this. Save a skill called Client email in two tones. When I paste a message or rough note, follow the steps in section 4, keep the guardrails in section 5, and give me the output in section 6. Ask me the setup questions in section 3 once before the first run.",
  writtenOn: "claude",
  figures: {},
  scores: { hours: null, reach: null, ease: null, proof: null, surprise: null },
  score: null,
};
