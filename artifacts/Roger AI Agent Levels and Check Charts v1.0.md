# Roger AI Agent Levels and Check Charts v1.0

Version 1.0 · November 25, 2026 · Roger (meetroger.ai) · Draft for Peter's approval
Folder: `AI Agent Setup Levels/` · Companion file: `Roger Levels Build Spec - Zack 2.1, Cora 2.1 and Dashboard v1.0.md` (how Zack, Cora and the dashboard implement these levels)

Labels used throughout, as in Strategy v3.1: **Decided** means Peter settled it in the November 25 interview. **Recommendation** means proposed here and not yet approved. **Estimate** means planning math.

---

## 0. What this is

Ten levels, 0 to 9, that place every person (prospect or user, work or home) by what their AI agent system **actually does**, plus a binary **check chart** for each level-up. Roger audits the check chart from Zack runs. Cora reads the check chart to choose the three ideas that move a user up next.

### Decisions this document rests on (Decided, Nov 25)

| # | Decision |
|---|---|
| D1 | This system is called **Levels**. The 26-week brick-graph colour cycle in the design spec is renamed **Seasons** (Season 1 to 5). `--color-level-1…5` becomes `--color-season-1…5`; the Wednesday stats email shows both Level and Season. |
| D2 | Prospects and users can sit anywhere from 0 to 9. Placement comes from how the system is actually used, not from what onboarding was meant to set up. A prospect can arrive at Level 8. |
| D3 | Levels measure **what the system does**. Check items are written as "I…" statements, but each is marked Zack-verified or self-reported. A level cannot be earned on self-reported items alone. |
| D4 | **Core plus electives.** A level is earned when every core item for it (and for every level below it) is a 1, and at least **70%** of its electives are a 1. Any 0 below the user's level is a **gap**. |
| D5 | **Every domain counts**: work, home, family, money, health admin. A home run as an autonomous organization can reach Level 7. |
| D6 | **A level never drops.** It is earned and permanent, like riding a bicycle. The **check chart stays live**: each item shows its current 0 or 1 from recent Zack runs, and Cora reads the live chart. |
| D7 | **Guardrails are core items at every level from 1 up.** You cannot level up on capability while skipping safety. |
| D8 | The top two levels are **8 Self-evolving** and **9 Multiplier**. |
| D9 | The deliverable is Markdown. Levels and check charts live in this file; the implementation lives in `Roger Levels Build Spec - Zack 2.1, Cora 2.1 and Dashboard v1.0.md`. Zack and Cora move to 2.1. |
| D10 | Design skill is included as **electives, never core** (section 5). |

### How it was made

From the interview on November 25, Strategy v3.1, the v3 design spec, Cora 2.0 and Roger Install v1.0, Zack 1.9, and a full read of about 25 of the bookmarked posts. The reading order was: the leveling frameworks first, then the most-bookmarked and most-viewed, then the last 30 days. Reading stopped when new posts repeated mechanics already captured. Section 6 lists every source and what it contributed.

---

## 1. The ten levels at a glance

| Lvl | Name | What the system does | Your role |
|---|---|---|---|
| 0 | **Non-user** | Nothing. No AI use in the last 4 weeks. | Doing everything yourself |
| 1 | **Asker** | Answers one-off questions and drafts, starting from zero each time. | Asking |
| 2 | **Context-giver** | Knows who you are: instructions, memory, projects, your voice. Still only produces text you carry by hand. | Briefing and copying |
| 3 | **Delegator** | A named agent owns a job, reads your real sources (email, calendar, files), and finishes multi-step work. Anything that sends waits for you. | Approving |
| 4 | **Automator** | Work starts without you: routines on a schedule or trigger, built from saved skills, each reporting back with a receipt. | Reading receipts |
| 5 | **Team builder** | Several narrow agents and a coordinator that routes work between them. You stop being the go-between. | Managing one coordinator |
| 6 | **Operator** | Jobs earn the right to act on their own through a trust ladder. The system is reviewed weekly, kept clean, and recoverable. | Promoting, demoting, reviewing |
| 7 | **Autonomous organization** | Whole domains (a business function or a household area) run end to end. The system starts work unasked, and other people are served by your agents directly. | Handling exceptions and decisions |
| 8 | **Self-evolving** | The system finds its own failures, tests them, proposes and builds its own new agents and skills, and retires what isn't used. | Approving changes to the system |
| 9 | **Multiplier** | You build agent systems that other people run in their own lives, and your plays are installed and kept by others. | Building for others |

### The four questions behind each level

Adapted from Ann Miura-Ko's autonomy levels, rewritten for a person's system rather than a company.

| Lvl | What can it **see**? | What can it **do**? | Who **starts** the work? | Who else is **served**? |
|---|---|---|---|---|
| 0–1 | What you paste in | Answer | You, every time | Only you |
| 2 | Your standing context | Draft in your voice | You | Only you |
| 3 | Your real sources | Finish a job; stage actions | You | Only you |
| 4 | Sources, on a clock | Run jobs unprompted | A schedule or trigger | Only you |
| 5 | Shared work state | Hand work agent to agent | A coordinator | Only you |
| 6 | Its own track record | Act alone where trust is earned | The system, within rules | Only you |
| 7 | A whole domain | Run the domain | The system notices and starts | Others, directly |
| 8 | Its own failures and gaps | Change itself | The system, including on its own design | Others |
| 9 | Other people's lives | Run other people's systems | Other people, on systems you built | Many people |

### Hard test and false positive for each level

In each level's chart, the **hard test** is the one question that settles the level. The **false positive** is the most common way people think they've reached it when they haven't.

| Lvl | Hard test | Common false positive |
|---|---|---|
| 1 | Did you use AI for a real task of yours in the last 4 weeks? | "I tried ChatGPT once." |
| 2 | Could you start a new chat today without re-explaining who you are? | Long prompts typed fresh every time. |
| 3 | Did an agent finish something end to end last week, from your real data, with nothing sent without your yes? | An agent platform installed and then never used: the #1 complaint across agent guides. |
| 4 | What did your system do this week that you didn't ask for that day? | A schedule that runs but whose output nobody reads. |
| 5 | When did one of your agents last hand work to another without you copying it across? | Ten bots created on day one: ten places for context to go missing. |
| 6 | Name one job that acts on its own today, and say what it took to earn that. | Agent sprawl: a hundred brittle automations, none reviewed. |
| 7 | What did your system notice, decide, and handle in the last month without you starting it? | Claimed autonomy: "passive income bots" that in fact need approval for every send, or routines where a human still does all the noticing. |
| 8 | Show a change to your system that the system proposed itself, and the test that proved it worked. | A human tinkering every weekend, described as "self-improving." |
| 9 | Who uses a system you built, without you, every week? | Sharing a prompt on X. |

---

## 2. Rules of the system

### 2.1 Items and verification

Each check item is binary (0 or 1) and carries one verification code:

| Code | Meaning | Strength |
|---|---|---|
| **ZI** | Zack inventory: the agent account's list of agents, skills, routines, connections, memory/profile files and rules | Strong |
| **ZA** | Zack activity: seen in the 7 days of the agent account's own activity that Zack reads | Strong |
| **ZH** | Zack history: computed by Roger across a user's past Zack runs (for example "promoted after 5 clean runs", "retired a routine") | Strong |
| **R** | Roger's own data: leaderboard adoption, referrals, CRM, Cora idea status | Strong |
| **S** | Self-reported: Zack asks the question once and re-confirms only when it is the last blocker for a level | Weak |

Rule (from D3): **every level has at least three core items that are ZI, ZA, ZH or R.** Self-reported core items still count, but a level can never be earned on them alone. This holds for every level below. The one exception is a prospect's provisional level from the sign-up quiz (2.5), which the first Zack run replaces.

### 2.2 Evidence window (Recommendation)

Zack sees 7 days at a time, so a monthly routine or a busy week looks like a 0 in any single run. An item counts as **1 when the evidence appears in the current Zack run or any of the previous three**, or when an inventory item exists and ran on its own cadence (a monthly routine with a run inside 5 weeks counts).

### 2.3 Earning a level (Decided: D4, D6)

A user's **Level** is the highest L for which:

1. every **core** item for Levels 1 through L is a 1, and
2. at least **70%** of the **standard electives** for each of Levels 1 through L are a 1.

Once earned, a Level is permanent (D6). It is recomputed after every Zack run and can only go up.

**Craft electives** (design, section 5) count toward the 70% when met and are never counted against a user when unmet (Recommendation: this keeps design optional, as D10 asks).

### 2.4 The live chart, gaps and Cora (Decided: D6; mechanics are a Recommendation)

- Every item shows its **live state** from the latest window, whatever the user's Level.
- A **gap** is any live 0 at or below the user's Level. A **core gap** means something the Level was earned on has stopped running.
- The **next level** is L+1. Its open core items are the main path up.

Cora reads, in this order: core gaps, then next-level core items, then elective gaps, then next-level electives (build spec, section 2).

### 2.5 Prospects with no Zack run yet (Recommendation)

The sign-up quiz (R6a) asks up to 12 questions, drawn from the core items of Levels 1 to 7, and assigns a **provisional level**. The provisional level is shown as "about Level N" and is replaced by the first Zack run's result. It never blocks sign-up (consistent with the design spec's "the quiz routes, never blocks"). A prospect who self-reports Level 7 or above is flagged to the Roger team for a call: they are both the best-value Cora users and the most likely Multipliers.

### 2.6 More than one agent platform

Zack runs per agent account. A user with Grok Bot for work and Claude at home needs Zack on both. Recommendation: an item is 1 if **any** of the user's Zack runs shows it, and the level is computed across all of them. Open question 1 in the build spec.

---

## 3. The check charts

Item IDs are `N.xx`, where **N is the level the item unlocks**. So "Check chart to reach Level 4" is the list a Level 3 user works through. **C** = core, **E** = standard elective, **D** = design craft elective.

The Zack 2.1 evidence behind each verification code is defined in the build spec, section 1.

---

### Check chart to reach Level 1: Asker
*For a Level 0 person. Hard test: did you use AI for a real task of yours in the last 4 weeks?*

| ID | Statement | Type | Verified |
|---|---|---|---|
| 1.01 | I have my own account with at least one AI assistant (ChatGPT, Claude, Grok, Gemini or similar). | C | ZI |
| 1.02 | I used AI at least once in the last 4 weeks. | C | ZA |
| 1.03 | I used AI for a real task of mine (an email, a summary, a plan, a question I needed answered), not just to test it. | C | ZA |
| 1.04 | **Guardrail:** I never paste passwords, card or bank numbers, or government ID numbers into an AI chat. | C | S |
| 1.05 | **Guardrail:** I know AI can be confidently wrong, and I check any fact, figure or name that matters before I rely on it or send it. | C | S |
| 1.06 | I've used AI on my phone. | E | ZA |
| 1.07 | I've used AI by voice at least once. | E | ZA |
| 1.08 | I've asked AI to explain something I didn't understand, then asked follow-up questions. | E | ZA |
| 1.09 | I've used AI for something at home or in my personal life, not only work (or the reverse). | E | ZA |
| 1.10 | I've used AI for at least 3 different kinds of task (writing, research, planning, analysis, ideas). | E | ZA |
| 1.11 | I've asked AI for sources and opened at least one to check it. | E | ZA |
| 1.D1 | I've had AI make something visual: an image, a slide, a simple page. | D | ZA |

---

### Check chart to reach Level 2: Context-giver
*For a Level 1 Asker. Hard test: could you start a new chat today without re-explaining who you are?*

| ID | Statement | Type | Verified |
|---|---|---|---|
| 2.01 | I use AI on at least 3 days a week. | C | ZA |
| 2.02 | My AI has standing context about me (custom instructions, a profile, memory, or a project with my files), so I don't re-explain who I am each time. | C | ZI |
| 2.03 | I have at least one saved prompt, template, project or skill that I reuse for a recurring task. | C | ZI |
| 2.04 | When I ask for something, I say who it's for, what "done" looks like, and the format I want. | C | ZA |
| 2.05 | **Guardrail:** I have a rule for what never goes into AI (client private data, other people's ID or health details), and I follow it. | C | S |
| 2.06 | My AI drafts in my voice, from an instruction or skill built from my own writing. | E | ZI |
| 2.07 | I've given AI my own documents or files to work from. | E | ZA |
| 2.08 | I've had AI interview me, one question at a time, before it produced something. | E | ZA |
| 2.09 | I use voice for at least one AI task a week (dictating, brain-dumping). | E | ZA |
| 2.10 | I've corrected the AI's standing instructions or memory after it got something about me wrong. | E | ZH |
| 2.11 | I've used AI for a longer job in stages (outline, then sections, then review), not in one shot. | E | ZA |
| 2.12 | I've compared two AI tools or models on the same task and picked one on purpose. | E | S |
| 2.D1 | I've iterated on a visual with AI for at least 3 rounds (an image, slide or page). | D | ZA |
| 2.D2 | I've given AI examples I like (screenshots, links) to steer the look of something. | D | ZA |

---

### Check chart to reach Level 3: Delegator
*For a Level 2 Context-giver. Hard test: did an agent finish something end to end last week, from your real data, with nothing sent without your yes?*

| ID | Statement | Type | Verified |
|---|---|---|---|
| 3.01 | I have an agent platform account (an AI that uses tools and its own computer or browser, such as Grok Bot, Claude with Cowork, Hark, Duet or OpenClaw). | C | ZI |
| 3.02 | At least one named agent has a written job: what it **owns**, what it works **from**, what it **may** do alone, what it **must ask** before, and when the job is **done**. | C | ZI |
| 3.03 | My agent reads at least one source of truth directly (email, calendar, documents, CRM, bank or listing data) instead of me pasting things in. | C | ZI |
| 3.04 | In the last week, my agent finished a multi-step job end to end and came back with a finished result, not instructions for me. | C | ZA |
| 3.05 | **Guardrail:** My agent has written DO / ASK / STOP rules, and anything that sends, posts, books, buys or deletes waits for my yes. | C | ZI |
| 3.06 | **Guardrail:** When my agent hits a login, I sign in inside its session or use the platform's secure vault. I never paste a password into the chat. | C | S |
| 3.07 | **Guardrail:** My agent has a "when unsure, stop and ask" rule. | C | ZI |
| 3.08 | Before the first real run of a new job, I had the agent walk me through its plan in text and corrected it. | E | ZA |
| 3.09 | My agent's "done" is a checkable list (counts, fields, deadlines), not words like "useful" or "thorough". | E | ZI |
| 3.10 | My agent returns evidence with its work: a source for each number, what it guessed, what it skipped. | E | ZA |
| 3.11 | My agent is connected to 3 or more sources of truth. | E | ZI |
| 3.12 | I've delegated a job by voice note or call, away from my desk. | E | ZA |
| 3.13 | My agent has done a job inside a website or tool that has no connector, using its own browser. | E | ZA |
| 3.14 | My agent stages the safe 90% of a job and parks only the irreversible step ("drafted 10, sent 0"). | E | ZA |
| 3.15 | I've handed my agent a personal or household errand (a refund, a booking, a comparison, a renewal), not only work. | E | ZA |
| 3.16 | I gave the agent a goal to be responsible for, not just a list of steps. | E | ZI |
| 3.D1 | My agent has built a working page, deck or document layout from my brief, and I iterated on it. | D | ZA |

---

### Check chart to reach Level 4: Automator
*For a Level 3 Delegator. Hard test: what did your system do this week that you didn't ask for that day?*

| ID | Statement | Type | Verified |
|---|---|---|---|
| 4.01 | At least one routine runs on a schedule or a trigger without me prompting it, and it ran inside its cadence. | C | ZI |
| 4.02 | At least one reusable skill is saved (steps, decision rules, output shape, and the line it may not cross), and a routine or agent uses it. | C | ZI |
| 4.03 | Every routine I run was done by hand with the agent at least once and fixed before I scheduled it. | C | S |
| 4.04 | Each routine reports a result with a receipt (what it did, what it didn't, what needs me), and says "nothing today" rather than inventing an update. | C | ZA |
| 4.05 | **Guardrail:** Each routine stops and reports when its source is missing, stale or behind a login, and never reuses old data as if it were new. | C | ZI |
| 4.06 | **Guardrail:** Each routine has a retry limit: after the same error twice it stops and tells me what's blocking it. | C | ZI |
| 4.07 | I have 3 or more active routines. | E | ZI |
| 4.08 | At least one routine fires on an event (a new email, message, form or file), not only on a clock. | E | ZI |
| 4.09 | I have a fast lane and a slow lane: at least one routine runs daily or more often and one weekly or less often. | E | ZI |
| 4.10 | Routine results reach me where I already am (phone notification, text, email, Slack). I don't open the agent to look. | E | ZI |
| 4.11 | At least one routine covers a home or personal domain. | E | ZI |
| 4.12 | I've installed a skill or agent someone else made (marketplace, a colleague, a Roger idea) and adapted it to me. | E | ZI |
| 4.13 | I've given my agent a new capability through an API key or plugin, entered through the platform's secure form. | E | ZI |
| 4.14 | I've slowed down or removed a routine because it wasn't worth what it cost. | E | ZH |
| 4.15 | I know how much my agents used this week, and I checked in the last 4 weeks. | E | S |
| 4.16 | A routine has an end condition and stops itself when the job is done (for example, "stop checking once the package arrives"). | E | ZI |
| 4.D1 | Before building something visual, I had an agent generate 4 or more genuinely different directions (images or mockups), including at least one "go wild" version. | D | ZA |

---

### Check chart to reach Level 5: Team builder
*For a Level 4 Automator. Hard test: when did one of your agents last hand work to another without you copying it across?*

| ID | Statement | Type | Verified |
|---|---|---|---|
| 5.01 | I run 3 or more named agents, each with one job I can state in one sentence. | C | ZI |
| 5.02 | One agent (a chief of staff or coordinator) tracks what's outstanding, routes work to the others, and brings decisions to me. | C | ZI |
| 5.03 | In the last 4 weeks one agent handed work to another directly, without me copying output between them. | C | ZA |
| 5.04 | My agents share a record of ongoing work (project pages, a shared doc or ledger, shared memory) that they read before working and update after. | C | ZI |
| 5.05 | **Guardrail:** Each agent is connected only to what its job needs. No agent holds every connection "just in case". | C | ZI |
| 5.06 | **Guardrail:** I know agents on one account share the same computer and logins. Any job that needs a different level of trust runs on a separate account or environment. | C | S |
| 5.07 | I added each new agent because a job kept coming back or one agent got overloaded, not all on day one. | E | ZH |
| 5.08 | Agents pass a compact handoff (objective, artifacts, decisions made, constraints, open questions, next gate), not whole transcripts. | E | ZI |
| 5.09 | A separate checker agent or step reviews work before it reaches me, so the builder is not its own checker. | E | ZI |
| 5.10 | I mostly talk to my coordinator, not to each agent. | E | ZA |
| 5.11 | I run 6 or more agents across at least 3 lanes (for example work, money, home). | E | ZI |
| 5.12 | At least one agent owns a home or family area. | E | ZI |
| 5.13 | A "bot round" routine checks every agent for stuck work at least once a weekday. | E | ZI |
| 5.14 | My agents keep a live page or dashboard that I check instead of asking them. | E | ZI |
| 5.15 | **Usage:** Agents message each other only when they need something, batch updates, and send no thank-you or acknowledgement replies. | E | ZI |
| 5.16 | Simple agents run on cheaper or smaller models and heavy ones on stronger models, chosen on purpose. | E | ZI |
| 5.D1 | An agent built me a design "playground" or jig (live controls for colours, fonts, spacing or motion), and I used it to settle a design. | D | ZA |

---

### Check chart to reach Level 6: Operator
*For a Level 5 Team builder. Hard test: name one job that acts on its own today, and say what it took to earn that.*

| ID | Statement | Type | Verified |
|---|---|---|---|
| 6.01 | Each agent has a recorded autonomy level: observes, prepares, acts with approval, runs on schedule, coordinates, or acts on its own. | C | ZI |
| 6.02 | At least one job was promoted from approval to acting on its own after a run of clean results (Recommendation: 5 in a row, with one undo tested), and I can name it. | C | ZH |
| 6.03 | A weekly receipt covers every routine: runs, passes, human repairs, repeated failures, and a keep, fix or fire call. | C | ZI |
| 6.04 | When output is wrong, I fix the rule, skill or handoff that caused it, then re-run to confirm. I don't just fix the output. | C | ZH |
| 6.05 | **Guardrail:** An approval log shows what was parked for me and what went out. Something was actually parked in the last 4 weeks (if nothing ever parks, the rule is decorative). | C | ZA |
| 6.06 | **Guardrail:** Every agent that reads outside content (emails, web pages, documents) treats it as data, not instructions, and quotes any embedded instructions to me instead of following them. | C | ZI |
| 6.07 | **Guardrail:** My setup is recoverable: instructions, skills, routines and key setup are backed up outside the platform, with written steps to restore. | C | S |
| 6.08 | I've demoted or switched off an agent or routine when its quality dropped or something underneath it changed. | E | ZH |
| 6.09 | Memory is cleaned at least monthly: stale, duplicate and contradicting notes are merged or removed with my approval. | E | ZI |
| 6.10 | Standing decisions and rules live as dated one-line entries in a file or decisions log, not scattered in chat memory. | E | ZI |
| 6.11 | A daily heartbeat tells me if a scheduled job didn't run. Silence counts as a failure. | E | ZI |
| 6.12 | I review usage or cost at least monthly and have cut at least one cause (a too-frequent routine, chatty agents, browser instead of connector). | E | ZH |
| 6.13 | I spot-check one finished artifact a week myself, rather than trusting the agent's own summary. | E | S |
| 6.14 | In the last 3 months I reviewed what every agent can reach (files, sessions, logins) and removed what it didn't need. | E | ZH |
| 6.15 | I've deleted a routine that nobody would miss. | E | ZH |
| 6.16 | People my agents serve never see raw errors or system messages. Failures are reported in plain language. | E | ZI |
| 6.17 | A weekly 15-minute review with my coordinator covers repeated corrections, outdated information and what to improve. | E | ZI |
| 6.D1 | My agent compares its finished design work against the chosen mockup with screenshots before showing it to me. | D | ZA |

---

### Check chart to reach Level 7: Autonomous organization
*For a Level 6 Operator. Hard test: what did your system notice, decide and handle in the last month without you starting it?*

A **domain** is a whole area of work or life with its own intake, work, delivery and follow-up. Work examples: listings marketing, lead follow-up, transaction paperwork, bookkeeping, recruiting. Home examples: family logistics (camps, activities, school), meals and groceries, elderly-parent care, medical appointments, money admin (refunds, renewals, claims).

| ID | Statement | Type | Verified |
|---|---|---|---|
| 7.01 | At least one whole domain runs end to end through my agents: intake, work, delivery and follow-up. | C | ZI + S |
| 7.02 | In that domain I'm involved only for exceptions and decisions. Routine cases are handled and logged without me. | C | ZA |
| 7.03 | My system starts work without being asked at least weekly: it notices something (a new message, a change, a deadline, a gap) and acts or proposes. | C | ZA |
| 7.04 | A human-dependency audit runs at least monthly. It finds where work stopped, waited or came back to me, and classifies each case: keep me in, teach, systemise, automate, or escalate only. | C | ZI |
| 7.05 | Other people (team, clients, family) get answers or service from my agents directly, without waiting for me. | C | ZA |
| 7.06 | **Guardrail:** Delegated authority is written down per domain: what it may decide alone, spending limits, and the escalation path when uncertainty or consequence is too high. | C | ZI |
| 7.07 | **Guardrail:** Anything irreversible (money, signing, publishing, deleting, speaking as me to someone new) still needs my yes, given in batches where possible. | C | ZI |
| 7.08 | Two or more domains run this way. | E | ZI + S |
| 7.09 | I capture what's only in my head regularly (a daily or weekly voice brain-dump into a file my agents read). | E | ZI |
| 7.10 | My phone pings only when an agent needs a decision. I don't check on agents to see progress. | E | S |
| 7.11 | A watchdog agent looks across my tools for conflicts, duplicate work and dropped promises. | E | ZI |
| 7.12 | I approve in batches (for example 30 drafts at once), with exceptions separated out, not one item at a time. | E | ZA |
| 7.13 | My agents keep the domain's system of record current (CRM, calendar, ledger) with no manual data entry from me. | E | ZA |
| 7.14 | A weekly domain summary is how I stay on top of it, instead of doing the work. | E | ZI |
| 7.15 | My agents have built at least one tool or data capture (a form, tracker or logging app) to get data they needed. | E | ZA |
| 7.16 | An agent posts, answers or works in a shared channel where other people talk to it directly. | E | ZA |

---

### Check chart to reach Level 8: Self-evolving
*For a Level 7 Autonomous organization. Hard test: show a change to your system that the system proposed itself, and the test that proved it worked.*

| ID | Statement | Type | Verified |
|---|---|---|---|
| 8.01 | My system finds its own failures (from runs, my corrections and outside feedback) and turns each into a test or check it runs again. | C | ZI |
| 8.02 | My system proposes changes to its own setup (a new skill, a changed routine, a new or retired agent) on a schedule. At least one was adopted in the last 4 weeks. | C | ZA + ZH |
| 8.03 | In the last 8 weeks my system designed and built a new agent or skill after it identified the need itself, not because I asked. | C | ZI |
| 8.04 | My system retires or merges agents and routines that aren't used, with my approval. | C | ZH |
| 8.05 | **Guardrail:** Every self-change is logged with how to undo it, and the previous version is kept. | C | ZI |
| 8.06 | **Guardrail:** Self-changes that widen access, add connections or spend money still need my direct yes. A general "go" does not cover them. | C | ZI |
| 8.07 | My coordinator checks new platform features and official guides at least monthly and recommends upgrades. | E | ZI |
| 8.08 | My knowledge base is maintained by agents: they file outputs back, check for stale or contradicting entries, and I rarely edit it by hand. | E | ZI |
| 8.09 | Real-world feedback (reviews, replies, outcomes) flows to my agents automatically and drives their proposals. | E | ZI |
| 8.10 | I track each recurring job's completion rate, interventions, time to an accepted result and cost per result. | E | ZI |
| 8.11 | An "improver" agent whose only job is to make the system better runs at least weekly. | E | ZI |
| 8.12 | A loop runs at least weekly: goal → experiment → metric → keep or discard. | E | ZI |
| 8.13 | My system uses Roger Upgrade Notes (installed, used, changed, skipped) to inform its own proposals. | E | ZI + R |
| 8.14 | My system routes each job to the model that does it best for the cost, and reviews that choice. | E | ZI |

---

### Check chart to reach Level 9: Multiplier
*For a Level 8 Self-evolving system. Hard test: who uses a system you built, without you, every week?*

| ID | Statement | Type | Verified |
|---|---|---|---|
| 9.01 | I built an agent system that another person uses in their own life or work (a partner, parent, colleague, team or client), and they used it in the last 4 weeks. | C | S + ZA |
| 9.02 | That person didn't have to configure it: it lives where they already are (text, phone, email, Slack) and they use it by talking to it. | C | S |
| 9.03 | At least one skill, agent or play I made has been installed and kept in use by someone else (a shared team agent, a marketplace listing, or a Roger play adopted by another user). | C | R |
| 9.04 | **Guardrail:** Each person I build for has their own isolated agent and permissions. My agents can't see their data, and theirs can't see mine, unless they chose to share. | C | S |
| 9.05 | **Guardrail:** The person I built for knows what their agent does alone and what it asks first, and they agreed to it. | C | S |
| 9.06 | A Roger play of mine has been adopted by 3 or more other users. | C | R |
| 9.07 | I've set up agent systems for 3 or more people, or for a whole team or office. | E | S + R |
| 9.08 | I wrote an onboarding (a first message and an interview) so a new person gets value in their first session. | E | S |
| 9.09 | Someone I set up has reached Level 4 or higher themselves. | E | R |
| 9.10 | I maintain shared skills like code: versioned, reviewed, with an owner. | E | ZI |
| 9.11 | My agents and someone else's agents work together across accounts (for example a team agent in a shared channel). | E | ZA |
| 9.12 | I've published a guide or template that other people used. | E | S |

Note: 9.03 and 9.06 make Roger's leaderboard (R9) the proof for Level 9, which keeps the top level from being self-reported. 9.06 is core so that at least three core items are verifiable (9.01's activity part, 9.03, 9.06), meeting rule 2.1.

### Level 9 and beyond

Level 9 is the top. A Level 9 user keeps a live chart (gaps still matter), and Cora sends them gap fixes and the highest-value new plays in the pool. Recommendation: revisit "beyond 9" once three real users hold Level 9.

---

## 4. Item counts

| To reach | Core | Standard electives | 70% needs | Design craft |
|---|---|---|---|---|
| Level 1 | 5 | 6 | 5 | 1 |
| Level 2 | 5 | 7 | 5 | 2 |
| Level 3 | 7 | 9 | 7 | 1 |
| Level 4 | 6 | 10 | 7 | 1 |
| Level 5 | 6 | 10 | 7 | 1 |
| Level 6 | 7 | 10 | 7 | 1 |
| Level 7 | 7 | 9 | 7 | 0 |
| Level 8 | 6 | 8 | 6 | 0 |
| Level 9 | 6 | 6 | 5 | 0 |
| **Total** | **55** | **75** | | **7** |

137 items in all. 70% is rounded up (for example 7 of 10, 5 of 6).

Strict read: 20 of the 137 items rely on self-report, 16 of them entirely. Most are guardrails or Level 9 items, where Zack has no line of sight. They are the weakest part of the system until Zack can see more.

---

## 5. Design craft electives (Decided: D10)

Design is a skill track that runs alongside the levels: elective, never core. It is for users who make anything people look at, such as listing pages, flyers, decks, a personal site or social posts. Each item is in its level's chart with a `D` ID. Together they form a ladder:

| ID | Step | The habit |
|---|---|---|
| 1.D1 | Make something visual | First image, slide or page from AI |
| 2.D1, 2.D2 | Iterate and steer | Three or more rounds; give examples you like |
| 3.D1 | Agent builds it | A working page, deck or layout from your brief |
| 4.D1 | Explore before building | 4–10 genuinely different directions, minimal to outlandish, including "go wild" |
| 5.D1 | Tune live | A playground or jig with live controls |
| 6.D1 | Verify against the target | The agent compares screenshots to the chosen mockup before showing you |

### Reading for the design track

The two posts Peter chose, linked rather than copied: they are the authors' own copyrighted work. Cora links them when a design item is the next step.

**1. Yakko Majuri, "How my vibe coded website looks like a designer made it"** (Aug 10, 2026). https://x.com/yakkomajuri/status/2086868581619581262

His method, in summary:
- Start from inspiration. Keep looking at sites you admire, and use a component you love as a base.
- Have an agent generate many versions of each idea, at least 4 and up to 10. Steer half of them and let the agent "go wild" on the rest.
- Ask for each idea on a spectrum from minimal to outlandish. That tells you whether the concept works at all and how far to push it.
- Expect to throw away almost everything. A rejected early mockup can still supply a part you use later.
- Keep the design in one HTML file until it's nearly done. That makes it fast to fork a version, change one thing, and compare side by side. Never delete the forks.
- Build small "playgrounds" with live controls for colours, fonts and placement, rather than asking an agent for each change.
- Once one strong element sets the style, anchor every new asset to it. In his case the hero set the style for the whole site.
- Iterate a lot. Most iterations are dead ends.

**2. Ben Kamens, "How we built olddogs.ai with lots of agents but zero slop"** (Oct 1, 2026). https://x.com/kamens/status/2105848263505285450

Four techniques, in summary:
- **Draw, then code.** Ask for 5 to 10 genuinely different directions as generated images, not code. Pick and refine, then let the agent build, and have it check its build against the chosen mockup with screenshots. Repeat for each section, feeding screenshots of what's built into the next round.
- **In-app design jig.** A dev-only panel of controls on the real page, added to as you build, that can sync its settings back into the code.
- **Standalone jig.** When a repetitive chore appears (reviewing many images, for example), have the agent build a small tool for it, with an export the agent can read back.
- **Raise the agent's ambitions.** Ask for the most magical thing you can imagine.

The post links a shared agent skill and copy-paste prompts for each step.

---

## 6. Sources and what each contributed

| Post | Contribution |
|---|---|
| Lauren Tan (@poteto), "Automate Anything with Grok Bot", Nov 18, 2026 · https://x.com/poteto/status/2123159537016533493 | Goal versus process; give a bot a goal to own; teach it how you think; let it improve itself from feedback and data it builds tools to capture; routines so you stop being the bottleneck; a bot that designs bots. Items 3.16, 4.01, 7.15, 8.01, 8.09 |
| Ann Miura-Ko (@annimaniac), "Most Companies Are Still Level 1", May 1, 2026 · https://x.com/annimaniac/status/2050225284277026990 | The four questions; a hard test and a false positive per level; agent sprawl and fake autonomy; L5 markers (notices, decides, acts, escalates, learns). Section 1, Levels 6–8 |
| distort (@distortgeekin), "How to Hire Your First AI Employee", Sep 30, 2026 · https://x.com/distortgeekin/status/2105275395901726845 | Five job fields; boring first job; trial in text; probation of three runs; promotion gate and demotion; weekly review; when to hire the second bot. Levels 3–6 |
| Brian Roemmele, "How To Hire A Grok Bot: Experience From The First Zero Human Company", Oct 4, 2026 · https://x.com/BrianRoemmele/status/2106815617466855807 | Per-bot autonomy ladder; five watches (receipt, heartbeat, source check, approval log, doubt line); "a chief of staff only after three specialists have five clean weeks"; bots that propose hires. Items 4.04, 4.05, 6.03, 6.05, 6.11, 5.07, 8.03 |
| Carnage (@0xCarnagee), "The Grok Bot Team's Own Workflow: 11 steps", Aug 19, 2026 · https://x.com/0xCarnagee/status/2090102148344262659 | The bot as a profile file; evidence with every result; chaining skills; fast and slow lanes; "silence is a valid result"; the human as middleware as an anti-pattern; the four-week trust ramp; do-alone and park-for-me lists; untrusted content. Items 3.10, 4.09, 5.03, 6.06 |
| Michael Fenech, first five things, Nov 8, 2026 · https://x.com/Michael_Fenech_/status/2119390223696318874 | One bot with clear ownership; brief for the outcome; connect sources of truth; prove before automating; DO / ASK / STOP. Items 3.02–3.05, 4.03 |
| Michael Fenech, human-dependency audit, Oct 3, 2026 · https://x.com/Michael_Fenech_/status/2106412459645129054 | The monthly audit and its five classifications. Item 7.04 |
| Michael Fenech, memory clean-up, Nov 17, 2026 · https://x.com/Michael_Fenech_/status/2122782073542815773 · and his top-10 list · https://x.com/Michael_Fenech_/status/2118795807537213907 | Over-remembering; save rules, not stories; decisions log; recoverable setup; access audit; weekly huddle; checking new features. Items 6.07, 6.09, 6.10, 6.14, 6.17, 8.07 |
| Seb Goddijn, Ramp Glass, Apr 9, 2026 · https://x.com/sebgoddijn/status/2042285915435937816 | 99% adoption with most people stuck; one person's breakthrough becomes everyone's baseline; a skill marketplace with a guide that recommends by role and tools (a model for Cora). Build spec section 2, Level 9 |
| Mr. Buzzoni, summary of the SpaceXAI CEO-bot PDF, Oct 17, 2026 · https://x.com/Mr_Buzzoni/status/2111523960735105339 | "If the finish can't be proven, it can't be automated"; durable ledger; add a specialist only for its own tools or permissions; verifier before workers. Items 5.04, 5.09 |
| Larsen Cundric, what burns Grok Bot usage, Nov 20, 2026 · https://x.com/larsencc/status/2123891636694298977 | Usage causes from 572 users; stuck loops as the #1 complaint. Items 4.06, 4.15, 5.15, 6.12 |
| Christian Reber, 20-bot setup, Nov 19, 2026 · https://x.com/christianreber/status/2123372221586399660 · and https://interfacecap.com/grok-bot-setup.pdf | Work and life bots under one chief of staff; a bot round for stuck work; approval gates; voice as the main input. Items 5.02, 5.12, 5.13 |
| Kacper Rutkiewicz, 24 bots organized, Nov 9, 2026 · https://x.com/KacperRutk/status/2119820212513993101 | Lanes; one job per bot; add a bot when a job keeps coming back; org-chart self-audit. Items 5.07, 5.11 |
| Founders School, "The Complete Grok Bot Guide: From Beginner to Advanced", Oct 27, 2026 · https://x.com/alpha_founders/status/2115160193763778775 | Its own three levels (delegate admin, upskill and delegate, live in it); interview-first setup; connectors, routines, skills, APIs. Levels 3–5 |
| Allie K. Miller via Greg Isenberg, "do smart things", Aug 12, 2026 · https://x.com/gregisenberg/status/2087703542979014958 | Full context, then let agents decide; teammates talk to her agents directly; an improver agent and a watchdog agent; daily brain-dump. Items 7.05, 7.09, 7.11, 8.11 |
| Cathryn Lavery, building her wife's assistant, Mar 16, 2026 · https://x.com/cathrynlavery/status/2033560884061106603 | The model for Multiplier: the setup took an afternoon, writing down how the other person lives took a week; lives where they already are; isolated per person; reactive, proactive and ambient tasks. Items 9.01, 9.02, 9.04, 9.08 |
| Andrej Karpathy, "LLM Knowledge Bases", Apr 2, 2026 · https://x.com/karpathy/status/2039805659525644595 | A knowledge base the agent maintains and lints; outputs filed back so queries add up. Item 8.08 |
| Gauri Gupta via Aakash Gupta, auto-harness, Apr 2026 · https://x.com/aakashgupta/status/2040279727085396328 | Self-improving loop: find failures, turn them into evals, fix them. Item 8.01 |
| Krista Letz, "Grok Bot for GTM (pt 2)", Nov 5, 2026 · https://x.com/kristaletz/status/2118403026532913650 | Team bots shared like a document; the best bots built by specialists in other teams; proactivity; Pages. Items 7.16, 9.03, 9.11 |
| AI Edge, how Elon Musk and SpaceXSI use Grok Bot, Oct 28, 2026 · https://x.com/aiedge_/status/2115459312994914327 | Current features (Pages, Vault, voice, calls); batch approval; "stop once delivered". Items 3.06, 4.16, 7.12 |
| Ben Lang, have your main bot read the new guides, Oct 6, 2026 · https://x.com/benln/status/2107472129960575369 | Self-upgrade from official guides. Item 8.07 |
| Joanne Chen, "The Great Reorg", Mar 25, 2026 · https://x.com/joannezchen/status/2036835805826879916 | Human roles that remain (systems architect, validator); "are you managing the agents, or are they managing you?" Levels 6–7 |
| Zenith, "Mogul" bot, Nov 17, 2026 · https://x.com/ZenithcoreAi/status/2122907249722986997 | Level 7's false positive: claimed autonomy, corrected by an X community note. |
| Alex Finn, agent use cases, Oct 10, 2026 · https://x.com/AlexFinn/status/2109037099253170600 | People install agents and then do nothing: Level 3's false positive. |
| Danny Postma, Aug 14, 2026 · https://x.com/dannypostma/status/2088181331465253045 | "My phone only pings when an agent needs a decision." Item 7.10 |
| Yakko Majuri, design, Aug 10, 2026 · https://x.com/yakkomajuri/status/2086868581619581262 | Design track (section 5) |
| Ben Kamens, design, Oct 1, 2026 · https://x.com/kamens/status/2105848263505285450 | Design track (section 5) |

---

## 7. Open questions for Peter

1. **Promotion threshold for item 6.02.** Five clean runs in a row with one undo tested (taken from the posts), or a different bar?
2. **Visibility.** Is a user's Level shown on the network leaderboard, or only to the user and the Roger team? Recommendation: private by default, with the user able to show it.
3. **Re-checking self-reported items.** Never, every Season, or only when Zack sees a contradiction? Recommendation: when Zack sees a contradiction, and once a Season for guardrail items.
4. **Level 9 is Roger-verified.** Because 9.06 is core, a Multiplier who arrives from outside sits at Level 8 until three Roger users adopt one of their plays. Keep that, or make 9.06 an elective and accept a Level 9 resting mostly on self-report?
5. **Level names in public.** Use these ten names on meetroger.ai, or keep them internal until real users have been placed?
