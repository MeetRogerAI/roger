# Roger v3: every automatic email, for sign-off

*Generated on November 27, 2026 from the code on main, with the S18 wording Peter decided that day (branch launch/s18-wording): the real templates in `src/lib/mail/templates/`, called with sample data. The sample member is Ana, in Ontario, paying in Canadian dollars. CA$280 a month plus 13% HST is CA$316.40, and the higher rate, CA$560 plus HST, is CA$632.80. A US variant is shown where its wording differs. Links point at https://meetroger.ai, and sign-in tokens are placeholders.*

**What to do:** read each email and either say yes to it or mark the change you want, in a comment on the launch list or by telling Claude Code. Start with the points to decide below: they say what Peter decided on 2026-11-27 and what changed. Nothing here changes until sign-off (launch list g-emails, S18).

Each section gives the file the words live in and the function that builds them. It says when the email is sent, with its number in spec B.13 (the list of automatic emails, 1 to 33). Then come the subject, the hidden preview line that mail apps show after the subject, and the plain-text body. The HTML version has the same words, with the link shown as a button.

## Contents

- [Points to decide](#points-to-decide)
- [Sign-in and your email address](#sign-in-and-your-email-address)
  - [1. Sign-in link](#1-sign-in-link)
  - [2. Sign-in asked for an address with no account](#2-sign-in-asked-for-an-address-with-no-account)
  - [3. Confirm your email to start Roger (sign-up step 2)](#3-confirm-your-email-to-start-roger-sign-up-step-2)
  - [4. Google sign-in added](#4-google-sign-in-added)
  - [5. Approve an email change (to the current address)](#5-approve-an-email-change-to-the-current-address)
  - [6. Confirm your new email address (to the new address)](#6-confirm-your-new-email-address-to-the-new-address)
  - [7. Address already has an account](#7-address-already-has-an-account)
  - [8. Email address changed (to the old address)](#8-email-address-changed-to-the-old-address)
- [Sign-up and connecting Zack](#sign-up-and-connecting-zack)
  - [9. Welcome (Canadian, already runs an agent)](#9-welcome-canadian-already-runs-an-agent)
  - [10. Welcome (US member, new to agents)](#10-welcome-us-member-new-to-agents)
  - [11. Zack connected: test received](#11-zack-connected-test-received)
  - [12. Zack's first report arrived](#12-zacks-first-report-arrived)
  - [13. Zack hasn't sent a report yet (trial days 3 and 10)](#13-zack-hasnt-sent-a-report-yet-trial-days-3-and-10)
  - [14. Zack hasn't sent a report yet (trial day 17)](#14-zack-hasnt-sent-a-report-yet-trial-day-17)
  - [15. Upload reminder (members who send the report by hand)](#15-upload-reminder-members-who-send-the-report-by-hand)
- [First list held for the card](#first-list-held-for-the-card)
  - [16. Your first 3 ideas are ready (held list teaser)](#16-your-first-3-ideas-are-ready-held-list-teaser)
  - [17. Your first ideas are ready (held list teaser, short week)](#17-your-first-ideas-are-ready-held-list-teaser-short-week)
  - [18. Your ideas are waiting (held reminder)](#18-your-ideas-are-waiting-held-reminder)
  - [19. Trial closed: no card added](#19-trial-closed-no-card-added)
- [Monday lists and notes](#monday-lists-and-notes)
  - [20. Monday list, free list 1 of 2](#20-monday-list-free-list-1-of-2)
  - [21. Monday list, free list 2 of 2 (next one is paid)](#21-monday-list-free-list-2-of-2-next-one-is-paid)
  - [22. Monday list, paying member (contributing)](#22-monday-list-paying-member-contributing)
  - [23. Monday list, paying member with Zack off (USD)](#23-monday-list-paying-member-with-zack-off-usd)
  - [24. Monday list, short week (two ideas)](#24-monday-list-short-week-two-ideas)
  - [25. Your list, and your receipt (one list at a time)](#25-your-list-and-your-receipt-one-list-at-a-time)
  - [26. No list this week (trial, no report)](#26-no-list-this-week-trial-no-report)
  - [27. No new ideas this week (paying monthly member)](#27-no-new-ideas-this-week-paying-monthly-member)
  - [28. No new ideas this week (trial, on free lists)](#28-no-new-ideas-this-week-trial-on-free-lists)
  - [29. Missed week, forgiven](#29-missed-week-forgiven)
  - [30. Missed week, forgiven (the week before a renewal)](#30-missed-week-forgiven-the-week-before-a-renewal)
  - [31. Second missed week this month](#31-second-missed-week-this-month)
  - [32. Two missed weeks in your last billing month](#32-two-missed-weeks-in-your-last-billing-month)
  - [33. This month is billed at the higher rate (sharing off)](#33-this-month-is-billed-at-the-higher-rate-sharing-off)
  - [34. Your last billing month is billed at the higher rate](#34-your-last-billing-month-is-billed-at-the-higher-rate)
  - [35. Zack's report needs a look](#35-zacks-report-needs-a-look)
- [The first charge](#the-first-charge)
  - [36. Your next list is your first paid one](#36-your-next-list-is-your-first-paid-one)
  - [37. Your next list is your first paid one (with a promo code)](#37-your-next-list-is-your-first-paid-one-with-a-promo-code)
  - [38. Your next list is your first paid one (USD, promo for 3 months)](#38-your-next-list-is-your-first-paid-one-usd-promo-for-3-months)
  - [39. Reminder: your first charge could be on Monday](#39-reminder-your-first-charge-could-be-on-monday)
  - [40. Reminder: your first charge could be on Monday (promo every month)](#40-reminder-your-first-charge-could-be-on-monday-promo-every-month)
  - [41. Your first charge amount changed (after a change you made)](#41-your-first-charge-amount-changed-after-a-change-you-made)
  - [42. Your first charge amount changed (found at charge time)](#42-your-first-charge-amount-changed-found-at-charge-time)
  - [43. Your first charge amount changed (promo ended)](#43-your-first-charge-amount-changed-promo-ended)
  - [44. Your first charge moved (no ideas)](#44-your-first-charge-moved-no-ideas)
  - [45. Your first charge moved (no report)](#45-your-first-charge-moved-no-report)
  - [46. You're subscribed](#46-youre-subscribed)
  - [47. You're subscribed (USD)](#47-youre-subscribed-usd)
  - [48. You're subscribed (promo covers the first month)](#48-youre-subscribed-promo-covers-the-first-month)
  - [49. You're subscribed (amount unknown)](#49-youre-subscribed-amount-unknown)
  - [50. Your card didn't go through (will retry)](#50-your-card-didnt-go-through-will-retry)
  - [51. Your card didn't go through (declined for good)](#51-your-card-didnt-go-through-declined-for-good)
  - [52. Trial closed: card could not be charged](#52-trial-closed-card-could-not-be-charged)
  - [53. Trial closed: no list in 21 days](#53-trial-closed-no-list-in-21-days)
  - [54. Trial closed: no report for the first paid list](#54-trial-closed-no-report-for-the-first-paid-list)
- [Paying member: renewals, invoices, settings](#paying-member-renewals-invoices-settings)
  - [55. Your next invoice, itemised](#55-your-next-invoice-itemised)
  - [56. Monthly payment didn't go through](#56-monthly-payment-didnt-go-through)
  - [57. Your Monday lists are paused](#57-your-monday-lists-are-paused)
  - [58. Your payment went through](#58-your-payment-went-through)
  - [59. Sharing changed: Zack off (paying member)](#59-sharing-changed-zack-off-paying-member)
  - [60. Sharing changed: back to sharing (paying member)](#60-sharing-changed-back-to-sharing-paying-member)
  - [61. Sharing changed: matching only (trial)](#61-sharing-changed-matching-only-trial)
  - [62. Sharing changed, no price effect](#62-sharing-changed-no-price-effect)
  - [63. Rules for Zack changed](#63-rules-for-zack-changed)
  - [64. Rules for Zack changed (cleared)](#64-rules-for-zack-changed-cleared)
  - [65. Zack key replaced](#65-zack-key-replaced)
  - [66. Zack's report was deleted](#66-zacks-report-was-deleted)
- [Cancelling](#cancelling)
  - [67. Cancelled during the trial (card saved)](#67-cancelled-during-the-trial-card-saved)
  - [68. Cancelled during the trial (no card)](#68-cancelled-during-the-trial-no-card)
  - [69. Cancelled at once after a charge](#69-cancelled-at-once-after-a-charge)
  - [70. Cancelled, lists continue to the end of the paid month](#70-cancelled-lists-continue-to-the-end-of-the-paid-month)
  - [71. Cancellation undone](#71-cancellation-undone)
  - [72. Cancellation undone (renewal date unknown)](#72-cancellation-undone-renewal-date-unknown)
  - [73. Stay on monthly (switch away cancelled)](#73-stay-on-monthly-switch-away-cancelled)
- [One list at a time (leftover per-run accounts only)](#one-list-at-a-time-leftover-per-run-accounts-only)
  - [74. Your plan is now monthly](#74-your-plan-is-now-monthly)
  - [75. Your switch to one list at a time is booked](#75-your-switch-to-one-list-at-a-time-is-booked)
  - [76. Back on one list at a time](#76-back-on-one-list-at-a-time)
  - [77. Booked switch didn't happen](#77-booked-switch-didnt-happen)
  - [78. Want a list this Monday?](#78-want-a-list-this-monday)
  - [79. Your list is ordered](#79-your-list-is-ordered)
  - [80. No list this week, and no charge (no report)](#80-no-list-this-week-and-no-charge-no-report)
  - [81. No list this week, and no charge (no ideas)](#81-no-list-this-week-and-no-charge-no-ideas)
  - [82. No list this week, and no charge (Roger's fault)](#82-no-list-this-week-and-no-charge-rogers-fault)
  - [83. Order card didn't go through](#83-order-card-didnt-go-through)
  - [84. Your free lists are done (order the next one)](#84-your-free-lists-are-done-order-the-next-one)
- [Sent by an admin (fixed templates)](#sent-by-an-admin-fixed-templates)
  - [85. Nudge: Zack’s report hasn’t arrived](#85-nudge-zacks-report-hasnt-arrived)
  - [86. Nudge: Connect Zack](#86-nudge-connect-zack)
  - [87. Nudge: Finish setting up](#87-nudge-finish-setting-up)
  - [88. Address changed by support (to the new address)](#88-address-changed-by-support-to-the-new-address)
  - [89. Address changed by support (to the old address)](#89-address-changed-by-support-to-the-old-address)
- [Not rendered](#not-rendered)


## Points to decide

Peter decided (a), (c) and (d) on 2026-11-27, and (b) was already worded on main. The emails below are rendered from the changed templates. Each point keeps the sentences it was about, then says what changed.

**(a) Decided by Peter on 2026-11-27: every amount is the price plus the tax, never "tax included".** Before, every email that stated an exact charge said "tax included", and the status line said "with tax", while the welcome email said "plus HST".

What changed (`src/lib/billing/prices.ts` `chargeWords` and `monthlyWords`; the tax amount comes from Stripe's own preview or the paid invoice, never typed):

- A charge total that includes tax reads as the price plus the tax. Email 36: "that morning we’ll charge CA$316.40 (CA$280 plus CA$36.40 HST) for your first month." The same form is used in emails 37 to 43, in the switch-to-monthly email, and in the receipt, email 46: "We charged CA$316.40 (CA$280 plus CA$36.40 HST)."
- A monthly price reads "CA$280 a month plus HST", as in email 37: "After that, it’s CA$280 a month plus HST."
- With no tax collected (a US member), it is just the amount. Email 47: "We charged US$200." Email 38: "After that, it’s US$200 a month."
- The status line under the Monday list (email 21) now reads "Free list 2 of 2. Your next list is your first paid one: Monday, December 14, CA$316.40 (CA$280 plus CA$36.40 HST)." The billing page's next-charge line uses the same form.
- An amount told before this change has no tax amount stored, so it reads "CA$316.40 in total" until the next email states it again. The leftover one-at-a-time receipt line (email 25) reads that way too, because orders do not store their tax. So does a receipt paid partly from a credit balance, or one where Stripe gives no tax. The terms page now says the Payment page "shows the exact amount: the price plus the tax". The list-ordered email (email 79) now says "charged CA$280 plus HST that morning".
- The promo samples in emails 37 and 40 now add up: CA$280 less CA$56 is CA$224, plus CA$29.12 HST, so CA$253.12. The earlier render showed CA$260.40.

**(b) Already worded: the no-ideas note to a paying member and "never counts as a miss" (requirements R15).** The code on main already has this sentence. The note is built in `src/lib/cora/send-job.ts` (commit 725b875), and email 27 reads: "This list is missing because of Roger, not you, and this week never counts as a missed week." The paragraph before it reads: "Every idea in the pool this week is one you already run or have had. The pool grows every week, so there will be new ones soon." Nothing changed.

**(c) Decided by Peter on 2026-11-27: the first invoice’s higher-rate line gets its own name.** Before, a member whose Zack was off at their first paid Monday got one invoice with two lines that were both named "Roger Monthly". The higher-rate line was made from the plan’s own product through `add_invoice_items`, and Stripe names such a line after its product.

What changed (`src/lib/billing/subscriptions.ts`, `src/lib/billing/live-setup.ts`): the line is made on a second Stripe product, "Higher monthly rate", so it reads "Higher monthly rate". The charge is still the one `subscriptions.create` call, with the same parameters as before; only the product of that one line changes. The product has the plan’s tax code, and the line keeps the plan price’s tax behaviour, so it is taxed exactly like the plan line. Its id is read from STRIPE_PRODUCT_HIGHER_RATE. The live setup script makes the product and writes that variable. Until the variable is set, the line stays on the plan’s product and reads "Roger Monthly", as before. This was checked in test mode on 2026-11-27, with no coupon, a 20%-off coupon and a CA$56-off coupon. Each gave one invoice and one charge, with the line named "Higher monthly rate", the same tax rate and tax as the plan line, and the same total as the preview: CA$632.80, CA$506.24 and CA$569.52. The line has no reason in its name, unlike the later invoices’ adjustment lines (email 55: "Higher-rate adjustment for December 14 to January 14, 2027: two missed weeks: CA$280"), because `add_invoice_items` on API 2026-11-18.endive takes no description. No Roger email lists the first invoice’s lines, so no email changed for this point.

**(d) Decided by Peter on 2026-11-27: with Zack off, the getting-started card doesn't wait for a report.** This is on `/app`, not in an email. Before, under its "Wait for Monday" step, `src/components/app/onboarding-checklist.tsx` showed the same sentence whatever the member's sharing setting: "Your first list arrives on a Monday morning, once Zack has sent a report."

What changed: a member with Zack off (sharing "off") now reads "Your first list arrives on Monday morning." Members with Zack on, sharing or matching only, keep "Your first list arrives on a Monday morning, once Zack has sent a report."

**Also changed on 2026-11-27, Peter's wording for two more emails:**

- The welcome email (emails 9 and 10) gives both prices to every member, whatever their currency, followed by the member's own tax words: "After that, Roger is US$200 / CA$280 a month plus HST." Both amounts come from the settings. Peter wrote "CAD$280". It is "CA$280" here, to match every other price on the site.
- The sharing-changed email, when a member turns sharing off (emails 59 and 61, in the trial and paying alike), now reads: "Roger works by members sharing what their AI agents do, for the good of the whole network. If you don’t share, you can still use Roger and get your Cora lists, but your price doubles, to CA$560 a month. This applies only to months when you are not sharing, and the difference is added to your next invoice." The amount is the member's own higher price. The email says "doubles" only while the higher price is exactly twice the standard one; otherwise it says "your price goes up to {higher} a month". It then says: "If you didn’t make this change, open the Zack page and change it back. Your price depends on whether your Zack runs share what you learn about AI agents with the network." In the HTML email, "Zack page" is a link to the Zack page, and the plain text gives the address in brackets. Other sharing changes (emails 60 and 62) are unchanged.

## Sign-in and your email address

### 1. Sign-in link

File: `src/lib/mail/templates/sign-in.ts` (`signInLinkEmail`)

Spec B.13: 1. Sent when a member asks for a sign-in link on /signin.

**Subject:** Your Roger sign-in link

**Preview line:** It works once, for the next 15 minutes.

```text
Sign in to Roger

Use the button to sign in. The link works once, for the next 15 minutes.

Sign in: https://meetroger.ai/auth/confirm?t=sample-token

If you didn’t ask to sign in, ignore this email. Nobody can sign in without it.

--

Roger support

hello@meetroger.ai
```

### 2. Sign-in asked for an address with no account

File: `src/lib/mail/templates/sign-in.ts` (`noAccountEmail`)

Spec B.13: 1 (variant). Sent instead of the sign-in link when the address has no Roger account.

**Subject:** Your Roger sign-in link

```text
There’s no Roger account for this address

Someone asked to sign in to Roger with this email address, but there is no account for it.

If that was you, you may have used another address. Or start here:

Start Roger: https://meetroger.ai/start

If you didn’t ask, ignore this email.

--

Roger support

hello@meetroger.ai
```

### 3. Confirm your email to start Roger (sign-up step 2)

File: `src/lib/mail/templates/sign-in.ts` (`startConfirmEmail`)

Spec B.13: not numbered (sign-up). Sent during sign-up, to confirm the address before Step 3 (Product and Pricing).

**Subject:** Confirm your email to start Roger

**Preview line:** One click, then the last step.

```text
Confirm your email

Use the button to confirm this address and carry on to the last step. The link works once, for the next 15 minutes.

Confirm and continue: https://meetroger.ai/auth/confirm?t=sample-token

If you didn’t start signing up for Roger, ignore this email.

--

Roger support

hello@meetroger.ai
```

### 4. Google sign-in added

File: `src/lib/mail/templates/sign-in.ts` (`googleLinkedEmail`)

Spec B.13: 29. Sent to the account's own address the first time a Google account with the same address signs in to it.

**Subject:** Google sign-in added to your Roger account

```text
Google sign-in is now on

Someone just signed in to your Roger account with Google for the first time, using a Google account with this email address. From now on that Google account signs you in too.

If that was you, there’s nothing to do. If it wasn’t, unlink Google on your settings page straight away, and write to us.

Open your settings: https://meetroger.ai/app/settings

--

Roger support

hello@meetroger.ai
```

### 5. Approve an email change (to the current address)

File: `src/lib/mail/templates/confirm-new-email.ts` (`approveEmailChangeEmail`)

Spec B.13: 29. Step 1 of an address change: sent to the current address only, before anything goes to the new one.

**Subject:** Approve changing your Roger address to ana.new@example.com

```text
Approve the change to your email address

Someone signed in to your Roger account asked to change its email address to ana.new@example.com.

Nothing changes unless you approve it here, and then the link we send to ana.new@example.com is opened. This button works once, for the next 60 minutes.

Approve the change: https://meetroger.ai/auth/confirm?t=sample-token

If this wasn’t you, don’t press the button, and write to us: someone may be signed in to your account.

--

Roger support

hello@meetroger.ai
```

### 6. Confirm your new email address (to the new address)

File: `src/lib/mail/templates/sign-in.ts` (`confirmNewEmail`)

Spec B.13: 29. Step 2 of an address change: sent to the new address once the change is approved.

**Subject:** Confirm your new Roger email address

```text
Confirm this address

Use the button to make this your Roger email address. Until you do, your old address keeps working. The link works once, for the next 15 minutes.

Confirm this address: https://meetroger.ai/auth/confirm?t=sample-token

If you didn’t ask for this, ignore this email.

--

Roger support

hello@meetroger.ai
```

### 7. Address already has an account

File: `src/lib/mail/templates/confirm-new-email.ts` (`emailInUseEmail`)

Spec B.13: 29. Sent to an address that already has a Roger account when someone asks to move another account to it.

**Subject:** Someone tried to use this address on Roger

```text
This address already has a Roger account

Someone asked to change another Roger account’s email to this address. Because this address already has an account, nothing was changed.

If that was you, sign in with this address instead.

Sign in: https://meetroger.ai/signin

If you didn’t ask, ignore this email.

--

Roger support

hello@meetroger.ai
```

### 8. Email address changed (to the old address)

File: `src/lib/mail/templates/confirm-new-email.ts` (`emailChangedEmail`)

Spec B.13: 29. Sent to the old address once a member's own change is complete.

**Subject:** Your Roger email address changed

```text
Your email address changed

Your Roger account now uses ana.new@example.com. Sign-in links and emails go there from now on.

If you didn’t make this change, write to us straight away.

--

Roger support

hello@meetroger.ai
```

## Sign-up and connecting Zack

### 9. Welcome (Canadian, already runs an agent)

File: `src/lib/mail/templates/welcome.ts` (`welcomeEmail`)

Spec B.13: 2. Sent when Step 3 (Product and Pricing) is finished; retried hourly if the send failed.

**Subject:** Welcome to Roger

**Preview line:** Your first two Cora lists are free.

```text
Welcome, Ana.

Your first two Cora lists are free.

After that, Roger is US$200 / CA$280 a month plus HST. Your first charge comes with your third list, and we’ll email you the exact date and amount before it happens. You can cancel any time in one click.

Your next step is to connect Zack to your AI agent. It takes a few minutes.

Connect Zack: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 10. Welcome (US member, new to agents)

File: `src/lib/mail/templates/welcome.ts` (`welcomeEmail`)

Spec B.13: 2. Same trigger. Differs in the price and tax words, and in the next step for a member without an agent yet.

**Subject:** Welcome to Roger

**Preview line:** Your first two Cora lists are free.

```text
Welcome, Ana.

Your first two Cora lists are free.

After that, Roger is US$200 / CA$280 a month plus tax where it applies. Your first charge comes with your third list, and we’ll email you the exact date and amount before it happens. You can cancel any time in one click.

Your next step is to set up your AI agent and the starter team. Most people finish in about half an hour.

Get started: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 11. Zack connected: test received

File: `src/lib/mail/templates/zack-connected.ts` (`zackConnectedEmail`)

Spec B.13: 3. Sent once, when Zack's first test run arrives.

**Subject:** Connected: test received

**Preview line:** Zack reached Roger.

```text
Zack is connected.

Your test run arrived. Test runs never go into the shared pool.

From now on Zack runs every Sunday at 6:00 PM and sends his report on his own.

Open Roger: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 12. Zack's first report arrived

File: `src/lib/mail/templates/zack-connected.ts` (`zackConnectedEmail`)

Spec B.13: 3. Sent once, when Zack's first real run arrives.

**Subject:** Zack’s first report arrived

**Preview line:** It counts for your list on Monday, November 30.

```text
Zack’s first report arrived.

It counts for your list on Monday, November 30. You don’t need to do anything.

Open Roger: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 13. Zack hasn't sent a report yet (trial days 3 and 10)

File: `src/lib/mail/templates/zack-not-yet.ts` (`zackNotYetEmail`)

Spec B.13: 4. Trial days 3 and 10 with no run and no first list.

**Subject:** Zack hasn’t sent a report yet

**Preview line:** Your free lists start with Zack’s first report.

```text
Zack hasn’t sent a report yet.

Your free lists start with Zack’s first weekly report. We haven’t had one from him yet, so there’s nothing to pick from.

The Zack page shows how to connect him. If your agent can’t send it, you can paste or upload the report there yourself.

If no list has gone out by Friday, December 18, your trial closes. Nothing is charged either way.

Connect Zack: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 14. Zack hasn't sent a report yet (trial day 17)

File: `src/lib/mail/templates/zack-not-yet.ts` (`zackNotYetEmail`)

Spec B.13: 4. Trial day 17 with no run and no first list: only the subject changes.

**Subject:** Your Roger trial closes soon

**Preview line:** Your free lists start with Zack’s first report.

```text
Zack hasn’t sent a report yet.

Your free lists start with Zack’s first weekly report. We haven’t had one from him yet, so there’s nothing to pick from.

The Zack page shows how to connect him. If your agent can’t send it, you can paste or upload the report there yourself.

If no list has gone out by Friday, December 18, your trial closes. Nothing is charged either way.

Connect Zack: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 15. Upload reminder (members who send the report by hand)

File: `src/lib/mail/templates/upload-reminder.ts` (`uploadReminderEmail`)

Spec B.13: not numbered (spec B.5, upload fallback). Sunday 6:00 PM member time, when no run has arrived for the coming Monday's list.

**Subject:** Zack’s report for Monday hasn’t arrived

**Preview line:** Upload it tonight for Monday’s list.

```text
Zack’s report hasn’t arrived yet.

Your list for Monday, November 30 is picked from this week’s report, and we haven’t had it yet.

Run Zack, then paste or upload his report on the Zack page before the Sunday cutoff.

Upload the report: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

## First list held for the card

### 16. Your first 3 ideas are ready (held list teaser)

File: `src/lib/mail/templates/held.ts` (`firstListHeldEmail`)

Spec B.13: 31. Monday send, for a trial with no card: titles only. Once per held week; retried hourly.

**Subject:** Your first 3 ideas are ready

**Preview line:** Turn showing feedback into a weekly seller update · Draft listing descriptions from your notes · A Monday pipeline summa

```text
Your first 3 ideas are ready

Cora picked these ideas for you for the week of Monday, November 30:

1. Turn showing feedback into a weekly seller update

2. Draft listing descriptions from your notes

3. A Monday pipeline summary from your CRM

Add your card to see why each one fits you and how to set it up. Your first two lists are free, and nothing is charged today.

Add your card to see them: https://meetroger.ai/start/payment

--

Roger support

hello@meetroger.ai
```

### 17. Your first ideas are ready (held list teaser, short week)

File: `src/lib/mail/templates/held.ts` (`firstListHeldEmail`)

Spec B.13: 31. Same, when Cora found only one idea that fits: the subject and the wording change.

**Subject:** Your first ideas are ready

**Preview line:** Turn showing feedback into a weekly seller update

```text
Your first ideas are ready

Cora picked this idea for you for the week of Monday, November 30:

1. Turn showing feedback into a weekly seller update

Add your card to see why each one fits you and how to set it up. Your first two lists are free, and nothing is charged today.

Add your card to see them: https://meetroger.ai/start/payment

--

Roger support

hello@meetroger.ai
```

### 18. Your ideas are waiting (held reminder)

File: `src/lib/mail/templates/held-reminder.ts` (`heldReminderEmail`)

Spec B.13: 32. Days 2 and 7 after the first teaser, still no card.

**Subject:** Your ideas are waiting

**Preview line:** Turn showing feedback into a weekly seller update · Draft listing descriptions from your notes · A Monday pipeline summa

```text
Your ideas are waiting

Your first 3 ideas are ready. Cora picked these ideas for you for the week of Monday, November 30:

1. Turn showing feedback into a weekly seller update

2. Draft listing descriptions from your notes

3. A Monday pipeline summary from your CRM

Add your card to see why each one fits you and how to set it up. Your first two lists are free, and nothing is charged today.

If no card is added by Monday, December 14, your trial closes. Nothing is charged either way.

Add your card to see them: https://meetroger.ai/start/payment

--

Roger support

hello@meetroger.ai
```

### 19. Trial closed: no card added

File: `src/lib/mail/templates/zack-not-yet.ts` (`trialNoCardClosedEmail`)

Spec B.13: 33. 14 days after the first teaser with no card added.

**Subject:** Your Roger trial has closed

**Preview line:** Nothing was charged.

```text
Your trial has closed.

Your first ideas were ready, but no card was added, so your trial has closed. Nothing was charged.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

## Monday lists and notes

### 20. Monday list, free list 1 of 2

File: `src/lib/mail/templates/monday.ts` (`mondayListEmail`)

Spec B.13: 5. Monday send. The status line under the list comes from src/lib/app/status.ts (the same line as on /app).

**Subject:** Your three ideas for the week of Monday, November 30

**Preview line:** Turn showing feedback into a weekly seller update · Draft listing descriptions from your notes · A Monday pipeline summa

```text
Your ideas for the week of Monday, November 30

1. Turn showing feedback into a weekly seller update
You show three or four homes a week and already write sellers a note by hand after each one.
About 2 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2026-11-30#idea-a1

2. Draft listing descriptions from your notes
Your report says listing copy takes you most of a Sunday; this drafts it from the notes you already keep.
About 3 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2026-11-30#idea-a2

3. A Monday pipeline summary from your CRM
You keep your pipeline in a CRM your agent can already read.
Open and install: https://meetroger.ai/app/week/2026-11-30#idea-a3

Free list 1 of 2.

--

Roger support

hello@meetroger.ai
```

### 21. Monday list, free list 2 of 2 (next one is paid)

File: `src/lib/mail/templates/monday.ts` (`mondayListEmail`)

Spec B.13: 5. Monday send, second free list; the status line names the first charge.

**Subject:** Your three ideas for the week of Monday, December 7

**Preview line:** Turn showing feedback into a weekly seller update · Draft listing descriptions from your notes · A Monday pipeline summa

```text
Your ideas for the week of Monday, December 7

1. Turn showing feedback into a weekly seller update
You show three or four homes a week and already write sellers a note by hand after each one.
About 2 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2026-12-07#idea-a1

2. Draft listing descriptions from your notes
Your report says listing copy takes you most of a Sunday; this drafts it from the notes you already keep.
About 3 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2026-12-07#idea-a2

3. A Monday pipeline summary from your CRM
You keep your pipeline in a CRM your agent can already read.
Open and install: https://meetroger.ai/app/week/2026-12-07#idea-a3

Free list 2 of 2. Your next list is your first paid one: Monday, December 14, CA$316.40 (CA$280 plus CA$36.40 HST).

--

Roger support

hello@meetroger.ai
```

### 22. Monday list, paying member (contributing)

File: `src/lib/mail/templates/monday.ts` (`mondayListEmail`)

Spec B.13: 5. Monday send to a paying monthly member who shares.

**Subject:** Your three ideas for the week of Monday, January 4

**Preview line:** Turn showing feedback into a weekly seller update · Draft listing descriptions from your notes · A Monday pipeline summa

```text
Your ideas for the week of Monday, January 4

1. Turn showing feedback into a weekly seller update
You show three or four homes a week and already write sellers a note by hand after each one.
About 2 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2027-01-04#idea-a1

2. Draft listing descriptions from your notes
Your report says listing copy takes you most of a Sunday; this drafts it from the notes you already keep.
About 3 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2027-01-04#idea-a2

3. A Monday pipeline summary from your CRM
You keep your pipeline in a CRM your agent can already read.
Open and install: https://meetroger.ai/app/week/2027-01-04#idea-a3

Contributing. This month: 0 of 1 forgiven misses used. Next charge Thursday, January 14: CA$280 plus HST.

--

Roger support

hello@meetroger.ai
```

### 23. Monday list, paying member with Zack off (USD)

File: `src/lib/mail/templates/monday.ts` (`mondayListEmail`)

Spec B.13: 5. Monday send to a paying US member with sharing off: the status line adds the higher-rate rule.

**Subject:** Your three ideas for the week of Monday, January 4

**Preview line:** Turn showing feedback into a weekly seller update · Draft listing descriptions from your notes · A Monday pipeline summa

```text
Your ideas for the week of Monday, January 4

1. Turn showing feedback into a weekly seller update
You show three or four homes a week and already write sellers a note by hand after each one.
About 2 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2027-01-04#idea-a1

2. Draft listing descriptions from your notes
Your report says listing copy takes you most of a Sunday; this drafts it from the notes you already keep.
About 3 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2027-01-04#idea-a2

3. A Monday pipeline summary from your CRM
You keep your pipeline in a CRM your agent can already read.
Open and install: https://meetroger.ai/app/week/2027-01-04#idea-a3

Next charge Thursday, January 14: US$200 plus tax where it applies. With sharing off at a Sunday cutoff, that month is billed at US$400; the difference is added to your next invoice.

--

Roger support

hello@meetroger.ai
```

### 24. Monday list, short week (two ideas)

File: `src/lib/mail/templates/monday.ts` (`mondayListEmail`)

Spec B.13: 5. Monday send when only one or two ideas fit (requirements R14).

**Subject:** Your two ideas for the week of Monday, January 4

**Preview line:** Turn showing feedback into a weekly seller update · Draft listing descriptions from your notes

```text
Your ideas for the week of Monday, January 4

1. Turn showing feedback into a weekly seller update
You show three or four homes a week and already write sellers a note by hand after each one.
About 2 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2027-01-04#idea-a1

2. Draft listing descriptions from your notes
Your report says listing copy takes you most of a Sunday; this drafts it from the notes you already keep.
About 3 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2027-01-04#idea-a2

This week there are 2 ideas that fit you, not three. We only send ideas that fit.

Zack didn’t send a report this week. This one is forgiven. A second miss before Thursday, January 14 makes this month CA$560. Next charge Thursday, January 14: CA$280 plus HST.

--

Roger support

hello@meetroger.ai
```

### 25. Your list, and your receipt (one list at a time)

File: `src/lib/mail/templates/monday.ts` (`mondayListEmail`)

Spec B.13: 25. An order charged and sent. Leftover per-run accounts only (spec 1.4).

**Subject:** Your list, and your receipt

**Preview line:** Turn showing feedback into a weekly seller update · Draft listing descriptions from your notes · A Monday pipeline summa

```text
Your ideas for the week of Monday, November 30

1. Turn showing feedback into a weekly seller update
You show three or four homes a week and already write sellers a note by hand after each one.
About 2 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2026-11-30#idea-a1

2. Draft listing descriptions from your notes
Your report says listing copy takes you most of a Sunday; this drafts it from the notes you already keep.
About 3 hours a week for people who run it
Open and install: https://meetroger.ai/app/week/2026-11-30#idea-a2

3. A Monday pipeline summary from your CRM
You keep your pipeline in a CRM your agent can already read.
Open and install: https://meetroger.ai/app/week/2026-11-30#idea-a3

This list: CA$316.40 in total. Monthly is now the only plan. Write to us if you have questions about yours.

Your receipt: https://pay.stripe.com/receipts/sample

--

Roger support

hello@meetroger.ai
```

### 26. No list this week (trial, no report)

File: `src/lib/mail/templates/monday.ts` (`noRunThisWeekEmail`)

Spec B.13: 6. Monday, a trial member on free lists with Zack on and no report by the cutoff.

**Subject:** No list this week

**Preview line:** No free list was used.

```text
No list this week.

Zack hasn’t sent a report yet, so there is no list this week and no free list was used. Here is how to connect him.

Connect Zack: https://meetroger.ai/app/zack

Your first 2 lists are free.

--

Roger support

hello@meetroger.ai
```

### 27. No new ideas this week (paying monthly member)

File: `src/lib/mail/templates/monday.ts` (`noIdeasThisWeekEmail`)

Spec B.13: 27. Monday, no eligible plays for a paying monthly member (requirements R15). The note is built in src/lib/cora/send-job.ts.

**Subject:** No new ideas for you this week

**Preview line:** For Monday, January 4.

```text
No new ideas for you this week.

Every idea in the pool this week is one you already run or have had. The pool grows every week, so there will be new ones soon.

This list is missing because of Roger, not you, and this week never counts as a missed week.

Open Roger: https://meetroger.ai/app

Contributing. This month: 0 of 1 forgiven misses used. Next charge Thursday, January 14: CA$280 plus HST.

--

Roger support

hello@meetroger.ai
```

### 28. No new ideas this week (trial, on free lists)

File: `src/lib/mail/templates/monday.ts` (`noIdeasThisWeekEmail`)

Spec B.13: 27. Monday, no eligible plays for a trial member still on free lists.

**Subject:** No new ideas for you this week

**Preview line:** For Monday, December 7.

```text
No new ideas for you this week.

Every idea in the pool this week is one you already run or have had. The pool grows every week, so there will be new ones soon.

Nothing was charged, and this week doesn’t use one of your free lists.

Open Roger: https://meetroger.ai/app

Free list 1 of 2.

--

Roger support

hello@meetroger.ai
```

### 29. Missed week, forgiven

File: `src/lib/mail/templates/missed-forgiven.ts` (`missedForgivenEmail`)

Spec B.13: 12. The first missed week in a billing month (paying monthly member).

**Subject:** Zack didn’t send a report this week

**Preview line:** This one is forgiven.

```text
Zack didn’t send a report this week.

This one is forgiven. A second miss before Thursday, January 14 makes this month CA$560.

To fix it, check that Zack is still set to run each week and can reach Roger. The Zack page shows when his last report arrived, and you can upload one there by hand.

Check Zack: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 30. Missed week, forgiven (the week before a renewal)

File: `src/lib/mail/templates/missed-forgiven.ts` (`missedForgivenEmail`)

Spec B.13: 12. Same, when that billing month has already ended: no warning about a second miss.

**Subject:** Zack didn’t send a report this week

**Preview line:** This one is forgiven.

```text
Zack didn’t send a report this week.

This one is forgiven.

To fix it, check that Zack is still set to run each week and can reach Roger. The Zack page shows when his last report arrived, and you can upload one there by hand.

Check Zack: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 31. Second missed week this month

File: `src/lib/mail/templates/second-miss.ts` (`secondMissEmail`)

Spec B.13: 13. The second missed week in a billing month.

**Subject:** Your second missed week this month

**Preview line:** This month is billed at CA$560.

```text
Zack missed a second week this month.

This is your second missed week this month, so this month is billed at CA$560. The difference of CA$280 will be on your invoice of Thursday, January 14.

To fix it, check that Zack is still set to run each week and can reach Roger. The Zack page shows when his last report arrived, and you can upload one there by hand.

If you cancel on the billing page (https://meetroger.ai/app/billing) before that invoice, the difference isn’t collected.

Check Zack: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 32. Two missed weeks in your last billing month

File: `src/lib/mail/templates/second-miss.ts` (`secondMissEmail`)

Spec B.13: 13. Same, when the month it is owed for has already ended.

**Subject:** Two missed weeks in your last billing month

**Preview line:** That month is billed at CA$560.

```text
Zack missed two weeks in your billing month to Thursday, January 14.

Your billing month to Thursday, January 14 had two missed weeks, so it is billed at CA$560. The difference of CA$280 will be on your invoice of Sunday, February 14.

To fix it, check that Zack is still set to run each week and can reach Roger. The Zack page shows when his last report arrived, and you can upload one there by hand.

If you cancel on the billing page (https://meetroger.ai/app/billing) before that invoice, the difference isn’t collected.

Check Zack: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 33. This month is billed at the higher rate (sharing off)

File: `src/lib/mail/templates/second-miss.ts` (`notSharingMonthEmail`)

Spec B.13: 13 (not-sharing form). The first time a month owes the difference because sharing was off at a Sunday cutoff.

**Subject:** This month is billed at the higher rate

**Preview line:** CA$280 on your invoice of Thursday, January 14.

```text
This month is billed at the higher rate.

Zack wasn’t sharing at a Sunday cutoff this month, so this month is billed at CA$560. The difference of CA$280 will be on your invoice of Thursday, January 14.

Months with sharing on at every Sunday cutoff stay at the standard price. You can change sharing on the Zack page.

Zack settings: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 34. Your last billing month is billed at the higher rate

File: `src/lib/mail/templates/second-miss.ts` (`notSharingMonthEmail`)

Spec B.13: 13 (not-sharing form). Same, worded for a month that has already ended.

**Subject:** Your last billing month is billed at the higher rate

**Preview line:** CA$280 on your invoice of Sunday, February 14.

```text
Your last billing month is billed at the higher rate.

Your billing month to Thursday, January 14 had a Sunday cutoff with Zack not sharing, so it is billed at CA$560. The difference of CA$280 will be on your invoice of Sunday, February 14.

Months with sharing on at every Sunday cutoff stay at the standard price. You can change sharing on the Zack page.

Zack settings: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 35. Zack's report needs a look

File: `src/lib/mail/templates/run-needs-a-look.ts` (`runNeedsALookEmail`)

Spec B.13: 16. A run rejected at intake. The reason comes from src/lib/intake/validate.ts (one of its messages shown).

**Subject:** Zack’s report needs a look

**Preview line:** This week’s report couldn’t be read.

```text
Zack’s report couldn’t be read.

Zack's report has more than two plays in one set. Ask Zack to run again with the current instructions.

Zack can send it again any time before Sunday’s cutoff, or you can paste it on the Zack page.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

## The first charge

### 36. Your next list is your first paid one

File: `src/lib/mail/templates/quote.ts` (`firstPaidNextEmail`)

Spec B.13: 7. After the second free list, before that Monday's list email.

**Subject:** Your next list is your first paid one

**Preview line:** CA$316.40, no earlier than Monday, December 14.

```text
Your next list is your first paid one.

Your free lists are done. Your next list follows Zack’s next report, no earlier than Monday, December 14, and that morning we’ll charge CA$316.40 (CA$280 plus CA$36.40 HST) for your first month.

If you’d rather not continue, cancel before then and nothing is charged.

Cancel or change plan: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 37. Your next list is your first paid one (with a promo code)

File: `src/lib/mail/templates/quote.ts` (`firstPaidNextEmail`)

Spec B.13: 7. Same, with a promo code locked in at card save (here a one-month CA$56 discount).

**Subject:** Your next list is your first paid one

**Preview line:** CA$253.12, no earlier than Monday, December 14.

```text
Your next list is your first paid one.

Your free lists are done. Your next list follows Zack’s next report, no earlier than Monday, December 14, and that morning we’ll charge CA$253.12 (CA$224 plus CA$29.12 HST) for your first month.

That includes your promo code WELCOME20: CA$56 off your first month. After that, it’s CA$280 a month plus HST.

If you’d rather not continue, cancel before then and nothing is charged.

Cancel or change plan: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 38. Your next list is your first paid one (USD, promo for 3 months)

File: `src/lib/mail/templates/quote.ts` (`firstPaidNextEmail`)

Spec B.13: 7. Same, a US member with a three-month promo.

**Subject:** Your next list is your first paid one

**Preview line:** US$160, no earlier than Monday, December 14.

```text
Your next list is your first paid one.

Your free lists are done. Your next list follows Zack’s next report, no earlier than Monday, December 14, and that morning we’ll charge US$160 for your first month.

That includes your promo code SPRING: US$40 off a month for your first 3 months. After that, it’s US$200 a month.

If you’d rather not continue, cancel before then and nothing is charged.

Cancel or change plan: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 39. Reminder: your first charge could be on Monday

File: `src/lib/mail/templates/quote.ts` (`firstChargeReminderEmail`)

Spec B.13: 8. 48 hours before the first charge.

**Subject:** Your first charge could be on Monday

**Preview line:** CA$316.40, no earlier than Monday, December 14.

```text
Your first charge could be on Monday.

If Zack’s report arrives by Sunday night, your third list comes on Monday, December 14 and we’ll charge CA$316.40 (CA$280 plus CA$36.40 HST) for your first month. If it doesn’t, nothing is charged and we’ll tell you the next date.

To stop, cancel before then and nothing is charged.

Cancel or change plan: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 40. Reminder: your first charge could be on Monday (promo every month)

File: `src/lib/mail/templates/quote.ts` (`firstChargeReminderEmail`)

Spec B.13: 8. Same, with a promo that never ends.

**Subject:** Your first charge could be on Monday

**Preview line:** CA$253.12, no earlier than Monday, December 14.

```text
Your first charge could be on Monday.

If Zack’s report arrives by Sunday night, your third list comes on Monday, December 14 and we’ll charge CA$253.12 (CA$224 plus CA$29.12 HST) for your first month. If it doesn’t, nothing is charged and we’ll tell you the next date.

That includes your promo code FOUNDER: CA$56 off every month.

To stop, cancel before then and nothing is charged.

Cancel or change plan: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 41. Your first charge amount changed (after a change you made)

File: `src/lib/mail/templates/quote.ts` (`quoteChangedEmail`)

Spec B.13: 28. A change (sharing, plan, currency, address) moved the first charge's amount; here sharing turned off.

**Subject:** Your first charge amount changed

**Preview line:** Now CA$632.80.

```text
Your first charge amount changed.

After your change, your first charge, no earlier than Monday, December 14, will be CA$632.80 (CA$560 plus CA$72.80 HST).

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 42. Your first charge amount changed (found at charge time)

File: `src/lib/mail/templates/charges.ts` (`amountChangedEmail`)

Spec B.13: 28. At the charge, the amount differs from the one told: the list waits a day.

**Subject:** Your first charge amount changed

**Preview line:** It is now CA$632.80.

```text
Your first charge amount changed.

Your first charge will be CA$632.80 (CA$560 plus CA$72.80 HST). That isn’t the amount we last told you, so we’re telling you now, before charging.

We’ll charge it tomorrow and send your list then. If you’d rather not, you can cancel on the billing page before then.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 43. Your first charge amount changed (promo ended)

File: `src/lib/mail/templates/charges.ts` (`amountChangedEmail`)

Spec B.13: 28. Same, because the locked-in promo was deleted or expired in Stripe.

**Subject:** Your first charge amount changed

**Preview line:** It is now CA$316.40.

```text
Your first charge amount changed.

Your promo code’s discount (WELCOME20) has ended and can no longer be applied, so your first charge is at the full price.

Your first charge will be CA$316.40 (CA$280 plus CA$36.40 HST). That isn’t the amount we last told you, so we’re telling you now, before charging.

We’ll charge it tomorrow and send your list then. If you’d rather not, you can cancel on the billing page before then.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 44. Your first charge moved (no ideas)

File: `src/lib/mail/templates/charges.ts` (`chargeDateMovedEmail`)

Spec B.13: 28. The first-charge Monday passed with no eligible plays.

**Subject:** Your first charge moved

**Preview line:** No earlier than Monday, December 21.

```text
Your first charge moved.

This Monday there weren’t enough new ideas for your list, so nothing was charged.

Your first charge will be no earlier than Monday, December 21, with your third list. We’ll email you before it happens.

--

Roger support

hello@meetroger.ai
```

### 45. Your first charge moved (no report)

File: `src/lib/mail/templates/charges.ts` (`chargeDateMovedEmail`)

Spec B.13: 28. The first-charge Monday passed with no report from Zack.

**Subject:** Your first charge moved

**Preview line:** No earlier than Monday, December 21.

```text
Your first charge moved.

Zack’s report for this Monday didn’t arrive by Sunday night, and your list is built from it, so there was no list and nothing was charged.

Your first charge will be no earlier than Monday, December 21, with your third list. We’ll email you before it happens.

--

Roger support

hello@meetroger.ai
```

### 46. You're subscribed

File: `src/lib/mail/templates/charges.ts` (`subscribedEmail`)

Spec B.13: 9. The first charge succeeded.

**Subject:** You’re subscribed

**Preview line:** Your third list is ready.

```text
You’re subscribed.

We charged CA$316.40 (CA$280 plus CA$36.40 HST). Your third list is ready now, and a new one arrives every Monday.

You can cancel any time on the billing page, in one click.

Open this week’s list: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 47. You're subscribed (USD)

File: `src/lib/mail/templates/charges.ts` (`subscribedEmail`)

Spec B.13: 9. Same, a US member with no tax collected.

**Subject:** You’re subscribed

**Preview line:** Your third list is ready.

```text
You’re subscribed.

We charged US$200. Your third list is ready now, and a new one arrives every Monday.

You can cancel any time on the billing page, in one click.

Open this week’s list: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 48. You're subscribed (promo covers the first month)

File: `src/lib/mail/templates/charges.ts` (`subscribedEmail`)

Spec B.13: 9. Same, when the promo covers the whole first invoice.

**Subject:** You’re subscribed

**Preview line:** Your third list is ready.

```text
You’re subscribed.

Your first month is covered by your promo code, so nothing was charged. Your third list is ready now, and a new one arrives every Monday.

You can cancel any time on the billing page, in one click.

Open this week’s list: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 49. You're subscribed (amount unknown)

File: `src/lib/mail/templates/charges.ts` (`subscribedEmail`)

Spec B.13: 9. Same, when the paid amount could not be read back.

**Subject:** You’re subscribed

**Preview line:** Your third list is ready.

```text
You’re subscribed.

We charged your first month. Your third list is ready now, and a new one arrives every Monday.

You can cancel any time on the billing page, in one click.

Open this week’s list: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 50. Your card didn't go through (will retry)

File: `src/lib/mail/templates/charges.ts` (`chargeFailedEmail`)

Spec B.13: 10. Each failed first-charge attempt that Stripe can retry.

**Subject:** Your card didn’t go through

**Preview line:** Your list is waiting.

```text
Your card didn’t go through.

Your list is ready and waiting. Update your card and we’ll send it straight away.

If you don’t, we’ll try again on Wednesday, December 16, Monday, December 21.

Update your card: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 51. Your card didn't go through (declined for good)

File: `src/lib/mail/templates/charges.ts` (`chargeFailedEmail`)

Spec B.13: 10. A hard decline, or no retries left.

**Subject:** Your card didn’t go through

**Preview line:** Your list is waiting.

```text
Your card didn’t go through.

Your list is ready and waiting. Update your card and we’ll send it straight away.

Your bank declined this card, so we won’t try it again. Add a different card to continue.

Update your card: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 52. Trial closed: card could not be charged

File: `src/lib/mail/templates/charges.ts` (`trialClosedEmail`)

Spec B.13: 11. Day 7 of failed first-charge attempts.

**Subject:** Your Roger trial has closed

**Preview line:** Nothing was charged.

```text
Your trial has closed.

We couldn’t charge your card, so your trial has closed. Nothing was charged.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

### 53. Trial closed: no list in 21 days

File: `src/lib/mail/templates/zack-not-yet.ts` (`trialNoListClosedEmail`)

Spec B.13: 11. Day 21 with no first list (also a no-card trial that never got a teaser).

**Subject:** Your Roger trial has closed

**Preview line:** Nothing was charged.

```text
Your trial has closed.

We didn’t get a report from Zack in your trial’s 21 days, so no list went out and your trial has closed. Nothing was charged.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

### 54. Trial closed: no report for the first paid list

File: `src/lib/mail/templates/zack-not-yet.ts` (`trialNoChargeClosedEmail`)

Spec B.13: 11. The free lists went out, but no report came in the following 21 days.

**Subject:** Your Roger trial has closed

**Preview line:** Nothing was charged.

```text
Your trial has closed.

Your free lists went out, but we haven’t had a report from Zack in the three weeks since, so your first paid list never came and your trial has closed. Nothing was charged.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

## Paying member: renewals, invoices, settings

### 55. Your next invoice, itemised

File: `src/lib/mail/templates/invoice-itemised.ts` (`invoiceItemisedEmail`)

Spec B.13: 14. Three days before a renewal invoice that carries a higher-rate adjustment. The lines are Stripe's own invoice-preview lines; the adjustment line's name comes from src/lib/billing/adjustment.ts (lineLabel).

**Subject:** Your invoice of Thursday, January 14, itemised

**Preview line:** CA$632.80 in total.

```text
Your next invoice, itemised.

On Thursday, January 14 we’ll charge CA$632.80. It includes a higher-rate adjustment for a billing month. Here is every line:

1 × Roger Monthly (at CA$280.00 / month): CA$280

Higher-rate adjustment for December 14 to January 14, 2027: two missed weeks: CA$280

Tax: CA$72.80

Total: CA$632.80

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 56. Monthly payment didn't go through

File: `src/lib/mail/templates/renewal.ts` (`renewalFailedEmail`)

Spec B.13: 10 (renewal). A monthly renewal Stripe could not collect.

**Subject:** Your monthly payment didn’t go through

**Preview line:** Update your card to keep your lists coming.

```text
Your monthly payment didn’t go through.

We couldn’t charge your card for this month. Your lists keep coming for now, and we’ll try the card again over the next few days.

If it is still unpaid on Thursday, January 21, your Monday lists pause until it is paid. Updating your card charges it straight away.

Update your card: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 57. Your Monday lists are paused

File: `src/lib/mail/templates/renewal.ts` (`renewalHeldEmail`)

Spec B.13: 30. A renewal still unpaid on day 7.

**Subject:** Your Monday lists are paused

**Preview line:** Your monthly payment is still unpaid.

```text
Your Monday lists are paused.

Your monthly payment is still unpaid after seven days, so your lists are paused. Nothing else changes.

Update your card and we’ll charge it straight away; your lists start again the moment it is paid.

Update your card: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 58. Your payment went through

File: `src/lib/mail/templates/renewal.ts` (`renewalPaidEmail`)

Spec B.13: 30. A held renewal is paid.

**Subject:** Your payment went through

**Preview line:** Your lists are back on.

```text
Your payment went through.

Thank you. Your monthly plan is paid, and any list that was waiting is on its way.

Open Roger: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 59. Sharing changed: Zack off (paying member)

File: `src/lib/mail/templates/zack-page.ts` (`sharingChangedEmail`)

Spec B.13: 15. On a sharing change. Turning sharing off gives Peter’s explanation with the member’s own higher price (src/lib/zack/sharing-effect.ts `sharingOffPrice`); other changes give the same sentence the Zack page shows before confirming (`sharingEffect`).

**Subject:** Your Zack sharing setting changed

**Preview line:** Now: Zack off.

```text
Your sharing setting changed.

Zack is now set to “Zack off”. This applies to sharing straight away.

Roger works by members sharing what their AI agents do, for the good of the whole network. If you don’t share, you can still use Roger and get your Cora lists, but your price doubles, to CA$560 a month. This applies only to months when you are not sharing, and the difference is added to your next invoice.

If you didn’t make this change, open the Zack page (https://meetroger.ai/app/zack) and change it back. Your price depends on whether your Zack runs share what you learn about AI agents with the network.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 60. Sharing changed: back to sharing (paying member)

File: `src/lib/mail/templates/zack-page.ts` (`sharingChangedEmail`)

Spec B.13: 15. Same, turning sharing back on.

**Subject:** Your Zack sharing setting changed

**Preview line:** Now: share with the pool.

```text
Your sharing setting changed.

Zack is now set to “share with the pool”. This applies to sharing straight away.

A month with sharing on at every Sunday cutoff is CA$280. A month that already had sharing off at a cutoff stays at CA$560.

If you didn’t make this change, open the Zack page and change it back, then write to us.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 61. Sharing changed: matching only (trial)

File: `src/lib/mail/templates/zack-page.ts` (`sharingChangedEmail`)

Spec B.13: 15. Same, during the trial, before the first charge: the same words as for a paying member.

**Subject:** Your Zack sharing setting changed

**Preview line:** Now: use for my matching only.

```text
Your sharing setting changed.

Zack is now set to “use for my matching only”. This applies to sharing straight away.

Roger works by members sharing what their AI agents do, for the good of the whole network. If you don’t share, you can still use Roger and get your Cora lists, but your price doubles, to CA$560 a month. This applies only to months when you are not sharing, and the difference is added to your next invoice.

If you didn’t make this change, open the Zack page (https://meetroger.ai/app/zack) and change it back. Your price depends on whether your Zack runs share what you learn about AI agents with the network.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 62. Sharing changed, no price effect

File: `src/lib/mail/templates/zack-page.ts` (`sharingChangedEmail`)

Spec B.13: 15. Same, a change with no price effect (for example matching only to Zack off).

**Subject:** Your Zack sharing setting changed

**Preview line:** Now: Zack off.

```text
Your sharing setting changed.

Zack is now set to “Zack off”. This applies to sharing straight away.

If you didn’t make this change, open the Zack page and change it back, then write to us.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 63. Rules for Zack changed

File: `src/lib/mail/templates/zack-page.ts` (`rulesChangedEmail`)

Spec B.13: not numbered (security notice). On a change to Zack's extra rules or never-include list.

**Subject:** Your rules for Zack changed

**Preview line:** Zack will follow them from his next run.

```text
Your rules for Zack changed.

Your extra rules, which Zack follows from his next run: Skip anything about my brokerage's internal tools.

Never include: Hartley Realty, Maple Court.

If you didn’t make this change, open the Zack page and change it back, then write to us.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 64. Rules for Zack changed (cleared)

File: `src/lib/mail/templates/zack-page.ts` (`rulesChangedEmail`)

Spec B.13: not numbered (security notice). Same, both emptied.

**Subject:** Your rules for Zack changed

**Preview line:** Zack will follow them from his next run.

```text
Your rules for Zack changed.

Your extra rules are now empty.

Your never-include list is now empty.

If you didn’t make this change, open the Zack page and change it back, then write to us.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 65. Zack key replaced

File: `src/lib/mail/templates/zack-page.ts` (`keyReplacedEmail`)

Spec B.13: not numbered (security notice). When a new Zack key is made on the Zack page.

**Subject:** Your Zack key was replaced

**Preview line:** The new key starts with rk_7Q2f.

```text
Your Zack key was replaced.

A new key starting with rk_7Q2f was made on the Zack page, and the old one stopped working. Your AI agent needs the new connector text.

If you didn’t make this change, sign in, make another new key, and write to us.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 66. Zack's report was deleted

File: `src/lib/mail/templates/zack-page.ts` (`runDeletedEmail`)

Spec B.13: 18. On deleting a run.

**Subject:** Zack’s report was deleted

**Preview line:** The report for Monday, December 7.

```text
Zack’s report was deleted.

The report for your list on Monday, December 7, its private profile, and any of its plays not yet shared were removed. Plays already in the shared pool stay there in anonymous form.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

## Cancelling

### 67. Cancelled during the trial (card saved)

File: `src/lib/mail/templates/cancelled.ts` (`cancelledEmail`)

Spec B.13: 17. On cancel during the trial: the account ends at once and the card is removed.

**Subject:** Your Roger account is cancelled

**Preview line:** You have not been charged.

```text
Your account is cancelled.

You have not been charged, and we removed your saved card.

Your reports and the ideas you were sent stay readable when you sign in.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

### 68. Cancelled during the trial (no card)

File: `src/lib/mail/templates/cancelled.ts` (`cancelledEmail`)

Spec B.13: 17. Same, a trial that never saved a card.

**Subject:** Your Roger account is cancelled

**Preview line:** You have not been charged.

```text
Your account is cancelled.

You have not been charged.

Your reports and the ideas you were sent stay readable when you sign in.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

### 69. Cancelled at once after a charge

File: `src/lib/mail/templates/cancelled.ts` (`cancelledEmail`)

Spec B.13: 17. An account ended at once after it had been charged.

**Subject:** Your Roger account is cancelled

**Preview line:** Nothing more will be charged.

```text
Your account is cancelled.

Nothing more will be charged.

Your reports and the ideas you were sent stay readable when you sign in.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

### 70. Cancelled, lists continue to the end of the paid month

File: `src/lib/mail/templates/cancelled.ts` (`cancelledEmail`)

Spec B.13: 17. On cancel by a paying monthly member.

**Subject:** Your Roger plan is cancelled

**Preview line:** Your lists continue until Thursday, January 14.

```text
Your plan is cancelled.

Your lists continue until Thursday, January 14, the end of the month you paid for. Nothing more will be charged, and there is no refund for the rest of the month.

Changed your mind? Undo it on the billing page before then and your plan continues as before.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 71. Cancellation undone

File: `src/lib/mail/templates/cancelled.ts` (`cancelUndoneEmail`)

Spec B.13: 17 (undo). The cancellation is taken back before the paid month ends.

**Subject:** Your Roger plan continues

**Preview line:** Your cancellation is undone.

```text
Your plan continues.

Your cancellation is undone. Your monthly plan renews on Thursday, January 14, as before.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 72. Cancellation undone (renewal date unknown)

File: `src/lib/mail/templates/cancelled.ts` (`cancelUndoneEmail`)

Spec B.13: 17 (undo). Same, when the renewal date can't be read.

**Subject:** Your Roger plan continues

**Preview line:** Your cancellation is undone.

```text
Your plan continues.

Your cancellation is undone. Your monthly plan renews as before.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 73. Stay on monthly (switch away cancelled)

File: `src/lib/mail/templates/plan-changed.ts` (`planChangedEmail`)

Spec B.13: 15. Built in src/lib/billing/cancel.ts: a booked switch to one at a time is undone.

**Subject:** Your plan is now monthly

**Preview line:** You stay on monthly. It renews on Thursday, January 14, as before.

```text
Your plan is now monthly.

You stay on monthly. It renews on Thursday, January 14, as before.

If you didn’t make this change, open the billing page and switch back, then write to us.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

## One list at a time (leftover per-run accounts only)

### 74. Your plan is now monthly

File: `src/lib/mail/templates/plan-changed.ts` (`planChangedEmail`)

Spec B.13: 15. A switch to monthly. The effect sentence is from src/lib/billing/switch.ts (switchEffect).

**Subject:** Your plan is now monthly

**Preview line:** Monthly starts with your next list: CA$280 plus HST, charged the Monday it is ready, then every month.

```text
Your plan is now monthly.

Monthly starts with your next list: CA$280 plus HST, charged the Monday it is ready, then every month.

If you didn’t make this change, open the billing page and switch back, then write to us.

Billing: https://meetroger.ai/app/billing

Monthly is CA$280 for every Monday.

--

Roger support

hello@meetroger.ai
```

### 75. Your switch to one list at a time is booked

File: `src/lib/mail/templates/plan-changed.ts` (`planChangedEmail`)

Spec B.13: 15. A switch from monthly booked for the end of the paid month.

**Subject:** Your switch to one list at a time is booked

**Preview line:** Your monthly plan continues until Thursday, January 14, with a list every Monday, and is not renewed. After that nothing is charged unless you order a list, CA$280 plus HST each.

```text
Your switch to one list at a time is booked.

Your monthly plan continues until Thursday, January 14, with a list every Monday, and is not renewed. After that nothing is charged unless you order a list, CA$280 plus HST each.

If you didn’t make this change, open the billing page and switch back, then write to us.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 76. Back on one list at a time

File: `src/lib/mail/templates/plan-changed.ts` (`backToPerRunEmail`)

Spec B.13: 15. A switch to monthly whose first charge failed for seven days.

**Subject:** You’re back on one list at a time

**Preview line:** Your monthly plan didn’t start. Nothing was charged.

```text
You’re back on one list at a time.

We couldn’t charge your card for your first monthly payment, so monthly didn’t start and nothing was charged. That week’s list isn’t sent.

You can still order a list for any Monday you want one. Update your card first on the billing page.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 77. Booked switch didn't happen

File: `src/lib/mail/templates/plan-changed.ts` (`bookedSwitchDroppedEmail`)

Spec B.13: 15. A switch booked for after Monday that could not be made; the reason is from switch.ts.

**Subject:** Your switch to monthly didn’t happen

**Preview line:** Undo the cancellation first, then switch.

```text
Your switch to monthly didn’t happen.

Your plan is unchanged: Undo the cancellation first, then switch.

You can try again on the billing page.

Billing: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 78. Want a list this Monday?

File: `src/lib/mail/templates/order-prompt.ts` (`orderPromptEmail`)

Spec B.13: 23. Fridays, to one-at-a-time members without an order (can be switched off).

**Subject:** Want a list this Monday?

**Preview line:** Order by Sunday night for Monday, November 30.

```text
Want a list this Monday?

Order by Sunday night and your three ideas arrive on Monday, November 30. CA$280 plus HST, charged that morning once Zack’s report has arrived. No report, no charge.

Get next Monday’s list: https://meetroger.ai/app/billing

Monthly is CA$280 for every Monday.

--

You can switch these Friday reminders off in your settings.

hello@meetroger.ai
```

### 79. Your list is ordered

File: `src/lib/mail/templates/charges.ts` (`listOrderedEmail`)

Spec B.13: 24. An order placed.

**Subject:** Your list is ordered

**Preview line:** For Monday, November 30.

```text
Your list is ordered.

You’ll get your three ideas on Monday, November 30, charged CA$280 plus HST that morning, once Zack’s report for the week has arrived.

You can cancel until Sunday night.

Open Roger: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 80. No list this week, and no charge (no report)

File: `src/lib/mail/templates/charges.ts` (`orderNoListEmail`)

Spec B.13: 26. An ordered week with no Zack run by the cutoff.

**Subject:** No list this week, and no charge

**Preview line:** For Monday, November 30.

```text
No list this week, and no charge.

Zack’s report for Monday, November 30 didn’t arrive by Sunday night, and your list is built from it, so nothing was charged.

Your order doesn’t carry over. Order again for any Monday you want a list.

Open Roger: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 81. No list this week, and no charge (no ideas)

File: `src/lib/mail/templates/charges.ts` (`orderNoListEmail`)

Spec B.13: 26. An ordered week with no eligible plays.

**Subject:** No list this week, and no charge

**Preview line:** For Monday, November 30.

```text
No list this week, and no charge.

There weren’t enough new ideas for you this week, so nothing was charged.

Your order doesn’t carry over. Order again for any Monday you want a list.

Open Roger: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 82. No list this week, and no charge (Roger's fault)

File: `src/lib/mail/templates/order-closed.ts` (`orderClosedRogerFailedEmail`)

Spec B.13: 26. An ordered week closed because Roger's week failed.

**Subject:** No list this week, and no charge

**Preview line:** For Monday, November 30.

```text
No list this week, and no charge.

Something went wrong on our side and we couldn’t make the lists for Monday, November 30, so your order wasn’t charged. We’re sorry.

Your order doesn’t carry over. Order again for any Monday you want a list.

Open Roger: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

### 83. Order card didn't go through

File: `src/lib/mail/templates/charges.ts` (`orderFailedEmail`)

Spec B.13: 10 (order). An order's payment failed.

**Subject:** Your card didn’t go through

**Preview line:** No list for Monday, November 30.

```text
Your card didn’t go through.

We couldn’t charge your card for the list on Monday, November 30, so it wasn’t sent and nothing is owed.

Update your card before ordering again.

Update your card: https://meetroger.ai/app/billing

--

Roger support

hello@meetroger.ai
```

### 84. Your free lists are done (order the next one)

File: `src/lib/mail/templates/monday.ts` (`orderNextEmail`)

Spec B.13: 7 (one at a time). Dormant: no longer sent (send-job.ts, review W2). Shown for completeness.

**Subject:** Your free lists are done

**Preview line:** Order a list whenever you want one.

```text
Your free lists are done.

Order a list for any Monday you want one, until Sunday night: CA$280 plus HST. Nothing is charged unless you order.

Order next Monday’s list: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

## Sent by an admin (fixed templates)

### 85. Nudge: Zack’s report hasn’t arrived

File: `src/lib/mail/templates/admin-user.ts` (`nudgeEmail("no_run")`)

Spec B.13: not numbered (spec B.12). Sent when an admin picks this nudge on the operations screen or the user page.

**Subject:** Zack’s report hasn’t arrived yet

**Preview line:** Your list on Monday, November 30 is built from it.

```text
Zack’s report hasn’t arrived yet.

Your list on Monday, November 30 is built from this week’s report, and it needs to arrive by Sunday night.

If Zack didn’t run, ask your agent to run him now, or paste his report on the Zack page.

Open the Zack page: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 86. Nudge: Connect Zack

File: `src/lib/mail/templates/admin-user.ts` (`nudgeEmail("connect_zack")`)

Spec B.13: not numbered (spec B.12). Sent when an admin picks this nudge on the operations screen or the user page.

**Subject:** Connect Zack to get your Monday list

```text
Zack isn’t connected yet.

Roger builds your Monday list from Zack’s weekly report. Connecting him takes a few minutes, and the Zack page walks you through it.

Connect Zack: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```

### 87. Nudge: Finish setting up

File: `src/lib/mail/templates/admin-user.ts` (`nudgeEmail("finish_signup")`)

Spec B.13: not numbered (spec B.12). Sent when an admin picks this nudge on the operations screen or the user page.

**Subject:** Finish setting up Roger

```text
You’re nearly set up.

Your Roger account is waiting for its last step. Pick up where you left off and your first lists start on the next Monday.

Finish setting up: https://meetroger.ai/start

--

Roger support

hello@meetroger.ai
```

### 88. Address changed by support (to the new address)

File: `src/lib/mail/templates/admin-user.ts` (`addressChangedBySupportEmail`)

Spec B.13: not numbered (spec B.12). When support changes a member's address for them.

**Subject:** Your Roger email address changed

```text
Your email address changed

At your request, Roger support changed your account’s email address to ana.new@example.com. Sign-in links, lists and receipts come here from now on.

You’ve been signed out everywhere. Sign in again with this address.

Sign in: https://meetroger.ai/signin

If you didn’t ask for this, write to us straight away.

--

Roger support

hello@meetroger.ai
```

### 89. Address changed by support (to the old address)

File: `src/lib/mail/templates/admin-user.ts` (`addressMovedAwayEmail`)

Spec B.13: not numbered (spec B.12). Same, the notice to the old address.

**Subject:** Your Roger email address changed

```text
Your email address changed

Roger support changed your account’s email address to ana.new@example.com, at a request sent to support. This address no longer signs in.

If you didn’t ask for this, write to us straight away.

--

Roger support

hello@meetroger.ai
```

## Not rendered

- **Admin alerts (spec B.13 email 19, "Cora failed; a payment was disputed").** These go to the two admins only, never to a member. Each has a short plain body built at its call site with `adminAlert` (`src/lib/mail/send.ts`) from database ids, so there is no template to render. Each subject starts with "[Roger] ":
  - "Cora failed for {week}" and "Cora's dry run failed for {week}" (`src/lib/cora/job.ts`)
  - "Emails are failing: {kind}"
  - "A member had no eligible ideas"
  - "A first charge amount changed"
  - "A first charge has no Stripe customer"
  - "A Stripe price is missing"
  - "A first charge succeeded for a user who is no longer in trial"
  - "A paid user was set active by the repair pass"
  - "A charge claim is still open"
  - "Stripe has a live subscription Roger does not count"
  - "A pending invoice item Roger did not make"
  - "A higher-rate difference could not be added in Stripe"
  - "A higher-rate difference is missing from the invoice preview"
  - "A dropped higher-rate difference was already billed"
  - "An excused week's higher-rate difference was already invoiced"
  - "A member cancelled with a renewal unpaid"
  - "A subscription ended without a cancellation in Roger"
  - "A subscription is still live after its scheduled end"
  - "A switch to one at a time ended with a renewal unpaid"
  - "An order charge was refused by Stripe"
  - "An order invoice was paid after its charge failed"
  - "A card was confirmed on an account that has ended"
  - "A Stripe customer has an old email address"
  - "A member's address was changed but a notice did not go"

  No alert for a disputed payment was found in the code. `charge.dispute.created` appears only in a comment in `src/lib/billing/webhook.ts`.
- **Use-case watch emails (`src/lib/watches.ts`).** These are "Confirm your watch: {query}" and the daily "Someone’s agent did it: {title}". They belong to the public library site, not the member app. Their text is written inside functions that read and write the database, so they could not be called without it.
- **Spec B.13 emails 20 to 22 (week in numbers, referrals, session invites).** These are version B2 and not built yet, so there is no template.
