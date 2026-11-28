---
title: A stamp that depends on a job step succeeding must be written when that step succeeds, not when it starts
date: 2026-11-26
category: logic-errors
module: cora
problem_type: logic_error
component: background_job
symptoms:
  - A member without a card could lose both their older held list and the new one when Cora's week failed after its picks were recorded
  - No teaser, no unlock and no error for that member; the admin alert only said the week would not be sent
root_cause: async_timing
resolution_type: code_fix
severity: high
related_components: [payments, database]
tags: [cora, held-list, supersede, lease, state-machine, failure-path, job-phases]
---

# A stamp that depends on a job step succeeding must be written when that step succeeds, not when it starts

## Problem
Members without a card get a titles-only "held" list. When a newer week is picked, the older held list is marked `superseded_at` so only the newest can ever be unlocked. The stamp was written in the pick statement (`RECORD_PICKS_SQL`), while the new Cora week was still `running`. If that week then failed and never reached `ready`, the older list was already superseded and the newer one never became visible, so the member was left with nothing to unlock.

## Symptoms
- A week fails after picks (model refusal, errors exhausted, cutoff, lost lease): the member sees no teaser and a later card save unlocks nothing.
- Every reader (`HELD_WEEK_SQL`, `DELIVERABLE_SQL`, `deliverLate`) correctly skipped superseded rows and correctly required the newer week to be `ready`/`sent`, so each piece looked right in isolation.

## What Didn't Work
- Stamping at pick time "because the new picks exist now". Picks existing is not the same as the week succeeding: the phase machine can still fail the week.
- A predicate alternative was considered: treat `superseded_at` as effective only while a newer week for the member is `ready`/`sent`. It works, but every reader (held view, delivery, late delivery, unlock, charge) needs the extra join. Missing it in one reader brings the bug back, so it was rejected in favour of moving the write.

## Solution
Move the stamp into the same lease-guarded statement that turns the week `ready` (`SUPERSEDE_AT_READY_SQL` in `src/lib/cora/job.ts`). In one statement: the week moves `running` -> `ready` only if this holder still owns it and it is not a dry run; and for no-card members (plus trials whose first list is still pending) every undelivered picked/short week older than their newest week in a ready/sent Cora week is stamped `superseded_at` with the job clock.

```ts
// before: inside RECORD_PICKS_SQL (pick phase, week still 'running')
//   update cora_user_weeks set superseded_at = coalesce($10::timestamptz, now())
//   where user_id = $1 and week_of < $2 and delivered_at is null ...
//
// after: the ready transition owns it
const rows = await q(SUPERSEDE_AT_READY_SQL, [o.week, o.holder, o.now.toISOString()]);
return rows.length ? "ready" : phase; // nothing returned = lease lost or dry run: no stamp, no ready
```

`RECORD_PICKS_SQL` now only records picks (still lease-guarded). A companion guard in `DELIVERABLE_SQL` stops a trial's first list being delivered while Cora is still picking a newer week, so a card saved mid-run gets the new week once it is ready, or the old one again if the new week fails.

## Why This Works
"Supersede" is a consequence of the newer week *succeeding*, so it belongs to the transition that declares success. Putting both in one statement makes them atomic on Neon HTTP (no interactive transactions): either the week is ready and older lists are superseded, or neither happened. A failed week supersedes nothing, so the older held list stays teaser-able and unlockable.

## Prevention
- When a write is justified by a later step's outcome ("the new X replaces the old X"), write it in the statement that records that outcome, not in an earlier step of the same job. Ask: "if the job fails right after this line, is this write still true?"
- Prefer moving the write over adding a compensating predicate to every reader; one write site is easier to keep right than N readers.
- Test the failure path explicitly: picks recorded, then the week fails -> older held list still visible and unlockable (`src/lib/cora/held-list.test.ts`, `src/lib/cora/job.test.ts`).
- Keep the lease and dry-run guard on the combined statement (see the lease doc below).

## Related Issues
- `docs/solutions/best-practices/lease-must-guard-every-write-not-just-entry-2026-11-23.md` (the combined statement is lease- and dry-run-guarded)
- `docs/solutions/database-issues/data-modifying-cte-runs-even-when-insert-conflicts-2026-11-22.md` (single-statement ordering on Neon HTTP)
- `docs/solutions/best-practices/job-clock-not-database-now-2026-11-23.md` (`superseded_at` uses the job clock)
- Plan: `docs/plans/2026-11-26-001-feat-payment-at-first-curation-plan.md`, "Review fixes (Units 1–3)"
