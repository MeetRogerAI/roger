---
title: Before purging old rows, find every job that reads them as an "already done" guard; and start an idle clock no earlier than its signal
date: 2026-11-27
category: best-practices
module: housekeeping
problem_type: best_practice
component: data-retention
symptoms:
  - A retention purge of `notifications` would have made the welcome email go out a second time to a long-running trial
  - An "idle for a year" erase would have treated members as idle when their sign-ins had simply never been recorded
root_cause: missing_audit
resolution_type: code_fix
tags: [retention, privacy, notifications, idempotency, last_seen_at]
---

# Purging a guard table, and idle clocks

## Context

Privacy decisions P3 and P6 (launch list S22, 2026-11-27) added two hourly
jobs to `src/lib/housekeeping/retention.ts`:

- **P6** purges old `notifications`, `leads` and `stripe_events` rows.
- **P3** erases the runs of members idle for a year.

The first draft passed its own tests. Reviews then found two ways to lose or
resend data.

## 1. A record you purge may be someone's "already sent" guard

Many jobs decide whether to send by checking that no `notifications` row
exists for a recipient, kind and ref (`grep -n "from notifications" src/lib`).
Deleting such a row is safe only when the guard has its own time window:

- The ref is a week or a date (`monday_list`, `order_prompt`, `first_charge_reminder`).
- The query looks back only a few days (`cancelled`, `trial_closed`: 7 days).
- The query only applies while a short-lived state lasts (a pending adjustment, a no-card trial).

`welcome` had none of these. `sendUnsentWelcomes` (`src/lib/signup/finish.ts`)
sends to any `trial` user with no welcome row. A trial can last as long as
the member never gets a list, so purging a 12-month-old welcome row would
send the welcome again.

**Fix:**

- `KEEP_NOTIFICATION_KINDS = ["welcome"]` is excluded from the purge.
- A test backdates a real welcome, purges, runs `sendUnsentWelcomes`, and asserts that nothing is sent.

**Rule:** before adding any purge, list every reader of that table that tests
for absence (`not exists`, `select 1 ... if (done.length)`), and write down
the time window of each one. If a reader has no window, keep its rows or give
it one. The Stripe events table is safe for this reason: the webhook dedupe
and the reconcile only look up ids from Stripe's own event window, about
30 days.

## 2. An idle rule is only as old as the activity signal behind it

"No run, order or sign-in for 365 days" read sign-ins from
`users.last_seen_at`. But that column was written only when a session was
*renewed*, not when it was created. Expired sessions are also deleted
hourly. So someone who signed in once, months ago, left no trace, and the
rule would have erased them as idle.

**Fixes:**

- `createSession` now stamps `last_seen_at`.
- The idle clock is floored at `IDLE_CLOCK_FROM` (the day the rule shipped), so no one can be erased by it before a full year of reliable signal exists.
- Charges and card saves also count as activity.

**Rule:** when a destructive rule depends on "nothing happened since X",
check that every kind of activity has *always* been recorded. If it hasn't,
floor the clock at the date recording became reliable.

## Related

- [[keep-forever-guard-needs-exit-on-terminal-failure-2026-11-26]]
- `docs/solutions/best-practices/job-clock-not-database-now-2026-11-23.md`: the purges use the job clock.
