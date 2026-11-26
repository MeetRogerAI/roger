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
| Question "Can I buy one list at a time?" | Marketing spec: "Yes. It is US$100 a list, ordered whenever you want one. Monthly costs less if you want a list most weeks." Design spec 1.3: "Yes. One list costs US$200, and you order it for any Monday you want. Monthly is much cheaper: for the same US$200 you get a new list every Monday, so each list works out to about US$50." | "Yes. One list costs US$200, and you order it for any Monday you want. For the same price, monthly brings a new list every Monday." | Old list price, and "costs less" is no longer true of the price itself. The 1.3 line's first sentence is kept; "about US$50" is dropped (see above). |
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
| `/about` | "About" |
| `/zack` | "Run Zack on yourself first", "Pick your agent", "Your email", "Run Zack once", "Paste the report back", "Agent not listed?", "Start from the Hark file and ask your own agent to adapt it.", "Your top plays" |

**`/how-it-works`** (spec A.8 lists the sections; none of its text is written)

- The week, Sunday: "Zack reviews the past seven days of your own AI agent activity and writes up what worked, with client details removed. You do nothing. He runs on his own."
- The week, Monday: "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best. You receive your three ideas, each with a full playbook."
- The week, Tuesday: "Nothing new arrives. Open an idea, press copy and paste it into your AI agent. It sets itself up and asks you what it needs to know."
- The week, Wednesday: "Each idea you set up stays set up, and your three ideas stay in your dashboard for when you want them."
- Zack, in detail: four points, "What he reads", "What he never reads", "What he removes", "What you can change", each answered with the matching sentence from the questions. Link: "Read the Zack files before you sign up".
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

The Wednesday paragraph does not mention the Wednesday numbers email, because that email is not part of this build. It also does not say that nothing arrives on Wednesday, because the spec plans that email for Wednesday and the line would turn false the day it ships.

The Trigger note says only "What starts it." The spec names the part without saying what a trigger can be, so the note does not list kinds of trigger.

## 4. Choices made where the spec is silent

- **Which six questions each page shows.** Homepage: "I don’t use AI agents yet. Can I start?", "What do I have to do each week?", "What does Zack read?", "Who sees my plays?", "What does it cost?", "When is my card charged?". `/agents`: "Which AI agents does Roger work with?", "What leaves my account?", "Can I see and change what Zack does?", "I compete with other people on Roger. What if I don’t want to share?", "Will an idea work on my AI agent if it came from a different one?", "When is my card charged?". `/faq` shows all eighteen.
- **The weekly group session** is left out of "What is included". The spec shows it only once that part of the product is live.
- **Typography.** Straight apostrophes and quotation marks in the spec are typographic ones on the site, as elsewhere in the repo.

## 5. Noted, not changed

- **The line added to the top of every playbook** is a setting the app owns: "I want you to take this document, and update it so that it works for my agent system and then install the playbook, asking me questions as needed." It says "agent" without "AI". The public card copies it to the clipboard with the playbook but does not print it. `/how-it-works` is specified to print it, so the wording needs Peter's decision before that page is built.
- **"Hours saved"** is the name of one of Cora's five scores, and the sample card shows it as a bar's name with a score out of 10. It is not a time figure. The spec names the five scores in the same words. The card prints the name alone: the app's line under it, about time saved a week, is not on the public card.
- **Digits that are spec or source wording.** The site's rule is that no number is typed into copy except the compounding labels. These digits are not amounts and not claims, and each is the spec's or the source's own wording, so they stay:
  - "run by 3 users", in the answer to "Who sees my plays?" (spec A.14, word for word).
  - "of 10", after each of Cora's scores on the sample card.
  - "sections 1 to 8", and "section 3" to "section 6", in the sample play's install prompt, with the playbook's headings numbered 1 to 8 to match.
  - The years in Peter's letter: "at 17", "35+ years later", "18+ years" (the approved letter).
- **The playbook names Claude.** The sample play was written on Claude, and its text says "Claude returns two ready-to-send versions", "a file Claude should check first" and "Claude drafts only". The card also prints "Written on Claude". This is the source's wording, kept. It is the third thing for Peter to settle in section 2.2.
- **"One list on its own costs the same as a whole month"** is true only while the two settings are equal. So are "for the price of one list" in "What does it cost?" and "For the same price" in "Can I buy one list at a time?". The prices come from the settings and these sentences do not, so if the monthly price and the one-list price are ever set apart, the three sentences turn false and no test will catch it. They are the wording R14a asks for, so they are not changed.
