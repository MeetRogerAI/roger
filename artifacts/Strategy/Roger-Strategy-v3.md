# Roger Strategy v3 (final, Nov 21 2026)

## Final strategy and build specification. Interview completed November 21, 2026.

This document is the product and technical specification of what to build for Roger v3. Recommendations and assumptions are labeled. Numbers are planning math, not forecasts. Last updated November 21, 2026 (America/Toronto).

# 1. Executive summary

## The bet

Cora the Curator is the product: real estate users benefit from Roger when they use Cora. Roger is the facilitator of information sharing across users. Zack collects, Roger aggregates, and Cora curates ideas back. The network is the moat: Zack and Cora improve as data comes in across all users (R7).

## Core message

Primary (approved): "Roger makes your AI agents smarter every week, with ideas that worked for other real estate users."  
Short form (approved): "Your AI agents, smarter every Monday."  
The message positions the network as the value and makes no income claims.

## Pricing

$100 for a single Cora run, and $200/month for weekly use. Both include everything in the product (Cora ideas, dashboard, network contribution, and stats). The difference is one run versus the weekly scheduled cycle.  
Plans are month-to-month. Users can switch products (single run and weekly) or cancel at any time from the dashboard, with a refund within 30 days. After a single run, Roger invites the user to upgrade to weekly (for example, in the Wednesday stats email).  
Group pricing for brokerages paying for multiple users is negotiated case by case and is not published. Brokerage-paid users get the same product, billed to the brokerage. There are no enterprise or admin features, no extra brokerage reporting, and no visibility into individual users' data or activity.

## Committed target

$30,000/month in revenue by BUZZ (February 3-4, 2027), which is 150 paying users at $200/month, from 0 today. That requires a pipeline of about 15 new paying users/week over about 10 weeks. At an assumed 30% conversion (a labeled planning assumption; the real rate will be measured once the built-in CRM in R10 is live), that means about 50 discovery conversations/week. Discovery is mostly self-serve. The strategy is to build a pipeline big enough to hit the numbers, not to rely on any single person or brokerage deal.

## North star and long-term math

North-star metric: Cora ideas adopted, meaning the number of Lego bricks users put down because of information Roger shared. This is the value delivered to users. Paying users remains a tracked business metric (needed for the Samantha pitch and the revenue goal). The BUZZ target for the north-star metric is still open. R2 must track Cora ideas adopted.  
Long-term planning math (not a forecast): about 417 paying users at $200/month is about $1 million/year.

# 2. Principles

## Outcomes and requirements, not execution or build order

This document lists outcomes and requirements (the what). The Roger team chooses execution (the how). A separate system decides what order to build in and how quickly. Nothing in this document is a suggested build sequence.

## Terminology

In this document, "agents" means Grok Bot / AI agents only. "Users" means the people who use Roger, for example real estate users such as Robyn, Grace, and Chris. When the profession itself is meant, this document says "real estate users" or "users (real estate agents)."

## Scope and role

Roger is the facilitator of information sharing across users: Zack collects, Roger aggregates, and Cora curates ideas back. That network learning is the moat (R7).  
This specification covers only Roger's own systems: the Roger bot connector, the meetroger.ai service and instructions, the dashboard, Stripe, Neon, and the monitoring and review bots.  
Integrations with users' email, CRM, and other tools are out of scope. Grok Bot, or the agent harness, handles those. Roger does not fit into each user's other tools.

# 3. Status

This is the final v3 strategy as of November 21, 2026. The interview is complete.  
History: v1 was a $10,000/month product for big companies. v2 is the current product on meetroger.ai. The old done-for-you offer ($2,000 founding offer / $10,000 setup) is removed from the site; the website reflects v3 only.

## Current users

Five Royal LePage Signature users are active. None are paying yet. Champions are Robyn and Grace, plus three users they referred. Among the participants: Chris Marinakos and Ken Finch. 100% have made it through the current onboarding cycle so far.  
Robyn and Grace responded positively when asked if they would pay $200/month. They want to see how much RLP Signature corporate would subsidize, and will likely not pay today because they are referring users to the network. They have had one week of Cora results and are very positive about the product.  
In week 1, all 9 Cora ideas across Grace, Robyn, and Chris were used. Users decide which ideas to implement.  
Grace did not run Zack one week because she was too busy. Zack should run automatically inside her Grok Bot setup; this cannot rely on the individual remembering to run it. See R1.  
Interview math (labeled): Robyn and Grace referred 3 users, or 1.5 referrals per champion. Getting from 5 users to 50, or to 150, cannot rely on that referral rate alone.

## Current onboarding cycle

Today Peter sets each user up manually. Setup takes 30 minutes. The working path to consistent use is:  
1. The user is open to tech.  
2. The user is willing to install Grok Bot.  
3. The user runs a team of agents to improve their real estate business.  
4. The user keeps working with Grok Bot daily until they save 30 minutes that day.  
5. The user runs Zack the Collector weekly and emails those results to Peter. (In the product, this becomes automatic Sunday-night Zack, with results flowing into Roger via R2; see R1, R6e, and R13.)  
6. On Monday, Cora the Curator gives 3 Grok Bot improvement ideas.  
7. Doing this weekly compounds the usefulness of their Grok Bot team.  
Peter believes these users will pay a fee to run Cora the Curator. The product must take over this cycle (R6) so manual setup is no longer the cap on volume.

# 4. Sales

## Buyer

Plan as if the individual user is the buyer. Any RLP corporate subsidy is upside, not the plan. Peter said he cannot count on RLP Corporate to be the buyer.  
This is one product sold to two audiences: real estate users, and heavy AI-agent users ("Circles"). If only one can be kept for the next 90 days, the focus is real estate users.

## Samantha Hewit

Samantha Hewit is the innovation director at RLP Signature and can get a message out to all 1,500+ real estate users there. LinkedIn: https\://www.linkedin.com/in/sam-hewit-93a19028/  
Robyn and Grace are making the introduction. A meeting is being worked on. Peter does not yet know what an innovation director at RLP Signature is measured on, or much else about Samantha beyond her role and reach.  
What helps a conversation with her: paying users, testimonials, and an expanding user network. Samantha is one possible big win among several pipeline sources, not a dependency.

## Group pricing

Group pricing is available for brokerages paying for multiple users, negotiated case by case, and not published. Brokerage-paid users get the same product, billed to the brokerage. There is no extra brokerage reporting, and there are no enterprise or admin features. A paying brokerage has no visibility into individual users' data or activity.

## Founding-user rate (recommendation, not yet decided)

Offer a founding-user rate before the Samantha meeting. One example discussed: $100/month for weekly Cora, locked in for 6 months, in exchange for a testimonial and one referral. Charge real money even if the rate is reduced, because unpaid positive feedback is weaker evidence than users actually paying. Ask all 5 current users and aim for at least 3 yeses before the meeting. If Robyn and Grace hold off waiting on corporate, paying users are what help the corporate conversation.

## Pipeline plan: about 50 discovery conversations/week

All channel numbers below are planning estimates (Satya, November 21, 2026). Discovery is mostly self-serve: the quiz plus a short recorded demo leads to sign-up, and live calls happen only on request (R12).  
Referral engine outcome: about 20 discovery conversations/week from a productized referral engine (R11). Example of how to deliver it (the Roger team chooses execution): a one-click invite after the Wednesday stats email, with referrals counted on the leaderboard (R9).  
Talks and workshops outcome: about 15 discovery conversations/week. Examples of how to deliver it (the Roger team chooses execution): a brokerage office meeting or lunch-and-learn, a live Cora demo, and a call to action into the self-serve discovery flow (R12) and built-in CRM (R10). BUZZ, February 3-4, 2027, is a big push.  
Brokerage partnerships outcome: about 10 discovery conversations/week on average. The Roger team chooses how to deliver this, including pitching several innovation leads in parallel (Samantha Hewit is one possible source among others) without depending on any one of them.  
X and content outcome: about 5 discovery conversations/week from content that shares real adopted-idea stories with the quiz link. Example of how to deliver it (the Roger team chooses execution): Lomax/Studs posts.  
Key risk: Peter's 30-minute manual setup does not scale, so self-serve onboarding (R6) must be live before this volume.

## Bandwidth required

This document states the bandwidth outcome needed; the Roger team decides how to deliver it. Discovery is mostly self-serve (R12), so live-discovery hours are not in the total.  
Satya estimates, all labeled as estimates: about 8-10 hours/week of people time, mostly talks and partnership outreach (for example, talks about 3-4 hours/week including travel and prep, and partnership outreach about 2-3 hours/week). Onboarding is 0 hours once self-serve (R6) is live, versus about 7.5 hours/week today at 15 new users times 30 minutes.

# 5. Marketing

## Approved messages

Primary: "Roger makes your AI agents smarter every week, with ideas that worked for other real estate users."  
Short form: "Your AI agents, smarter every Monday."  
These position the network as the value and make no income claims.

## Website

meetroger.ai fully switches to Cora at $100 for a single run and $200/month for weekly use. The old done-for-you offer is removed. Outcome: the website reflects v3 only. Pricing terms are in the Executive summary and in Sales.

## Demo outcome

Find one or more real users to appear in a 2-3 minute demo showing their real Cora results (no income or time-saved claims). The outcome is a self-serve demo that moves quiz takers to sign-up (R12). The Roger team chooses execution. Examples: a real user on camera walking through Monday Cora ideas, with screen-recording cutaways and a short intro/outro inviting viewers to the quiz; fallback, screen recording with voiceover.

## Referral script (current)

Summary of what Robyn and Grace say today: they have been working with Peter Kuperman on setting up AI agents for real estate. He sets everything up inside the user's own email and tools (this is done through Grok Bot / the agent harness, not by Roger integrating with those tools). Help includes drafting fast replies to new leads, staying in touch with past clients, and a morning summary of what needs attention that day. The user stays in control and approves everything before it goes out. The current offer is a free 2-week white-glove setup for RLP Signature users: Peter does the setup and walks the user through it, so there is no tech homework.  
Gap: this referral does not mention Cora, or the paid step after the free setup. Whether the script should introduce those is still open.

## X outreach to date

Figures below are from Andy's work, as of Andy's last update on November 19, 2026.  
22 replies went to 21 people. Of the 15 who had had time to answer, 3 did. Kapone replied later that morning. 1 confirmed DM (Tyson). 0 Zack runs and 0 customers from this channel. Short-question replies (November 15): 12 sent, 2 answered, mostly on posts about 25 days old. The Circle pitch ("\~15 people with setups like yours"), followed by "would you want it?", did best. Tyson's DM came from that sequence, and Kapone showed interest. 24 drafts from November 16 never went out. Warm replies from @rhanley and @LeeMatt17631 were still waiting.  
What hurt results: stale targets, inconsistent cadence, and unsent drafts. The RLP pilot runs separately, by email and referral. All 5 current users came from that path. X has not brought in a paying user yet.

## Entry points beyond Signature

Ranked from market research done during the interview. Referrals at Signature and the Samantha meeting remain an important path. Events can fill a pipeline, but the 30-minute manual setup still caps volume until R6 is live.  
1. BUZZ Conference, February 3-4, 2027, Mississauga (https\://thebuzzconference.com/events/buzz-conference-2027/). Chris and Jeff Slightham from RLP Signature are speaking, along with RLP Canada leaders and owners from Harvey Kalles, Right at Home, RE/MAX Hallmark, and eXp. A possible way to get into other offices' team meetings.  
2. Other RLP offices, via Signature contacts and RLP Canada leadership. Royal LePage events: the next national sales conference is September 2027 (https\://www.royallepageevents.ca/events/nationalsalesconference). Signature contacts are the faster route into other RLP offices.  
3. AI Playbook for Agents (https\://aiplaybookforagents.com/), run by John Carle in Alberta, teaching users Grok Bot setups in small cohorts. A possible partner, and also a possible competitor.  
4. Proptech Collective Toronto, January 26, 2027 (https\://luma.com/o4opyixj). Free and easy to get into. The crowd is more founders than real estate users.  
5. BrokerBotics (https\://brokerbotics.ai/), run by GTA broker David Ursino, who says his systems run in a live 300-user brokerage. A possible partner, and also a possible competitor.  
6. TRREB REALTOR QUEST, May 19-20, 2027 (https\://realtorquest.trreb.ca/). Just past the 90-day window. TRREB said the 2026 show drew over 12,000 attendees.  
7. Grok Bot for Realtors (https\://www.skool.com/grokbotforrealtors/about), a paid online community with 41 members. US-based, but members already use Grok Bot.  
8. AIrealtors.ca (https\://airealtors.ca/community/), a Canadian online community. Size is not published.

# 6. Customer service

The key customer-service job is keeping every user running Zack each week, because Cora has nothing to work with until Zack runs. A missed Zack week is an early churn signal. Users decide which Cora ideas to implement.

## Outcomes

Confirmed by Peter, November 21, 2026:  
1. About 80% of issues resolved without a human, by the Roger bot or a support agent inside Grok Bot (target estimate).  
2. Human-handled issues get a reply within 1 business day and a fix within 3.  
3. Zero users miss a Monday Cora run because of a Roger-side problem.  
All of these are tracked in the built-in CRM (R10).

## Principles

Confirmed by Peter, November 21, 2026, stated as outcomes:  
a. Easy leaving: one-click cancel, no guilt (R4). If a user wants to cancel, let them go. There is no retention pitch.  
b. Ask why, lightly: one optional question on cancel, plus an early check-in around week 2.  
c. Close the loop: tell users when their feedback led to a change.  
d. Measure a few things: response time, time to fix, cancel reasons, and on-time run rate, in the built-in CRM (R10).  
e. Self-serve first, with a human always reachable. Users self-serve everything through the dashboard (R5). Users contact a general "Roger support" channel (not a named individual), staffed by someone on the Roger team.  
Not included as separate principles: "fix before they notice" and "respond fast" (already covered elsewhere).

## Week-2 check-in

Confirmed by Peter, November 21, 2026. An automated, personal-feeling plain-text email from "Roger support", triggered after the user's second Cora run, asking one easy question ("How are your Cora ideas working so far?"). A help-offer variant is triggered for users gone quiet (no Zack run or no ideas adopted). Replies are logged in the built-in CRM (R10) and answered within 1 business day.

## Lapses

Today, Peter would not know if a user stopped using Grok Bot for a week. If a user goes quiet, Peter wants to send the nudge himself, with a dedicated monitoring bot on his side handling detection exclusively. See R3 and Failure handling.

# 7. Product requirements

There are 13 top-level requirements (R1-R13). R6 has seven sub-requirements (R6a-g). This is the build spec: each item is an outcome or requirement specific enough to build from. A separate system decides order and speed.

## Weekly cycle (overview)

The weekly cycle is specified in R13 and is referenced throughout. Sunday night, Zack runs automatically. Monday early morning, Cora delivers the 3 ideas. Tuesday, users implement on their own time. Wednesday, the separate stats email goes out (Lego level, contribution points, and leaderboard rank).

## R1. Automatic, verifiable Zack

Zack runs automatically on a weekly schedule, Sunday night, inside each user's Grok Bot setup. Peter can verify that it is installed and that it ran, through the R2 data connection. Results are not emailed to Peter. See R6e, R13, and Failure handling.

## R2. Data connection

A direct data connection from each user's Grok Bot to a Roger service (not email or web forms). It records whether Zack ran, which Cora ideas were sent, which ideas were implemented (Cora ideas adopted: Lego bricks put down because of information Roger shared, the north-star metric), and other usage insights, including paying-user status as a business metric, visible to Peter and on the user's dashboard (R5). Zack results are saved on the user's side until Roger confirms it received them. See Integration and Failure handling.

## R3. Lapse detection

A dedicated bot on Peter's side monitors usage exclusively and alerts Peter if a user stops using Grok Bot for a week, or if a weekly Zack run or a Monday Cora run misses its deadline (for example, Monday 9 a.m.). Peter sends any nudge to the user personally. The user is told only when they must act. See Failure handling.

## R4. Accounts, login, and self-serve cancel

Users have Roger accounts and can log in. A web interface on meetroger.ai and the Roger dashboard lets a logged-in user self-serve cancel easily (one-click, no guilt). Checkout and billing use Stripe on those same surfaces. See Payments and R5.

## R5. Self-serve dashboard

A self-serve Roger dashboard for logged-in users: check that Zack ran, see their Cora ideas, change their plan, update billing, switch products (single run and weekly), and cancel at any time. This builds on R4.  
There are no enterprise or admin features: a paying brokerage gets the same product billed to them, with no visibility into individual users' data or activity.  
A missed or delayed run appears on the user's dashboard only after it is resolved, as a short note such as "Monday's Cora was delayed 2 hours, now delivered" (confirmed by Peter, November 20, 2026).  
The dashboard also shows how much the user has contributed to the network, including the single network-wide contribution leaderboard (R9). Each user chooses the display name that appears on the leaderboard. Idea-adoption details stay anonymous (counts only, never the names of other users). Contribution points do not affect Lego levels (R6g). See Failure handling and R9.

## R6. Self-serve onboarding

The whole onboarding cycle (a to g) is handled by the product as much as possible, minimizing Peter's manual involvement. This removes the 30-minute manual setup cap.

### R6a. Screening

A short quiz categorizes incoming traffic by openness to tech.

### R6b. Install

Users self-install Grok Bot via an in-product checklist: go to the Grok Bot website, download, open, upgrade to paid, and name their Chief of Staff bot.

### R6c. Agent-team setup

After Grok Bot asks "What's the first task I can help you with", the user pastes the Real Estate Use Cases text file with the instruction "Create the bots from the information in this text file". Simplest version: the user goes to meetroger.ai/getstarted and follows the instructions there, which host the steps and the text to paste.

### R6d. Daily habit

Today this is handled in a 1:1 onboarding call where Peter sets the goal. In the product, a launch page says: "Okay, you are all set up. Your responsibility is to use your agent setup every day until you have saved at least 30 minutes that day." and asks the user to agree this is a good goal (buy-in). The 30-minute goal is motivational, not measured. The onboarding success metric is that the user completes successful Zack runs and receives Cora curations (tracked via R2).

### R6e. Zack weekly

Zack runs automatically Sunday night (R1, R13). Results are no longer emailed to Peter; they flow straight into Roger via the data connection (R2) and appear in the user's portal/dashboard (R5).

### R6f. Cora Monday

Cora runs automatically early Monday morning, gated by the user's payment status. Weekly subscribers get the scheduled Monday run. A single-run purchase entitles the user to one Cora delivery of the full product. Ideas appear in the dashboard (R5) and are emailed by default until the user turns email off. Optionally, Roger provides a ready-made prompt users can paste into Grok Bot so their Chief of Staff pulls the ideas in. See Weekly cycle (R13).

### R6g. Compounding (Lego bricks and levels)

At launch the user has 3 bricks (bots/capabilities). Every Cora run adds 3 more bricks, so the structure grows and compounds over time. The dashboard shows a 26-week exponential compounding graph (blue line) with a larger red dot marking the user's current week, to make compounding visibly core to the product.  
A brick can be a new bot or an upgrade to an existing bot. There is no "turn down" option: Roger suggests the user send the full set of 3 ideas to their AI agent system (Grok Bot) and ask questions about implementing them, so each user adapts the Curator results and gets improvements from all 3 ideas after edits.  
Levels: after week 26 the compounding graph starts again with a different color border to show Level 2, then Level 3, up to Level 5 (5 x 26 weeks, about 2.5 years). The new border color is the whole reward for leveling up (no unlocks, price changes, or badges). Lego levels are only about how deeply a user builds their own agent system. Contribution points (R9) do not affect levels; they feed a separate contribution leaderboard. See R9.

## R7. Network learning

Zack and Cora improve as data comes in across all users. The Roger team continually improves Zack's instruction set and how it collects data; Cora the Curator's algorithm and instruction set likewise improve over time (best adapted ideas can inform suggestions to others). This is Roger's compounding moat.  
A dedicated review bot on Peter's side reviews network data on a schedule and proposes improvements to Zack's and Cora's instruction sets (Peter approves changes). Approved improvements ship in the meetroger.ai codebase, so every user's Roger bot gets them automatically on the next run, with no re-pasting.

## R8. Thin Roger bot

A single Roger bot inside the user's Grok Bot wraps Zack and Cora. After one-time setup, the user just uses Grok Bot normally. The Roger bot is a thin connector: it connects to meetroger.ai and runs instructions that live in the meetroger.ai codebase. Improvements ship centrally and reach every user automatically on the next run, with no re-pasting.

## R9. Network contribution visibility

Users see how much they have contributed to the network on their dashboard, and contribution points feed a contribution leaderboard. This is part of gamification to encourage users to come up with, use, and share better use cases and playbooks, and it complements R6g (Lego bricks and levels).  
A use case a user delivers to the network counts zero on its own. Scoring: \+1 point when Cora selects it as one of the 3 weekly ideas shared with a different user; \+1 extra point if the receiving user is confirmed to have adopted it, detected via Zack data and R2 ideas-used tracking. This rewards quality, not volume.  
There is one network-wide contribution leaderboard (no per-brokerage boards). Leaderboards can show names; each user chooses the display name that appears on the leaderboard. Idea-adoption details stay anonymous: users see counts (for example, "2 users adopted your idea"), never the names of the other users.  
Lego levels (R6g) are only about how deeply a user builds their own agent system; contribution points do not affect levels. A weekly stats email, separate from the Monday Cora ideas email, goes out on Wednesday with the user's Lego level, contribution points, and leaderboard rank. See R5, R6g, and R13.

## R10. Built-in pipeline / CRM

A pipeline/CRM system built into Roger (not off-the-shelf), stored in Neon, that tracks leads from first touch through quiz (R6a), discovery, sign-up, Stripe payment, the dashboard, and active use, so real conversion rates can be measured.  
Conversions so far are 5 people talked to and 5 converted (warm referrals). Peter says this is not a meaningful metric yet because there has been no full pipeline/CRM. The 30% conversion rate used in the BUZZ pipeline math remains a labeled planning assumption until R10 is live.

## R11. Referral invites

A productized referral engine built into Roger. Outcome: users can invite others, and referrals are counted on the contribution leaderboard (R9). Example of how to deliver it (the Roger team chooses execution): a one-click invite after the Wednesday stats email (R13). See Pipeline plan.

## R12. Self-serve discovery flow

Discovery is mostly self-serve. Required outcome: a quiz (R6a) plus a short recorded demo leads to Stripe sign-up, with an optional book-a-call. Live discovery calls happen only on request. See R6a and R10.  
Demo outcome: find one or more real users to appear in a 2-3 minute demo showing their real Cora results (no income or time-saved claims); the outcome is a self-serve demo that moves quiz takers to sign-up. The Roger team chooses execution.

## R13. Weekly cycle

Zack runs automatically Sunday night; then on Monday early morning, Cora delivers the 3 ideas; on Tuesday, users implement on their own time; on Wednesday, the separate stats email goes out (Lego level, contribution points, and leaderboard rank). See R1, R6f, and R9.

# 8. Technology

Current state: Zack and Cora are plain text prompts each user copies into their own AI agent setup (Grok Bot). There is no central system, data connection, accounts, or automation yet. R1-R13 require building these.

## Team

Roger has an engineering team that will grow and expand as needed (Peter, November 20, 2026). The team builds with Claude Code and AI agents.

## Scope of Roger's systems

This specification covers only Roger's own systems: the thin Roger bot connector, the meetroger.ai service and instructions, the dashboard, Stripe, Neon, and the monitoring and review bots. Integrations with users' email, CRM, and other tools are out of scope and are handled by Grok Bot / the agent harness.

## Data storage and privacy

Start with the existing Neon (Postgres) database. Privacy is handled like any other tech company (standard privacy policy and practices).

## Integration

Each user's Grok Bot connects directly to a Roger service (not email or web forms). Roger does not integrate with the user's other tools.

## Architecture approach

The desired end result is written down (least friction for customers), and Claude Code and AI agents design the architecture.

## Payments

Checkout and billing use Stripe, on meetroger.ai and the Roger dashboard. Stripe payment status gates whether the Roger bot is active and whether Cora runs: weekly Monday runs for active weekly subscribers, and one Cora delivery for a single-run purchase (ties to R4 cancel, R5 billing, and R6f).

## Least-friction test

Peter: "The least friction for a user is that they set up in Grok Bot and after that everything is connected so they just have to use Grok Bot normally with a single Roger bot that gets them all the benefits of the service that uses Zack and Cora." This is the test the architecture should meet. See R8.

## Instruction delivery

Peter: "The agent should connect with meetroger.ai to run instructions that live in the meetroger.ai codebase." The user's Roger bot (an AI agent) connects to meetroger.ai and runs those centrally hosted instructions. Zack and Cora improvements ship in the meetroger.ai codebase, and every user gets them automatically on the next run, with no re-pasting. The Roger bot is a thin connector. See R7 and R8.

## Failure handling

Confirmed by Peter, November 20, 2026:  
1. Silent retries over a few hours, with nothing shown to the user.  
2. If a weekly Zack run or a Monday Cora run misses its deadline (for example, Monday 9 a.m.), the R3 monitoring bot alerts Peter first.  
3. The user is told only when they must act (for example, reconnect an account), in one plain line.  
4. No data loss: Zack results are saved on the user's side until Roger confirms it received them.  
5. Track an internal reliability metric (Cora runs delivered on time) as evidence for pitches such as the Samantha conversation.  
6. A missed or delayed run appears on the user's dashboard only after it is resolved, as a short note such as "Monday's Cora was delayed 2 hours, now delivered." See R5.  
See R3.

# 9. Milestones

These are business milestones, not a build sequence and not forecasts. When meetings come (for example, Samantha Hewit), show what exists.  
• First paying user.  
• 3 or more of the 5 current users paying before the Samantha meeting.  
• The Samantha meeting.  
• 50 paying users at $200/month, or $10,000/month.  
• Committed BUZZ target (Peter, November 21, 2026): $30,000/month revenue by BUZZ (February 3-4, 2027), which is 150 paying users at $200/month, from 0 today.  
• About 417 paying users at $200/month, or about $1 million/year.  
Pipeline required for the committed BUZZ target: about 15 new paying users/week over about 10 weeks, and about 50 discovery conversations/week at an assumed 30% conversion (a labeled planning assumption, to be replaced by the real rate once R10 is live). Conversions so far are 5 of 5 warm referrals, which Peter says is not a meaningful metric yet. The strategy is to build a pipeline big enough to hit the numbers, not to rely on any single person or brokerage deal.

# 10. Satya's recommendation and top risks

1. The $30,000/month committed target is 150 paying users from 0 in about 10 weeks, or about 15 new paying users/week. Build the pipeline immediately. Do not rely on any single brokerage deal.  
2. Self-serve onboarding (R6) and Stripe must be live before volume, or Peter's 30-minute manual setup becomes the bottleneck. Satya's note: these are needed by early December to convert the pipeline (an estimate of timing, not a date Peter set).  
3. Convert the existing 5 users to paying first, as proof and testimonials. A founding-user rate is a recommendation, not yet decided (see Open questions).  
4. R1 and R2 (automatic, verifiable Zack, plus the data connection) underpin the north star, the leaderboard, and the customer-service outcomes. Without them, Cora ideas adopted cannot be measured and lapses cannot be detected reliably.  
5. Make no income claims in marketing. The approved messages already follow this rule, and the demo outcome forbids income or time-saved claims.  
All estimates in this document are labeled as estimates or planning assumptions.

# 11. Open questions

Only questions that are still genuinely open:  
1. The BUZZ target for the north-star metric (Cora ideas adopted) is still open. The committed BUZZ revenue target is $30,000/month (150 paying users at $200/month).  
2. Whether to offer a founding-user rate, at what price, and whether all 5 current users will be asked before the Samantha meeting. One example discussed: $100/month for weekly Cora, locked in for 6 months, in exchange for a testimonial and one referral.  
3. Whether the referral script should introduce Cora and the paid step after the free setup.  
