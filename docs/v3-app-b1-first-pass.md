# Roger v3 app B1 first pass

November 23, 2026. Branch `feat/v3-e2e` off `main` (Units 1 to 18 merged), updated the same day after `main` (PR #42, the whole-system seams review) was merged in. Plan Unit 19, the parts that need no owner input. Nothing was deployed, no production database or live Stripe was touched, and sign-up and the cycle stay off on production.

## Included

- Scenario tests in `tests/scenarios/`, driving the real job functions (`runCoraJob`, `runChargeJob`, `runSendJob`, `runHourly`, `handleStripeEvent`) week by week on a simulated clock, each from a fresh database (`testDb()`), with one fake Stripe that implements every gateway the app has and sends the webhook events Stripe would, a recording mail transport, and fake intake, merge and Fit models. `helpers.ts` documents the `SCENARIO_TARGET` switch: `fakes` (default) or `sandbox` (the Stripe sandbox and the scenario Neon branch; a seam only, it throws today). They run in `npx vitest run` and alone with `npm run test:scenarios`.
- All 41 checks of spec B.18 walked below.
- The spec write-back (marked *(1.2)* in `artifacts/Roger v3 - design spec.md`) and the launch list update (`artifacts/launch-list.html`).

| Scenario file | What it proves | Result |
|---|---|---|
| `trial-to-paid.test.ts` | Canadian (CA$280 + HST row) and US (US$200, no tax row) members: two free Mondays, the second-list email and the 48-hour reminder state the amount, the charge with the third list matches it; request shape checked. No run on the first-charge Monday: nothing charged, a "first charge moved" note, charged the next Monday. The 21-day close with nudges on days 3, 10, 17. | 5 tests: 4 pass, 1 known failure (below) |
| `failed-first-charge.test.ts` | Decline, retries on days 1 and 3, success sends the held list at once; four failures close on day 7 with no charge and one closing email (no decline email on day 7); a hard decline is not retried and closes on day 7. | 3 pass |
| `missed-weeks.test.ts` | Contributed, forgiven, second miss (one pending item, labelled, keyed by its row), third miss adds nothing, itemised email three days before, renewal invoice with one difference line and HST as its own row; an admin excuse deletes the item. | 2 pass |
| `one-at-a-time.test.ts` | Order with a run: its own invoice, one item, tax row, paid, list and receipt; order with no run: no charge, email why; no order: never charged; ordering with sharing off is refused. | 2 pass |
| `thin-weeks.test.ts` | Two-play pool: short lists for a trial, a third-list, a monthly and a one-at-a-time member (free list used, first charge made, order charged in full); then no eligible plays: notes by state, no charge, no free list, the week excused for the monthly member, the order closed; a member linked to the seed contributor gets "first charge moved"; both admins are alerted for every member with none (R15). | 2 pass |
| `switch-and-cancel.test.ts` | Monthly to one at a time (lists to the month's end, then orders only); one at a time to monthly with an order for that Monday (one charge); cancel in the trial (card removed, "not charged"); cancel, undo, one renewal, cancel again, ends with the month. | 4 pass |
| `full-cycle.test.ts` | One unattended cycle from Sunday 6:00 PM runs to Monday emails, every route called at the UTC minutes `vercel.json` schedules (read from the file) and gated as the route gates it; a summer-time run, and early charge and send times honoured. Repeating the morning changes nothing. | 3 pass |
| `seed-import.test.ts` | 13 files from nine people (three with several agents) give nine contributor records; linked pilots are never sent a play from their own seed files across three Mondays. | 2 pass |

## The 41 checks (spec B.18)

Tally: **34 pass**, **7 need the live environment**, **0 fail**. Check 12 is read with R13 to R15 (up to three picks when the pool is short).

**Sign-up and sign-in**

1. Needs the live environment: walk `/start` on preview through `running`, `new` and `not_ready` ("start anyway") at 390px and 1440px, to `/start/done`. The routing rules (`src/lib/signup/quiz.test.ts`, `src/app/start/actions.test.ts`) and the plan, card and webhook steps (`signUp` in every scenario) pass.
2. Needs the live environment: look at `/start/card` for the statement directly above Stripe's card form. "No charge at sign-up" passes: `trial-to-paid.test.ts` (no Stripe charge call until the third Monday; sign-up makes only a customer and a setup session).
3. Passes: `src/app/start/billing-actions.test.ts` "will not move on without the consent box, even when posted directly (spec check 3)". The unticked box is the plan form's default.
4. Passes: `src/lib/auth/auth-core.test.ts` "works once", "stops working after 15 minutes". No member password exists; the shared `ADMIN_PASSWORD` is removed at go-live (launch list).

**Zack**

5. Passes: `src/lib/zack/instructions.test.ts`, `src/app/api/zack/routes.test.ts`.
6. Needs the live environment: send a run from a real agent with the connector text and see it on `/app/zack` and `/admin/runs` within a minute. Bad keys refused with no detail passes: `src/lib/zack/key.test.ts`, `src/app/api/zack/routes.test.ts`.
7. Passes: `src/lib/zack/receive.test.ts`.
8. Passes: `src/lib/zack/receive.test.ts`, `src/lib/zack/instructions.test.ts`, `src/app/api/zack/routes.test.ts`.
9. Passes: `src/app/api/zack/routes.test.ts` (the page and the endpoint share `instructionsForUser`).
10. Passes: `src/lib/intake/process.test.ts`, `src/lib/intake/rules.test.ts`.
11. Passes: `src/lib/intake/process.test.ts`, `src/lib/intake/rules.test.ts`.

**Cora and Monday**

12. Passes: `full-cycle.test.ts` "runs intake, Cora, the charges, the send and the hourly pass on the job clock alone" (three picks each by 6:00 AM, one email each from 7:00, nobody signed in); `src/lib/cora/send-job.test.ts`.
13. Passes: `src/lib/cora/job.test.ts`, `src/lib/cora/pick.test.ts`, `seed-import.test.ts` "never picks a linked pilot a play from their own seed files".
14. Passes: `src/lib/cora/job.test.ts`, `src/lib/cora/send-job.test.ts` (reason lines and emails). The pages use the same view (`src/lib/cora/idea-view.ts`).
15. Passes: `src/lib/cora/idea-view.test.ts` "starts every copy with the preface, word for word".
16. Passes: `src/lib/cora/job.test.ts` (spec check 16); `full-cycle.test.ts` repeats the whole morning with no change.
17. Passes: `src/lib/cora/job.test.ts` (spec check 17).
18. Passes: `src/lib/cora/score.test.ts` (hand-worked pool).

**Money**

19. Passes: `trial-to-paid.test.ts` "charges a Canadian and a US member once each, with the third list"; `src/lib/billing/first-charge.test.ts`.
20. Passes: `trial-to-paid.test.ts` "a trial with no first list" (three "No list this week" notes, count stays 0); `thin-weeks.test.ts`; `src/lib/cora/send-job.test.ts`.
21. Passes: `trial-to-paid.test.ts` (both emails and the charge carry the same amount, CAD and USD); `src/lib/billing/quote.test.ts`. Repeat once on the sandbox, where the amount comes from Stripe's real preview.
22. Passes: `failed-first-charge.test.ts` (all three; the day-7 failure sends only the closing email).
23. Passes: `trial-to-paid.test.ts` "nudges on days 3, 10 and 17, closes on day 21"; `src/lib/housekeeping/trial.test.ts`.
24. Passes: `missed-weeks.test.ts` "forgives the first miss, bills the second as one difference line". The `/app` banner comes from `src/lib/app/status.ts` (`src/lib/app/status.test.ts`); look at it once on preview.
25. Passes: `missed-weeks.test.ts` "never counts an excused week"; `src/lib/billing/contribution.test.ts`.
26. Needs the live environment: on a sandbox test invoice, the HST row on a first charge, on a renewal carrying a difference line, and on an order (go-live gate). The fakes put tax on its own row (`trial-to-paid`, `missed-weeks`, `one-at-a-time`). US invoices carry no tax line until the accountant's word.
27. Passes: `switch-and-cancel.test.ts` "a subscriber: one click leaves the paid month"; `src/lib/billing/cancel.test.ts`.
28. Passes: `trial-to-paid.test.ts` (CA$280 on `price_monthly_cad`, US$200 on `price_monthly_usd`, each set, not converted); `src/lib/billing/prices.test.ts`.

**Admin**

29. Passes: `src/lib/admin/admin-check.test.ts`. Confirm with both admins on production before `ADMIN_PASSWORD` is removed.
30. Passes: `src/lib/admin/ops.test.ts`.
31. Passes: `src/lib/admin/users.test.ts`, `src/lib/admin/log.test.ts`.
32. Passes: `src/lib/admin/content.test.ts` (what the public site reads). The public testimonials section is the marketing builder's.
33. Passes: `src/lib/setup-file.test.ts`.

**General**

34. Passes: `src/app/app/zack/actions.test.ts`, `src/lib/zack/settings.test.ts`.
35. Needs the live environment: open `/rlpsignature`, `/rlp`, `/hampton`, `/founders`, `/for/[slug]`, the library and a watch link on preview. The six old admin tabs under the new check pass: `src/lib/admin/admin-check.test.ts`.
36. Needs the live environment: the Vercel build of the merge commit. This pass ran `npx tsc --noEmit -p .` (clean) and `npx eslint src tests` (no errors, 6 existing warnings); `npm run build` was not run.
37. Passes: `one-at-a-time.test.ts`, `switch-and-cancel.test.ts`, `src/lib/billing/orders.test.ts`.
38. Passes: `one-at-a-time.test.ts` "an order with no run charges nothing"; `src/lib/billing/orders.test.ts`.
39. Passes: `one-at-a-time.test.ts` "refuses an order while sharing is off, in the action itself"; `src/lib/billing/orders.test.ts`. The disabled button and its reason: look once on preview.
40. Needs the live environment: the public pages (Part A). Sign-up passes: `src/app/start/billing-actions.test.ts` "refuses a plan that is not offered".
41. Passes: `switch-and-cancel.test.ts` "one at a time to monthly: the order for that Monday is replaced"; `src/lib/billing/switch.test.ts`, `src/lib/billing/orders.test.ts`.

## Found in this pass (outside the 41)

**Fixed by PR #42 (the seams review), merged into this branch.** The first pass recorded these as `it.fails`; they are now ordinary passing tests.

- No note when a third-list member's Zack sent nothing: each Monday without the first paid list now sends one "first charge moved" note with the next date. Test: `trial-to-paid.test.ts` "tells a third-list member whose Zack sent nothing that the first charge moved".
- R15's admin alert: both admins now hear of every member with no eligible plays (`[Roger] A member had no eligible ideas`), and the paying member's note says the list is missing because of Roger and the week never counts as a miss; others are told nothing was charged. Tests: `thin-weeks.test.ts`.
- Early job times: charge and send now run every 10 minutes on Mondays from 05:00 UTC, so a 4:00 AM charge or 5:00 AM send is honoured in summer. `vercelCron` in `helpers.ts` now reads the schedules from `vercel.json` instead of copying them. Test: `full-cycle.test.ts` "honours a 4:00 AM charge time and a 5:00 AM send time in summer".
- The webhook now settles with the job clock.

**Behaviour PR #42 changed, tests updated to match:** a day-7 decline with no retry left sends no "card didn't go through" email, only the close email (`failed-first-charge.test.ts`, three decline emails, not four); the closing emails say "Want to come back? Write to us"; a trial past its free lists with no first paid list closes `trialCloseDays` after its last delivered list.

**Found by the second pass, then fixed on this branch:**

- **The new "no first charge" close read the database's clock (fixed: `deliverWeek` now takes the job clock and the send job passes it).** It counts from `max(picks.delivered_at)` (`src/lib/housekeeping/trial.ts:62`), but delivery stamps `delivered_at = now()`, the database's clock, not the job's (`src/lib/cora/deliver.ts:55` and `:64`, on `picks` and `cora_user_weeks`). On production the two agree. On any "as of" run (preview, R24, and these scenarios) the close starts from the real date instead of the simulated one: a member whose last list was December 14 closed on December 21 instead of January 4, so the next Monday's charge never happened. Fix: pass the job clock into `deliverWeek` and stamp it. Test: `trial-to-paid.test.ts` "charges with the list on the next Monday the run arrives (the close counts from the last list, on the job clock)".
## Needs the live environment (beyond the seven checks)

- The scenario files once against the Stripe sandbox and the scenario Neon branch (`SCENARIO_TARGET=sandbox`, to be wired): that Checkout works for a customer on a test clock; the real error for a charge that needs bank confirmation; a second renewal while a renewal is held under "leave unpaid" (plan Unit 15 known gap 2); that a renewal sweeps the pending difference item onto its invoice as the fakes assume.
- The 13 pilot runs through the real model (`INTAKE_LIVE=1`), then the production seed import under nine records, then a production dry run read by an admin.
- Webhook delivery to the stable preview address and on production, with the event list in the launch list.

## Verification

- `npx tsc --noEmit -p .`: clean.
- `npx vitest run` (after merging PR #42): 90 files passed, 1 skipped; 947 tests passed, 13 skipped (the live model and seed-run tests). The 8 scenario files hold 23 of those tests, all passing.
- `npx eslint src tests`: no errors; 6 warnings, all in existing `src/` files, none in `tests/`.
- Dependencies were not changed.
