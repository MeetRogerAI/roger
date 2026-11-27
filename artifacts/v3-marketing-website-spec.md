# Marketing website design spec: meetroger.ai

Compiled from every email involving James Camarota in Peter Kuperman's pkuperman@gmail.com inbox, including attachments, and dated in America/Toronto (ET).

**What this is.** A brief for how the public marketing site should be built and what it should include. It is grounded only in that email thread and its attachments. Nothing here is invented.

**Which source wins.** On November 21, 2026, at 1:32 PM ET, Peter sent *Roger v3 - design spec.md* (version 1.1) and called it "the final word for this build," dividing work into a marketing website and an application website. He also said the Strategy document was then "slightly deprecated and outdated," and that James's job was to take this version of the marketing spec, "throw away everything bad and reimagine it to actually be cool and good." James agreed at 5:50 PM ET the same day: he would treat the v3 design spec as the brief for the marketing site, throw out what is weak, keep the product decisions, reimagine the public pages so they feel cool, and leave the app side to Peter. Where an earlier email and the v3 design spec disagree, the later document and James's acceptance of it win, and the change is noted below.

**James's role.** James Camarota (james.m.camarota@gmail.com) was hired to design and build the public marketing website. His portfolio is at https://jamescamarota.com. Peter is building the application part of the same design spec, also aiming for about November 30, 2026.

**The site.** This is the public marketing site for Roger, to go live on meetroger.ai on November 30, 2026, ahead of Peter's December 1 meeting with a real estate agent distribution partner.

---

## Purpose and audience

Roger makes each user's AI agents better every week. Zack, the collector, runs in the user's own agent account each Sunday and writes up the week's most useful work as "plays," with private details removed. Roger pools the plays from contributing users. Early Monday, Cora, the curator, picks the three plays most worth adopting for each user and sends them, each with a playbook the user pastes into their own agent to install. New users get two free Monday lists and add a card when they start. After that they choose US$200 a month, presented as the clear pick, or US$100 for one list at a time. [Nov 21, 1:32 PM ET, *Roger v3 - design spec.md*, sections 0.1–0.2]

**Goal of the marketing site.** A visitor understands in ten seconds what arrives on Monday, believes a real person runs it, sees exactly what it costs and when the card is charged, and starts the free trial. [Nov 21, 1:32 PM ET, A.1]

Peter's earlier brief, which the later spec still serves, was a site that conveys the value of a compounding weekly loop: Zack collects useful playbooks across many Grok Bot teams, Cora curates three personalized improvements for each person, those improvements are installed, and the next week compounds on the last. [Nov 19, 7:11 PM ET; Nov 20, 11:30 AM ET]

**Two audiences.** [Nov 21, 1:32 PM ET, 0.2 and A.1]

| | Homepage `/` | `/agents` |
|---|---|---|
| Reader | People in real estate. Most have no AI agents yet, or one they barely use. | People who already run AI agents daily for work. Sceptical of hype. |
| What they need to hear | Other people in your business have worked out what to use AI agents for. You get their best three ideas each week, ready to install. | You are working out the same things alone that others already solved. Trade plays. |
| First step after sign-up | Install an agent and the starter team | Install Zack |
| Secondary button | "See how it works" | "Run Zack on yourself first" |

The individual user is the buyer. Any brokerage subsidy is upside. The current site still shows the older Circles pitch (8-person groups, a 45-day guarantee) and is labelled a preview; that pitch comes off when v3 goes live. [Nov 21, 11:32 AM ET, *Roger Strategy v3.1.md*, sections 3 and 8; superseded on Circles by the v3 design spec]

---

## Site map and pages

Public marketing routes, from the v3 design spec. Sign-up, sign-in, the dashboard, and admin are the app, which Peter is building; the marketing site links to them but does not build them. [Nov 21, 1:32 PM ET, A.2 and 0.6; Nov 21, 5:50 PM ET]

| Route | Status | Notes |
|---|---|---|
| `/` | Rebuilt | Real estate homepage |
| `/agents` | New | For people who already run AI agents |
| `/pricing` | New | Prices and trial terms |
| `/how-it-works` | New | The week in detail and the anatomy of an idea |
| `/faq` | New | All questions |
| `/about` | New | Peter's letter |
| `/zack`, `/zack/[agent]` | Reworked | Free Zack run, linked from `/agents` only, not from the homepage |
| `/library` | Kept, public | Adds a trial band |
| `/privacy`, `/terms` | Rewritten | Drafts until Peter has them read |
| `/apply` | Redirects to `/start` | Circles application removed from view |
| `/setup`, `/companies`, `/packs/[id]`, `/workshops`, `/refunds`, `/thanks/*` | Stay hidden | Already noindex; no links to them |
| `/rlpsignature`, `/rlp`, `/hampton`, `/founders`, `/for/[slug]` | Unchanged | Unlisted; keep their own header behaviour |
| `/start`, `/signin`, `/getstarted`, `/app/*`, `/admin/*` | App builder | Linked to, not built on the marketing side |

**Sitemap** when `v3Mode` is on: `/`, `/agents`, `/pricing`, `/how-it-works`, `/faq`, `/about`, `/zack`, `/library`, `/getstarted`, `/privacy`, `/terms`.

**Robots** disallows the hidden paths, `/app`, `/admin`, `/start`, and `/api`.

**Header links:** How it works, Pricing, Use cases (`/library`), FAQ, About. On the right: "Sign in" as a text link to `/signin`, and the button "Start free" (short) or "Get two free Monday lists" (long) to `/start`. A signed-in visitor sees "Open Roger" to `/app` in place of both. The header must not block rendering on the signed-in check. No header button on `/start/*`, `/signin`, and `/app/*`. Unlisted pages keep their current header exclusion. [Nov 21, 1:32 PM ET, A.3]

**Footer:** contact email, Pricing, How it works, FAQ, About, Use cases, For people who run agents (`/agents`), Privacy, Terms. [Nov 21, 1:32 PM ET, A.3]

---

## Content and sections for each page

Build shared blocks once and reuse them: the brick stack; the night price block; testimonials (absent when none are cleared); the sample idea card (absent until a play is chosen in the admin); the "You decide what Zack shares" control block; the questions accordion; and the night closing band (one line, the primary button, and the trial line). [Nov 21, 1:32 PM ET, A.4]

### Homepage `/`, in order [Nov 21, 1:32 PM ET, A.5]

1. **Hero (night).** Headline, sub-line, primary button "Get two free Monday lists," secondary link "See how it works." The brick stack, with three bricks arriving. Under the buttons, in small type: "Card required. Charged only with your third list." (James confirmed this line at 5:50 PM ET on Nov 21.)
2. **The problem (ground).** Three short statements (copy below).
3. **How it works (night), id `how`.** Four numbered steps: set up your AI agents, Zack reviews your week, Cora picks your three ideas, paste to install. The brick stack grows across the four steps.
4. **What arrives on Monday (ground).** The sample idea card, with the line "This is one idea, as it arrives." Absent until a play is chosen.
5. **It compounds (ground-2).** A 26-week compounding picture: three bricks at the start, three more each week. One sentence. No numbers about time or money. Earlier emails asked for an animated scroll story that shows week 1, week 2, week 3, then jumps to week 26 (3→6→9, then 78→81), like lego bricks. The later spec describes a static graph; James said he would start the page structure and the scroll story from the spec and make the marketing pages better than a straight build. See Open questions. [Nov 20, 9:18 AM ET; Nov 20, 11:30 AM ET; Nov 20, 2:50 PM ET; Nov 21, 1:32 PM ET; Nov 21, 5:50 PM ET]
6. **What people say (ground).** Testimonials for audience `re`. Absent if none are cleared.
7. **You decide what Zack shares (ground).** The control block.
8. **Who runs this (ground).** The first three paragraphs of Peter's letter, his photograph, and a link to `/about`.
9. **Price (night).** The price block.
10. **Questions (ground).** Six questions tagged for the homepage, and a link to `/faq`.
11. **Closing band (night).**

Every Circles section (seats, rules, vetting, application) is removed from view. Keep those components in the repo.

### `/agents` [Nov 21, 1:32 PM ET, A.6]

Same blocks, different copy and order.

1. **Hero (night).** Pain-led headline, sub-line, primary button "Get two free Monday lists," secondary button "Run Zack on yourself first" to `/zack`. Under the hero, a text-only strip of agents generated from `src/data/zack.ts`, with the heading "Works with every agent" and the line "Zack files for Claude, Duet, Grok Bot and Hark. Any other agent adapts one with a single prompt."
2. **The problem (ground).** Three statements for agent users.
3. **How it works (night).** Three steps: add Zack, Cora picks your three, paste to install.
4. **The sample idea card (ground).**
5. **The control block (ground).** Higher on this page, because security questions come first.
6. **What people say.** Audience `agents` or `both`; absent if none.
7. **Price (night).**
8. **Questions** tagged for this page.
9. **Closing band.**

Every start button here links to `/start?path=agents`.

### `/pricing` [Nov 21, 1:32 PM ET, A.7]

1. The price block, full width, with monthly first and marked as the choice most people make.
2. **What is included,** as a plain list: three ideas every Monday, each with a full playbook; the user's history of every idea received; Zack controls; a compounding view of what has been set up; the weekly group session (shown only once version B2 is live; controlled by a flag).
3. **Monthly or one at a time, explained.** Two short columns, plus one line under both: "Two lists one at a time cost the same as a whole month."
4. **How contributing works.** A short explanation, not presented as a plan to choose: on monthly, the first missed Zack week each month is forgiven; a second miss makes that month US$400; both events are emailed; the difference appears on the next invoice. Switching sharing off in the dashboard makes the monthly price US$400. One-at-a-time lists need that week's Zack report. (James first suggested leaving the $400 option and missed-week rules off the marketing page and in billing later. The later spec, which he then accepted as the brief, puts this explanation on `/pricing` and in the control block. The later document wins.) [Nov 21, 12:37 PM ET; Nov 21, 1:32 PM ET; Nov 21, 5:50 PM ET]
5. **No refunds, stated plainly:** "There are no refunds. You get two free lists before any charge, and you can cancel in one click."
6. Primary button.

### `/how-it-works` [Nov 21, 1:32 PM ET, A.8]

Narrow column, long form.

1. **The week.** Sunday, Monday, Tuesday, Wednesday, each one short paragraph: what happens, what the user does (usually nothing), what they receive.
2. **Zack, in detail,** id `zack`. What he reads (the past seven days of the user's own agent activity), what he never reads, what he removes, and what the user can change. Link to the public Zack files so anyone can read them before signing up.
3. **Cora, in detail.** She scores every play on five things: hours saved, reach, ease to copy, proof, and surprise. She never sends a user something they already run, and never names who a play came from. (The five score names come from the attached spec. Time-saved *promises* in Roger's voice are not allowed; see Open questions and Messaging.)
4. **The anatomy of an idea.** The sample idea card laid out with a one-line margin note on each part: Play, Trigger, Setup first, Steps, Guardrails, Output, Pitfalls seen, Done when, Paste to install. The preface paragraph is shown first, labelled "Added to the top of every playbook."
5. **Your first two weeks.** The trial, step by step, with the card and the charge date stated again.
6. **If you have no AI agent yet.** Two sentences and a link to `/getstarted`.

### `/faq` [Nov 21, 1:32 PM ET, A.9]

All questions from the copy file, grouped: Getting started, Zack and privacy, Cora and the ideas, Price and billing. Each answer one to three sentences. Copy is in the Messaging section below.

### `/about` [Nov 21, 1:32 PM ET, A.10]

Peter's letter in a narrow column with his photograph and signature, using the Circles About frame as the layout. The approved letter still mentions Circles and applications, so it needs an edit from Peter before launch. Until the new text arrives, the page shows only the paragraphs that are still true: the first two, and the paragraph about his background. The page must lay out correctly while the photograph and signature files are missing.

### `/zack` and `/zack/[agent]` [Nov 21, 1:32 PM ET, A.11]

A free Zack run for agent users only, linked from `/agents` and nowhere on the homepage.

- **Flow:** pick an agent → email → instructions with the run-once prompt in a code block and a "Copy" button → paste the report back. This is the flow in the Circles spec 6.5, with the changes below.
- **The public Zack files stay at version 1.9** for this tool. They run on demand and send nothing. The scheduled, connected version is served only to signed-in users (app side).
- **"Agent not listed"** stays as on `/hampton`: start from the Hark file and ask your own agent to adapt it.
- **After paste-back,** the visitor sees their own top plays summarised, then one button: "Get two free Monday lists," linking to `/start?path=agents&zack={token}` so the app can attach the report to the new account as its first run.
- Above the paste box: "Check your report for client names or private details before pasting. It is read by Roger's team and by Cora, Roger's ranking agent, and is never published."
- Storage is the `free_runs` table, which the app builder creates. The marketing builder writes to it from this tool's own server actions, following the existing `saveLead` pattern, and rate-limits by IP and email with a 20,000-character cap on the report.

### `/library` [Nov 21, 1:32 PM ET, A.12]

Unchanged, plus one band above the footer: "This is what people post in public. Roger sends you what works in private." with the primary button. Library cards must not link to `/setup` in v3 mode.

### Privacy and terms [Nov 21, 1:32 PM ET, A.13]

Rewrite both in `src/data/legal.ts`, in the existing plain style, dated November 2026. They are drafts until Peter has them read.

**Privacy must say, accurately:**

- Sign-up collects: name, email, the quiz answers, the agent used, country, and time zone.
- A card is collected by Stripe; Roger never sees the number.
- Zack runs in the user's own agent account, reads only that account's activity from the past seven days, removes private details, and sends its report to Roger each week because the user agreed at sign-up. The user can read the instructions, change what is collected, and turn sharing off.
- A run is checked again for private details, stored, and processed by Cora, an AI system, through a model provider. State the provider's position on training once Peter confirms it.
- Other users see anonymous plays only, never who a play came from.
- Retention: runs are kept while the user subscribes and for 90 days after; a user can delete any run; plays already shared stay in the pool without anything that identifies the user.
- Services that hold the data: Vercel, Neon, Resend, Stripe, Google (sign-in and Meet), and the model provider. Some store data outside Canada.
- Existing passages on the library, watches, and analytics stay as they are.
- How to ask what is held, correct it, or delete it, with a 30-day promise.

**Terms must say, accurately:**

- The trial: two free lists, a card on file, the charge with the third list, the 21-day close.
- The monthly price, the one-list price, the contributor rule, the higher monthly rate and the two cases where it applies, and how the difference is billed.
- No refunds; cancel any time; access continues to the end of the paid month.
- Tax is added where it applies.
- Plays are shared so other users can use them; a user keeps the right to their own work and grants Roger the right to share the anonymised play.
- The ideas are other people's working methods, offered as they are, with no promise of a result.

### Later, once the proof exists (version A2, not required for the November 30 launch) [Nov 21, 1:32 PM ET, A.15]

A 2 to 3 minute demo video section with poster, captions, and a pause control; a "one real week" worked example that states its sample size; and the group-session line on `/pricing` and the homepage once B2 ships. Strategy v3.1 describes the demo as real users showing real Cora results, with no income or time-saved claims. [Nov 21, 11:32 AM ET, Strategy v3.1, section 8]

---

## Messaging and copy direction

**Tone.** Plain, direct, exact. Short sentences in the second person. No hype words, no exclamation marks, no emoji. Numbers only where real. [Nov 21, 1:32 PM ET, A.1]

**Brand direction from Peter, in the emails.** The brand should be about mastery and excellence: with Roger, you develop mastery and excellence in your agent setup. Peter does not yet have logo or brand files. The chef's hat is a placeholder. He "kind of like[s] a magnifying glass indicating detective work." [Nov 21, 1:08 PM ET]

**Vocabulary on public pages.** Software is always "AI agent" or "AI agents," in full. People are "you," "people in real estate," or "users." On every page except `/agents` and `/zack`, never write "agent" or "agents" without "AI" in front, because readers in real estate are also called agents. [Nov 21, 1:32 PM ET, 0.4]

**What the site may and may not say** [Nov 21, 1:32 PM ET, 0.4; Strategy v3.1, section 8, agrees on claims]

| Allowed | Not allowed |
|---|---|
| What Zack and Cora do, step by step | Income, revenue, or productivity promises in Roger's voice |
| "Two free Monday lists. Your card is charged only with the third." | Any wording that hides the card or the charge date |
| "Works with every agent" | A list of "supported" agents that includes one with no Zack file, without the word "adapt" |
| The live count of public use cases, read from the database | User counts, "join hundreds," or any hard-coded number |
| Testimonials whose switch is on, word for word, with the person's first name and last initial | The brokerage's name, or any suggestion that a brokerage is an enterprise customer |
| A user's own statement of time saved, inside their testimonial | The same figure restated as Roger's claim |
| One real week as a worked example with its size stated | That line without its sample size |
| Peter's real background | Legal assurances the product cannot back |

Draft copy below is from the v3 design spec (A.14). Peter edits before launch.

**Homepage**

- **Headline:** "Your AI agents, smarter every Monday."
- **Sub-line:** "Roger makes your AI agents smarter every week, with ideas that worked for other real estate users."
- **The problem:**
  - "Everyone in real estate is being told to use AI. Almost nobody is told what to use it for."
  - "The people getting real work out of AI agents rarely post how. It involves their clients and their business."
  - "So each person works out the same things alone, a few months apart."
- **How it works:**
  1. "Set up your AI agents. If you don't have any, our starter team takes about half an hour to install."
  2. "Each Sunday, an AI agent called Zack reviews your week and writes up what worked, with client details removed."
  3. "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best."
  4. "Open one, press copy, paste it into your AI agent. It sets itself up and asks you what it needs to know."
- **It compounds:** "Three ideas a week. Each one you set up stays set up. Six months in, your AI agents do things you would not have thought to ask for."
- **Who runs this, lead-in:** "Roger is run by Peter Kuperman."
- **Closing band:** "See what your first two Mondays bring."
- **Under the start button:** "Card required. Charged only with your third list." [Nov 21, 5:50 PM ET]

**`/agents`**

- **Headline:** "Stop figuring out AI agents alone."
- **Sub-line:** "Every Monday, Roger sends you the three plays most worth installing, drawn from what other heavy users ran last week."
- **The problem:**
  - "The most useful things people do with agents never get posted. They involve clients, money, and how the business runs."
  - "What gets posted is the highlight reel, never the playbook."
  - "So you work out alone what someone else solved last month."
- **How it works:**
  1. "Add Zack to your agent. He reviews your past seven days and writes up your best plays, with identities removed."
  2. "Cora scores every play in the pool on hours saved, reach, ease to copy, proof and surprise, then picks the three that fit your work and that you don't already run."
  3. "Each idea comes with a full playbook. Paste it into your agent and it adapts itself to your setup."
- **Closing band:** "Find out what other heavy users know."

**Price block copy** [Nov 21, 1:32 PM ET, A.4]

- Display: "US$200 / month USD" and "US$100 / list USD," or "CA$280 / month CAD" and "CA$140 / list CAD." With CAD showing, add "plus HST." With USD showing, add "plus tax where it applies." Monthly is marked "Most people choose this" and is visually the larger of the two. No non-contributor plan is shown as something to choose.
- Trial line, always directly under the prices: "Your first two Monday lists are free. We ask for a card when you start. On monthly it is charged with your third list. On one at a time it is charged only when you order a list. Cancel before then and you pay nothing."

**Control block** [Nov 21, 1:32 PM ET, A.4]

Title: "You decide what Zack shares," with a link to `/how-it-works#zack`:

- "Read every line. The exact instructions your Zack runs are in your dashboard."
- "Set your own rules. Skip whole subjects, block names and words, or add rules in your own words."
- "Turn sharing off any time in your dashboard. On monthly your ideas keep coming and the price becomes US$400 a month."

**`/pricing` columns** [Nov 21, 1:32 PM ET, A.7]

- Monthly: "Three ideas every Monday. Charged once a month, starting with your third list."
- One at a time: "Order a list for any Monday you want one. You are charged only for the lists you order."
- Under both: "Two lists one at a time cost the same as a whole month."

**Questions (FAQ and in-page accordion)** [Nov 21, 1:32 PM ET, A.14]

*Getting started*

- *I don't use AI agents yet. Can I start?* "Yes. The startup page walks you through installing one and setting up a starter team for real estate. Most people finish in about half an hour."
- *Which AI agents does Roger work with?* "Every AI agent. Zack has ready-made files for Claude, Duet, Grok Bot and Hark. On any other, one prompt adapts him, or you can upload his report yourself."
- *What do I have to do each week?* "Open your three ideas on Monday and set up the ones you want. Zack runs on his own on Sunday."

*Zack and privacy*

- *What does Zack read?* "Only your own activity inside your AI agent account, from the past seven days. He does not read your email, calendar or files."
- *What leaves my account?* "Zack's weekly report: a write-up of your most useful plays with names, clients, addresses, amounts and other private details replaced by placeholders. You agree to this when you sign up, and you can turn it off."
- *Can I see and change what Zack does?* "Yes. Your dashboard shows the exact instructions your Zack runs. You can tell him to skip whole subjects, block specific words and names, share an outline only, or follow rules you write yourself."
- *Who sees my plays?* "Other Roger users, without your name or anything that identifies you. A play is described as 'run by 3 users', never as yours."
- *I compete with other people on Roger. What if I don't want to share?* "You decide exactly what Zack shares, down to skipping whole subjects and blocking names. If you switch sharing off completely in your dashboard, monthly still brings three ideas every Monday and costs US$400 a month."
- *Can I delete what I've sent?* "Yes. You can delete any weekly report from your dashboard."

*Cora and the ideas*

- *How are my three ideas chosen?* "Cora scores every play on hours saved, reach, ease to copy, proof and surprise, then matches plays to the kind of work your own week shows. She never sends something you already run."
- *What if an idea doesn't fit me?* "Paste it into your AI agent anyway and ask how it would apply to you. Every playbook starts by telling your AI agent to adapt it to your setup."
- *Will an idea work on my AI agent if it came from a different one?* "Yes. Your own AI agent rewrites the playbook for itself before installing it."

*Price and billing*

- *What does it cost?* "US$200 a month, or US$100 for one list at a time, plus tax where it applies. In Canada it is CA$280 a month or CA$140 a list, plus HST."
- *When is my card charged?* "On monthly, with your third Monday list and not before. On one at a time, only when you order a list. Your first two lists are free either way, and we email you after your second list with what happens next."
- *Why do you need a card for a free trial?* "So that nothing changes on your third Monday. If you don't want to continue, cancel in one click before then and you pay nothing."
- *What if Zack misses a week?* "On monthly, the first miss each month is forgiven. A second miss makes that month US$400. We email you both times."
- *Can I get a refund?* "No. You get two free lists before any charge, and you can cancel any time."
- *Can I buy one list at a time?* "Yes. It is US$100 a list, ordered whenever you want one. Monthly costs less if you want a list most weeks."

The referral script in A.14 is for Ehab and referrers, not for the site.

---

## Visual design: brand, colors, type, imagery, layout

**Work from the existing design system, then make the marketing pages better than a straight build of the spec.** James said he would do exactly that. Peter asked him to throw away what is weak and reimagine the public pages so they actually feel cool. Layout is the builder's decision inside the design system in section 0.7 of the v3 design spec. [Nov 21, 1:32 PM ET, opening rules and 0.7; Nov 21, 1:32 PM ET cover note; Nov 21, 5:50 PM ET]

**Keep** every token in `src/app/globals.css`: Mona Sans; light "ground" pages with dark "night" chapters; one accent, copper (`--color-accent: #9a5226`), used only for the primary button and text links; one 8px corner; generous white space; no stock photography. The only photograph on the site is Peter. [Nov 21, 1:32 PM ET, 0.5 and 0.7]

**Layout rules carried from the Circles design:** centred section headings with one or two lines of sub-copy, about 44rem wide; long-form text in one narrow column, about 40rem; numbered steps with a large pale numeral above a short title; the primary button in the hero, the price block, and the closing band, with text links between. [Nov 21, 1:32 PM ET, 0.7]

**Reference sites for the marketing feel,** sent by Peter and agreed by James: https://theacademysf.com/, https://earth-ai.com/, and https://maticrobots.com/. The shared direction is more visual, less text, and a story told as you scroll. [Nov 20, 11:30 AM ET; Nov 20, 2:50 PM ET]

**The recurring visual is bricks,** not the older eight seats. Three bricks arrive each Monday and the stack grows. It appears in the homepage hero, in "how it works," in the Monday email header (app), and in the dashboard's compounding graph (app). A brick is a small rounded square. An empty slot is an outlined square; a brick the user has set up is filled in the level colour. This is the later form of Peter's "lego bricks" compounding idea (start with 3, add 3 each week, show week 3 and then week 26). [Nov 20, 11:30 AM ET; Nov 20, 2:50 PM ET; Nov 21, 1:32 PM ET, 0.7]

**Add a data palette,** for graphics only: Cora's five score bars, the bricks, and the compounding graph. Text is never set in these colours and they never mark an action. Starting values: hours saved `#b86a12`, reach `#2a6aa8`, ease `#2c8463`, proof `#6650b4`, surprise `#b0457a`. Brick and graph levels use reach, ease, proof, surprise, hours, in that order. The "you are here" dot is `#c63b2b`. Check at least 3:1 contrast against ground and surface, and add lifted versions for night chapters. Adjust lightness if needed and keep the hue. Every bar and brick also carries a text label or number, so colour is never the only signal. [Nov 21, 1:32 PM ET, 0.7]

**The idea card.** One component, used in the Monday view, in the email (simplified, app side), and as the sample on the public site. Its structure comes from the attached *Monday Morning Playbooks v1.0 Nov 14.html* prototype, restyled in the site's tokens. Peter said v1.0 "has too much information, but it's a start." James said he would turn the Cora report Peter sent into a cleaner sample with names removed. The prototype's tier trays, tier colours, purple accent, and its two typefaces are not used. [Nov 21, 1:08 PM ET; Nov 21, 1:32 PM ET, 0.7; Nov 21, 5:50 PM ET]

The attached spec describes the card as:

- **Front:** title, the user's personal score out of 100, one sentence on why it fits them, and a time line.
- **Pull-out sheet:** the description; four tiles; the "paste to install" block with a "Copy prompt and playbook" button; Cora's five scores as bars; the playbook; and a note on how time figures were worked out.

The time line and time tiles in that prototype and in section 0.7 are not written into this marketing brief as claims. See Open questions.

**Accessibility.** Keep the existing contrast ratios, skip link, visible focus, and reduced-motion behaviour. Every form field has a visible label and an inline error. Toggles are real buttons with `aria-pressed`. The pull-out sheet traps focus, closes on Escape, and returns focus to the card that opened it. Forms work by keyboard alone; the accordion and the currency toggle expose their state; nothing moves under `prefers-reduced-motion`. Checks at five widths. [Nov 21, 1:32 PM ET, 0.7 and A.16]

**Later visual references (Nov 24).** Peter sent two X posts for James to use so the site and project are outstanding: Yakko (@yakkomajuri), "How my vibe coded website looks like a designer made it" (https://x.com/yakkomajuri/status/2086868581619581262), and Ben Kamens (@kamens), "How we built olddogs.ai with lots of agents but zero slop" (https://x.com/kamens/status/2105848263505285450). The attached screenshots show a polished, designer-level marketing hero (pale sky, a product window, a yellow "Talk to founder" button, a pixel-illustrated landscape) and a distinctive dithered illustration of dogs on a coastal cliff, one of them in colour on a surfboard. These are inspiration, not a requirement to copy either site. [Nov 24, 7:02 AM ET]

**Logo.** Not yet designed. Placeholder today is a chef's hat. Peter's leaning is a magnifying glass (detective work), with a brand of mastery and excellence. [Nov 21, 1:08 PM ET]

---

## Functionality and integrations

**Start handoff.** Every start button on the public site links to `/start`, which the app builder owns. The public site passes context in the query string: `path` (`re` or `agents`), `cur` (`USD` or `CAD`), `ref` (referral code, version B2), `zack` (token from a free Zack report), and `utm`. James confirmed: the start button goes to sign-up, a card is collected there, and the card is charged only with the third list. [Nov 21, 1:32 PM ET, 0.6; Nov 21, 5:50 PM ET]

**Price block behaviour.** USD and CAD toggle, reusing the behaviour in `src/components/circles/price.tsx`: default from the `x-vercel-ip-country` header, the choice kept for the tab, the currency code always shown after the amount. Set prices, not live conversion: US$200 / US$100 and CA$280 / CA$140. Prices are shown before tax. Never show a bare "$". The trial line always sits directly under the prices. [Nov 21, 1:08 PM ET; Nov 21, 1:32 PM ET, 0.2 and A.4; Nov 21, 5:50 PM ET]

**What the public site reads from the database.** Only: `use_cases` (library count and cards), `testimonials` where `cleared` is true, the `v3.*` settings, and the published `setup_files` row. It writes only to `leads` and `free_runs`. Everything else belongs to the app. [Nov 21, 1:32 PM ET, 0.6]

**Testimonials.** Leave the section off until quotes that mention Cora are cleared to use. Peter said that was fine, and that they would likely come in before November 30. James can add them as they get cleared. Each quote is shown word for word, then the attribution (first name and last initial; role and city still to be confirmed). No carousel; a simple column or grid. Filtered by audience. The brokerage is never named. [Nov 21, 12:37 PM ET; Nov 21, 1:08 PM ET; Nov 21, 1:32 PM ET, A.4; Nov 21, 5:50 PM ET]

**Sample idea card.** One real pool play, chosen in the admin, opened to show the sheet. Until a play is chosen, the section is absent. Source material James was given: a forwarded Cora-style report (to be cleaned, with names removed) and the Monday Morning Playbooks v1.0 HTML. [Nov 21, 1:08 PM ET; Nov 21, 1:32 PM ET; Nov 21, 5:50 PM ET]

**Currency, trial, and billing rules the marketing pages must state accurately** (the Stripe products and charging themselves are app work):

- Two free delivered Cora lists. A card is collected at sign-up. Monthly users are charged with the third list. One-at-a-time users are charged only when they order a list.
- Only a list actually delivered counts as a free run. A trial with no first list within 21 days of sign-up closes without a charge.
- No refunds. Cancel any time in one click.
- HST and other applicable tax is charged. Prices are shown before tax.
- Everyone starts as a contributor. The US$400 (CA$560) monthly rate is not offered as a plan on the public site; it applies after two missed weeks in a month, or when a user switches sharing off in the dashboard. [Nov 21, 1:32 PM ET, 0.2]

**Sign-in** (app, but linked from the header): email link, plus "Sign in with Google." No passwords. [Nov 21, 1:32 PM ET, 0.2]

**Feature flag.** Add `siteConfig.flags.v3Mode = true`. With it on, the header, footer, homepage, sitemap, and robots serve v3. With it off, the site returns to the Circles preview. `circlesMode` stays in the code and is ignored while `v3Mode` is on. Unlisted pages render exactly as before. With `v3Mode` on, no page in the header, footer, homepage, or sitemap links to a Circles page or an old offer; each of those URLs still loads and carries noindex. `/apply` redirects to `/start`. [Nov 21, 1:32 PM ET, 0.6 and A.16]

**Forms.** Follow the existing server-action pattern in `src/app/library-actions.ts` (`saveLead`, `saveWatch`): honeypot field, trimmed inputs, a clear message when the database is not configured. [Nov 21, 1:32 PM ET, 0.5]

**Analytics.** No new analytics product is specified in the emails. Existing privacy-policy passages on the library, watches, and analytics are to be kept as they are. [Nov 21, 1:32 PM ET, A.13]

**CMS.** There is no separate CMS named in the emails. Editable marketing content lives in the existing app admin and data files: testimonials (per-quote cleared switch and position), `v3.*` settings, the published setup file, the sample play chosen in the admin, and legal text in `src/data/legal.ts` and copy in `src/data/v3-copy.ts`. [Nov 21, 1:32 PM ET]

**Go-live.** meetroger.ai goes live with the new site on November 30. Preview URLs are fine until then. [Nov 21, 1:08 PM ET; Nov 21, 5:50 PM ET]

---

## Tech, hosting and build approach

James is building in the existing meetroger.ai codebase, not a separate site. [Nov 21, 1:32 PM ET, 0.5–0.6; Nov 21, 5:50 PM ET]

- **Repo:** `MeetRogerAI/roger`, branch from `main`. The v3 design spec was written against `main` at the merge of pull request 20, as of November 21, 2026. Pull before branching. Read `AGENTS.md` first. This Next.js version has breaking changes; check `node_modules/next/dist/docs/` before writing code.
- **Stack:** Next.js 16.4.1 App Router with Cache Components, React 19.3, Tailwind 4, TypeScript, Neon Postgres over HTTP (`src/lib/db.ts`), Resend through its REST API (`src/lib/email.ts`), Vercel Cron (`vercel.json`), the AI SDK through the Vercel AI Gateway, zod.
- **Hosting implied by the codebase and legal text:** Vercel, with Neon, Resend, Stripe, and Google as other services.
- **Design tokens:** all in `src/app/globals.css`.
- **Ownership by path,** so James and Peter rarely touch the same file. Marketing owns the public routes listed in 0.6, plus `src/components/v3/`, `src/components/site-header.tsx`, `src/components/site-footer.tsx`, `src/data/v3-copy.ts`, `src/data/legal.ts`, sitemap, robots, and the Open Graph image. Shared files (`globals.css`, `config.ts`, `layout.tsx`) change only by small agreed pull requests. The app under `/app/`, `/start`, `/signin`, billing, Zack/Cora jobs, and admin is Peter's.
- **Acceptance checks** are listed in A.16 of the v3 design spec, including `npm run build` and `npm run lint` passing, keyboard and reduced-motion behaviour, no income claims, no user counts or hard-coded numbers, no brokerage name, monthly marked as the choice, no non-contributor plan on the public site, and the "AI agent" wording rule.
- James's own examples of his work are at https://jamescamarota.com. [Nov 19, 6:43 PM ET]

The v3 design spec estimates the public site (version A1) at about 12.5 half-days of build before review and testing, plus about 2 half-days later for version A2 proof once it exists. That estimate is in the attached spec; James's commercial agreement is the $1,500 fixed fee and the November 30 date, not that hour count. [Nov 21, 1:32 PM ET, A.15; Nov 21, 11:32 AM ET and later payment emails]

---

## SEO

Only the following is specified in the emails and attachments:

- When `v3Mode` is on, the sitemap lists `/`, `/agents`, `/pricing`, `/how-it-works`, `/faq`, `/about`, `/zack`, `/library`, `/getstarted`, `/privacy`, and `/terms`.
- Robots disallows the hidden paths, `/app`, `/admin`, `/start`, and `/api`.
- Hidden legacy routes stay noindex, with no links to them.
- Old Circles URLs still load and carry noindex.
- A social card is part of the marketing build (`src/app/opengraph-image.tsx`).
- Unlisted partner pages (`/rlpsignature`, `/rlp`, `/hampton`, `/founders`, `/for/[slug]`) stay unchanged.

No keyword list, title-tag formula, or blog plan is stated in the emails. [Nov 21, 1:32 PM ET, A.2, 0.6, A.15, A.16]

---

## Timeline, milestones, owners and budget

**Budget for this marketing site.** James's fee is US$1,500, paid 50/50: $750 upfront and $750 when the site is done. Peter had first asked for three $500 phases; James proposed 50/50 while still building in phases so there was room to adjust as Roger evolved; Peter agreed, "for high standards and speed too." Peter paid the $750 upfront on November 22, 2026, via the Stripe checkout James sent, and asked to be told when there was something to look at. [Nov 19, 6:43 PM ET; Nov 20, 11:30 AM ET; Nov 20, 2:50 PM ET; Nov 21, 11:32 AM ET; Nov 21, 12:37 PM ET; Nov 21, 1:08 PM ET; Nov 21, 5:50 PM ET; Nov 22, 9:11 AM ET]

**Owners.**

- James Camarota: public marketing website (Part A).
- Peter Kuperman: application website (Part B), also aiming for about November 30.
- Peter and Ehab are both admins with the same access (app side).
- A December 1, 2026 meeting with a real estate agent distribution partner is the external deadline the site must be ready for. [Nov 21, 11:32 AM ET; Nov 21, 1:32 PM ET, 0.6]

**Build phases James proposed, and Peter did not change** [Nov 21, 12:37 PM ET]:

- **Phase 1, Nov 21–23:** page structure, headlines, and a first look at the scroll story, including the lego compounding from week 3 to week 26.
- **Phase 2, Nov 24–26:** build the full page, the sample Cora report, simple pricing, and the CTAs.
- **Phase 3, Nov 27–30:** polish it to the level of the three reference sites and get it live on meetroger.ai on November 30, with preview URLs until then.

James said he could not jump on a call the weekend of November 21–22, and would keep moving from the written plan. [Nov 21, 12:37 PM ET]

---

## Open questions and decisions still needed

These were left open in the emails, or are still marked as needed from Peter in the attached v3 design spec. They are not invented requirements.

1. **Logo and brand files.** Still missing. The chef's hat is a placeholder. Peter leans toward a magnifying glass (detective work) and a brand of mastery and excellence. No final mark was chosen in the thread. [Nov 21, 1:08 PM ET]

2. **Peter's `/about` letter.** Needs a v3 edit; the approved text still mentions Circles and applications. Until then, show only the paragraphs that are still true. Headshot (`public/media/peter.jpg`) and signature (`public/media/peter-signature.svg`) were still needed, with fallbacks if they are missing. [Nov 21, 1:32 PM ET, A.10 and "Needed from Peter"]

3. **Testimonials.** Keep the section off until quotes that mention Cora are cleared. Attribution (role and city) still needed, plus a quote from Grace, per the attached spec. Strategy v3.1 notes that existing quotes praise Grok Bot and Peter's setup help, and that none yet credits Roger or Cora by name; Ken's strongest line is a time-saved claim, which marketing rules exclude. The brokerage is not named in public material. [Nov 21, 11:32 AM ET, Strategy v3.1; Nov 21, 12:37 PM ET; Nov 21, 1:08 PM ET; Nov 21, 1:32 PM ET]

4. **Time-saved and income language — do not put these into the site as Roger's claims.** Standing rule for Roger materials: no income claims and no time-saved promises. The attached v3 design spec already agrees that Roger makes no income claims and no time-saved promises in its own voice, and that a named user's own words in a cleared testimonial may include time saved, but the same figure must not be restated as Roger's claim. Several source materials still contain time-saved figures that must not be copied onto the marketing site in Roger's voice:
   - The forwarded report Peter sent as a sample (Christopher Marinakos, November 17) includes lines such as "saving about an hour a day," "saved about 38 minutes per sweep," and "estimated 30 to 40 minutes saved per meeting." James is to turn this into a cleaner sample with names removed; those time figures should not be restated as Roger's promises.
   - The Monday Morning Playbooks v1.0 prototype is built around "time savings" tiles, "hours saved" scores, and lines such as "Your time savings: ~X hrs / week."
   - Section 0.7 of the v3 design spec describes an idea-card time line and tiles for hours a week and minutes saved, labelled as estimates from other users' runs. Whether any of that belongs on the public sample card is still a decision for Peter, because it can read as a time-saved promise even if it is labelled an estimate.
   The compounding section already has a hard rule: "No numbers about time or money." [Nov 21, 1:08 PM ET; Nov 21, 1:32 PM ET, 0.3, 0.4, 0.7, A.5]

5. **Animated scroll story versus a static graph.** Peter and James first agreed on a scroll-driven story, in the spirit of the three reference sites, that animates week 1, week 2, week 3, then week 26. The later spec describes "a static version of the 26-week graph" and one sentence. James then said he would start the scroll story from the spec and make the pages better than a straight build. Confirm that he may animate the compounding section, without adding time or money numbers. [Nov 20, 9:18 AM ET through Nov 21, 5:50 PM ET]

6. **Privacy and terms.** Drafts need Peter's read before launch, including the model provider's position on training. [Nov 21, 1:32 PM ET, "Needed from Peter"]

7. **Demo video and the "one real week" example** are version A2, once they exist, and are not in the November 30 marketing scope unless Peter later says otherwise. [Nov 21, 1:32 PM ET, A.15]

8. **Items that block the app more than the marketing pages,** still listed as needed from Peter in the attached spec: Zack 2.0 and Cora 2.0 documents, the fixed category list, tax registration in Stripe and advice on charging US customers, Google sign-in credentials, the starter setup file, and Vercel keys and Stripe prices. [Nov 21, 1:32 PM ET, "Needed from Peter"]

9. **No preview was in the inbox yet.** On November 22 Peter wrote "Paid. Let me know when there is something to look at." On November 24 he sent the two X links. There is no later email from James in this inbox confirming a preview URL.

---

## Source emails

All mail involving James Camarota in pkuperman@gmail.com is a single thread, subject "Your new site" (replies: "Re: Your new site"). Address: james.m.camarota@gmail.com. Twelve messages, November 19–24, 2026, America/Toronto (ET). No other threads were found (searches: Camarota, james.m.camarota@gmail.com, "james camarota", jamescamarota, including spam and trash).

| # | Date (ET) | From | Subject | Attachments or notable links |
|---|---|---|---|---|
| 1 | Thu Nov 19, 2026, 6:43 PM ET | james camarota \<james.m.camarota@gmail.com\> | Your new site | https://jamescamarota.com; offer to build a site for $1,500 |
| 2 | Thu Nov 19, 2026, 7:11 PM ET | Peter Kuperman \<pkuperman@gmail.com\> | Re: Your new site | Compounding Zack/Cora loop; early pricing of $100 a run or $200 a month |
| 3 | Fri Nov 20, 2026, 9:18 AM ET | james camarota | Re: Your new site | Proposed hero, scroll story, sample Cora report, simple pricing, CTA and FAQ |
| 4 | Fri Nov 20, 2026, 11:30 AM ET | Peter Kuperman | Re: Your new site | Reference sites theacademysf.com, earth-ai.com, maticrobots.com; lego compounding through week 26; three $500 phases; shared Roger folder (Founder's School confidentiality); Google Drive folder https://drive.google.com/drive/folders/1NMpacyKF6Rd2SU6Ak28VBYr-LmdpDBv4 |
| 5 | Fri Nov 20, 2026, 2:50 PM ET | james camarota | Re: Your new site | Agreed visual direction; proposed $750 / $750 |
| 6 | Sat Nov 21, 2026, 11:32 AM ET | Peter Kuperman | Re: Your new site | Agreed $750 / $750 and Nov 30 deadline; attached *Roger-Strategy-v3.1.md* and *Roger-Strategy-v3.1.pdf* |
| 7 | Sat Nov 21, 2026, 12:37 PM ET | james camarota | Re: Your new site | Phase plan; proposed two free runs then $200 / $100; five questions |
| 8 | Sat Nov 21, 2026, 1:08 PM ET | Peter Kuperman | Re: Your new site | Answers on go-live, CAD/USD prices, brand, testimonials; forwarded sample report; attached *Monday Morning Playbooks v1.0 Nov 14.html* |
| 9 | Sat Nov 21, 2026, 1:32 PM ET | Peter Kuperman | Re: Your new site | "Final word for this build"; attached *Roger v3 - design spec.md* |
| 10 | Sat Nov 21, 2026, 5:50 PM ET | james camarota | Re: Your new site | Accepted the v3 design spec as the marketing brief; Stripe checkout for the $750 upfront; confirmed CTA line, prices, Nov 30 go-live, preview URLs, existing design system |
| 11 | Sun Nov 22, 2026, 9:11 AM ET | Peter Kuperman | Re: Your new site | "Paid. Let me know when there is something to look at." |
| 12 | Tue Nov 24, 2026, 7:02 AM ET | Peter Kuperman | Re: Your new site | Two X posts and screenshots: *HPQHenzawAA2tTL.png*, *HTlmHANbAAAAHmp.png* |

Copies of the attachments are saved under `/workspace/website-spec/attachments/`. No Figma links appeared in the thread. The only Google Doc/Drive link in the bodies is the folder in email 4, which Peter offered as a Cora prompt for James to try, not as a page on the site.
