---
date: 2026-11-12
topic: sheet-sync-all-tabs
scope: lightweight
status: active
---

# Sheet sync: capture all 20 Lomax tabs

Builds on `docs/brainstorms/2026-10-24-sheet-sync-requirements.md`.

## Problem frame

The library has 4,739 sheet entries. Lomax's sheet has 5,843 rows across 20 data tabs, up from 16. An audit of the live sheet on 2026-11-12 explains the gap exactly:

| | Rows |
|---|---|
| All rows, 20 data tabs (all with URLs, no duplicate Post IDs) | 5,843 |
| Tagged USE CASE | 5,061 |
| Tagged CAUTION | 615 |
| Tagged NEWS, FRAMING, DEMAND, BIA ANGLE, DATA or ADOPTION | 167 |

Lomax added four tabs that match no Roger category. The sync skips them and only notes it in the run log:

| New tab | Eligible rows (USE CASE + CAUTION) |
|---|---|
| Builds & Dashboards | 561 |
| Research & Monitoring | 258 |
| Other | 67 |
| Real Estate Agents | 51 |
| **Total** | **937** |

The 16 mapped tabs hold 5,676 − 937 = **4,739** eligible rows, which is exactly what the library has today. The sync is working as designed. What's missing is the new tabs.

## Decisions

- **Target: 5,676 entries** (USE CASE + CAUTION from all 20 tabs). The 167 news and commentary rows stay sheet-only, as in the original R5. The user chose this over 5,843 because "use cases only" excludes those rows.
- **Four new categories (17 → 21)**, named after their tabs:
  - Builds & Dashboards: work
  - Research & Monitoring: work
  - Real Estate Agents: work
  - Other: home
- **A future unknown tab lands in Other** instead of being skipped. /admin flags the new tab by name so it can get its own category later. Nothing in the sheet is silently left out again.

## Requirements

- **R1.** Every eligible row in all 20 current tabs reaches the library. After the sync drains, the library shows 5,676 sheet entries, give or take Lomax's additions since the audit.
- **R2.** The four new categories appear wherever categories appear today: library filters, category pages and home/work grouping. Each shows only once it has entries, the same as the existing categories.
- **R3.** AI wording for the new rows follows the original R8 and R9 unchanged: Roger's voice, persona picked and agent name normalized.
- **R4.** Rows from a tab that matches no category go into Other. The run log names each such tab and its row count on every run until the tab is mapped.
- **R5.** Roger's own intake (X/Grok/HN extraction) can also file items under the four new categories.
- **R6.** Existing entries don't change: no re-wording and no category moves for the 4,739 rows already live.

## Success criteria

- /library shows about 5,676 use cases across 21 categories.
- /admin's run log shows no "matches no category, skipped" notes.
- A second sync right after the drain changes nothing.

## Out of scope

- Including NEWS, FRAMING or other non-use-case tags.
- Changes to the Lomax job or the sheet.
- New artwork or copy per category beyond a label, unless a category page needs it to render.

## Dependencies

- Rewriting 937 rows uses AI Gateway credits, about $0.60 at the original estimate of $1.50 for 2,300 rows. The hourly job has a 4-minute rewrite budget, so the backlog drains over one or two runs, or immediately if the sync is triggered by hand.
