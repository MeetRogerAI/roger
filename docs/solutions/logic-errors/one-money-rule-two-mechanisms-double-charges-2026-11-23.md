---
title: One money rule billed through two mechanisms keeps producing double charges
date: 2026-11-23
category: docs/solutions/logic-errors/
module: billing
problem_type: logic_error
component: payments
symptoms:
  - A month with sharing off at one cutoff and two missed weeks billed the higher-rate difference twice (higher subscription price plus an adjustment item)
  - Toggling sharing around the Sunday cutoff avoided both the higher price and the adjustment
  - Every round of review fixes produced new double-charge or never-charged scenarios at the seams
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [stripe, billing, invoice-items, subscriptions, single-source-of-truth, contributor-rule]
---

# One money rule billed through two mechanisms keeps producing double charges

## Problem
The contributor rule says a monthly member pays the higher rate for a month in two cases: sharing was off, or Zack missed a second week. Unit 14 first billed the first case by moving the Stripe subscription to the higher price, and the second by adding a pending invoice item for the difference. Three review rounds each found new money bugs where the two met.

## Symptoms
- Both penalties applied to the same month, so the difference was billed twice.
- A member could avoid both: turn sharing off before a cutoff (that week is "by choice", not a miss) and back on afterwards (the price moves back before the renewal).
- Keeping Stripe's price in step needed an hourly read of every subscription. At about 2,000 members this ran past the function's time limit and stopped the hourly tasks after it.
- Each fix (a derived price, an hourly sync, dropping the item when the price moves) added a new race: same-minute idempotency key replays, drops inside the renewal draft window, and boundary cases at the renewal.

## What Didn't Work
- Deriving the subscription price from stored facts and syncing it hourly. It was correct in isolation, but it still had to agree with the item mechanism. It cost one Stripe call per member per hour, and price moves raced with user clicks.
- Patching each seam (drop the item when the price moves, restore it when sharing comes back). Every patch created another seam.

## Solution
Bill the rule through one mechanism.
- After the first charge the subscription always stays at the standard price. A sharing change never calls Stripe.
- A billing month owes "the difference" if any cutoff in it found sharing off, or it has more misses than are forgiven. That is one `pending_adjustments` row per (user, period), with a `reason`, placed as one invoice item before the renewal. The unique index on live rows makes a second charge for the month impossible.
- The first charge for a member who was not sharing at the cutoff is the standard price plus `add_invoice_items` for the difference. The told quote previews the same item, and that month is recorded as already billed.
- Only cutoffs count, so changing sharing between cutoffs does nothing.

## Why This Works
There is now a single place that decides whether a month owes, and a single object in Stripe per month that carries it. A double charge would need two live rows for the same (user, period), which the index forbids. Missing a charge needs the row to be dropped, and drops are refused once the renewal may already be drafted.

## Prevention
- When a rule produces one amount owed per period, give it one row per period and one billing object. Never use two mechanisms that must agree, such as a price on the subscription plus a line item.
- Do not keep Stripe state in step with frequently changing user settings. Read settings only at fixed points (the cutoff) and bill what those points decided.
- Test the combinations, not just each path: both triggers in one month means exactly one difference.
- Related: [[side-effect-tied-to-winning-transition-is-lost-2026-11-22]], [[lease-must-guard-every-write]].

## Related Issues
- `src/lib/billing/contribution.ts`, `src/lib/billing/adjustment.ts`, `src/lib/billing/first-charge.ts`
- PR #38; plan Unit 14 as-built note (records the spec deviation)
