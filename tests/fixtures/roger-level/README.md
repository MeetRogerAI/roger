# `roger-level` fixtures

Generated, never edited by hand. They come from `src/test-helpers/level-fixtures.ts`, which builds them from the contract (`src/lib/levels/contract.ts`, contract version 1) and the levels data file (`src/data/roger-levels.ts`). The tests regenerate them in memory and fail if a checked-in file differs or is left over.

Regenerate after a change to the contract, the data file or the builder:

```
WRITE_LEVEL_FIXTURES=1 npx vitest run src/lib/levels/contract.test.ts src/lib/levels/level-fixtures.test.ts --maxWorkers=1
```

Then run the same command without `WRITE_LEVEL_FIXTURES=1`, and review the diff: a change to a level fixture's `expect` means a member's level would change.

Every fixture is validated against receipt date `2026-11-29` (`receivedOn`). Files are two-space JSON with LF line endings.

## `contract/`: contract v1 edge cases

Each file is `{ name, description, receivedOn, validate, expect, block | text }`. `block` is validated as the JSON text `JSON.stringify(block)`, `text` as given. `validate: "object"` marks the two files whose text would be over the 30,000-character limit (200 or 201 routines), which are validated as an already-parsed object, so the routine limit itself is tested. `expect` is `{ ok: true }` or the exact issues (paths and codes, never values).

| Fixture | Validation | What it is |
|---|---|---|
| `valid-minimal` | valid | The smallest valid block: platform, zack_version, empty inventory, zero activity. |
| `valid-maximal` | valid | Every field, every enum value used at least once. The contract document's example. |
| `valid-platform-claude` | valid | A minimal block from platform claude. |
| `valid-platform-grok-bot` | valid | A minimal block from platform grok-bot. |
| `valid-platform-hark` | valid | A minimal block from platform hark. |
| `valid-platform-duet` | valid | A minimal block from platform duet. |
| `valid-platform-other` | valid | A minimal block from platform other. |
| `valid-exactly-max-chars` | valid | Exactly 30000 characters (padded with an unknown key, which is dropped). |
| `invalid-oversize` | rejected: `(block): size` | 30001 characters: rejected as size before parsing. |
| `valid-unknown-keys` | valid | Unknown keys at the top level, in an agent and in activity: not an error, and dropped. |
| `valid-boundary-values` | valid | Counts at 10,000, active_days at 7, strings of exactly 120 characters, dates at 2020-01-01 and at receipt + 1 day. |
| `valid-agents-at-limit` | valid | inventory.agents with 60 entries (the limit). |
| `invalid-agents-over-limit` | rejected: `inventory.agents: too_big` | inventory.agents with 61 entries: one over. |
| `valid-routines-at-limit` | valid | inventory.routines with 200 entries (the limit). |
| `invalid-routines-over-limit` | rejected: `inventory.routines: too_big` | inventory.routines with 201 entries: one over. |
| `valid-skills-at-limit` | valid | inventory.skills with 200 entries (the limit). |
| `invalid-skills-over-limit` | rejected: `inventory.skills: too_big` | inventory.skills with 201 entries: one over. |
| `valid-connections-at-limit` | valid | inventory.agents[0].connections with 40 entries (the limit). |
| `invalid-connections-over-limit` | rejected: `inventory.agents[0].connections: too_big` | inventory.agents[0].connections with 41 entries: one over. |
| `valid-models-used-at-limit` | valid | inventory.models_used with 20 entries (the limit). |
| `invalid-models-used-over-limit` | rejected: `inventory.models_used: too_big` | inventory.models_used with 21 entries: one over. |
| `valid-used-by-at-limit` | valid | inventory.skills[0].used_by with 40 entries (the limit). |
| `invalid-used-by-over-limit` | rejected: `inventory.skills[0].used_by: too_big` | inventory.skills[0].used_by with 41 entries: one over. |
| `valid-self-report-at-limit` | valid | self_report with 160 entries (the limit). |
| `invalid-self-report-over-limit` | rejected: `self_report: too_big` | self_report with 161 entries: one over. |
| `valid-domains-at-limit` | valid | domains with 12 entries (the limit). |
| `invalid-domains-over-limit` | rejected: `domains: too_big` | domains with 13 entries: one over. |
| `valid-fields-present-at-limit` | valid | inventory.agents[0].fields_present with 20 entries (the limit). |
| `invalid-fields-present-over-limit` | rejected: `inventory.agents[0].fields_present: too_big` | inventory.agents[0].fields_present with 21 entries: one over. |
| `invalid-yaml` | rejected: `(block): json` | The build spec 1.1 layout written as YAML, not JSON. |
| `invalid-json` | rejected: `(block): json` | Truncated JSON. |
| `invalid-empty-text` | rejected: `(block): json` | An empty fence. |
| `invalid-json-array` | rejected: `(block): invalid_type` | A JSON array instead of one object. |
| `invalid-json-null` | rejected: `(block): invalid_type` | JSON null. |
| `invalid-duplicate-key` | rejected: `platform: duplicate_key` | platform given twice (JSON.parse would keep the last silently). |
| `invalid-duplicate-key-nested` | rejected: `inventory.agents[0].autonomy: duplicate_key` | An agent's autonomy given twice. |
| `invalid-zack-version-2.0` | rejected: `zack_version: invalid_value` | zack_version 2.0 (contract v1 is Zack 2.1's). |
| `invalid-zack-version-number` | rejected: `zack_version: invalid_value` | zack_version as the number 2.1, not the string. |
| `invalid-missing-platform` | rejected: `platform: missing` | No platform. |
| `invalid-unknown-platform` | rejected: `platform: invalid_value` | A platform that isn't one of Zack's agents or other. |
| `invalid-null-inventory` | rejected: `inventory: invalid_type` | inventory is null. |
| `invalid-missing-count` | rejected: `activity_7d.voice_inputs: missing` | activity_7d without voice_inputs. |
| `invalid-count-negative` | rejected: `activity_7d.proactive_starts: too_small` | A negative count. |
| `invalid-count-over` | rejected: `history_flags.usage_cuts: too_big` | A count of 10001. |
| `invalid-count-fraction` | rejected: `inventory.scripts: invalid_type` | A count of 1.5. |
| `invalid-count-string` | rejected: `activity_7d.active_days: invalid_type` | A count given as the string "3". |
| `invalid-active-days-over-7` | rejected: `activity_7d.active_days: too_big` | active_days of 8 in a 7-day window. |
| `invalid-string-too-long` | rejected: `inventory.agents[0].name: too_big` | An agent name of 121 characters. |
| `invalid-empty-name` | rejected: `inventory.agents[0].name: too_small` | An agent with an empty name. |
| `invalid-unknown-cadence` | rejected: `inventory.routines[0].cadence: invalid_value` | A routine cadence of "fortnightly". |
| `invalid-away-rule-in-has` | rejected: `inventory.routines[0].has[1]: invalid_value` | away_rule written inside has, as build spec 1.1 lays it out; v1 makes it its own field. |
| `invalid-unknown-rule` | rejected: `inventory.agents[0].rules[0]: invalid_value` | An agent rule that isn't on the list. |
| `invalid-unknown-stage` | rejected: `domains[0].stages_covered[0]: invalid_value` | A domain stage that isn't on the list. |
| `invalid-connections-not-list` | rejected: `inventory.agents[0].connections: invalid_type` | connections as one string. |
| `invalid-date-before-2020` | rejected: `inventory.agents[0].created: date_out_of_range` | An agent created 2019-12-31. |
| `invalid-date-after-receipt` | rejected: `inventory.routines[0].last_run: date_out_of_range` | A routine last run two days after receipt. |
| `invalid-date-not-iso` | rejected: `inventory.memory_last_cleanup: invalid_format` | A date written 27/11/2026. |
| `invalid-date-impossible` | rejected: `self_report[0].date: invalid_format` | A self-report dated 2026-02-30. |
| `invalid-owner-agent-absent` | rejected: `inventory.routines[0].owner_agent: unknown_reference` | A routine whose owner_agent names no agent in the block. |
| `invalid-used-by-absent` | rejected: `inventory.skills[0].used_by[1]: unknown_reference` | A skill used_by a name that is neither an agent nor a routine in the block. |
| `invalid-duplicate-agent-name` | rejected: `inventory.agents[1].name: duplicate` | Two agents with the same name. |
| `invalid-duplicate-routine-name` | rejected: `inventory.routines[1].name: duplicate` | Two routines with the same name. |
| `invalid-self-report-item-shape` | rejected: `self_report[0].item: invalid_format` | A self-report for item "10.01" (not an item ID shape). |
| `invalid-self-report-item-unknown` | rejected: `self_report[0].item: unknown_item` | A self-report for item "1.99" (the right shape, but no such item). |
| `invalid-self-report-answer` | rejected: `self_report[0].answer: invalid_union` | A self-report answer of 2. |

## `levels/`: a member at each level and boundary

Each file is `{ name, description, receivedOn, roger, expect, block }`: one valid contract v1 block, the Roger facts some items read (`roger`: other members' adoption of the member's plays, run categories, past ideas), and what scoring that one submission gives (`expect.level`, the live items `expect.live`, and the Zack- or Roger-verified core items per level `expect.verifiedCoreByLevel`, Levels 1 to 9). The builder adds the least evidence that makes each wanted item live, so other items come live only as a side effect (for example 4.14's usage cut is also 6.12's).

- `level-L`: every core item and the needed electives (70%, rounded up) of Levels 1 to L. Electives settled by Zack come first, then self-reported ones, then fallback answers, at most half the needed number (rounded down).
- `level-L-missing-core`: level L's evidence without one core item of L (a Zack-settled one where possible). Scores L - 1.
- `level-L-elective-short`: level L's evidence with one elective fewer than needed. Scores L - 1.
- `level-L-self-only-core`: level L - 1's evidence plus a self-report of 1 for every item of L. Self-reports don't settle Zack- or Roger-settled items, so it scores L - 1.
- `level-L-over-fallback-cap` (Levels 1, 2, 7, 8, 9, where there are enough fallback electives): the needed number of electives is met, but one too many of them are fallback answers. Scores L - 1.

| Fixture | Level | What it is |
|---|---|---|
| `level-0` | 0 | A minimal valid block and nothing else: Level 0. |
| `level-1` | 1 | Every core item and the needed electives of Levels 1 to 1, and no more evidence than that: Level 1. |
| `level-2` | 2 | Every core item and the needed electives of Levels 1 to 2, and no more evidence than that: Level 2. |
| `level-3` | 3 | Every core item and the needed electives of Levels 1 to 3, and no more evidence than that: Level 3. |
| `level-4` | 4 | Every core item and the needed electives of Levels 1 to 4, and no more evidence than that: Level 4. |
| `level-5` | 5 | Every core item and the needed electives of Levels 1 to 5, and no more evidence than that: Level 5. |
| `level-6` | 6 | Every core item and the needed electives of Levels 1 to 6, and no more evidence than that: Level 6. |
| `level-7` | 7 | Every core item and the needed electives of Levels 1 to 7, and no more evidence than that: Level 7. |
| `level-8` | 8 | Every core item and the needed electives of Levels 1 to 8, and no more evidence than that: Level 8. |
| `level-9` | 9 | Every core item and the needed electives of Levels 1 to 9, and no more evidence than that: Level 9. |
| `level-1-missing-core` | 0 | Level 1's evidence without core item 1.03: scores 0. |
| `level-1-elective-short` | 0 | Level 1's evidence with one elective fewer than the 5 needed (1.08 left out): scores 0. |
| `level-1-self-only-core` | 0 | Level 0's evidence, plus a self-report of 1 for every item of Level 1 and no Zack or Roger evidence added for it: self-reports don't settle Level 1's 3 Zack- or Roger-settled core items, so it scores 0. |
| `level-1-over-fallback-cap` | 0 | Level 1's core, 2 Zack-settled or self electives and 3 fallback answers: 5 electives met, but fallback counts for at most 2, so it scores 0. |
| `level-2-missing-core` | 1 | Level 2's evidence without core item 2.01: scores 1. |
| `level-2-elective-short` | 1 | Level 2's evidence with one elective fewer than the 5 needed (2.12 left out): scores 1. |
| `level-2-self-only-core` | 1 | Level 1's evidence, plus a self-report of 1 for every item of Level 2 and no Zack or Roger evidence added for it: self-reports don't settle Level 2's 3 Zack- or Roger-settled core items, so it scores 1. |
| `level-2-over-fallback-cap` | 1 | Level 2's core, 2 Zack-settled or self electives and 3 fallback answers: 5 electives met, but fallback counts for at most 2, so it scores 1. |
| `level-3-missing-core` | 2 | Level 3's evidence without core item 3.02: scores 2. |
| `level-3-elective-short` | 2 | Level 3's evidence with one elective fewer than the 7 needed (3.D1, 3.16, 3.12, 3.09, 3.14 left out): scores 2. |
| `level-3-self-only-core` | 2 | Level 2's evidence, plus a self-report of 1 for every item of Level 3 and no Zack or Roger evidence added for it: self-reports don't settle Level 3's 6 Zack- or Roger-settled core items, so it scores 2. |
| `level-4-missing-core` | 3 | Level 4's evidence without core item 4.02: scores 3. |
| `level-4-elective-short` | 3 | Level 4's evidence with one elective fewer than the 10 needed (4.19 left out): scores 3. |
| `level-4-self-only-core` | 3 | Level 3's evidence, plus a self-report of 1 for every item of Level 4 and no Zack or Roger evidence added for it: self-reports don't settle Level 4's 5 Zack- or Roger-settled core items, so it scores 3. |
| `level-5-missing-core` | 4 | Level 5's evidence without core item 5.01: scores 4. |
| `level-5-elective-short` | 4 | Level 5's evidence with one elective fewer than the 9 needed (5.12 left out): scores 4. |
| `level-5-self-only-core` | 4 | Level 4's evidence, plus a self-report of 1 for every item of Level 5 and no Zack or Roger evidence added for it: self-reports don't settle Level 5's 5 Zack- or Roger-settled core items, so it scores 4. |
| `level-6-missing-core` | 5 | Level 6's evidence without core item 6.02: scores 5. |
| `level-6-elective-short` | 5 | Level 6's evidence with one elective fewer than the 11 needed (6.D1, 6.21 left out): scores 5. |
| `level-6-self-only-core` | 5 | Level 5's evidence, plus a self-report of 1 for every item of Level 6 and no Zack or Roger evidence added for it: self-reports don't settle Level 6's 5 Zack- or Roger-settled core items, so it scores 5. |
| `level-7-missing-core` | 6 | Level 7's evidence without core item 7.01: scores 6. |
| `level-7-elective-short` | 6 | Level 7's evidence with one elective fewer than the 7 needed (7.13 left out): scores 6. |
| `level-7-self-only-core` | 6 | Level 6's evidence, plus a self-report of 1 for every item of Level 7 and no Zack or Roger evidence added for it: self-reports don't settle Level 7's 5 Zack- or Roger-settled core items, so it scores 6. |
| `level-7-over-fallback-cap` | 6 | Level 7's core, 3 Zack-settled or self electives and 4 fallback answers: 7 electives met, but fallback counts for at most 3, so it scores 6. |
| `level-8-missing-core` | 7 | Level 8's evidence without core item 8.02: scores 7. |
| `level-8-elective-short` | 7 | Level 8's evidence with one elective fewer than the 6 needed (8.10 left out): scores 7. |
| `level-8-self-only-core` | 7 | Level 7's evidence, plus a self-report of 1 for every item of Level 8 and no Zack or Roger evidence added for it: self-reports don't settle Level 8's 4 Zack- or Roger-settled core items, so it scores 7. |
| `level-8-over-fallback-cap` | 7 | Level 8's core, 2 Zack-settled or self electives and 4 fallback answers: 6 electives met, but fallback counts for at most 3, so it scores 7. |
| `level-9-missing-core` | 8 | Level 9's evidence without core item 9.01: scores 8. |
| `level-9-elective-short` | 8 | Level 9's evidence with one elective fewer than the 5 needed (9.10 left out): scores 8. |
| `level-9-self-only-core` | 8 | Level 8's evidence, plus a self-report of 1 for every item of Level 9 and no Zack or Roger evidence added for it: self-reports don't settle Level 9's 3 Zack- or Roger-settled core items, so it scores 8. |
| `level-9-over-fallback-cap` | 8 | Level 9's core, 2 Zack-settled or self electives and 3 fallback answers: 5 electives met, but fallback counts for at most 2, so it scores 8. |
