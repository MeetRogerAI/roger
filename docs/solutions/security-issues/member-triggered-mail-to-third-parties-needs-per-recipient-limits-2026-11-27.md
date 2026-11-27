---
title: Mail that members can send to third parties needs a per-recipient limit, atomic counters with give-back on every exit, and a claim-then-rotate resend
date: 2026-11-27
category: security-issues
module: growth
problem_type: security_issue
component: email_processing
symptoms:
  - Up to 50 members could each invite the same stranger, sending 50 Roger-branded emails a day to one address and using up the global daily cap for everyone
  - The "at most 50 a day" cap was a count-then-insert, so concurrent invites could pass it
  - Two clicks on "Send it again" rotated the token twice, so the email that went out carried a link that no longer worked
  - A database error after the counters were taken left the address blocked for up to a week with nothing sent
root_cause: missing_validation
resolution_type: code_fix
severity: medium
related_components: [database]
tags: [email, abuse, rate-limit, counter, invitations, guests, resend, token, idempotency, referral]
---

# Mail that members can send to third parties needs a per-recipient limit, atomic counters with give-back on every exit, and a claim-then-rotate resend

## Problem
B2 Unit 9 lets a paying member invite one guest per session. The guest is a stranger to Roger and gets a Roger-branded email. Limits per inviter and a global count protected the system, but nothing protected the recipient.

## Symptoms
See the frontmatter.

## What Didn't Work
- **Limits keyed only on the inviter.** One per inviter per session says nothing about how many members target the same address.
- **`insert ... where (select count(*) ...) < 50`.** Under Postgres's default read-committed isolation, two inserts both see 49. Neon HTTP has no transactions to wrap this in.
- **Rotating the token, then claiming the send.** The rotation of the losing request overwrote the token of the winning request.

## Solution
In `src/lib/growth/session-guests.ts`:
- **Limit per recipient, on a normalised key.** At most one invitation per address per 7 days across all inviters, keyed on `referralEmailKey` and stored as `session_guests.email_key`. Opt-out checks (`isAddressSuppressed` in `src/lib/mail/suppression.ts`) use the same key, so `foo+x@gmail.com` and dotted variants match.
- **Atomic counters in `rate_events`** for the per-address limit, the global daily cap and a per-member hourly limit. Take a count with one `update ... returning` statement, not with a count followed by an insert.
- **Give back every count you took, on every exit.** Refusals and conflicts, and also exceptions: wrap everything from the first take through the insert in try/catch, give back the counts actually taken, then rethrow. Counters clamp at 0.
- **Resend: claim and rotate in one guarded statement** (`sendClaimed` in `send.ts`), so the token stored is the token sent. Resends add a tag to the provider idempotency key, so the provider doesn't hand back the earlier delivery.
- **Retry-safe referral link.** `recordInvitedReferral` (next to `attribution.ts`) is idempotent and called from invite and resend, so a crash between "guest saved" and "referral linked" heals on the next resend.

## Why This Works
Abuse limits have to sit on the thing being abused: here, the recipient's inbox. Counters are a resource the code takes, so each `take` needs a `give` on every exit path, exactly like a lock.

## Prevention
For any feature where a user triggers email to someone who isn't a user:
1. Set a per-recipient limit on a normalised address.
2. Check opt-outs on the same key.
3. Use atomic counters, with a test that two concurrent requests at the limit let exactly one through.
4. Give back counts on throw, with a test that the insert throws once and a retry still succeeds.
5. Rotate tokens only for the claim winner, with a concurrent-resend test.

## Related
- `docs/solutions/security-issues/user-chosen-display-names-need-script-allowlist-and-a-skeleton-key-2026-11-27.md` (guest pages show the inviter's name through the same rules)
- `docs/solutions/logic-errors/retry-must-replay-claimed-parameters-2026-11-26.md`
- `docs/solutions/best-practices/test-claim-sql-on-pglite-2026-11-22.md`
