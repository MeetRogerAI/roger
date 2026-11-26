---
title: "feat: Product and Pricing at sign-up; Payment at the first Cora list"
type: feat
status: active
date: 2026-11-26
origin: docs/brainstorms/2026-11-26-payment-at-first-curation-requirements.md
---

# feat: Product and Pricing at sign-up; Payment at the first Cora list

## Overview

Sign-up becomes three steps (quiz, account, Product and Pricing with Zack consent). It ends without a card. People connect Zack and their first Cora list is picked as usual. If there is no card, the list is **held**: the email and `/app` show the three titles only, with a link to a new embedded **Payment** page (Step 4). Saving a card unlocks the held list (free list 1 of 2). The first charge stays with the third delivered list. Monthly becomes the only plan. This lands before `v3.signupOpen` goes on in production.

## Problem Frame

See origin: `docs/brainstorms/2026-11-26-payment-at-first-curation-requirements.md`. Today the card is asked for at Step 4, before the person has seen anything, and it is surrounded by dense terms. The change asks for the card when intent is highest: when a real, personal list exists. It also rebuilds the card form to checkout best practice (embedded, branded, a transparent price box, no distractions). It reverses Strategy v3.1 decision 38 (card up front), and the change is measured by a funnel (R30).

## Requirements Trace

R1–R30 and the Success Criteria are carried from the origin document. **One amendment:** origin R17 says the discount is attached to the Stripe customer at save. Stripe removed customer-level discounts in API version Basil (2025-03-31), so the plan stores the discount on Roger's user row at save and applies it at preview and subscription create. The member-facing promise ("you pay what you were shown") is unchanged. In short:
- **Plans:** R1 monthly only. R28 removes one-list-at-a-time from all copy.
- **Step 3:** R2–R7 (Product and Pricing, consent kept, no higher-rate line, then `/app` onboarding).
- **Gate:** R8–R12 (titles-only teaser enforced on the server, unlock only on a server-verified save, counting starts at the card, replaced teasers, closes, charge rule unchanged).
- **Payment:** R13–R24 (embedded cards-only form, Price Box with toggle and live tax, "Due today $0", promo locked in at save, trust signals, policy links, no nav, "Start free trial", duplicate guard, deleted copy).
- **Knock-on:** R25–R27, R29 (emails, FAQ and spec copy; pilot links; admin state; sponsored members skip the gate).
- **Measurement:** R30 funnel counts.

## Scope Boundaries

Carried from the origin document:
- No wallets, Link, PayPal, Interac or BNPL.
- No guest checkout.
- Leftover per-run test accounts on preview are not migrated.
- Part A marketing pages are not rebuilt; only the copy R25 and R28 name changes.

Added by planning:
- **"Update card" on `/app/billing` stays on hosted Checkout.** Only first card collection moves to the embedded form. This keeps one change of card mechanism per release; moving updates too is a follow-up.
- **Per-run billing machinery is hidden, not deleted.** This covers `orders.ts`, `switch.ts`, the per-run branches in `who-gets-a-list.ts` and `deliver.ts`, and the `one-at-a-time` scenario. Entry points and copy go away; the code goes dormant. Deleting it is a separate cleanup after launch, to keep this diff reviewable.
- **No PCI badge image.** The trust signals are a padlock, "Secured by Stripe", card brand marks and a plain-text line (see Key Technical Decisions).

## Context & Research

### Relevant Code and Patterns

- **Account state.** In `db/schema.sql` the `users` table has `status` (check: signup, trial, active, held, cancelled, closed), `plan`, `signup_step`, `consent_at`, `trial_started_at` (today this means "card saved"), `free_lists_used`, `quote`, `stripe_customer` and `sponsor_id`. Schema changes are appended idempotent statements, run by hand with `db/setup.mjs` on production, preview and the scenario database. A check is changed with the one-line `do $$ … $$` pattern used for `login_tokens.purpose`.
- **Sign-up.**
  - Pages: `src/app/start/page.tsx`, `account/page.tsx`, `plan/page.tsx`, `card/page.tsx`, `done/page.tsx`.
  - Actions: `src/app/start/actions.ts`, `src/app/start/billing-actions.ts` (`savePlan`, `setCurrency`, `openCardPage`).
  - Helpers: `src/lib/signup/account.ts` (`stepPaths`), `src/lib/signup/current.ts` (`signupUser`).
  - Components: `src/components/app/plan-form.tsx`, `src/components/app/card-button.tsx`.
- **Card setup.**
  - `src/lib/billing/gateway.ts` (`CardGateway`: `createCustomer`, `createSetupSession`, `getSetupSession`, `setDefaultCard`, `checkTaxLocation`).
  - `src/lib/billing/card-setup.ts` (`startCardSetup`, `completeCardSetup`, the `sendWelcome` path, `startCardUpdate` / `completeCardUpdate`).
  - The webhook is `src/app/api/stripe/webhook/route.ts`, which calls `src/lib/billing/webhook.ts` (`checkout.session.completed` routes by `metadata.purpose`).
  - Reconcile is in `src/lib/housekeeping/job.ts`.
- **First charge.**
  - `src/lib/billing/first-charge.ts` (`chargeFirst`: preview against `users.quote`, then `createSubscription`).
  - `src/lib/billing/subscriptions.ts` (`stripeBilling.preview` → `invoices.createPreview`; `createSubscription` with `error_if_incomplete`).
  - `src/lib/billing/quote.ts` (`tell`, `sendFirstPaidNext`, `sendFirstChargeReminders`).
- **Weekly cycle.**
  - Picking: `src/lib/cora/job.ts`. `src/lib/cora/context.ts` (`loadUsers` status filter, and `ctx.sent` = delivered picks only, so undelivered picks are already not "sent").
  - Eligibility: `src/lib/cora/who-gets-a-list.ts`.
  - Delivery: `src/lib/cora/deliver.ts` (`DELIVERABLE_SQL`, `deliverWeek` counts the free list in the same statement).
  - Sending: `src/lib/cora/send-job.ts` (`deliverAndTell`, and `deliverLate`, which delivers any undelivered picks from the last 8 days hourly — the key trap).
  - Templates: `src/lib/mail/templates/monday.ts`.
- **`/app`.**
  - `src/app/app/layout.tsx` (`AppNav`).
  - `src/app/app/page.tsx` and `src/lib/app/home.ts`.
  - `src/lib/app/week.ts` (`weekIdeas`: delivered picks only).
  - `src/app/app/week/[date]/page.tsx`.
  - `src/lib/app/status.ts`, `src/lib/app/onboarding.ts`, `src/lib/app/billing.ts`.
  - `src/components/app/week-ideas.tsx` and `idea-card.tsx`.
- **Gates that shut out non-trial accounts today.** These must be checked for a no-card trial:
  - `src/lib/zack/key.ts` (`userForKey`)
  - `src/app/app/page.tsx`
  - `src/app/app/zack/page.tsx` and `actions.ts`
  - `src/app/app/settings/*`
  - `src/lib/app/billing.ts` (`loadBilling`)
  - `src/lib/app/onboarding.ts` (`loadChecklist`)
  - `src/lib/cora/context.ts` (`loadUsers`)
  - `src/lib/cora/who-gets-a-list.ts`
  - `src/lib/cora/deliver.ts`
  - `src/lib/housekeeping/trial.ts` (`ON_CLOCK`)
  - `src/lib/admin/ops.ts`
  - `src/lib/admin/users.ts` (`addRunForUser`)
  - `src/app/admin/cora/page.tsx`
  - `src/lib/billing/quote.ts` (`quotable`)
  - `src/lib/zack/sharing-effect.ts`
- **Closes and nudges.** `src/lib/housekeeping/trial.ts` (`trialClocks`, `closeMoment` adds a week for each Monday Roger failed, `sendTrialNudges`, `closeTrialsWithNoList`). The new no-card clocks follow these patterns.
- **Admin.** `src/lib/admin/ops.ts` (`Attention`, `ATTENTION_LABELS`, `statusKey`), `src/lib/admin/interest.ts` (`loadInterest`) and `src/app/admin/interest/page.tsx`.
- **UI.**
  - The currency toggle pattern in `src/components/circles/price.tsx` (role group, `aria-pressed`, `min-h-11`, aria-live).
  - Tokens and `.btn`/`.tlink` in `src/app/globals.css`.
  - The form pattern in `plan-form.tsx` (`useActionState`, `role="alert"`, `aria-describedby`).
  - Chrome: the `/start` layout has no nav, `SiteHeader` shows no links on `/start`, and `FooterSwitch` hides the footer on listed paths.
- **Tests.**
  - PGlite `src/test-helpers/pglite-db.ts`, fakes `src/test-helpers/fake-card-gateway.ts`, and `src/test-helpers/next-fakes.ts`.
  - Scenarios in `tests/scenarios/helpers.ts` (`signUp()` does the card at sign-up today, so it must be rewritten).
- **Packages.** `next` 16.4.1 (`cacheComponents`), `stripe` 23.2.0 pinned to `2026-11-18.endive`. `@stripe/stripe-js` and `@stripe/react-stripe-js` are **not installed**. There is no content security policy anywhere.

### Institutional Learnings

- `docs/solutions/logic-errors/side-effect-tied-to-winning-transition-is-lost-2026-11-22.md`: the unlock must run every side effect on every pass through the after-state (return page, webhook, reconcile, hourly). Decide from stored state, never from a value only the winning call sees.
- `docs/solutions/database-issues/data-modifying-cte-runs-even-when-insert-conflicts-2026-11-22.md`: in one-statement claims, put the irreversible write last behind `exists(...)`, and never update `users` twice in one statement.
- `docs/solutions/best-practices/test-claim-sql-on-pglite-2026-11-22.md`: test claims on PGlite, including `Promise.all` races. Use plain throwing functions for failure tests.
- `docs/solutions/best-practices/job-clock-not-database-now-2026-11-23.md`: every new timestamp (`first_teaser_at`, card saved, superseded, close moments) takes the job clock, `coalesce($n::timestamptz, now())`.
- `docs/solutions/best-practices/lease-must-guard-every-write-not-just-entry-2026-11-23.md`: hold, teaser and supersede writes inside the Cora or send jobs respect `holder` and `dry_run`. A dry run never sends a teaser.
- `docs/solutions/logic-errors/one-money-rule-two-mechanisms-double-charges-2026-11-23.md`: keep **one** charge mechanism. The card is saved now and the subscription is created by the app at the third list. No trialing subscription.
- `docs/solutions/ui-bugs/react-19-form-action-reset-brings-back-stale-defaults-2026-11-23.md`: keep the Payment Element out of any server-action `<form>`. Fields beside it are controlled.
- `docs/solutions/runtime-errors/next16-clock-read-during-render-2026-11-22.md`: call `await connection()` before reading the clock or Stripe in render.
- `docs/solutions/developer-experience/scripted-edits-mangle-escapes-and-crlf-2026-11-22.md`: edit with Edit and Write, never scripts.

### External References

- Embedded setup-mode Checkout (`ui_mode: 'elements'`): https://docs.stripe.com/payments/checkout/save-and-reuse?payment-ui=embedded-components
- Deferred-intent setup (the fallback): https://docs.stripe.com/payments/accept-a-payment-deferred?type=setup
- Endive removed `payment_method_types` on intents in favour of `allowed_payment_method_types`: https://docs.stripe.com/changelog/endive/2026-09-30/removes-the-payment-method-types-parameter-from-payment-intents-and-setup-intents
- Endive strict billing-details validation with Checkout Elements: https://docs.stripe.com/changelog/endive/2026-09-30/strict-billing-details-validation
- Customer-level coupons and promotion codes were removed in Basil (2025-03-31): https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-singular-coupon-promotion-code
- Promotion code shape since Clover (`promotion.coupon`): https://docs.stripe.com/changelog/clover/2025-09-30/polymorphic-coupon
- Invoice preview with `customer_details.address` and `discounts`: https://docs.stripe.com/api/invoices/create_preview
- Tax customer location rules (Canada: province from the postal code; US: ZIP centre point): https://docs.stripe.com/tax/customer-locations
- Endive `failed_tax_calculation` error: https://docs.stripe.com/changelog/endive/2026-09-30/failed-tax-calculation-error
- CSP and PCI (Elements fall under SAQ A): https://docs.stripe.com/security/guide

## Key Technical Decisions

- **A no-card account is `status = 'trial'` with `trial_started_at` null.** No new status value is added. Step 3 moves the person straight to `trial` (`signup_step = 'done'`).
  - `trial_started_at` keeps its meaning, "card saved", so every existing card-saved clock (`ON_CLOCK`, the 21-day no-list close, `sharing-effect`) is unchanged and excludes no-card users automatically.
  - Most gates already allow `trial`: the Zack key, `/app`, Cora's `loadUsers`, onboarding and settings.
  - Rationale: adding a status would touch about fifteen allow-lists, and missing one breaks onboarding silently. A predicate is safer: **"has card" = `trial_started_at is not null`**. It is audited where a trial was assumed to have a card: delivery, charge, quote, billing page, status line and admin. Sponsored trials (`sponsor_id` set) count as "no card needed".
- **A held list is picked but not deliverable.** ("Held list" is a list state. It is unrelated to the existing `users.status = 'held'` payment hold, which this change does not use.) `DELIVERABLE_SQL` adds "trial requires a card or a sponsor". Cora picks as normal (undelivered picks are already not "sent", so replaced teaser ideas stay resendable — R10, no change to Cora rule 1).
  - **Superseding happens at pick time.** When Cora records a picked or short week for a no-card trial user, the same lease-guarded statement stamps `superseded_at` on every earlier undelivered week for that user. At any moment a no-card user therefore has at most one held list: the newest picked week, whether or not its teaser has been sent yet.
  - The send job, finding a no-card trial user with a picked or short week, sends the teaser instead of the list and stamps `users.first_teaser_at` (job clock, `coalesce`).
  - `deliverLate`, the unlock and the charge job all skip superseded weeks. This closes the trap where the hourly job would deliver a replaced teaser the moment the card is saved.
  - **A card saved between Cora's pick (01:00) and the send (07:00) unlocks this week's list (W)**, delivered at once with its list email. W-1 was already superseded at pick time, so there is one list that day, no repeated ideas, and one free list counted. The send job then finds W delivered and sends nothing more.
- **Card collection uses Stripe's embedded setup-mode Checkout Session** (`ui_mode: 'elements'`, Payment Element, cards only, Link and wallets off), mounted in Roger's page.
  - Rationale: it keeps the existing session plumbing. That means `getSetupSession`, `completeCardSetup`, `checkout.session.completed` (already subscribed on the preview webhook), `customer_update: {address, name}` writing the address to the customer for Stripe Tax, and the `metadata.purpose` routing.
  - Roger's own name, country and postal code inputs feed the session through `updateBillingAddress` (Endive's strict billing-details rule). The Payment Element's own address fields are set to `never`.
  - **Fallback**, if the spike in Unit 4 shows `customer_update` or billing-detail handling doesn't work in elements mode: the deferred-intent flow (`elements({mode:'setup'})` → a server-created SetupIntent with `allowed_payment_method_types: ['card']` → `confirmSetup` → a new `setup_intent.succeeded` handler), writing the address to the customer explicitly before `checkTaxLocation`.
- **The live tax line comes from Roger's server via `invoices.createPreview`.** It takes the price, `customer_details.address {country, postal_code}`, `automatic_tax` and `discounts`, and is debounced from the country and postal inputs. It uses the same Billing logic as the real first invoice. Not `tax.calculations`, which knows nothing about recurring prices or discounts.
- **The promo code is validated on the server.** `promotionCodes.list({code, active})` plus restriction checks, rate-limited per user and IP.
  - "Locked in at save" (R17): customer-level discounts no longer exist (Basil). So at card save Roger stores the promotion code's **coupon id** and label on the user. `chargeFirst` passes `discounts: [{coupon}]` to both `preview` and `createSubscription`, so the quote, the preview and the charge agree.
  - Applying the coupon directly means a promotion-code limit that lapses after save can't take the discount away.
  - **Because Stripe then never counts the redemption, Roger enforces limits itself.** A `promo_reservations` table (promotion code id, user id, reserved at — unique on code + user) is written in the same completion claim that stamps the card. Card save refuses the code if the reservations plus Stripe's `times_redeemed` would exceed `max_redemptions`, or if `first_time_transaction` is set and this person or card fingerprint already has a reservation or a payment. If the code was taken while the person was on the page, the card is still saved, without the discount, and the page says so. A coupon that is itself deleted or past `redeem_by` at charge time is charged at full price through the existing "amount changed" hold and email.
- **The Payment page lives at `/start/payment`.** The `/start` layout already has no nav and `SiteHeader` shows only the logo there. Add it to `FooterSwitch`'s hidden list (R22). It requires a signed-in user in trial with no card; otherwise it redirects to `/app`. Return page: `/start/payment/done?session_id=…`, which replaces `/start/done`.
- **"Start free trial" protection:**
  - The client disables the button and shows a loading state.
  - The server reuses one open session per user (stored id; a new one only if the stored one is complete or expired).
  - `createCustomer` is already idempotent per user.
  - Completion is idempotent (claim-first).
  - Price, currency and tax are derived from the account on the server.
- **The welcome email moves to Step 3 completion** and its card wording is rewritten (R25). It is sent through the existing claim, and a failed send is retried by an hourly "welcome not sent" sweep, because a server action can't rely on a webhook retry (the side-effect lesson). The card-save moment sends the unlocked Monday list email (receipt "Free list 1 of 2"), not a second welcome.
- **Trust line:** "Payments are processed by Stripe, a PCI DSS Level 1 certified provider. Roger never sees your card number." This is accurate for SAQ A. No badge image.
- **CSP:** a route-scoped content security policy for `/start/payment` allowing Stripe origins (`js.stripe.com`, `*.js.stripe.com`, `hooks.stripe.com`, `api.stripe.com`), added through `next.config.ts` `headers()`. It is not site-wide (no CSP exists elsewhere, so this is not the release to introduce one).
- **The publishable key** is a new `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` per environment. Stripe.js is always loaded from js.stripe.com via `@stripe/stripe-js` (version confirmed compatible with Endive during Unit 4).

## Open Questions

### Resolved During Planning

- **Account state for "consented, no card":** `trial` with `trial_started_at` null (above).
- **SetupIntent vs trialing subscription:** saved card only, with the app creating the subscription at the third list (one money mechanism).
- **Promo lock-in:** a stored coupon id applied at preview and subscription create (customer discounts were removed).
- **Unlock path edge cases** (origin deferred questions):
  - Completion runs from the return page, the webhook and reconcile.
  - A session that is `open` or still processing shows a "confirming" state and re-checks.
  - `address_invalid` keeps the card unsaved for the trial and returns to Payment with the existing message.
  - If delivery fails after the status flip, the hourly sweep retries (it selects "card saved, newest non-superseded held list undelivered").
  - A save between Cora's pick and the 7:00 send unlocks this week's list (superseding happens at pick time). That is one list and one free list, never two in a day.
- **Pre-existing charge gap (found in review):** `runChargeJob` re-runs every 10 minutes on Monday after the 7:00 send. It selects trials with `free_lists_used >= freeRuns` and a picked week, without checking whether **this** week's list was itself a free list. A trial whose second free list is delivered at 7:00 could be charged at 7:10 for that same week. Unit 8 adds the guard ("no charge for a week whose delivered list is a free list"). This may affect today's card-at-sign-up flow too, so it ships even if the rest slips.
- **Update card flow:** stays hosted (Scope Boundaries).
- **Email content for a held list:** titles only. Details are fetched only from delivered picks, which already gates `weekIdeas`. The teaser is a separate template that has no access to details.
- **Where the funnel lives:** `/admin/interest` (`loadInterest`).

### Deferred to Implementation

- Whether `customer_update` and `updateBillingAddress` behave as documented in embedded setup-mode Checkout on Endive, and which `@stripe/stripe-js` major supports Endive. Unit 4 starts with a short spike in Stripe test mode, and switches to the fallback flow if either fails.
- Exact `appearance` variables to match Roger's tokens (decided against the rendered page).
- Whether `first_time_transaction` promotion codes accept a customer with a saved card but no payments. Test in the sandbox, and treat as "not eligible" if unclear.
- The exact wording of the new emails and the Step 3 paragraphs goes to Peter (launch list S18). The drafted wording ships until then.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
stateDiagram-v2
    [*] --> signup: quiz + account
    signup --> trial_nocard: Step 3 (consent)\nstatus=trial, trial_started_at=null
    trial_nocard --> trial_nocard: Monday: picked → held\n(teaser email, first_teaser_at, older held superseded)
    trial_nocard --> closed: no teaser 21d after consent\nor 14d after first teaser (+Roger-failure weeks)
    trial_nocard --> trial_card: card saved (session complete,\nverified server-side)\nlatest held week delivered = free list 1
    trial_card --> trial_card: free list 2
    trial_card --> active: 3rd list → chargeFirst (discounts: stored coupon)
    trial_nocard --> trial_card: sponsored → never held
```

Monday for a no-card trial user: `cora job` picks → `send job` finds the user not deliverable and no card → it marks earlier held weeks superseded → teaser email (kind `first_list_held`, ref week) → stamps `first_teaser_at` if null.

Card save: the Payment page creates or reuses the embedded setup session → Stripe confirms → `completeCardSetup` (return page, webhook or reconcile) → default card, tax location, stored promo coupon, `trial_started_at` = job clock → deliver the latest non-superseded held week through `deliverWeek` → Monday list email with receipt.

## Implementation Units

```mermaid
flowchart TB
  U1[U1 Schema + has-card predicate] --> U2[U2 Step 3 + sign-up ends]
  U1 --> U3[U3 Held list in weekly cycle]
  U1 --> U4[U4 Stripe gateway: embedded session, tax preview, promo]
  U4 --> U5[U5 Card-save completion + unlock]
  U3 --> U5
  U4 --> U6[U6 Payment page UI]
  U5 --> U6
  U3 --> U7[U7 No-card reminders + closes]
  U4 --> U8[U8 First charge with stored coupon]
  U2 --> U9[U9 Monthly-only + copy + admin + funnel]
  U6 --> U9
  U7 --> U9
  U5 --> U10[U10 Scenarios + spec/launch-list write-back]
  U6 --> U10
  U8 --> U10
  U9 --> U10
```

- [ ] **Unit 1: Schema and the "has card" predicate**

**Goal:** add the columns the new flow needs, and audit every place that assumes a trial has a card.

**Requirements:** R7, R8, R10, R11, R17, R27, R30.

**Dependencies:** none.

**Files:**
- Modify: `db/schema.sql` (appended idempotent statements)
- Modify: `src/lib/billing/quote.ts` (`quotable`)
- Modify: `src/lib/app/status.ts`
- Modify: `src/lib/admin/ops.ts` (`statusKey`)
- Modify: `src/lib/zack/sharing-effect.ts`
- Modify: `src/lib/app/billing.ts` (`canUpdateCard`, no-card cancel)
- Modify: `src/lib/billing/card-setup.ts` (`startCardUpdate` guard)
- Modify: `src/lib/admin/users.ts` (`addRunForUser`, `giveExtraFreeList` refuse no-card trials)
- Modify: `src/lib/cora/who-gets-a-list.ts`, `src/lib/cora/context.ts` (`hasCard` fact)
- Test: `db/schema.pglite.test.ts`, `src/lib/billing/quote.test.ts`, `src/lib/app/status.test.ts`, `src/lib/admin/ops.test.ts`, `src/lib/app/billing.test.ts`, `src/lib/billing/card-setup.test.ts`, `src/lib/admin/users.test.ts`

**Approach:**
- Add these columns:
  - `users.first_teaser_at timestamptz`
  - `users.setup_session text` (the open embedded session, reused)
  - `users.promo_code text`, `users.promo_coupon text`, `users.promo_label text` (see the promo decision for which are needed)
  - `cora_user_weeks.superseded_at timestamptz`
  - A `promo_reservations` table (promotion code id, user id, card fingerprint, reserved at; unique on code + user)
  - No welcome column: the `notifications` claim covers it.
- `signup_step` keeps `card` in its check for old rows. No check change is needed, since no new status is added.
- Define the "has card or sponsored" predicate once as an exported SQL fragment and a TS helper, so every caller shares it.
- **The audit is a recorded step, not a recollection.** Grep for every `'trial'` status check, every `status in (...)` list containing trial, and every `stripe_customer` truthiness check across `src/`, including `src/app/api/**`. Record each hit with a verdict (needs the predicate / fine as is) in a table in this plan's as-built notes. The known hits to fix:
  - `quotable` (no quote without a card)
  - `statusLine`. No-card wording: "Your first list arrives after Zack's first report", or, with sharing off, "Your first list arrives on Monday"; and "Your first ideas are ready — add a card to see them".
  - `statusKey` (new key `trial_no_card`)
  - `sharing-effect` (no "no earlier than" date without a card)
  - **`canUpdateCard` in `src/lib/app/billing.ts` and `startCardUpdate` in `src/lib/billing/card-setup.ts`.** Today they key on `stripe_customer`, and Payment creates the customer, so a no-card user who left Payment could save a card through "Update card" without unlocking. Both require the predicate; otherwise `no_card_yet`.
  - Cancel on `/app/billing` for a no-card trial: closes the account with no card to remove, using the "You have not been charged" confirmation.
  - The admin "add a run" and "give extra free list" actions refuse no-card trials with a clear message ("Waiting for the member's card"). This is simpler than inventing deferred counting.
- Add `hasCard` to the `who-gets-a-list.ts` `ListFacts` (selected in `context.ts` `loadUsers`) for the admin reason text.
- Release note: run `db/setup.mjs` on production, preview and the scenario database before deploying.

**Patterns to follow:** the appended-statement convention below the "Changes after first application" line in `db/schema.sql`. Shared SQL constants, as with `DELIVERABLE_SQL`.

**Test scenarios:**
- Happy path: the schema applies twice on PGlite without error (idempotent).
- Happy path: `statusLine` for a trial with no card and no teaser says the first list follows Zack's first report. With a teaser, it says the ideas are ready, with a Payment link.
- Edge case: `quotable` is false for a trial with a `stripe_customer` but `trial_started_at` null.
- Edge case: a sponsored trial with no card counts as "has card or sponsored".
- Error path: a no-card trial with a `stripe_customer` → `canUpdateCard` is false and `startCardUpdate` returns `no_card_yet`.
- Happy path: cancel for a no-card trial → closed, no Stripe calls beyond what exists, the "not charged" confirmation sent.
- Error path: the admin "extra free list" and "add a run" actions on a no-card trial are refused with the waiting message.

**Verification:** the schema applies cleanly; no code path treats a no-card trial as quotable or chargeable.

- [ ] **Unit 2: Step 3 "Product and Pricing" and the end of sign-up**

**Goal:** sign-up ends at Step 3 with consent, without a card. The person lands in `/app` onboarding.

**Requirements:** R2–R7, R24, R25 (welcome), R26.

**Dependencies:** Unit 1.

**Files:**
- Modify: `src/app/start/plan/page.tsx` (heading "Product and Pricing", "Step 3 of 4", Product and Pricing paragraphs; both prices shown as "US$200 a month or CA$280 a month, plus tax")
- Modify: `src/components/app/plan-form.tsx` (remove the plan radios and the higher-rate line; keep consent and the Zack link; button "Continue")
- Modify: `src/app/start/billing-actions.ts`. `savePlan` validates consent only, then:
  - sets `plan='monthly'`, `consent_at`, `status='trial'`, `signup_step='done'` where `status='signup'`;
  - calls `claimFreeRun(query, userId, settings.runCutoff)` (moved from `sendWelcome`, so a free-tool report still becomes this week's run);
  - sends the welcome email (claim, failure logged);
  - redirects to `/app`.

  Remove `openCardPage` from sign-up use.
- Modify: `src/app/start/page.tsx`, `src/app/start/account/page.tsx` ("Step N of 4")
- Modify: `src/lib/signup/account.ts` (`stepPaths.card` → `/start/plan`, `done` → `/app`)
- Delete: `src/app/start/card/page.tsx`, `src/app/start/done/page.tsx`, `src/components/app/card-button.tsx` (replaced in Unit 6). No redirects: production has no users holding these links.
- Modify: `src/lib/mail/templates/welcome.ts` (no card at sign-up, no "no earlier than", no higher-rate line; "Your first two Cora lists are free. When your first list is ready we'll ask for your card.")
- Modify: `src/lib/billing/card-setup.ts` (the welcome send leaves `completeCardSetup`)
- Modify: `src/lib/housekeeping/job.ts`. New hourly task `welcome_unsent`: no-card trial users with `consent_at` after this release and no `welcome` notification, capped. It also re-runs `claimFreeRun`. Leftover preview accounts are never re-welcomed.
- Modify: `src/app/admin/users/page.tsx` (pilot link copy: "opens at Product and Pricing")
- Test: `src/app/start/billing-actions.test.ts`, `src/components/app/plan-form.test.tsx`, `src/lib/mail/templates/welcome.test.ts` (new or existing), `src/lib/housekeeping/job.test.ts`

**Approach:**
- Pricing copy (R4): "Roger is US$200 a month or CA$280 a month, plus tax. We'll ask for your card before Cora's first full list is shown. Your free trial includes your first two Cora lists, two Mondays." The Product paragraph explains Zack collecting in your agent and Cora curating three ideas every Monday. Both are drafts for S18.
- The currency already stored on the account from `/start` params stays the default for Payment. Step 3 shows both prices, so no toggle is needed there.
- The redirect target `/app` works because no-card trials pass the `/app` gate (Unit 1 predicate audit confirms the onboarding checklist and the Zack page load for them).

**Patterns to follow:** the existing `savePlan` validation and conditional update; `sendToUser` claims; the `HOURLY_TASKS` registration.

**Test scenarios:**
- Happy path: consent ticked → user `status=trial`, `signup_step=done`, `plan=monthly`, `trial_started_at` null; welcome email sent once; redirect to `/app`.
- Error path: consent unticked → inline error, no state change, the field keeps its value (React 19 reset lesson).
- Edge case: submitting twice (two tabs) → one state change, one welcome email (claim).
- Error path: the welcome send throws → the action still redirects; the hourly `welcome_unsent` task sends it next hour, exactly once.
- Edge case: a user already in `trial` who opens `/start/plan` is redirected to `/app`.
- Integration: a pending free-tool report (`zack` token) becomes this week's run when Step 3 completes.
- Integration: the welcome email text contains no "no earlier than", no US$400 / CA$560, and no "one list at a time".
- Integration: a pilot link opens at `/start/plan` and completes to `/app` without a card.

**Verification:** a fresh user goes from `/start` to `/app` with Zack connectable and no card asked for.

- [ ] **Unit 3: Held lists in the weekly cycle**

**Goal:** no-card trial users get a titles-only teaser, never the details. Only the newest held week is ever unlockable.

**Requirements:** R8, R10, R29, Success Criteria (no details or counting before the card).

**Dependencies:** Unit 1.

**Files:**
- Modify: `src/lib/cora/deliver.ts` (`DELIVERABLE_SQL`: a trial needs a card or a sponsor; skip superseded weeks)
- Modify: `src/lib/cora/job.ts` (`record()`: for a no-card trial user, the same lease- and `dry_run`-guarded statement supersedes earlier undelivered weeks)
- Modify: `src/lib/cora/send-job.ts`:
  - In `deliverAndTell`, a held branch: send the teaser and stamp `first_teaser_at`. Respect the lease and `dry_run`.
  - `deliverLate` excludes superseded weeks and never delivers to users with no card.
- Modify: `src/lib/housekeeping/job.ts`. Hourly `teaser_unsent`: the newest held list whose teaser notification is missing, so a teaser that failed all Monday is still sent. The Monday send job is the only other pass, and it stops at about 13:00.
- Modify: `src/lib/cora/who-gets-a-list.ts` (no-card trial: gets a pick, delivery held — reason text for admin)
- Create: `src/lib/mail/templates/held.ts` (`firstListHeldEmail({week, titles, paymentUrl})`, titles only)
- Create: `src/lib/app/held.ts` (`heldTeaser(q, userId)` → the newest non-superseded held week's titles, or null; server-only, never returns reason, steps or details)
- Modify: `src/lib/app/home.ts`, `src/app/app/page.tsx`. Render the teaser: one locked title card per idea, with the heading "Your first 3 ideas are ready" ("Your first ideas are ready" on a short week), and the button "Add your card to see them" → `/start/payment`.
- Create: `src/components/app/held-ideas.tsx`
- Modify: `src/app/app/week/[date]/page.tsx` (a held week shows the teaser, not ideas; `weekIdeas` already returns delivered picks only — assert it)
- Test: `src/lib/cora/deliver.test.ts`, `src/lib/cora/send-job.test.ts`, `src/lib/app/held.test.ts`, `src/lib/mail/templates/held.test.ts`, `src/components/app/held-ideas.test.tsx`

**Approach:**
- Supersede (at pick) and teaser stamping (at send) are each one claim-first statement per user and week. The irreversible write comes last; the user row is updated at most once per statement (CTE lesson).
- **Deny by default for idea details.** Every read of pick details (reason, steps, links) goes through one data-access helper that requires `delivered_at is not null`. `heldTeaser` is the only reader of undelivered picks, and it selects titles only. A test scans `src/` (including `src/app/api/**` and the admin views shown to members) for other queries that read detail columns without the delivered condition.
- The teaser email uses kind `first_list_held` and ref = week, so a new week gives a new teaser and a re-run never duplicates.
- Sponsored no-card users stay deliverable (R29). `sponsor_id` is never written in production today, but the predicate covers it.

**Patterns to follow:** `deliverAndTell`, `mondayListEmail`, the `weekIdeas` delivered-only rule, and the lease guard in the send job.

**Test scenarios:**
- Happy path: a no-card trial user with a picked week → the send job sends `first_list_held` with three titles and no reasons or steps. Picks stay undelivered, `free_lists_used` stays 0, and `first_teaser_at` = job clock.
- Happy path: the following Monday, Cora picks a new week → the previous week is `superseded_at`-stamped in the same pick statement, a new teaser goes out at the send, and `first_teaser_at` is unchanged.
- Edge case: the previous week's ideas are eligible again for Cora (undelivered ⇒ not sent) and can appear in the new teaser.
- Edge case: a `short` outcome (1–2 ideas) sends a teaser with that many titles.
- Edge case: a dry run never sends a teaser and never stamps `first_teaser_at` or `superseded_at`.
- Edge case: a sponsored no-card trial → delivered normally, with no teaser.
- Error path: the teaser send fails all Monday → the hourly `teaser_unsent` task sends it later; one email in the end.
- Integration: `deliverLate` with a card saved after a supersede → delivers only the newest held week, never the superseded one.
- Integration: `heldTeaser` returns titles only; the `/app/week/[date]` page for a held week renders no reason or steps (the rendered output is checked for the absence of detail fields).
- Race: two send passes in parallel on the same user and week → one teaser and one stamp (PGlite `Promise.all`).

**Verification:** no route, email or payload exposes held idea details. The free-list count stays 0 until a card is saved.

- [ ] **Unit 4: Stripe gateway — embedded setup session, tax preview, promo validation**

**Goal:** server capabilities for the Payment page, behind the existing gateway seams, with fakes.

**Requirements:** R15–R19, R23.

**Dependencies:** Unit 1.

**Files:**
- Modify: `src/lib/billing/gateway.ts`:
  - `createSetupSession` gains a `ui: "elements"` variant: `ui_mode: 'elements'`, cards only, currency, `customer_update {address:'auto', name:'auto'}`, `return_url`, metadata as today. It returns the client secret.
  - `previewMonthly({customer?, currency, country, postal, coupon?})` via `invoices.createPreview`, returning subtotal, discount, tax amount, tax name and rate, and total.
  - `findPromotion(code, currency)` → `{valid: true, promotionCodeId, couponId, label, percentOff|amountOff}` or `{valid: false}`, with the reason logged inside the gateway.
- Modify: `src/lib/billing/card-setup.ts` (`openEmbeddedSetup(userId)`: create the customer once, reuse `users.setup_session` if still open, otherwise create and store it; precondition trial without a card)
- Modify: `src/lib/rate-limit` usage (existing `limits.checkoutPer*` reused; add `promoPer*`)
- Modify: `src/test-helpers/fake-card-gateway.ts`, `tests/scenarios/helpers.ts` (fake equivalents)
- Modify: `package.json` (add `@stripe/stripe-js`, `@stripe/react-stripe-js`)
- Test: `src/lib/billing/card-setup.test.ts`, `src/lib/billing/gateway.test.ts` (or `promo.test.ts`), `src/lib/billing/preview.test.ts`

**Execution note:** start with a short spike in Stripe test mode on preview:
- an elements-mode setup session with `customer_update` and without `billing_address_collection: 'required'` (that setting would demand a full address);
- `updateBillingAddress` with name, country and postal only;
- confirming 4242 and a 3DS test card;
- checking that the customer gets the address and the default card;
- calling `createPreview` and subscription create with a deleted coupon and an expired one, and recording the error shape, so Unit 8 maps it to the amount-changed path rather than a generic failure.

Record the result in the plan. If it fails, switch this unit and Unit 5 to the deferred-intent fallback (Key Technical Decisions) before building further.

**Approach:**
- The tax preview always derives price and currency from the server (the account currency, after a validated toggle). The client sends only country and postal code, which are validated (CA: `A1A 1A1`, US: 5 digits).
- **Billing countries are Canada and the US only** (Peter, 2026-11-26). The country picker offers only CA and US. Anything else is refused on the server. Other countries see "Roger is available in Canada and the US for now" with the support address. This settles origin R19: country plus postal code is always enough, and no full-address step is built.
- Handle Endive `failed_tax_calculation` and invalid-location errors as "Tax will be calculated from your billing address".
- Promo validation checks the promotion code's `active`, `expires_at`, max redemptions, currency options and the coupon's `valid`. A generic "That code isn't valid" goes to the user; the specific reason is logged only.

**Patterns to follow:** `createSetupSession` / `getSetupSession`, `stripeBilling.preview`, `classify()` error mapping, and the idempotency keys `customer:${userId}`.

**Test scenarios:**
- Happy path: `openEmbeddedSetup` for a no-card trial → creates the customer once and an open session; a second call returns the same stored session.
- Edge case: the stored session is complete or expired → a new session is created and stored.
- Error path: a user with a card or not in trial → refused (`not_allowed`).
- Error path: rate limit exceeded → refused with the existing message.
- Happy path: `previewMonthly` CAD + `M5V 2T6` → subtotal 280.00, an HST line at 13%, total 316.40 (from fake rates).
- Edge case: US ZIP in a state with no registration → tax 0, line "No sales tax".
- Error path: the preview raises a tax-location error → returns "pending" and the UI shows "Calculated from your billing address".
- Happy path: a valid promo code → the coupon id and label are returned; the preview with the coupon shows a discount line and a lower total.
- Error path (one table-driven test): expired, limit-reached, wrong-currency or unknown codes → `{valid: false}`; the reason is logged.
- Error path: more than N promo attempts per user per hour → rate-limited.

**Verification:** the fake and real gateways satisfy the same interface. The spike outcome is written into this plan.

- [ ] **Unit 5: Card-save completion and unlock**

**Goal:** one idempotent completion that saves the card, locks in the promo, starts the card clock and delivers the newest held list. It is called from the return page, the webhook and reconcile.

**Requirements:** R9, R12, R17, R23, Success Criteria.

**Dependencies:** Units 3 and 4.

**Files:**
- Modify: `src/lib/billing/card-setup.ts` (`completeCardSetup`):
  - existing session re-read, ownership, `setDefaultCard`, `checkTaxLocation`;
  - then set `trial_started_at` = job clock where null, `currency`, `country`, and the promo coupon from the pending selection;
  - then deliver the newest non-superseded held week through `deliverAndTell` (Monday list email with "Free list 1 of 2").
  - Every step re-runs from stored state on each call.
- Modify: `src/lib/billing/webhook.ts` (route elements-mode setup sessions to the same completion; the fallback adds `setup_intent.succeeded`)
- Modify: `src/lib/housekeeping/job.ts` (an hourly `unlock_pending` sweep: card saved and the newest held week undelivered → deliver; reconcile replays the handled kinds)
- Create: `src/app/start/payment/done/page.tsx` (calls the completion with `expectUserId`; outcomes: done → redirect to `/app/week/{week}` with a one-line "Your card is saved. Here are your ideas."; pending → "Confirming your card…" with auto-refresh; `address_invalid` → back to Payment with a message; `not_yours` → Payment)
- Modify: `src/lib/billing/card-setup.ts` (store the pending promo selection: `users.promo_code` and `promo_coupon` are written when validated on Payment and confirmed at completion; cleared if the user removes the code)
- Test: `src/lib/billing/card-setup.test.ts`, `src/lib/billing/card-setup.followups.test.ts`, `src/lib/billing/webhook.test.ts`, `src/app/start/payment/done/page.test.tsx` (or the action tests), `src/lib/housekeeping/job.test.ts`

**Execution note:** test-first for the completion claim on PGlite, including the `Promise.all([complete(), complete()])` race.

**Approach:**
- The completion's claim is `trial_started_at` going from null to the job clock (`where status='trial' and trial_started_at is null`). `setDefaultCard` and `checkTaxLocation` run only before that stamp. After it, a replay re-runs only delivery and the email, so a later webhook replay can't reset a card the member changed since.
- The session must equal the user's stored `users.setup_session`, and its purpose must not be `card_update`. A card-update session can never unlock a held list.
- The unlock is decided from stored state: "card saved and newest held list not delivered". It is never decided from "this call flipped the status".
- The hourly `unlock_pending` sweep stays separate from reconcile. Reconcile replays Stripe events; this sweep selects on Roger's own state, and covers a held list older than `deliverLate`'s 8-day window.
- A failed send throws, so the webhook returns 500 and Stripe retries. The hourly sweep also covers it.

**Patterns to follow:** the existing `completeCardSetup` outcomes and `WelcomeNotSent`-style throw-to-retry, `deliverAndTell`, and the `card_updates` claim pattern.

**Test scenarios:**
- Happy path: a completed session → default card set, tax location ok, `trial_started_at` = job clock, the newest held week delivered, `free_lists_used=1`, Monday list email sent with "Free list 1 of 2".
- Happy path: with a validated promo pending → `promo_coupon` and `promo_label` are kept on the user after completion, and a `promo_reservations` row is written in the same claim.
- Error path: a code with `max_redemptions` 2 and two reservations already → the card is saved without the discount, and the page explains why.
- Error path: a `first_time_transaction` code used again by the same person or card fingerprint → refused at save.
- Race: two people save the last remaining use at once → exactly one reservation (PGlite `Promise.all`).
- Edge case: two held weeks (one superseded) → only the newest is delivered; the superseded week's picks stay undelivered.
- Edge case: card saved before any teaser (Payment opened from a link with no held week) → refused at Payment open (Unit 6 precondition). If reached anyway, it completes with nothing to deliver, and the next Monday delivers normally.
- Edge case: card saved Monday between Cora's pick and the 7:00 send → this week's list (W) is delivered now with its list email. W-1 is already superseded. The send job sends nothing more to this user. `free_lists_used=1`, with no repeated ideas.
- Edge case: replaying the completion after the user changed card via "Update card" → the default card is not reset (card and tax steps run only while `trial_started_at` is null).
- Error path: `checkTaxLocation` returns invalid → `trial_started_at` stays null, nothing delivered, outcome `address_invalid`.
- Error path: the delivery email fails after `trial_started_at` was set → completion throws; the next call (webhook retry or hourly sweep) sends exactly one list email.
- Error path: a session id belonging to another user → `not_yours`, no changes.
- Race: the return page and the webhook complete at once → one state change, one delivery, one email.
- Integration: a webhook `checkout.session.completed` for an elements-mode setup session reaches the same completion; reconcile replay is a no-op after completion.

**Verification:** after any combination of return page, webhook, retries and hourly runs, the user has exactly one delivered unlocked list and one email.

- [ ] **Unit 6: Payment page (Step 4)**

**Goal:** the embedded, branded, distraction-free Payment page.

**Requirements:** R13–R24.

**Dependencies:** Units 4 and 5.

**Files:**
- Create: `src/app/start/payment/page.tsx` (server: `await connection()`; requires a signed-in trial user with no card and a held teaser, otherwise redirect to `/app`; loads the currency, the first preview with no address, and the open session client secret)
- Create: `src/app/start/payment/actions.ts` (`setPaymentCurrency` — allowed until the card is saved; `quoteTax(country, postal)`; `applyPromo(code)` / `removePromo()`; `openSession()`), all deriving amounts on the server
- Create: `src/components/app/payment/payment-form.tsx` (client: Stripe Elements provider in elements-mode Checkout, Payment Element with `wallets` and `link` never and billing address fields never; controlled name, country and postal inputs pushed through `updateBillingAddress`; confirm with `redirect: 'if_required'`; button "Start free trial", disabled with a spinner while pending; inline Stripe errors above the button)
- Create: `src/components/app/payment/price-box.tsx`. It shows:
  - the USD/CAD toggle (pattern from `circles/price.tsx`);
  - the lines "Roger monthly", tax ("Calculated from your billing address" until known), discount when applied, "Total per month";
  - "Due today: $0. Your first charge comes with your third list.";
  - aria-live on totals.
  - On mobile it collapses to a "{total} / month · Details" bar that expands in place.
- Create: `src/components/app/payment/promo-field.tsx` ("Have a promo code?" link → field + Apply button; validating state; remove control; generic error)
- Create: `src/components/app/payment/trust.tsx` (padlock, "Secured by Stripe", Visa, Mastercard and Amex marks, PCI sentence; links to refund policy, privacy, terms and support, opening in a new tab)
- Modify: `next.config.ts` (CSP headers for `/start/payment` and `/start/payment/done`)
- Modify: the `FooterSwitch` path list (hide the footer on `/start/payment*`)
- Modify: `.env.example` or the env docs (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
- Test: `src/app/start/payment/actions.test.ts`, `src/components/app/payment/price-box.test.tsx`, `src/components/app/payment/promo-field.test.tsx`, `src/components/app/payment/payment-form.test.tsx`

**Approach:**
- Heading "Payment", label "Step 4 of 4" (origin R13).
- **Every Payment server action guards itself.** One shared guard re-resolves the signed-in user and re-checks trial, no card and a held list. It is called first by `setPaymentCurrency`, `quoteTax`, `applyPromo`, `removePromo` and `openSession`, because server actions can be called directly.
- `quoteTax` is rate-limited per user and IP. Previews are cached briefly by (currency, country, postal, coupon) so typing can't drain the Stripe rate budget shared with the webhook and charge jobs.
- A currency change discards the stored `setup_session`, and a new one is created on the next open.
- **CSP:** `default-src 'self'`; `script-src 'self'` + nonce + `https://js.stripe.com https://*.js.stripe.com`; `frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com`; `connect-src 'self' https://api.stripe.com`; `img-src 'self' data: https://*.stripe.com`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`. It ships Report-Only on preview first and is enforced once Next's inline scripts are confirmed to work with the nonce.
- Layout: two columns from `md` (Price Box right, sticky); a single column below, with the summary bar on top. Inputs and button are at least 44px, using Roger tokens. The Stripe `appearance` follows Roger's fonts (Mona Sans), colours, 8px radii and error colour.
- Name, country and postal code use autocomplete attributes (`cc-name`, `country`, `postal-code`) and `inputmode` for the postal code. Inline validation runs on blur. Focus moves to the first error on a failed submit.
- "Not now" is a quiet link back to `/app`. No other outside links except the policies.
- Stripe failing to load (blocked or offline) → a message with a retry and the support address. The button stays disabled.
- `address_invalid` from the done page returns here with the message shown above the form.

**Patterns to follow:** the `plan-form.tsx` error and alert pattern, the `CirclesPrice` toggle accessibility, and `.btn btn-l`.

**Test scenarios:**
- Happy path: the page for a no-card trial with a held teaser renders the Price Box in the account currency, the "Due today: $0" line, the "Start free trial" button and the trust block, with no app nav and no footer.
- Edge case: the page for a user with a card, without a held teaser, or not signed in → redirect to `/app` (or sign-in).
- Happy path: toggle USD↔CAD → all lines update and the account currency is saved; the toggle is disabled or absent once the card is saved.
- Happy path: entering a CA postal code → the tax line shows HST with its rate and the total updates; the change is announced (aria-live).
- Error path: a malformed postal code → inline error on blur and no tax call.
- Happy path: "Have a promo code?" → Apply a valid code → discount line and new total; Remove → back to full price.
- Error path: an invalid code → generic inline error; the field keeps its text.
- Error path: the Stripe decline test card → the error shows above the button; name, country and postal are kept; the button is re-enabled.
- Edge case: a double click on "Start free trial" → one confirm call (button disabled while pending).
- Edge case: Stripe.js fails to load → fallback message, button disabled.
- Integration: the CSP header is present on `/start/payment` and allows the Stripe origins; other routes are unchanged.
- Error path: each Payment action called directly while signed out, with a card already saved, or on a closed account → refused, with no database or Stripe changes.
- Error path: rapid `quoteTax` calls past the limit → refused; repeated identical inputs are served from the cache without a Stripe call.

**Verification:** on a phone-sized viewport the page shows the summary bar, the form and the button with no navigation. A 4242 test card on preview completes and lands on the unlocked list.

- [ ] **Unit 7: No-card reminders and closes**

**Goal:** nudge and close no-card trials on their own clocks.

**Requirements:** R11.

**Dependencies:** Unit 3.

**Files:**
- Modify: `src/lib/housekeeping/trial.ts`:
  - `noCardClocks`. Teasered users close at `first_teaser_at` + 14 days, plus a week for each Roger-failure Monday (reuse `closeMoment` logic). Never-teasered users close at `consent_at` + `trialCloseDays` (21), plus the same extension.
  - Reminders on days 2 and 7 after `first_teaser_at` (kind `held_reminder`, ref `${first_teaser_at}:${day}`).
  - The existing day-3/10/17 Zack nudges extend to no-card users, measured from `consent_at`.
  - A close sets `closed`, `closed_reason` (`no_card` / `no_first_list`) and `access_ends_at`, and sends the existing closing email.
- Create: `src/lib/mail/templates/held-reminder.ts` ("Your ideas are waiting", titles only, Payment link)
- Modify: `src/lib/housekeeping/job.ts` (register `held_reminders` and `no_card_close`)
- Test: `src/lib/housekeeping/trial.test.ts`

**Approach:**
- Every clock reads the job clock parameter. The card-saved clocks (`ON_CLOCK`) are untouched because they require `trial_started_at`.
- **Do not reuse `trialClocks`' Roger-failure rule as is.** It counts every "picked but undelivered after the send" week as Roger's fault, and every held list is exactly that, so the close would slide forever. For no-card clocks, only failed Cora weeks (`cora_weeks.status = 'failed'`) and outcome `none` extend the close.
- The no-card close has its own statement, without the "undelivered picks this week" guard.
- `noCardClocks` feeds admin ops `closesAt`, so the `trial_closing` attention works for these users too.
- When a no-card user saves a card, the Zack nudges keyed by `consent_at` stop. `ON_CLOCK` starts fresh only if no list has been delivered, which can't happen after an unlock.

**Patterns to follow:** `trialClocks`, `sendTrialNudges`, `closeTrialsWithNoList`, `MAX_SENDS`.

**Test scenarios:**
- Happy path: teaser at T → reminders at T+2d and T+7d, once each; close at T+14d with the closing email.
- Edge case: a Roger-failure Monday inside the window → the close moves a week later.
- Edge case: the card is saved at T+10d → no further reminders, no close.
- Edge case: never connected Zack → Zack nudges at consent+3/10/17 and close at consent+21d; no held reminders.
- Edge case: a second teaser (supersede) doesn't restart the 14-day clock (`first_teaser_at` unchanged).
- Edge case: three teasered Mondays with no card → closed at `first_teaser_at` + 14 days. Held lists never extend the close.
- Edge case: a failed Cora week inside the window does extend it by one week.
- Error path: the closing email send fails → retried later, account stays closed, one email in the end.
- Edge case: a sponsored no-card user is never reminded or closed by these rules.

**Verification:** a scenario run over five weeks closes the no-card account at exactly the expected moment, with exactly the expected emails.

- [ ] **Unit 8: First charge with the stored coupon**

**Goal:** the promo locked in at save reaches the quote, the preview and the subscription.

**Requirements:** R12, R17.

**Dependencies:** Unit 4.

**Files:**
- Modify: `src/lib/billing/subscriptions.ts` (`preview` and `createSubscription` accept `discounts: [{coupon}]`; map `failed_tax_calculation`)
- Modify: `src/lib/billing/first-charge.ts` (pass the stored discount; skip when this week's delivered list is a free list)
- Modify: `src/lib/billing/charge-job.ts` (`due` query: `and not exists` a non-dry-run free-list pick for this user and week — the pre-existing gap in Key Technical Decisions)
- Modify: `src/lib/billing/quote.ts` (the quote includes the discount; the told amount is the discounted total)
- Modify: the `first_paid_next` and first-charge reminder templates in `src/lib/mail/templates/quote.ts` (show the discount line)
- Test: `src/lib/billing/first-charge.test.ts`, `src/lib/billing/quote.test.ts`, `src/lib/billing/subscriptions.test.ts`

**Patterns to follow:** the existing preview-equals-quote check and the `amount_changed` hold.

**Test scenarios:**
- Happy path: a user with `promo_coupon` → the quote, the preview and the subscription all carry the discount; the charge equals the told amount.
- Error path: the coupon was deleted in Stripe before the charge → the preview total differs from the quote → existing `amount_changed` hold and email; the 24-hour retry charges full price.
- Edge case: no promo → behaviour identical to today (regression).
- Integration: second free list delivered at 7:00 Monday, then the charge cron re-runs every 10 minutes until 13:00 → no subscription created that day. The charge comes the following Monday with the third list.
- Error path: `failed_tax_calculation` on create → classified as `tax_address` (held, admin alert).

**Verification:** existing first-charge tests pass unchanged; the promo cases pass.

- [ ] **Unit 9: Monthly only, copy sweep, admin state, funnel**

**Goal:** remove one-list-at-a-time from every surface, update the card wording everywhere, add the admin attention state and the funnel.

**Requirements:** R1, R6, R25, R27, R28, R30.

**Dependencies:** Units 2, 6 and 7.

**Files:**
- Modify: `src/components/app/billing-panel.tsx`, `src/lib/app/billing.ts` (remove `SwitchForm`, the switch offer, and the cancel-screen "switch to one list at a time" link; a no-card trial sees "No card yet" + a link to Payment when a teaser exists)
- Modify: `src/app/app/page.tsx`, `src/lib/app/home.ts`, `src/components/app/week-ideas.tsx` (remove the miss-banner per-run link and `OrderBox` entry points for monthly-only users)
- Modify: the public price and FAQ copy wherever it lives (`src/data/` and `src/components/circles/` — locate during implementation): monthly only; trial line "Your first two Cora lists are free. We ask for your card when your first list is ready." The FAQ keeps the higher-rate rule (origin R6: terms and FAQ only).
- Modify: `src/lib/admin/ops.ts`, `src/app/admin/ops/page.tsx` (attention `held_no_card` "First list held, no card"; status chip "Trial · no card")
- Modify: `src/lib/admin/interest.ts`, `src/app/admin/interest/page.tsx` (funnel by sign-up week: signed up, Zack connected, first teaser, card saved, first charge; replaces the per-run plan count)
- Modify: `src/app/admin/cora/page.tsx` (user picker includes no-card trials)
- Test: `src/lib/app/billing.test.ts`, `src/lib/admin/ops.test.ts`, `src/lib/admin/interest.test.ts`, `src/lib/app/home.test.ts`

**Approach:** the per-run code paths stay but become unreachable from the UI (Scope Boundaries). A repo grep for "one list at a time", "per list" and "Pay in" in user-facing copy must come back empty, apart from admin and leftover preview data.

**Test scenarios:**
- Happy path: `/app/billing` for a monthly user shows no switch option and no per-run link on the cancel screen.
- Happy path: `/app/billing` for a no-card trial with a teaser shows "No card yet" and a Payment link; without a teaser, "We'll ask for your card when your first list is ready."
- Happy path: the ops filter "Needs attention" includes every no-card user with a held list (origin R27, no age threshold).
- Happy path: the funnel counts users by sign-up week in each stage from fixture data (signed up 5, Zack connected 4, teaser 3, card 2, charged 1).
- Edge case: leftover per-run preview users still render on admin pages without errors.
- Integration: a grep test or snapshot of the rendered FAQ and price block has no one-list-at-a-time wording.

**Verification:** no user-facing surface offers or mentions one list at a time; the admin can see held, no-card users and the funnel.

- [ ] **Unit 10: Scenarios, spec and launch-list write-back, operations**

**Goal:** prove the whole new order end to end and record the change.

**Requirements:** all Success Criteria; R25 (spec lines).

**Dependencies:** Units 5, 6, 8 and 9.

**Files:**
- Modify: `tests/scenarios/helpers.ts` (`signUp()` → Step 3 with no card; a new `saveCard()` driver)
- Modify: `tests/scenarios/trial-to-paid.test.ts`, `tests/scenarios/full-cycle.test.ts` (sign-up → teaser → card → list 1 → list 2 → charge)
- Create: `tests/scenarios/held-and-closed.test.ts` (teaser, replaced teaser, reminders, 14-day close; never-connected 21-day close)
- Modify: `tests/scenarios/failed-first-charge.test.ts`, `missed-weeks.test.ts` (new sign-up order)
- Modify: `artifacts/Roger v3 - design spec.md` (version 1.4: B.4 three steps + Payment at the first list, B.7 held lists, B.8 trial clocks, B.9 monthly only, A copy lines, FAQ)
- Modify: `artifacts/launch-list.html` (Stripe area: add the `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env per environment, the Payment-page spike result, and — if the fallback is used — the `setup_intent.succeeded` webhook event in test and live; S18: add the Step 3 copy, held and teaser emails and the welcome email to the wording sign-offs)
- Modify: `artifacts/Strategy/Roger-Strategy-v3.1.md` (a note recording the reversal of decision 38 and the drop of one list at a time)
- Test: the scenario files above

**Approach:** the scenarios run on the in-process database with the fake Stripe from `helpers.ts`. Run the suite as its own step, and merge only when green (team practice).

**Test scenarios:**
- Integration: sign-up with no card → Zack run → Monday teaser (titles only, `free_lists_used=0`) → card saved midweek → list 1 delivered with "Free list 1 of 2" → Monday list 2 → next Monday the subscription is created and charged once at the quoted amount.
- Integration: two Mondays held without a card → the second teaser supersedes the first → card saved → only the newest week is delivered → the charge still comes with the third delivered list.
- Integration: a no-card user ignores every reminder → closed at teaser + 14 days with one closing email, never charged.
- Integration: a promo user → charged the discounted amount at the third list.
- Integration: a sponsored no-card user → lists delivered from the first Monday, never asked for a card.

**Verification:** all scenarios are green; the spec, strategy and launch list describe the new flow. The launch list artifact is re-published (the team works from it).

## System-Wide Impact

- **Interaction graph:** sign-up actions, the Cora pick, send and late-delivery jobs, the hourly housekeeping tasks, the Stripe webhook and reconcile, the first-charge job, the `/app` home, week and billing pages, and admin ops and interest are all touched by the "has card" predicate or the held state.
- **Error propagation:** the completion throws on failed sends so Stripe retries the webhook. Server actions never throw raw Stripe errors to the client; they map to the existing `classify()` outcomes and generic copy.
- **State lifecycle risks:**
  - Superseded weeks must never be delivered (`deliverLate` and the unlock both exclude them).
  - `first_teaser_at` is stamped once.
  - `trial_started_at` is stamped only after the tax location is valid.
  - The promo coupon is stored before the status flip in the same completion.
- **API surface parity:**
  - The admin "add a run for this user" and "give extra free list" actions must work for no-card trials. Extra free list: allowed, and counted only after the card.
  - Pilot links follow the new path.
- **Integration coverage:** the race and retry cases in Units 3 and 5 on PGlite, and the end-to-end scenarios in Unit 10.
- **Unchanged invariants:**
  - The third-list charge rule and its retries, the day-7 close, the amount-changed hold and trial cancellation (spec B.8).
  - The card update flow on `/app/billing` (hosted Checkout).
  - Weekly eligibility and scoring in Cora.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Elements-mode setup Checkout doesn't write the customer address or behave as documented on Endive | Spike first in Unit 4, before Units 5–6 start. The deferred-intent fallback is **outlined, not specified**: if the spike fails, re-plan the Unit 4–5 file lists (SetupIntent creation with `allowed_payment_method_types`, the explicit customer address write before `checkTaxLocation`, the `setup_intent.succeeded` handler) before building |
| Held lists counted as Roger failures keep no-card accounts open forever | Unit 7 uses its own failure rule (failed Cora weeks only) and has a dedicated test |
| The pre-existing same-Monday charge after a second free list | Unit 8 guard and the cron-rerun scenario; ship it even if the rest slips |
| A gate missed in the "has card" audit leaks details or charges without a card | One shared predicate; tests at each gate; the scenario run asserts no details before the card |
| `deliverLate` delivers a superseded teaser | `superseded_at` is excluded in both the late and unlock paths; a dedicated test |
| Cora runs for people who never pay | Bounded by the 14-day and 21-day closes. Sign-up requires a verified email or Google. The funnel shows the no-card count. No cap at launch (Peter, 2026-11-26); add one if abuse shows up |
| The coupon is deleted between save and charge | The existing amount-changed hold; covered by a test |
| The schema is not run on a database before deploy | Release note; scenario database included |
| The decision 38 reversal hurts conversion | The R30 funnel; the revisit threshold is left to Peter (origin, not blocking) |

## Documentation / Operational Notes

- **Before deploy:** run `db/setup.mjs` on production, preview and the scenario database.
- **Environment:** add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` on Preview (test) and Production (live). Turn Link off in the Stripe dashboard payment methods as a second guard.
- **Webhook:** `checkout.session.completed` is already subscribed on preview. Live needs it too (S16). With the fallback flow, add `setup_intent.succeeded` on both.
- **Copy:** add the new and changed emails (welcome, first list held, held reminder) and the Step 3 and Payment text to S18 sign-offs.
- **Rollout:** behind `v3.signupOpen` (still off in production). Test on preview.meetroger.ai with a 4242 card and a 3DS test card before go-live.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-11-26-payment-at-first-curation-requirements.md](../brainstorms/2026-11-26-payment-at-first-curation-requirements.md)
- Prior plan: `docs/plans/2026-11-22-001-feat-roger-v3-app-b1-plan.md` (Units 7, 11b, 12–15, 18, 19)
- Spec: `artifacts/Roger v3 - design spec.md` (B.4, B.7, B.8, B.9, B.13)
- Launch list: `artifacts/launch-list.html` (S13, S16, S18)
- External: the Stripe docs listed under External References
