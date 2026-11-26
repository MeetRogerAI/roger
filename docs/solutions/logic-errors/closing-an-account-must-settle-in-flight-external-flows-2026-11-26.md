---
title: Closing an account must first settle anything still in flight with an outside service
date: 2026-11-26
category: logic-errors
module: billing
problem_type: logic_error
component: payments
symptoms:
  - A member who confirmed their card in Stripe minutes after the 14-day no-card close had the card saved in Stripe but never recorded by Roger
  - The held list stayed locked and the closing email said "no card was added"
root_cause: async_timing
resolution_type: code_fix
severity: high
related_components: [background_job]
tags: [stripe, checkout, setup-session, account-close, housekeeping, reopen, dst]
---

# Closing an account must first settle anything still in flight with an outside service

## Problem
The hourly no-card close (`src/lib/housekeeping/trial.ts`) only updated the `users` row. A member could have the Payment page open (a stored Stripe setup session) and finish it right after the close. Stripe saved the card; Roger's completion saw `status = 'closed'` and refused, so the card was stranded and the member was told nothing was added.

## Symptoms
- Card present on the Stripe customer, `trial_started_at` null, account `closed`.
- Closing email contradicts what the member just did.

## What Didn't Work
- The close statement's write-time re-check ("card saved since the clock was read") only sees cards Roger has *recorded*. A card confirmed in Stripe but not yet processed (return page or webhook lag) is invisible to it.

## Solution
- Before closing: if the member has a stored setup session and Stripe reports it `complete`, run the normal completion (`completeStoredSession` -> Unit 5 path) and skip the close. If Stripe can't be read, leave the member for the next pass rather than closing blind.
- After closing: expire and clear the stored session (`discardSetupSession`); if it turned complete in the meantime, complete it.
- Grace: a completion for an account closed as `no_card` within 7 days reopens it in the same claim statement that records the card (status back to `trial`, `closed_reason`/`access_ends_at` cleared).
- Related timing fix: the 14/21-day closes and reminders add calendar days in Toronto wall time (`addWallDays` in `src/lib/clock.ts`), not `N * 24h`, so DST does not flip whether the Monday teaser or the close happens first; and a repeat teaser is skipped when the close is under 24h away.

## Why This Works
A local state change ("closed") is not authoritative while an outside system can still complete an action the member started. Checking and then shutting the outside flow (and accepting a late completion within a grace window) makes the two systems agree.

## Prevention
- For every terminal state change (close, cancel, delete), list external flows that may be mid-way (payment sessions, invites, uploads) and settle or close them as part of the transition.
- Test the "confirmed just after close" path, not only "closed before anything".
- Add N days in local wall time when the result is compared to a wall-clock schedule (Monday 07:00 Toronto).

## Related Issues
- `docs/solutions/logic-errors/keep-forever-guard-needs-exit-on-terminal-failure-2026-11-26.md`
- `docs/solutions/best-practices/job-clock-not-database-now-2026-11-23.md`
- Plan: `docs/plans/2026-11-26-001-feat-payment-at-first-curation-plan.md`, "Review fixes (Unit 7)"
