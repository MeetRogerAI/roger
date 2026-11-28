---
title: A "never replace this" guard needs an exit for every terminal failure, or the user is stuck in a loop
date: 2026-11-26
category: logic-errors
module: billing
problem_type: logic_error
component: payments
symptoms:
  - After Stripe Tax rejected a billing address, every return to the Payment page bounced straight back to "We need a fuller billing address" with no form to fix it
  - The member could never save a card, so their held list could never unlock
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [stripe, checkout, setup-session, dead-end, state-machine, tax-address]
---

# A "never replace this" guard needs an exit for every terminal failure

## Problem
To avoid orphaning a confirmed card, `openEmbeddedSetup` never replaces a stored setup session whose status is `complete` (Unit 4 review fix). The completion then validates the tax address; on `address_invalid` it returned early and left that complete session stored. Every later visit to Payment saw "complete", ran the completion again, got `address_invalid` again, and redirected back. The address comes from the session itself, so the member had no way to change it.

## Symptoms
- `/start/payment?error=address` loops with no usable card form.
- `users.setup_session` points at a `complete` session forever; `trial_started_at` stays null.

## What Didn't Work
- Each guard was right on its own: "keep a complete session" protects a confirmed card; "refuse a bad tax address" protects billing. Together they form a cycle with no exit. Single-path tests (one redirect) did not show it; only a "fail, then come back" test does.

## Solution
On the terminal failure, release the resource the keep-guard protects, with a compare-and-set so a racing success is not clobbered:

```sql
update users set setup_session = null
where id = $1 and setup_session = $2 and trial_started_at is null
```

The next Payment visit finds no stored session, opens a fresh one, and the member re-enters the address (`src/lib/billing/card-setup.ts`, `completeCardSetup`).

## Why This Works
"Keep the complete session" exists so a confirmed card can still be completed. Once completion has definitively refused that session (not a transient error), keeping it has no value and only blocks recovery. Releasing it is safe because the card was never recorded and the claim (`trial_started_at is null`) guarantees no successful save is undone.

## Prevention
- For every "never replace / never delete X" rule, list the terminal outcomes of the step that consumes X and make sure each either succeeds or releases X.
- Test the recovery path, not just the error: fail -> return -> can proceed (`src/lib/billing/card-save.test.ts`, "address_invalid then a fresh session").
- Distinguish terminal refusals (release) from transient errors (keep and retry).

## Related Issues
- `docs/solutions/integration-issues/stripe-endive-embedded-setup-tax-promo-gotchas-2026-11-26.md`
- Plan: `docs/plans/2026-11-26-001-feat-payment-at-first-curation-plan.md`, "Review fixes (Unit 4)", "Review fixes (Unit 5)"
