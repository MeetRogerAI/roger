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
last_updated: 2026-11-23
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

## Seen again: the Monday send (Unit 13, 2026-11-23)
The prediction above came true, twice, despite this note:
- **The trigger was a value only the winning pass sees.** `deliverWeek` returns the new `free_lists_used` only from the call that counted the free list, and the "your next list is your first paid one" email was sent only when that value was present. One Stripe preview timeout, and no later pass could ever send it. Fix: decide from stored state on every pass (`trial`, `free_lists_used >= freeRuns`, and no `sent` notification of that kind for this week or later).
- **The retry pass selected only the before-state.** The hourly late pass picked users with *undelivered* picks. A user delivered mid-week whose email failed was no longer selected. Fix: the pass also selects delivered weeks with no `sent` Monday notification.
- **Order the side effects so they agree.** The Monday email's status line quotes the stored amount, and the first-paid-next email is what stores it. Sending the Monday email first produced two emails a few seconds apart with different amounts. Send the email that writes the shared fact first, then re-read.

A related rule from the same review: the eligibility check for the transition belongs inside the statement that makes it (`with u as (select ... where <deliverable> for update)`), not in a JavaScript check on a row read earlier. A cancel, a hold, or a second delivery in another pass can land in between.

## Related Issues
- `src/lib/billing/card-setup.ts`, `src/lib/billing/card-setup.followups.test.ts`
- `src/lib/cora/send-job.ts`, `src/lib/cora/deliver.ts`, `src/lib/cora/send-job.test.ts`
- `docs/solutions/best-practices/test-claim-sql-on-pglite-2026-11-22.md`
