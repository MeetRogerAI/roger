# Roger Levels Build Spec: Zack 2.1, Cora 2.1 and Dashboard v1.2

Version 1.2 · November 26, 2026 · Roger (meetroger.ai) · Draft for Peter's approval
Implements: `Roger AI Agent Levels and Check Charts v1.1.md` (the ten levels, rules and check charts). Read that file first; rule and item numbers here (for example rule 2.3, item 7.03) refer to it.
For: the Roger build agents, Claude Code, and whoever edits the Zack and Cora files.

Changes in v1.2: section 3 now places this work in the v3 app build, as Peter decided on November 26. The levels engine is version **B4**, after B3. Two small pieces go into B2. Zack 2.1 ships as content once B1 is live. The original v1/v2/v3 split is replaced.

Changes in v1.1: Zack collects evidence for the 11 new items and 3 rewritten items in the levels file (rows Z7 to Z9 and the new fields marked v1.1), and Cora can use each level's symptom in its reason lines.

Labels, as in Strategy v3.1: **Decided** means Peter settled it. **Recommendation** means proposed here and not yet approved. **Estimate** means planning math.

---

## 1. Zack 2.1: what Zack must collect

Zack 1.9 and 2.0 already read 7 days of the agent account's own activity, the list of skills, routines, bots and connections, and the Roger Upgrade Notes. The private profile (Cora 2.0) is matching-only. Levels need one new block in that private profile, `roger-level`. It never enters the shared pool.

### 1.1 The `roger-level` block (Recommendation)

```
roger-level:
  zack_version: 2.1
  platform: [name]                      # one block per agent account
  inventory:
    agents:                             # one entry per bot/agent
      - name, job_sentence
        fields_present: [owns, inputs, may, must_ask, done_when]
        autonomy: observe | prepare | approve | schedule | coordinate | own
        connections: [service names only]
        created: date
        created_by: me | system | installed   # installed = marketplace, colleague, Roger idea
        rules: [do_ask_stop, stop_when_unsure, untrusted_content, no_raw_errors, usage_rules,
                rules_in_description, general_rule_on_correction, fetch_live_facts, loop_cap]   # v1.1
        role: chat | routines_only | catch_all | coordinator | checker | specialist   # v1.1
        needs_own: [routines, logins, private_context, channel]                      # v1.1, for 6.21
    routines:
      - name, owner_agent, trigger: schedule | event, cadence, last_run
        has: [receipt, nothing_today_rule, source_check, retry_limit, end_condition,
              change_check, away_rule: allow | draft | none, verify_checklist]        # v1.1
        event_scope: narrow | broad                                                   # v1.1, for 4.08
        delivers_to: app | phone | email | text | slack | page
    skills:      [name, origin, used_by]
    memory:      [instructions, profile_file, project_pages, decisions_log, knowledge_base]
    memory_last_cleanup: date | none
    pages_dashboards: count
    models_used: [names]                # model routing
    scripts: count                      # v1.1, deterministic steps run as code (6.19)
  activity_7d:
    active_days
    multi_step_completions
    agent_to_agent_handoffs
    proactive_starts                    # work the system began without a prompt that day
    voice_inputs
    approvals: {parked, approved, batched, sent_after_approval}
    exceptions_escalated
    others_served_directly              # replies or work for other people via the agent
    browser_only_tasks                  # done in a site with no connector
    longest_chat_size, chat_resets      # v1.1, for 6.20
    verify_reports: {pass, fail}        # v1.1, for 4.19
    self_change_proposals: {proposed, adopted}
    design_activity: {directions_generated, iterations, playground_built, screenshot_check}
  history_flags:                        # from Upgrade Notes and past runs
    promotions, demotions, retirements, rule_fixes_after_error, usage_cuts, access_reviews
  self_report:                          # answers to Zack's level questions
    - item: "6.07", answer: 1, date
  domains:                              # user-declared, confirmed by Zack against routines
    - name, kind: work | home, stages_covered: [intake, work, delivery, follow_up]
```

### 1.2 Changes to Zack

| # | Change | Why |
|---|---|---|
| Z1 | Add the `roger-level` block to the private profile. | Gives Roger the evidence for every ZI and ZA item. |
| Z2 | Read the platform's agent definitions, routine settings and rules, and record presence and counts, never content. Connections are recorded by service name only. | Keeps Zack 1.9 security rule 9 (nothing private leaves). |
| Z3 | Classify each run in the 7 days as user-started or system-started. | `proactive_starts` decides 4.01 and 7.03, the hardest items to fake. |
| Z4 | Ask self-report questions only for items with code S, at most 5 per run, and only for the next level's items or for the last blocker. | Keeps the Sunday run short. |
| Z5 | Ask the user once to name their domains, then confirm each domain against routines and agents. | Level 7 needs a domain definition Zack can check. |
| Z6 | Record autonomy level per agent from its rules and its approval behaviour, not from the agent's own description of itself. | An agent's self-description is not evidence. |
| Z7 | For each routine, record which agent hosts it, and whether that agent is one the user chats with. | 5.17: routines on a chatty agent re-read the whole conversation on every run. |
| Z8 | For each routine, record whether it has a change check, a verify checklist, and an away rule (pre-approved action or stop at draft), and whether its event trigger is narrow or broad. | 4.08, 4.17, 4.18, 4.19. |
| Z9 | Record which rules live in each agent's description, as opposed to memory only; the longest chat's size; and the count of chat resets and scripts. Ask 6.22 (spending limit) as a self-report question, because Zack cannot see billing. | 4.20, 6.18 to 6.22. |

### 1.3 Changes to the Roger intake and codebase

| # | Change |
|---|---|
| C1 | Validate the `roger-level` block at intake (design spec B.6). Run the privacy check on it like the rest of the profile. |
| C2 | A level engine: after each Zack run, set every item's live state (window rule 2.2 in the levels file), compute the earned level (levels file rule 2.3, never lower than before), and list gaps and next-level items. |
| C3 | Store per user: `level_earned`, `level_earned_at`, `items[]` with live state and last evidence date, `gaps[]`. |
| C4 | Dashboard: Level number and name, the next level's check chart with live 0s and 1s, gaps flagged at the top, and "how this is checked" per item. Seasons stay on `/app/history` with their new name. |
| C5 | Wednesday stats email: Level, Season, and "1 step from Level N" when only one core item is open. |
| C6 | Operations view (R18): each user's Level and core gaps, so the Roger team can see who has stalled. |
| C7 | Sign-up quiz: provisional level (levels file rule 2.5). |

---

## 2. Cora 2.1: how levels change the three ideas

### 2.1 Every pool play gets level tags (Recommendation)

At intake, each play in the pool is tagged with the check items installing it would turn to 1 (`unlocks: [4.01, 4.04, 4.10]`) and its **entry level**: the lowest level at which a user could install and run it. A review agent proposes the tags and the Roger team approves them, as with R7. All existing seed runs get tagged once.

### 2.2 Choosing the three (Recommendation)

Cora's existing scoring (reach, ease, proof, surprise, hours, and fit) is unchanged. Levels add two rules:

1. **Eligibility.** A play is eligible only if its entry level is at or below the user's Level + 1. Nobody at Level 3 gets a self-evolving loop. Plays that only unlock items the user already has live are excluded, unless they are upgrades (Cora 2.0 change 11).
2. **Slots.** Each Monday's three ideas are filled in order:
   - **Slot 1: fix a gap.** The best play that closes a core gap. If there is no core gap, an elective gap. If there are no gaps, treat it as Slot 2.
   - **Slot 2: next level.** The best play that closes an open core item for Level + 1.
   - **Slot 3: best fit.** The highest Cora score among eligible plays, whichever items it unlocks.

When a user is one core item from the next level, Slots 1 and 2 both target it with different plays. If Peter approves Cora 2.0's recommended cap of one upgrade per list, it still applies.

### 2.3 What each idea says

The reason line (Cora 2.0 change 14) adds the item it moves, written generally: "Closes a step toward Level 5: one agent handing work to another." Recommendation (v1.1): when the user's live chart shows the symptom for their next level, the reason line can name it instead ("For when you're the switchboard passing work between chats"). It never shows the user another user's level.

### 2.4 High-level prospects (levels file D2)

A Level 7 or 8 newcomer is matched only to plays at or near their level, and to upgrades of what they already run. Recommendation: their first Cora run is reviewed by Peter before it goes out. These users are both the strongest proof and the most likely sources of new top-level plays for the pool.

### 2.5 North star check

Adoption stays the north star: 2 of every 3 ideas adopted. Levels add a second measure for the weekly scorecard: **users who earned a new Level this month**, and the median weeks spent at each level. Both are measured, not targets, until there is data.

---

## 3. Where this fits in the v3 build (Decided, November 26, 2026)

Sized in half-days, as Peter plans. These are estimates for Claude Code and agents doing the build, with the Roger team reviewing.

### 3.1 Where the v3 build stands (November 26)

- **A1, the marketing site:** built, merging to main and going live at meetroger.ai on November 26.
- **B1, the paid weekly cycle:** built, not yet live. It already reads the Zack 2.0 `roger-run` block in code, falls back to the model for 1.9-style prose, and asks for consent to "a private matching profile". Open before go-live: Zack 2.0 and Cora 2.0 approval (launch list S1, S2), and three unbuilt Cora 2.0 changes (S20), including change 8, the profile matching that Cora's use of levels depends on.
- **Already built:** sign-up quiz question 5 lets a person pick their level from 0 to 8, using the v1.0 names. Nothing uses the answer yet.

### 3.2 Decisions

| # | Decision |
|---|---|
| T1 | **Nothing in this spec touches B1 before it goes live.** A payment delay costs onboarding cycles before BUZZ (Strategy v3.1, risk 1). |
| T2 | **Zack 2.0 ships as approved, without the `roger-level` block.** The block comes as **Zack 2.1**, a content change, once B1 is live. Zack fetches its instructions fresh at the start of every run, so 2.1 reaches every user without a reinstall. |
| T3 | **Condition for T2:** before Zack 2.1 goes out, the dev team confirms that B1's intake ignores a fenced block it does not recognise (estimate: under 0.25 half-day). If it rejects the run instead, a one-line intake change comes first. |
| T4 | **B2 stays the growth version.** Only two levels pieces go into it, because they touch code B2 already changes: the Season rename and the quiz fix (3.4). |
| T5 | **The levels engine is a new version, B4, built after B3.** B3's referral measures feed the December 14 checkpoint and the BUZZ target, so they come first. No existing version is renumbered. |

### 3.3 Now, during B1 go-live: hand-run (about 6 half-days, no app code)

| Work | Half-days | Who |
|---|---|---|
| Approve both levels files; settle their open questions | 1 | Peter |
| Draft Zack 2.1 (the `roger-level` block, Z1–Z9) for the Claude, Grok Bot, Hark and Duet files, ready to ship after go-live | 2.5 | Build agent, Peter reviews |
| Tag the existing Zack Runs pool plays with `unlocks` and entry level | 1.5 | Review agent, Roger team approves |
| Place every current user provisionally, from their quiz answer, their existing Zack runs and the Roger team's knowledge; record Level and gaps | 1 | Roger team |

### 3.4 After B1 is live

| Step | Half-days | Who | Notes |
|---|---|---|---|
| Intake check (T3) | under 0.25 | Dev team | Before Zack 2.1 ships |
| Ship Zack 2.1 | 0 build | Peter approves | Content only |
| Hand-run Cora 2.1 prompt: read the block, apply eligibility and the three slots | 1 | Build agent | Run by the Roger team until B4 ships |
| Score users from their first Zack 2.1 runs; compare with the provisional levels; adjust items | 2 | Roger team | Replaces the provisional levels |

### 3.5 Added to B2 (about 0.5 half-day on top of B2's 13)

- **Season rename**, inside B2's existing "bricks and levels" item: `--color-level-1…5` becomes `--color-season-1…5`. The brick graph and the stats email say "Season". "Level" now means only this system.
- **Quiz question 5:** offer Levels 0 to 9 with the v1.1 names, and show each level's "you need it when…" symptom, because people recognise symptoms more easily than levels.

### 3.6 B4: levels (about 10.5 half-days, after B3)

| Work | Half-days |
|---|---|
| Intake validation for `roger-level` (C1) | 1 |
| Level engine and storage (C2, C3) | 3 |
| Dashboard check chart view (C4; the Season rename is already done in B2) | 2 |
| Stats email Level line and operations view (C5, C6) | 1.5 |
| Tests on the pilot users' real runs | 1 |
| Cora's use of levels: eligibility and the three slots (2.1, 2.2) | 2 |

**Before B4 starts:** Zack 2.1 is approved and live (launch list S24), and Cora 2.0 change 8, profile matching, is built (launch list S20). Every row above is built; nothing in B4 is optional.

The earlier figure of "about 11 half-days" for the product work is now 0.5 in B2 plus 10.5 in B4.

### 3.8 Where this is documented

| File | What it says about levels |
|---|---|
| `Roger v3 - design spec.md` (1.5) | "What changed in 1.5"; decision row "Roger AI Levels" (0.2); Season tokens (0.7); quiz question 5 (B.4); Bricks and Seasons and the stats email (B.15); **B.16a Version B4: levels**; sizes for B2 and B4 (B.17); acceptance checks 51 to 58 (B.18) |
| `launch-list.html` | S20 (Cora change 8 before B4), S23 (levels files approved), S24 (Zack 2.1), and the area note in section 0 |
| `Roger AI Agent Levels and Check Charts v1.1.md` | The ten levels, rules and check charts |
| `Strategy/Roger-Strategy-v3.1.md` | R6g: bricks and Seasons, and a pointer to Roger AI Levels |

### 3.7 Later

- A fuller provisional level from several quiz questions (C7), replacing the single self-pick: about 1.5 half-days.
- Combining several agent platforms per user (open question 1 below).
- Level 9 verification from Roger referrals and team-agent sharing.
- Level-based group sessions (for example, a Level 5+ session).
- Revisit "beyond 9".

Strict notes:
- Until a user runs Zack 2.1, their level is the Roger team's judgment, not a measurement. Zack 2.1 cannot ship until B1 is live and T3 is checked.
- When B1 goes live, the level names in quiz question 5 become public. That settles the levels file's open question on public names, unless the quiz stops showing the names before go-live.

---

## 4. Open questions for Peter

1. **Several agent platforms.** Combine all of a user's Zack runs into one level (recommended), or level each platform separately?
2. **The three slots (2.2).** Gap fix, next level, best fit: approve, or keep Cora's ranking untouched and use levels only for eligibility?
