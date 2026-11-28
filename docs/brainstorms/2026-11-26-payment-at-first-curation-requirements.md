---
date: 2026-11-26
topic: payment-at-first-curation
---

# Product and Pricing at sign-up; Payment at the first Cora curation

## Problem Frame

Today's v3 sign-up asks for a card at Step 4, before the person has seen anything Roger makes. Step 3 asks them to pick a plan, and Step 4 surrounds the card button with dense terms ("Nothing is charged today", "no earlier than Monday, December 14…"). The ask comes too early and reads like small print.

The change has two parts:

- Sign-up ends after a plain explanation of the product and the price.
- The card is asked for at the moment of highest intent: when the person's first Cora list is ready and they can see that it is real.

At the same time Roger drops to a single plan (monthly), and the payment page is rebuilt to checkout best practice: embedded, brand-consistent, transparent about cost, and free of distractions.

This changes the billing model in spec B.4 and B.8: no card at sign-up, and a card required before the first full list. The allowance (two free lists) and the third-list charge do not change. What changes is when counting starts: free lists count only once the card is saved (R9, R10).

```
Sign-up (Steps 1-3, consent given at Step 3)          App onboarding              First Monday with a list
Step 1 Quiz -> Step 2 Account -> Step 3 Product & Pricing -> connect Zack -> Zack run -> Cora curates
                                                                                  |
                                                         teaser: "Your first 3 ideas are ready"
                                                                                  |
                                                                   Step 4 Payment (card saved, $0 today)
                                                                                  |
                                                     full list unlocked; free list 1 of 2 counted
                                                     ... free list 2 ... 3rd list -> first charge
```

## Requirements

**Plans**
- R1. Roger has one plan at launch: monthly, US$200 or CA$280 a month, before tax. "One list at a time" is no longer offered in sign-up, in `/app/billing` (no plan switch), or in copy.

**Step 3: Product and Pricing (sign-up, `/start/plan`)**
- R2. Step 3 is headed "Product and Pricing" and shows "Step 3 of 4".
- R3. A short paragraph headed **Product** explains the weekly process: Zack runs in the person's own AI agent to collect what they did and what worked, and Cora runs to curate three ideas picked for them, delivered every Monday. Final wording goes to Peter for sign-off (S18).
- R4. A short paragraph headed **Pricing** says that Roger is US$200 a month or CA$280 a month, that Roger will ask for a card before Cora's first full list is shown, and that the free trial includes the first two Cora lists ("Your free trial includes your first two Cora lists, two Mondays"). The copy promises lists, not calendar weeks, so it always matches the third-list charge (R12).
- R5. The Zack consent checkbox and the "Read what Zack does first" link stay on Step 3, under Product, and are still required. The button reads "Continue". There is no plan picker.
- R6. The contributor higher-rate rule (US$400 / CA$560) is not shown anywhere in sign-up or Payment. It lives in the terms and FAQ only.
- R7. After Step 3 the person goes into `/app` onboarding (connect Zack). The old Step 4 (card) and Step 5 (done) pages leave sign-up.

**The gate: first list ready, no card yet**
- R8. When Cora's first list for a person without a card is ready, the Monday email and `/app` say their first three ideas are ready, show the idea titles only, and link to Payment. The idea details stay hidden until the card is saved. They are withheld on the server for any account without a saved card (pages, data sent to the browser, and emails), not only hidden in the UI.
- R9. Saving the card unlocks the held list at once (the Payment success state leads straight to it). That list counts as free list 1 of 2. The unlock is triggered only by a server-verified card save (Stripe webhook or a server-side status check), never by a success flag the browser sends.
- R10. Free lists count only once the card is saved. If another Monday's list arrives while one is held, the newest list replaces the held one as the teaser, and nothing counts as used. Ideas in a replaced teaser do not count as "already sent" (Cora rule 1), so they can be picked for that person again.
- R11. People with a held list and no card get reminders on day 2 and day 7 after the first teaser ("Your ideas are waiting"). An account with a held list and no card closes 14 days after its first teaser. A Monday with no list because of Roger (Cora's week failed, or no eligible plays) pushes the close back a week. People who never connect Zack keep getting the existing day-3/10/17 "Zack hasn't sent a report yet" nudges, and close 21 days after sign-up. Both closes send the existing closing email ("Want to come back? Write to us"). This is a new close rule beside the spec B.8 one, not a reuse of it.
- R12. The first charge rule is unchanged: two free delivered lists after the card is saved, then the subscription starts and is charged with the third delivered list. Retries, the day-7 close, the "amount changed" hold and trial cancellation work as in spec B.8.

**Step 4: Payment**
- R13. Payment is a single page headed "Payment", shown as "Step 4 of 4". It replaces the old card and done steps.
- R14. Layout: a Price Box (order summary) next to the card form on desktop. On mobile the summary collapses into a bar at the top (for example "{total} / month · Details"; the tax, and so the total, depends on the province or state) above the form. The page is mobile-first, with thumb-sized inputs and button.
- R15. The Price Box has a USD / CAD toggle, defaulting from the account's currency or country. Switching it updates every line. The currency is fixed once the card is saved.
- R16. The Price Box lines are: "Roger monthly" with the price; tax (named HST, GST, etc. with its rate) once the billing address allows Stripe to calculate it, and "Calculated from your billing address" before that; "Total per month"; then "**Due today: $0**. Your first charge comes with your third list."
- R17. A discreet "Have a promo code?" text link opens a single field. A valid Stripe promotion code shows as a discount line and updates the monthly total. An invalid code shows an inline error. The discount is locked in when the card is saved: it is stored with the account then (Stripe no longer supports discounts on a customer, so it is applied to the first invoice and subscription), so the first charge matches the total shown, even if the code later expires or reaches its limit.
- R18. Card form: Stripe's embedded form, in Roger's own page and styled with Roger's fonts, colours and radii. Cards only (Visa, Mastercard, Amex). No wallets, no Stripe Link, no PayPal, Interac or BNPL. It uses browser autocomplete, auto-spaced card numbers and numeric keypads on mobile, and shows inline errors as the person leaves a field (incomplete number, past expiry, bad postal code).
- R19. It collects only what tax and the card need: card number, expiry, CVC, name on card, country and postal code. Billing countries are Canada and the US only at launch, where the postal code is enough for Stripe Tax; others see "Roger is available in Canada and the US for now". The name and email come from the account and are not asked again.
- R20. Trust signals sit near the form: a padlock with "Secured by Stripe", card brand logos, and a "PCI DSS compliant payments" note.
- R21. Links to the refund policy (no refunds; cancel any time), privacy policy, terms and the support email open in a new tab or modal, so the form keeps its state.
- R22. The page has no site or app navigation, banners or outside links other than R21 and a small Roger logo. The only exit is a quiet "Not now" back to `/app`, where the list stays held.
- R23. The button is high-contrast and reads "Start free trial". Once pressed it is disabled and shows a loading state until Stripe answers, so a double press can't create a second subscription. The server also guards against duplicates (idempotency, and one saved card setup per account), and it works out the price, currency and tax from the account, never from values the browser sends. Errors from Stripe (decline, bank confirmation) show inline above the button, and the person's entries are kept.
- R24. The following text is removed everywhere in sign-up and Payment: "Stripe keeps your card and billing address. Roger never sees the number. Nothing is charged today." and "Monthly: then CA$280 a month, plus HST. Your first charge will be no earlier than {date}. We will email you the exact date and amount before it happens. Cancel any time in one click."

**Knock-on changes**
- R25. The welcome email, the trial emails, the FAQ answers about the card, and the spec trial lines ("We ask for a card when you start", "Card required. Charged only with your third list.") are updated to match: the card is asked for when the first list is ready.
- R26. Pilot-user links (spec B.4) open at Step 3 instead of the plan step. Pilots then reach Payment at their first list like everyone else.
- R27. The admin user list shows a "first list held, no card" state, and the "Needs attention" filter includes it.
- R28. "One list at a time" is removed from everywhere it appears: the public price block, the FAQ ("Can I buy one list at a time?", "What does it cost?"), the trial line, and the "switch to one list at a time" link on the `/app/billing` cancel screen. Strategy v3.1 gets a note recording the change. This overrides the Part A scope boundary below for that copy only.
- R29. Sponsored members never see the teaser gate or Payment. Their lists arrive in full, as in spec B.15.

**Measurement**
- R30. The admin shows funnel counts by week of sign-up: signed up, Zack connected, first teaser, card saved, first charge. The change is recorded against Strategy v3.1 decision 38 (card up front), which this reverses.

## Success Criteria
- A person can go from `/start` to a connected Zack without entering a card.
- No one sees a list's details, or has a free list counted, before the card is saved. Saving the card shows the list immediately.
- On a phone, the Payment step fits a summary bar, the card form and the button with no navigation, and needs no more than the card, expiry, CVC, name, country and postal code (Canada and the US only, R19).
- The first charge still happens on the Monday of the third delivered list, and at no other time (spec check 19 still holds).
- The funnel counts (R30) show the share of first teasers that end with a saved card, so the move away from card-up-front can be judged.
- Monthly is the only plan offered anywhere in the product (leftover per-run test accounts on preview excepted).

## Scope Boundaries
- No Apple Pay, Google Pay, Link, PayPal, Interac or BNPL at launch.
- No guest checkout: the account already exists before Payment. The advice's "create the account on the confirmation page" does not apply.
- Charges to cards already saved are unchanged: existing preview test accounts on the per-run plan are not migrated (preview only; production has no users yet).
- The public v3 marketing pages (Part A) are not rebuilt here. Their price and trial copy is updated only where R25 and R28 name it.

## Key Decisions
- Monthly only: one price makes Step 3 a statement instead of a choice and removes the plan picker from Payment.
- Charge with the 3rd delivered list, not after 14 calendar days: this keeps the existing charge, retry and close logic, and a missed Zack week never costs the user.
- A titles-only teaser before the card: the person sees that the list is real and personal before being asked to pay.
- An embedded card form: brand consistency, inline validation and the summary beside the form, which a redirect can't give.
- "Start free trial" and "Due today $0": no money moves on this step, so "Pay CA$316.40" would be untrue.
- The higher-rate rule is out of the sign-up flow and the welcome email, by Peter's choice. It stays in the terms and FAQ. The spec's existing notice before any higher-rate month still goes out. The trade-off is a cleaner checkout against a member possibly being surprised by the rule later.
- The card moves from sign-up to the first teaser, reversing Strategy v3.1 decision 38. The view is that the card asked for at sign-up, surrounded by dense terms, costs more trials than it saves. R30 measures whether that holds.

## Dependencies / Assumptions
- Stripe's embedded card form does not calculate or show tax, and does not collect the name. The tax line needs Roger's own name, country and postal code fields, plus a server call to Stripe Tax whenever they change. On save, the billing address must be written to the Stripe customer before the existing tax-location check runs, which Checkout used to do automatically.
- The promo code needs Stripe promotion codes created by an admin in the dashboard.
- Verified in the code: today a consented person with no card (status `signup`) is shut out at several points. Zack key auth accepts only trial, active or held (`src/lib/zack/key.ts`). `/app` and `/app/zack` redirect `signup` to `/start`. `src/lib/cora/who-gets-a-list.ts` skips them. `src/lib/cora/deliver.ts` delivers only to trial, active or cancelled. The `users.status` check in `db/schema.sql` allows no new value. R7 to R11 need a new account state that gets through all of these, plus a "held" delivery path kept separate from normal delivery and from the free-list count.
- Sign-in is by email link or Google, so every account's email is already verified before reminders (R11) are sent.

## Outstanding Questions

### Deferred to Planning
- [Affects R8–R11][Technical] The account state for "signed up, consented, no card" (today `signup`, then `trial` once the card is saved) and how Cora's eligibility, the free-list counter and the 21-day close read it.
- [Affects R18][Technical] Payment Element in setup mode with a SetupIntent plus Stripe Tax preview, or a subscription with a trial created up front. The choice must keep "no charge until the third list" exact.
- [Affects R17][Technical] Attaching the promotion code to the Stripe customer at save, and making the first-charge amount preview include that discount, so the "amount changed" hold doesn't fire.
- [Affects R30][User decision, not blocking] The card-saved-per-teaser rate below which Peter would go back to taking the card at sign-up.
- [Affects R8][Technical] Holding list content in the email: send titles only, with details fetched on unlock.
- [Affects R25][Needs research] The full list of email templates and spec passages that mention the card-at-sign-up wording.
- [Affects R9, R23][Technical] The unlock path: a SetupIntent that is still processing or needs 3-D Secure, a tax-address failure after the card is saved, delivery of the held week failing after the status flips, and a save that lands between Monday's 1:00 cutoff and the 7:00 send. All of these need to run in one completion step that the return page and the webhook both call, so a failure can be retried.
- [Affects R18][Technical] Whether "Update card" on `/app/billing` moves to the embedded form or stays on hosted Checkout, and how the webhook tells the two flows apart.
- [Affects R14–R23][Design] Payment page states (Stripe loading or failing to load, tax pending or failed, 3-D Secure, success), the expanded mobile summary, and accessibility: toggle semantics, aria-live announcements for totals and errors, focus moved to the first error, and 44px targets.
- [Affects R17][Technical] Server-side promo validation with per-account rate limits.
- [Affects R18][Technical] A content security policy on the Payment route that allows only Stripe origins. Keep the "PCI DSS" wording only if it matches the integration chosen.

## Next Steps
-> `/ce:plan` for structured implementation planning
