---
title: A local ledger mirrored to the Stripe customer balance needs reversals before grants, a cap that counts what is still waiting, and one writer per member
date: 2026-11-27
category: logic-errors
module: referrals
problem_type: logic_error
component: payments
symptoms:
  - A refund or lost dispute processed before its credit grant existed was never clawed back, so the grant posted in full for money that had been returned
  - A clawback that crossed the grant's post was recorded as "posted" while nothing was taken from Stripe
  - Two clawbacks for one referrer, or a clawback whose Stripe post failed and was retried later, together took more than the credit left, pushing the customer balance positive (a debt on the next invoice)
  - A lost partial dispute clawed back the whole grant
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components: [database, background_job]
tags: [stripe, customer-balance, ledger, clawback, refunds, disputes, lease, idempotency, ordering, cap]
---

# A local ledger mirrored to the Stripe customer balance needs reversals before grants, a cap that counts what is still waiting, and one writer per member

## Problem
B2 referral credit keeps a local `credits` ledger (grants, clawbacks, lapses) and mirrors each row to the Stripe customer balance with a balance transaction. The first version treated each Stripe event on its own: `invoice.paid` granted, `charge.refunded` and `charge.dispute.closed` clawed back. Two review rounds broke it in five ways, and all five cost real money.

## Symptoms
- **Order:** a refund event handled while `invoice.paid` was still failing and retrying found no grant and was marked done. The grant then posted in full.
- **Crossing writes:** a clawback chose its "unposted grant" branch from a row it had read earlier. Meanwhile the sweep posted the grant. The clawback's insert didn't depend on its grant update, so it recorded a clawback that moved no money.
- **Cap:** clawbacks were capped at the Stripe balance. That doesn't stop two of them, and it doesn't count a clawback written but not yet posted after Stripe failed. Both later posted, and the balance went into debt.
- **Partial disputes:** the code used the charge amount, not the dispute amount.
- **Lease:** one locked pass (paginated refund and balance reads, with retries) could outlive a fixed 120s lease.

## What Didn't Work
- Alert-only handling of the refund-during-post race. The alert's wording was wrong for one of the two orders, and the clawback's unique key blocked any retry.
- Capping at the live Stripe balance alone. The balance also holds credit from other sources, and it doesn't see reversals that are waiting to post.

## Solution
In `src/lib/referrals/credit*.ts`:
- **Reconcile reversals at grant time.** `syncReversals` reads the payment's refunds and lost disputes, oldest first. Each one gets a clawback row keyed by its refund or dispute id, sized from the reversed total so far, using the dispute's own amount. It runs when a grant is created and on every reversal event. Whichever order the events arrive in, the ledger ends the same.
- **Make dependent writes depend.** The unposted-grant clawback row is inserted *from* the grant's update CTE. If the grant was posted in between, re-read it and take the posted branch.
- **Cap by what's really available:** takeable credit = min(Stripe credit − reversals waiting to post, posted grants − posted and waiting reversals). Clawbacks and lapses are re-capped again at post time, against fresh numbers. Any shortfall goes into `uncollected_cents` and is offset against the next grant.
- **One writer per member.** Every grant, clawback, lapse and post runs under a lease `credit:<userId>`. A busy member gets `CreditBusy`: the webhook answers 500 so Stripe retries, sweeps skip the member, and busy is not counted as a failed attempt.
  - The lease lasts longer than the function timeout (360s against 300s).
  - Before each Stripe write, a guard checks elapsed time (240s budget) and renews the lease with the holder in the condition.
- **Replay-safe posting.** Every balance transaction carries `metadata.credit_ledger_id`. Before posting, list the customer's balance transactions (paginated) and adopt one that already carries the row id. Stripe's idempotency keys only last 24 hours, while reconcile looks back 7 days.

## Why This Works
The Stripe balance is one pool, while the events that move it are independent and arrive in any order. The ledger is correct only if (a) each event is reconciled against *all* facts about its payment, not just its own payload, (b) each write that depends on another is a single statement, and (c) only one actor at a time decides how much of the pool to move.

## Prevention
- For any ledger mirrored to an external balance, write the **ledger = −balance** invariant as a test after a mixed sequence: grant, partial refund, lost dispute, offset grant, close. See `src/lib/referrals/credit-reversal.test.ts`.
- Test each event pair in both orders: a reversal before its grant, and a reversal crossing a post.
- A cap must count work that's written but not yet posted, and must be checked again at post time.
- A lease's lifetime must exceed the longest function duration. Check elapsed time before every external write; see `docs/solutions/best-practices/lease-must-guard-every-write-not-just-entry-2026-11-23.md`.

## Related
- `docs/solutions/logic-errors/one-money-rule-two-mechanisms-double-charges-2026-11-23.md`
- `docs/solutions/logic-errors/retry-must-replay-claimed-parameters-2026-11-26.md`
- `docs/solutions/logic-errors/side-effect-tied-to-winning-transition-is-lost-2026-11-22.md`
- `docs/solutions/integration-issues/stripe-endive-embedded-setup-tax-promo-gotchas-2026-11-26.md`
