---
title: Admin-prepared Stripe invoices need a fenced claim, generation-specific idempotency keys, line verification and a tax-status gate
date: 2026-11-27
category: integration-issues
module: sponsors
problem_type: integration_issue
component: payments
symptoms:
  - Two "Prepare" presses past a 5-minute hold could both write lines to one Stripe draft, billing the sponsor twice
  - A slow attempt's failure handler released the hold a newer attempt had taken
  - A retry after a sponsor rename failed with idempotency_error for 24 hours; a retry after 24 hours made a second, orphaned draft
  - A draft voided in Stripe was replayed by the same create key, so "prepare again" kept failing
  - Automatic tax with an unplaceable postal code gave zero tax with no error, shown as "with tax"
  - A send refused for a tax problem was replayed from the idempotency cache after the address was fixed
  - A member released or deleted before the month was invoiced dropped out of the sponsor's bill
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components: [database]
tags: [stripe, invoices, idempotency, claim, lease, automatic-tax, sponsors, billing, endive]
---

# Admin-prepared Stripe invoices need a fenced claim, generation-specific idempotency keys, line verification and a tax-status gate

## Problem
B2 Unit 10 bills each sponsor monthly. An admin presses "Prepare" (a draft Stripe invoice built from seat history) and then "Send". The first version used a time-limited claim and one idempotency key per (sponsor, month). Two review rounds found seven ways it could over-bill, under-bill, or get stuck.

## Symptoms
See the frontmatter.

## What Didn't Work
- **A plain time-limited claim:** a Stripe call can outlive it. A takeover then runs the same delete-and-create sequence on the same draft, and the stale attempt's release frees the new owner.
- **One fixed idempotency key with a body rebuilt from live data:** changed parameters cause `idempotency_error`, keys expire after 24 hours and yield a second draft, and a voided draft is replayed.
- **Trusting `automatic_tax.enabled`:** an unplaceable address returns `requires_location_inputs` and zero tax, with no error. See also `stripe-endive-embedded-setup-tax-promo-gotchas-2026-11-26.md`.
- **Billing from current `users.sponsor_id`:** this forgets anyone released, closed or deleted before Prepare.

## Solution
In `src/lib/sponsors/invoice.ts` and `src/lib/billing/sponsor-gateway.ts`:
- **A fenced claim:** `claim_token` and `claimed_at`, renewed before every Stripe write. Recording the draft id, finishing and releasing are all conditional on the token. A line added after the claim is lost is deleted again.
- **The draft id is recorded the moment the draft exists.** Reuse it, or find the draft in Stripe by `metadata.sponsor_id` and `metadata.month`, before creating one.
- **Immutable create body:** customer, currency, collection, tax and metadata only. The description is set afterwards with `invoices.update`. The create key includes the previous draft id (`...:{month}:{prev id or none}`), so a voided draft gets a new generation. Anything other than status `draft` is refused.
- **Verify the lines:** after writing, list the draft's items and compare them with the bill before recording success. Send recomputes the bill and refuses with "Prepare again" if it differs.
- **Tax gate:** read `automatic_tax.status`. Prepare says "Tax can't be calculated" unless the status is `complete`, and Send refuses. Validate country and postal code when the sponsor is created.
- **Send:** use `sendInvoice` with the key `sponsor-send:{invoice}:{refusals}`. A confirmed refusal bumps the count so the next try isn't a cached refusal. `sent_at` is set only once Stripe confirms. On retry, an invoice that is already open or paid counts as sent.
- **Seat history is the billing source:** `sponsor_seat_history` is opened in the claim statement and closed on release or close. A seat is billed for any month it was held after the third list. `deleteAccount` refuses while the member has seat-months that aren't invoiced yet.

## Why This Works
Each remote write is tied to a claim that can be checked, keys change exactly when the intended object changes, and nothing is marked done until Stripe's own state confirms it.

## Prevention
- Make the fake gateway as strict as Stripe:
  - a reused key with different parameters is an error;
  - replay returns the first answer, including stale status and errors;
  - keys expire;
  - automatic tax needs a location.
- Test: two prepares past the hold, rename between attempts, voided draft, tax refusal then fix, release and delete before invoicing.
- Before launch, run the sandbox checks listed in the B2 launch-list item: metadata lookup, `sendInvoice` from a draft, invoice item fields on endive, the tax error code, and replay of errors.

## Related
- `docs/solutions/logic-errors/retry-must-replay-claimed-parameters-2026-11-26.md`
- `docs/solutions/best-practices/lease-must-guard-every-write-not-just-entry-2026-11-23.md`
- `docs/solutions/logic-errors/ledger-mirrored-to-stripe-balance-cap-and-order-2026-11-27.md`
