# Roger v3: sign-up and payment wording, for sign-off

*Generated on November 26, 2026 from the code on PR #58 (the real templates and screens, with sample names and ideas). Each section names the file the words live in. Mark changes in a comment on the launch list or tell Claude Code; nothing here is live until sign-up opens.*

Contents: [1. Step 3, Product and Pricing](#1-step-3-product-and-pricing) · [2. Welcome email](#2-welcome-email) · [3. Your first list (in the app)](#3-your-first-list-in-the-app) · [4. First list ready email](#4-first-list-ready-email) · [5. Reminder emails, day 2 and day 7](#5-reminder-emails-day-2-and-day-7) · [6. Payment page](#6-payment-page) · [7. Discount lines](#7-discount-lines) · [8. Closing emails](#8-closing-emails) · [9. Referral credit wording (Unit 5)](#9-referral-credit-wording-unit-5--pending-peters-sign-off) · [10. Leaderboard wording (Unit 7)](#10-leaderboard-wording-unit-7--pending-peters-sign-off) · [12. Group session wording (Unit 9)](#12-group-session-wording-unit-9--pending-peters-sign-off) · [14. B3 wording](#14-b3-wording-notes-idea-id-upgrades-privacy-page--pending-peters-sign-off)

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

Your first two Cora lists are free.

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

## 9. Referral credit wording (Unit 5) — pending Peter's sign-off

*Added on November 27, 2026 from the B2 branch (plan `docs/plans/2026-11-27-001-feat-roger-v3-b2-growth-plan.md`, Unit 5). Sample figures: CA$280.00 of referral credit against a CA$316.40 first month. None of this shows unless the member has referral credit in the charge's currency.*

**Payment page Price Box** (`src/lib/billing/credit-lines.ts` labels, `src/lib/billing/payment-view.ts` `creditRows`, `src/components/app/payment/price-box.tsx`). Shown after the first month's total and any "Then" line, once the tax is known:

```text
Credit applied to your first charge    −CA$280.00
Card charged then                       CA$36.40
Then CA$316.40 a month
```

The "Then CA$316.40 a month" line is added only when credit is shown and no discount's own "Then" line already says it. "Due today: $0." is unchanged.

**The credit line** (`src/lib/billing/credit-lines.ts` `creditLineText`), used by every email, the billing page and the status line:

```text
Credit applied −CA$280.00 · Card charged CA$36.40
Credit applied −CA$280.00 · Card due CA$36.40        (an open invoice on the billing page)
```

**What is left** (`creditLeftText`), when the credit is more than the charge:

```text
CA$183.60 of credit stays on your balance.
```

**In every email that states a coming charge** (`CREDIT_AS_SENT`; second-list, 48-hour reminder, "first charge amount changed" (both), itemised invoice and plan-changed emails: `src/lib/mail/templates/quote.ts`, `charges.ts`, `invoice-itemised.ts`, `src/lib/billing/switch.ts`):

```text
Credit applied −CA$280.00 · Card charged CA$36.40. The credit shown is your referral credit balance as this email is sent.
```

**Billing page** (`src/lib/app/billing.ts` `creditNote`, `invoiceAmount`), under the next charge and in the invoice list:

```text
Credit applied −CA$280.00 · Card charged CA$36.40 (your credit balance as of Thursday, December 10).
Sunday, January 3 · R-4 · CA$316.40 · Credit applied −CA$280.00 · Card charged CA$36.40 · Paid
```

**"You’re subscribed" email** (`src/lib/mail/templates/charges.ts`, `SUBSCRIBED_CREDIT_COVERED`), from the paid invoice's figures:

```text
Your first month is CA$316.40, tax included. Credit applied −CA$280.00 · Card charged CA$36.40. Your third list is ready now, and a new one arrives every Monday.
Your first month is CA$316.40, tax included, and your referral credit covered all of it. Credit applied −CA$316.40 · Card charged CA$0.00. Your third list is ready now, and a new one arrives every Monday.
```

**Status line** (`src/lib/app/status.ts`), after the three lines that state a told first charge:

```text
Free list 2 of 2. Your next list is your first paid one: Monday, December 21, CA$316.40 with tax. Credit applied −CA$280.00 · Card charged CA$36.40.
Monthly starts with your next list: Monday, December 21 at the earliest, CA$316.40 with tax. Credit applied −CA$280.00 · Card charged CA$36.40.
Your first charge is now CA$316.40 with tax, not the amount we told you before. We charge it on Tuesday, December 15, … before then. Credit applied −CA$280.00 · Card charged CA$36.40.
```

**Plan-changed email** (`src/lib/billing/switch.ts`), after "…then the monthly price every month.":

```text
Credit applied −CA$280.00 · Card charged CA$36.40. The credit shown is your referral credit balance as this email is sent.
```

## 10. Leaderboard wording (Unit 7) — pending Peter's sign-off

*Added on November 27, 2026 from the B2 branch (plan `docs/plans/2026-11-27-001-feat-roger-v3-b2-growth-plan.md`, Unit 7). Sample names: Ken R., Mia. Nothing here shows until `leaderboardOn` is switched on, except the "paused" line and Leave.*

**Navigation** (`src/components/app/app-nav.tsx`):

```text
Leaderboard
```

**The page** (`src/app/app/leaderboard/page.tsx`):

```text
Leaderboard
The leaderboard is coming soon. We’ll let you know when it opens.
The leaderboard is paused. Your name isn’t shown to anyone while it is, and you can still leave.
Your standing
Points · Rank · On the board
3 · 3rd · Yes, as Ken R.
0 · Not ranked yet: no points so far · No, only you can see this
2 users adopted your ideas · 1 set-up confirmed
1 user adopted your idea · 1 set-up confirmed
Join the board
Your name on the board
You’re not on the board. Choose a name to show other members your rank and points. You can leave any time.
The board
A point when Cora picks one of your plays for another member, and one more when they confirm it’s set up. Ranks count every member, including those not on the board.
Rank · Member · Points
1st · Mia · 4 — 3 users adopted their ideas · 1 set-up confirmed
3rd · Ken R. (you) · 3
– (read aloud: "No points yet") · a member with no points
No one has joined the board yet.
You’re not in the top 100. Your rank is above.
```

**The join and leave controls** (`src/components/app/leaderboard-forms.tsx`):

```text
The name to show on the board   /   Your name on the board
2 to 30 characters: Latin letters (accents are fine), numbers, spaces and . ’ - &. Other members see this name, your rank and your points.
Join the board   /   Change name   /   Saving…
Leave the board   /   Leaving…
You’ve left the board.
```

**Messages** (`src/app/app/leaderboard/actions.ts`, `src/lib/growth/leaderboard-join.ts`, `src/lib/growth/leaderboard.ts`, `src/lib/growth/leaderboard-name.ts`):

```text
You’re on the board as Ken R.
That name is taken. Try another.
That name is reserved. Try another.
Use 2 to 30 characters.
Use Latin letters (accents are fine), numbers, spaces and . ' - & only.
Include at least two letters or numbers.
The leaderboard isn’t open yet.
Too many changes today. Try again tomorrow.
Your account can’t join the leaderboard.
You’re not on the leaderboard.
```

**Settings, for a member on the board** (`src/app/app/settings/actions.ts`), on the display name field, plus the board messages above:

```text
You’re on the leaderboard under this name. Leave the board first to clear it.
```

**Agent API** (`src/app/api/leaderboard/route.ts`), JSON `error` values besides the messages above:

```text
Not signed in.
Finish signing up first.
We couldn’t check your sign-in just now. Try again in a minute.
Cross-site request refused.
Send JSON: {"name": "..."}.
```

**Admin user page** (`src/app/admin/users/[id]/page.tsx`, `src/lib/admin/users.ts`), admin-only:

```text
Leaderboard
On the board as “Ken R.” since 2026-11-27 12:00.   /   Not on the board. Display name “Ken R.”   /   No display name.
Clear display name   /   Clearing…
Display name cleared and removed from the leaderboard.
Display name cleared.
```

## 11. Wednesday stats wording (Unit 8) — pending Peter's sign-off

*Added on November 27, 2026 from the B2 branch (plan `docs/plans/2026-11-27-001-feat-roger-v3-b2-growth-plan.md`, Unit 8). Sample figures: Season 1, week 7, 4 points, 3rd, US$25.00. Nothing here is sent or shown until `statsOn` is switched on, except the `/u` page and the one-click answers, which work for any link already sent.*

**The email** (`src/lib/mail/templates/stats.ts`). Subject, then the hidden preview line (the first body line), heading and body:

```text
Your week in numbers
Season 1 · week 7 of 26 · 5 bricks this Season · 12 in all.   /   Your first Season starts with your first list.
Your week in numbers
Season 1 · week 7 of 26 · 5 bricks this Season · 12 in all.   /   Your first Season starts with your first list.
4 contribution points. You rank 3rd among Roger members.   /   1 contribution point. You rank 1st among Roger members.
No contribution points yet. You earn them when an idea you shared is picked for another member.
Referral credit on your balance: US$25.00, as of Monday, December 14.   (only when there is credit a display may show)
```

Button, invitation line, and the unsubscribe line (plain text, then the HTML version, whose two links are underlined words):

```text
Invite someone to Roger
Your invitation link: https://meetroger.ai/r/abcdefghij
You get this email on Wednesdays. To stop it (your Monday list is not affected): https://meetroger.ai/u/…. Or choose your emails in Settings: https://meetroger.ai/app/settings
You get this email on Wednesdays. [Stop the Wednesday email] (your Monday list is not affected), or choose your emails in [Settings].
```

The season line is `brickSummary` from `src/lib/app/week.ts`, the same words as under the graph on `/app/history`.

**Settings, the emails list** (`src/components/app/settings-forms.tsx`), shown only while the email is on:

```text
Wednesday stats
Your Season, bricks, points and rank, once a week.
```

**The unsubscribe page** `/u/{token}` (`src/app/u/[token]/unsubscribe-view.tsx`, `UNSUB_WORDS`). Asking, done, link not valid, a failed press, and loading:

```text
Stop the Wednesday stats email?
Your Monday list email keeps coming. You can switch the stats email back on in your settings at any time.
Stop the Wednesday email

You won’t get the Wednesday stats email any more.
Your Monday list email is not affected. You can switch the stats email back on in your settings.
Open settings

That link isn’t valid.
Nothing has changed. You can choose which emails you get in your settings.
Open settings

That didn’t work. Try again.
Checking your link…
```

Tab title: `Wednesday stats email`.

**One-click answers** (`src/app/api/unsubscribe/[token]/route.ts`), plain text that mail apps rarely show:

```text
You won’t get the Wednesday stats email any more.
This link isn’t valid.
Something went wrong. Try again.
Unavailable
```

**Admin alerts** (`src/lib/growth/stats-job.ts`), admins only:

```text
[Roger] The Wednesday stats email was not sent
UNSUB_SECRET is not set, so no stats email can carry its unsubscribe link. Nothing was sent on 2026-12-16.
Set UNSUB_SECRET in Vercel (Production and Preview) and redeploy; the next run in the window sends.

[Roger] Wednesday stats emails were not all sent
2 members did not get the stats email on 2026-12-16, and the sending window has closed.
The last run failed: …   (only when it did)
Failed sends are in the notifications table (kind stats).
```

**Flags from review, for Peter:**

- **"Season" and "bricks"** are Roger's own words. A member who hasn't opened `/app/history` may not know them. Should the first line explain them, or link to the graph?
- **The invitation link shows twice:** as the button, and again as a line with the full address, so it can be copied. Keep both, or only the button?
- **"Contribution points" and the leaderboard:** the email says "contribution points" and "You rank 3rd among Roger members". The leaderboard page (section 10) says "Points" and "Rank" for the same figures, worked out by the same rule (every member with points, whether or not they joined the board). The email doesn't say "on the leaderboard", because most members won't have joined it. Should the two use the same words?

## 12. Group session wording (Unit 9) — pending Peter's sign-off

*Added on November 27, 2026 from the B2 branch (plan `docs/plans/2026-11-27-001-feat-roger-v3-b2-growth-plan.md`, Unit 9), updated after review. Sample: session on Tuesday, December 1 at 12:00 PM Toronto time; inviter Ken R.; guest Ana Silva. Nothing here shows until sign-up is open, the cycle is live and all three session settings (launch list S11) are filled. Every string is in `src/lib/growth/session-words.ts` unless another file is named.*

**Navigation** (`src/components/app/app-nav.tsx`): `Sessions`.

**The member page, `/app/sessions`** (`SESSION_WORDS`). Tab title `Group session`.

```text
Group session
Loading…
Group sessions are coming soon. We’ll let you know when the first one is set.   (while a setting is empty)

This week’s group session
Tuesday, December 1 at 12:00 PM Toronto time
An hour on Google Meet with the Roger team and other members. Bring your questions about setting up your ideas.
[Join on Google Meet]  [Add to calendar]
Opens when you subscribe   (trial, held and cancelled members: the card greyed out, no buttons, no link)
Not available on your plan.   (screen readers only, on the greyed-out card)

Bring a guest
You can invite one guest to each session. We email them an invitation with the day and time, and the link once they say they’re coming. They see your display name from your settings, or “A Roger member” if you haven’t set one.
Your guest’s name   /   Their email   /   [Send the invitation]   (Sending…)
You’ve invited Ana Silva to this session.
You’ve invited Ana Silva. Their invitation is on its way.
You’ve invited Ana Silva, but the invitation email didn’t go.   [Send it again]
You’ve invited Ana Silva, but the invitation email hasn’t gone yet.   [Send it again]
You can invite someone else to next week’s session.
```

**Invitation messages** (`INVITE_WORDS`; also the `error` of `POST /api/sessions/guest`). A message about the name or the address shows under that field:

```text
We’ve sent Ana Silva an invitation.
We’ve sent Ana Silva the invitation again.
Your invitation is saved, but the email didn’t go. Try sending it again in a minute.
We couldn’t send this invitation after several tries. Check the address with your guest, or write to us.
Your invitation is on its way. If it hasn’t gone in a few minutes, you can send it again.
Inviting a guest opens when you subscribe.
There’s no session to invite a guest to just now.
Enter your guest’s name, in letters only.
Enter your guest’s email address.
That’s your own address. Invite someone else.
You’ve already invited a guest to this session.
That person was already invited to a session this week. Try again next week.
We’ve sent all the invitations we can today. Try again tomorrow.
Too many tries. Try again in an hour.
We can’t send email to that address. Ask your guest for another one.
The invitation has already been sent.
You haven’t invited a guest to this session.
```

**Email 22, to the guest** (`src/lib/mail/templates/guest-invite.ts`). Subject, preview, heading, body, button, closing line:

```text
You’re invited to a Roger session
Ken R. invited you to Roger’s group session, Tuesday, December 1 at 12:00 PM Toronto time.
Ana Silva, you’re invited to a Roger session.
Ken R. invited you to Roger’s weekly group session, Tuesday, December 1 at 12:00 PM Toronto time. It’s an hour on Google Meet with the Roger team and members, about getting more out of your AI agent.
Open your invitation to say you’re coming and get the link to join.
[Open your invitation]
This invitation is for you only and works until the session ends. If you weren’t expecting it, you can ignore this email.
You got this because a Roger member entered your address. Stop all invitations from Roger to this address   (a link to /o/{token})
```

**A guest's opt-out page, `/o/{token}`** (`OPT_OUT_WORDS`, `src/app/o/[token]/opt-out-view.tsx`; the last line of email 22, `GUEST_OPT_OUT_WORDS` in `guest-invite.ts`, links here, and the mail app's one-click unsubscribe posts to `/api/opt-out/{token}`). Tab title `Roger invitations`. Opening it changes nothing; one button does it:

```text
Stop invitations from Roger?
A Roger member invited you to a group session. This stops every invitation from Roger to this address, whoever sends it.
[Stop invitations]
That didn’t work. Try again.                     (if the button failed)
Checking your link…                              (while loading)

Done:     You won’t get any more invitations from Roger.
          No Roger member can send an invitation to this address again.
Bad link: That link isn’t valid.
          Nothing has changed.
```

One-click answers (`/api/opt-out/{token}`, plain text, seen only by mail apps): `You won’t get any more invitations from Roger.`; `This link isn’t valid.`; `Something went wrong. Try again.`

**The guest page, `/g/{token}`** (`GUEST_WORDS`). Tab title `Your invitation`.

```text
Ken R. invited you to Roger’s group session.   (or: A Roger member invited you …)
Tuesday, December 1 at 12:00 PM Toronto time
An hour on Google Meet with the Roger team and members, about getting more out of your AI agent.
[I’m coming]
You’re on the list. Here’s the link to join.
[Join on Google Meet]  [Add to calendar]
Learn about Roger
That didn’t work. Try again.
Opening your invitation…

This invitation link isn’t valid.
It may have been mistyped, or replaced by a newer invitation. Ask the person who invited you to send it again.

This session has passed.
Thanks for your interest in Roger. Ask the person who invited you about the next one.

We can’t open invitations just now.
Try again in a minute.
```

**Calendar file** (`src/lib/growth/sessions.ts`, `sessionIcs`; served by `/app/sessions/calendar.ics` and `/g/{token}/calendar.ics`): title `Roger group session`, description `Join on Google Meet: <link>`, one hour long, file name `roger-session-2026-12-01.ics`.

**Agent answers** (`src/app/api/sessions/*`, and the calendar routes): `Not signed in.`, `Finish signing up first.`, `We couldn’t check your sign-in just now. Try again in a minute.`, `Cross-site request refused.`, `Send JSON: {"name": "...", "email": "..."}.`, `Not found`, `Try again in a minute.`

**Admin, `/admin/sessions`** (`ADMIN_SESSION_WORDS`, `src/app/admin/sessions/page.tsx`, `src/lib/growth/session-attendance.ts`), admins only: tab `Sessions`; `Group sessions`; `Next session: Tuesday, December 1, at 12:00 Toronto time.` or `The session day, time or Meet link isn’t set (v3.sessionDay, v3.sessionTime, v3.sessionLink), so members don’t see the session card.`; date chips in a list named `Session dates`, the next one with the suffix ` (next)`; `Guests on …`; `No guests were invited to this session.`; `Members`; `Paying and sponsored members, and anyone already ticked.`; `No members yet.`; `guest of Ken`; `Guest (details removed)`; `ticked by …`; the toggle `Mark attended` / `Attended` / `Saving…`, read aloud with the person, e.g. `Mark attended for Ana Silva` (pressed or not); `Marked as attended.`; `Attendance removed.`; `That isn’t a session date.`; `That guest wasn’t invited to this session.`; `No such member.`; `No such person.`

**Flags from review, for Peter:**

- **The session's length** isn't a setting: the calendar entry is one hour, and a guest's page closes an hour after the start. Is an hour right?
- **The card's description** ("Bring your questions about setting up your ideas") and the guest email's ("about getting more out of your AI agent") are drafts: what is the session about, in your words?
- **Who can invite:** paying (active) and sponsored members. A member whose renewal failed (held) or who cancelled sees the card greyed out. Right?
- **The guest's name rule:** letters, spaces and . ' - only, so nobody can put a link or a message in someone else's inbox through the name.
- **The guest's opt-out** (resolved in the whole-branch review; was "No unsubscribe link in the guest email"). The invitation now ends with a signed "Stop all invitations from Roger to this address" link, and carries List-Unsubscribe one-click headers (CASL and CAN-SPAM). Opting out stops every further invitation to that address, from any member, for good; an address that unsubscribed from Roger's watch alerts is still never invited. Without `UNSUB_SECRET` no invitation is sent. Are the new strings above right?
- **"That person was already invited to a session this week"** tells a member that someone else invited the same person. Acceptable, or should it read like the daily-cap message?

## 13. Sponsor wording (Unit 10) — pending Peter's sign-off

**Member, sign-up** (`src/lib/sponsors/code.ts`, `SPONSOR_INVALID`): one message for every sponsor link that won't give a seat (unknown, revoked or full), shown above the quiz at `/start` and on Step 3; sign-up goes on as an ordinary trial:

```
This sponsor link isn’t valid. Write to us at hello@meetroger.ai.
```

**Step 3, Product and Pricing, for a sponsored member** (`src/components/app/plan-form.tsx`): the Pricing section shows no prices and no card copy, only:

```
Harbour Realty pays for your Roger membership, so you won’t be asked for a card.
```

**Welcome email, sponsored** (`src/lib/mail/templates/welcome.ts`): preview `Harbour Realty pays for your Roger membership.`; the free-lists and price paragraphs are replaced by `Harbour Realty pays for your Roger membership, so you won’t be asked for a card.` The next-step line and button are unchanged.

**Admin alert at 80% of the seats** (`src/lib/sponsors/sponsors.ts`, once per seat count): subject `[Roger] Harbour Realty has used 8 of 10 sponsored seats`; body `Harbour Realty has 8 of its 10 seats taken. When every seat is taken, new sign-ups with its link become ordinary trials.` and `Add seats on the Sponsors page in the admin if they asked for more.`

**Sponsor's Stripe invoice** (`src/lib/sponsors/invoice.ts`): memo `Roger for Harbour Realty, November 2026`; lines `Roger seats, November 2026, standard price` and `Roger seats, November 2026, higher price (contributor rule)`, each quantity × the sponsor's price, plus tax.

**Admin, `/admin/sponsors`** (`src/app/admin/sponsors/*`, `src/components/admin-sponsors.tsx`, `src/lib/sponsors/*`), admins only:

- Page: tab `Sponsors`; heading `Sponsors`; `Sponsor sign-up is on: a person who signs up with a sponsor’s link takes a seat and is never asked for a card.` / `Sponsor sign-up is off (v3.sponsorsOn, with sign-up open and the cycle live). Links work as ordinary sign-ups until it is on.`; `No sponsors yet.`; month chips in a list named `Invoice month`; per sponsor `(code revoked)`, `8 of 10 seats taken · standard CA$200, higher CA$400 a seat a month · invoices to … · no Stripe customer yet`; `Members`, `Seat 1: …`, `No members yet.`; `Invoice for November 2026`, `2 at standard, 1 at higher: CA$800 before tax.`, each seat's `standard`/`higher`, third list and weeks; `Not prepared yet.`, `Draft in_… prepared by …. Check it in Stripe, then send it.`, `Sent … (in_…).`; `The v3 settings can’t be read, so the seats can’t be worked out.`
- New sponsor form: Name, Currency, Standard price per seat per month, Higher price per seat per month, Seats, Billing email, Billing country (United States / Canada), Billing postal or ZIP code; button `Create sponsor` / `Creating…`; after it, `The sponsor’s sign-up link. Copy it now: it isn’t shown again.` and `Code: …`; `Sponsor created.` or `Sponsor created. Its Stripe customer wasn’t made; preparing its first invoice will make it.`
- Form checks: `Enter the sponsor’s name.`, `Choose USD or CAD.`, `Enter the standard price per seat.`, `Enter the higher price per seat, at least the standard price.`, `Enter a whole number of seats.` (also on the seat edit), `Enter the billing email.`, `Choose Canada or the United States.`, `Enter a Canadian postal code, like M5V 2T6.`, `Enter a US ZIP code, like 10001.`
- Buttons: `Save seats` / `Saving…`, `Revoke code`, `Release seat`, `Prepare invoice` (`Prepare again` once a draft exists), `Send invoice`, each `Working…` while pressed. Confirms: `Revoke Harbour Realty’s code? Nobody new can take a seat with it.`, `Release Ana Lima’s seat? They become an ordinary trial.`, `Send the November 2026 invoice to ap@harbour.example?`
- Results: `Seats set to 12; 8 taken.`; `Code revoked. Members keep their seats.` / `Already revoked.`; `Seat released. They are now an ordinary trial.` / `That member doesn’t hold one of this sponsor’s seats.`; `No such sponsor.`; `No such member.`; `Stripe isn’t set up here (STRIPE_SECRET_KEY).`; `Choose a month.`
- Prepare: `Draft in_… prepared: 2 at standard and 1 at higher, CA$904 with tax.`; when Stripe can't work out the tax, `Draft in_… prepared: 2 at standard and 1 at higher, CA$800 before tax. Tax can’t be calculated: check the billing postal code.`; `November 2026 hasn’t ended yet.`; `No seats to bill for November 2026.`; `Someone is preparing this invoice now. Try again in a few minutes.`; `This invoice is being sent now.`; `The November 2026 invoice was already sent.`; `The November 2026 invoice (in_…) was already sent in Stripe.`; `Another attempt took this invoice over. Reload to see where it stands.`; `Stripe didn’t make the draft. Try again in a minute.`
- Send: `Invoice in_… sent: CA$904 with tax.`; `The November 2026 invoice was already sent.`; `Prepare the draft first.`; `The seats or prices changed since the draft was prepared. Prepare the invoice again, then send it.`; `Tax can’t be calculated: check the billing postal code. The invoice wasn’t sent.`; `Stripe refused to send it (customer_tax_location_invalid). Tax can’t be calculated: check the billing postal code.`; `The draft is gone from Stripe. Prepare the invoice again.`; `This invoice is being sent now.`; `Stripe didn’t send the invoice. Try again in a minute.`

**Flags from review, for Peter:**

- **Seat billing policy (decided in review, November 27, for your confirmation):** a seat is billed for every calendar month in which it was held, even briefly, by a member past their third list. A seat released on December 2 is billed for December too; a seat handed to a new member mid-month is billed for each member who qualifies. Closing the account ends the hold the same way.
- **A seat is held until an admin releases it**, also by a member who closed their account (billing stops after the month it closed in, but the seat isn't free for a new sign-up). Should closing an account free the seat automatically?
- **Releasing a seat makes the member an ordinary trial:** they will be asked for a card before their next list. Right, or should a released member be told first?
- **A week belongs to the month its Monday is in** for the sponsor invoice (B1's monthly members use the month containing the Sunday cutoff). Only weeks from the member's third list on, while they held the seat, count toward the contributor rule.
- **The sponsor's name is shown to its members** on Step 3 and in the welcome email. Acceptable?

## 14. B3 wording (notes, idea ID, upgrades, privacy page) — pending Peter's sign-off

*Written from the code on `feat/v3-b3-measurement` (B3 Units 5, 6, 11 and 12; completed in Unit 14, November 28, 2026).* Every member-facing string B3 adds is below, each **pending**. Nothing here is live: the note box waits for `v3.feedbackOn` (with sign-up open and the cycle live), upgrades wait for `v3.coraUpgradesOn`, and the idea ID line appears only on delivered lists, which start when the cycle goes live. The measures, the pipeline and the review bot are admin-only: they add no member-facing wording, and their admin strings are listed at the end for reference only. Review-bot pull requests carry only a fixed id line and the diff, so they hold no wording to sign off.

### 14.1 The weekly note box — pending

`src/components/app/week-note.tsx`, under a delivered list on `/app` and `/app/week/[date]`, only while `v3.feedbackOn` is on. With the switch off the box isn't shown at all.

```
A note for us
How were this week’s ideas? Only you and the Roger team see this. We read every note to make Roger better.
```

- Buttons: `Save note` / `Saving…`; `Delete note` / `Deleting…` (only once a note is saved).
- Results (`src/lib/feedback/feedback.ts`, `src/app/app/actions.ts`): `Note saved.`; `Note deleted.`; `Write your note first.`; `Keep your note to 2,000 characters or fewer.`; `You can leave a note only on a week you got ideas.`; `There’s no note to delete.`; `Notes are switched off just now.` (a save while the switch is off; deleting still works); `Too many tries. Wait a few minutes.` (after 20 failed saves in an hour; a valid note is never refused).

### 14.2 The Roger idea ID line (Cora change 15) — pending

`src/lib/cora/idea-view.ts`, `ideaIdLine`: added to what "Copy prompt and playbook" copies for each delivered idea, as its own paragraph after the safety caution and before the install prompt. The code is random per idea sent (for example `R-ABCD2345`) and carries nothing about the member or the play. The public sample has no line. Nothing else on the card or in the Monday email changes.

```
Roger idea ID: R-ABCD2345. Keep this ID with the idea in your Roger Upgrade Notes.
```

### 14.3 Cora upgrades (Cora change 11) — pending

Dark until `v3.coraUpgradesOn` is on. At most one idea a week is an upgrade to a play the member already runs. With the switch off nothing below appears anywhere (an upgrade already delivered keeps its label).

- **Label** (`src/lib/cora/idea-view.ts`, `UPGRADE_LABEL`), after the category on the card and in the sheet (`Email and calendar · Upgrade`), and after the title in the Monday email (`2. Inbox sorter (Upgrade)`):

```
Upgrade
```

- **Reason line** on an upgrade pick (`src/lib/cora/upgrade.ts`, `UPGRADE_REASON`), where other picks show "Fits the … work your week shows.":

```
A better version of a play you already run.
```

- **What's better line** (`whatsBetterLine` and `whatsBetterShown`), under the reason on the card, in the sheet and in the Monday email. Built by code from fixed phrases only (never from either playbook), one of seven:

```
What's better: Adds more steps your version doesn't have.
What's better: Adds guardrails your version doesn't have.
What's better: Adds fixes for common pitfalls your version doesn't have.
What's better: Adds more steps and guardrails your version doesn't have.
What's better: Adds more steps and fixes for common pitfalls your version doesn't have.
What's better: Adds guardrails and fixes for common pitfalls your version doesn't have.
What's better: Adds more steps, guardrails and fixes for common pitfalls your version doesn't have.
```

- **Copy paragraph** in what "Copy prompt and playbook" copies, its own paragraph after the Roger idea ID line (`UPGRADE_COPY_LINE`), so the member's agent improves their play rather than installing a second one:

```
This is an upgrade to a play you already run. Update your version with what this one adds, rather than installing a second copy.
```

### 14.4 Privacy page sentences — pending (drafted, not yet on the page)

The privacy page lives on `feat/site-v1` (PR #64), so these go there, or wherever the page lives when B3 merges (launch list `b3-privacy-page`). They replace "admin reads are not logged at launch" (the S22 decision).

```
When someone on the Roger team opens a member’s runs, lists or notes, we record who opened them and when.

Your weekly notes, and replies you email us, are kept with your account and deleted with it. An AI model (Anthropic’s, through Vercel’s AI Gateway) reads them, with the week’s runs and lists, to suggest improvements to Zack’s and Cora’s instructions. Nothing you write is copied into those suggestions or into anything public.

When your next Zack profile says you installed or used an idea we sent, we record that against the idea.
```

### 14.5 Admin-only strings, for reference (not for sign-off)

- **`/admin/users/[id]`**: section `Feedback`: `Their notes on their lists, and replies they emailed us. Private: never copy them anywhere public.`; `No feedback yet.`; per row `Note on the week of 2026-12-14 · …` or `Reply, week of 2026-12-14, added by peter@… · …`, then the text as typed (plain text). Form: `Date it came in`, `Their reply, as they wrote it`, button `Add a reply` / `Adding…`. Results: `Reply added.`; `Paste the reply first.`; `A reply can be at most 4,000 characters.`; `Enter the date the reply came in.`; `No such user.` Admin log section: `Page reads (read_runs, read_picks, read_feedback) are logged too, but not listed here.`
- **Read log refused** (`src/lib/admin/read-log.ts`), on `/admin/users/[id]`, `/admin/runs`, `/admin/flags`, `/admin/cora` (with a member chosen) and an opened proposal's evidence on `/admin/review`, when the read can't be logged:

```
This page couldn’t be logged, so it isn’t shown. Try again in a minute.
```

- **`/admin/settings`**: the switch `Cora upgrades`, hint `Cora may offer one upgrade to something a member already runs. Cora runs only while the cycle is live.`
- **`/admin/measures`** (adoption table): two more columns, `Installed (next profile)` and `Used (next profile)`, each a count and a share of ideas sent; the note under the table gains `Installed and used come from the member’s next Zack profile, matched by the idea’s Roger idea ID or its title.`

### Flags for Peter

- **"Only you and the Roger team see this."** The review bot also reads notes, through the AI Gateway, as evidence for wording changes, and never copies them into a pull request. Is "the Roger team" fair for that, or should the line say "Only you and the Roger team see this, and our review tools read it to improve Zack and Cora."? (Also launch list `b3-confirmations` 5.)
- **The idea ID line.** Is "Keep this ID with the idea in your Roger Upgrade Notes." clear enough for the member's agent, which keeps that file? And should the north star stay "marked or confirmed", with installed and used beside it (as built), or move to "used"? (`b3-confirmations` 4.)
- **Delete works with the switch off.** A member can always delete their own note, even while notes are switched off (the save is refused). Right?
- **A reply is filed under the week it came in** (the Monday of the date entered), as the list it's most likely about.
- **Cora upgrades.** "Upgrade" is also the word in "Roger Upgrade Notes": confusing, or helpful? Is "A better version of a play you already run." right when the member may prefer their own version?
- **The privacy page sentences** (14.4) are drafted here for the first time. The third one (adoption stamps) depends on `b3-confirmations` 3: if retention should clear the stamps, it should say so.
