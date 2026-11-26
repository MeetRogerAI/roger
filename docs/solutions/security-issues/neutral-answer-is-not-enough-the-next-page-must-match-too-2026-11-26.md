---
title: "A neutral answer is not enough: the page it leads to must match too"
date: 2026-11-26
category: docs/solutions/security-issues/
module: site
problem_type: security_issue
component: free_zack_run
symptoms:
  - A public form answers the same way for a new email, a repeat email and an email that already claimed a run
  - The page the answer redirects to shows the instructions for the first two and "this link is no longer active" for the third
  - The action tests pass, because they compare only the action's return value
root_cause: incomplete_check
resolution_type: code_fix
severity: medium
tags: [enumeration, public-form, token, free-runs, on-conflict, neutral-response]
---

# A neutral answer is not enough: the page it leads to must match too

## Problem
The free Zack run at `/zack` takes an email and returns a token. To avoid telling an outsider which emails already belong to customers, the start action returned the same shape in every case, and never an existing token. For an email whose run had already been claimed at sign-up, the write was a deliberate no-op: the statement ended `where free_runs.claimed_by is null`, and the action still returned a freshly minted token.

That token matched no row. The action's answer was neutral, but the next page was not: a new email reached the instructions, and a claimed email reached "this run link is no longer active". Anyone could learn whether an address had a Roger account by submitting it and looking at the next screen. The same no-op also trapped a returning visitor in a loop.

## Why the tests missed it
The tests asserted that the action's return value had the same shape in all three cases. None followed the returned token into the page read. Three reviewers found it independently by tracing one step further than the tests did.

## Solution
Make the three cases the same in the database, not only in the response. The start statement now resets the row whatever its state:

```sql
insert into free_runs (token, email, agent, created_at)
values ($1, $2, $3, $4)
on conflict (email, agent) do update
  set token = excluded.token, report = null, report_at = null, claimed_by = null, created_at = excluded.created_at
```

This was safe here because the claim copies the report into `runs` before it marks the row, so a claimed `free_runs` row is only a marker (`claimFreeRun` in `src/lib/zack/receive.ts`). Check that before resetting anything that looks like a record.

## Prevention
- When a flow must not reveal which case it is in, test the whole path the visitor sees: take the action's answer, follow it into the next read, and assert the same view for every case. `src/lib/site/free-run.pg.test.ts` and `src/components/site/v1/zack.test.tsx` do this for new, repeat and claimed emails.
- A write that silently does nothing while the code returns success is a signal. Whatever the caller does next with the returned value will behave differently from the cases where the write happened.
- Prefer making the cases identical in stored state over making different states look alike. Looking alike has to be re-proved at every later screen; being alike does not.
