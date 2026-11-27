# Site v1: copy changes for Peter

Site version 1 uses the spec's draft copy word for word (plan R14a). This file lists every line that is not the spec's own wording, and why.

Sources compared:

- **Marketing spec**: `artifacts/v3-marketing-website-spec.md`, "Messaging and copy direction".
- **Design spec 1.3**: `artifacts/Roger v3 - design spec.md`, A.4, A.7 and A.14.
- **The copy file**: `src/data/site/v1.ts`. Peter's letter is in `src/data/site/letter.ts` and the sample play in `src/data/site/sample-play.ts`.

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
| Brick stack, the caption under a stack | "Week {week}" and "{bricks} bricks", read as "Week 26" and "78 bricks". The numbers are the compounding story's own. |
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
