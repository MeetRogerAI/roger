---
title: Any timestamp a later rule reads must come from the job clock, not the database's now()
date: 2026-11-23
category: docs/solutions/best-practices/
module: billing
problem_type: best_practice
component: background_job
applies_when:
  - A job takes a simulated time (an "as of" run, a test clock, a scenario test) and writes a timestamp
  - A later rule (a close date, a hold, a renewal period, a reconcile cursor) compares against that timestamp
last_updated: 2026-11-26
tags: [clock, as-of, testing, postgres, now, scenario-tests, cron]
---

# Any timestamp a later rule reads must come from the job clock, not the database's now()

## Context
Roger's jobs take a `now` argument (the job clock) so admins can run a Monday "as of" a time on preview, and tests can move time week by week. Across Units 12 to 19 the same bug came back at least seven times: a statement wrote `now()` (the database's real time) where the job was running at a simulated time, and a later rule read that stamp:
- claim guards compared `now()` with a simulated charge time (Unit 12);
- `first_charge_at` and the billing anchor were written with `now()` (Unit 14);
- `zack_settings_history.changed_at` was compared with a job-clock cutoff (Unit 14);
- the webhook handler used the real clock (seams review);
- `reconcile.lastFinished` was written ahead of real time by an "as of" run, which then blocked real runs (seams review);
- `picks.delivered_at` was stamped with `now()`, so the trial close counted from the real date and closed a member two weeks early in the scenario tests (Unit 19).

On production the two clocks agree, so none of these show there. They break the preview "as of" runs and every multi-week test, which are exactly the tools meant to catch money bugs before go-live.

## Guidance
- When a statement writes a time that any later rule reads, pass the job clock as a parameter: `coalesce($n::timestamptz, now())`, with `now` an optional argument so one-off callers still work.
- When a rule compares stored times, compare against the job clock parameter, never `now()` in SQL.
- A marker that gates future real runs (a "last finished" cursor) must never be written ahead of real time: `min(jobNow, Date.now())`.
- Pure audit stamps (`created_at`, `updated_at` nobody reads in a rule) can stay on `now()`.
- Never decide "which happened first" by comparing two stamps written by different callers. Each caller has its own job clock: an hourly pass that started at 10:00:00 can deliver a list *after* a return page stamped the card at 10:00:20, yet stamp it 10:00:00. Identify the event by state or order instead ("the member's first-ever delivered list"), not `delivered_at >= trial_started_at` (payment-at-first-list Unit 5, `src/lib/cora/unlock.ts` `UNLOCK_DUE_SQL`).
- Windows measured against a stamp that a helper writes with the database's `now()` (e.g. `notifications.claimed_at`) must use `least(jobClock, now())`, not the job clock alone, or tests on a simulated clock see the window as open or shut wrongly.

## Why This Matters
The multi-week scenario tests found the last instance only because they drive the real jobs through several simulated Mondays. A unit test that inserts the timestamp directly never sees it.

## When to Apply
Every new job, webhook handler or hourly task that writes a time, and every review of one: grep the diff for `now()` and ask "does any rule read this later?"

## Examples
```sql
-- before: the trial close counts from the real date during an "as of" run
update picks set delivered_at = now() where ...
-- after
update picks set delivered_at = coalesce($4::timestamptz, now()) where ...
```

Related: [[lease-must-guard-every-write-not-just-entry-2026-11-23]], [[test-claim-sql-on-pglite-2026-11-22]].
