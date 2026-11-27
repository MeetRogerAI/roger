---
title: A windowed email job needs retries spread across the window and an independent "did everyone get it" check
date: 2026-11-27
category: best-practices
module: growth
problem_type: best_practice
component: background_job
applies_when:
  - A cron job sends one email per member inside a time window (for example Wednesday 08:00–12:00 Toronto)
  - Failures are retried by later cron runs through a notifications claim
  - The only "not everyone was sent" alert lives inside the job's own last run
symptoms:
  - Three attempts were used up in about 30 minutes, so a 40-minute email-provider outage dropped the week's email for every affected member
  - The window-close alert ran only at the end of a normal last run, so a run that threw, found the lease busy, or never fired alerted nobody
  - The safety-net cron used a query string (`/api/cron/stats?check=1`), which a cron may not keep
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
related_components: [email_processing]
tags: [cron, email, retries, alerts, window, vercel, notifications, lease]
---

# A windowed email job needs retries spread across the window and an independent "did everyone get it" check

## Context
B2 Unit 8's Wednesday stats email runs every 10 minutes through the window, and `sendToUser` dedupes it on `notifications (member, 'stats', date)`. B1's kinds retry a failed row on the next run, three times in all. For a once-a-week email that's the wrong shape.

## Guidance
- **Spread retries over the window, per kind.** `send.ts` has a per-kind retry policy. `stats` allows 6 attempts and re-claims a failed row only once its last attempt is 45 minutes old (database clock). Every other kind is unchanged: 3 attempts, retried straight away. A test pins that B1 behaviour, so the per-kind policy can't leak to other kinds.
- **Make the "not everyone was sent" check independent of the send run.** It runs:
  - at the end of a normal last run;
  - when the last run throws, after the send phase is wrapped;
  - when the last run finds the lease busy (a read-only count);
  - from a **separate** safety-net route at 18:00 UTC.

  All of them share one alert key per Wednesday, so admins get it once.
- **Give scheduled cron entries a plain path.** `/api/cron/stats-check` gets its own route rather than relying on a cron keeping `?check=1`.
- **Record failures you can't even build.** A member whose email can't be built (for example no referral code) gets a logged, capped failed notification row, not a silent `continue`.
- **Tie constants to the schedule.** A test reads `vercel.json` and checks that `LAST_RUN_UTC` matches the last scheduled run, and that the check entry exists.

## Why This Matters
A weekly email that silently skips members is invisible: there's no error, just people who didn't get it. The two failure modes, a short outage burning all retries and the alert dying with the run it's meant to watch, both happen exactly when something is already going wrong.

## When to Apply
Any time-boxed, per-member cron send: weekly digests, reminders with a deadline, Monday lists.

## Examples
- `src/lib/growth/stats-job.ts` (`mode: "send" | "check"`, `LAST_RUN_UTC`)
- `src/lib/mail/send.ts` (per-kind retry policy)
- `src/app/api/cron/stats-check/route.ts`
- Tests: `src/lib/growth/stats-job.test.ts` (throw, busy, check, 40-minute outage still sends) and `src/app/api/cron/stats/route.test.ts` (schedule test)

## Related
- `docs/solutions/logic-errors/side-effect-tied-to-winning-transition-is-lost-2026-11-22.md`
- `docs/solutions/best-practices/lease-must-guard-every-write-not-just-entry-2026-11-23.md`
