# Roger Strategy v3.1 (November 21, 2026)

## Supersedes "Roger Strategy v3 (final, Nov 21 2026)". Second interview completed November 21, 2026.

**Revised November 21, 2026, after the design interview.** Pricing is now two free runs, then $200 a month or $200 a run, with no non-contributor plan offered. Eight further points were settled in the design spec and are carried into this document. Section 15 lists every revision. **Revised again November 25, 2026:** a single run went from $100 to $200 (CA$140 to CA$280); monthly brings a list every week for the same price, so it is much cheaper per list (section 15). The build spec is `Roger v3 - design spec.md`; where it gives more detail, it governs.

# About this document

## What it is

Roger is a network that makes each user's AI agents better every week. Zack collects what each user's agents did, Roger pools it, and Cora sends every user the three ideas most worth adopting each Monday.

This document sets out how Roger gets from 5 unpaid users to $30,000 billed in a month by BUZZ (February 3–4, 2027). It is both the business strategy and the product specification for Roger v3.1. It replaces the v3 file and is self-contained: a reader does not need v3.

## Who it is for

| Reader | What to take from it |
|---|---|
| Peter | The decisions made, the numbers behind the target, and the risks, stated strictly |
| Ehab | His weekly cycle, the referral loop he runs, the script, and the scorecard (sections 6 and 7) |
| The Roger team and its build agents | Every requirement as an outcome (section 10). This document does not set build order or pace |

## The strategy in five lines

1. Every user gets two free Cora runs, with a card on file that is charged only on the third.
2. After the trial a user chooses $200 a month, the clear pick, or $200 a run. Monthly brings a list every week for the price of one run, so it is much cheaper per list. Everyone contributes their Zack runs; no non-contributor plan is offered.
3. Growth runs through a referral loop that Ehab operates by hand each week until the product takes it over. Referrers earn credit equal to their referral's first payment.
4. The referral loop builds proof. Reaching $30,000 billed also needs office-level deals through brokerages and partner offices.
5. Everything is measured weekly, so real rates replace the assumptions in this document as soon as they exist.

## How it was made

From two interviews with Peter on November 20 and 21, 2026, the v3 document, the live meetroger.ai site, and the pilot users' testimonials. Every decision from the second interview is listed in Appendix A.

## How to read it

Three labels are used throughout:

- **Decided** means Peter stated or approved it in an interview.
- **Recommendation** means proposed here and not yet approved.
- **Estimate** means planning math, not a forecast.

Dates are America/Toronto. "Agents" means AI agents (Grok Bot, Claude, Hark, Duet, and others). "Users" means the people who use Roger.

| Section | Question it answers |
|---|---|
| 1. What changed from v3 | What is different from the last version? |
| 2. Executive summary | What is the plan, and how strong is it today? |
| 3. Status | Where does Roger stand right now? |
| 4. Target math | What does $30,000 billed take, and can referrals reach it? |
| 5. Pricing, trial, and referral credit | What does a user pay, when, and what does a referrer earn? |
| 6. The referral loop and the viral coefficient | How does the loop work and how is it measured? |
| 7. Ehab's role | What does Ehab do each week, and where does it run out? |
| 8. Sales and marketing | Where do users come from, and what do we say? |
| 9. Customer service | What do users get when something goes wrong? |
| 10. Product requirements | What must the product do (R1–R22)? |
| 11. Technology | What are the technical boundaries? |
| 12–14. Milestones, risks, open questions | What marks progress, what could break it, and what is undecided? |
| 15. Revisions after the design interview | What was settled once the build spec was written? |

# 1. What changed from v3

| Topic | v3 | v3.1 |
|---|---|---|
| Free period | Free 2-week white-glove setup, no stated end | **2 free Cora runs, then pay.** A card is collected at the start and charged only on the third run. Applies to everyone, including the current 5. |
| Prices | $100 single run, $200/month | **$200 a month or $200 a run**, monthly as the clear pick (a list every week for the price of one run), after two free runs. No non-contributor plan is offered. A $400 monthly rate applies only after two missed weeks in a month or when a user switches sharing off. |
| Refund | Refund within 30 days | **No refund.** The two free runs replace it. Cancel any time stays. |
| Referral reward | Leaderboard points only | **Credit equal to the referred user's first payment**, no cap. A rule for now. |
| Who runs the user loop | Peter, manually | **Ehab**, 20 hours a week, on a 7-day cycle, until automation is built. |
| Committed target | $30,000/month, stated as 150 paying users | **$30,000 actually billed in a month** by BUZZ. That needs more than 150 paying users (section 4). |
| Audience | Real estate users; Circles kept as a second audience | **Everyone moves to v3.** The Circles waitlist (about 100 people, general mix) is part of the pipeline. One pool, one product. |
| Agent platforms | Grok Bot | **Every agent platform**, listed or not. |
| Group calls | Dropped | **Weekly group session** for subscribers, each may bring one guest. |
| Human contact | "Roger support", no named person | **Ehab under his own name** for follow-ups. "Roger support" stays for automated emails and the inbox. |
| North-star target | Open | **At least 2 of every 3 Cora ideas adopted** per user per week, across all users. |
| Partner channel | None | **Growth Partners AI** (growthpartnersai.ca), office by office. |
| Checkpoint | None | **December 14** review of the referral rate (section 6). |
| Founding-user rate | Recommended, undecided | **Dropped.** The two free runs and the referral credit replace it. |
| Pipeline math | 50 discovery conversations a week at an assumed 30% conversion | **Replaced** by the referral-loop model in section 4, with measured rates taking over as data arrives. |

# 2. Executive summary

## The bet

Unchanged. Cora the Curator is the product. Zack collects, Roger aggregates, Cora curates ideas back. The network is the moat: Zack and Cora improve as data comes in across all users.

## What is new in the plan

Growth runs through a referral loop that Ehab operates by hand each week: every user runs Zack, receives Cora, sends their thoughts, and is asked for 1–2 referrals. Referred users get two free Cora runs, then pay. Referrers earn credit when their referral's first payment clears. The loop is measured weekly so its real rate replaces the assumptions in this document.

## Pricing (Decided)

Two free Cora runs, then $200 a month or $200 a run, with monthly presented as the clear pick. Monthly brings a list every Monday, about four a month, for the price of one run, so it is much cheaper than buying runs one at a time: about $50 a list instead of $200. A payment card is collected when the trial starts. Month-to-month, cancel any time, no refund.

| | US dollars | Canadian dollars |
|---|---|---|
| Monthly (the clear pick) | $200 a month | $280 a month |
| One run at a time | $200 a run | $280 a run |

HST and other applicable tax is added. No non-contributor plan is offered on the site or at sign-up. A monthly rate of $400 (CA$560) applies only after two missed weeks in a month, or when a user switches sharing off in the dashboard.

## Committed target (Decided)

$30,000 actually billed in a month by BUZZ (February 3–4, 2027), from $0 today. The target is counted in Canadian dollars, with US charges converted at the fixed 1.4.

## Strict assessment

- Paying users today: 0. Billed to date: $0.
- Evidence that users will pay $200: two verbal positives, both from users who have so far held off.
- Trial-to-paid conversion: no data.
- Second-generation referrals (a referred user referring someone): no data. The first ask is Monday, November 23.
- On referrals plus the waitlist alone, the model in section 4 reaches $30,000 billed only if every active user brings in about 0.75 new users every week with no decay and well over half of trials convert. At the early observed rate with normal decay, it reaches roughly $9,000–$14,000 before referral credits (Estimate).
- The gap has to come from office-level deals: brokerages and partner offices that bring many users at once.

# 3. Status

## Users

Five users at one brokerage are active. None are paying. Champions are Robyn and Grace, plus three users they referred, among them Chris Marinakos and Ken Finch. All five completed the onboarding cycle. In week 1, all 9 Cora ideas sent to Grace, Robyn, and Chris were used. Grace missed one Zack week because she was too busy.

## Referral baseline

- Robyn and Grace pitched about 6 people. 3 joined. That is about 3 pitches per champion and a 50% conversion.
- The 3 who declined were not open enough to AI tools.
- Over roughly three weeks that is about 0.5 new users per champion per week (Estimate, from email dates; sample of 2).
- These were hand-picked colleagues, offered a free setup with no price mentioned. Later asks will be harder: the price is now in the message and each user's supply of tech-open colleagues is limited.

## Testimonials

A testimonials document holds emailed quotes from Robyn, Grace, Chris, and Ken. Strict reading:

- The quotes praise Grok Bot and Peter's setup help. None credits Roger or Cora by name as the thing they value.
- Ken's strongest line is about time saved. It may be used as his own words (section 8).
- All four have agreed to public use (confirmed by Peter, November 21). The brokerage is not named in public material, and no brokerage is presented as an enterprise customer.

## Website

meetroger.ai currently shows the Circles pitch (8-person groups, a 45-day guarantee) and is labelled a preview that is not live. It does not yet reflect v3.1.

# 4. Target math

All figures in this section are Estimates.

## The window is 8 weeks, not 10

A user's path is: onboarded, first free run on a Monday, second free run the next Monday, payment before the third Monday. For a payment to be billed by February 3, the user must be onboarded by about January 15. From November 23 that is 8 weekly cycles, two of which fall in the holidays.

## Paying users needed for $30,000 billed

"Billed in a month" is taken here as the 30 days ending February 4, 2027 (assumption; see Open questions). Referral credits reduce billings in the month they are redeemed.

| Average billed per paying user | No credits | 30% of payers referred | 50% of payers referred |
|---|---|---|---|
| $200 (monthly, or one single run in the month) | 150 | 183 | 214 |
| $250 (some at $400) | 120 | 146 | 171 |

Planning figure: **about 180–215 paying users**, not 150. Since November 25, 2026 a single run costs the same as a month ($200), so a paying user bills at least $200 in any month they pay, whichever way they buy; the earlier "$150 (many single runs)" row assumed a $100 run and was removed.

## Referral loop scenarios

Model: 5 users today; each active user brings in a fixed number of new onboarded users per week; users who do not convert stop referring after their trial; the two holiday weeks run at half rate; onboarding closes January 15. "With waitlist" adds 15 onboarded users from the roughly 100-person waitlist (15% assumed).

| Scenario (new users per active user per week) | Onboarded by Jan 15 | Payers at 50% / 70% conversion | Billed at $200, before credits |
|---|---|---|---|
| A. Stated ask holds: 0.75, no decay | 161 / 203 | 80 / 142 | $16,100 / $28,400 |
| A with waitlist | 271 / 327 | 135 / 229 | $27,100 / $45,800 |
| B. Early rate holds: 0.5, no decay | 53 / 67 | 26 / 47 | $5,300 / $9,300 |
| B with waitlist | 110 / 131 | 55 / 92 | $11,000 / $18,300 |
| C. Early rate, then decay: 0.5 for a user's first 3 weeks, then 0.1 | 37 / 43 | 18 / 30 | $3,700 / $6,000 |
| C with waitlist | 87 / 97 | 43 / 68 | $8,700 / $13,500 |
| D. Checkpoint floor: 0.25 | 16 / 19 | 8 / 13 | $1,600 / $2,700 |
| D with waitlist | 45 / 51 | 23 / 36 | $4,500 / $7,100 |

Scenario A is the stated ask working every week for every user: 1–2 names a week at the 50% conversion seen so far. Scenario C is the most likely shape for a referral loop, because early names are the easiest ones.

Correction to a figure given during the interview: at 0.25 the loop was described as reaching "about 30 users by mid-January". That was simple compounding. With holiday weeks and trial drop-off included, it is 16–19.

## What closes the gap

One office-level deal changes the picture more than any referral rate. At the list price, 100 contributing users in one office is $20,000 a month before negotiation. The referral loop builds the proof that makes those deals possible; it is unlikely to reach the target alone.

# 5. Pricing, trial, and referral credit

## Trial (Decided)

- Every new user gets 2 free Cora runs.
- A payment card is collected when the user starts. The sign-up page states clearly that the user gets two free Cora curations and that the card is charged only on the third.
- No third run without payment. The third Monday is the gate.
- The rule applies to the current 5 users, with no exception for champions. They add a card when payment goes live.
- Payment starts for everyone as soon as the payment part of the v3 website is built.
- Asking for a card up front will lower the number of trials started and raise the share that pay. Both are measured from the first week (Estimate of direction only).

## The two prices (Decided, revised November 21)

One product, two ways of buying (table in section 2). Monthly is $200 and is presented as the clear pick. A single run is $200 and is ordered when wanted; nothing is charged automatically for it. Monthly costs the same as one run and brings a list every week, so per list it is about a quarter of the price. Every buyer gets the full product: Cora ideas, dashboard, Lego bricks, leaderboard, stats email. Users can switch between the two or cancel at any time from the dashboard.

No non-contributor plan is offered on the site or at sign-up. Everyone starts as a contributor.

HST and other applicable tax is charged from the first build.

## Contributor rule (Decided)

- Contributing means the user's Zack run arrives each week. A single run needs that week's Zack run.
- On the $200 monthly plan, one missed week per month is forgiven, with a note from Ehab.
- A second miss in the same month moves that month's price to $400. The extra $200 goes on the next invoice. The user is told at the first miss, at the second, and three days before that invoice.
- A miss caused by Roger never counts.
- A monthly user who switches sharing off in the dashboard pays $400 a month. This is not offered as a plan; it exists only as the effect of that switch. Such a user is matched from a private Zack run that never enters the pool, or from their sign-up profile when Zack is off.

## No refund (Decided)

The two free runs replace the refund. Cancellation stays one click, with no retention pitch.

## Group pricing (Decided)

Each office or brokerage deal starts from the listed base price and is negotiated from there. Nothing is published. A paying brokerage gets the same product billed to it: no admin features, no reporting, and no visibility into individual users' data or activity.

In the product this is a sponsor code. An admin creates the sponsor with its negotiated price and number of seats; people who sign up with the code skip the card step; the brokerage receives an invoice and nothing else.

## Referral credit (Decided, "a rule for now")

- A referrer earns a credit equal to the referred user's first payment at list price ($200 for a month, $200 for a run), in the referrer's own currency.
- The credit is earned when that first charge clears, not at sign-up.
- No cap. Unused credit carries forward.
- Champions pay like everyone else and earn their free months this way.

## From trial to first charge

Decided:

1. At sign-up the user enters a card and sees the terms: two free Cora curations, card charged only on the third.
2. At onboarding, every user is told the same thing again: two free runs, then the price.
3. Ehab follows up within two days of the second free run, and records the reason for every cancellation.
4. On monthly, the card is charged with the third run. A user who cancels before it is not charged and gets no third run.
5. On single runs, the card is charged only when the user orders a run.
6. Only a run actually delivered counts as a free run. A trial with no first run within 21 days of sign-up closes without a charge.
7. The user picks monthly or single runs when entering the card, with monthly selected. They can switch or cancel from the dashboard at any point.

Recommendation:

- The second Cora email restates the date and amount of the first charge. With no refunds, a reminder before the charge prevents disputes.
- Once there is enough data to show a conversion rate, Ehab's personal follow-up can narrow to users who go quiet.

# 6. The referral loop and the viral coefficient

## Definitions

These four numbers are tracked weekly. They replace every assumed rate in this document as soon as real data exists.

| Measure | Definition |
|---|---|
| Weekly referral rate (k) | New users onboarded this week who came by referral, divided by users active at the start of the week |
| Cycle time | Days from a name being given to that person's first Cora run |
| Generation | 1 = referred by a champion, 2 = referred by a generation-1 user, and so on. Rates are tracked per generation |
| Paid referral rate | Referred users whose first payment cleared, divided by paying users |

A loop grows fastest when k is high and cycle time is short. Halving cycle time is worth as much as doubling names.

## The weekly ask (Decided)

Ehab has every user, every week: run Zack, receive Cora, email their thoughts on the system, and refer 1–2 users. The first second-generation ask is Monday, November 23.

## Handoff (Decided)

When a user gives a name, Ehab or Peter contacts that person, brings them to a 1:1 or small-group onboarding call, and starts the onboarding cycle.

## Referral script (Decided as the working script)

In the referrer's voice, with the price in the message:

> I've been using Roger with my AI agents for a few weeks. Every Monday it sends me three ideas that are working for other real estate people, and I set them up in a few minutes. The first two weeks are free, then it's $200 a month for a list every Monday, or $200 for a single run, and you can cancel any time. They run a short group call to get you set up. Want me to connect you?

The price is included so the colleague is never surprised, the referrer's credibility is protected, and onboarding time is not spent on people who would not pay.

Recommendation: now that a card is collected at the start, add one clause so that is not a surprise either, for example "you add a card to start and it isn't charged until the third week".

## Levers Ehab works (Recommendation)

| Lever | What Ehab does | What it moves |
|---|---|---|
| Ask at the moment of value | Make the referral ask right after Monday's ideas land or when a user reports a win | Names per user |
| Ask for names, not "anyone" | Prompt by category: teammates, office colleagues, people they co-list with, former colleagues elsewhere | Names per user |
| Hand over the script | Send the script ready to forward | Conversion |
| Contact within 24 hours | Every new name hears from Ehab within a day | Cycle time, conversion |
| Group onboarding twice a week | Nobody waits more than a few days for a call | Cycle time |
| Guests at the group session | Each subscriber may bring one colleague | Names per user, conversion |
| Close the loop | Tell the referrer when their colleague joins and when the credit lands | Repeat referrals |
| Team leaders | Ask champions for an introduction to their team lead, for a team-wide session | Many users from one ask |
| Capture proof at conversion | When a user pays, ask for a Cora-specific quote and their OK to use it | Conversion for later prospects |

## Operating states of the referral engine (not a build order)

- **Manual:** Ehab asks, logs names, and tracks credits by hand. This is today.
- **Assisted:** each user has a personal referral link, credits post automatically, and Ehab works from an operations view.
- **Automatic:** the product makes the ask (for example after the Wednesday stats email) and Ehab handles exceptions.

## Tests in Ehab's first two weeks

- Channel: email, text, and phone, to learn which gets the fastest replies. Not yet known.
- Timing of the referral ask: Monday with the ideas, or later in the week.

## December 14 checkpoint (Decided)

After three weekly cycles, review k. If it is below 0.25 (one new user per four existing users each week), the referral loop alone will not carry the target, and Peter's hours shift toward office-level deals through the partner and brokerages.

# 7. Ehab's role

## Scope (Decided)

Ehab is an intern at 20 hours a week. He and Peter are both admins in the product, with the same access. He can do everything on his own: onboarding calls, product questions, and support. Until automation is built, he makes sure all Zack runs are done, all Cora curations are delivered, and all referral requests are completed. He writes and calls under his own name. Ehab and Peter work in 7-day cycles.

## The 7-day cycle (Decided order; days are a Recommendation)

Twenty hours is five half-days. The list is ranked. When hours run short, work is dropped from the bottom.

| Rank | Half-day | Work | Suggested day |
|---|---|---|---|
| 1 | Keep users running | Check that every user's Zack ran and Cora arrived; fix or chase any that did not; send the weekly follow-up | Monday |
| 2 | Referrals | Make the referral ask; contact every new name within 24 hours; book them into a group call | Monday–Tuesday |
| 3 | Group calls | Two group onboarding calls; the weekly group session with guests | Midweek |
| 4 | Convert trials | Follow up with every user whose second free run landed, before the first charge; log the reason for every cancellation | Within 2 days of the second run |
| 5 | Waitlist and scorecard | Contact waitlist members; update the weekly scorecard | End of week |

## Weekly scorecard

One page, reviewed by Ehab and Peter at the end of each cycle:

- Active users; Zack runs done out of expected; Cora runs delivered on time
- Cora ideas adopted out of ideas sent (north star, target 2 of 3)
- Names received; names contacted within 24 hours; users onboarded
- k, cycle time, and both by generation
- Trials started; first charges made; cancellations before the first charge, with reasons
- Billed this week and in the trailing 30 days; credits issued
- Guests at the group session

## Capacity limit (Estimate)

The manual cycle costs about 15–20 minutes per user per week.

| Active users | Hours a week on the manual cycle |
|---|---|
| 10 | 2.5–3.5 |
| 20 | 5–7 |
| 30 | 7.5–10 |
| 40 | 10–13.5 |
| 60 | 15–20 |

At 30–40 active users the manual cycle takes half or more of Ehab's week and pushes out onboarding and conversion. In scenarios B and C with the waitlist, that point arrives around the week of December 14. Past it, either the weekly cycle is automated (R1, R2, R6) or more hours are needed.

# 8. Sales and marketing

## Buyer

Unchanged. Plan as if the individual user is the buyer. Any brokerage subsidy is upside.

## Pipeline sources

| Source | Status | Basis |
|---|---|---|
| Referral loop | Working at small scale; measured weekly from November 23 | 3 users from about 6 pitches |
| Waitlist | About 100 people, general mix, already raised their hands | Moves to v3 with everyone else |
| Growth Partners AI | Partnership being built; one office at a time | They prepare real estate offices for AI, then Roger gets those users started. They can also start their own prospects on Roger to pave the way for their services. No volume is assumed until the first office has run. Their public site does not yet mention real estate. |
| Brokerages | One introduction in progress (Samantha Hewit, innovation director, reach of 1,500+ users) | One possible win among several, not a dependency |
| Talks and events | BUZZ, February 3–4, 2027, is the main one in the window | See v3 market research, carried in Appendix B |
| X and content | 0 users so far | 22 replies, 1 DM, as of November 19 |

## Bandwidth required (Estimate)

Peter has 60 hours a week for Roger (15 half-days). Ehab has 20 (5 half-days). People time is not the constraint; conversion and cycle time are.

| Work | Half-days a week | Who |
|---|---|---|
| User loop and referrals | 5 | Ehab |
| Office-level deals: brokerages and partner offices | 3, rising to 6 if the December 14 rule triggers | Peter |
| Onboarding overflow and waitlist conversations | 2 | Peter |
| Talks and content | 2 | Peter |
| Weekly review | 0.5 | Peter and Ehab |

## Messages

- Primary (approved in v3): "Roger makes your AI agents smarter every week, with ideas that worked for other real estate users."
- Short form (approved in v3): "Your AI agents, smarter every Monday."
- For people who already run AI agents, the site has its own page with its own headline: "Stop figuring out AI agents alone."
- Roger makes no income claims and no time-saved promises in its own voice. A named user's own words are their testimonial and may include time saved.
- The site may say "Works with every agent."
- No user counts are shown.

## Website

meetroger.ai must reflect v3.1 only: two free runs with a card collected at the start, then $200 a month or $200 a run with monthly as the clear pick (a list every week for the price of one run), no non-contributor plan, no refund, every agent platform, and the group session for subscribers. The Circles pitch and the 45-day guarantee come off. The homepage speaks to people in real estate; a second page speaks to people who already run AI agents.

## Testimonials and demo

- The four pilot users' quotes go on the site, each with its own on-off switch, attributed without the brokerage.
- Outcome still wanted: Cora-specific quotes from paying users. Ehab asks at the moment a user pays.
- Demo outcome (from v3): one or more real users in a 2–3 minute demo showing real Cora results, with no income claims by Roger. A user may describe time saved in their own words.

# 9. Customer service

## Outcomes (carried from v3)

1. About 80% of issues resolved without a human.
2. Human-handled issues get a reply within 1 business day and a fix within 3.
3. No user misses a Monday Cora run because of a Roger-side problem.

## Principles

- Easy leaving: one-click cancel, no retention pitch. No refund (changed).
- Ask why, lightly: one optional question on cancel.
- Close the loop: tell users when their feedback led to a change.
- Self-serve first, with a human always reachable.
- **Ehab is the human.** He follows up under his own name. "Roger support" is the sender of automated emails and the help inbox (changed).
- The week-2 check-in from v3 is now Ehab's follow-up after the second free run, which comes before the first charge (changed).

## Group session (Decided)

A weekly group session returns in v3, hosted by Ehab, where users hear what works for others. Sessions are scheduled once a user is a subscriber. Each subscriber may bring one guest colleague.

## Lapses

Until automation exists, Ehab confirms every week that each user's Zack ran. A missed week is an early churn signal and, on the monthly plan, counts toward the pricing rule in section 5.

# 10. Product requirements

R1–R13 are carried from v3 with the changes marked. R14–R22 are new. Each is an outcome; the Roger team chooses how to build it and a separate system chooses order and pace.

**R1. Automatic, verifiable Zack (changed).** Zack runs automatically on a weekly schedule, Sunday night, inside each user's agent setup, and sends his report to Roger under consent the user gives once at sign-up. Roger can verify it is installed and that it ran. A signed-in user can read every line of what their Zack does, change what he collects, and turn sharing off.

**R2. Data connection.** A direct connection from each user's agent setup to a Roger service (not email or forms). It records whether Zack ran, which Cora ideas were sent, and which were adopted. Zack results are held on the user's side until Roger confirms receipt.

**R3. Lapse detection (changed).** A monitoring bot watches usage and alerts Ehab and Peter when a user goes quiet or a run misses its deadline. Ehab follows up under his own name.

**R4. Accounts, login, and self-serve cancel.** One-click cancel, no guilt. Stripe for checkout and billing. No refund flow (changed).

**R5. Self-serve dashboard (changed).** Users can check that Zack ran, see their Cora ideas, switch between monthly and single runs, order a single run, update billing, see their contributor status and any forgiven miss, see their referral credit balance, and cancel. A delayed run appears only after it is resolved. No brokerage admin features.

**R6. Self-serve onboarding.** The product carries the whole onboarding cycle (a to g) so that calls with Ehab or Peter become optional. Until then, onboarding is a 1:1 or small-group call.

- **R6a. Screening.** A short quiz sorts incoming traffic by openness to AI tools. Half of even warm prospects drop out here.
- **R6b. Install.** An in-product checklist: go to the agent platform's site, download, open, upgrade to a paid plan of the user's choice, and name the Chief of Staff bot.
- **R6c. Agent-team setup.** The user goes to meetroger.ai/getstarted and follows the steps there, which host the use-cases text and the instruction to paste into their agent ("Create the bots from the information in this text file").
- **R6d. Daily habit.** A launch page says: "Okay, you are all set up. Your responsibility is to use your agent setup every day until you have saved at least 30 minutes that day." and asks the user to agree. The goal is motivational and not measured. Onboarding succeeds when it produces Zack runs and Cora curations.
- **R6e. Zack weekly.** Automatic, Sunday night; results flow into Roger through R2 and show in the dashboard.
- **R6f. Cora Monday.** Automatic, early Monday, gated by trial or payment status (R14). Ideas appear in the dashboard and by email until the user turns email off. Roger offers a ready-made prompt so the user's agent can pull the ideas in.
- **R6g. Lego bricks and levels.** Three bricks at launch and three more with every Cora run. A brick is a new bot or an upgrade to one. Users are not asked to turn ideas down: they send all three to their agent and adapt them. The dashboard shows a 26-week compounding graph with the user's current week marked. After week 26 the graph restarts with a new border colour for Level 2, up to Level 5. The colour is the whole reward.

**R7. Network learning.** Zack's and Cora's instructions improve as data arrives. A review bot proposes changes on a schedule and Peter approves them. Removing client names and private details before a play enters the pool is a function of this codebase.

**R8. Thin Roger bot.** One Roger connector inside the user's agent setup runs instructions that live in the meetroger.ai codebase, so improvements reach every user on the next run.

**R9. Contribution visibility.** One network-wide leaderboard. +1 point when Cora selects a user's play for another user, +1 more when that user is confirmed to have adopted it. Display names are chosen by the user; adoption details stay anonymous.

**R10. Built-in pipeline / CRM (changed).** Tracks every lead from first touch to active paying use, including who referred them, their generation, and each stage's date, so the measures in section 6 are produced without manual counting.

**R11. Referral invites.** Users can invite others from inside the product. Referrals count on the leaderboard.

**R12. Self-serve discovery (changed).** Quiz plus a short recorded demo leads to starting the free trial with a card on file (R14), with an optional call.

**R13. Weekly cycle.** Sunday night Zack; Monday morning Cora; Tuesday users implement; Wednesday stats email.

**R14. Free trial and gate (new).** A payment card is collected when the user starts, on a page that states clearly that they get two free Cora curations and that the card is charged only on the third. Every new user receives exactly 2 free Cora runs. The card is charged with the third run; a user who cancels first is not charged and gets no third run. The second Cora email restates the date and amount of the first charge.

**R15. Two prices and the contributor rule (new, revised).** Monthly is $200 and a single run is $200, in US dollars, with set Canadian prices of $280 and $280, plus tax. The system knows each week whether a user contributed a Zack run, applies one forgiven miss per month on the monthly plan, puts the extra $200 for a second miss on the next invoice after telling the user, and never counts a Roger-side miss. A single run is ordered by the user and needs that week's Zack run. No non-contributor plan is offered; a monthly user who switches sharing off pays $400.

**R16. Referral credit ledger (new).** Each user has a personal referral link. When a referred user's first charge clears, the referrer is credited that amount at list price, in the referrer's own currency. No cap; unused credit carries forward; the balance is visible in the dashboard and in emails.

**R17. Referral loop measures (new).** k, cycle time, generation, and paid referral rate are computed weekly and shown to the Roger team.

**R18. Operations view (new).** One screen for Ehab showing, per user: whether Zack ran, whether Cora was delivered, trial stage and gate date, names awaiting contact, and first charges coming up. This is what lets one person run the cycle by hand.

**R19. Group sessions (new).** Subscribers can see and join the weekly session and register one guest. Guests enter the CRM as referred leads attributed to the subscriber.

**R20. Every agent platform (new).** v3 serves every agent platform, listed or not. Zack files exist for Claude, Duet, Grok Bot, and Hark. For any other platform, the user starts from an existing file and has their own agent adapt it, as the "agent not listed" option on meetroger.ai/hampton does today.

**R21. Cora's pool (new).** Cora draws only from Zack runs, not from the public use-case library. The pool is cumulative, with the most recent runs considered first. All existing runs are seed data. Cora cross-references the pool with each user's needs and always sends the best 3 ideas available, ranked on suitability. There is one pool for all users, real estate or not. A user sees their three ideas only; Cora's scoring tiers and the full pool stay internal.

**R22. Feedback capture (new).** Each user's weekly thoughts on the system are stored against their record and available to the review bot in R7.

# 11. Technology

Carried from v3 unless noted.

- **Scope:** Roger's own systems only: the Roger connector, the meetroger.ai service and instructions, the dashboard, Stripe, Neon, and the monitoring and review bots. Integrations with users' email, CRM, and other tools belong to the agent platform.
- **Storage:** the existing Neon (Postgres) database. Privacy handled as any technology company would.
- **Architecture:** the desired end result is written down and Claude Code and AI agents design the architecture. Least-friction test: after one-time setup the user just uses their agent platform normally.
- **Payments:** Stripe, with tax charged. Payment status gates Cora. The trial, the two prices, the contributor rule, and referral credits (R14–R16) all sit on top of it.
- **Sign-in:** an emailed link or Google. No passwords.
- **Platforms (changed):** every agent platform, not Grok Bot only (R20).
- **Failure handling:** silent retries over a few hours with nothing shown to the user; if a Zack or Cora run misses its deadline (for example Monday 9 a.m.) the team is alerted first; the user is told only when they must act, in one plain line; Zack results stay on the user's side until Roger confirms receipt; on-time Cora delivery is tracked as an internal reliability measure; a delayed run shows on the dashboard only after it is resolved.
- **Team:** a Roger engineering team that grows as needed, building with Claude Code and AI agents.

# 12. Milestones

Business milestones, not a build sequence.

- First paying user.
- All 5 current users through the third-Monday gate, paying or recorded as a "no" with a reason.
- First second-generation referral onboarded.
- December 14 checkpoint on k.
- 30–40 active users (the limit of the manual cycle at 20 hours).
- First Growth Partners AI office run.
- First office-level deal.
- $10,000 billed in a month.
- **Committed: $30,000 billed in a month by BUZZ, February 3–4, 2027.**
- About $1 million a year (about 417 users at $200 a month; more with credits and single runs).

# 13. Top risks

1. **Nobody has paid.** Every assumption about price is untested. Payment waits for the v3 website's payment part; each week of delay removes one of 8 onboarding cycles. A hosted payment link would remove that dependency (Recommendation; not decided).
2. **The referral loop decays.** Early names are the easy ones. The model reaches the target only in the no-decay case.
3. **The target depends on office-level deals that do not exist yet.** One introduction is in progress and one partnership has not run its first office.
4. **The manual cycle saturates Ehab at 30–40 users,** possibly by mid-December.
5. **The holidays** take two of the 8 cycles.
6. **Proof is thin.** The four testimonials are cleared for use, but they describe the pilot's hand-run version and do not mention Cora by name.
7. **The $400 rule can surprise users.** A billing change after a missed week needs the advance notice in section 5 every time.
8. **General-mix users** receive ideas drawn mostly from real estate users until the pool diversifies.

# 14. Open questions

1. How "$30,000 billed in a month" is measured. This document assumes the 30 days ending February 4, 2027.
2. When the referral credit rule ("a rule for now") is reviewed.
3. Ehab's hours. The plan and its capacity math assume 20 a week; the deck was edited to say 10 to 20.

Settled since the first version of this document: currency (both, with the target in Canadian dollars), who attends group sessions (subscribers, with one guest each), and the message for people outside real estate (their own page and headline).

## Deliberately out of scope (per Peter)

Build order and build status; the trigger for Ehab going full time; what Ehab can decide alone; money terms with Growth Partners AI; the plan for attending BUZZ; how client details are scrubbed (part of the codebase).

# 15. Revisions after the design interview (November 21, 2026)

The design spec first differed from this document in ten places. Peter settled all ten the same day. Topics 1 and 2 keep this document's position in a simpler form; on topics 3 to 10 the spec's position was adopted, and this document was edited to match.

| # | Topic | Settled as |
|---|---|---|
| 1 | Single runs | Kept and simplified: two free runs, then $200 a month or $200 a run (the run was $100 until November 25, 2026), monthly as the clear pick. No non-contributor plan is offered. |
| 2 | Referral script | Kept: "$200 a month for a list every Monday, or $200 for a single run" (was "$200 a month or $100 a run" until November 25, 2026). |
| 3 | Time-saved claims | None in Roger's own voice. A named user's own words may include time saved. |
| 4 | Zack's sharing rule | Standing consent at sign-up, an automatic weekly send, and controls in the dashboard. |
| 5 | Users with sharing off | Matched from a private Zack run, or from their sign-up profile when Zack is off. |
| 6 | Currency | US and Canadian set prices. The $30,000 target is counted in Canadian dollars. |
| 7 | Sales tax | Charged from the first build. |
| 8 | The extra $200 after a second missed week | On the next invoice, with notices before it. |
| 9 | Office deals | Sponsor codes; the brokerage gets an invoice and nothing else. |
| 10 | Admin roles | Peter and Ehab, with equal access. |

Other decisions from the design interview that affect this document:

- A single run is ordered by the user; nothing is charged automatically for it.
- Only a delivered run counts as a free run, and a trial with no first run in 21 days closes without a charge.
- Users see three ideas each Monday and nothing of the wider pool.
- The homepage is for people in real estate; a second page is for people who already run AI agents.
- The sign-up quiz routes people and never blocks them.
- Sign-in is by emailed link or Google.
- All four pilot users agreed to their testimonials being used.

**Revision, November 25, 2026 (Peter, while setting up Stripe).** A single run now costs $200 (CA$280), up from $100 (CA$140). Monthly stays $200 (CA$280) and the higher monthly rate stays $400 (CA$560). The framing, in Peter's words: "Monthly brings you weekly lists so it is much cheaper than doing a one-time run." Every comparison between the two plans says so: monthly costs the same as one run and brings a list every Monday, about four a month, so per list it is roughly a quarter of the price. The referral credit for a run rises with it, to $200. Current-price references in this document were updated; decision 33 in Appendix A stays as history. Design spec version 1.3 carries the same change.

# Appendix A. Decision log, second interview (November 21, 2026)

1. Robyn and Grace pitched about 6 people to get 3 users.
2. The 3 referred users are asked for referrals on Monday, November 23, by Ehab.
3. Ehab has every user run Zack, run Cora, email their thoughts, and refer 1–2 users every week.
4. Ehab or Peter contacts each referred person and brings them to a 1:1 or small-group onboarding call.
5. Two Cora runs are free, then the user pays.
6. That rule applies to the current 5; payment starts for everyone once the v3 payment part is built.
7. Referral credit: one free month per paying referral, no cap, as a rule for now; later refined to equal the referred user's first payment.
8. Ehab can do everything on his own.
9. Ehab may go full time if things go well in December; the trigger is outside this document.
10. The 3 who declined were not open enough to AI tools.
11. Users pick their own agent-platform plan; that cost is not part of Roger's price.
12. One product, two ways of buying, after a free trial.
13. Trial to payment: stated at onboarding, prompted in the second Cora email, followed up by Ehab within two days, gated at the third Monday, no exceptions. (Refined by decision 38: the card is on file from the start and charged on the third run.)
14. Everyone, including the Circles waitlist, moves to v3. The waitlist is a general mix and part of the pipeline.
15. Testimonials exist (shared folder); see section 3.
16. The "three month period" in early emails is three months of growing user numbers, not a free period. All prospects and clients change with the product.
17. A weekly group session returns in v3, with one guest per user; sessions are scheduled once a user is a subscriber.
18. Ehab's outreach channel is not yet known and will be tested.
19. Cora draws only from Zack runs, cross-referenced with each user's needs.
20. The pool is cumulative, most recent first; all existing data is seed data.
21. No user has objected to sharing yet; some will.
22. Everything goes in the spec; other agents decide what to build and in what order.
23. The committed target is $30,000 actually billed.
24. Ehab and Peter work in 7-day cycles; the ranked list in section 7 is approved.
25. Peter has 60 hours a week for Roger.
26. Growth Partners AI partnership, one office at a time.
27. December 14 checkpoint at k below 0.25.
28. The referral script includes the price.
29. Ehab works under his own name.
30. Until automation, Ehab makes sure all Zack runs are done, all Cora curations are delivered, and all referral requests are completed.
31. v3 serves every agent platform, listed or not, using the "agent not listed" route.
32. North-star target: at least 2 of 3 ideas adopted per user per week, across all users.
33. Four prices: $100 / $200 single run and $200 / $400 a month, by contribution. (Superseded the same day: see section 15, topic 1.)
34. One forgiven miss per month; a second moves the month to $400 with notice; Roger-side misses never count.
35. No refund, because of the two free runs.
36. Office deals start from the listed base price and are negotiated.
37. Cora always sends the best 3 ideas available, ranked on suitability.
38. A payment card is collected when the user starts, with a clear statement that they get two free Cora curations and the card is charged only on the third.

# Appendix B. Entry points beyond the first brokerage (from v3 market research)

1. BUZZ Conference, February 3–4, 2027, Mississauga (https://thebuzzconference.com/events/buzz-conference-2027/).
2. Other offices of the same brand, through existing contacts.
3. AI Playbook for Agents (https://aiplaybookforagents.com/): possible partner, possible competitor.
4. Proptech Collective Toronto, January 26, 2027 (https://luma.com/o4opyixj).
5. BrokerBotics (https://brokerbotics.ai/): possible partner, possible competitor.
6. TRREB REALTOR QUEST, May 19–20, 2027 (https://realtorquest.trreb.ca/), just past the window.
7. Grok Bot for Realtors (https://www.skool.com/grokbotforrealtors/about), 41 members.
8. AIrealtors.ca (https://airealtors.ca/community/).
