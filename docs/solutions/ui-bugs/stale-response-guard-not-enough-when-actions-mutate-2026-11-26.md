---
title: A "drop stale responses" counter is not enough when the racing calls also change server state
date: 2026-11-26
category: ui-bugs
module: payment
problem_type: ui_bug
component: payments
symptoms:
  - After a currency switch the Price Box could show US$ totals while the card session (and the first charge) was in CAD
  - Switching currency during "Start free trial" remounted the card form and allowed a second confirm
  - An applied promo could show next to an undiscounted total
root_cause: async_timing
resolution_type: code_fix
severity: high
tags: [react, race-condition, stripe-elements, server-actions, optimistic-ui, mutual-exclusion]
---

# A "drop stale responses" counter is not enough when the racing calls also change server state

## Problem
The Payment page (`src/components/app/payment/payment-form.tsx`) used a sequence counter: every quote, currency switch and promo call took `n = ++seq`, and a response was shown only if `n === seq`. That works for read-only calls. But the currency switch and promo calls *write* (account currency, Stripe session, pending promo) and returned several things; when superseded, the code dropped the price yet still applied the session or promo. The screen and the server then disagreed, and a currency switch during a pending card confirm remounted the Stripe form (new client secret = new provider `key`) and reset the per-instance double-submit guard.

## Symptoms
- Price Box in the old currency next to a session in the new one; the first charge would not match what was shown.
- Two confirms possible across a remount.
- A failed switch (`open()` refused after the currency write) left the client on the old currency while the server had moved.

## What Didn't Work
- Per-response sequence checks: they decide which *display* wins, not which *server write* happened. A dropped response can still describe the real server state.
- A `useRef` one-at-a-time guard inside the card form component: it resets when the provider remounts.

## Solution
- One `exclusive()` lock owned by the top-level form (`src/components/app/payment/confirm-card.ts`), shared by confirm, currency switch, promo apply/remove and retry. One `busy` state disables the toggle, promo controls, retry and submit while any of them runs. Quotes wait while a mutation runs; starting a mutation drops in-flight quotes; after it finishes, re-quote only if the location changed.
- Mutating actions always return the server's authoritative state (currency, price, promo, session), including on failure (`current`), and the client always applies it regardless of quote ordering (`src/app/start/payment/actions.ts`, `setPaymentCurrency`, `openSession`).
- Invalidate an in-flight read when its input becomes invalid (bump the counter before the early return).

## Why This Works
Mutual exclusion removes the interleavings instead of trying to reconcile them afterwards, and "mutations return the truth" makes the server the single source for anything a write touched. The sequence counter is kept only for what it is good at: ordering read-only quotes.

## Prevention
- Classify each async call as read-only or mutating. Sequence guards are fine for reads; mutations need a shared lock plus an authoritative response.
- Keep double-submit guards above any component that can remount (provider `key` changes remount children).
- Test with deferred promises resolved in reverse order (`src/components/app/payment/payment-form.dom.test.tsx`, happy-dom per-file environment).

## Related Issues
- `docs/solutions/ui-bugs/react-19-form-action-reset-brings-back-stale-defaults-2026-11-23.md`
- `docs/solutions/integration-issues/stripe-endive-embedded-setup-tax-promo-gotchas-2026-11-26.md`
- Plan: `docs/plans/2026-11-26-001-feat-payment-at-first-curation-plan.md`, "Review fixes (Unit 6)"
