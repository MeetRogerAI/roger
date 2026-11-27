---
date: 2026-11-27
topic: roger-v3-b2-b3-b4
---

# Roger v3 app: B2 (growth), B3 (measurement), B4 (levels)

## Problem Frame

B1 (the paid weekly cycle) is built but not live. The next three app versions are specified in:

- `artifacts/Roger v3 - design spec.md` (1.5: B.15, B.16, B.16a, B.17, and B.18 checks 51–58)
- `artifacts/Roger Levels Build Spec - Zack 2.1, Cora 2.1 and Dashboard v1.2.md` ("the build spec")
- `artifacts/Roger AI Agent Levels and Check Charts v1.1.md` ("the levels file")

Those specs are the source of truth. This document doesn't restate them. It records the decisions Peter made on November 27, 2026 that the specs leave open, plus the fixes from the review of this document. It also sets the scope and order of the build. Where a decision here **overrides** a spec, it says so.

- **B2: growth.** Referrals and credit, the Wednesday stats email, bricks and Seasons, the leaderboard, group sessions, sponsors, and two levels pieces: the Season rename and quiz question 5.
- **B3: measurement and self-improvement.** Loop measures, the pipeline, the review bot, and stored feedback.
- **B4: levels.** Level intake, the level engine and storage, the dashboard check chart, the stats-email Level line and operations view, and Cora's use of levels.

The order is B2, then B3, then B4 (build spec T5). Nothing here changes B1's go-live path (build spec T1). The one change B1's billing displays need for credit (R7) ships with B2.

## Requirements

**General**
- R1. Each version is built in full and is its own branch and PR. B3 branches from B2, and B4 from B3, if the earlier one isn't merged yet. Merging waits for Peter.
- R2. On production, every user-facing B2, B3 and B4 surface stays dark until it's ready. They sit behind the existing `v3.signupOpen` / `v3.cycleLive` switches, plus a per-feature switch where a feature could go wrong in public. The group session card is hidden while S11's settings are empty. B4 sits behind a new `v3.levelsLive` setting, which stays off and is added to the design spec's settings table (0.9).
- R3. Acceptance checks: B.18 #51–52 belong to B2 and #53–57 to B4. Check #58 belongs to B4 but waits for real Zack 2.1 runs (R33).
- R4. **The intake check (build spec T3) is done first, as its own small PR off `main`, before B2.** It confirms that B1's intake ignores a fenced block it doesn't recognise, and adds a test. This lets Zack 2.1 ship after B1 goes live without waiting for any of B2–B4.
- R5. Every new `/admin/*` page and admin action checks the admin role on the server, using the existing admin check. Each action is recorded in `admin_actions` with who did it.

**B2: Referrals and credit**
- R6. As spec B.15:
  - `/r/{code}` link, remembered for 60 days into `/start`; the first referrer wins.
  - No self-referral. An account can't refer itself, or an account that has the same normalised email or the same card fingerprint.
  - `/app/referrals` has a Copy button, the referral script, and each referred person's stage (invited, in trial, paying) with the credit earned and remaining. Referral codes can't be guessed, and an unknown code gives the same response as no code.
- R7. **Credit is how a member uses Roger for free** (Peter): someone who keeps referring can, in principle, never pay.
  - **How much.** Each referred person earns their referrer one credit, worth the lesser of one month at list price (US$200 or CA$280, in the referrer's currency) and the value of the referred person's first paid invoice after promo discounts and before tax. Paying part or all of it with their own earned credit still counts as paying (Peter, November 27). A 100%-off invoice earns nothing until their first invoice above 0.
  - **When it posts.** It posts the moment that invoice is paid, because payments are non-refundable under the Roger monthly terms.
  - **How it's used.** Every invoice uses the credit balance first, and the card is charged only for what's left. This includes the first charge at the third list, during the referrer's trial, and invoices that include the higher-rate difference line. There's no cap, and unused credit carries forward.
  - **What members see.** Wherever B1 shows an upcoming or past charge (the Payment Price Box, the second-list and 48-hour emails, the billing page and receipts), it shows the credit applied and the amount the card is charged. B1's "amount changed" comparison stays on the invoice total before credit, so credit never causes a hold.
- R8. If the referred person's paid invoice is later refunded as a mistake or lost in a dispute, the same amount comes back off the referrer's credit balance. The balance can go to zero but never makes the referrer owe cash. An admin is alerted.
- R9. Credit cases:
  - **Referrer has no Stripe customer yet** (no card): the credit is recorded and posted when their card is saved.
  - **Referrer's account is closed:** they earn nothing new, and unused credit lapses.
  - **Sponsored referrer:** they share a link, earn leaderboard points and see stages, but get no credit, because they're never invoiced.
  - **Sponsored referred user:** their referrer earns nothing (spec).

**B2: Stats email, Seasons, leaderboard**
- R10. The Wednesday stats email follows spec B.15: Season, bricks, contribution points, leaderboard rank, credit balance and one invitation link.
  - It goes to active members (trial with a card, paying, or sponsored).
  - It has its own signed one-click unsubscribe, which doesn't affect Monday emails.
  - B4 adds the Level line (R30).
- R11. Season rename (acceptance #51):
  - `--color-level-1…5` becomes `--color-season-1…5`.
  - The brick graph on `/app/history` and the stats email say "Season".
  - From then on, "Level" appears only for Roger AI Levels.
- R12. The leaderboard is opt-in, through an explicit choice made on the leaderboard prompt (choose or confirm a display name to appear).
  - Having a `display_name` already set in settings doesn't put anyone on the board.
  - Without opting in, a member sees their own points and rank privately.
  - No name is ever made up from an email.
  - Display names are length-limited and must be unique on the board, and an admin can remove one.
  - Points work as in the spec: 1 when a member's play is picked, 1 more when that set-up is confirmed. They're shown as counts, never as names.

**B2: Sessions and sponsors**
- R13. The group session card, guests and admin attendance follow spec B.15.
  - Guests come in through `/g/{token}` and are recorded as the subscriber's referral. Guest tokens are unguessable, single-use, and expire after their session.
  - A guest sees only the session details and the inviting subscriber's display name.
  - The card stays hidden until S11's settings are filled in.
- R14. Sponsors follow spec B.15.
  - **Admin:** `/admin/sponsors` creates a sponsor with name, currency, the two prices, seats, a code, a **billing email** and a **billing address** (country and postal code at minimum, for Stripe Tax). Creating a sponsor creates its Stripe customer.
  - **Sign-up:** `/start?sponsor={code}` never asks for a card: no held list, no Payment, and lists from the first Monday (#48).
  - **Codes:** sponsor codes can't be guessed and can be revoked. Sign-up refuses a code whose seats are full, and alerts an admin as the cap gets close.
  - **Invoicing:** each month the page shows the seats in use at each price and prepares a draft Stripe invoice, with automatic tax, for an admin to send. Sponsors have no login.
  - **Pricing:** the contributor rule applies to each seat at the sponsor's two prices. Two or more missed, unexcused weeks in a calendar month bill that seat at the higher price. Sponsored members get no contributor notices (Peter, November 27). A sponsor is invoiced from each sponsored user's third list (spec default 6).

**B2: Quiz question 5**
- R15. Quiz question 5 offers Levels 0–9 with the v1.1 names **and** each level's "you need it when…" symptom (acceptance #52).
  - It stores the answer with its quiz version.
  - The v1.1 names go public when this ships, at the B2 release. Until then, B1's quiz keeps its 0–8 v1.0 list. This settles open question 5 in the levels file.
  - Answers stored before v1.1 are kept, and an old "8" is read as "8 or above".

**B3: Measurement and self-improvement**
- R16. `/admin/measures` and `/admin/pipeline` follow spec B.16. They include the December 14 checkpoint value against its 0.25 floor, and adoption against the 2-of-3 target.
- R17. On a schedule, the review bot (`/admin/review`) proposes specific wording changes to the Zack and Cora instruction files. It works from the week's runs, flags, rejections, picks, set-up rates and stored feedback.
- R18. **Overrides spec B.16** ("approved changes go into the repo as a normal commit", decided by Peter). Approving a proposal makes the app open a GitHub pull request on `MeetRogerAI/roger` with exactly that edit, linked from the proposal.
  - Nothing reaches `main` without a human merge. Branch protection on `main` enforces this (required review, no direct pushes, including from the token).
  - Rejected proposals are kept, with who rejected them.
  - A proposal is checked against the file as it stands on `main` when it's approved. Approving a newer proposal for the same file closes the older open PR.
  - Preview environments use dry-run mode and never open real PRs.
- R19. Review-bot safety:
  - **Inputs are untrusted:** user runs, notes and feedback are treated as data, never as instructions.
  - **Allowed files:** the bot can only edit the instruction files under `content/zack/` and `content/cora/`, and each diff has a size limit.
  - **Evidence:** each proposal shows the reviewer the source evidence it came from.
  - **Guardrails:** proposals that touch a guardrail or privacy section are flagged for a second read.
  - **Public PRs:** the repo is public, so the PR holds only the diff and an opaque proposal ID. It never includes user text, names, emails or quotes, and the proposed wording goes through the privacy scrub before the PR opens.
  - **Token:** the GitHub token is server-only, scoped to this one repository (contents and pull requests: write), owned and rotated by Peter, and added as a new launch-list item.
- R20. Every Zack run and Cora list records the instruction-file version it used. `/admin/review` shows the measures before and after each merged proposal.
- R21. Members' replies and notes are stored against their record and feed the review bot (spec B.16). They're deleted with the account, by the existing retention and deletion job.
- R21a. **The B.16 rows moved into B3 on November 27** (decided by Peter; see `docs/plans/2026-11-27-002-feat-v3-launch-close-out-plan.md`, Unit 1, the "Roadmap authority" decision and "New in planning"). The close-out plan found these items in no roadmap home and added them to spec B.16. B3 builds:
  - **Admin read logging** (from launch list S22): every time an admin opens a member's runs or picks, `admin_actions` records it.
  - **Cora change 11, upgrades:** a list may offer an upgrade to a play the member already runs, at most one of the three picks, behind its own switch (off).
  - **Cora change 15, adoption counts:** an idea counts as adopted when the member's next profile shows it used, with "installed" and "used" reported separately.
  - **Sandbox scenario tests:** `SCENARIO_TARGET=sandbox` runs the scenario tests against the Stripe sandbox on test clocks and the scenario-test database (replaced for launch by a manual test-clock journey on preview).

**B4: Levels (built on fixtures, switched off)**
- R22. **Overrides the "Before B4 starts" gate** in build spec 3.6 and design spec B.16a (decided by Peter). B4 is built in full now, against sample `roger-level` blocks, behind `v3.levelsLive` (off).
  - The block layout in build spec 1.1 is frozen as a versioned contract that Zack 2.1 must emit.
  - The fixtures are generated from that contract and cover every level and edge case.
  - B4 goes live only after Zack 2.1 is approved and live (S23, S24), and after a real Zack 2.1 run from each agent validates against the contract.
- R23. Cora 2.0 change 8 (matching "Also runs" and the profile's Setup to pool plays) is a B4 prerequisite. It isn't built yet (`content/cora/cora.md` rule 7), so B4 builds it first, as its own unit. This adds about 1.5 half-days (estimate) to B4's 10.5, and the design spec's B.17 is updated to match. Change 8 changes live Cora matching, so it gets its own regression tests against B1's Cora behaviour.
- R24. Level intake (C1): the `roger-level` block arrives with the **private profile** (the `zack_profiles` submission), not the run.
  - It's validated in profile intake against the contract, with a size limit, and only the validated fields are stored.
  - A privacy check is added to that path (secrets, personal details and third-party names are rejected or redacted). Profile intake has no privacy check today.
  - A run whose profile has no block is still accepted and scored on its other evidence.
  - The block never enters the shared pool or the review bot's inputs (#53). It's readable only by its owner and admins, and is deleted with the account.
- R25. Level engine (C2, C3): after each accepted profile:
  - It sets every item's live state using the evidence-window rule (levels file 2.2).
  - It computes the earned level using rule 2.3 (never lower than before, #54).
  - It lists the gaps and the next level's items.
  - No level is earned on self-reported items alone. Every level needs at least three core items verified by Zack or Roger data (#55). The provisional level (R27) is the exception.
- R26. The ten levels, every check item, and every threshold live in one data file that matches the levels file. An item's details are its ID, level, core/elective/design kind, verification code, how it's checked, the symptom, and the contract fields that settle it. When Peter rules on S23 the data changes, not the code. Every ruling has to be in before `v3.levelsLive` is switched on, so no level is earned under rules that later change.
- R27. Provisional level, a single-question interim form; the fuller multi-question quiz (C7) is deferred:
  - Until a member's first Zack 2.1 run, their level comes from quiz question 5 or a level an admin sets, shown as provisional.
  - A provisional level is **not a floor**: the first Zack 2.1 run replaces it, up or down.
  - Cora uses a provisional level for eligibility (R31).
- R28. Where an S23 question is still open, the build uses each file's recommendation and lists it as "built as recommended" for Peter to confirm:
  - all of a member's platforms combine into one level (an item is 1 if any run shows it);
  - the three Cora slots;
  - 6.02 means five clean runs in a row with one tested undo;
  - a member's Level is private to them and the Roger team, not shown on the leaderboard;
  - self-reports are re-checked when Zack sees a contradiction, and once a Season for guardrail items;
  - 9.06 stays core;
  - 6.12 stays elective.
- R29. The dashboard check chart (C4, #56) shows:
  - the Level number and name;
  - the next level's chart with live 0s and 1s;
  - gaps below the Level, flagged first;
  - "how this is checked" for each item.

  Seasons stay on `/app/history`. The operations view (C6) shows each member's Level and core gaps.
- R30. Stats email (C5): a Level line, plus "1 step from Level N" when exactly one core item is open.
- R31. Cora uses levels (build spec 2.1–2.3, #57):
  - **Tags:** each pool play is tagged with `unlocks` and an entry level. A review step proposes the tags and an admin approves them, and existing seed plays are tagged once.
  - **Eligibility:** a play is eligible only if its entry level is at most Level + 1.
  - **Slots:** the three slots are filled in order: fix a gap, next level, best fit.
  - **Reason lines:** they name the item the play moves, or the next level's symptom.
  - **Privacy:** a member is never shown another member's level.
- R32. High-level newcomers (build spec 2.4): a newcomer whose **verified** level is 7 or 8 has their first Cora list held for Peter's review. A provisional level never triggers the hold. If the list hasn't been reviewed by the week's send time, it goes out as picked and both admins are alerted, so the week never fails.
- R33. Check #58 (pilot members' real Zack 2.1 runs reproduce the team's hand-set levels) is a post-launch task. B4 includes a test-harness script that scores given runs and prints the differences from the hand-set levels; the spec's "tests on the pilot users' real runs" covers it. It doesn't block the B4 PR.

## Success Criteria
- **Intake PR:** a run carrying an unknown fenced block is accepted, and the block is ignored and not sent to the model.
- **B2:**
  - #48, #51, #52 and every B.15 behaviour pass in tests.
  - On the test clock, a referral runs end to end: referred member's first paid invoice → credit posted → it comes off the referrer's next invoice before the card is charged.
  - A referrer with enough credit is never charged on their card.
  - A dispute claws the credit back.
- **B3:**
  - Measures match a hand calculation on seeded data.
  - An approved proposal produces a PR (dry-run on preview) that contains no user text.
- **B4:**
  - #53–57 pass on the fixture set.
  - After S23 and S24, going live takes three steps: validate one real run per agent, confirm the rulings, and switch on `v3.levelsLive`.
- **All units:** `npm run build`, `npm run lint`, typecheck and the full test suite are green (#36).

## Scope Boundaries
- No change to B1 behaviour or its go-live path, beyond B2's credit display and invoice-balance handling (R7).
- No Zack 2.1 content (S24). That's Peter's content work. B4 only consumes the block, against the contract.
- Out of scope (build spec 3.7):
  - the fuller multi-question provisional level (C7);
  - Level 9 verification from referrals;
  - level-based group sessions;
  - "beyond 9".
- No public display of anyone's Level.
- No renumbering of versions. The per-run (one-list) code stays unreachable and untouched.

## Key Decisions
- **B4 is built now on fixtures, behind an off switch, against a frozen block contract.** All of B4 gets built without waiting for B1 to go live, and S23 rulings become data edits that must land before go-live.
- **Credit as a path to free use:** applied before the card on every invoice, posted at payment, capped at what was paid, clawed back on reversal.
- **Quiz Q5 shows names and symptoms:** people recognise symptoms, and making the names public is accepted.
- **Leaderboard is an explicit opt-in:** privacy first, with no made-up names.
- **The review bot opens a PR**, under branch protection, with no user data and dry-run on preview. It keeps "nothing changes without approval" and adds review before deploy.
- **The intake check (T3) comes first, off `main`**, so Zack 2.1 is never blocked behind B2–B4.
- **Order stays B2 → B3 → B4 (T5).** B1 isn't live and B2 ships dark, so the December 14 checkpoint will have little real referral data. Peter's order still stands, because B3's measures are needed whenever referrals start.

## Dependencies / Assumptions
- **Verified in the code:**
  - `users` has `sponsor_id`, `referral_code`, `referred_by` and `display_name`. There are no `sponsors`, `referrals`, `credits` or `points` tables.
  - `sessions` is already used for sign-in, so group sessions need a different name.
  - `/r`, `/app/referrals`, `/app/leaderboard`, `/app/sessions` and `/admin/sponsors` don't exist.
  - Quiz `level` accepts 0–8.
  - Cora change 8 isn't built.
  - `src/lib/intake/parse-block.ts` matches only `roger-run` and `roger-profile` fences.
  - Profile intake (`processProfile`) has no privacy check.
  - B1's charge comparisons use the Stripe invoice total, which ignores the customer balance.
- **New launch-list items:**
  - the GitHub token and branch protection on `main` (B3);
  - S23 rulings before `v3.levelsLive` is switched on (B4).
  - S11 (the session settings) is already listed.
- **Repo:** `MeetRogerAI/roger` is public.

## Outstanding Questions

### Resolve Before Planning
(none)

### Deferred to Planning
- [Affects R7–R8][Technical] Make credit posting idempotent across the synchronous first-charge result and the `invoice.paid` webhook. Decide whether `credits` is a ledger kept in sync with Stripe's customer balance transactions.
- [Affects R14][Technical] The sponsor billing period, how a seat that starts or ends mid-period is charged, and how `contribution_weeks` results become each seat's line on the sponsor invoice. Recommend: calendar month, a seat billed for the full month once active, and the B1 contributor rule applied per seat.
- [Affects R10, R17][Technical] Times for the Wednesday stats job and the review-bot schedule, kept clear of the Monday cron window and reusing B1's job and lease pattern.
- [Affects R17][Technical] The review bot's model, and confirmation that it has no tools or network access.
- [Affects R25–R26][Needs research] Map every verification code in the levels file to the contract fields that settle it, and flag any item Zack 2.1 can't evidence. This is done first, in B4's planning.
- [Affects R31][Technical] Whether tagging reuses the existing admin Cora review flow.

## Next Steps
-> /ce:plan for the intake-check PR (R4) and B2. Plans for B3 and B4 follow as each version starts.
