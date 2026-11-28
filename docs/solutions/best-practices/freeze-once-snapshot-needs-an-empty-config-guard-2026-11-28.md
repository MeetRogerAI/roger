---
title: A measure frozen once needs an idempotent insert, a clock that can't run ahead, and a guard against freezing with empty config
date: 2026-11-28
category: best-practices
module: admin
problem_type: best_practice
component: background_job
applies_when:
  - A decision value (a checkpoint, a launch gate, a quarter's result) must be computed once at a set time and never change after
  - The value is computed from live tables that keep changing after the freeze
  - The computation depends on configuration (an admin list, an exclusion list) that may be missing on some deployments
  - Several requests or jobs may be first to reach the freeze time at once
symptoms:
  - Without a snapshot the December 14 checkpoint would keep changing as late sign-ups and retention changed the tables
  - Two first calls at the same moment could each compute and store a value
  - A test clock or a simulated "as of" time could freeze the checkpoint before December 14 really arrived
  - With ADMIN_EMAILS unset on production, the first call would freeze a value that counted the admins' own accounts as members, for good
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components: [database]
tags: [snapshot, freeze, checkpoint, measures, idempotency, on-conflict, job-clock, config-guard, neon-http]
---

# A measure frozen once needs an idempotent insert, a clock that can't run ahead, and a guard against freezing with empty config

## Context
B3 Unit 3's loop measures are computed live from the tables on every load, with no cache. The one exception is the December 14 checkpoint: pooled k over the weeks of November 23, November 30 and December 7, against a 0.25 floor (`decemberCheckpoint` in `src/data/config.ts`). It is the number the launch decision is made on, so it must be computed once and then stay the same. The B3 Unit 3 review and the whole-branch review found the ways it could freeze wrong.

## Guidance
- **Freeze on first read after the time, with `on conflict do nothing`.** `snapshotCheckpoint` runs from the measures page and at the start of the weekly review job. At or after `frozenFrom` 00:00 Toronto, the first call computes the value with the same live `K_SQL` the page uses. It inserts the value, plus the per-week numerators and denominators, under one key (`checkpoint-2026-12-14`). It then **reads back whichever row won**. Neon over HTTP has no transactions, so these are two single statements: the insert is idempotent, and the read after it is authoritative. Concurrent first calls store one row, and later calls never change it.
- **Never ahead of the real clock.** The freeze time is `min(job clock, real clock)`. A test clock or an admin's "as of" time can't freeze the value early, and a real call before the date returns null (the page shows the live, in-progress value).
- **Refuse to freeze with empty config.** Admin accounts are never members. If `ADMIN_EMAILS` is empty on production, the first call returns null instead of freezing: the page keeps showing the live value, and the freeze happens on the first call after the list is set. An empty list is the one input that would make a permanent value permanently wrong. Every other input is the data the measure is meant to capture.
- **Store counts, not people.** `detail` holds the floor and each week's `num` and `den`. It holds no user ids, so the row has no foreign key, outlives every account, and isn't member data for retention.
- **Show which state the value is in.** `not_started` (before the first week), `in_progress` (live, from the weeks begun), `frozen` (read from the snapshot, with its `computed_at`). The page then never presents a live number as the decision value.

## Why This Matters
A frozen value is only useful if it is right the moment it freezes. There is no recompute path by design, so any bad input at that moment becomes the permanent record. Guard the inputs that can be missing or early (config and clocks), and let the data be whatever it is.

## When to Apply
Any "compute once at time T, then never change" figure: checkpoints, gates, end-of-period results, published league tables. The same pattern works for any idempotent first write that a later read must trust.

## Examples
- `src/lib/admin/measures.ts`: `snapshotCheckpoint`, `checkpointFrom`, `loadMeasures` (falls back to the live in-progress value).
- `db/schema.sql`: `measure_snapshots` (key primary key, written with on conflict do nothing, never updated).
- Tests: `src/lib/admin/measures.test.ts` (concurrent first calls store one row, no freeze before the date by either clock, no freeze with an empty admin list on production, frozen value unchanged by later data).

## Related
- `docs/solutions/best-practices/freezing-past-periods-of-a-cache-needs-grace-and-a-rebuild-marker-2026-11-27.md` (the opposite choice: a cache whose frozen periods *can* be rebuilt)
- `docs/solutions/best-practices/job-clock-not-database-now-2026-11-23.md` (the job clock never runs ahead of the real one)
- `docs/solutions/database-issues/data-modifying-cte-runs-even-when-insert-conflicts-2026-11-22.md` (on conflict do nothing, and what still runs)
- `docs/solutions/best-practices/fail-closed-read-log-one-statement-before-render-2026-11-28.md`
