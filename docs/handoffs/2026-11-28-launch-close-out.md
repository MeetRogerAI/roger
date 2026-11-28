# Handoff: Roger v3 launch close-out, 2026-11-28

**To resume:** open Claude Code in `C:\Users\pkupe\Aardvark\roger` and say: *"Read docs/handoffs/2026-11-28-launch-close-out.md and pick up where it left off."*

## Where things stand

- **Roger v3 is live.** On production (meetroger.ai), `v3.cycleLive` and `v3.signupOpen` are on (since 2026-11-28 02:29 UTC).
  - Live Stripe is set up: products, four prices, webhook, HST registration and settings.
  - The shared admin password is removed. Admins sign in by email link only.
- **The launch list** (`artifacts/launch-list.html`, published at https://claude.ai/artifact/PvCLU9uLcV2abfxwNqd7tE, version 22) has **one item left**: `g-pilot-runs` / `S14`.
  - All 18 pilot runs are imported on production: 26 plays are in the pool and 38 are held at `/admin/flags`.
  - The 38 are resolved by Work item 1 below, and the pilots are linked by Work item 2.
  - When both are done and run on production, remove `g-pilot-runs` and `S14`. The list is then empty.
  - Follow the list's own rules in its header comment: commit and push, republish to the same URL, delete `checks` docs.
- **Plan and requirements:**
  - `docs/plans/2026-11-27-002-feat-v3-launch-close-out-plan.md`
  - `docs/brainstorms/2026-11-27-v3-launch-close-out-requirements.md`

## Work in progress: three branches, all pushed to GitHub, none merged

Each branch also has a local worktree. Treat the local copies as disposable: the pushed branch is the source of truth.

### 1. `feat/auto-admit-plays` (worktree `../roger-auto-admit`)

Peter's decision, 2026-11-27: there is no manual flag review. Every shared play is admitted automatically with a safeguard; harm is dropped.

**Rules:**
- **Quality** ("playbook could not be found"): the model drafts the setup steps, and the play is marked `playbook_drafted`. The playbook starts with "Setup steps drafted by Roger…". If drafting fails, the play is admitted as outline-only.
- **Privacy** (unclear name or "Zack marked it sensitive"): the text is redacted to placeholders, or the play becomes outline-only. Then it is admitted.
- **Harm** (link, hidden text, "could harm whoever runs it"): the play is **dropped automatically** and logged, never queued.
- **Safeguard preamble:** one constant, in `src/lib/cora/safeguard.ts`. It is shown once at the top of each list's install section and in every play's paste-to-install text.
- **Cora ranking:** a small `DRAFTED_PENALTY` (`src/lib/cora/score.ts`) for drafted playbooks.
- **`/admin/flags`:** a read-only log of what was auto-fixed or dropped. Edit stays; Approve and Reject go.
- **Schema:** `plays.auto_fixed jsonb` and `pool_plays.playbook_drafted boolean`.
- **One-time pass:** `scripts/auto-admit-held.ts` (dry run by default, `--yes` to apply) applies the rules to the plays already held.

**State:** 2 commits (`3a4735b`, `e3994cb`). The code is written. **The full suite never completed**, because the runner crashed from machine load (see the gotchas). The subagent was in the middle of the Cora score tests and verification.

**To finish:**
1. Run the full suite on a quiet machine and fix anything that fails.
2. Review it. This change is the safety boundary for code that other members' agents run, so use the security and adversarial reviewers. Check the drafting prompt cannot be steered by the run text.
3. Merge.
4. Apply the schema on production (below), then run the one-time pass against production, first as a dry run and then with `--yes`.
5. Confirm `/admin/flags` shows nothing pending.

### 2. `feat/auto-link-pilots` (worktree `../roger-auto-link`)

Seed contributors get an optional email. Every contributor with that email links to the account:
- at sign-up (the `/start` link, Google or a pilot link);
- when the email is set and the account already exists;
- on an email change.

One email can cover several contributors, and one account can link several. Admin addresses can be linked. Cora excludes the linked person's own seed plays. Emails are set at `/admin/cora` under **"Seed contributors"**, and the seed import takes `--email`.

**Schema:** `seed_contributors.email`, an index on `lower(email)`, and the `unique` constraint on `seed_contributors.user_id` is dropped.

**State:** 2 commits (`3dc8710`, `635e5c7`), finished. The subagent's full run passed apart from 10 timeouts under load, and those files pass alone. My rerun crashed from machine load, so **it still needs one clean full-suite run.**

**To finish:**
1. Run the full suite cleanly, then merge.
2. Apply the schema on production **before** the code deploys.
3. Set the pilot emails at `/admin/cora` from the private list in **`.context/pilot-emails.md`**. That file is in the main checkout and is git-ignored, so the emails stay out of the public repo.

### 3. `feat/admins-are-members` (worktree `../roger-admin-member`)

Peter: "admins should have all member actions, and then also have additional actions."

**Removed:** the admin-address exclusions on member features: pilot links, Google sign-in, the settings page Google option, and the sign-in page and Google callback.

**Kept, deliberately:**
- Admin *powers* need an email-link session. A Google or pilot session is never admin.
- One admin cannot close, delete or change the email of *another* admin's account from `/admin`. Each can still do these to their own account through the member pages.
- The analytics exclusions and the admin alert recipients.

**State:** one WIP commit (`dc48e8b`), **untested**, stopped mid-way through its tests.

**To finish:**
1. Review the diff against the brief above.
2. Check every `adminEmails`, `isAdminAddress` and `admin_address` use (`git grep`). Make sure an admin's own cancel, close and delete work through the member paths.
3. Finish the tests, run the full suite, review (security: sessions), merge.

**Merge order:** 2, then 1, then 3. Branches 2 and 3 both touch `src/lib/signup/pilot.ts` and `src/lib/auth/google.ts`, so rebase 3 onto `main` after 2 merges and resolve.

## Applying a schema change on production

`db/setup.mjs` applies `db/schema.sql`, which is idempotent.

1. Pull the production env to a scratch file: `vercel env pull <scratch>/prod.env --environment=production --yes`. `DATABASE_URL` is a plain config value, not sensitive.
2. Run `db/setup.mjs` with that `DATABASE_URL`. Read setup.mjs first for how it takes the URL.
3. **Delete the scratch file afterwards.**

The production database is Neon `ep-flat-tooth-b7nss1xj`.

## Gotchas learned this session (read before doing anything)

1. **`.env.local` in the main checkout points at the PRODUCTION database** (`ep-flat-tooth-b7nss1xj`). Never run the dev server or a script locally with it unless you mean to change production. The vitest suite uses in-process PGlite and is safe. Peter should repoint local development to a separate Neon branch.
2. **Never `git worktree remove --force` a worktree whose `node_modules` is a junction.** It deletes the shared packages through the link; this happened once and was repaired with `npm install`. First run `(Get-Item <wt>\node_modules).Delete()` in PowerShell, which removes only the link. The memory file `worktree-junction-delete-hazard.md` says the same.
3. **Don't run several full suites at once.** Three parallel `vitest run`s crashed the worker pool ("Channel closed") or caused timeouts. Run one at a time.
4. **The live Stripe key is a sensitive Vercel variable,** so it can't be pulled back. Anything that needs live Stripe has to run on Vercel, or Peter runs it in his own terminal (see how `scripts/stripe-live-setup.ts` was run).
5. **preview.meetroger.ai serves the `preview` branch** (site-v2 and admin-cms), which is about 68 commits behind `main`. To check `main` code, use a branch deployment (`roger-git-<branch>-helix3.vercel.app`).
6. **Other sessions share this checkout and switch its branch.** Work in a worktree off `origin/main` (memory: `shared-checkout-use-worktree.md`).

## Open items outside the launch list

- **Peter:** merge `feat/site-v1` (planned for the morning of 2026-11-28).
- **Peter:** delete the one-off Stripe key "Roger setup (one-off, delete after)", if not already done, and delete `drive-download-20261128T023254Z-1-001.zip` from Downloads.
- **Watch the first live Monday, Nov 30:** the first lists and charges; the first Canadian live invoice should show HST 13% as its own line; the first real Zack run should reach `/app/zack` and `/admin/runs` within a minute. Watch the first renewal invoice about a month later.
- **Not urgent:** should members get an email before an idle account's runs are erased (privacy P3)? Nothing can be erased before 2027-11-27.
- **Tidy-ups:** `APP_URL` is unset on Preview, so sign-in links go to the vercel.app address. The `preview` branch is stale.
