---
title: A job lease must guard every write, not only who gets in
date: 2026-11-23
category: docs/solutions/best-practices/
module: cora
problem_type: best_practice
component: background_job
severity: high
applies_when:
  - A scheduled job works in phases across several invocations
  - Two kinds of run (real and dry, or a cron and a manual "run now") share one row
  - Each invocation has a time budget and model or network calls that can outlast it
tags: [lease, cron, background-jobs, idempotency, neon-http, dry-run, resumable]
---

# A job lease must guard every write, not only who gets in

## Context
The Cora job takes a lease on its week row (`update cora_weeks set lease_until = ... where lease_until < now()`) and then writes phases, picks and the final "ready". The review found that only *entry* was guarded. Every later write was keyed by the week alone (`where week_of = $1 and status = 'running'`). So:
- A dry run still working when the real cron started had its row deleted and replaced, kept going, and wrote "picked" and "ready" into the **real** week, skipping users.
- A worker whose lease expired during a slow model call kept writing beside the new holder.
- Each worker's `finally` cleared the lease *whoever held it*, letting a third worker in.

## Guidance
- Store a **holder** with the lease, and put `holder = $me` in **every** write: each phase change, the final status, the failure update, and the lease release.
- **Renew** the lease before each unit of work (each step, each batch of users) with `where holder = $me`; if the renewal updates nothing, stop at once.
- Keep the kind of run on the row and in every condition (`dry_run = $dry`). Never delete or replace a row whose lease is live; answer "busy" and let the next invocation try.
- Give each kind its own alert key, so a dry run's failure cannot use up the real week's once-only alert.
- Fail on what retrying cannot fix (no credits, a refused key, the deadline); count passing errors and retry them in the next invocation instead of failing the whole run on one blip.
- When the last step is trivial (marking "ready"), let it run even past the budget or the deadline check, so a fully done run is never failed on a technicality.

```ts
const rows = await q(
  `update cora_weeks set phase = $3 where week_of = $1 and holder = $2 and status = 'running' returning week_of`,
  [week, holder, next],
);
if (!rows.length) return; // someone else holds the week now: stop
```

## Why This Matters
With HTTP-only Postgres there is no transaction to hold a lock across a model call, so the lease is the only protection. A lease that guards entry but not writes looks safe in single-connection tests and fails in production exactly when it matters: overlapping cron runs, a slow model, or an admin's manual run.

## When to Apply
Any resumable job here: the Cora job, and the charge and send jobs (Units 12 and 13), and any admin "run now" that shares a row with a scheduled run.

## Examples
- `src/lib/cora/job.ts`: `renew()`, `setPhase`, `failWeek(..., holder)`, the `finally` release, `clearDryRun` (only deletes rows whose lease has expired).
- Tests: `src/lib/cora/job.test.ts`, "a real run waits while a dry run still holds the week" and "a dry run's failure alert never uses up the real week's alert".

## Related
- `docs/solutions/database-issues/data-modifying-cte-runs-even-when-insert-conflicts-2026-11-22.md`
