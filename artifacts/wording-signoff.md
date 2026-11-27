# Roger v3: sign-up and payment wording, for sign-off

*Generated on November 26, 2026 from the code on PR #58 (the real templates and screens, with sample names and ideas). Each section names the file the words live in. Mark changes in a comment on the launch list or tell Claude Code; nothing here is live until sign-up opens.*

Contents: [1. Step 3, Product and Pricing](#1-step-3-product-and-pricing) · [2. Welcome email](#2-welcome-email) · [3. Your first list (in the app)](#3-your-first-list-in-the-app) · [4. First list ready email](#4-first-list-ready-email) · [5. Reminder emails, day 2 and day 7](#5-reminder-emails-day-2-and-day-7) · [6. Payment page](#6-payment-page) · [7. Discount lines](#7-discount-lines) · [8. Closing emails](#8-closing-emails)

## 1. Step 3, Product and Pricing

File: `src/components/app/plan-form.tsx`

```text
Product
Zack runs in your own AI agent each week and collects what you did and what worked. Cora curates three ideas picked for you, every Monday.
I agree that Zack will run in my AI agent account each week and send Roger his report and a private matching profile. The profile is used only to pick my ideas and is never shared. I can read exactly what Zack does, change what he collects, and turn this off at any time.
Read what Zack does first
Pricing
Roger is US$200 a month or CA$280 a month, plus tax. We’ll ask for your card before Cora’s first full list is shown. Your free trial includes your first two Cora lists, two Mondays.
Continue
```

## 2. Welcome email

File: `src/lib/mail/templates/welcome.ts` (sent when Step 3 is finished; a Canadian member shown)

**Subject:** Welcome to Roger

```text
Welcome, Ana.

Your first two Cora lists are free. When your first list is ready we’ll ask for your card.

After that, Roger is CA$280 a month, plus HST. Your first charge comes with your third list, and we’ll email you the exact date and amount before it happens. You can cancel any time in one click.

Your next step is to connect Zack to your AI agent. It takes a few minutes.

Connect Zack: https://meetroger.ai/app

--

Roger support

hello@meetroger.ai
```

## 3. Your first list (in the app)

File: `src/components/app/held-ideas.tsx` (what a member sees on their dashboard before adding a card)

```text
TEST: Turn showing feedback into a weekly seller update
Why it fits you and how to set it up open once your card is saved.
TEST: Draft listing descriptions from your notes
Why it fits you and how to set it up open once your card is saved.
TEST: A Monday pipeline summary from your CRM
Why it fits you and how to set it up open once your card is saved.
Add your card to see them Your first two lists are free. Nothing is charged today.
```

## 4. First list ready email

File: `src/lib/mail/templates/held.ts`

**Subject:** Your first 3 ideas are ready

```text
Your first 3 ideas are ready

Cora picked these ideas for you for the week of Monday, November 30:

1. TEST: Turn showing feedback into a weekly seller update

2. TEST: Draft listing descriptions from your notes

3. TEST: A Monday pipeline summary from your CRM

Add your card to see why each one fits you and how to set it up. Your first two lists are free, and nothing is charged today.

Add your card to see them: https://meetroger.ai/start/payment

--

Roger support

hello@meetroger.ai
```

## 5. Reminder emails, day 2 and day 7

File: `src/lib/mail/templates/held-reminder.ts` (the same email both days)

**Subject:** Your ideas are waiting

```text
Your ideas are waiting

Your first 3 ideas are ready. Cora picked these ideas for you for the week of Monday, November 30:

1. TEST: Turn showing feedback into a weekly seller update

2. TEST: Draft listing descriptions from your notes

3. TEST: A Monday pipeline summary from your CRM

Add your card to see why each one fits you and how to set it up. Your first two lists are free, and nothing is charged today.

If no card is added by Monday, December 14, your trial closes. Nothing is charged either way.

Add your card to see them: https://meetroger.ai/start/payment

--

Roger support

hello@meetroger.ai
```

## 6. Payment page

Files: `src/app/start/payment/page.tsx`, `src/components/app/payment/payment-form.tsx`, `price-box.tsx`, `promo-field.tsx`, `trust.tsx`. On preview you can see it live as a test member.

**Before a postal code (Canada):** the first line is the phone's summary bar and the second the desktop price line; each sits beside the USD / CAD toggle.

```text
CA$280 + tax / month Details
Roger, per month CA$280
USD
CAD
Roger monthly
CA$280
Tax
Calculated from your billing address
Total per month
CA$280 + tax
Have a promo code?
Due today: $0. Your first charge comes with your third list.
Name on card
Country
[Canada] [United States] [Another country]
Postal code
Like A1A 1A1
Card
[Stripe card fields: card number, expiry, security code]
Start free trial
Secured by Stripe VISA AMEX
Payments are processed by Stripe, a PCI DSS Level 1 certified provider. Roger never sees your card number.
Terms and refunds (opens in a new tab)
Privacy (opens in a new tab)
hello@meetroger.ai
```

**The summary once an Ontario postal code is in:**

```text
CA$316.40 / month Details
Roger, per month CA$280
USD
CAD
Roger monthly
CA$280
HST 13%
CA$36.40
Total per month
CA$316.40
Due today: $0. Your first charge comes with your third list.
```

## 7. Discount lines

File: `src/lib/billing/discount-words.ts` (shown under a promo code on the Payment page)

```text
CA$56 off your first month
CA$56 off a month for your first 3 months
CA$56 off every month
Then CA$316.40 a month
Then CA$280 + tax a month
```

## 8. Closing emails

File: `src/lib/mail/templates/zack-not-yet.ts`

**No card added, 14 days after the first list:**

**Subject:** Your Roger trial has closed

```text
Your trial has closed.

Your first ideas were ready, but no card was added, so your trial has closed. Nothing was charged.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

**No list ever made (Zack never ran), 21 days after sign-up:**

**Subject:** Your Roger trial has closed

```text
Your trial has closed.

We didn’t get a report from Zack in your trial’s 21 days, so no list went out and your trial has closed. Nothing was charged.

Want to come back? Write to us at hello@meetroger.ai.

Want to come back? Write to us: mailto:hello@meetroger.ai?subject=Coming%20back%20to%20Roger

--

Roger support

hello@meetroger.ai
```

**The "Zack hasn’t run yet" reminder (day 3 shown):**

**Subject:** Zack hasn’t sent a report yet

```text
Zack hasn’t sent a report yet.

Your free lists start with Zack’s first weekly report. We haven’t had one from him yet, so there’s nothing to pick from.

The Zack page shows how to connect him. If your agent can’t send it, you can paste or upload the report there yourself.

If no list has gone out by Thursday, December 17, your trial closes. Nothing is charged either way.

Connect Zack: https://meetroger.ai/app/zack

--

Roger support

hello@meetroger.ai
```
