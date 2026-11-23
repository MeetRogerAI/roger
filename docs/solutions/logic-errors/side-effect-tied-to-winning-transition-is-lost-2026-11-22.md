---
title: A side effect sent only by the request that wins a state change is lost when that send fails
date: 2026-11-22
category: docs/solutions/logic-errors/
module: billing
problem_type: logic_error
component: payments
symptoms:
  - The trial starts but the welcome email (with the first-charge date) never arrives after one Resend failure
  - Later webhook retries and page visits return "done" without trying the email again
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [idempotency, claim-first, notifications, webhooks, stripe, at-most-once, side-effects]
---

# A side effect sent only by the request that wins a state change is lost when that send fails

## Problem
`completeCardSetup` moved a user from `signup` to `trial` with a conditional update (`where status = 'signup' returning ...`), and only the caller whose update returned a row sent the welcome email. If that send failed, every later call (the webhook retry, a page refresh) saw `status = 'trial'`, returned "done" early, and never sent it. All five reviewers of Unit 7 found this independently.

## Symptoms
- A user in trial with no welcome email, which is the only message stating the first-charge date.
- No retry, and often no admin alert, because the mail layer's re-claim needs a second trigger that never comes.

## What Didn't Work
- Relying on the mail layer's "a failed send can be claimed again" rule. It only helps when something calls the send again with the same (kind, ref), and the early return removed every such call.

## Solution
Separate "do the transition once" from "make sure the side effect happened":

```ts
if (u.status === "signup") {
  const started = await q(`update users set status = 'trial' ... where id = $1 and status = 'signup' returning ...`);
  const row = started[0] ?? (await loadUser(q, u.id)); // someone else may have won
  return row?.status === "trial" ? sendWelcome(row, o) : "pending";
}
if (u.status === "trial") return sendWelcome(u, o); // every later visit tries again

async function sendWelcome(u, o) {
  const r = await sendToUser(u, "welcome", "signup", ...); // claim makes repeats free
  if (r === "failed") throw new WelcomeNotSent();           // webhook answers 500, Stripe retries
  return "done";
}
```

## Why This Works
The notifications claim (`recipient, kind, ref` unique; a sent row is never re-claimed) already guarantees at most once. So calling the send on every pass through the "after" state is safe, and that is what turns a failure into "try again later" instead of "never". Throwing on failure gives the webhook a retry trigger. The done page re-reads the status after an error and still shows success to a user whose trial started.

## Prevention
- When code does `transition; if (I won) sideEffect()`, ask what triggers the side effect after a failure. If the answer is nothing, run it on every pass through the target state, keyed by an idempotent claim.
- Test it: make the first send fail, call again, assert exactly one email.
- The same shape is coming in the charge and send jobs (Units 12 and 13): "charge succeeded, send the receipt", "list delivered, send the Monday email".

## Related Issues
- `src/lib/billing/card-setup.ts`, `src/lib/billing/card-setup.followups.test.ts`
- `docs/solutions/best-practices/test-claim-sql-on-pglite-2026-11-22.md`
