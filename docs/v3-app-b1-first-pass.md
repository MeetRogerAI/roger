# Roger v3 app B1 first pass

November 23, 2026. Branch `feat/v3-e2e` off `main` (Units 1 to 18 merged). Plan Unit 19, the parts that need no owner input. Nothing was deployed, no production database or live Stripe was touched, and sign-up and the cycle stay off on production.

## Included

- Scenario tests in `tests/scenarios/`, driving the real job functions (`runCoraJob`, `runChargeJob`, `runSendJob`, `runHourly`, `handleStripeEvent`) week by week on a simulated clock, each from a fresh database (`testDb()`), with one fake Stripe that implements every gateway the app has and sends the webhook events Stripe would, a recording mail transport, and fake intake, merge and Fit models. `helpers.ts` documents the `SCENARIO_TARGET` switch: `fakes` (default) or `sandbox` (the Stripe sandbox and the scenario Neon branch; a seam only, it throws today). They run in `npx vitest run` and alone with `npm run test:scenarios`.
- All 41 checks of spec B.18 walked below.
- The spec write-back (marked "Written back from the B1 build" in `artifacts/v3/Roger v3 - design spec.md`) and the launch list update (`artifacts/v3/launch-list.html`).

| Scenario file | What it proves | Result |
|---|---|---|
| `trial-to-paid.test.ts` | Canadian (CA$280 + HST row) and US (US$200, no tax row) members: two free Mondays, the second-list email and the 48-hour reminder state the amount, the charge with the third list matches it; request shape checked. No run on the first-charge Monday: nothing charged, charged the next Monday. The 21-day close with nudges on days 3, 10, 17. | 4 tests: 3 pass, 1 known failure (below) |
| `failed-first-charge.test.ts` | Decline, retries on days 1 and 3, success sends the held list at once; four failures close on day 7 with no charge; a hard decline is not retried and closes on day 7. | 3 pass |
| `missed-weeks.test.ts` | Contributed, forgiven, second miss (one pending item, labelled, keyed by its row), third miss adds nothing, itemised email three days before, renewal invoice with one difference line and HST as its own row; an admin excuse deletes the item. | 2 pass |
| `one-at-a-time.test.ts` | Order with a run: its own invoice, one item, tax row, paid, list and receipt; order with no run: no charge, email why; no order: never charged; ordering with sharing off is refused. | 2 pass |
| `thin-weeks.test.ts` | Two-play pool: short lists for a trial, a third-list, a monthly and a one-at-a-time member (free list used, first charge made, order charged in full); then no eligible plays: notes by state, no charge, no free list, the week excused for the monthly member, the order closed; a member linked to the seed contributor gets "first charge moved". | 2 tests: 1 pass, 1 known failure (below) |
| `switch-and-cancel.test.ts` | Monthly to one at a time (lists to the month's end, then orders only); one at a time to monthly with an order for that Monday (one charge); cancel in the trial (card removed, "not charged"); cancel, undo, one renewal, cancel again, ends with the month. | 4 pass |
| `full-cycle.test.ts` | One unattended cycle from Sunday 6:00 PM runs to Monday emails, every route called at the UTC minutes `vercel.json` schedules and gated as the route gates it; a summer-time run. Repeating the morning changes nothing. | 3 tests: 2 pass, 1 known failure (below) |
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
22. Passes: `failed-first-charge.test.ts` (all three).
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

Each is a test marked `it.fails`, so the suite stays green and the test turns red the day it is fixed. Nothing in `src/` was changed.

- **No note when a third-list member's Zack sends nothing.** The plan ("If the Monday passes with no run or no eligible plays, the user gets one note with the next possible date") and the reminder email ("If it doesn't, nothing is charged and we'll tell you the next date") promise it. `src/lib/billing/charge-job.ts:53` sends "Your first charge moved" only for `outcome = 'none'`; with no run the week is `not_eligible`, and the send job's no-run note is for free lists only (`src/lib/cora/send-job.ts:156`). Nothing is charged; the member hears nothing that Monday. Test: `trial-to-paid.test.ts` "tells a third-list member whose Zack sent nothing that the first charge moved".
- **R15's admin alert only for paying members.** R15: "If a user has no eligible plays ... both admins are alerted." `src/lib/cora/send-job.ts:166` alerts only for an active monthly member. Decide whether R15 or the build is right. Test: `thin-weeks.test.ts` "alerts both admins for a trial member with no eligible plays too".
- **Early job times are not honoured in summer.** The settings accept charge and send times from 1:00 AM (`src/lib/v3-settings.ts:28`), but `vercel.json` runs charge from 10:00 UTC and send from 11:00 UTC, so in summer a charge before 6:00 AM or a send before 7:00 AM runs late. Never early and never twice. Test: `full-cycle.test.ts` "honours a 4:00 AM charge time and a 5:00 AM send time in summer". Either widen the two schedules to 05-17 like Cora's, or have the settings refuse those times.
- Wording, not tested: R15 asks the monthly member's no-ideas note to say the list is missing because of Roger and the week never counts as a miss; `noIdeasThisWeekEmail` (`src/lib/mail/templates/monday.ts:54`) says neither. The behaviour is right (the week is excused).
- For the sandbox run: the webhook's `customer.subscription.deleted` and `invoice.paid` handlers use the real clock (`new Date()`, `src/lib/billing/webhook.ts:89` and `:129`) rather than `o.now`. Harmless on production (the route passes no `now`), but a test-clock run will see real dates in those two steps.

## Needs the live environment (beyond the seven checks)

- The scenario files once against the Stripe sandbox and the scenario Neon branch (`SCENARIO_TARGET=sandbox`, to be wired): that Checkout works for a customer on a test clock; the real error for a charge that needs bank confirmation; a second renewal while a renewal is held under "leave unpaid" (plan Unit 15 known gap 2); that a renewal sweeps the pending difference item onto its invoice as the fakes assume.
- The 13 pilot runs through the real model (`INTAKE_LIVE=1`), then the production seed import under nine records, then a production dry run read by an admin.
- Webhook delivery to the stable preview address and on production, with the event list in the launch list.

## Verification

- `npx tsc --noEmit -p .`: clean.
- `npx vitest run`: 89 files passed, 1 skipped; 922 tests passed, 13 skipped (the live model and seed-run tests). The 8 scenario files hold 22 of those tests, 3 of them known failures marked `it.fails`.
- `npx eslint src tests`: no errors; 6 warnings, all in existing `src/` files, none in `tests/`.
- Dependencies were not changed.
