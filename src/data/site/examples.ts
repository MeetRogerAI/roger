/**
 * The plays shown under "Cora Curation Examples" on the homepage
 * (Peter's third homepage review, November 27, 2026). Real plays from real
 * Zack runs, bundled with the site: the public pages read nothing else for
 * this section. The admin screen that chose a pool play for it is removed.
 *
 * Each example is known in code by its id only. Who a play came from is not
 * recorded here, in a comment or anywhere on the site.
 *
 * SOURCES
 * - `video`: the Zack run of November 15, 2026, the play "Phone camera roll
 *   to styled Reels", written on Grok Bot.
 * - `prospects`: the Zack run of November 12, 2026, the play "Daily prospect
 *   outreach drafts", written on Grok Bot.
 * - `paper`: NOT taken from a run. The Zack run of November 12, 2026 names
 *   "Printable one-page daily paper for the kitchen table" among its
 *   runners-up in one line, with no playbook and no install prompt. On
 *   November 27, 2026 Peter asked for the full play to be written from best
 *   guesses. Everything below that one line's idea is ours: the summary, the
 *   eight parts and the install prompt. Its seventh part is headed "Pitfalls
 *   to watch for", not "Pitfalls seen", because nobody has seen them yet.
 *   The cleaning rules below describe the other two.
 *
 * NOT YET APPROVED. The cleaned text of each play, and every change made to
 * its source, is in section 9 of docs/site/v1-copy-changes.md for Peter to
 * approve. A change to this text needs his approval again.
 *
 * Cleaning rules applied to each source:
 * - The playbook's words are the source's, in the source's order. Only the
 *   layout changed: each numbered part ("1. Play" to "8. Done when") is a
 *   "##" heading with its text under it, which is how the card finds the
 *   parts it folds. The ninth part, "Paste to install", is `pasteToInstall`.
 * - The summary is the play's own opening paragraph, word for word.
 * - Everything about time is left out: the "Doing this by hand" and "Using
 *   Grok Bot" lists, time saved, range, confidence and "Over a year". So
 *   `figures` is empty, and the "heavy use for" line, which is one of those
 *   facts, is left empty too.
 * - Neither play names a person, a company, a client, a product of the
 *   user's, a handle, a link, an address, an amount or a date. The
 *   placeholders the runs already use ([your neighbourhood], [N],
 *   [TO: contact name]) are kept. The public tools they name (Grok Bot,
 *   Instagram, iCloud Photos, Google Photos, Drive) stay.
 * - Neither play says "agent", so nothing had to become "AI agent".
 * - Cora has not scored these plays, so every score is null and the card
 *   shows no score row. No score is made up.
 */
import type { SamplePlay } from "@/lib/site/sample";

export type Example = {
  /** The example's name in code, in an element id and in the page's address after "#". */
  id: string;
  /** The short title a visitor picks the example by. */
  label: string;
  play: SamplePlay;
};

const noScores: SamplePlay["scores"] = { hours: null, reach: null, ease: null, proof: null, surprise: null };

const videoPlaybook = `## 1. Play
Phone camera roll to styled Reels. A pile of phone photos and clips becomes finished vertical Reels in the style top accounts use, ready for you to post.

## 2. Trigger
A request with a shared album link, for example "Here's a batch from my camera roll, only things from [your neighbourhood]. Make Reels from it."

## 3. Setup first (answer once)
- Which places or topics should clips come from (for example, only [your neighbourhood]: local shops, events, seasonal scenes, street B-roll)?
- What are your brand colours and fonts for on-screen text?
- What's your posting voice (friendly local guide, expert, playful)?
- Should Grok Bot add music, or leave it out so you add a song in the app?
- How do you share media: a shared photo-album link (for example, iCloud Photos or Google Photos) or a Drive folder?
- Public services: none need connecting for the first batch if you share a link. Instagram is only needed later if you want drafts placed there.

## 4. Steps
1. Download everything from the shared link(s). Tell the requester it may take a while for a big album.
2. Keep only items that match the chosen places or topics; drop blurry, private or people-heavy shots of strangers.
3. Sort what's left into themes (for example: a weekend-in-the-neighbourhood POV, things I love about the area, local shops and spots, an event recap, seasonal scenes).
4. Look at what top accounts in the same field are posting right now: hooks, length, text-over-B-roll style, list formats. Note 3 to 5 patterns.
5. Build 3 Reels first, each 10 to 30 seconds, vertical, with a strong first-second hook and bold text in the brand colours. Leave music out unless asked.
6. Write a short caption and on-screen text for each.
7. Send the 3 Reels to the requester to approve the style before making more.
8. After approval, make the rest and a simple posting plan (which Reel or post goes on which day, through the period they choose). Add new album links to the batch as they arrive.

## 5. Guardrails
- Never post or schedule anything on social media. Finished files and drafts only.
- Don't use copyrighted music.
- Don't feature identifiable strangers, children, or private homes without the requester's OK.
- If a download link fails or expires, ask for a new link rather than guessing.

## 6. Output
3 finished vertical Reel files (then more after approval), a caption for each, and a posting-plan page listing date, Reel or post, caption and theme.

## 7. Pitfalls seen
- Licensed songs in a video got it blocked by a copyright claim on another platform. Fix: leave music out and let the requester add a song inside the app, or use a free library track.
- The requester wanted to see the style before a full plan. Fix: send 3 samples first, then build the rest.
- Media arrived in several batches. Fix: start on the first batch, and fold later links into the plan as they come.
- "Use my camera roll" needs a sharing method the bot can reach. Fix: ask for a shared album link.

## 8. Done when
The requester has 3 Reels they like the look of, captions for each, and a plan for the rest.`;

const prospectsPlaybook = `## 1. Play
Daily prospect outreach drafts. Each weekday morning you get 20 researched, personalised first-touch emails waiting unsent in your Drafts, with the tracker updated.

## 2. Trigger
A schedule, every weekday at 8:30 AM in your time zone.

## 3. Setup first
Which email account should the drafts sit in, and whose signature goes on them? Where is the prospect tracker (a sheet with organization, contact, email, fit score, last touch, next touch)? In two or three lines, what do you offer, which locations or products should be pitched to which kinds of prospect, and what is the one ask (for example "a 20-minute call")? Which prices or claims are confirmed and allowed in the email? Who should be cc'd? How many drafts a day?

## 4. Steps
1. Open the tracker and take the next [N] untouched rows marked strong fit, in priority order.
2. For each row, check Sent mail, Drafts and the tracker for any earlier contact or opt-out. Re-check the same morning even if the row was researched before, and skip anyone already emailed, opted out, or closed.
3. Search the web for the organization and confirm a named contact and a working email. If only a phone number or contact form exists, still draft the email, put "[TO: contact name]" in the subject and list it in the report.
4. Write a short first-touch email in the member's voice. Pitch the location or product closest to the prospect, use only confirmed prices or claims, ask only for a call, and add the signature.
5. Save each email as an unsent draft in the agreed account, with any agreed cc's.
6. Update each tracker row: touch date, touch number, next touch date and a one-line note. Log skipped rows with the reason.
7. Check that the drafts and tracker rows match: same count, no duplicates, no blank recipients.
8. When fewer than about a week of strong-fit rows remain, say so and suggest where to widen the list.

## 5. Guardrails
Never send. Drafts only, and the member sends. Never invent prices, claims or contact emails. Never draft to anyone who opted out or was already contacted. If the mailbox or tracker can't be reached, save nothing and report the error. Don't retry in a way that could create duplicates.

## 6. Output
A short report covering how many drafts were saved and their mix by type and area, the rows held or skipped and why, drafts missing an email address, duplicates to delete, how many unsent drafts from earlier days are still sitting in Drafts, and how many strong-fit rows are left.

## 7. Pitfalls seen
Research from an earlier day that was never drafted got reused without a fresh check, and three drafts went to people already contacted. Fix: always re-check Sent, Drafts and the tracker that morning. A price that was confirmed for only one location crept into drafts for other locations. Fix: keep a list of confirmed claims. A second bot drafted the same prospect into a teammate's mailbox, which created a duplicate. Fix: name one mailbox per prospect type. Unsent drafts piled up and blocked later follow-ups. Fix: report the backlog every day.

## 8. Done when
The Drafts folder holds [N] new unsent drafts, each matches a tracker row updated today, and the report lists every skipped row.`;

const paperPlaybook = `## 1. Play
A printed daily paper for the family. Each morning one page is waiting on the printer with the day's schedule, weather, meals, reminders and something fun to read at the kitchen table.

## 2. Trigger
A schedule, every morning at a time you choose, early enough that the page is printed before breakfast.

## 3. Setup first (answer once)
- Who is in the family, and what should each person be called on the page?
- Which calendars hold the family's day (school, activities, work, shared family calendar)?
- Which city should the weather be for?
- Where do the meal plan and the chore list live (a note, a sheet, or nowhere yet)?
- What should the fun corner be: a riddle, a word of the day, a question to talk about, a short piece of news suited to children?
- How does the page reach paper: a printer that accepts email, a print service your computer already uses, or a PDF you print yourself?
- Which days should it run, and should weekends look different?

## 4. Steps
1. Read today's events from the chosen calendars and list them by time, with who each one is for.
2. Look up today's weather for the chosen city and turn it into one plain line, with what to wear or bring.
3. Read the meal plan and chore list if they exist, and take today's entries only.
4. Check the next few days for anything that needs getting ready today (a form to sign, a birthday, a library book due) and list it under "Coming up".
5. Write the fun corner in the chosen style, short enough to read aloud, and never the same as a recent day.
6. Lay everything out on one page in large, clear type, with the date and day at the top. If it runs over, cut the least urgent items instead of shrinking the type.
7. Make the page a PDF and send it to the printer, or leave it where the family prints from.
8. Send a one-line message saying the page is ready, and name anything that was left off or could not be read.

## 5. Guardrails
- Never put anything on the page that should not be seen by a visitor in the kitchen: no passwords, account details, medical notes or private work matters.
- Never invent an event, a time or a reminder. If a calendar cannot be read, say so on the page.
- Use only news and facts suited to the youngest reader in the house.
- Print one copy, once. If printing fails, do not retry in a loop; report it.

## 6. Output
A single printed page (and its PDF) with the date, today's schedule, the weather line, meals, chores, "Coming up" and the fun corner, plus a one-line message that it is ready.

## 7. Pitfalls to watch for
- Private or work calendar entries end up on the kitchen table. Fix: choose the calendars to read during setup, and hide any event marked private.
- The page spills onto a second sheet on a busy day. Fix: set a firm limit for each section and cut from the bottom.
- The printer is off or out of paper and nobody notices. Fix: always send the PDF with the ready message, so it can be read on a phone.
- The fun corner repeats itself. Fix: keep a short list of what ran recently and check it first.
- An all-day event or a different time zone shows the wrong time. Fix: show all-day events as "today" with no time, and use the family's home time zone.

## 8. Done when
The page is on the printer before breakfast, everything on it is true for today, and it fits on one side of one sheet.`;

export const examples: readonly Example[] = [
  {
    id: "video",
    label: "On-demand video creation",
    play: {
      id: "example-video",
      title: "Phone camera roll to styled Reels",
      category: "On-demand video creation",
      description:
        "The member shares a batch of everyday phone photos and clips from around their neighbourhood. Grok Bot sorts them, picks what works for Instagram, studies what top accounts in the field are posting, and makes finished short Reels in that style (B-roll with bold on-brand text), with a content plan to follow.",
      heavyUseFor: "",
      playbookMd: videoPlaybook,
      pasteToInstall:
        'Written by another member. Read sections 1 to 8 before pasting this. Save this as a skill called "Camera roll to Reels". When I send a photo-album link and ask for Reels, follow the Steps, Guardrails and Output in the playbook I\'ve pasted above. Never post or schedule anything for me. Ask me the "Setup first" questions once before the first batch.',
      writtenOn: "grok-bot",
      figures: {},
      scores: noScores,
      score: null,
    },
  },
  {
    id: "prospects",
    label: "20 new prospects every day",
    play: {
      id: "example-prospects",
      title: "Daily prospect outreach drafts",
      category: "20 new prospects every day",
      description:
        "Every weekday morning, Grok Bot takes the next 20 strong-fit prospects from an outreach tracker. It checks that nobody has already been contacted, researches each organization and a named contact, and writes a personalised first-touch email asking for a short call. The drafts go into the member's Drafts folder unsent, the tracker is updated, and the member gets a short report on the batch.",
      heavyUseFor: "",
      playbookMd: prospectsPlaybook,
      pasteToInstall:
        "Save this as a skill called Daily prospect outreach drafts, using the Play, Trigger, Setup first, Steps, Guardrails, Output, Pitfalls seen and Done when sections above. Ask me the Setup first questions once. Then create a routine that runs it every weekday at 8:30 AM my time and reports to this chat. Never send anything; drafts only.",
      writtenOn: "grok-bot",
      figures: {},
      scores: noScores,
      score: null,
    },
  },
  {
    id: "paper",
    label: "A printed daily paper for the family",
    play: {
      id: "example-paper",
      title: "Printable one-page daily paper for the kitchen table",
      category: "A printed daily paper for the family",
      description:
        "Every morning, Grok Bot reads the family's calendars, the weather, the meal plan and the chore list, and lays them out on one page with a short fun corner for the children. The page is sent to the home printer before breakfast, so the day's plan is on the kitchen table and nobody has to open a phone to find it.",
      heavyUseFor: "",
      playbookMd: paperPlaybook,
      pasteToInstall:
        'Save this as a skill called "Daily family paper", using the Play, Trigger, Setup first, Steps, Guardrails, Output, Pitfalls to watch for and Done when sections above. Ask me the "Setup first" questions once. Then create a routine that runs it every morning at the time I choose and tells me in this chat when the page is ready. Never put private details on the page, and never invent an event.',
      writtenOn: "grok-bot",
      figures: {},
      scores: noScores,
      score: null,
    },
  },
];

/** The example the pages that show one play use: the annotated idea on /how-it-works. */
export const firstExample: Example = examples[0];
