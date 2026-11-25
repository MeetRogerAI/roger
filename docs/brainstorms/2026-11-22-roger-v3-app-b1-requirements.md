---
date: 2026-11-22
topic: roger-v3-app-b1
scope: deep
status: active
---

# Roger v3 app, version B1: the paid weekly cycle

Source spec: `artifacts/Roger v3 - design spec.md` (version 1.1, November 21, 2026). Live checklist: `artifacts/launch-list.html`.

## Problem frame

Roger v3 turns meetroger.ai into a product a person can sign up for, pay for, and use every week without talking to anyone. The spec splits the work between two builders. Someone else is building the marketing site (Part A) in parallel. This document covers the app (Part B), and only its first version, B1.

Nothing in the app exists today. Checked against the repo on 2026-11-22: there are no `/start`, `/signin`, `/auth`, `/getstarted` or `/app` routes under `src/app/`, no `content/` folder, no Stripe dependency in `package.json`, and `db/schema.sql` holds only the nine pre-v3 tables. The admin is still behind one shared password.

The spec already defines B1's behaviour in detail. This document does not restate it. It records what is in scope, the decisions made on top of the spec, what the app builder owes the marketing builder, and how success is judged. Where this document is silent, the spec applies.

## Requirements

**Scope and source of truth**

- R1. Build everything the spec marks B1 in Part B, sections B.1 to B.14, including the shared context in Part 0 that the app depends on (settings in 0.9, the idea card and data palette in 0.7, vocabulary in 0.4 and 0.8).
- R2. Build full B1. None of the five optional cuts listed in spec B.17 is taken: Google sign-in, the automatic second-miss invoice line, the model fallback for reports without a `roger-run` block, run deletion by the user, and the sample idea chooser and interest page all stay in.
- R3. Every rule in spec B.1 holds on every screen and email: least friction, knowing consent, no surprise charges, no person in the weekly loop, numbers computed in code, and each automatic email sent at most once per trigger.
- R4. Existing behaviour is preserved: the unlisted pages (`/rlpsignature`, `/rlp`, `/hampton`, `/founders`, `/for/[slug]`), the library, watches, the existing admin tabs, and the existing cron jobs work as before.

**Working alongside the marketing builder**

- R5. Stay inside the app builder's paths in spec 0.6. Changes to the three shared files (`src/app/globals.css`, `src/data/config.ts`, `src/app/layout.tsx`) go in as small, separate pull requests.
- R6. Deliver the pieces the marketing site depends on before the rest of B1, so the other builder is not blocked. A piece counts as delivered when it is merged to `main` and deployed. In this order:
  - the tables the public site reads or writes: `testimonials` (seeded per spec B.12), `free_runs`, `setup_files`, `pool_plays` (the public site reads the one sample row only), and the `v3.*` settings with their defaults
  - the one helper that tells the header whether a visitor is signed in. The header shows the signed-out state first and never waits on the check. Its exact shape depends on the sign-in approach, so that is the first planning decision.
  - `/start` accepting `path`, `cur`, `ref`, `zack` and `utm` in the query string
  - the way the public site finds the chosen sample play, returning nothing until one is chosen, plus one made-up sample play loaded only on preview and local databases, so the sample sections can be built before a real pool exists
  - the data palette tokens, then the idea card (R7)
- R7. The idea card is one component used in three places (the Monday view, the email in simplified form, and the public sample). The app builder builds it, including the pull-out sheet, as part of the early pieces in R6, and the marketing site reuses it for the sample. This ownership is this document's reading of the spec and should be confirmed with the marketing builder (see Dependencies).
- R8. `/getstarted` is public and belongs to the app builder. It must look and read as part of the public site, since it is in the marketing sitemap and is sent to people by referrers.

**Who can use it at first**

- R9. `/start` works on production for anyone who has the link, from the day B1 ships. It does not wait for the new marketing pages, but the privacy and terms pages, draft or final, must be live and linked from `/start` on that day. Nothing on the current Circles pages links to `/start`; the app builder does not add links there.
- R10. `v3.signupOpen` is the off switch. With it off, `/start` shows a short, honest "not open yet" note and offers to take an email; existing accounts keep working. On production it stays off until the things sign-up cannot work without are in place: Zack 2.0 and Cora 2.0 approved (S1, S2), live Stripe keys and prices (S13), the seed runs imported (S14), and the privacy and terms pages linked from `/start`. An admin turns it on. A second switch, `v3.cycleLive`, controls whether the Cora, charge and send jobs act on production. It is off until go-live, so nothing is charged or sent early and nobody's 21-day clock starts; once on it stays on, so closing sign-up later never stops lists for paying users.
- R11. The five pilot users join through admin-created accounts and a link that opens at the plan step (spec B.4), so they add a card and start their two free lists like everyone else.
- R12. Production takes real cards and makes real charges from the day B1 ships. Tax registration is already in Stripe (launch list S4, confirmed by Peter on 2026-11-22), so nothing holds back the first charge: a user is charged with their third delivered list, as the spec says. Test keys are used only on preview and local builds, and the app makes it obvious to an admin which mode it is in. Preview and local builds use their own database, never production's, so test customers and made-up runs cannot reach real users, Cora or the Monday jobs.

**When the pool is small**

- R13. If Cora finds one or two eligible plays for a user, she sends those, and the email and the `/app` view say so in one plain line ("Only two new ideas fit you this week."). This replaces "Cora always sends the best three available" in spec B.7 (pick rule 4) for this case only. An eligible play is one that passes the leave-out rules in spec B.7 (pick rule 1), whatever its Fit.
- R14. A list of one or two ideas is still a delivered list: it uses a free list in the trial, it triggers the third-list charge, and a one-at-a-time order for that Monday is charged at the full list price.
- R15. If a user has no eligible plays, no list is sent, nothing is charged, no free list is used, a one-at-a-time order is not charged and does not carry over, and both admins are alerted. The user gets a short note saying there is no list this week. For a trial or one-at-a-time user it adds that they were not charged. For a paying monthly user it does not say that, because their monthly charge is unchanged; it says the list is missing because of Roger, not them, and the week never counts as a missed week. If the week was a trial user's announced first-charge Monday, the note gives the new earliest date. (The note is a default chosen here.)
- R16. The operations screen shows, for each user, how many eligible plays remain for them, and "Needs attention" includes any user with fewer than three. The count comes from the same rules Cora uses to pick, not a second copy of them. This gives admins warning before a short Monday happens. All 13 pilot runs are already in the pool at launch (R23), so the warning cannot be answered by importing more of them; new plays come only from users' weekly runs and from any further runs Peter collects.
- R17. Cora's other rules are unchanged: never a play the user already runs, never one from their own contributions, never an idea sent before.

**Content the build needs**

- R18. Draft Zack version 2.0 for Claude, Duet, Grok Bot and Hark, and the connector text for each, from the 1.9 files in `artifacts/Zack/` and the seven changes in spec B.5. Peter approves them before any real user connects. The public 1.9 files in `public/zack/` are not touched.
- R19. Draft Cora version 2.0 from `artifacts/Archives/Circles/Cora The Curator v1.1.md` and the nine changes in spec B.7, amended for R13 to R15. Peter approves it before the first real Cora run.
- R20. Seed the starter setup file as version 1, unpublished, with the two edits in spec B.11. The startup page shows no setup block until Peter publishes a version. The source file, `Real estate Grok Bot Setup.md`, is not in the repo (checked 2026-11-22); Peter supplies it.

**The launch list**

- R21. Follow the rules at the top of `artifacts/launch-list.html`. Build each unconfirmed default as written. Where a supply item has a fallback, build with the fallback (hide the Google button while its keys are missing; use the default category list; seed testimonials with "Real estate, Toronto"). Never invent content for an item without one.
- R22. When Peter supplies an item or confirms or changes a default, update the launch list, and for a change, the spec and the code, in the same change.

**Seeding the pool**

- R23. The pool is seeded from the existing pilot Zack runs before the first real Cora run. The 13 files are in `artifacts/Zack Runs/` (launch list S14; added by Peter on 2026-11-22, dated November 12 to 15). They come from nine people: three people have more than one run for the same week, from different agents (seven of the 13 files). They are imported with the seed tool (spec B.7), and the contributor's name in each file name is never shown or carried into the pool. The runs are Zack 1.8 and 1.9 and none has a `roger-run` block, so they depend on the model fallback kept in R2 and go through the same privacy check as any run. A pattern scan found no email addresses, phone numbers or links in them, and Peter confirmed on 2026-11-22 that they are cleared to sit in the public repo.
- R25. Each of the nine seed contributors gets one hidden contributor record, and all of that person's seed runs sit under it, whichever agent they came from. An admin links a contributor record to the person's real account when they join. The link is used for two things only: Cora leaves a user's own seed plays out of their lists (R17), and evidence and "run by N users" count distinct people, so one person's runs from three agents count once. It is never shown, never used to say who a play came from, and is removed with the account. This refines "never attributed to a real account" in spec B.7: never shown as theirs, but known to Cora for leaving out. Decided by Peter on 2026-11-22. The count in R16 is worked out after this leave-out.

**Testing over time**

- R24. Every job and date rule takes the current time from one place. On preview and local builds an admin can run the Cora, charge, send and housekeeping jobs as of a chosen date. Stripe's test clock moves only Stripe's side; the trial count, the third-list charge, the 21-day close, the first-charge retries, missed weeks and the timed emails are driven by the app's own clock, so they cannot be proven in less than real weeks without this.

## Success criteria

- All 41 acceptance checks in spec B.18 pass, with check 12 read in light of R13 to R15 (up to three picks, not exactly three, when the pool is short).
- One complete cycle runs end to end with nobody in the loop: runs arrive on Sunday, Cora picks overnight, the charge job and the send job run on Monday, and each eligible user gets one email and the same ideas on `/app`.
- The money path is proven with Stripe's test clock and the app's own clock (R24) across at least: a trial through to the third-list charge, a failed first charge through to recovery and through to close, a 21-day close, a first and second missed week, a one-at-a-time order with and without a run, a short list and a week with no eligible plays (R13 to R15) for a trial, a monthly and a one-at-a-time user, a plan switch in each direction, and a cancel. A Canadian and a US user each see and are charged their own set price, with tax as its own line wherever Roger is registered to collect it.
- The 13 seed runs import into a pool large enough to give each pilot user three ideas, and no pilot account is picked a play that came from its own seed file.
- The marketing builder can build and test every Part A page that touches app data without waiting for anything beyond R6 and R7.
- `npm run build` and `npm run lint` pass.

## Scope boundaries

- Not the marketing site. Nothing in Part A is built here, and none of the marketing builder's paths in spec 0.6 are edited, including `/zack`, `/privacy`, `/terms`, the header and the footer.
- Not B2: referral links and credit, the Wednesday stats email, the compounding graph and levels, the leaderboard, the group session, and sponsors. B1 leaves the B2 columns the spec already lists in place and builds nothing on them.
- Not B3: loop measures, the pipeline view, the review bot, and feedback capture.
- No change to the public Zack 1.9 files or the free Zack tool's behaviour. The app only creates the `free_runs` table and claims a report when `zack` is passed to `/start`.
- No `v3Mode` switch work. That flag and what it controls belong to the marketing builder.

## Key decisions

- **B1 only.** B2 and B3 get their own brainstorm once B1 has run real weeks, because B3 needs data that will not exist yet and B2 is about a third more work before anything ships.
- **Anyone with the link, from day one.** Ehab and referrers can send people in before the marketing site is done. The cost is that the draft privacy and terms pages must be reachable from sign-up first (see Dependencies).
- **Real charges from the first third list.** Tax registration is done, so production is live in Stripe from day one and the first revenue arrives with the first user's third Cora list. The earlier plan to hold production on test keys is dropped.
- **Short lists are sent and counted.** With five pilot users and seed runs, some users will run out of eligible plays. Sending one or two honestly is better than an empty Monday or a repeat. The consequence to keep in view: a one-at-a-time user can pay the full list price for fewer than three ideas, a short list can be the one that triggers a first charge, and a monthly user with nothing eligible has a paid week with no list. Reviewers sized the seed pool at about 50 plays before merging, enough for five users for roughly 10 to 15 Mondays if nothing were added. Peter's decision on 2026-11-22: keep these rules as they are and do not build more for thin weeks, because 10 to 15 new users are expected each week and their runs will grow the pool far faster than it is used. If sign-ups run well below that, revisit R14 and R15 first. R16 is the early warning.
- **The spec stays the behavioural source of truth.** This document adds to it in R9, R10, R12, R13 to R16, R23 and R24, and those should be written back into the spec when they are built.
- **Zack 2.0 and Cora 2.0 are drafted as part of this work.** The launch list allows it, and both block the cycle. Peter's approval is still required.

## Dependencies and assumptions

- **Privacy and terms drafts** (marketing builder, launch list S10). Sign-up asks for consent and a card, so the draft pages must be live and linked from `/start` before R9 takes effect. The launch list says not to open sign-up to the public until S10 is done; this document reads "anyone with the link, nothing on the site linking to `/start`" as short of public. Peter confirmed this reading on 2026-11-22: people with the link may sign up and be charged while the two pages are still labelled drafts, as long as the pages are live and linked from sign-up. Start buttons on the public site are the marketing builder's to add, with the v3 site.
- **Idea card ownership** (R7) and the timing of the data palette tokens in `src/app/globals.css` need a short agreement with the marketing builder.
- **From Peter, blocking real use but not the build:** approval of Zack 2.0 and Cora 2.0 (S1, S2), the category list (S3, default D10 until then), Google credentials (S5), the setup file and its read-through (S9), the pilot seed runs (S14), and the Vercel keys, Stripe prices, `ADMIN_EMAILS` and support sending address (S13). S13 now means live Stripe keys and live prices on production, since real sign-ups start the day B1 ships (R9, R12).
- **Tax registration (S4) is done,** per Peter on 2026-11-22. Still to see during testing: a test invoice for a Canadian customer showing HST as its own line (spec check 26). Not yet heard: the accountant's word on charging US customers.
- **Assumption:** the existing AI Gateway, Resend and Neon setup carry the new load without a plan change. Unverified.

## Outstanding questions

### Resolve before planning

None.

### Deferred to planning

- [Affects R1][Technical] Which auth approach to use for email links, Google and sessions, given spec B.3 leaves it to the builder.
- [Affects R1][Needs research] How to model "card saved, no charge, subscription starts with the third list" in Stripe so the first charge lands exactly on that Monday at 6:00 AM Toronto, with Stripe Tax and set prices in two currencies.
- [Affects R1][Needs research] How the second-miss adjustment is added to the next invoice, and how it is dropped if the user cancels first.
- [Affects R1][Technical] How the Cora job stays safe to run twice, resumes, and finishes inside the function time limit as user numbers grow.
- [Affects R1][Technical] How the Monday jobs fire at the right Toronto time across the clock change, following the pattern the Circles spec describes.
- [Affects R1][Technical] What changing an email on `/app/settings` does to sign-in and to the Stripe customer.
- [Affects R1][User decision] Account deletion: the spec says what deletion removes but gives no screen for it. Default until decided: an admin does it on request from the user detail page.
- [Affects R6][Technical] The order of work inside B1 after the shared pieces in R6. Once those are delivered, order the rest to reach the first real charge soonest.
- [Affects R12][Needs research] Whether the current Neon plan allows a separate preview database, how the test-mode Stripe webhook reaches a preview build, and how the cron jobs are triggered there.
- [Affects R12][Needs research] A first charge that fails is not retried by Stripe the way a renewal is, so the day 1, 3 and 7 retries are the app's to run; and what happens when a 6:00 AM charge needs the cardholder to confirm it with their bank.
- [Affects R12][Technical] The amounts quoted in emails before a charge come from Stripe's own preview of the invoice, so they always match the charge. What the card step and emails say where no tax is collected (drop "plus {tax name}").
- [Affects R1][Technical] The times in `v3.coraAt`, `v3.chargeAt` and `v3.sendAt` are editable settings but cron schedules are fixed in `vercel.json`. Also: a missed 6:00 AM charge job must never let the 7:00 AM job send an unpaid third list.
- [Affects R9][Technical] Guarding open sign-up: limits on sign-up and sign-in emails by address and by IP, protection against card testing on the card step, a way for an admin to suspend an account, and Stripe webhook signature checks.
- [Affects R1][Technical] Treating every run as untrusted text in model calls: Cora and the privacy check get no tools and no secrets and return only checked structure. Whether the Zack key may travel in the query string at all (spec B.5 allows it), and keeping it out of logs if so.
- [Affects R1][Technical] Limits on run uploads and model calls per account and overall, and a spend alert, so open sign-up cannot run up model costs.
- [Affects R4, R11][Technical] The shared admin password stays until the `ADMIN_EMAILS` check is confirmed working on production, then is removed (spec B.3). Admin rights come only from a verified email; changing an email never grants them. Admin-created pilot links work once and expire.
- [Affects R23][Technical] How the model fallback handles what the 1.8 and 1.9 seed reports leave out (most state no category; several never say Actual or Implied) without inventing numbers.
- [Affects R1][User decision] Whether a free-tool Zack 1.9 report carried in through `zack` on `/start` counts as the user's first weekly run and so can trigger a first free list.
- [Affects R14][User decision] Whether a short list should cost a one-at-a-time user less than the full list price. Default: full price, as decided here; revisit after the first short Monday.

## Next steps

-> `/ce:plan` for structured implementation planning.
