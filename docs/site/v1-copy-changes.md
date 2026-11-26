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

## 2. Needs Peter's approval

**Approved by Peter on November 26, 2026:** the letter change (2.1), the cleaned sample play (2.2), the higher-rate wording (2.3), the footer label "For people who run AI agents", and the wording in section 3. The privacy and terms drafts are approved to be written from the spec and stay marked as drafts.

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

The warning above the paste box is the spec's own sentence, word for word, and is not new: "Check your report for client names or private details before pasting. It is read by Roger’s team and by Cora, Roger’s ranking agent, and is never published."

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
| "Run Zack once", an agent with no file | "There is no Zack file for [agent] yet. Start from the Hark file and ask your own agent to adapt it with this prompt." Field label "Your agent", with the example "e.g. ChatGPT". The prompt is `/hampton`'s, word for word: "I want you to take the Zack The Collector file, and update it so that it works for [agent]. I then want you to create a .md file for my agent I can download and then do a test run and produce a markdown file". Until a name is typed the gap reads "[INSERT AGENT]", as on `/hampton`. Button "Copy prompt". Then "That test run is your report. Skip the next prompt and paste the report below." |
| "Run Zack once", the prompt | "Attach the file (or paste its text), then send this:" and the prompt, both `/hampton`'s word for word: "Run Zack the Collector now from the attached file and create a .md output file." Button "Copy", which reads "Copied" for a moment after it is pressed. |
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
- Zack, in detail: four points, "What he reads", "What he never reads", "What he removes", "What you can change". Three are answered with sentences from the questions, word for word, and one is recomposed from a question's sentence with the same facts:
  - What he reads: "Only your own activity inside your AI agent account, from the past seven days." (from "What does Zack read?", word for word)
  - What he never reads: "He does not read your email, calendar or files." (from "What does Zack read?", word for word; see section 6)
  - What he removes: "Names, clients, addresses, amounts and other private details are replaced by placeholders." Recomposed from "What leaves my account?", which says "… with names, clients, addresses, amounts and other private details replaced by placeholders."
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

## 6. Must be resolved before a version goes live

### 6.1 "He does not read your email, calendar or files." conflicts with the public Zack files

The spec's sentence "He does not read your email, calendar or files." (design spec A.14, word for word) is on the site twice: in the answer to "What does Zack read?" on the homepage and `/faq`, and under "What he never reads" on `/how-it-works`. Directly under it, `/how-it-works` says "Read the Zack files before you sign up" and links the four files in `public/zack`. Those files say something else. A reader who follows the link finds the sentence contradicted.

The conflicting lines, from `public/zack/zack-the-collector-claude.md`:

- **What Zack reviews (line 15).** "Zack reads across the whole Claude account, not just his own chat. Every Zack run reviews the past 7 days of activity across all chats and projects in the member's Claude account: every chat, scheduled-task runs and finished work (files, documents, decks, sheets and other artifacts, browser tasks, drafts) and skills used. … Shared chats, shared projects, other people's messages, email, calendar and Drive are skipped." So the file says Zack does review files in the account. What it skips is "email, calendar and Drive".
- **Who receives the reports (line 258).** "Who holds it: one named collector (Peter) receives the files by email. Members' agents never write to it." This is how Circles worked.
- **Who sees them (line 259).** "Who sees it: only the circle's members, under the circle's confidentiality agreement, which covers the collection itself." The site says "Other Roger users, without your name or anything that identifies you."
- **How long they are kept (line 261).** "How long it's kept: 12 months, then deleted." The design spec (0.2, Retention) says runs are kept while a user subscribes and for 90 days after.
- **Not yet run (line 274).** "Version 2.0 has not been run on a Claude account. It was ported from the Grok Bot version. The first test run should answer these before the file is shared:". The Duet and Hark files carry the same notice at their line 274 ("has not been run on a Duet account", "has not been run on a Hark account"). The Grok Bot file does not have it.
- **The version (line 3).** "Version 2.0 · November 22, 2026 · Roger (meetroger.ai)". All four public files are 2.0. The design spec (A.11, B.5) says the public files stay at version 1.9.

The same lines are in the Duet, Grok Bot and Hark files (one line earlier in the Grok Bot file: 14, 257, 258 and 260).

There are two ways to resolve it:

1. **Correct the Zack files.** Bring the four public files in line with the spec: what Zack reads, who receives and sees a report, how long it is kept, the "has not been run" notice, and the version.
2. **Peter approves a narrower sentence.** One that says only what the files say, for example the file's own list, "email, calendar and Drive". This settles the word "files" only. The Circles-era lines, the notice and the version would still need correcting or a decision.

Nothing was changed in the Zack files, and the sentence on the site is still the spec's.

### 6.2 Lesser items for the same review

- **"A compounding view of what you have set up."** This is the fourth line of "What is included" on `/pricing`, and it is the spec's wording (A.7). The app's compounding graph is planned for a later version: design spec B.10 says of `/app/history`, "A count of bricks. (The compounding graph arrives in B2.)". Peter decides whether a count of bricks is "a compounding view", or whether the line is held back until the graph exists, as the group session line is.
- **`/how-it-works`, "What you can change", does not mention switching sharing off.** The spec says a user can turn sharing off (A.13), the answer to "What leaves my account?" says "you can turn it off", and the control block says it on the homepage and `/agents`. `/how-it-works` never says it. Adding it brings the higher-rate sentence with it, so it is left for Peter.
- **The free Zack run accepts 40,000 characters, not the spec's 20,000.** The spec sets 20,000 (A.11). Of the thirteen real reports in `artifacts/Zack Runs`, ten are longer than that: they run from about 8,500 to 33,200 characters, so the specified limit would have stopped most visitors at the paste step. The limit is 40,000, which clears the longest real report and stays inside the 80,000 that sign-up's own claim accepts. It is one number (`FREE_RUN_REPORT_CHARS` in `src/lib/site/free-run.ts`) if Peter wants another.
- **The public Zack files call the reader "the member" and describe a collector and a circle** (6.1). `/zack` now sends visitors to those files, so the same correction covers this page.

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

The lesson on per-IP lockouts (`docs/solutions/security-issues/per-ip-lockout-blocks-everyone-behind-an-agent-platform-2026-11-22.md`) says to limit by IP only for failures, because many people can share one address: an agent platform, an office, a VPN. The two per-IP limits here (starts, and pastes) count every valid request and refuse the 101st in an hour from one address, so they depart from the letter of that lesson. They were kept because these two requests have no failure to count: a start succeeds for any well-formed email, and each one writes a row and can empty someone's run, so the limit is what stops a script doing that for a list of addresses. They are set at 100 an hour, twenty times the per-email limit of 5, and a test starts runs for twenty emails from one address. The per-IP limit is checked before the per-email one, so a start it refuses does not use up one of that email's tries. A badly formed email, an unknown agent, and an empty or over-long report are refused before anything is counted.
