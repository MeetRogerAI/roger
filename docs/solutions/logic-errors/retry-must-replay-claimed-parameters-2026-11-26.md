---
title: A retry of a money call must replay the parameters the claim recorded, not re-read live state
date: 2026-11-26
category: logic-errors
module: billing
problem_type: logic_error
component: payments
symptoms:
  - A first-charge takeover (15 minutes after an "unknown" result) re-sent subscription create with the member's current coupon, not the one the claim was made with
  - Either Stripe rejected the reused idempotency key with different parameters, or a subscription was created at an amount the member was never told
  - The same-Monday charge gap (second free list at 07:00, charge cron re-running every 10 minutes) charged a member a week early
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [stripe, idempotency, claims, takeover, coupons, subscriptions, cron]
---

# A retry of a money call must replay the parameters the claim recorded

## Problem
`chargeFirst` claims a `charge_attempts` row (price, amount, currency) and calls `createSubscription` with an idempotency key derived from the claim. The takeover path for a stuck claim rebuilt the call from the member's *current* row, including `promo_coupon`. Between claim and takeover the coupon could be dropped (coupon gone at preview) or changed (a new card save), so the replay no longer matched the original request.

Separately, the charge job selected trials with `free_lists_used >= freeRuns` and a picked week, without checking whether that week's delivered list was itself the second free list; the Monday cron re-runs after the 07:00 send charged it.

## Symptoms
- Stripe `idempotency_error` (same key, different params) settled as a generic error, or a full-price subscription with no amount-changed notice.
- A scenario test driving the real `vercel.json` schedules showed a member `active` on the Monday of their second free list.

## What Didn't Work
- Re-reading "what the member has now" on retry: correct for a fresh attempt, wrong for a replay. A replay must be byte-identical to the request whose outcome is unknown.
- Testing each guard only through the full scenario: the `due`-query clause and the `chargeFirst` skip each mask the other, so the scenario only fails when both are removed.

## Solution
- Record every parameter that affects the amount on the claim (`charge_attempts.coupon` alongside price/amount/currency) and have the takeover replay exactly those (`src/lib/billing/first-charge.ts`, `claimedPrice`, `takeOverFirstCharge`). Live state may change; the replay ignores it (a warning is logged when they differ). Do not let other paths mutate those inputs while a claim is unsettled.
- Make fakes enforce Stripe's idempotency contract (same key + different params -> error) so tests catch drift (`src/test-helpers/fake-card-gateway.ts`, `tests/scenarios/helpers.ts`).
- Guard "no charge for a week whose delivered list is a free list" in both the job's selection and the charge function (`FREE_LIST_WEEK_SQL`), and unit-test each guard alone.

## Why This Works
The claim is the record of what was attempted and what the member was told. Replaying from it keeps the retry identical to the attempt, which is exactly what idempotency keys require and what "charge = told amount" requires.

## Prevention
- For every claimed external call, list the inputs that change its result and store them on the claim.
- Fakes must reject reused keys with different parameters.
- When two guards protect one invariant, test each with the other removed.
- Drive scheduled jobs with the real cron schedule in a scenario test (re-runs are where "already done this week" bugs hide).

## Related Issues
- `docs/solutions/logic-errors/one-money-rule-two-mechanisms-double-charges-2026-11-23.md`
- `docs/solutions/logic-errors/side-effect-tied-to-winning-transition-is-lost-2026-11-22.md`
- Plan: `docs/plans/2026-11-26-001-feat-payment-at-first-curation-plan.md`, "Unit 8", "Review fixes (Unit 8)"
