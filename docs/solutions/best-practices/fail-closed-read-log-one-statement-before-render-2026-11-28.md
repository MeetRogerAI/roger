---
title: An admin read log is fail-closed only if one all-or-nothing write lands before the data renders, and someone can see it
date: 2026-11-28
category: best-practices
module: admin
problem_type: best_practice
component: authorization
applies_when:
  - Admin pages show members' private data (runs, picks, notes, profiles, email history) and every view must be recorded
  - A page shows several kinds of private data, or many members at once
  - The database driver has no transactions (Neon over HTTP)
symptoms:
  - A page that logged each kind in its own insert could record "read_runs" and then fail before "read_feedback", leaving a partial record
  - A log write wrapped in try/catch that rendered anyway made the log best-effort, not a control
  - Capping user ids per row silently dropped members from the record on big list pages
  - Rows nobody could read in the app made the log invisible to the admins it was meant to check
root_cause: missing_validation
resolution_type: code_fix
severity: medium
related_components: [database, frontend_stimulus]
tags: [audit-log, read-log, fail-closed, privacy, admin, single-statement, neon-http, server-components]
---

# An admin read log is fail-closed only if one all-or-nothing write lands before the data renders, and someone can see it

## Context
B3 Unit 6 records every admin page view that shows a member's private data (spec B.16 "Admin read log", launch list S22). The whole-branch review checked whether the log could ever miss a read. The rule that held up: **no log row, no page**.

## Guidance
- **Write before render, and refuse on failure.** The page loads its data, then calls `readsLogged(q, by, page, reads)` and checks the result before it returns any JSX that holds the data. When the write throws, the page returns `READ_NOT_LOGGED` ("This page couldn’t be logged, so it isn’t shown. Try again in a minute.") in place of the data. Never catch the error and render anyway. The one try/catch lives in `readsLogged`, and it turns the error into `false`, not into a render.
- **One statement for the whole view.** All kinds for one page view (`read_runs`, `read_picks`, `read_feedback`, `read_profile`, `read_emails`) go into a single `insert … select … from jsonb_array_elements($2::jsonb) with ordinality`. Neon over HTTP has no transactions, so a single statement is the only way to make the rows land together or not at all.
- **Never truncate, split instead.** A kind that shows more than `READ_LOG_MAX_IDS` (200) members is written as several rows (`part` of `parts`), and `count` holds the full number. A cap that drops ids turns the log into a sample.
- **Ids only.** `detail` is `{ page, user_ids, count }`. It never holds member text, titles or emails, so the log can't become a second copy of the private data.
- **No deduplication.** "Each time" means each time. A reload is a second read.
- **Give it a viewer.** The member's admin page lists "Who read this member’s data" (`readsOfMember`, the latest 50 views: when, who, which page, which kinds). It is read *before* this visit's row is written, so the page doesn't list itself. The page's own Admin log section leaves read rows out and says where they are listed.
- **Log only when data is shown.** `/admin/cora` logs only once a member is chosen. A page view that shows no member's data writes nothing (kinds with no ids are skipped).
- **Say what isn't logged.** `/admin/pipeline` (lead names, emails, UTM data) is not in the read log. That is written down on the launch list (`b3-confirmations` 14) instead of being left implicit.

## Why This Matters
A read log that can be skipped by an error, split by a timeout or capped by a constant gives false assurance, and that is worse than having no log. Fail-closed costs one refused page view when the database is down, and the data wasn't going to load then anyway.

## When to Apply
Any audit trail of *reads* (as opposed to writes) on a page that renders server-side: admin consoles, support tools, data-export screens.

## Examples
- `src/lib/admin/read-log.ts`: `logAdminReads` (one statement, split rows), `readsLogged`, `READ_NOT_LOGGED`, `readsOfMember`.
- `src/app/admin/users/[id]/page.tsx`: reads the readers list first, then logs, then renders, plus the "Who read this member’s data" section.
- Tests: `src/lib/admin/read-log.test.ts`, `src/app/admin/users/[id]/page.test.tsx`.

## Related
- `docs/solutions/logic-errors/tightening-a-fail-closed-settings-read-schema-bricks-saved-data-2026-11-27.md` (another fail-closed read, and the cost of getting the failure mode wrong)
- `docs/solutions/best-practices/lease-must-guard-every-write-not-just-entry-2026-11-23.md` (single statements as the unit of safety on Neon HTTP)
- `docs/solutions/security-issues/model-edits-for-a-public-repo-anchor-discard-and-guard-the-gateway-2026-11-28.md`
