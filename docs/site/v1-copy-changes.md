# Site v1: copy changes for Peter

Site version 1 uses the spec's draft copy word for word (plan R14a). This file lists every line that is not the spec's own wording, and why.

**Read sections 9 and 7 first.** Section 9 is Peter's third homepage review, of November 27, 2026: "How it works" merged into the hero, the two example plays, the shorter note under the price, the closing button, and `/pricing` and `/agents` deleted. It has what is waiting for his approval. Section 7 is his review of November 26, 2026, which changed the audience, the price shown, the name of what arrives each Monday and every start button. Sections 1 to 6 are the record before that, and several lines they quote ("Monday lists", "one list at a time", "for real estate", the sample play "Client email in two tones", anything on `/pricing` or `/agents`) are no longer on the site.

**Since the Pages editor (November 27, 2026), the wording on the site is not only in this file's sources.** A covered page prints three layers: the copy files below, then `src/data/site/released.json` (what preview had published when the last release was taken), then the edits published in that site's own Admin, Website, Pages. So a line quoted here may read differently on preview or on meetroger.ai. To see where a line comes from: open Pages on that site (an edited field is marked, with the original wording on request, and "Differs from the release" lists every edit made there since the release), and look in `released.json` for its field id. How the layers and a release work is in `docs/site/content-release.md`; how to use Pages is in `docs/site/pages.md`. Pages does not reach `/privacy`, `/terms`, `/zack`, sign-up, the app, the emails, or page titles and search descriptions: those are still only in the copy files.

Sources compared:

- **Marketing spec**: `artifacts/v3-marketing-website-spec.md`, "Messaging and copy direction".
- **Design spec 1.3**: `artifacts/Roger v3 - design spec.md`, A.4, A.7 and A.14.
- **The copy file**: `src/data/site/v1.ts`. Peter's letter is in `src/data/site/letter.ts` and the example plays in `src/data/site/examples.ts` (until November 27, 2026 there was one sample play, in `src/data/site/sample-play.ts`; see 9.5).

Amounts are never typed in the copy file. A line names them, such as `{monthlyUsd}`, and the page fills them from the settings. Below, the filled text is shown as a visitor reads it with today's settings: US$200 a month, US$200 a list, CA$280 a month, CA$280 a list, two free lists, 21 days. The higher rate is US$400 a month, or CA$560 in Canada. The spec's copy gives only the US figure. v1 gives both, which is a change to the spec's wording and is listed in section 2.3.

## 1. Lines the single-list price made false

The marketing spec prices one list at US$100 / CA$140. The price is US$200 / CA$280, the same as a month (plan R8). Each line that stated or implied the old price now says that monthly brings a list every Monday for the price of one list.

Design spec 1.3 already rewrote these lines for the new price, but its wording adds "about US$50 a list" and "about a quarter of the price per list". v1 does not use those two figures: R8 lists the only prices the site may show, and a per-list figure would be a typed number that no setting holds, so it would go stale the day a price changes.

| Where | Spec wording | v1 wording | Why |
|---|---|---|---|
| `/pricing`, the line under the two columns | Marketing spec: "Two lists one at a time cost the same as a whole month." Design spec 1.3: "One list on its own costs the same as a whole month. Monthly brings a list every Monday, so it is much cheaper: about a quarter of the price per list." | "One list on its own costs the same as a whole month. Monthly brings a list every Monday for that price." | The marketing spec's line is false at US$200 a list. The 1.3 line's first sentence is kept; "about a quarter" is dropped (see above). |
| Question "What does it cost?" | Marketing spec: "US$200 a month, or US$100 for one list at a time, plus tax where it applies. In Canada it is CA$280 a month or CA$140 a list, plus HST." | "US$200 a month, or US$200 for one list at a time, plus tax where it applies. In Canada it is CA$280 a month or CA$280 a list, plus HST. Monthly brings a list every Monday for the price of one list." | Old list price. The first two sentences are design spec 1.3 word for word. The last sentence is added, because two equal prices side by side need the difference said. |
| Question "Can I buy one list at a time?" | Marketing spec: "Yes. It is US$100 a list, ordered whenever you want one. Monthly costs less if you want a list most weeks." Design spec 1.3: "Yes. One list costs US$200, and you order it for any Monday you want. Monthly is much cheaper: for the same US$200 you get a new list every Monday, so each list works out to about US$50." | "Yes. One list costs US$200 (CA$280 in Canada), and you order it for any Monday you want. For the same price, monthly brings a new list every Monday." | Old list price, and "costs less" is no longer true of the price itself. The 1.3 line's first sentence is kept, with the Canadian figure added (section 2.3); "about US$50" is dropped (see above). |
| Price block, the one-list price | Marketing spec: "US$100 / list USD" and "CA$140 / list CAD" | "US$200 / list USD" and "CA$280 / list CAD", from the settings | Old list price. |
| Price block, the line under the monthly price | Design spec 1.3: "A new list every Monday, so about US$50 a list." (CAD: "about CA$70 a list") | "A new list every Monday." | The per-list figure is dropped (see above). The marketing spec has no line here. |
| Price block, the line under the one-list price | Design spec 1.3: "One list, for one Monday." | "One list, for one Monday." | Unchanged. Listed so the pair can be read together. |

No other line in the copy file states or implies US$100 or CA$140. A test fails if one appears.

## 2. Approved changes

**Approved by Peter on November 26, 2026:** the letter change (2.1), the cleaned sample play (2.2), the higher-rate wording (2.3), the footer label "For people who run AI agents", and the wording in section 3. The privacy and terms text was approved to be written from the spec. At that approval both pages carried the note "Draft, under review."; Peter reviewed and confirmed them later the same day (decision 3 below), and the note is gone.

**Four later decisions by Peter, also on November 26, 2026** (section 6 has what each one settled):

1. The public Zack files match the Zack 2.0 instructions (6.1).
2. The site's wording follows the Zack 2.0 instructions (2.5).
3. Privacy and terms are reviewed and confirmed (6.3). They no longer show the draft note.
4. When a shared play comes from a deleted account, the record says "unknown author" (6.4).

### 2.1 One change to the letter

The approved letter is section 10.2 of `artifacts/Archives/Circles/Roger (CTA Circles) - design spec.md` ("Approved by Peter, November 15, 2026").

The site shows three of its paragraphs: the first two and the one about Peter's background. The other three mention Circles or applications and are held back until Peter sends a new letter (spec A.10).

One shown paragraph is changed, by adding "AI" once. The vocabulary rule says "agent" never appears without "AI" in front on any page but `/agents` and `/zack`, because readers in real estate are also called agents.

| | Text |
|---|---|
| Peter's words | "Here is what I kept noticing. The most useful things people do with agents never get shared with others. The highlight reel sometimes gets posted. But never the playbook. So everyone is left to work out the same things alone." |
| Shown on the site | "Here is what I kept noticing. The most useful things people do with **AI agents** never get shared with others. The highlight reel sometimes gets posted. But never the playbook. So everyone is left to work out the same things alone." |

Both texts are stored. Nothing else in the letter is edited.

Paragraphs held back, unchanged:

- "My answer is Roger: A service that compiles full AI Agent playbooks from people. Every Sunday an agent called Zack writes up what worked that week for a Circle of people. Every Monday you get the best of it, ranked, with private details removed."
- "I read every application to Roger myself. I host the working sessions for the founding Circles."
- "If you run three or more agents every day and suspect you’re using a fraction of what they can do, apply."

### 2.2 The sample play

The sample idea card shows one real play until a play is chosen in the admin (plan R11). Peter approves this text before any version goes live (plan R12).

**Source:** the 2026-11-14 pilot Zack run, Play 1 ("Client email in two tones"), written on Claude. The person whose run it is is not named here or in the code, because a play never names who it came from.

**Why this one:** a reader in real estate understands it at once (replying to buyers and sellers), it starts on a plain request, its steps and guardrails are concrete, and the source play names no person, client, company or address.

**Removed, by kind:**

- The time saved each time the play runs.
- The by-hand and with-the-AI-agent timings, and the working that compared them.
- How often the play ran in the week, and the run counts for a year.
- The time saved a week and a year, with their ranges.
- The heavy-user run rate and its time saved.
- The formula for working out your own time saved.
- The confidence rating, which described those timings.
- The label that placed the play in one of the report's two sets.

**Changed, by kind:**

- "member" is now "user", in the description, the playbook and the install prompt, wherever it appeared. Roger no longer has members.
- The heavy-use line said "real estate agents"; it now says "people in real estate" (vocabulary rule). The public card does not print this line.
- Straight quotation marks and apostrophes are now typographic ones.
- The playbook's nine numbered parts are kept in order. Parts 1 to 8 are the playbook, with their numbers, because the install prompt refers to them by number. Part 9 is the install prompt and has its own box on the card.
- No step, guardrail or pitfall was added or reworded beyond the changes above.

**Three things for Peter to settle:**

1. **Cora's scores.** Cora has not scored this play, so its card has no score section at all: no heading, no bars. No score was made up. A play with scores shows the five bars. Either Peter supplies Cora's five scores for it, or a scored play is chosen in the admin and replaces this one.
2. **The category.** The Zack run gives none. The card says "Client email", taken from the play's title, until the fixed category list exists.
3. **"Claude" in the text.** The play was written on Claude and its steps say "Claude drafts only". The card prints "Written on Claude" under the install prompt. Say if the name should come out.

**The full cleaned text:**

> **Category:** Client email
>
> **Title:** Client email in two tones
>
> **Description:** The user pastes a rough note or a client’s message, and Claude returns two ready-to-send versions in different tones, signed and ready to go. It covers replies to buyers, updates to sellers, negotiation updates and quick messages to colleagues. When a line feels off, one short ask fixes just that part.
>
> **Paste to install:** Written by another user. Read sections 1 to 8 before pasting this. Save a skill called Client email in two tones. When I paste a message or rough note, follow the steps in section 4, keep the guardrails in section 5, and give me the output in section 6. Ask me the setup questions in section 3 once before the first run.
>
> **Written on:** Claude
>
> **1. Play**
>
> Client email in two tones. Turns a rough note or an incoming message into two polished replies you can send as is.
>
> **2. Trigger**
>
> A request, any time you need to reply to a client, a colleague or [your seller].
>
> **3. Setup first**
>
> - How do you sign your emails?
> - What tone do you want by default (warm, efficient, never pushy)?
> - Do you want two variants every time, or one?
> - Is there a file Claude should check first for listing or client details (for example a saved note about [your listing])?
>
> **4. Steps**
>
> 1. Read the incoming message or the user’s rough draft in full.
> 2. Pull out every fact and ask in it (what to send, what to ask, any dates or next steps). Keep all of them.
> 3. If a listing or client is named and there is saved context about it, check that first so details match.
> 4. Write two versions with clearly different goals, for example “Light touch” and “Helpful next step”, or “Warm” and “Short and direct”. Each gets its own subject line.
> 5. Use placeholders like [Name] and [phone number] for anything not given. Never invent a name.
> 6. If the ask includes a soft sell (such as offering a home evaluation), make it one gentle sentence with “no obligation” framing, placed after the main reply.
> 7. For updates on showings or negotiations, lead with the positive fact, then the honest status, then the next step.
> 8. Flag anything that looks like a typo in a name before the user sends.
> 9. When the user asks to change one paragraph, rewrite only that paragraph and give two options for it.
>
> **5. Guardrails**
>
> Claude drafts only. It never sends. It never invents facts about a property, a price or a person. If an attachment is mentioned (“attached are the floor plans”), remind the user to attach it.
>
> **6. Output**
>
> Two email drafts, each with a label, a subject line and a body signed with the user’s sign-off. One or two lines on how they differ.
>
> **7. Pitfalls seen**
>
> - A “subtle” ask came out sounding salesy. Fix: write it as genuine curiosity and offer help with no pressure; ask the user if it should be “more genuine” before finalising.
> - A thank-you came out generic. Fix: add specific, concrete details and tell the user to change any that did not happen.
> - Mentioning an attachment the user might forget. Fix: add a one-line reminder.
>
> **8. Done when**
>
> The user can paste either version and send it with no more than a name swap.

### 2.3 The higher rate, for a reader in Canada

The spec's copy states the higher rate in US dollars only. A subscriber in Canada pays CA$560, not US$400, so on a page whose price block shows "CA$280 / month CAD" these lines told a Canadian reader the wrong figure. Each one now gives both, in the form "US$400 a month (CA$560 in Canada)". Nothing else in these lines is changed. Both figures come from the settings (`{higherUsd}`, `{higherCad}`).

| Where | Spec wording | v1 wording | Why |
|---|---|---|---|
| Control block, third point | "Turn sharing off any time in your dashboard. On monthly your ideas keep coming and the price becomes US$400 a month." | "Turn sharing off any time in your dashboard. On monthly your ideas keep coming and the price becomes US$400 a month (CA$560 in Canada)." | A Canadian reader pays CA$560. |
| Question "I compete with other people on Roger. What if I don’t want to share?" | "… If you switch sharing off completely in your dashboard, monthly still brings three ideas every Monday and costs US$400 a month." | "… If you switch sharing off completely in your dashboard, monthly still brings three ideas every Monday and costs US$400 a month (CA$560 in Canada)." | The same. |
| Question "What if Zack misses a week?" | "On monthly, the first miss each month is forgiven. A second miss makes that month US$400. We email you both times." | "On monthly, the first miss each month is forgiven. A second miss makes that month US$400 (CA$560 in Canada). We email you both times." | The same. |
| `/pricing`, "How contributing works", the second miss | "… A second miss makes that month US$400. We email you both times, and the difference appears on your next invoice. …" | "… A second miss makes that month US$400 (CA$560 in Canada). We email you both times, and the difference appears on your next invoice. …" | The same. |
| `/pricing`, "How contributing works", sharing off | "… If you switch sharing off in your dashboard, the monthly price is US$400. …" | "… If you switch sharing off in your dashboard, the monthly price is US$400 (CA$560 in Canada). …" | The same. |

A test fails if a line gives the US higher rate without the Canadian one beside it.

One more line follows the same approved pattern. It states the price of one list, not the higher rate, and it gave a reader in Canada only the US figure. It was changed in code review on November 26, 2026, after Peter approved the rows above, so he has not read this line itself. The figures come from the settings (`{listUsd}`, `{listCad}`).

| Where | Spec wording | v1 wording | Why |
|---|---|---|---|
| Question "Can I buy one list at a time?" | Design spec 1.3: "Yes. One list costs US$200, and you order it for any Monday you want. …" | "Yes. One list costs US$200 (CA$280 in Canada), and you order it for any Monday you want. For the same price, monthly brings a new list every Monday." | A Canadian reader pays CA$280 for one list. The rest of this line is covered in section 1. |

No test holds this line to both figures: the test above covers the higher rate only.

### 2.4 The footer link to `/agents`

| Where | Spec wording | v1 wording | Why | Status |
|---|---|---|---|---|
| Footer, the link to `/agents` | "For people who run agents" | "For people who run AI agents" | The footer is on every page, and the vocabulary rule says "agent" never appears without "AI" in front outside `/agents` and `/zack`, because readers in real estate are also called agents. | Approved by Peter, November 26, 2026 |

### 2.5 What Zack reads, skips, removes and sends

**Approved by Peter on November 26, 2026: the site's wording follows the Zack 2.0 instructions.**

The spec's sentences said less than the instructions in `content/zack` do, and one of them ("He does not read your email, calendar or files.") was contradicted by them: Zack reads files in the account as finished work. Each line below now says what all four instruction files (Claude, Duet, Grok Bot, Hark) say, in the words they share. A test (`src/data/site/v1.test.ts`) compares each line with the four files, so neither can change without the other.

| Where | Spec wording | v1 wording | The instruction fact behind it |
|---|---|---|---|
| Question "What does Zack read?" (homepage and `/faq`) | "Only your own activity inside your AI agent account, from the past seven days. He does not read your email, calendar or files." | "The past seven days of activity across your AI agent account, including work finished in that time. He also reads the list of what the account has set up, such as its skills, scheduled tasks and connected services, and the notes your AI agent keeps about the Roger ideas it has installed. He skips email, calendar and Drive, chats and projects shared with other people, and other people’s messages. He reads no other account." | Security rule 3 and "What Zack reads" in each file: "the past 7 days of activity across" the whole account, with "finished work (files, …)"; "the account's list of skills, … and connected services (names only), and the file "Roger Upgrade Notes" if it exists"; "… other people's messages, email, calendar and Drive are skipped. No other accounts, and no lookback longer than 7 days." The shared things are named differently in each file ("Shared chats, shared projects" on Claude, "Group chats, shared projects" on Grok Bot and Hark, "Anything shared with other people" on Duet); "chats and projects shared with other people" is what all four cover. The setup list's parts also differ by AI agent (projects on Claude, bots on Grok Bot, specialties on Hark, recurring tasks on Duet), so the sentence says "such as", as the privacy page does. |
| `/how-it-works`, "What he reads" | "Only your own activity inside your AI agent account, from the past seven days." | The first two sentences of the answer above, word for word. | The same. |
| `/how-it-works`, "What he never reads" | "He does not read your email, calendar or files." | "He skips email, calendar and Drive, chats and projects shared with other people, and other people’s messages. He reads no other account." | The same. It names what the instructions say he skips and nothing else. "Files" is gone: files in the account are read as finished work. |
| `/how-it-works`, "What he removes" | "Names, clients, addresses, amounts and other private details are replaced by placeholders." | "Zack is instructed to replace names, clients, addresses, amounts and other private details with placeholders, and Roger checks again when the report arrives." | The ban list in each file: "**Banned** (replace each with a placeholder …)", with names of people, the user's companies and clients, addresses and amounts among its items, and "**Replace, don't delete.**" Zack is instructions the user's own AI agent follows, so the line says "is instructed to", as the privacy page does. `src/lib/intake/process.ts` checks every play again when the report arrives. |
| Question "What leaves my account?" (`/agents` and `/faq`) | "Zack’s weekly report: a write-up of your most useful plays with names, clients, addresses, amounts and other private details replaced by placeholders. You agree to this when you sign up, and you can turn it off." | "Two files each week. Zack’s report is a write-up of your most useful plays, which he is instructed to write with names, clients, addresses, amounts and other private details replaced by placeholders. A private matching profile describes your work and your setup in general words, and is not shared with other users. You agree to this when you sign up, and you can turn it off." | Security rule 2, "**Zack writes two files and nothing else.**", and rule 9, "**The profile is private.** The matching profile is never shared with other members"; "The private matching profile": "General words throughout." Both files are sent to Roger (`src/lib/zack/instructions.ts`, two send addresses). |

Checked and left as it is:

- **`/how-it-works`, "What you can change"**, and the answer to "Can I see and change what Zack does?". Each file says the user's own rules "add restrictions (skip a category, skip a subject, never include these words, outline only, fewer plays)", and the dashboard has a box for rules in the user's own words. The lines already say this.
- **The three short lines that say details are removed**: "writes up what worked, with client details removed" (homepage step 2, and Sunday on `/how-it-works`) and "with identities removed" (`/agents` step 1). They are one-line summaries in a list of steps. A version that says "is instructed to" and names Roger's second check did not read naturally at that length, so the short lines are kept and the full statement is in the answers above: "What he removes" sits under the Sunday line on `/how-it-works`, the control block on the homepage and `/agents` links to it, and `/agents` shows "What leaves my account?". If Peter wants the short lines changed too, they are three strings in `src/data/site/v1.ts`.
**The warning above the paste box on `/zack`.** Changed in code review on November 26, 2026, under the same approval: the site's wording follows what the product does. Peter has not read this line itself. Until then it was the spec's sentence, and it disagreed with the privacy page, which says a report "may be read" and does not say "never published", because a report attached to an account has its plays shared in anonymous form.

| Where | Spec wording | v1 wording | The fact behind it |
|---|---|---|---|
| `/zack/[agent]`, above the paste box | "Check your report for client names or private details before pasting. It is read by Roger’s team and by Cora, Roger’s ranking agent, and is never published." (A.11) | "Check your report for client names or private details before pasting. It may be read by Roger’s team and by Cora, Roger’s ranking agent. If you sign up, its plays are shared with other users in anonymous form." | The first sentence is the spec's, word for word. The rest is the privacy page's "The free Zack run" (section 3, corrections 9b and 9c): "Your report may be read by Roger’s team and by Cora", and after sign-up from that run "its plays are shared with other users in anonymous form." No code reads a report nobody signed up from; `claimFreeRun` in `src/lib/zack/receive.ts` stores a claimed report with the account's sharing setting, which starts as "share". The line is `zackWarning` in `src/data/site/v1.ts`. A test (`src/components/site/v1/zack.test.tsx`) pins it word for word and holds its two statements to the privacy text. It says "agent" without "AI" because it is shown on `/zack` only (spec 0.4). |

## 3. Wording the spec describes but does not write

The spec says what these sections hold, without giving the words. The wording below is new, built from the spec's own sentences where one exists, and states nothing the spec does not. Peter may want to read it.

**Short labels**

| Where | v1 wording |
|---|---|
| Price block heading | "Price" |
| Price block, plan names | "Monthly", "One list at a time" |
| Currency switch, for screen readers | "Show prices in" |
| Price block, the unit words in "US$200 / month USD" and "US$200 / list USD" | "month", "list" (from the spec's own price format) |
| Control block link | "How Zack works" |
| Questions heading and link | "Questions", "All questions" |
| Homepage section headings | "The problem", "How it works", "What arrives on Monday", "It compounds", "What people say", "Who runs this" |
| Homepage step titles | "Set up your AI agents", "Zack reviews your week", "Cora picks your three ideas", "Paste to install" |
| `/agents` step titles | "Add Zack", "Cora picks your three", "Paste to install" |
| Link under "Who runs this" | "Read Peter’s letter" |
| Sample card, after each score | "of 10", as in "8 of 10" |
| Sample card, the five score names | "Hours saved", "Reach", "Ease to copy", "Proof", "Surprise". These are the spec's names for Cora's five scores. The card prints the name and the score only, with none of the app's explanatory text under a name. |
| Brick stack, each brick's label for screen readers | "Week", "idea", "set up", "not set up yet", read as "Week 2, idea 1: set up" |
| Brick stack, the caption under a stack | "Week {week}" and "{bricks} ideas", read as "Week 26" and "78 ideas" (it read "78 bricks" until section 8.8; `{bricks}` is only the count's name in the code). The numbers are the compounding story's own. |
| Sample card | "Paste to install", "Copy prompt and playbook", "Written on", "Cora’s scores", "Not scored yet" (shown only when a play has some of its five scores and not others), "The playbook". The two help lines are the app's own: "The button copies this prompt with the full playbook under it. Paste both into your AI agent, then answer its setup questions." and "Words like “skill” or “routine” may have another name on your AI agent." |
| `/pricing` headings | "Pricing", "What is included", "Monthly or one at a time, explained", "How contributing works", "No refunds" |
| `/how-it-works` headings | "How it works", "The week", "Zack, in detail", "Cora, in detail", "The anatomy of an idea", "Your first two weeks" (the number is the settings' count of free lists), "If you have no AI agent yet". The six section headings are spec A.8's own names for the sections. |
| `/about` | "About". Above the letter, the homepage's own lead-in: "Roger is run by Peter Kuperman." For screen readers, once each file exists: "Peter Kuperman" for the photograph (as on the homepage) and "Peter’s signature" for the signature. Until there is a signature file, the letter ends with his typed name, "Peter". |
| `/faq` heading | "Questions" (the heading of the questions block, reused) |
| `/pricing`, `/how-it-works`, `/faq` and `/about`, browser title and search description | Titles: "Roger: Pricing", "Roger: How it works", "Roger: Questions", "Roger: About", each the page's own heading. Descriptions are lines already on each page, with no new wording. `/pricing`: "Three ideas every Monday, each with a full playbook. One list on its own costs the same as a whole month. Monthly brings a list every Monday for that price." `/how-it-works`: the Monday paragraph of the week. `/faq`: its four group headings in order, "Getting started, Zack and privacy, Cora and the ideas, Price and billing." `/about`: "Roger is run by Peter Kuperman." |
| `/pricing`, `/how-it-works`, `/faq` and `/about`, the start button each page ends on | The primary button, "Get two free Monday lists", with the card line under it, "Card required. Charged only with your third list.", as under the homepage's first button. No new wording. |
| Footer, beside the contact email | "Roger, Toronto" (as the footer reads today) |
| Not-found page | "That page isn’t here" (as today), "The link may be old or mistyped.", "Go to the homepage", then the start button. Today's line ends "(error 404). Try one of these:" and lists old offers; under v1 the list is gone and the number with it. |
| Browser title, search description and social card | Title: "Roger: Your AI agents, smarter every Monday." Description: the homepage sub-line. The social card shows "Roger" and the headline only. All three repeat the homepage's own headline and sub-line. |
| `/agents`, browser title and search description | Title: "Roger: Stop figuring out AI agents alone." Description: the `/agents` sub-line. Both repeat that page's own headline and sub-line. |
| `/agents`, the strip under the hero | The spec's line, "Zack files for Claude, Duet, Grok Bot and Hark. Any other agent adapts one with a single prompt.", reads the same today. The four names are no longer typed: the page lists the agents whose Zack file exists, in alphabetical order, so the sentence changes by itself when a file is added or removed. |
| `/zack` | "Run Zack on yourself first", "Pick your agent", "Your email", "Run Zack once", "Paste the report back", "Agent not listed?", "Start from the Hark file and ask your own agent to adapt it.", "Your top plays" |

**`/zack` and `/zack/[agent]`, the free Zack run** (spec A.11 and Circles spec 6.5 give the flow; little of its text is written)

This wording was added when the free run was built (plan U8), after Peter's approval on November 26, so he has not read it yet. All of it is in `v1Zack` in `src/data/site/v1.ts`. These two pages may say "agent" without "AI" (spec 0.4). No line names a price, an income or time saved. "[agent]" stands for the agent's name.

The warning above the paste box keeps the spec's first sentence, word for word: "Check your report for client names or private details before pasting." Its second sentence was reworded in code review to agree with the privacy page, and is now two: "It may be read by Roger’s team and by Cora, Roger’s ranking agent. If you sign up, its plays are shared with other users in anonymous form." Section 2.5 has the old wording and the fact behind the new.

| Where | v1 wording |
|---|---|
| Under the heading on both pages, and the search description | "Zack runs in your own agent account and writes up your best plays from the past seven days. Nothing is sent to Roger unless you paste it here." Circles spec 6.5 asks for these three facts. |
| Browser titles | "Roger: Run Zack on yourself first" on `/zack`, and the same with the agent's name after it on an agent's page, as in "Roger: Run Zack on yourself first: Claude". |
| `/zack`, each agent that has a file | "Zack file for", the agent's name, "Version" with the number the file itself states (2.0 today), and the button "Run Zack on [agent]". |
| `/zack`, each agent with no file yet | "No Zack file yet. You start from the Hark file and ask [agent] to adapt it." and the button "Adapt Zack for [agent]". |
| `/zack`, under "Agent not listed?" | The button "Start from the Hark file". |
| An agent's page, heading and link | "Run Zack on [agent]" ("Run Zack on your agent" when the agent is not one we list), "Pick another agent". While the page reads the visitor's run: "Loading your run…". |
| Step numbers, for screen readers | "Step", as in "Step 3: Run Zack once". |
| Email step | "Use the email you would sign up with. Your report can only be attached to an account with the same email." Field label "Email address". Button "Show me the instructions", and "Starting…" while it sends. Then "Your run is ready." with the link "Continue to the instructions", seen only for a moment or where the browser runs no script. |
| Email step, errors | "Enter a valid email address." "Too many tries with this email. Try again in an hour." "Too many tries from here. Try again in an hour." |
| Email step, when the page's address holds a run that cannot be opened | "That run link is no longer active. Start again with the same email and you get a new one. Already use Roger? Sign in", where "Sign in" is a link to `/signin`. The same line whether the link is mistyped, was replaced by a newer one or belongs to a run already attached to an account, so it tells nobody which. It does not say why the link stopped working. Starting again gives every email the same new, empty run, so the next page does not tell them apart either. Reworded in code review on November 26, 2026; it read "That run link is no longer active. Enter your email to start again." |
| When saving is not switched on (no database) | "Saving is not switched on here yet, so a report cannot be pasted back. You can still read the instructions and run Zack." |
| When something fails on our side | "Something went wrong on our side. Try again in a minute." (as on `/start`) |
| "Run Zack once", the file | "Give [agent] the Zack file. Download it, or copy its text." "Zack The Collector for", the agent's name, "Version" and the file's number. Buttons "Download the file" and "Copy the file". |
| "Run Zack once", an agent with no file | "There is no Zack file for [agent] yet. Start from the Hark file and ask your own agent to adapt it with this prompt." Field label "Your agent", with the example "e.g. ChatGPT". The prompt is word for word the one the `/hampton` page had (that page was deleted on November 26, 2026; see 6.5): "I want you to take the Zack The Collector file, and update it so that it works for [agent]. I then want you to create a .md file for my agent I can download and then do a test run and produce a markdown file". Until a name is typed the gap reads "[INSERT AGENT]", as it did there. Button "Copy prompt". Then "That test run is your report. Skip the next prompt and paste the report below." |
| "Run Zack once", the prompt | "Attach the file (or paste its text), then send this:" and the prompt, both word for word what the deleted `/hampton` page had: "Run Zack the Collector now from the attached file and create a .md output file." Button "Copy", which reads "Copied" for a moment after it is pressed. |
| "Run Zack once", last line | "When Zack finishes, come back and paste your report below. This page’s address holds your place, so you can bookmark it or leave the tab open." |
| Paste-back | Field label "Your Zack report". Button "Save my report", and "Saving…" while it sends. |
| Paste-back, errors | "Paste your report first." "That is over 40,000 characters. Paste the run file only, without the matching profile." (the number is the limit in the code) "Too many tries. Try again in an hour." "We could not save this report, because this run link is no longer active. Start again with your email, then paste the report there." with the link "Start again". |
| After the paste | Under "Your top plays": "Your report is saved.", then the titles of the plays, and nothing else from the report. When no title can be read: "We could not read the plays in your report. It is saved all the same." Then "Start with the same email and this report becomes your first run.", the one button "Get two free Monday lists", and the card line under it. A small link, "Paste a different report". |
| A reopened tab whose report is already in | "We have your report for this run. Pasting another replaces it." with the same start button. |

**`/how-it-works`** (spec A.8 lists the sections; none of its text is written)

- The week, Sunday: "Zack reviews the past seven days of your own AI agent activity and writes up what worked, with client details removed. He runs on his own, or you can upload his report yourself."
- The week, Monday: "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best. You receive your three ideas, each with a full playbook."
- The week, Tuesday: "Open an idea, press copy and paste it into your AI agent. It sets itself up and asks you what it needs to know."
- The week, Wednesday: "Each idea you set up stays set up, and your three ideas stay in your dashboard for when you want them."
- Zack, in detail: four points, "What he reads", "What he never reads", "What he removes", "What you can change". The first three were rewritten on November 26, 2026 to follow the Zack 2.0 instructions (section 2.5 has the old and new wording and the fact behind each). Two are sentences from the answer to "What does Zack read?", word for word, one is its own sentence, and one is from another answer, word for word:
  - What he reads: "The past seven days of activity across your AI agent account, including work finished in that time. He also reads the list of what the account has set up, such as its skills, scheduled tasks and connected services, and the notes your AI agent keeps about the Roger ideas it has installed." (the first two sentences of "What does Zack read?")
  - What he never reads: "He skips email, calendar and Drive, chats and projects shared with other people, and other people’s messages. He reads no other account." (the last two sentences of "What does Zack read?")
  - What he removes: "Zack is instructed to replace names, clients, addresses, amounts and other private details with placeholders, and Roger checks again when the report arrives."
  - What you can change: "Your dashboard shows the exact instructions your Zack runs. You can tell him to skip whole subjects, block specific words and names, share an outline only, or follow rules you write yourself." (from "Can I see and change what Zack does?", word for word)

  Under them, the line "Read the Zack files before you sign up", and one link for each AI agent whose Zack file exists, named as the file names it: today "Claude", "Duet", "Grok Bot" and "Hark". The names are not typed in the copy, and each link opens the file itself (for example `/zack/zack-the-collector-claude.md`).
- Cora, in detail: "Cora scores every play on five things: hours saved, reach, ease to copy, proof and surprise. She never sends you something you already run, and never names who a play came from."
- The anatomy of an idea, one note per part:
  - Play: "What the idea does, in a sentence."
  - Trigger: "What starts it."
  - Setup first: "What your AI agent asks you once, before the first run."
  - Steps: "What your AI agent does, in order."
  - Guardrails: "What it must never do."
  - Output: "What you get back."
  - Pitfalls seen: "What went wrong for someone else, and the fix."
  - Done when: "How you know it worked."
  - Paste to install: "The prompt you copy. The playbook goes with it."
- Your first two weeks:
  1. "You start, and we ask for a card. It is not charged."
  2. "Zack runs on Sunday."
  3. "Your first two Monday lists arrive. They are free."
  4. "After your second list, we email you with what happens next."
  5. "On monthly, your card is charged with your third list. On one at a time, it is charged only when you order a list. Cancel before then and you pay nothing."
  6. "If no first list is delivered within 21 days of sign-up, the trial closes without a charge."
- If you have no AI agent yet: "You can still start. The startup page walks you through installing one and setting up a starter team for real estate." Link: "Go to the startup page".

Two sentences were taken out of the week in code review on November 26, 2026, after Peter approved the wording in this section, and one was reworded:

- Tuesday began "Nothing new arrives." It was removed. No source says so, and things can arrive on a Tuesday: a failed charge is retried and the list is sent the moment it succeeds, and a held list is delivered later in the week (design spec B.8 and B.9).
- Sunday ended "You do nothing. He runs on his own." A user whose AI agent cannot send the report uploads it each week (design spec B.5, "Upload fallback"), so "You do nothing." was removed and the last sentence now names that route: "He runs on his own, or you can upload his report yourself." Both halves are the questions' own words ("Zack runs on his own on Sunday" and "or you can upload his report yourself").

The Wednesday paragraph does not mention the Wednesday numbers email, because that email is not part of this build. It also does not say that nothing arrives on Wednesday, because the spec plans that email for Wednesday and the line would turn false the day it ships.

The Trigger note says only "What starts it." The spec names the part without saying what a trigger can be, so the note does not list kinds of trigger.

**`/library`, the band above the footer** (spec A.12)

The sentence is the spec's, word for word: "This is what people post in public. Roger sends you what works in private." Under it is the primary button, "Get two free Monday lists", and under that the trial line, as in the closing band of the homepage. No new wording. The library's cards carry no link to `/setup`.

**`/privacy` and `/terms`** (spec A.13 lists what each must say; none of the text is written)

**Privacy and terms reviewed and confirmed by Peter on November 26, 2026.** Both pages now render without the note "Draft, under review." (`reviewed` is passed to `LegalPage` in `src/components/site/shared/site-legal.tsx`). The text was not changed by the review. One sentence was added the same day by a separate decision (correction 6 below: the record of which account a shared play came from).

Both documents are new wording, written from the spec's two lists, the design spec's decisions (0.2) and the code. Both are dated November 2026. They are in `src/data/site/legal.ts`. Under Circles and the legacy site, which are no longer served, `/privacy` and `/terms` are unchanged and still carry the draft note.

Every amount is filled from the settings: the six prices, the number of free lists, the 21 days and the 90 days runs are kept for. The 90 days is the `v3.retentionDays` setting, which is also what the hourly job uses to remove a user's runs and to remove free Zack runs, so the page and the job read one number (for up to a few minutes after the setting changes they can still differ: see 6.4). Each US price has the Canadian one beside it, as in "US$200 a month (CA$280 in Canada)".

Privacy, by section:

1. What sign-up collects
2. Your card
3. What Zack does
4. What happens to a run
5. What other users see
6. How long we keep your runs
7. The free Zack run
8. The public library
9. Existing library sign-ups
10. Analytics
11. The services that hold your data
12. Asking what we hold, correcting it or deleting it

Terms, by section:

1. The free trial
2. The price
3. Contributing, and the higher monthly rate
4. Refunds and cancelling
5. Tax
6. Your plays
7. The ideas
8. Questions

Statements that go beyond the spec's two lists, each from another source:

| Statement | Source |
|---|---|
| "Your quiz answers become the profile Cora uses to match ideas to you." | Design spec 0.2, "Sign-up quiz". |
| "Sharing has three settings: share with the pool, use for your own matching only, or Zack off. On matching only, Zack still sends both files; they are used to choose your ideas and none of your plays are shared. With Zack off, Zack is told to send nothing, except in a test run you start yourself, which still sends and is never shared." | Design spec B, the sharing control and acceptance item 8, and `src/lib/zack/instructions.ts`. It is there because "turn sharing off" alone would let a reader think nothing is sent on "matching only". |
| "Cora scores plays and picks the ideas each user receives." | The site's own copy. |
| The free Zack run: what is stored, who may read it, when it is attached and what happens then, when it is deleted, who can replace a report, and that the link should not be shared. | Plan KTD12, `src/lib/site/free-run.ts`, `src/app/zack/actions.ts` and `src/lib/zack/receive.ts`. "Roger’s team and by Cora" is from the spec's warning line (A.11), with "ranking agent" written "ranking AI system". See the corrections below. |
| "Only a list that is delivered to you counts as one of them." and "It is not charged then." | Design spec 0.2, "What counts as a free run", and the `/how-it-works` copy. |
| "Everyone starts as a contributor.", "A miss caused by Roger never counts.", "It is not a plan you can choose." | Design spec 0.2, "The higher rate" and "Contributor rule". |
| "Your subscription itself stays at the standard price. For a month at the higher rate, the difference is added to your next invoice as its own line." | Design spec B, "How the higher rate is billed". |
| "One-at-a-time lists need that week’s Zack report. With Zack off, a list cannot be ordered." | The first sentence is the `/pricing` copy, word for word. The second is design spec B.9 ("It needs sharing switched on") and `src/lib/billing/orders.ts`, which refuses the order. |
| "in one click", and "Your access continues to the end of the month you have paid for." | Design spec 0.2, "Refunds", and the cancel rule in B. |
| "Prices are shown before tax. HST or other tax is added where it applies." | Design spec 0.2, "Sales tax". |

**The three passages kept from the earlier privacy text.** The spec says the passages on the library, watches and analytics stay as they are. "The public library" and "Existing library sign-ups" are copied from the Circles privacy preview, and "Analytics" from the setup-era privacy text. Two are word for word. One sentence is left out of the third: the watch passage began "The library's optional watch sign-up is separate from Circles.", and a site version has no Circles. The rest of that passage is unchanged, and so is its heading. A test compares all three with their sources. Without its first sentence the passage opened on "It collects the email and search you provide", with nothing to say what "it" was. In code review on November 26, 2026 the "It" was replaced by the subject of the dropped sentence, so the passage now opens "The library's optional watch sign-up collects the email and search you provide so Roger can send matching use cases." No other word of the passage is changed, and the test pins exactly that difference.

**Corrections made in code review, November 26, 2026.** An accuracy audit compared every sentence of both drafts with the spec and with what the code does. Where a sentence, or the spec sentence it was copied from, said something the code or the Zack instructions do not do, it now says what happens. They are part of the text Peter reviewed and confirmed on November 26, 2026. Each has a test in `src/data/site/legal.test.ts` that fails if the correction is removed.

Privacy:

| # | Spec or draft wording | Corrected wording | The fact behind it |
|---|---|---|---|
| 1 | "It reads only that account’s activity from the past seven days." (spec A.13) | "It reads the past seven days of activity across that account, including work finished in that time. It also reads the list of what the account has set up, such as its skills, scheduled tasks and connected services, and the notes file your AI agent keeps about the Roger ideas it has installed, from which it reports on ideas from the past eight weeks." | The connected instructions in `content/zack/claude.md`, `duet.md`, `grok-bot.md` and `hark.md`: security rule 3 and "What Zack reads" (the week's activity with finished work, the setup list, "Roger Upgrade Notes"), and "Past ideas" in the profile ("from the past 8 weeks"). The four files name the setup list's parts differently (projects on Claude, bots on Grok Bot, specialties on Hark), so the sentence gives the parts they share. See 6.4. |
| 2 | "Zack removes private details before it writes its report." (spec A.13) | "Zack is instructed to remove private details before it writes its report, and Roger checks again when the report arrives." | Zack is instructions the user's own AI agent follows. `src/lib/intake/process.ts` checks every play again and flags what it is unsure of. |
| 3 | "It sends that report to Roger each week, because you agreed to that when you signed up." | "Zack sends two files to Roger each week, because you agreed to that when you signed up: the report, and a private matching profile." Then: "The matching profile describes, in general words, the kind of work you do, what your AI agent account has set up, the public services connected to it by name, where your week still took effort, and what became of earlier Roger ideas. Roger uses it to match ideas to you. It is not shared with other users. It is sent on the share and matching only settings. Its contents are erased when you delete the run it came with, and with your runs after your access ends." | Two send addresses in `src/lib/zack/instructions.ts`; the `zack_profiles` table in `db/schema.sql`; what it holds in `content/zack/claude.md`, "The private matching profile"; read for picking in `src/lib/cora/context.ts`; sent on matching only by `src/lib/zack/rules.ts`; erased by `deleteRun` in `src/lib/zack/settings.ts` and by `src/lib/housekeeping/retention.ts`. |
| 4 | "When a run reaches Roger, it is checked again for private details and then stored." | "When a run reaches Roger it is stored as it arrived. It is then checked again for private details before any of its plays are shared." | `storeReport` in `src/lib/zack/receive.ts` writes the text first; intake runs afterwards and never rewrites the stored text. |
| 5 | (nothing) | "Roger’s team can read a run, and reviews any play the check flags before it is shared." | `src/lib/admin/runs.ts` returns a run's text; `src/lib/admin/flags.ts` is the review queue. |
| 6 | "Plays already shared stay in the pool, without anything that identifies you." | "Plays already shared stay in the pool. Other users see nothing that identifies you. Roger keeps your own copy of each shared play until your account is deleted, and a private record of which account a shared play came from, so that Cora does not send it back to you. When your account is deleted, that record is changed to say “unknown author”." | The user's `plays` row stays while it has a pool play, and goes with the account (`db/schema.sql`, `on delete cascade`). `pool_play_contributors` holds the account's id (`src/lib/cora/merge.ts`, read in `src/lib/cora/context.ts`). The last sentence was added on November 26, 2026, with Peter's decision that a deleted account's shared plays say "unknown author": `deleteAccount` in `src/lib/admin/users.ts` changes the account's rows in the statement that deletes it, and the hourly task `unknown_authors` (`relabelOrphanContributors` in `src/lib/cora/contributors.ts`) does the same for any row whose account is already gone. See 6.4. |
| 7 | "On matching only, your run is used to choose your ideas and none of your plays are shared. With Zack off, Zack is told to send nothing. The Terms say what turning sharing off does to the monthly price." | The sharing sentences in the table above, then: "On monthly, matching only and Zack off both bring the higher monthly rate, which the Terms describe." | `recordWeek` in `src/lib/billing/contribution.ts` and `src/lib/zack/sharing-effect.ts`: any setting but "share" is the higher band. A test run sends with sharing off (`buildInstructions` in `src/lib/zack/instructions.ts`) and is never shareable (`src/lib/intake/process.ts`). |
| 8 | "We keep your runs while you subscribe, and for 90 days after." | "We keep your runs while you have access to Roger, and for 90 days after your access ends. Cancelling does not delete your account." Then: "After that period the text of each run and its matching profile are erased, and plays that were never shared are deleted. An empty record of each run stays until your account is deleted: its week, how it arrived, the AI agent it came from and when it arrived." | `src/lib/housekeeping/retention.ts` counts from `access_ends_at`, which also covers trial and one-at-a-time users, and leaves the run row as an empty stub. Only `deleteAccount` in `src/lib/admin/users.ts` deletes an account, and only a closed one. |
| 9a | "It stores three things: the email you give, the AI agent you choose and the report you paste." | "It stores the email you give, the AI agent you choose and the report you paste. To limit misuse, it also keeps a count of requests from your IP address. Each count covers one hour and is removed by an hourly clean-up after that hour ends." | `src/app/zack/actions.ts` counts starts and pastes under a key that holds the IP address (`src/lib/rate-limit.ts`, one-hour windows). `cleanUpExpired` in `src/lib/housekeeping/retention.ts` deletes expired counters, and now runs before the paid cycle is live (below). |
| 9b | "Your report is read by Roger’s team and by Cora, Roger’s ranking AI system. It is never published." (spec A.11) | "Your report may be read by Roger’s team and by Cora, Roger’s ranking AI system." | No code reads a report nobody signed up from. "Never published" is dropped because the next sentence says its plays can be shared. |
| 9c | "It is then copied into your account as your first run, and kept like any other run." | "It then becomes your first run and is treated like any other run: with sharing on, which is how every account starts, its plays are shared with other users in anonymous form." | `claimFreeRun` in `src/lib/zack/receive.ts` stores it with the account's sharing setting, which defaults to "share" (`db/schema.sql`). |
| 9d | "The email and the AI agent stay on that record while your account exists." | "… until your account is deleted." | `purgeFreeRuns` in `src/lib/site/free-run.ts` deletes the row once its account is gone. Cancelling does not delete an account. |
| 9e | "If you start the free run again with the same email and the same AI agent, the earlier run and its report are replaced." | "The run is reached by the link in your browser’s address bar. The run link works for anyone who has it, so do not share it. Anyone with the link can replace the report, and anyone who enters your email at /zack with the same AI agent can start the run again, which replaces the earlier run and its report. Neither can read a report you pasted." | `startRun`, `saveReport` and `readRun` in `src/lib/site/free-run.ts`: the email is not verified, a paste needs only the token, and no function returns a stored report. |
| 10 | "They never see who a play came from." (spec A.13) | "Roger never shows who a play came from." | Roger attaches no name. Whether a playbook's own words give someone away depends on Zack and the checks. |
| 11 | "Vercel, which runs the site; … Google, for sign-in with Google and for Meet" (spec A.13) | "Vercel, which runs the site and passes Roger’s requests to the model provider; … Google, if you sign in with Google" | Sign-in with Google is in `src/lib/auth/google.ts`. No Meet feature is in the code: the spec lists Meet for the weekly group session, which belongs to a later version, and the entry goes back in with it. Model calls use the AI SDK with a provider-and-model name and no provider key (`src/lib/intake/model.ts`, `src/lib/cora/merge.ts`, `src/lib/cora/fit.ts`), which sends them through the Vercel AI Gateway (`src/lib/ai/errors.ts`, design spec B.7). Whoever owns the gateway account should confirm the wording. |
| 12 | The watch passage's opening "It" | "The library's optional watch sign-up" | Above. |

Terms:

| # | Draft wording | Corrected wording | The fact behind it |
|---|---|---|---|
| 13 | "If you switch sharing off in your dashboard, the monthly price is US$400 a month (CA$560 in Canada)." | "If you set sharing to matching only or to Zack off in your dashboard, the monthly price is US$400 a month (CA$560 in Canada)." | As row 7. A user on matching only, whose Zack still runs, would not have read "sharing off" as theirs. The marketing pages still say "switch sharing off" (section 2.3). |
| 14 | "It is charged once a month and brings a list every Monday." | The same, then: "A week has no list when Roger has no new ideas for you or the week fails on our side, and lists are held while a payment is unpaid." | Design spec B.7 ("No eligible plays", "When it fails") and B.9 (a failed charge, a renewal unpaid after seven days); `src/lib/cora/job.ts`, `src/lib/cora/send-job.ts` and `src/lib/billing/renewals.ts`. |
| 16 | "One-at-a-time lists need that week’s Zack report." | The same, then: "With Zack off, a list cannot be ordered." | `placeOrder` in `src/lib/billing/orders.ts`. |

Read and left as they are:

- **"the difference is added to your next invoice as its own line"** (item 15). Design spec B.9 has two exceptions: a user not sharing at their first charge has the difference on that first invoice, and a second miss found less than three days before a renewal goes on the invoice after it. The sentence is right for every other month, and the user is emailed the date each time, so it is not changed. Peter may want the exceptions said.
- **"(CA$280 in Canada)"** (item 17). Peter approved this pattern (section 2.3). It is not exact: the currency is the user's own choice at the card step of sign-up, offered by country and changeable there, and fixed once the card is saved (design spec B.4). A user in Canada who chose US dollars pays the US price. "CA$280 if you pay in Canadian dollars" would be exact.

**Topics the documents do not cover.** Nothing below is in either document, because no source states it. Peter reviewed and confirmed both documents as they are on November 26, 2026, so this is a reference list for whoever next revises them, and no longer something to settle before merging.

Privacy:

- The model provider's name, and its position on training (section 6.3).
- What Roger uses each piece of data for, beyond what the sections above say, and any statement that data is not sold.
- Cookies and browser storage: the sign-in session cookie, and the currency choice, the audience and the campaign tags kept in the browser tab. The Circles preview has a currency passage; it was not one of the three the spec says to keep.
- What a referral code or a campaign tag carries into sign-up.
- The rate-limit records sign-in, sign-up and the card step keep, some of which hold an IP address. The free Zack run's are now stated.
- That the record of which account a shared play came from is itself never removed. The page now says what becomes of it when the account is deleted: it says "unknown author" (6.4).
- That Roger's team can read a matching profile. No admin page shows one today, so the page does not say it.
- What deleting an account removes. The design spec describes it (B.14), but the spec's list for this page does not ask for it.
- Sign-up leads: what is kept about someone who starts sign-up and does not finish.
- Which service stores data in which country.
- Who the "30 days" promise is measured for. The page says "We will answer within 30 days." The spec says only "with a 30-day promise", so whether the promise is to answer or to finish the correction or deletion is Peter's to settle.
- A named privacy contact, the law the page is written under, a regulator, or a right to complain.
- Children, and any minimum age.
- How changes to the page are announced.

Terms:

- The governing law, a limit on liability, and how the terms change. The setup-era terms had all three; they described a different product and nothing in the v3 sources restates them.
- Who may sign up, and what a user may not do with a playbook.
- What happens to a list already ordered when a one-at-a-time user cancels.
- The failed-payment retries, the hold on lists while a renewal is unpaid, and plan switches.
- Which currency a user is charged in, and how it is chosen.
- The referral credit, sponsor codes and the group session, which belong to a later version.
- The number of misses forgiven is written as "the first miss each billing month", as the site's copy has it. It is a setting (`v3.forgivenMissesPerMonth`, 1 today) that no amount name covers, so this sentence would be wrong if the setting changed.

## 4. Choices made where the spec is silent

- **Which six questions each page shows.** Homepage: "I don’t use AI agents yet. Can I start?", "What do I have to do each week?", "What does Zack read?", "Who sees my plays?", "What does it cost?", "When is my card charged?". `/agents`: "Which AI agents does Roger work with?", "What leaves my account?", "Can I see and change what Zack does?", "I compete with other people on Roger. What if I don’t want to share?", "Will an idea work on my AI agent if it came from a different one?", "When is my card charged?". `/faq` shows all eighteen.
- **The weekly group session** is left out of "What is included". The spec shows it only once that part of the product is live.
- **Typography.** Straight apostrophes and quotation marks in the spec are typographic ones on the site, as elsewhere in the repo.
- **`robots.txt` allows one API address.** Spec A.2 keeps crawlers out of `/api`. v1 does that, and allows `/api/zack/instructions` alone. That is the address a user's own AI agent fetches during Zack setup, and many agents' fetch tools obey `robots.txt`: with all of `/api` disallowed, such a tool would refuse the fetch and setup would stop. The longer rule wins, so every other `/api` address stays disallowed. The address returns nothing without a user's Zack key. The app is disallowed as `/app/` and `/app$`, not `/app`, because `/app` alone would also cover `/apple-icon`.

## 5. Noted, not changed

- **The line added to the top of every playbook** is a setting the app owns: "I want you to take this document, and update it so that it works for my agent system and then install the playbook, asking me questions as needed." It says "agent" without "AI". The public card copies it to the clipboard with the playbook but does not print it. `/how-it-works` prints it, as the spec asks, first in "The anatomy of an idea" under the label "Added to the top of every playbook". It is printed word for word, as a quotation of the instruction a user pastes, because the site must show what is really added. That quotation is the one place on `/how-it-works` where "agent" appears without "AI": the block carries a mark (`data-verbatim="playbook-preface"`), and the vocabulary test leaves out that block and nothing else. The page always prints the setting's current text, so if Peter changes the setting to say "AI agent system", the page follows with no code change.
- **"Hours saved"** is the name of one of Cora's five scores, and the sample card shows it as a bar's name with a score out of 10. It is not a time figure. The spec names the five scores in the same words. The card prints the name alone: the app's line under it, about time saved a week, is not on the public card.
- **Digits that are spec or source wording.** The site's rule is that no number is typed into copy except the compounding labels. These digits are not amounts and not claims, and each is the spec's or the source's own wording, so they stay:
  - "run by 3 users", in the answer to "Who sees my plays?" (spec A.14, word for word).
  - "of 10", after each of Cora's scores on the sample card.
  - "sections 1 to 8", and "section 3" to "section 6", in the sample play's install prompt, with the playbook's headings numbered 1 to 8 to match.
  - The years in Peter's letter: "at 17", "35+ years later", "18+ years" (the approved letter).
- **The playbook names Claude.** The sample play was written on Claude, and its text says "Claude returns two ready-to-send versions", "a file Claude should check first" and "Claude drafts only". The card also prints "Written on Claude". This is the source's wording, kept. It is the third thing for Peter to settle in section 2.2.
- **"One list on its own costs the same as a whole month"** is true only while the two settings are equal. So are "for the price of one list" in "What does it cost?" and "For the same price" in "Can I buy one list at a time?". The prices come from the settings and these sentences do not, so if the monthly price and the one-list price are ever set apart, the three sentences turn false and no test will catch it. They are the wording R14a asks for, so they are not changed.

## 6. Decisions of November 26, 2026, and what remains

This section began as the list to resolve before merging to `main`, because merging the v1 pull request puts v1 on meetroger.ai with no separate go-live step. It is now a dated record: on November 26, 2026 Peter made four decisions that settled the four largest items. Each subsection below starts with what was decided and what was done. What remains is short, and is under "Still open" in each subsection, in 6.2, and in 6.4 (c). The list of what Peter still settles before the merge is in `docs/site/v1-acceptance.md`, "Resolve before merging".

### 6.1 Resolved: the public Zack files match Zack 2.0

**Peter's decision, November 26, 2026:** "The public Zack files should match the latest Zack instructions and prompts, which is now at v2.0. Feel free to edit so this match is true."

**How the three sets of files relate.** For each of the four AI agents, `content/zack/<agent>.md` (the connected instructions a signed-up user's Zack fetches) is the same file, byte for byte, as `artifacts/Zack/Zack The Collector (for <Agent>) v2.0.md`. Before this change the public file `public/zack/zack-the-collector-<agent>.md` was that same file with one difference: its version line did not end "· Draft for Peter's approval". So the public files were already the 2.0 instructions, and the Circles-era lines below were in the 2.0 source too. `content/zack` and `artifacts/Zack` were not changed by this decision. They were changed later the same day by the decisions in 6.5, which also says how the three sets relate now.

**What a public file is for.** One 2.0 file works two ways: "connected" when it was fetched with a Zack key and ends with a "Send to" section, and "hand-run" otherwise, when Zack "delivers his two files to the member, and sends nothing". A public file has no "Send to" section, so a run from it is a hand-run. The visitor pastes the report at `/zack` themselves.

**What changed, the same in all four public files:**

| Line | Before | Now |
|---|---|---|
| "The two ways Zack runs", a line added at the end | (nothing) | "**This public copy** is the file offered at meetroger.ai/zack. It has no "Send to" section, so every run from it is a hand-run: Zack sends nothing to Roger or to anyone else." |
| "Sensitive uses", the test | "… whether another circle member could guess who or what situation it is about." | "… whether another member could guess who or what situation it is about." |
| "How the run is delivered", hand-run | "… a reminder to check the review list before sending the run file on. Zack never sends it anywhere; the member emails or shares the run file themselves." | "… a reminder to check the review list before sharing the run file. Zack never sends it anywhere; the member shares the run file themselves, for example by pasting it at meetroger.ai/zack." |
| The section "How the shared collection is handled (for the collector)", seven lines: a named collector (Peter) receives the files by email; only the circle's members see them, under the circle's confidentiality agreement; kept 12 months, then deleted; removal by asking the collector, within 7 days; incoming plays; no profile file in the collection | (as described) | The section "What happens to a hand-run report pasted at meetroger.ai/zack", seven lines, each a fact from the privacy page's "The free Zack run" and plan KTD12: it gets there only by the member pasting it; Roger stores the email, the agent chosen and the pasted report; it may be read by Roger's team and Cora; it joins an account only on sign-up from that run with the same email, and is then a run like any other; a run not signed up from is deleted after the retention period stated at meetroger.ai/privacy (no number of days is typed, because it is a setting); the privacy page says how to ask what Roger holds and to have it deleted; the profile file is never pasted. |

Nothing else differs from the 2.0 instructions: what Zack reads and skips, the ban list, the method, the playbook standard, the report format and the two structured blocks are word for word the same. A test (`src/lib/site/public-zack-files.test.ts`) holds the four files to this: no Circles-era phrase, nothing that has the AI agent send or email a report, version 2.0, the reading rules identical to `content/zack`, and the report shape the title reader and the sign-up claim read.

**Still open in the public files:**

- **Resolved in 6.5: "Version 2.0 has not been run on a Claude account."** The Claude, Duet and Hark files each ended with a section "Not confirmed about <agent>" that began with this notice. Peter decided on November 26, 2026 that it goes, and it was removed from the source, the connected instructions and the public file together.
- **The files call the reader "the member".** The 2.0 instructions use that word throughout, including in the report itself ("The member is "the member""), so it is the instructions' own vocabulary and was kept.
- **The files describe the connected way of running as well as the hand-run.** They are one file for both, as 2.0 is. The connected lines apply only to a copy fetched with a Zack key, and the added line says this copy is not one.
- **Resolved in 6.5: `/hampton` asked its visitors to email the report to Roger's address.** Peter decided on November 26, 2026 to delete `/hampton`, `/rlp` and `/founders`. They redirect to `/zack`, where the visitor pastes the report.
- **The design spec (A.11, B.5) says the public files stay at version 1.9.** Peter's decision replaces that: they are 2.0.

**What the files said before**, for the record, from `public/zack/zack-the-collector-claude.md` as it was:

- **What Zack reviews (line 15).** "Zack reads across the whole Claude account, not just his own chat. Every Zack run reviews the past 7 days of activity across all chats and projects in the member's Claude account: every chat, scheduled-task runs and finished work (files, documents, decks, sheets and other artifacts, browser tasks, drafts) and skills used. … Shared chats, shared projects, other people's messages, email, calendar and Drive are skipped." So the file says Zack does review files in the account. What it skips is "email, calendar and Drive".
- **Who receives the reports (line 258).** "Who holds it: one named collector (Peter) receives the files by email. Members' agents never write to it." This is how Circles worked.
- **Who sees them (line 259).** "Who sees it: only the circle's members, under the circle's confidentiality agreement, which covers the collection itself." The site says "Other Roger users, without your name or anything that identifies you."
- **How long they are kept (line 261).** "How long it's kept: 12 months, then deleted." The design spec (0.2, Retention) says runs are kept while a user subscribes and for 90 days after.
- **Not yet run (line 274).** "Version 2.0 has not been run on a Claude account. It was ported from the Grok Bot version. The first test run should answer these before the file is shared:". The Duet and Hark files carry the same notice at their line 274 ("has not been run on a Duet account", "has not been run on a Hark account"). The Grok Bot file does not have it.
- **The version (line 3).** "Version 2.0 · November 22, 2026 · Roger (meetroger.ai)". All four public files are 2.0. The design spec (A.11, B.5) says the public files stay at version 1.9.

The same lines were in the Duet, Grok Bot and Hark files (one line earlier in the Grok Bot file: 14, 257, 258 and 260).

Of these, the lines on who receives a report, who sees it and how long it is kept are replaced (above). The line on what Zack reviews is the 2.0 instruction and stays; the site's sentence was changed to agree with it (section 2.5). The notice was removed later the same day (6.5). The version is under "Still open" above.

### 6.2 Lesser items for the same review

- **"A compounding view of what you have set up."** This is the fourth line of "What is included" on `/pricing`, and it is the spec's wording (A.7). The app's compounding graph is planned for a later version: design spec B.10 says of `/app/history`, "A count of bricks. (The compounding graph arrives in B2.)". Peter decides whether a count of bricks is "a compounding view", or whether the line is held back until the graph exists, as the group session line is.
- **`/how-it-works`, "What you can change", does not mention switching sharing off.** The spec says a user can turn sharing off (A.13), the answer to "What leaves my account?" says "you can turn it off", and the control block says it on the homepage and `/agents`. `/how-it-works` never says it. Adding it brings the higher-rate sentence with it, so it is left for Peter.
- **The free Zack run accepts 40,000 characters, not the spec's 20,000.** The spec sets 20,000 (A.11). Of the thirteen real reports in `artifacts/Zack Runs`, ten are longer than that: they run from about 8,500 to 33,200 characters, so the specified limit would have stopped most visitors at the paste step. The limit is 40,000, which clears the longest real report and stays inside the 80,000 that sign-up's own claim accepts. It is one number (`FREE_RUN_REPORT_CHARS` in `src/lib/site/free-run.ts`) if Peter wants another.
- **The public Zack files described a collector and a circle.** Resolved in 6.1: those lines are replaced. The files still call the reader "the member", which is the 2.0 instructions' own word.

### 6.3 Resolved: privacy and terms are reviewed

**Privacy and terms reviewed and confirmed by Peter on November 26, 2026.** In his words: "The legal drafts are now reviewed and confirmed."

- **The draft note is gone.** `/privacy` and `/terms` under a site version render with `reviewed` passed to `LegalPage` (`src/components/site/shared/site-legal.tsx`), so "Draft, under review." no longer shows. A test (`src/lib/site/version-pages.test.tsx`) fails if the note comes back. The Circles and legacy branches of the two pages are no longer served and were left as they are.
- **The text was not changed by the review**, including the watch passage's new opening and the corrections in section 3.
- **The privacy page and the public Zack files now agree.** The files' lines on who receives a report and how long it is kept were replaced with the privacy page's own facts, and point to the privacy page for the retention period (6.1).
- **The topics the documents do not cover** are listed in section 3, "Topics the documents do not cover", as a reference for whoever next revises them. They are no longer something to settle before merging.

**Still open:**

- **The model provider's position on training is not known.** The privacy page still says only: "We are confirming the model provider’s position on training its models, and will state it here." Peter confirmed the page with that sentence in it. It is to be replaced with the provider's position once that is known. It is the constant `trainingPosition` in `src/data/site/legal.ts`, with a comment saying so. Two tests pin the sentence word for word, and the word "train" to that one place on the page, so any new wording has to change the tests with it. The provider is not named on the page either.

**The free Zack run: risks accepted in the plan (KTD12)**

These follow from two choices: the run asks for an email and does not verify it, and a run is reached by the token in its page address and by nothing else. Peter should know them before a version goes live.

- **Starting again erases a pasted report that is not yet on an account.** Anyone who enters an email at `/zack` starts a new run for it, and the earlier run for that email and agent is emptied. So a person who knows someone's email can make them paste their report again. They cannot read the report or attach it to an account. A report already attached to an account is not touched: it was copied into the account when it was attached.
- **A run's token in a page address lets its holder replace the report, and never read it.** The address of a run page holds the token. Whoever has that address (from a shared screen, a forwarded link, a browser's history) can paste a different report over one that is not yet on an account. No page and no answer ever shows a stored report, or gives back a token issued earlier.
- **The email is not verified.** Someone can start a run for another person's address, paste a report, and send that person the sign-up link. If the person then signs up through that link with that email, the report becomes their first run. The warning above the paste box is the only guard on what a report contains.

**The free Zack run: three things on the app side, which this work did not change**

- **Signing up with a different email attaches nothing, and says nothing.** A report is attached only to an account with the same email as the one given at `/zack`. A visitor who gives one email there and signs up with another gets an account with no first run, and no page or email tells them why. The email step does say "Your report can only be attached to an account with the same email."
- **A person who already has an account gets nothing attached, and no message.** The report is attached at sign-up only. Someone who already uses Roger can go through `/zack`, paste a report and press the start button, and nothing is attached and nothing says so. The line on an inactive link now points them to sign-in; nothing else does.
- **If analytics are ever switched on, run tokens would go to the provider.** A run page's address carries the token (`/zack/claude?run=…`), and so does the start button's (`/start?…&zack=…`). No analytics run on these pages today. If any are added, the page address they send must have the token taken out first.

**The free Zack run: the per-IP limits count valid requests**

These counters hold the visitor's IP address for an hour. The hourly task that deletes expired counters, links and sessions (`expired_cleanup` in `src/lib/housekeeping/job.ts`) ran only while the paid cycle was live, so before go-live the addresses would have been kept with no end. It now runs always, as the free-run purge does: it only deletes rows already past their expiry.

The lesson on per-IP lockouts (`docs/solutions/security-issues/per-ip-lockout-blocks-everyone-behind-an-agent-platform-2026-11-22.md`) says to limit by IP only for failures, because many people can share one address: an agent platform, an office, a VPN. The two per-IP limits here (starts, and pastes) count every valid request and refuse the 101st in an hour from one address, so they depart from the letter of that lesson. They were kept because these two requests have no failure to count: a start succeeds for any well-formed email, and each one writes a row and can empty someone's run, so the limit is what stops a script doing that for a list of addresses. They are set at 100 an hour, twenty times the per-email limit of 5, and a test starts runs for twenty emails from one address. The per-IP limit is checked before the per-email one, so a start it refuses does not use up one of that email's tries. A badly formed email, an unknown agent, and an empty or over-long report are refused before anything is counted.

### 6.4 What the accuracy audit of the privacy and terms drafts left open

The corrections themselves are in section 3. These are what they leave for Peter or for the app.

**(a) Resolved: the marketing pages said less than the Zack instructions read.** Peter's decision, November 26, 2026, on the narrower sentence: "the same applies", that is, the site's wording follows the Zack 2.0 instructions. The answer to "What does Zack read?" and "What he reads" and "What he never reads" on `/how-it-works` now say what the four instruction files say, as the privacy page already did. Section 2.5 has each changed line, old and new, with the fact behind it.

**(b) Resolved in the detailed answers: "Zack removes private details" stated as a fact.** "What he removes" on `/how-it-works` and the answer to "What leaves my account?" now say Zack "is instructed to" replace private details, and "What he removes" adds that Roger checks again, as the privacy page does. "What leaves my account?" also names the second file Zack sends, the private matching profile. Three one-line summaries were kept as they were ("with client details removed" on the homepage and in Sunday on `/how-it-works`, "with identities removed" on `/agents`); section 2.5 says why, and that they are three strings if Peter wants them changed.

**(c) App-side items the privacy and terms text depends on.** The record of which account a shared play came from was settled on November 26, 2026 (the last item but two below). None of the others was changed, and they are what genuinely remains.

- **The job that erases a departed user's runs runs only while the paid cycle is live.** The `retention` task in `src/lib/housekeeping/job.ts` is skipped while `v3.cycleLive` is off or Stripe is not set up. The privacy page states the 90 days without that condition. It holds once the cycle is live, which is also when there are first users whose access can end.
- **Nothing clears the cached settings when a v3 setting changes.** The page reads its amounts through a cache (`getAmounts` in `src/lib/site/amounts.ts`, five minutes) and the jobs read the settings directly, so for a few minutes after a change the page and the jobs can disagree about the retention period or a price.
- **Shortening the retention setting applies to people who already left.** The job compares each user's access end with the setting as it is now, so a shorter period erases, at the next pass, the runs of users who left under the longer one.
- **"The first miss each billing month is forgiven" is typed, and the number is a setting.** `v3.forgivenMissesPerMonth` is 1 today and can be set from 0 to 4 (`src/lib/v3-settings.ts`, read in `src/lib/billing/contribution.ts`). No amount name covers it, so the terms and the site copy turn false if it changes.
- **A `v3.freeRuns` of 0 garbles the copy.** The amount names would read "Your first no Monday lists are free" and "charged with your first list".
- **Resolved: the record of which account a shared play came from says "unknown author" once the account is deleted.** Peter's decision, November 26, 2026: "If a shared play comes from a deleted account, the record should be updated to say 'unknown author'." Before, `pool_play_contributors` kept a deleted account's id for good, and the admin log keeps that id beside the address, so the record could still be tied to a person. What was built:
  - **On deletion.** `deleteAccount` in `src/lib/admin/users.ts` deletes the account and changes its rows in one statement, so the relabel cannot be skipped and happens only if the delete does. The table's key is (`pool_play_id`, `contributor`), so a play can hold one "unknown author" row: where an earlier deleted account already left one, this account's row is deleted instead. Two deleted contributors of one play end as exactly one row.
  - **The backfill.** The hourly task `unknown_authors` (`relabelOrphanContributors` in `src/lib/cora/contributors.ts`) relabels any row whose contributor is a user id that matches no user, with the same one-row-a-play handling. It covers accounts deleted before this change and anything a delete missed. It runs whether or not the paid cycle is live, and running it twice changes nothing. Rows for seed contributors ("seed:…") are not accounts and are left alone.
  - **Cora.** Nothing was changed in how Cora reads the record. She matches a row to a user by the user's id as text, so "unknown author" is never anyone's own play: it neither keeps a play from a user nor sends one. "Run by N users" is counted from the plays themselves, and a deleted account's plays are deleted with it, so an unknown author is not counted at all.
  - **The privacy page** now ends that paragraph: "When your account is deleted, that record is changed to say “unknown author”."
  - **The admin log, for an account that was linked to a seed contributor.** Added in code review on November 26, 2026. The log's rows are kept when an account is deleted (`admin_actions.user_id` has no link to `users`, so nothing removes or empties them), and a `link_contributor` or `unlink_contributor` row named the hidden seed contributor, whose "seed:…" rows name its plays. The statement that deletes the account now also takes the contributor's id and label, and `movedTo` and `movedFrom`, out of that account's link rows, and takes the deleted id out of `movedTo` and `movedFrom` on other accounts' link rows. The rows themselves stay, so the log still shows that a link was made or removed, when and by whom.
  - **A guard on the backfill.** Added in the same review. The hourly task changes nothing while the `users` table has no rows at all: on a partly restored database, with the pool loaded before the accounts, every row would look like an orphan, and a relabel cannot be undone.
  - **Not changed:** the rows themselves are still never deleted while their play is in the pool, and `db/schema.sql` was not touched. A seed contributor's rows ("seed:…") stay when the account it was linked to is deleted; they point to the hidden seed record, which the deletion unlinks from the account, and after the change above nothing in the admin log ties that record to the deleted account. A play placed in the pool at the moment its account is being deleted can keep the account's id until the next hourly pass relabels it.
- **A run's row is never fully removed while the account exists.** After retention or a delete, the row stays with its week, route, AI agent and times. The privacy page now says so.
- **The run history shows the newest 60 runs.** "You can delete any run from your dashboard" is true of those; an older run has no button (`listRuns` in `src/lib/zack/settings.ts`).

**(d) Resolved: both documents are reviewed.** See 6.3. The topics they do not cover are listed in section 3, "Topics the documents do not cover", as a reference.

### 6.5 Five more decisions of November 26, 2026

Peter made these after the four above, the same day. Each is given in his words, then what was done.

**(1) "The 2.0 Zack source should not have circles-era section. Remove it from all copies."**

There are twelve copies of Zack 2.0, four AI agents in three sets: the 2.0 source documents (`artifacts/Zack/Zack The Collector (for <Agent>) v2.0.md`), the connected instructions a signed-up user's Zack fetches (`content/zack/<agent>.md`), and the public files (`public/zack/zack-the-collector-<agent>.md`). The public files lost their Circles-era lines in 6.1. The source and the connected instructions, which were the same file byte for byte, still had them. They were changed together and are still the same file byte for byte (`src/lib/zack/instructions.test.ts` and `src/lib/site/public-zack-files.test.ts` both hold that).

What changed, the same in all four source documents and all four connected instructions:

| Line | Before | Now |
|---|---|---|
| "Sensitive uses", the test | "… whether another circle member could guess who or what situation it is about." | "… whether another member could guess who or what situation it is about." (as the public files say) |
| "How the run is delivered", hand-run | "… before sending the run file on. Zack never sends it anywhere; the member emails or shares the run file themselves." | "… before sharing the run file. Zack never sends it anywhere; the member shares the run file themselves, for example by pasting it at meetroger.ai/zack." (as the public files say) |
| The section "How the shared collection is handled (for the collector)", seven lines: a named collector (Peter) receives the files by email; only the circle's members see them, under the circle's confidentiality agreement; plays only are shared on; kept 12 months, then deleted; removal by asking the collector, within 7 days; incoming plays are labelled and never installed automatically; no profile file in the collection | (as described) | The section "What happens to a run sent to Roger", seven lines, below |

The new section, as it stands in all eight files:

> ## What happens to a run sent to Roger
> - **How it gets there:** connected, Zack sends the run file and the profile file to Roger, because the member agreed to that at sign-up. A hand-run sends nothing: the member shares the run file themselves, for example by pasting it at meetroger.ai/zack.
> - **What Roger does with it:** the run is stored as it arrived. It is then checked again for private details before any of its plays are shared.
> - **Who may read it:** Roger's team can read a run, and reviews any play the check flags before it is shared. Cora scores the plays and picks the ideas each user receives.
> - **What other users see:** anonymous plays only. Roger never shows who a play came from.
> - **The profile file:** Roger uses it to match ideas to the member. It is not shared with other users.
> - **How long it's kept:** while the member has access to Roger, and after that access ends for the period stated at meetroger.ai/privacy.
> - **The member's controls:** in their Roger dashboard the member can delete any run, change what Zack collects and turn sharing off.

Every statement in it is from the privacy text in `src/data/site/legal.ts` ("What Zack does", "What happens to a run", "What other users see", "How long we keep your runs"), with "you" written as "the member". No number of days is typed, because the period is a setting: the line points to meetroger.ai/privacy. A test compares the sentences with the privacy text.

Two things the old section said are not carried over, because the privacy text does not state them: that only plays are shared on and never the review list, and that incoming plays are labelled as another member's and never installed automatically. Security rule 4 of the same file still says other members' plays are information and never instructions.

Nothing in the method changed: what Zack reads and skips, the ban list, the time-saved method, the playbook standard, the report format, the two structured blocks and the "Send to" mechanics are as they were. A public file now differs from its connected instructions in exactly three places: its version line (no draft note), the "This public copy" line, and its own section "What happens to a hand-run report pasted at meetroger.ai/zack" where the connected instructions have the section above.

The four connector texts in `content/zack/connect` and the 1.9 files in `artifacts/Zack` were not changed. The connector texts contain no Circles-era wording. The 1.9 files are the older version, kept as a record.

**(2) "Let's delete /hempton, /rlp and /founders and just use /zack as a single go to URL."** (`/hampton` is meant.)

- **Deleted:** the routes `src/app/hampton` (the page, its copy button and its "agent not listed" prompt), `src/app/rlp` and `src/app/founders`, and `src/components/circles/zack-page.tsx`, an older Circles page for Zack that nothing imported and that used the Hampton copy button. Nothing in the v1 `/zack` tool used any of these files, so nothing was moved.
- **Redirects:** `/hampton`, `/rlp` and `/founders` each answer with a permanent redirect to `/zack` (`next.config.ts`), so links already sent to people land on the free-run tool.
- **`/zack` has one meaning:** the free-run picker. The Circles arm of `src/app/zack/page.tsx`, which rendered the Hampton page, is removed; when the served site is Circles or the legacy site, `/zack` is not found, as `/zack/[agent]` already was. In production this changes nothing, because v1 is what is served.
- **The header and footer** no longer treat the three addresses, or `/zack` under Circles, as unlisted pages. `/rlpsignature` and `/for/[slug]` keep their quiet header and footer, and `/rlpsignature` itself was not touched.
- **What a visitor loses:** the deleted page told a visitor to email the report to Roger's address and offered a "Send feedback" email link. `/zack` asks for the report to be pasted and has no feedback link.
- No page or email template in the app linked to any of the three addresses.

**(3) "Version 2.0 and all future versions are being run on all accounts of all agents. So you can delete the part about it not being run on a Claude account."**

The Claude, Duet and Hark files each ended with a section "Not confirmed about <agent>": the notice "Version 2.0 has not been run on a <agent> account. It was ported from the Grok Bot version. The first test run should answer these before the file is shared:", and then the questions that first run was to answer (four in the Claude file, six in the Duet file, three in the Hark file). The whole section was removed from all nine files: the heading and the questions existed only for the notice. The Grok Bot files never had the section. Each file now ends with "Setting it up".

Two sentences inside those questions gave an instruction and went with them. "If it cannot, the member uploads the run file in their Roger dashboard" (for an AI agent that cannot run on a schedule) went with its question and was then put back, as "If Zack cannot send the files, the member uploads the run file in their Roger dashboard", in the "Connected" line under "How the run is delivered" in all twelve files. "What it cannot see is written "not visible to this run"" is still in the body of each file, under "What Zack reads".
The version line of the source and the connected instructions ended "· Draft for Peter's approval". Peter approved the files later on November 26, 2026, and the note was removed from all eight. The public files never carried it. No other wording about a version being untested was found in any of the twelve files.

**(4) "The scroll story should end at 78 bricks."**

The page already ended at week 26 with 78 bricks. The data file (`src/data/site/compounding.ts`) still held a fifth step, week 27 with 81 bricks, which the story left out by a filter. The step and the filter are removed, so the data is weeks 1, 2, 3 and 26 and the story is every step of it. The claims check took its allowed numbers from the same data, so 27 and 81 are no longer allowed inside the "It compounds" section. What is rendered is unchanged.

**(5) "Do not use the brokerage name."**

No name was added anywhere. The claims check keeps its rule and its deny-list (`brokerages` in `ClaimsContext`, `src/lib/site/claims.ts`), and the list stays empty by this decision: the comment there now says the name is not recorded in the repo and must not be added. Nothing is waiting on Peter for it. A search of the site copy (`src/data/site`, `src/components/site`, `public/zack`, `content/zack`) for a brokerage or realty company name found none. Outside the site copy, the unlisted page `/rlpsignature`, which Peter did not name and which was not changed, carries its group's name in its title and text.

## 7. Peter's homepage review, November 26, 2026

Peter read the homepage on the preview and asked for the changes below. Sections 1 to 6 are the record of what the copy was before; where they quote a line that this section changes, this section is what the site says now.

His decisions, in short:

- The site speaks to anyone who uses AI agents, not to people in real estate.
- The marketing pages show one way to pay, monthly. "One list at a time" is gone from them.
- What arrives each Monday is called a "Cora Curation" (both words capitalised). No marketing page says "Monday list".
- Every start button and link, the header's included, reads "Get two free Cora Curations".
- The hero's sub-line, the line under the price and the third point of "You decide what Zack shares" are his words.
- The hero's picture is the four parts of "How it works". The sample idea is folded. "It compounds" is a loop of seven weeks.

The line under the price was changed twice on the day. The first wording, which made a claim about the value received, was replaced the same day with "Get two Cora Curations for free and pay only after you have tried the product for two full weeks." Only the second wording was ever built into the tests and the claims check.

### 7.1 His own lines

| Where | Before | Now |
|---|---|---|
| Hero sub-line; also the homepage's search description, the root metadata description and the JSON-LD description | Roger makes your AI agents smarter every week, with ideas that worked for other real estate users. | Roger makes your AI agents smarter every week, with battle-tested ideas that have already worked for real people in the network. (Hyphenated on November 26, 2026: Peter, "hyphenated for battle-tested is good.") |
| Price block, under the heading (homepage, `/agents`, `/pricing`) | (no line) | Get two Cora Curations for free and pay only after you have tried the product for two full weeks. |
| Closing band, under its line (homepage, `/agents`) | (no line) | the same sentence |
| "You decide what Zack shares", third point, title | Turn sharing off any time in your dashboard. | Protect your privacy and your most valuable ideas at any time. |
| The same point, body | On monthly your ideas keep coming and the price becomes US$400 a month (CA$560 in Canada). | Turn sharing off any time in your dashboard. Your Cora Curations keep coming and the price becomes US$400 a month (CA$560 in Canada). |
| Every start button and link | Get two free Monday lists (and "Start free" in the header below 1280 pixels) | Get two free Cora Curations, at every width |

In the copy file both counts in the line under the price are `{freeLists}`, so they follow the setting: with three free Cora Curations it reads "Get three … for three full weeks".

Neither of his lines needs an exception in the claims check. "battle-tested" is not on the hype list, "real people" is not a count of users, and "two full weeks" is a word, not a digit. A test holds that no allow-list entry touches either line.

The header's button has one label now. On a phone it takes two lines in a smaller size so the row still fits beside "Sign in" and the menu.

### 7.2 Cora Curations, and monthly only

| Where | Before | Now |
|---|---|---|
| Card line under a start button | Card required. Charged only with your third list. | Card required. Charged only with your third Cora Curation. |
| Trial line (under the price, the closing band, the library band) | Your first two Monday lists are free. We ask for a card when you start. On monthly it is charged with your third list. On one at a time it is charged only when you order a list. Cancel before then and you pay nothing. | Your first two Cora Curations are free. We ask for a card when you start. It is charged with your third Cora Curation, and once a month after that. Cancel before then and you pay nothing. |
| Price block, the plans | Monthly ("Most people choose this", "A new list every Monday.") beside One list at a time ("One list, for one Monday.") | Monthly alone: "A new Cora Curation every Monday: three ideas picked for you by Cora, each with a full playbook." The "Most people choose this" mark is removed, because there is nothing to choose between. |
| Homepage closing line | See what your first two Mondays bring. | See what your first two Cora Curations bring. |
| Homepage, "How it works", step 3 body | Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best. | Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best. That is your Cora Curation. |
| FAQ, "I compete with other people on Roger…" | … If you switch sharing off completely in your dashboard, monthly still brings three ideas every Monday and costs US$400 a month (CA$560 in Canada). | … If you switch sharing off completely in your dashboard, your Cora Curation still arrives every Monday and the price becomes US$400 a month (CA$560 in Canada). |
| FAQ, "What does it cost?" | US$200 a month, or US$200 for one list at a time, plus tax where it applies. In Canada it is CA$280 a month or CA$280 a list, plus HST. Monthly brings a list every Monday for the price of one list. | US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus HST. Get two Cora Curations for free and pay only after you have tried the product for two full weeks. If you turn sharing off in your dashboard, the price becomes US$400 a month (CA$560 in Canada). |
| FAQ, "When is my card charged?" | On monthly, with your third Monday list and not before. On one at a time, only when you order a list. Your first two lists are free either way, and we email you after your second list with what happens next. | A card is required when you sign up, and it is not charged then. The first charge comes with your third Cora Curation, and the charge repeats once a month after that. Your first two Cora Curations are free, and we email you after the second one with what happens next. |
| FAQ, "What if Zack misses a week?" | On monthly, the first miss each month is forgiven. … | The first miss each month is forgiven. … |
| FAQ, "Can I get a refund?" | No. You get two free lists before any charge, and you can cancel any time. | No. You get two free Cora Curations before any charge, and you can cancel any time. |
| FAQ, "Can I buy one list at a time?" | Yes. One list costs US$200 (CA$280 in Canada), and you order it for any Monday you want. For the same price, monthly brings a new list every Monday. | Removed. |
| FAQ, new question, shown on the homepage, `/agents` and `/faq` | (none) | What is a Cora Curation? What arrives each Monday: three ideas picked for you by Cora, each with a full playbook. Cora is the AI agent that ranks every play in Roger. |
| `/pricing`, "What is included", first item; also the page's search description | Three ideas every Monday, each with a full playbook. | A Cora Curation every Monday: three ideas picked for you by Cora, each with a full playbook. |
| `/pricing`, third section | "Monthly or one at a time, explained": two columns, Monthly ("Three ideas every Monday. Charged once a month, starting with your third list.") and One at a time ("Order a list for any Monday you want one. You are charged only for the lists you order."), and under both "One list on its own costs the same as a whole month. Monthly brings a list every Monday for that price." | "Monthly, explained": "A Cora Curation every Monday. Your first two are free. Your card is charged once a month, starting with your third Cora Curation." and under it "One price, charged once a month. Cancel in one click." |
| `/pricing`, "How contributing works" | … On monthly, if Zack misses a week, … One-at-a-time lists need that week's Zack report. | … If Zack misses a week, … (the last sentence is removed) |
| `/pricing`, "No refunds" | There are no refunds. You get two free lists before any charge, and you can cancel in one click. | There are no refunds. You get two free Cora Curations before any charge, and you can cancel in one click. |
| `/how-it-works`, Monday; also the page's search description | … You receive your three ideas, each with a full playbook. | … They arrive as your Cora Curation, each with a full playbook. |
| `/how-it-works`, "Your first two weeks", steps 3 to 6 | Your first two Monday lists arrive. They are free. / After your second list, we email you with what happens next. / On monthly, your card is charged with your third list. On one at a time, it is charged only when you order a list. Cancel before then and you pay nothing. / If no first list is delivered within 21 days of sign-up, the trial closes without a charge. | Your first two Cora Curations arrive, one each Monday. They are free. / After your second Cora Curation, we email you with what happens next. / Your card is charged with your third Cora Curation, and once a month after that. Cancel before then and you pay nothing. / If no first Cora Curation is delivered within 21 days of sign-up, the trial closes without a charge. |

"What is a Cora Curation?" is new wording, not Peter's and not the spec's. Each page that names a Cora Curation says once what it is, in the same words ("three ideas picked for you by Cora, each with a full playbook"): the price block's note on the homepage, `/agents` and `/pricing`, the Monday paragraph on `/how-it-works`, and this question on `/faq`. Cora is called "the AI agent that ranks every play in Roger", which keeps the "AI agent" rule; the phrase "Roger's ranking agent" is used only on `/zack`, where the rule does not apply.

The homepage and `/agents` now show seven questions each, not six. The answer to "What does it cost?" names the higher rate, so the homepage states it twice: in the control block and in that answer, each time as what turning sharing off does.

The code that printed the one-list price on the marketing pages is removed: the second plan card, the `list` words of the price block, `perList`, `popular`, and `startShort`. `{listUsd}` and `{listCad}` are no longer named in `src/data/site/v1.ts`. The amounts themselves stay, because the terms still state them and the app uses them.

### 7.3 For anyone, not for people in real estate

| Where | Before | Now |
|---|---|---|
| Homepage, "The problem", first statement | Everyone in real estate is being told to use AI. Almost nobody is told what to use it for. | Everyone is being told to use AI. Almost nobody is told what to use it for. |
| Homepage, "How it works", step 2 body | … writes up what worked, with client details removed. | … writes up what worked, with private details removed. |
| `/how-it-works`, Sunday | … writes up what worked, with client details removed. He runs on his own, … | … writes up what worked, with private details removed. He runs on his own, … |
| FAQ, "I don't use AI agents yet. Can I start?" | Yes. The startup page walks you through installing one and setting up a starter team for real estate. Most people finish in about half an hour. | Yes. The startup page walks you through installing one and setting up a starter team. Most people finish in about half an hour. |
| `/how-it-works`, "If you have no AI agent yet" | You can still start. The startup page walks you through installing one and setting up a starter team for real estate. | You can still start. The startup page walks you through installing one and setting up a starter team. |

Kept as they are, on purpose:

- **The sample play.** "Client email in two tones" is one person's real, cleaned play, and it says "buyers", "sellers", "a listing" and "a home evaluation" because that person's work does. Nothing around it says the play is for people in real estate: the section's words are "What arrives on Monday" and "This is one idea, as it arrives." Its field `heavyUseFor` ("people in real estate and other client service roles with a busy inbox") is not printed on any public page, and was not changed: a change to the play needs Peter's approval (2.2).
- **Peter's letter.** One paragraph shown on the homepage and `/about` is about his own background: "I made my first real estate investment at 17 and still own it, 35+ years later. I also spent 18+ years in real estate finance, …". It is his history, not a description of who the site is for, and it is his to change. It is the only place a marketing page says "real estate", and a test holds that.
- **"clients"** where it means anyone's clients: "It involves their clients and their business", "names, clients, addresses, amounts", and the same on `/agents`.
- **The "AI agent" rule.** It stays. The reason given in the code now reads "some readers are called agents in their own work".
- **The start links' address.** `/start?path=re` is how sign-up knows which page a visitor came from. It is behaviour, not a word a visitor reads.

### 7.4 Labels that are new

| Where | Words |
|---|---|
| Hero picture, the row above it | Use, Collect, Curate, Deploy |
| Hero picture, its name for a screen reader, and its button | How Roger works, in four parts / Pause, Play |
| Sample idea, headings | The Idea / The Playbook (was "The playbook") |
| Sample idea, rows | Summary / What To Copy / "8 steps" (the count is the play's own) / "The full playbook" (only for a playbook with no numbered parts) |
| "It compounds", its name for a screen reader, and its button | The stack, week by week / Pause, Play |

The four labels are mapped onto the four steps of "How it works" in order: **Use** is "Set up your AI agents", **Collect** is "Zack reviews your week", **Curate** is "Cora picks your three ideas", **Deploy** is "Paste to install". The picture shows each step's headline only, read from the same copy as the section below.

The sample idea's heading "Paste to install" inside the card is gone: the row is "What To Copy". The bundled play's fields are placed like this: its description under Summary; its install prompt, the help line, the copy button and "Written on Claude" under What To Copy; the eight numbered parts of its playbook as the eight steps. The play has exactly eight parts, so the row reads "8 steps". Cora's scores, for a play that has them, are a third folded row under The Idea. Nothing in the play was added, removed or reworded.

"It compounds" shows weeks 1, 2, 3, 4, 10, 17 and 26, with 3, 6, 9, 12, 30, 51 and 78 ideas (the page said "bricks" until section 8.8). Weeks 4, 10 and 17 are new. A count is always its week times three, worked out in `src/data/site/compounding.ts`.

### 7.5 Where the new wording and the product differ today

**Items 1 to 5 are resolved by section 8** (Peter, November 26, 2026: "it's all monthly so no Monday lists, all Cora Curations. There is no option for one-at-a-time at launch. The terms should say Cora Curations."). They are kept below as the record of what was found. Items 6 to 9 are re-checked in section 8.9.

When this list was written, nothing under `src/app/start`, `src/app/signin`, `src/app/app`, `src/app/admin` or `src/components/app` had been changed. These were the places where a visitor who followed a start button read something the marketing pages no longer said.

1. **Sign-up still offers one list at a time.** `/start/plan` asks "Choose how to pay after your two free lists." and offers "One list at a time, US$200 each" beside monthly. `/start/card` has a line for "One at a time". The marketing pages now say monthly is the price and that the card "is charged with your third Cora Curation, and once a month after that", which is not true for a person who picks one at a time at sign-up: they are charged only when they order.
2. **The app and billing still offer the switch.** The billing panel has "Or switch to one list at a time.", and the weekly view has the order button for it.
3. **Sign-up, the app and the emails say "list", never "Cora Curation".** `/start` ("We're getting the first Monday lists ready."), `/start/plan` ("Your first two Monday lists are free either way."), `/start/done` ("Your first Monday list arrives once you're set up."), the app's status lines ("Free list 1 of 2."), the billing lines ("starting with your third list"), the settings ("The Monday list email") and the emails the send job writes ("Your list, and your receipt").
4. **`/getstarted`**, the app's setup page, is linked from `/how-it-works` and listed in the sitemap. Its search description still ends "get your first Monday list." It was left as the app's page.
5. **The terms still describe both ways to pay**, because that is what billing does: "Your first two Monday lists are free.", "One list at a time costs US$200 a list (CA$280 in Canada). …", "One-at-a-time lists need that week's Zack report." The privacy and terms texts were reviewed and approved as legal documents (6.3) and were not reworded here. They need Peter's decision: either the option is withdrawn from sign-up and the terms follow, or the terms stay as they are.
6. **"pay only after you have tried the product for two full weeks."** What the product does: a card is required at sign-up and is not charged; the first charge is made automatically with the third Cora Curation, on the Monday it is ready. The first one arrives on a Monday on or after sign-up and each later one a week after the last, so the third comes 14 days after the first at the soonest, and never less than 14 days after sign-up. A person who signs up on a Sunday and gets their first one the next morning is charged 15 days after sign-up; a person whose first one arrives the day they sign up is charged on day 14 exactly. So the sentence holds, counted from sign-up or from the first Cora Curation, with two things a reader might not expect: the charge comes on the morning the third one arrives, at the two-week mark and not some days after it; and it is automatic unless the person cancels first, not a choice made after the two weeks. A week with no Cora Curation (Zack missed, or nothing new for that person) pushes the charge later, never earlier.
7. **"Protect your privacy and your most valuable ideas at any time."** Turning sharing off is all or nothing in the dashboard, with the higher price. Keeping back single ideas is done through Zack's rules (skip subjects, block words), which the first two points of the same block describe. The line does not say which, so it is not false, but there is no switch named "protect this idea".
8. **"real people in the network."** The product has no feature called a network. The line is read as "other Roger users", which is what the plays come from.
9. **"What is a Cora Curation?"** says each has three ideas. A week can deliver two when fewer fit (the billing code counts two as a delivered week). The spec's own copy says "three ideas" throughout, so this is not new, but the new name makes the count part of a definition.

## 8. Monthly only and Cora Curations in sign-up, the app, emails and terms, November 26, 2026

Peter's direction, word for word: "it's all monthly so no Monday lists, all Cora Curations. There is no option for one-at-a-time at launch. The terms should say Cora Curations. hyphenated for battle-tested is good."

This is the first change on this branch to sign-up, the signed-in app, the emails and the terms. It changes words and what is offered. It does not change how much or when anyone is charged, any Stripe call, the database, a cron schedule or a setting's default.

What was done, in short:

- "battle tested" is "battle-tested" (hero sub-line, root metadata, JSON-LD, the social card's line).
- Everywhere a person reads it, the weekly delivery is a "Cora Curation", both words capitalised. "Monday" stays as the day it arrives, and "ideas" stays "ideas".
- One at a time is not offered. One switch, `plans.oneAtATimeOffered` in `src/data/config.ts` (read through `src/lib/billing/offered.ts`), is off. Its order and charge code stays, tested with the switch on.
- The terms describe monthly only.

### 8.1 Sign-up

| Where | Before | Now |
|---|---|---|
| `/start`, sign-up not open | We’re getting the first Monday lists ready. | We’re getting the first Cora Curations ready. |
| `/start/account`, under the heading | … then you choose your plan. | … then you confirm your plan. |
| `/start/account`, "Check your email." | … to confirm your address and choose your plan. | … to confirm your address and confirm your plan. |
| `/start/plan`, heading | Choose how to pay after your two free lists. | Your plan after your two free Cora Curations. |
| `/start/plan`, under the heading | Your first two Monday lists are free either way. Prices are before tax. | Your first two Cora Curations are free. The price is before tax. |
| `/start/plan`, the plan | Two radio buttons: "Most people choose this / Monthly, US$200 a month / Three ideas every Monday. Charged once a month, starting with your third list." and "One list at a time, US$200 each / Order a list for any Monday you want one, after your two free lists. Monthly costs the same and brings a list every Monday." | One panel, nothing to choose: "Monthly, US$200 a month / A Cora Curation every Monday. Charged once a month, starting with your third Cora Curation." |
| `/start/plan`, under the plan | On monthly: if Zack misses two weeks in a month, that month is US$400. We always tell you first. | If Zack misses two weeks in a month, that month is US$400. We always tell you first. |
| `/start/plan`, a plan posted that is not offered | (accepted) | That plan isn’t offered. Roger is monthly. |
| `/start/card`, the bold line | You get two free Cora curations. Your card is charged only on the third. | You get two free Cora Curations. Your card is charged only with the third. |
| `/start/card`, the line for one at a time | One at a time: after your two free lists, you are charged US$200, plus tax where it applies, only when you order a list. | Not reachable while the switch is off. (With it on: "One at a time: after your two free Cora Curations, you are charged …, only when you order one.") |
| `/start/done`, "You’re in." | Your checklist is waiting. Your first Monday list arrives once you’re set up. | Your checklist is waiting. Your first Cora Curation arrives on a Monday, once you’re set up. |
| `/start/done`, "One step is missing." | Choose your plan and tick the box to agree before adding your card. / button "Choose your plan" | Confirm your plan and tick the box to agree before adding your card. / button "Confirm your plan" |
| `/getstarted`, search description | … Then connect Zack and get your first Monday list. | … Then connect Zack and get your first Cora Curation. |

The plan step is kept and not skipped. The consent box is on that step, the card step sends anyone without the consent back to it, and admin-made sign-in links and the confirmation email open at it. With one plan it confirms the plan and takes the consent. The page sends no plan and the server stores monthly; a posted "per_run" is refused.

### 8.2 The signed-in app

| Where | Before | Now |
|---|---|---|
| `/app`, heading before the first one | Your first list is on its way | Your first Cora Curation is on its way |
| `/app`, under a second-miss banner | … Check Zack or switch to one list at a time. | … Check Zack. |
| Checklist, "Wait for Monday" | Your first list arrives on a Monday morning, once Zack has sent a report. | Your first Cora Curation arrives on a Monday morning, once Zack has sent a report. |
| `/app/history`, empty | No ideas yet. Your first list arrives on a Monday morning. | No ideas yet. Your first Cora Curation arrives on a Monday morning. |
| Status line, trial | Your first 2 lists are free. / Free list 1 of 2. / Free list 2 of 2. Your next list is your first paid one: … | Your first 2 Cora Curations are free. / Free Cora Curation 1 of 2. / Free Cora Curation 2 of 2. Your next Cora Curation is your first paid one: … |
| Status line, payment | … so your lists are paused. … / … so your list is waiting. … / Your payment didn’t go through; lists pause on … | … so your Cora Curations are paused. … / … so your Cora Curation is waiting. … / Your payment didn’t go through; Cora Curations pause on … |
| Status line, cancelled | Your plan is cancelled. Your lists continue until … | Your plan is cancelled. Your Cora Curations continue until … |
| Status line, sponsored | Your lists are covered by your sponsor. | Your Cora Curations are covered by your sponsor. |
| Status line, amount changed | … so your list waits a day … / … and your list comes straight after; … | … so your Cora Curation waits a day … / … and your Cora Curation comes straight after; … |
| `/app/billing`, plan line | Monthly: US$200 a month, plus tax where it applies, for a list every Monday. | Monthly: US$200 a month, plus tax where it applies, for a Cora Curation every Monday. |
| `/app/billing`, next charge in the trial | Nothing until your free lists are done. Then US$200 a month, …, starting with your third list. / Your first charge, with your third list: … / Your first charge comes with your next list: … | Nothing until your free Cora Curations are done. Then US$200 a month, …, starting with your third Cora Curation. / Your first charge, with your third Cora Curation: … / Your first charge comes with your next Cora Curation: … |
| `/app/billing`, cancelled | Nothing more will be charged. Your lists continue until … | Nothing more will be charged. Your Cora Curations continue until … |
| `/app/billing`, "Switch plan" for a monthly member | A section with "Switch to one list at a time" and its effect | No section |
| `/app/billing`, under Cancel | Or switch to one list at a time. | (removed) |
| `/app/billing`, cancel confirmation | Cancelled. Your lists continue until … | Cancelled. Your Cora Curations continue until … |
| `/app/settings`, Emails | The Monday list email | The Monday email with your Cora Curation |
| `/app/zack`, sharing choice "Zack off" | Zack sends nothing. Your lists are picked from what Roger already knows about you. | Zack sends nothing. Your Cora Curations are picked from what Roger already knows about you. |
| `/app/zack`, each report in the history | List for Monday, December 14 | Cora Curation for Monday, December 14 |
| `/app/zack`, after an upload | Report received for your list on … | Report received for your Cora Curation on … |

For an account that is already on one at a time, see 8.5.

### 8.3 Emails

Every template in `src/lib/mail/templates` was read. Subjects that changed:

| Before | Now |
|---|---|
| Your list, and your receipt | Your Cora Curation, and your receipt |
| No list this week | No Cora Curation this week |
| Your next list is your first paid one | Your next Cora Curation is your first paid one |
| Your Monday lists are paused | Your Cora Curations are paused |
| Connect Zack to get your Monday list | Connect Zack to get your Cora Curation |

Lines in the body that changed (monthly members and people signing up):

| Email | Before | Now |
|---|---|---|
| Confirm your email (sign-up) | One click, then choose your plan. / … carry on to choosing your plan. | One click, then confirm your plan. / … carry on to your plan. |
| Welcome | Your first two Monday lists are free. Your card is charged only with the third. | Your first two Cora Curations are free, one each Monday. Your card is charged only with the third. |
| No Cora Curation this week | Zack hasn’t sent a report yet, so there is no list this week and no free list was used. | Zack hasn’t sent a report yet, so there is no Cora Curation this week and no free one was used. |
| No new ideas for you this week | This list is missing because of Roger … / … this week doesn’t use one of your free lists. | This Cora Curation is missing because of Roger … / … this week doesn’t use one of your free Cora Curations. |
| Your next Cora Curation is your first paid one | Your free lists are done. Your next list follows Zack’s next report, … | Your free Cora Curations are done. Your next one follows Zack’s next report, … |
| Your first charge could be on Monday | … your third list comes on … | … your third Cora Curation comes on … |
| The two emails above, their button | Cancel or change plan | Cancel or see billing |
| You’re subscribed | Your third list is ready now, and a new one arrives every Monday. / button "Open this week’s list" | Your third Cora Curation is ready now, and a new one arrives every Monday. / button "Open this week’s Cora Curation" |
| Your card didn’t go through | Your list is ready and waiting. … | Your Cora Curation is ready and waiting. … |
| Your first charge moved | … and your list is built from it, so there was no list and nothing was charged. / … with your third list. | … and your Cora Curation is built from it, so there wasn’t one and nothing was charged. / … with your third Cora Curation. |
| Your first charge amount changed | We’ll charge it tomorrow and send your list then. | We’ll charge it tomorrow and send your Cora Curation then. |
| Your monthly payment didn’t go through | … keep your lists coming. / Your lists keep coming for now … / … your Monday lists pause until it is paid. | … keep your Cora Curations coming. / Your Cora Curations keep coming for now … / … your Cora Curations pause until it is paid. |
| Your Cora Curations are paused / Your payment went through | … so your lists are paused. / … your lists start again … / … any list that was waiting is on its way. | … so your Cora Curations are paused. / … your Cora Curations start again … / … any Cora Curation that was waiting is on its way. |
| Your Roger plan is cancelled | Your lists continue until … | Your Cora Curations continue until … |
| Second missed week | If a weekly report doesn’t suit you, you can switch to one list at a time on the billing page (…). If you cancel before that invoice, the difference isn’t collected. | If you cancel before that invoice on the billing page (…), the difference isn’t collected. |
| Zack hasn’t sent a report yet / trial closed | Your free lists start with … / If no list has gone out by … / Your free lists went out, … so your first paid list never came … / … so no list went out … | Your free Cora Curations start with … / If no Cora Curation has gone out by … / Your free Cora Curations went out, … so your first paid one never came … / … so no Cora Curation went out … |
| Zack’s first report arrived / report deleted / upload reminder / the admin's "report hasn’t arrived" nudge | … your list on … / … for Monday’s list. | … your Cora Curation on … / … for Monday’s Cora Curation. |
| Finish setting up (admin nudge) | … your first lists start on the next Monday. | … your first Cora Curations start on the next Monday. |
| Your email address changed (by support) | Sign-in links, lists and receipts come here from now on. | Sign-in links, Cora Curations and receipts come here from now on. |

A test (`src/lib/mail/templates/monthly-only.test.ts`) renders every template and holds that none says "list", and that none a monthly member can get names one at a time, an order or a change of plan.

### 8.4 Terms

Only the three sections about the plan changed. Every other sentence of the terms, and all of the privacy text, is as Peter approved it.

| Section | Before | Now |
|---|---|---|
| The free trial | Your first two Monday lists are free. Only a list that is delivered to you counts as one of them. | Your first two Cora Curations are free. A Cora Curation is the set of ideas Roger sends you on a Monday. Only a Cora Curation that is delivered to you counts as one of them. |
| The free trial | On monthly, your card is charged with your third list. On one list at a time, it is charged only when you order a list. Cancel before then and you pay nothing. | Your card is charged with your third Cora Curation, and once a month after that. Cancel before then and you pay nothing. |
| The free trial | If no first list is delivered within 21 days of sign-up, the trial closes without a charge. | If no first Cora Curation is delivered within 21 days of sign-up, the trial closes without a charge. |
| The price | Monthly costs US$200 a month (CA$280 in Canada). It is charged once a month and brings a list every Monday. A week has no list when Roger has no new ideas for you or the week fails on our side, and lists are held while a payment is unpaid. | Roger has one plan, monthly. It costs US$200 a month (CA$280 in Canada). It is charged once a month and brings a Cora Curation every Monday. A week has no Cora Curation when Roger has no new ideas for you or the week fails on our side, and Cora Curations are held while a payment is unpaid. |
| The price | One list at a time costs US$200 a list (CA$280 in Canada). You order a list for any Monday you want one, and you are charged only for the lists you order. | (removed) |
| Contributing, and the higher monthly rate | On monthly, if Zack misses a week, the first miss each billing month is forgiven. … | If Zack misses a week, the first miss each billing month is forgiven. … |
| Contributing, and the higher monthly rate | One-at-a-time lists need that week’s Zack report. With Zack off, a list cannot be ordered. | (removed) |

Unchanged in the terms and still true: "We ask for a card when you sign up, and it is kept on file. It is not charged then."; the second-miss rate and the rate with sharing set to matching only or Zack off, US$400 a month (CA$560 in Canada), each in both currencies; "Those are the only two cases where the higher rate applies. It is not a plan you can choose."

One sentence is new and is Peter's to confirm: "A Cora Curation is the set of ideas Roger sends you on a Monday." The terms did not need to define a "list"; they do need to say what a Cora Curation is. It gives no count, because a week can bring fewer than three (8.9).

The terms now print six amounts, not eight, and the claims check no longer allows the price of one at a time on any page.

### 8.5 One at a time: what the switch does

The plan was built end to end: a choice at `/start/plan`, stored in `users.plan` as `per_run`; a welcome line and a card-step line for it; an order box on `/app` and `/app/billing`; an order and its Monday charge on its own invoice (`src/lib/billing/orders.ts`); a Friday "want one this Monday?" email; a switch each way on `/app/billing` (`src/lib/billing/switch.ts`); two settings and two Stripe prices for it. None of that was deleted.

While `plans.oneAtATimeOffered` is false:

- Sign-up stores monthly. A posted `per_run` is refused. A sign-up left half done on `per_run` is sent back to the plan step. One that was already on Stripe's card page finishes there with no trial started (`completeCardSetup` answers `plan_not_offered`, from the browser's return and from the webhook): nothing is written or charged, and `/start/done` sends the person to confirm monthly and add the card again. The plan is not changed to monthly for them, because they agreed to "charged only when you order".
- A monthly member is offered no switch and is shown no mention of one at a time or its price, on any page or in any email. A switch posted anyway is refused before Stripe is called.
- No new order can be placed, by anyone. The order box is not shown. The Friday order email is not sent.
- The marketing pages and the terms describe monthly only whatever the switch says. Turning it on would need the option written back into them.

**An account already on one at a time (a decision for Peter to confirm).** Nobody is migrated and nobody is charged differently. Such an account stays on its plan. It still gets any free Cora Curations it has left. It cannot place a new order, so nothing is charged, and its pages say so: "Ordering one Cora Curation at a time isn’t offered at the moment. Monthly brings a Cora Curation every Monday. You can switch to monthly on the billing page; nothing is charged unless you do." Its billing page shows its plan with no price for one, and one button, "Switch to monthly". An order it placed before the switch went off is honoured: it can still be cancelled until Sunday night, and otherwise is charged once and delivered that Monday, as agreed. The other choice would have been to let such an account keep ordering; it was not taken because it leaves the option and its price on show. No such account is expected at launch: sign-up has not been open.

Not gated, on purpose: a switch to one at a time that a monthly member made or booked while it was offered still runs to its end (Stripe has already been told to stop renewing, and reversing that silently would change what they are charged). They can still press "stay on monthly".

Texts for an account on one at a time, which only show with the switch on or to an account already on the plan, were reworded too: "One Cora Curation at a time", "Your Cora Curation is ordered", "No Cora Curation this week, and no charge", "Want a Cora Curation this Monday?", "Order this Cora Curation", "Your free Cora Curations are done", "You’re back on one Cora Curation at a time".

### 8.6 Admin

Admin screens were left in their own words where the term is plainly internal. One label changed: on Interest, "paying one at a time" reads "paying one at a time (not offered at launch)" while the switch is off. No admin screen shows the two settings or the Stripe prices for one at a time; they stay in the settings table and the environment.

Left as they are, for Peter to know: "Trial (1 of 2 free lists used)", "Free lists used", "Give one extra free list" and its messages, "2 free lists left", "One at a time", "Switching to one at a time", "The week is the Monday of the list", "It counts for the coming Monday’s list", and the admin alert "No price id for one list".

### 8.7 Left unchanged, and why

- **Names in the code and the database.** `per_run`, `free_lists_used`, `listOrderedEmail`, `who-gets-a-list.ts`, the `{freeLists}` and `{bricks}` names in the copy, the setting keys `v3.priceRunUsd` and `v3.priceRunCad`, the Stripe price variables, notification kinds such as `monday_list`, URL paths, and log lines.
- **One Stripe line.** An order's invoice line is described to Stripe as "Roger list for the week of …". It is a Stripe call, so it was not touched; it appears only on an order's invoice, and no order can be placed while the switch is off.
- **Zack's and Cora's instruction files** under `content/` and `public/zack/` do not say "Monday list". `/app/zack` prints Zack's instructions, which use "list" for their own lists (a review list, a ban list); those are not the delivery.
- **Design documents under `artifacts/`** still say "Monday lists" and describe one at a time: `Roger v3 - design spec.md`, `v3-marketing-website-spec.md`, `marketing-site-design-guide-roger.md`, and one archived Circles spec. They are the record of the brief, not text a user reads.
- **Other uses of the word.** "Your never-include list", "Choose a time zone from the list.", "You’re on the list." (the library's watch), and the Circles and legacy pages, which v1 does not serve.
- **`/getstarted`** still has the button "Start free" and the line "use your agent setup every day". Neither is about the weekly delivery; both are for Peter (acceptance, open defect 1).

### 8.8 Six more changes to the homepage, November 26, 2026

Peter's words, and what was done.

1. "only one + at a time should be open on the home page. Opening up one closes the other". The rows that fold share a native `name`, so the browser closes the others with no script: the questions are one group; the sample idea's rows (Summary, What To Copy, Cora’s scores, the steps row) are another; the steps inside the playbook are a third, so opening a step never closes the row it is in. The same components are on `/agents` (questions and sample idea) and `/faq`, where all eighteen questions share one name, so one answer is open on the whole page. `/pricing` has no folding rows. Browsers older than Chrome 120, Safari 17.2 and Firefox 130 ignore the attribute; a few lines of script do the same for them and stand aside everywhere else.
2. "it compounds should cycle through the weeks consistently, not end the first time it gets to 26 weeks." The loop's clock never ended: on the deployed preview, with no pointer near it, it went round for as long as it was watched. What stopped it was the rule that a mouse resting on the block pauses it. A reader watches it with the pointer over it, so it stopped under them, with the button still reading "Pause". That rule is removed from both loops (the hero's four parts had it too). A loop now stops for its Pause button, for keyboard focus inside it, and for a hidden tab. Week 26 stays up 2.4 seconds and every other week 1.7 (it was 3.4).
3. "it compounds should use the word ideas throughout. Bricks make no sense the way it is set up." The caption and the seven lines read "Week 2 / 6 ideas" to "Week 26 / 78 ideas". The squares stay. Each square's label for a screen reader already said "Week 2, idea 1: set up". No visible or spoken text on any marketing page says "brick".
4. "under you decide what Zack shares, you did not implement the changes I wanted for the 3rd subhead. Turn sharing off any time in your dashboard. is the hero. The hero is the subhead."

   | | Before | Now |
   |---|---|---|
   | Third point, heading | Protect your privacy and your most valuable ideas at any time. | Turn sharing off any time in your dashboard. |
   | Third point, text | Turn sharing off any time in your dashboard. Your Cora Curations keep coming and the price becomes US$400 a month (CA$560 in Canada). | Protect your privacy and your most valuable ideas at any time. |

5. "in the questions, delete "If you turn sharing off in your dashboard, the price becomes US$400 a month (CA$560 in Canada).""

   | | Before | Now |
   |---|---|---|
   | What does it cost? (homepage, `/faq`) | US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus HST. Get two Cora Curations for free and pay only after you have tried the product for two full weeks. If you turn sharing off in your dashboard, the price becomes US$400 a month (CA$560 in Canada). | US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus HST. Get two Cora Curations for free and pay only after you have tried the product for two full weeks. |

6. "for when is my card charged, delete "A card is required when you sign up, and it is not charged then.""

   | | Before | Now |
   |---|---|---|
   | When is my card charged? (homepage, `/agents`, `/faq`) | A card is required when you sign up, and it is not charged then. The first charge comes with your third Cora Curation, and the charge repeats once a month after that. Your first two Cora Curations are free, and we email you after the second one with what happens next. | The first charge comes with your third Cora Curation, and the charge repeats once a month after that. Your first two Cora Curations are free, and we email you after the second one with what happens next. |

**Where the higher rate is still stated, after 4 and 5.** It is no longer on the homepage at all. It is on `/pricing` ("Contributing": a second miss, and sharing set to matching only or Zack off); on `/faq` in two answers, "I compete with other people on Roger. What if I don’t want to share?" (also shown on `/agents`) and "What if Zack misses a week?"; and in the terms. On sign-up it is on the plan step, for two missed weeks. A visitor who reads only the homepage and signs up first meets it there.

**After 6, what still says a card is asked for.** The line under every start button, "Card required. Charged only with your third Cora Curation."; the trial line under the price; "Why do you need a card for a free trial?" on `/faq`; and the terms.

### 8.9 The three checks, against the charge code

1. **"Charged only with your third Cora Curation, and once a month after that."** The first charge is made by the Monday charge job (`src/lib/billing/charge-job.ts`) at 6:00 AM Toronto, for a monthly member in the trial who has had both free ones and has picks that week. It starts a Stripe subscription, and Stripe renews it on the same day of each month (`billing_cycle_anchor`), so a renewal is by calendar month and does not usually fall on a Monday. Where the sentence would not hold as written: a card that is declined is charged later, when a new card is given or a retry works, and the Cora Curation waits for it; a first charge whose amount changed after the reminder is charged a day later, on the Tuesday; a month at the higher rate has the difference on that month's one invoice, so it is still one charge, but larger; a failed renewal is tried again by Stripe over the following days; and an account already on one at a time is charged per order.
2. **"pay only after you have tried the product for two full weeks."** The first charge can never come sooner than 14 days after sign-up. A report counts for the coming Monday up to Sunday 11:59 PM; from a Monday, that is the Monday after (`weekOf` in `src/lib/clock.ts`). Each Cora Curation is one Monday, the charge comes with the third, so it is at least two Mondays after the first. The soonest case is a person who signs up late on a Sunday and whose Zack reports before midnight: first one the next morning, charge 14 days and about 6 hours after sign-up. A person who signs up on a Monday is charged no sooner than 21 days later. The card step states the date ("no earlier than Monday, December 14" for a sign-up in the week of November 26). Counted from the moment the first one arrives, it is one hour short of two full weeks, because the send is at 7:00 AM and the charge at 6:00 AM two Mondays later. And the charge is automatic unless the person cancels first.
3. **"three ideas."** A week delivers two or one when fewer fit (`pickThree` in `src/lib/cora/pick.ts`, outcome "short"). A short week counts as a delivered Cora Curation: it uses a free one, and it is charged as the third. The app and the Monday email say so that week ("This week there are 2 ideas that fit you, not three. We only send ideas that fit."). The marketing pages and "What is a Cora Curation?" say three with no qualifier. "Up to three ideas" would be exact; it is Peter's line to change. The terms' new definition gives no count.

## 9. Peter's third homepage review, November 27, 2026

Peter reviewed the preview and asked for ten changes to the homepage, then two more the same day: use the cold-emails play for the second example, and "delete /agents and /pricing. The nav bar on pricing should go to the right section on the home page." This section lists every string that changed, the text of the two example plays with every change made to their sources, and what is no longer anywhere on the marketing pages.

**For Peter to approve or decide, in one list:**

1. The cleaned text of the two example plays (9.3). It is on the branch preview and has not been approved.
2. The third example is missing: the repo has no playbook for the daily paper (9.4).
3. The plays say "the member". The site says "user" everywhere else. Left as the plays wrote it (9.3).
4. Three places where the new wording says something the product does differently (9.8).
5. What a visitor can no longer find now that `/pricing` and `/agents` are gone (9.6).

### 9.1 Strings changed on the homepage

| Where | Before | Now |
|---|---|---|
| Hero, under the button | Card required. Charged only with your third Cora Curation. | Removed from the homepage hero. The same line is still under the start button that ends `/faq`, `/how-it-works` and `/about` |
| Hero, second link | See how it works (to `#how`) | Removed |
| Hero, right side | Four labels and one headline at a time, over four squares in four colours | "How it works" whole: for each step its label (Use, Collect, Curate, Deploy), its number, its headline, its text and its ideas, 3, 6, 9 and 12 of them, drawn as the deleted section drew them |
| Step 4, headline | Paste to install | Approve The Ideas |
| Step 4, text | Open one, press copy, paste it into your AI agent. It sets itself up and asks you what it needs to know. | Say yes to the ideas you like and see them in action for you. |
| Section heading "How it works" | How it works | Removed with the section. Steps 1 to 3 keep their words, now in the hero |
| Examples, heading | What arrives on Monday | Cora Curation Examples |
| Examples, line under the heading | This is one idea, as it arrives. | Removed |
| Examples, short titles (new) | | On-demand video creation; 20 new prospects every day |
| Examples, the row of short titles, read out by a screen reader (new) | | Examples |
| Under "What To Copy", below the copy button | Written on Claude. Words like “skill” or “routine” may have another name on your AI agent. | Removed. Nothing is printed under the button |
| "Who runs this" | The heading, "Roger is run by Peter Kuperman.", three paragraphs of the letter, "Read Peter’s letter" (to `/about`) and the place for the photograph | Removed from the homepage. `/about` keeps the letter. No homepage section links to `/about` now; the header and the footer do |
| Note under the price | Your first two Cora Curations are free. We ask for a card when you start. It is charged with your third Cora Curation, and once a month after that. Cancel before then and you pay nothing. | Your first two Cora Curations are free. Payment starts in week 3. |
| Closing section, line under the heading | Get two Cora Curations for free and pay only after you have tried the product for two full weeks. | Removed |
| Closing section, text under the button | (the note under the price) | Removed |
| Closing section, button | Get two free Cora Curations | Level up your use of AI Agents Now. |

Notes on these.

- **"You decide what Zack shares", third column.** Already as Peter wrote it: the heading "Turn sharing off any time in your dashboard." and under it "Protect your privacy and your most valuable ideas at any time." Checked in a browser at four widths; nothing changed.
- **The note under the price is shared.** The same line is under the button of `/library`'s closing band, so it changed there too. "3" is not typed: it is the number of free Cora Curations in the settings plus one (`{firstPaidWeek}`), so three free ones would read "week 4".
- **The closing button is the one exception** to "every start button reads the same". The header's, the hero's and the price block's still read "Get two free Cora Curations". "AI Agents" with a capital A passes the vocabulary rule ("agent" never without "AI" in front).
- **The same line under the price is still the Price section's own subhead** ("Get two Cora Curations for free and pay only after you have tried the product for two full weeks."), and still ends the answer to "What does it cost?". Peter asked for it to go from the closing section only.

### 9.2 The two loops

- **"It compounds".** It now moves only while its stage (the week, the count and the stack) is on screen: at least half of it in the window. The first time it comes into view it starts from week 1. Scrolled away, it waits at the state it had reached and goes on from there. Every state stays up 2.2 seconds, week 26 included (it was 1.7, and 2.4 for week 26). At the wrap from week 26 to week 1 the wall fades where it stands; no idea is seen to jump. Only opacity and transform change.
- **Why Peter saw it not moving.** The fault could not be reproduced as a stopped clock. On the deployed preview, driven with a real mouse, wheel, keyboard and touch, the loop went round in every case tried: the mouse resting on it after scrolling to it, after a click on it, after tabbing through the page, after leaving by a link and coming back, and on a phone after a tap. The one thing that held it was keyboard focus on its own Pause button, which is meant to. What a reader met was this: the loop ran whether or not anyone was looking, so a reader arrived at whatever state it happened to be in. For more than half of each round (weeks 1 to 4, 6.8 of 12.6 seconds) the wall is nearly empty and changes by three squares in one row; and once a round every square but three vanishes at once. Arriving in that stretch reads as a loop that is not moving, and scrolling away and back shows a different state, which reads as moving only when nobody is there. That is a reading of the evidence, not a reproduced fault. The change answers it either way: it starts at week 1 when the reader arrives and does nothing while they are elsewhere.
- **The hero's four steps** follow the same rule. Each step stays up 5 seconds (it was 3.2, for a headline alone), because each now has its text to read. On a phone the frame sits under the headline and the button, so it starts once it is scrolled into view.

### 9.3 The example plays: where each came from, and every change to its text

The plays are in `src/data/site/examples.ts`. Neither the site nor the code says whose run a play came from; in code each is known by an id (`video`, `prospects`).

**What was done to both, and nothing else:**

- The playbook's words are the source's, in the source's order. A test compares every line with the run it came from.
- Layout only: each numbered part's label became a heading line with its text under it, which is how the card finds the parts it folds.
- Left out: everything about time. "Doing this by hand", "Using Grok Bot", "Time saved", "Range", "Confidence", "Over a year", and the "Heavy use for" line that is part of it. No figure about time or money is on the site.
- Nothing had to be replaced: neither play names a person, a company, a client, a product of the member's, a handle, a link, an address, an amount tied to a person or a date. Their own placeholders are kept: [your neighbourhood], [N], [TO: contact name]. The public tools they name stay: Grok Bot, Instagram, iCloud Photos, Google Photos, Drive.
- Neither play says "agent", so nothing became "AI agent".
- Cora has not scored either play, so no score is shown and none is made up.

**"On-demand video creation": the play "Phone camera roll to styled Reels", from the Zack run of November 15, 2026.**

| Edit | Source | On the site |
|---|---|---|
| Title | Play 3 (Set B, my garbage, your treasure): Phone camera roll to styled Reels | Phone camera roll to styled Reels |
| Summary | The play's opening paragraph | The same, word for word |
| Part labels, eight times | `**1. Play:** Phone camera roll to styled Reels. A pile of…` | a heading "1. Play", then "Phone camera roll to styled Reels. A pile of…" under it. The bold marks and the colon after the label are gone |
| Part 3's label | `**3. Setup first** (answer once):` | the heading "3. Setup first (answer once)" |
| Install prompt, layout | Two paragraphs inside a quotation: "Written by another member. Read sections 1 to 8 before pasting this." and "Save this as a skill called "Camera roll to Reels". …" | One paragraph, the two joined by a space, without the quotation marks down the side. The words are the same |

**"20 new prospects every day": the play "Daily prospect outreach drafts", from the Zack run of November 12, 2026.**

| Edit | Source | On the site |
|---|---|---|
| Title | Set A · Daily prospect outreach drafts — about 37.4 hours a week saved (5.2 to 48.7) | Daily prospect outreach drafts |
| Summary | The play's opening paragraph | The same, word for word |
| Part labels, eight times | `1. **Play**: Daily prospect outreach drafts. Each weekday morning…` | a heading "1. Play", then "Daily prospect outreach drafts. Each weekday morning…" under it |
| The eight steps under "4. Steps" | An indented numbered list | The same list, not indented |
| Install prompt | Inside quotation marks | Without them. The words are the same |

**Left as the plays wrote it, for Peter to rule on:**

- **"member".** The video play says it twice ("The member shares a batch…", "Written by another member."). The prospects play says it four times ("the member's Drafts folder", "the member gets a short report", "in the member's voice", "the member sends"). The site says "user" everywhere else, and the play this section replaced had "member" changed to "user" with Peter's approval. The instruction this time was to keep the plays word for word, so they are. Changing six words to "user" is a small edit if he wants it.
- **"a 20-minute call"** (prospects, part 3) is the length of a meeting the email asks for, not time saved. **"8:30 AM"** (parts 2 and 9) is an hour of the day. **"20"** in "20 researched, personalised first-touch emails" and in the short title is what the play drafts each morning.
- The plays use straight quotation marks and apostrophes; the site's own words use curly ones.

**Allowances added to the claims check for these plays**, each exact and inside an example only (acceptance, "Settled exceptions"): the four phrases where "save" means store ("Save this as a skill called", "Save each email as an unsent draft", "save nothing and report the error", "how many drafts were saved"); "a 20-minute call"; and the short title "20 new prospects every day". The allowance for the retired play's phrases is removed.

### 9.4 The third example was written by us

Peter asked for a third: the printable one-page daily paper for the kitchen table. The Zack run of November 12, 2026 that names it lists it among its runners-up in one line, with no playbook and no install prompt, and no other file in the repo has it.

On November 27, 2026 Peter asked for the full play to be made up from best guesses. So the third example, short title **"A printed daily paper for the family"**, keeps the run's title and idea, and everything else (the summary, the eight parts and the install prompt) was written for the site. It is not source text from a run and no user has run it as written. Its seventh part is headed "Pitfalls to watch for" instead of "Pitfalls seen", because nobody has seen them. The word-for-word test in `src/lib/site/sample.test.ts` covers the other two examples and names this one as the single exception. The text is in `src/data/site/examples.ts` for Peter to approve.

### 9.5 The play this replaces, and `/admin/sample`

- **"Client email in two tones"** (section 2.2) is retired. Its file, `src/data/site/sample-play.ts`, is deleted, and it is on no page.
- **The examples are bundled with the site.** The play chosen at `/admin/sample` no longer reaches any public page: not the homepage, not `/how-it-works`. The admin page still works and still stores the choice; it now opens with a note saying the public site does not use it. (Later on November 27, 2026 the Sample idea screen was deleted with the admin sidebar, plan U2; a play still flagged as the sample is treated by the Cora job like any other, plan U11. The examples are now edited in Pages, Home, Cora Curation Examples.)
- **`/how-it-works`**, "The anatomy of an idea", takes apart one idea. It is now the first example, "Phone camera roll to styled Reels", under its short title.

### 9.6 `/pricing` and `/agents` deleted

Both pages, their components, their copy and their tests are deleted. Each address answers with a permanent redirect: `/pricing` to the homepage's price section (`/#price`), `/agents` to the homepage. Neither is in the sitemap.

**Links changed.**

| Link | Before | Now |
|---|---|---|
| Header, "Pricing" (and the phone menu's) | `/pricing` | `/#price`: on the homepage it scrolls to the price; from any other page it loads the homepage at the price, flush under the header |
| Footer, "Pricing" | `/pricing` | `/#price` |
| Footer, "For people who run AI agents" | `/agents` | Removed |

No other link to either page existed: none in a marketing page's own sections, in sign-up, in the app, in an email or in the privacy and terms text. A browser check of every public page, the sign-up start and the sign-in page found no link to `/pricing`, `/agents` or the deleted `#how`.

**What a visitor can no longer find on any marketing page:**

From `/pricing`:

- **"What is included"**: "Your own history of every idea you have received.", "Your Zack controls." and "A compounding view of what you have set up." The first item, what a Cora Curation is, is still on the homepage's price card.
- **"Monthly, explained"**: "Your card is charged once a month, starting with your third Cora Curation." and "One price, charged once a month. Cancel in one click." The answer to "When is my card charged?" (homepage and `/faq`) says the first half. "Cancel in one click" is now only in the `/faq` answer "Why do you need a card for a free trial?".
- **"How contributing works"**: "Roger works because everyone’s Zack contributes", and that the difference for a second missed week "appears on your next invoice". The higher rate itself (US$400, CA$560 in Canada) is now stated in two `/faq` answers only ("I compete with other people on Roger…" and "What if Zack misses a week?"), in the terms, and on the sign-up plan step. It is not on the homepage, by Peter's earlier cut.
- **"No refunds"** as a section. The `/faq` answer "Can I get a refund?" says it.

From `/agents`:

- **The page for people who already run AI agents**: "Stop figuring out AI agents alone.", its sub-line, its three problem statements, its three steps ("Add Zack", "Cora picks your three", "Paste to install") and its closing line "Find out what other heavy users know."
- **The supported AI agents, on show**: the strip "Works with every agent" with Claude, Duet, Grok Bot and Hark and "Any other agent adapts one with a single prompt." The names are now only in the `/faq` answer "Which AI agents does Roger work with?" and as the four Zack file links on `/how-it-works`.
- **The link to the free Zack run.** "Run Zack on yourself first" on `/agents` was the only link to `/zack`. `/zack` is still served and still in the sitemap, and nothing on the site links to it.
- **Five questions the homepage does not show** were on `/agents` and are now on `/faq` only: which AI agents Roger works with, what leaves my account, can I see and change what Zack does, I compete with other people on Roger, and will an idea work on my AI agent. (The other two `/agents` showed are on the homepage too.)
- **A testimonial cleared for the audience "agents"** has no page to show on. One cleared for both still shows on the homepage.

Not changed: sign-up still accepts the audience "agents" in a start link, so a link already sent with it still works. No page sets it now.

### 9.7 The questions editor

`/admin/questions`, "Edit Questions" in the admin's navigation. It lists all eighteen questions with the pages that show each, and lets an admin change a question's wording and its answer, save, and reset to the built-in wording. Its own words are admin text, not site copy. A saved answer is site copy, and is not listed in this file: the admin log records each save and reset with who made it and the text.

### 9.8 Where the new wording and the product differ

1. **"Approve The Ideas … Say yes to the ideas you like and see them in action for you."** There is nothing to approve in the product. A Cora Curation arrives; the user opens an idea, copies its prompt and playbook, and pastes them into their own AI agent, which sets it up and asks setup questions. An idea does not go into action because the user says yes. The line this replaced described that. `/how-it-works` still does (Tuesday: "Open an idea, press copy and paste it into your AI agent.").
2. **"Payment starts in week 3."** The first charge comes with the third Cora Curation, which is the third Monday only if one has been delivered every week. It is later when a week brings none (Zack missed the cutoff, or nothing fit) and after a declined card. It also says nothing of the card: with the hero's line and the old note both gone, the homepage says a card is asked for in one place, the answer to "When is my card charged?", and never says it is asked for at sign-up. The sign-up card step does.
3. **"Level up your use of AI Agents Now."** No claim in it is checkable or false. It is the one start button whose words are not "Get two free Cora Curations", so a visitor may not read it as the same action.
