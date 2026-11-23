---
title: A data-modifying CTE always runs, even when the outer insert does nothing
date: 2026-11-22
category: docs/solutions/database-issues/
module: zack
problem_type: database_issue
component: database
symptoms:
  - A free-tool token is marked claimed but no run was stored for the user
  - The function returns false, which looks the same as "there was no token"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [postgres, cte, on-conflict, claim-first, neon-http, single-statement]
---

# A data-modifying CTE always runs, even when the outer insert does nothing

## Problem
On Neon over HTTP there are no interactive transactions, so "claim, then insert" is written as one statement. The first version put the claim in the CTE and the insert outside it:

```sql
with c as (update free_runs set claimed_by = $1 where ... returning report)
insert into runs (...) select ... from c
on conflict do nothing
```

When the user already had a run for the week, the insert hit the conflict and stored nothing, but `free_runs.claimed_by` was already set. The report was spent and could never be claimed again.

## Symptoms
- A row marked claimed with no matching run.
- No error: `on conflict do nothing` succeeds quietly.

## What Didn't Work
- Reading the statement as "the update only matters if the insert uses its rows". Postgres runs every data-modifying CTE to completion, whether or not the outer statement uses or keeps its output.

## Solution
Make the side effect you might need to skip depend on the one that can fail. Here: select the candidate, insert, then claim only if the insert returned a row:

```sql
with f as (select ... from free_runs ... where <checks>),
ins as (insert into runs (...) select ... from f on conflict do nothing returning id)
update free_runs set claimed_by = $1
where token = (select token from f) and exists (select 1 from ins)
returning token
```

Add the guard you rely on (`not exists (select 1 from runs where ...)`) to `f` as well, so the common case is explicit instead of relying on a conflict.

## Why This Works
All parts of the statement share one snapshot and commit together. Putting the claim last and conditioning it on `ins` means "spent" and "stored" can only happen together.

## Prevention
- In any single-statement claim, put the irreversible write (spending a token, marking sent) last, gated on `exists (select 1 from <previous step>)`.
- Test the conflict path: create the conflicting row first, run the claim, assert the claim column is still null.
- The same shape applies to later units (charge claims, notification claims).

## Related Issues
- `src/lib/zack/receive.ts` (`claimFreeRun`), `src/lib/zack/receive.test.ts`
- `docs/solutions/best-practices/test-claim-sql-on-pglite-2026-11-22.md`
