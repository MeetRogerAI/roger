---
date: 2026-11-27
topic: v3-launch-close-out
---

# Roger v3 Launch Close-out

## Problem Frame

The Roger v3 launch list (`artifacts/launch-list.html`, published at https://claude.ai/artifact/PvCLU9uLcV2abfxwNqd7tE) has 25 checklist items on "Everything else" and 18 open rows on "Reference" (S5–S24, D1–D12 less those already removed). Peter cannot officially launch v3 until the list is accounted for. The end state of this project is a launch list with nothing left on it.

**The launch is A1 + B1.** Every piece of text on the list ends one of three ways:
1. **Launch work (A1 or B1):** done now, then removed.
2. **Later work (A2, B2, B3, B4 or beyond):** added to the relevant roadmap/plan (or confirmed already there), then removed.
3. **No longer needed:** removed.

All work happens in git worktrees (this project: `../roger-launch`, branch `launch/v3-close-out` and branches off it), because other sessions share the main checkout (B2 in `../roger-b2`, the marketing site on `feat/site-v1` / `feat/site-v2`).

## Requirements

**Working rules**
- R1. Each item is removed from "Everything else" and its matching Reference row(s) as soon as it is done, with the evidence recorded in the commit message. Its `checks` doc is deleted. The page is republished, and the change is committed and pushed.
- R2. Code changes go on a PR, and the full test suite runs as its own step. Once it is green, Claude merges without waiting, then prunes the list.
- R3. Production data steps (pilot import on production, turning `v3.cycleLive` / `v3.signupOpen` on) and every live-mode Stripe write wait for Peter's explicit yes at that moment.
- R4. Live Stripe: Peter puts the live secret key into Vercel Production himself; it never passes through chat. Claude scripts the live products, the four monthly prices and the live webhook, shows a dry run, runs it on Peter's yes, then sets the price ids and webhook secret in Vercel Production. Dashboard-only settings (Link off, Radar on, Stripe's customer emails off, failed renewals end unpaid) go to Peter as a click-by-click list and are verified through the API where possible.

**Decisions settled 2026-11-27 (apply, then remove rows)**
- R5. Confirmed as built, with no code change: D1 (held run counts as contributed), D2 (trial lists are counted only when a list arrives), D3 (recency weights), D4 (Zack Sunday 6:00 PM local), D7 (seeded testimonials start on), D8 (not-ready note needs both answers), D11 (one-at-a-time order charged only if the run arrived, no carry-over), D12 (single lists need sharing on).
- R6. Cora's six literal readings (S20) are all confirmed as built. Cora 2.0 changes 8, 11 and 15 are not launch work. Change 8 goes into the B4 plan as a prerequisite; changes 11 and 15 go to the Cora backlog.
- R7. Privacy decisions (S22). Each one is built where needed and stated on the privacy page:
  - P1: A deleted member's email stays in the admin log rows for deletion and email changes. The page says a minimal deletion record is kept.
  - P2: Admin reads of runs and picks are not logged for launch. The page says the Roger team can read runs to run the service. Admin-read logging goes on the roadmap.
  - P3: **New behaviour.** Runs from one-at-a-time or held members with no run, order or sign-in in 12 months are erased, alongside the existing 90-days-after-access-ends rule.
  - P4: Pooled plays stay after their run is deleted. The page says contributed ideas stay in the pool, anonymised.
  - P5: A contributor can ask support to withdraw their pooled plays, and an admin removes them by hand. The page offers this. There is no self-serve control.
  - P6: **New behaviour.** A scheduled purge keeps unconverted sign-up interest 12 months, notification records 12 months and Stripe event records 18 months.
- R8. Privacy and terms: Peter confirms both have been read. Remove the "draft" label. Add the AI model provider's position on training (S10) and the R7 disclosures. Make sure both pages are linked from sign-up. The new sentences are listed for Peter in the PR.
- R9. Testimonials (S8): Peter confirms the quotes on preview.meetroger.ai are good to go. Claude checks that Grace has her own quote switched on. If she doesn't, the S8 row stays open for that part only.
- R10. The Grok Bot step on `/getstarted` links to https://x.ai/bot.

**Launch work Claude does**
- R11. Live Stripe setup per R4 (g-live-prices, g-live-keys, g-live-webhook, g-live-settings).
- R12. HST shows as its own line on a Canadian test invoice on preview (g-hst-invoice).
- R13. Preview checks: the AI Gateway reads a run, the Monday cron jobs show in Vercel, a Cora dry run completes, the live-environment checks from the B1 first-pass record are walked, and the scenario tests run once against the sandbox (g-ai-gateway, g-live-checks, S15).
- R14. The scenario-test Neon branch is created with the non-production marker, `SCENARIO_DATABASE_URL` is set, and the switch in `tests/scenarios/helpers.ts` is wired (g-scenario-db, S17).
- R15. At go-live: the 13 pilot runs are read by the model, imported on production and linked to the pilots, and an admin reads a Cora dry run (g-pilot-runs, S14). Claude also checks that no subscription is on the higher price by mistake (g-higher-price).
- R16. After both admins have signed in by email on production and Peter has unset `ADMIN_PASSWORD`, a small PR removes the password-login code (g-password, S21).

**Launch work only Peter can do (Claude gives exact steps, then verifies)**
- R17. Accountant's word on charging US customers and on the product tax category (g-accountant, S4 if present). Turning on the HST registration in live Stripe Tax (g-hst-registration).
- R18. Delete the Resend key that appeared in a screenshot (g-resend-key). Delete leftover webhooks such as "the120" (g-old-webhooks). Trace the old `sk_live_51H8a…` preview key (g-old-key).
- R19. Both admin addresses sign up on production (g-admin-accounts).
- R20. Google OAuth client and keys (g-google, S5). It is optional; the button stays hidden until the keys exist.
- R21. Read the remaining automatic emails, including the "tax included" vs "plus tax" wording, the R15 no-ideas note and the higher-rate invoice line, then approve or give changes (g-emails, S18).
- R22. Turn on `v3.cycleLive`, then `v3.signupOpen` (g-open). This is the last step before the password removal.

**Public site (A1): tracked, not built here**
- R23. The public v3 site is built by the other session under `docs/plans/2026-11-26-1218-feat-marketing-site-three-versions-plan.md`. This project ticks g-public-site when `feat/site-v1` merges. It clears S6 (letter) and S7 (headshot and signature) when they are in the repo, and S8 per R9.

**Moved to the roadmap (confirm or add, then remove the row)**
- R24. S11 (session day, time and link) and D5 and D6 (referral and sponsor defaults) go to B2. S12 (demo video and "one real week" figures) goes to A2. S23 (Levels files) and S24 (Zack 2.1) go to B4. Cora changes 8, 11 and 15 go per R6, and admin-read logging per R7 P2. For each one, the destination plan names it, or the item is added there.

**Decisions settled 2026-11-27 and 2026-11-28: the last item (g-pilot-runs / S14)**

All 18 pilot runs are on production (R15 counted 13 when it was written): 26 plays are in the pool and 38 are held. R26, R28 and R29 replace the "linked to the pilots" part of R15. R25 and R27 are launch work Peter added on 2026-11-27. The state of the work is in `docs/handoffs/2026-11-28-launch-close-out.md`. Where the handoff and this section differ, this section wins.
- R25. **No manual flag review** (Peter, 2026-11-27). Every shared play is admitted with a safeguard, or dropped:
  - A missing playbook is drafted by the model and marked as drafted. If drafting fails, the play is admitted as an outline only.
  - A privacy flag redacts the play, or keeps it as an outline only.
  - Harm is dropped and logged.
  - A one-time pass applies the same rules to the 38 held plays. The 26 pooled plays passed intake with no flag, so they are not checked again. Like every play, they carry the safeguard preamble in lists.
  - `/admin/flags` becomes a log of what was auto-fixed or dropped. Approve and Reject go; Edit stays.
  - An admin can remove a play from the pool for good ("Remove from pool", on `/admin/flags` and on a user's picks). Cora never picks it again. Lists already picked are not recalled (Peter, 2026-11-28).
  - This is the safety boundary for text that other members' agents run. No play is admitted unless its harm check has completed, so a check that cannot run never admits a play. Drafted setup steps go through the same harm checks as a member's own text. The drafting and review prompts treat run text as data, so run text cannot steer them.
  - The branch merges after a security review and an adversarial review, as well as a green suite. Branch `feat/auto-admit-plays`.
- R26. **Seed runs link to accounts by email.** A seed contributor can carry the person's email address. Every contributor with that address links to the account when the account is made, when the address is set, and when the account's email changes. Branch `feat/auto-link-pilots`.
- R27. **Admins are members, with extra powers.** Peter: "admins should have all member actions, and then also have additional actions." Admin addresses can use every member feature. Admin powers still need an email-link session. One admin cannot close, delete or re-address another admin's account from `/admin`. The branch merges after a security review of sessions, as well as a green suite. Branch `feat/admins-are-members`.
- R28. **Pilots join as regular members** (Peter, 2026-11-28). Each pilot signs up at meetroger.ai/start, the same way any member does: the quiz, the account, the plan, a trial, and a card when the first list is ready. Pilots do not use pilot links, and they get no special pricing and no email exclusions. Every email on their path reaches them, so Peter can ask them whether Roger's emails are right. Peter sends them the /start address himself. Their contributor emails are set first, so their seed runs link when they sign up.
- R29. **The pilot emails Peter gave are set on production with a script.** They are private: `.context/pilot-emails.md` in the main checkout, git-ignored.
  - The script runs after R26 is deployed on production.
  - It calls `setContributorEmail`, the same function `/admin/cora` uses. An existing account is linked at once, and running it again is safe.
  - Its dry run lists each label and whether a contributor and an account were found for it.
  - It prints labels and counts, never addresses. Commit messages, PR text and the launch list also use counts only.

  Grace's address is in the file, but she has no contributor record yet. If her runs are imported later, the import passes `--email`. The six pilots with no email on file stay unlinked; each links when an address is set later. S14 closes once all of these are true:
  - R25's pass has run on production, and `/admin/flags` has nothing pending.
  - An admin has read a Cora dry run after the pass (from R15).
  - R26 is merged.
  - The known emails are set.

  S14 does not wait for the pilots to sign up.
- R30. **Working rule for these branches** (refines R3 and the Key Decisions for this pass). Each branch goes through these steps in order:
  1. Rebase it onto `main`, so the schema it applies is never older than production's.
  2. Read the branch's `db/schema.sql` diff, then apply it to production without a separate yes. R25's change adds four columns (two for auto-admit, two for Remove from pool). R26's adds a column and two indexes, and drops the rule that a contributor links to one account only. Old code does not rely on that rule, but it cannot be put back once one account links two contributors.
  3. Merge, and wait for the Vercel deploy.
  4. Only then run the branch's production data write: dry run, Peter's yes, apply. These writes are the pilot emails (R26) and R25's one-time pass.

  This replaces the handoff's order for `feat/auto-admit-plays` (merge, then schema). That order would break intake and the Cora job until the columns exist.

## Success Criteria
- The published launch list has no checklist items and no Reference rows. Every removal is traceable to a commit that says where the item went.
- Each roadmap-bound item can be found by name in its destination plan.
- Production takes real card payments on live Stripe with the four monthly prices, the live webhook and HST, and sign-up is open.

## Scope Boundaries
- No building of the marketing site (other session), B2, A2 or B4 work.
- No new features beyond the R7 privacy behaviour (P3 idle erasure, P6 purge), R16 code removal, and R25 to R28, which Peter added on 2026-11-27 and 2026-11-28.
- The page chrome stays as Peter trimmed it. No headings, intros or footers get added back.

## Key Decisions
- Launch = A1 + B1. Anything else is moved off the list rather than finished.
- Claude merges green PRs. Production data changes and live Stripe writes wait for Peter's yes. R30 sets the order and the schema exception for the last item.
- Privacy defaults lean toward disclosure over new machinery, except two small retention jobs (P3, P6).

## Dependencies / Assumptions
- R11 waits for Peter to place the live secret key in Vercel Production.
- R15 and R16 wait for R19. R22 waits for R11, R13, R15 and R23.
- R22 ran on 2026-11-28 at 02:29 UTC with S14 still open. The pilot runs were imported; linking and the held plays remained (R25 to R29).
- Unverified: S4 is not on the current Reference tab. The accountant item may refer to a row already removed.

## Outstanding Questions

### Deferred to Planning
- [Affects R8][Needs research] Which model provider(s) the AI Gateway routes intake, merge and Fit to, and each one's stated training policy.
- [Affects R7][Technical] Where the P3 and P6 jobs run: in an existing cron or a new schedule.
- [Affects R24][Technical] Which plan files hold B2, A2 and B4 today, and whether a B4 plan exists yet.

## Next Steps
-> `/ce:plan` to sequence the work into lanes (decisions PR, Stripe live, preview checks, Peter's click-lists, go-live).
