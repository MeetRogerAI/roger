---
title: A cache that freezes past periods needs a grace window, a rebuild-owed marker, and business-key ordering
date: 2026-11-27
category: best-practices
module: growth
problem_type: best_practice
component: background_job
applies_when:
  - A derived table (points, totals, scores) is cached per period and past periods are treated as final to bound the work
  - Inputs can arrive late or backdated (late merges, imports dated in the past, admin re-links)
  - "Which happened first" rules compare events written by different jobs
symptoms:
  - A point stamped inside a week but committed after the week rolled over was lost forever
  - Linking or unlinking a seed contributor left wrong points in closed weeks, with no repair path
  - Confirmation and contribution rules compared stamps written by different job clocks
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components: [database]
tags: [cache, leaderboard, points, freeze, grace-window, rebuild, job-clock, ordering, idempotency]
---

# A cache that freezes past periods needs a grace window, a rebuild-owed marker, and business-key ordering

## Context
B2 Unit 6 caches leaderboard points per Toronto week (`points`), and treats past weeks as final so the hourly refresh doesn't recompute all of history. Three review rounds showed that "final" has to be earned, and has to be undoable.

## Guidance
- **Close a period only after a grace window.** A week is final once a row was written at least 9 days after its Monday (the week plus two days), not the first time a pass runs after Monday 00:00. Jobs that stamp events inside the week, such as Cora merges and late deliveries, can commit after the rollover.
- **Keep a persistent "rebuild owed" marker for inputs that land in frozen periods.** Late merges with an old `contributed_week`, seed imports dated in the past, and seed link or unlink all set `settings['points.rebuildOwed']` to a fresh random token. The hourly task runs a full rebuild when the marker is set. It clears the marker with a **compare-and-clear on the token**, so a marker set during the rebuild survives. A rebuild that loses the lease leaves the marker for the next pass instead of telling an admin to remember.
- **Bound the routine refresh to the periods that can still change:** weeks after the newest closed one. Keep the unbounded computation for tests and the rebuild.
- **Order by business key, not timestamps from different jobs.** "Confirmed after delivery" means the pick's `week_of` is earlier than the confirming run's `week_of`. "Contributed before the pick" means `contributed_week` is earlier than the pick's week. This follows `job-clock-not-database-now-2026-11-23.md`.
- **One definition of the period.** A single SQL expression (`WEEK_OF_SQL`, using `TORONTO` from `clock.ts`) matches `currentMonday()`, with a test at Sunday 23:59, Monday 00:00 and both DST changes.

## Why This Matters
Without the grace window, data from the end of the week is silently dropped. Without the marker, an admin's correction never reaches history, and the cache disagrees with a fresh computation forever. Both failures are quiet: no error, just a wrong leaderboard.

## When to Apply
Any per-period cache that skips "closed" periods: weekly points, monthly scorecards, season totals. It applies whenever inputs can be late, backdated or re-linked.

## Examples
- `src/lib/growth/points.ts`: `refreshPoints` (bounded), `rebuildPoints` (full, single statement under the `points-refresh` lease), `runPointsTask` (marker plus compare-and-clear), `owePointsRebuildFor`.
- Tests: `src/lib/growth/points.test.ts`, `src/lib/cora/merge.test.ts` (late contributor sets the marker, and the next pass credits the closed week; a marker set mid-rebuild survives).

## Related
- `docs/solutions/best-practices/job-clock-not-database-now-2026-11-23.md`
- `docs/solutions/best-practices/lease-must-guard-every-write-not-just-entry-2026-11-23.md`
