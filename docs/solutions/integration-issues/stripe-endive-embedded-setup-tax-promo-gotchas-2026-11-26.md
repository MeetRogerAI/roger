---
title: "Stripe on API 2026-11-18.endive: embedded setup sessions, tax previews and promo codes behave differently than older docs and training data suggest"
date: 2026-11-26
category: integration-issues
module: billing
problem_type: integration_issue
component: payments
symptoms:
  - "ui_mode: 'custom' is rejected ('no longer supported. Use elements')"
  - "payment_method_types is rejected on Checkout Sessions and SetupIntents"
  - "customers.update({ coupon }) / promotion_code on a customer no longer exists"
  - "A preview for an unplaceable postal code returns no tax and no error"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
related_components: [service_object]
tags: [stripe, endive, checkout-elements, setup-intent, stripe-tax, invoice-preview, promotion-codes, coupons]
---

# Stripe on API 2026-11-18.endive: embedded setup, tax previews and promo codes

## Problem
Planning the embedded Payment page from memory and older docs produced several wrong assumptions about the pinned Stripe API version (`2026-11-18.endive`, `src/lib/billing/stripe.ts`). A short sandbox spike before building (plan Unit 4) caught them; without it Units 4–6 would have been built on parameters Stripe rejects.

## Symptoms
- `checkout.sessions.create({ ui_mode: 'custom' })` fails: the embedded-components mode is now `ui_mode: 'elements'`.
- `payment_method_types` fails on sessions and intents; Endive uses `allowed_payment_method_types: ['card']`.
- There is no customer-level discount any more (removed in Basil, 2025-03-31): a "lock the promo onto the customer" design cannot work.
- `invoices.createPreview` with a postal code Stripe cannot place does **not** throw; it returns `automatic_tax.status: 'requires_location_inputs'` and zero tax.

## What Didn't Work
- Trusting the plan's research summary alone: it was right about most changes but the exact enum (`elements`, not `custom`) and the no-error tax case only showed up against the real API.
- Treating any error whose message mentions "tax" or "location" as a tax-pending case: it also swallowed network/5xx failures (fixed in review, see below).

## Solution
- Embedded setup session: `mode:'setup'`, `ui_mode:'elements'`, `currency`, `customer`, `customer_update:{address:'auto',name:'auto'}`, `allowed_payment_method_types:['card']`, `return_url`, no `billing_address_collection` (that would force a full address). It returns a `client_secret`, `url: null`; `retrieve` returns the same secret, so an open session can be reused. Confirmation needs Stripe.js in a browser (the API confirm route 404s).
- Stripe.js for Endive: `@stripe/stripe-js` 10.x, `@stripe/react-stripe-js` 7.x.
- Tax quote: `invoices.createPreview` with `subscription_details.items:[{price}]`, `customer_details.address:{country, postal_code}`, `automatic_tax:{enabled:true}`, and explicit `discounts:[{coupon}]` (previews do not inherit anything from the customer). Sandbox results: Ontario CA$280 + HST 13% = CA$316.40; Quebec GST 5% only (QST line at 0 when not registered); US 10001 tax 0. Treat `requires_location_inputs` as "tax pending", not as success.
- Promo codes: `promotionCodes.list({ code, active: true, expand: ['data.promotion.coupon'] })`; the coupon is at `promotion.coupon` (Clover+). Lookup ignores case. Because Roger applies the coupon directly at subscription create (`discounts:[{coupon}]`), Stripe never counts the promotion code's redemptions, so Roger enforces `max_redemptions` and first-time rules itself (`promo_reservations`).
- Error shapes for a coupon that no longer applies (same on preview and subscription create): deleted -> `code:'resource_missing'`, `param:'discounts[0][coupon]'`; expired -> `code:'coupon_expired'`. A coupon cannot be created with a past `redeem_by`.
- Tax-error detection narrowed to Stripe invalid-request errors with codes `failed_tax_calculation`, `customer_tax_location_invalid`, `taxes_calculation_failed`; other failures return an "unavailable" quote and refund the rate-limit hit.

## Why This Works
The spike exercised the exact pinned API version with the sandbox key before any UI was built, so every parameter name, response shape and error code in `src/lib/billing/gateway.ts` comes from observed behaviour rather than from memory.

## Prevention
- For any Stripe change, run a throwaway sandbox spike against the pinned version first (scripts outside the repo, clean up what they create, never print keys) and record the observed shapes in the plan.
- Keep the fakes (`src/test-helpers/fake-card-gateway.ts`, `tests/scenarios/helpers.ts`) mirroring the observed shapes, including `coupon_expired` and `requires_location_inputs`.
- Check the Stripe changelog for every version between the one you remember and the pinned one (Basil, Clover, Dahlia, Endive).

## Related Issues
- `docs/solutions/logic-errors/one-money-rule-two-mechanisms-double-charges-2026-11-23.md` (why the card is saved now and the subscription created later, not a trialing subscription)
- Plan: `docs/plans/2026-11-26-001-feat-payment-at-first-curation-plan.md`, "Unit 4 spike", "Unit 4", "Review fixes (Unit 4)"
