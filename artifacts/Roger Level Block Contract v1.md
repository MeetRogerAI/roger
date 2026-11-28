# Roger Level Block Contract v1

Contract version 1 · for Zack 2.1 · November 28, 2026 · Roger (meetroger.ai) · Draft for Peter's approval (S24)

For: whoever writes Zack 2.1 (the Claude, Grok Bot, Hark and Duet files), and the Roger build agents.
Implements: build spec 1.1 ("Roger Levels Build Spec - Zack 2.1, Cora 2.1 and Dashboard v1.2.md"), frozen as JSON.
Defined in code: `src/lib/levels/contract.ts` (`levelBlockV1`). Examples: `tests/fixtures/roger-level/`.

The block is the evidence Roger scores a member's AI Level from (the levels file, "Roger AI Agent Levels and Check Charts v1.1.md"). It lives in the **private profile** and never enters the shared pool.

---

## 1. How to emit it

- One fenced block per profile file, the fence named `roger-level`, holding **one JSON object** (not YAML: build spec 1.1 is written YAML-like, but Zack 2.0's `roger-run` and `roger-profile` blocks are JSON, and so is this one).
- One block per agent account. Zack runs per agent account, so a member with two platforms sends two profiles, each with its own block. **More than one `roger-level` block in one profile is rejected.**
- `zack_version` is the string `"2.1"`. `platform` is the agent account's platform.
- Every key below is **required**. Use `[]`, `0`, `""`, `null` or `"none"` where the table says so; never leave a key out.
- Record presence and counts, never content (Z2). Names are allowed (they are used only to link entries inside the block, then dropped), but nothing else from a conversation, a message or a file.

## 2. What happens to it

- **Strict.** A block that fails any rule below is **rejected whole**: nothing from it is kept. The profile it came with is still accepted, Cora still matches on it, and the run is scored on its other evidence. The member isn't told; the Roger team sees the rejection, with its reasons, on `/admin/levels`.
- **Reasons are paths and codes only**, never a value: `inventory.routines[3].cadence: invalid_value`. At most 20 are kept.
- **A privacy check** runs on the block's raw text before anything is kept. Anything that looks like a secret (an API key, a bearer token, a private key, a password), a card or bank number, or a government ID number rejects the block.
- **Unknown keys** are not an error. They are dropped and never stored (`__proto__` included).
- **A key repeated within one object** rejects the block (`duplicate_key`), wherever it is: write each key once.
- **Minimised before it is stored.** No free text is kept: agent, routine, skill and domain names, `job_sentence`, connection labels and model names are used only inside the block, then dropped. Links (`owner_agent`, `used_by`) become positions, `job_sentence` becomes "has one or not", connection and model labels become counts of distinct labels (compared ignoring case and spacing).
- **One block a week per platform** is kept. A second profile from the same platform in the same week replaces the first one's block.

## 3. The layout

Paths below: `agents[]` is `inventory.agents[]`, and so on.

### Top level

| Key | Type | Meaning |
|---|---|---|
| `zack_version` | `"2.1"` | The Zack version that wrote the block. Contract v1 is Zack 2.1's. |
| `platform` | `claude`, `grok-bot`, `hark`, `duet` or `other` | The agent account's platform. |
| `inventory` | object | What the account has (ZI items). |
| `activity_7d` | object | What the account did (ZA items). |
| `history_flags` | object | Events since the previous Zack run (ZH items). |
| `self_report` | list, at most 160 | Answers to Zack's level questions (S and fallback items). |
| `domains` | list, at most 12 | The member's domains (Z5), declared by the member and confirmed by Zack against routines and agents. |

### `inventory`

| Key | Type | Meaning |
|---|---|---|
| `agents` | list, at most 60 | One entry per bot or agent. |
| `routines` | list, at most 200 | One entry per routine (scheduled or triggered job). |
| `skills` | list, at most 200 | One entry per saved skill. |
| `memory` | list of `instructions`, `profile_file`, `project_pages`, `decisions_log`, `knowledge_base` | The kinds of standing memory the account has. |
| `memory_last_cleanup` | date, or `"none"` | When memory was last cleaned up (stale, duplicate and contradicting notes merged or removed). |
| `pages_dashboards` | count | Live pages or dashboards the agents keep. |
| `models_used` | list of names, at most 20 | The models the account routes work to. |
| `scripts` | count | Deterministic steps run as code, not as model reasoning (6.19). |

### `agents[]`

| Key | Type | Meaning |
|---|---|---|
| `name` | string, 1 to 120 | The agent's name, unique within the block. Used only for links. |
| `job_sentence` | string, up to 120 | Its job in one sentence, or `""` when it has none. |
| `fields_present` | list of `owns`, `inputs`, `may`, `must_ask`, `done_when` | Which of the five job fields its written job has (3.02). `inputs` is "what it works from". |
| `autonomy` | `observe`, `prepare`, `approve`, `schedule`, `coordinate` or `own` | Its autonomy level, from its rules and approval behaviour, not its own description (Z6). |
| `connections` | list of service names, at most 40 | Service names only (Z2), for example "Gmail". |
| `created` | date, or `null` | When it was created; `null` when Zack can't see it. |
| `created_by` | `me`, `system` or `installed` | `installed` = from a marketplace, a colleague or a Roger idea. `system` = the system built it itself. |
| `rules` | list of `do_ask_stop`, `stop_when_unsure`, `untrusted_content`, `no_raw_errors`, `usage_rules`, `rules_in_description`, `general_rule_on_correction`, `fetch_live_facts`, `loop_cap` | Which rules it has. `rules_in_description` = its rules live in its description, not only in memory (Z9). |
| `role` | `chat`, `routines_only`, `catch_all`, `coordinator`, `checker` or `specialist` | Its role. `routines_only` = an agent the member doesn't chat with (Z7). |
| `needs_own` | list of `routines`, `logins`, `private_context`, `channel` | Why it is its own agent rather than a skill (6.21). |

### `routines[]`

| Key | Type | Meaning |
|---|---|---|
| `name` | string, 1 to 120 | The routine's name, unique within the block. |
| `owner_agent` | an agent `name` from this block, or `null` | The agent that hosts it (Z7); `null` when it runs on the account itself. |
| `trigger` | `schedule` or `event` | What starts it. |
| `cadence` | `hourly`, `several_daily`, `daily`, `weekdays`, `weekly`, `monthly` or `other` | How often it runs. For an event trigger, how often it typically fires, or `other`. An enum, not free text: items 4.09 and 4.17 compare cadences. |
| `last_run` | date, or `null` | When it last ran; `null` when it never has. |
| `has` | list of `receipt`, `nothing_today_rule`, `source_check`, `retry_limit`, `end_condition`, `change_check`, `verify_checklist` | Which safeguards it has (Z8). |
| `away_rule` | `allow`, `draft` or `none` | What it does while the member is away: act on a pre-approved rule, stop at a draft, or neither. **Its own field**: build spec 1.1 writes it inside `has`; v1 does not accept it there. |
| `event_scope` | `narrow`, `broad`, or `null` | For an event trigger: one channel or sender (`narrow`) or every new message (`broad`). `null` for a schedule. |
| `delivers_to` | `app`, `phone`, `email`, `text`, `slack` or `page` | Where its result reaches the member. |

### `skills[]`

| Key | Type | Meaning |
|---|---|---|
| `name` | string, 1 to 120 | The skill's name. |
| `origin` | `me`, `system` or `installed` | Who made it, as for agents. |
| `used_by` | list of names, at most 40 | Agents or routines in this block that use it. Each name must be an agent's or a routine's `name`. |

### `activity_7d`

The agent account's own work in the 7 days before the run, **excluding Zack's own run** (otherwise "used AI in the last 4 weeks" would always be 1). Every value is a count.

| Key | Meaning |
|---|---|
| `active_days` | Days with any work, 0 to 7. |
| `multi_step_completions` | Multi-step jobs finished end to end with a finished result. |
| `agent_to_agent_handoffs` | Times one agent handed work to another directly. |
| `proactive_starts` | Work the system began without a prompt that day (Z3: each run classified as user-started or system-started). |
| `voice_inputs` | Tasks given by voice. |
| `approvals` | An object: `parked` (staged and waiting for a yes), `approved`, `batched` (approvals given in batches), `sent_after_approval`. |
| `exceptions_escalated` | Exceptions brought to the member. |
| `others_served_directly` | Replies or work for other people through the agents. |
| `browser_only_tasks` | Jobs done in a site with no connector, in the agent's own browser. |
| `longest_chat_size` | Messages in the longest chat. |
| `chat_resets` | Chats reset with the job's state saved. |
| `verify_reports` | An object: `pass`, `fail` (checklist lines reported before calling a job done). |
| `self_change_proposals` | An object: `proposed`, `adopted` (changes the system proposed to its own setup). |
| `design_activity` | An object: `directions_generated`, `iterations`, `playground_built`, `screenshot_check`. |

### `history_flags`

Counts of events **since the previous Zack run**, not running totals, from the Upgrade Notes and past runs: `promotions`, `demotions`, `retirements`, `rule_fixes_after_error`, `usage_cuts`, `access_reviews`.

### `self_report[]`

| Key | Type | Meaning |
|---|---|---|
| `item` | an item ID, for example `"6.07"` | The check item asked about. Must be an item of the levels file. |
| `answer` | `0` or `1` | The member's answer. |
| `date` | date | When it was asked. |

Repeat an answer and the latest date wins. Answers carry over between runs (they aren't limited to the window), and a guardrail item's answer counts for one Season (26 weeks) until Zack asks again.

### `domains[]`

| Key | Type | Meaning |
|---|---|---|
| `name` | string, 1 to 120 | The domain's name (never stored). |
| `kind` | `work` or `home` | |
| `stages_covered` | list of `intake`, `work`, `delivery`, `follow_up` | The stages the agents run, confirmed by Zack. |

### Dates and limits

- Dates are `YYYY-MM-DD`, a real calendar date, not before 2020-01-01 and not after the receipt date plus one day.
- Counts are whole numbers from 0 to 10,000 (`active_days` 0 to 7).
- Strings are at most 120 characters. Lists of enum values hold at most 20 entries; repeats are ignored.
- The block's text is at most 30,000 characters, checked before anything is parsed. (The list limits are a second guard: 200 routines don't fit in 30,000 characters, so in practice the character limit binds first.)

### Rejection codes

`size` (over 30,000 characters), `json` (not JSON), `missing` (a required key is absent), `invalid_type`, `invalid_value` (a value not on its list), `invalid_format` (a bad date or item ID shape), `invalid_union`, `too_big`, `too_small`, `date_out_of_range`, `duplicate` (two agents or two routines with one name), `duplicate_key` (one key twice in the same object; the path stops at the last key the contract knows, so it is `(block)` inside an unknown key), `unknown_reference` (`owner_agent` or `used_by` naming nothing in the block), `unknown_item` (a self-report for an item that doesn't exist), `invalid` (anything else). A receipt date that isn't a real calendar date (Roger's side, not Zack's) is reported as `(received_on): invalid_format`.

## 4. What Zack asks (Z4, widened)

Build spec Z4 says "ask self-report questions only for items with code S". Contract v1 can't evidence 36 items coded ZI, ZA, ZH or R (they have no field here), so Roger settles them from a self-report answer, counted as self-reported (it never counts toward rule 2.1's three verified core items, and fills at most half of a level's needed electives). **S24 must widen Z4 to "code S, or a fallback item below", still at most 5 questions a run**, for the next level's items first (core, then the electives still needed), then the last blocker.

- **Fallback items (36):** 1.06, 1.08, 1.09, 1.11, 2.04, 2.06, 2.08, 2.11, 2.D2, 3.08, 3.10, 3.15, 4.13, 5.08, 5.10, 5.13, 6.03, 6.11, 6.17, 7.04, 7.06, 7.09, 7.11, 7.13, 7.14, 7.15, 8.05, 8.06, 8.07, 8.09, 8.10, 8.11, 8.12, 9.09, 9.10, 9.11. Six are core: 2.04, 6.03, 7.04, 7.06, 8.05, 8.06.
- **Every item Zack may ask (57):** the fallback items plus every item whose code includes S: 1.04, 1.05, 2.05, 2.12, 3.06, 4.03, 4.15, 5.06, 6.07, 6.13, 6.22, 7.01, 7.08, 7.10, 9.01, 9.02, 9.04, 9.05, 9.07, 9.08, 9.12. For 7.01, 7.08 and 9.01 the answer is only half: Zack's own evidence (a domain covering all four stages; `others_served_directly`) must also be there.
- An answer for any other item is accepted and ignored.

## 5. Decisions this contract makes (for Peter)

1. JSON, not the YAML-like layout of build spec 1.1.
2. `cadence` is an enum.
3. `activity_7d` excludes Zack's own run.
4. `history_flags` are counts since the previous run, not totals.
5. `away_rule` is its own field on a routine, not an entry in `has`.
6. `platform` is one of Zack's agents or `other`.
7. Every key is required; `created`, `last_run`, `owner_agent` and `event_scope` may be `null`, and `memory_last_cleanup` may be `"none"`.
8. Names link entries inside the block and are unique among agents and among routines. They are matched exactly (case and spacing count).
9. A bad block is rejected whole; unknown keys are dropped.

A later Zack that needs another layout (for example new fields for the six unevidenced core items) gets **contract version 2**, never an edit to version 1. Version 1's shape is frozen by a snapshot test.

## 6. Full example

Every field, every list value used at least once. It is the `valid-maximal` fixture, and a test checks that this block validates and matches it.

```roger-level
{
  "zack_version": "2.1",
  "platform": "grok-bot",
  "inventory": {
    "agents": [
      {
        "name": "Chief of staff",
        "job_sentence": "Chief of staff owns one job.",
        "fields_present": [
          "owns",
          "inputs",
          "may",
          "must_ask",
          "done_when"
        ],
        "autonomy": "observe",
        "connections": [
          "Gmail",
          "Google Calendar",
          "Slack"
        ],
        "created": "2026-11-22",
        "created_by": "me",
        "rules": [
          "do_ask_stop",
          "stop_when_unsure",
          "untrusted_content",
          "no_raw_errors",
          "usage_rules",
          "rules_in_description",
          "general_rule_on_correction",
          "fetch_live_facts",
          "loop_cap"
        ],
        "role": "coordinator",
        "needs_own": [
          "routines"
        ]
      },
      {
        "name": "Inbox",
        "job_sentence": "Inbox owns one job.",
        "fields_present": [
          "owns",
          "done_when"
        ],
        "autonomy": "prepare",
        "connections": [
          "Gmail"
        ],
        "created": "2026-11-15",
        "created_by": "system",
        "rules": [
          "do_ask_stop",
          "stop_when_unsure"
        ],
        "role": "chat",
        "needs_own": [
          "logins"
        ]
      },
      {
        "name": "Listings",
        "job_sentence": "Listings owns one job.",
        "fields_present": [
          "owns",
          "done_when"
        ],
        "autonomy": "approve",
        "connections": [
          "Listing site"
        ],
        "created": "2026-11-08",
        "created_by": "installed",
        "rules": [
          "do_ask_stop",
          "stop_when_unsure"
        ],
        "role": "specialist",
        "needs_own": [
          "private_context"
        ]
      },
      {
        "name": "Checker",
        "job_sentence": "Checker owns one job.",
        "fields_present": [
          "owns",
          "done_when"
        ],
        "autonomy": "schedule",
        "connections": [],
        "created": "2026-11-01",
        "created_by": "me",
        "rules": [
          "do_ask_stop",
          "stop_when_unsure"
        ],
        "role": "checker",
        "needs_own": [
          "channel"
        ]
      },
      {
        "name": "Routines host",
        "job_sentence": "Routines host owns one job.",
        "fields_present": [
          "owns",
          "done_when"
        ],
        "autonomy": "coordinate",
        "connections": [],
        "created": "2026-10-25",
        "created_by": "system",
        "rules": [
          "do_ask_stop",
          "stop_when_unsure"
        ],
        "role": "routines_only",
        "needs_own": [
          "routines"
        ]
      },
      {
        "name": "Catch-all",
        "job_sentence": "Catch-all owns one job.",
        "fields_present": [
          "owns",
          "done_when"
        ],
        "autonomy": "own",
        "connections": [],
        "created": "2026-10-18",
        "created_by": "installed",
        "rules": [
          "do_ask_stop",
          "stop_when_unsure"
        ],
        "role": "catch_all",
        "needs_own": [
          "logins"
        ]
      }
    ],
    "routines": [
      {
        "name": "Routine hourly",
        "owner_agent": "Routines host",
        "trigger": "event",
        "cadence": "hourly",
        "last_run": "2026-11-28",
        "has": [
          "receipt",
          "nothing_today_rule",
          "source_check",
          "retry_limit",
          "end_condition",
          "change_check",
          "verify_checklist"
        ],
        "away_rule": "allow",
        "event_scope": "narrow",
        "delivers_to": "app"
      },
      {
        "name": "Routine several_daily",
        "owner_agent": null,
        "trigger": "event",
        "cadence": "several_daily",
        "last_run": "2026-11-28",
        "has": [
          "receipt",
          "nothing_today_rule",
          "source_check",
          "retry_limit"
        ],
        "away_rule": "draft",
        "event_scope": "broad",
        "delivers_to": "phone"
      },
      {
        "name": "Routine daily",
        "owner_agent": "Routines host",
        "trigger": "schedule",
        "cadence": "daily",
        "last_run": "2026-11-28",
        "has": [
          "receipt",
          "nothing_today_rule",
          "source_check",
          "retry_limit"
        ],
        "away_rule": "none",
        "event_scope": null,
        "delivers_to": "email"
      },
      {
        "name": "Routine weekdays",
        "owner_agent": null,
        "trigger": "schedule",
        "cadence": "weekdays",
        "last_run": "2026-11-28",
        "has": [
          "receipt",
          "nothing_today_rule",
          "source_check",
          "retry_limit"
        ],
        "away_rule": "allow",
        "event_scope": null,
        "delivers_to": "text"
      },
      {
        "name": "Routine weekly",
        "owner_agent": "Routines host",
        "trigger": "schedule",
        "cadence": "weekly",
        "last_run": "2026-11-28",
        "has": [
          "receipt",
          "nothing_today_rule",
          "source_check",
          "retry_limit"
        ],
        "away_rule": "draft",
        "event_scope": null,
        "delivers_to": "slack"
      },
      {
        "name": "Routine monthly",
        "owner_agent": null,
        "trigger": "schedule",
        "cadence": "monthly",
        "last_run": "2026-11-28",
        "has": [
          "receipt",
          "nothing_today_rule",
          "source_check",
          "retry_limit"
        ],
        "away_rule": "none",
        "event_scope": null,
        "delivers_to": "page"
      },
      {
        "name": "Routine other",
        "owner_agent": "Routines host",
        "trigger": "schedule",
        "cadence": "other",
        "last_run": null,
        "has": [
          "receipt",
          "nothing_today_rule",
          "source_check",
          "retry_limit"
        ],
        "away_rule": "allow",
        "event_scope": null,
        "delivers_to": "app"
      }
    ],
    "skills": [
      {
        "name": "Skill me",
        "origin": "me",
        "used_by": [
          "Inbox",
          "Routine daily"
        ]
      },
      {
        "name": "Skill system",
        "origin": "system",
        "used_by": [
          "Chief of staff"
        ]
      },
      {
        "name": "Skill installed",
        "origin": "installed",
        "used_by": []
      }
    ],
    "memory": [
      "instructions",
      "profile_file",
      "project_pages",
      "decisions_log",
      "knowledge_base"
    ],
    "memory_last_cleanup": "2026-11-19",
    "pages_dashboards": 1,
    "models_used": [
      "Model A",
      "Model B"
    ],
    "scripts": 2
  },
  "activity_7d": {
    "active_days": 6,
    "multi_step_completions": 12,
    "agent_to_agent_handoffs": 4,
    "proactive_starts": 9,
    "voice_inputs": 3,
    "approvals": {
      "parked": 2,
      "approved": 5,
      "batched": 1,
      "sent_after_approval": 5
    },
    "exceptions_escalated": 1,
    "others_served_directly": 2,
    "browser_only_tasks": 1,
    "longest_chat_size": 140,
    "chat_resets": 1,
    "verify_reports": {
      "pass": 7,
      "fail": 1
    },
    "self_change_proposals": {
      "proposed": 2,
      "adopted": 1
    },
    "design_activity": {
      "directions_generated": 5,
      "iterations": 4,
      "playground_built": 1,
      "screenshot_check": 1
    }
  },
  "history_flags": {
    "promotions": 1,
    "demotions": 1,
    "retirements": 1,
    "rule_fixes_after_error": 2,
    "usage_cuts": 1,
    "access_reviews": 1
  },
  "self_report": [
    {
      "item": "1.04",
      "answer": 1,
      "date": "2026-11-15"
    },
    {
      "item": "6.07",
      "answer": 0,
      "date": "2026-11-29"
    }
  ],
  "domains": [
    {
      "name": "Listings marketing",
      "kind": "work",
      "stages_covered": [
        "intake",
        "work",
        "delivery",
        "follow_up"
      ]
    },
    {
      "name": "Family logistics",
      "kind": "home",
      "stages_covered": [
        "intake",
        "work"
      ]
    }
  ]
}
```

## 7. Fixtures

`tests/fixtures/roger-level/contract/` holds one file per edge case (valid and invalid), each with what validation must answer. `tests/fixtures/roger-level/levels/` holds blocks that put a member at each level 0 to 9 and at each boundary. See `tests/fixtures/roger-level/README.md`.
