# Site v1: acceptance record

November 26, 2026. Branch `feat/site-v1`, plan unit U10 (`docs/plans/2026-11-26-1218-feat-marketing-site-three-versions-plan.md`).

This file records each acceptance check for site version 1: what was done, the result and what was seen. The checks are A.16 of `artifacts/Roger v3 - design spec.md` and Part F of `artifacts/marketing-site-design-guide-roger.md`.

**Merging this branch into `main` makes v1 live on meetroger.ai. There is no separate go-live step.** Read "Resolve before merging" first.

## How the checks were run

- **Rendered text.** `src/lib/site/claims.test.tsx` renders every v1 page through the root layout and applies the claims and vocabulary rules in `src/lib/site/claims.ts`. It runs inside `npm test`.
- **Browser.** Headless Chrome, driven over the DevTools protocol by scripts kept outside the repo, against `npm run dev` on port 3280. Keys were sent as real key events (Tab, Shift+Tab, Enter, Space, Escape). No browser test tool was added (plan KTD16).
- **Three server runs.** (1) `SITE_VERSION=v1`, no database: every route at every width, and all the keyboard, motion, start-link, currency and header checks. (2) The default setting with a local stand-in database: testimonials, the whole free Zack run, layout shift. (3) Two production builds, served with `npm run start` on port 3281.
- **Routes.** `/`, `/agents`, `/pricing`, `/faq`, `/how-it-works`, `/about`, `/zack`, `/zack/claude`, `/zack/other`, `/library`, `/privacy`, `/terms`, `/getstarted` (the app's page, listed in the sitemap) and a not-found address.
- **Widths.** 375, 768, 1024, 1440 and 1920 pixels. Every route was loaded at every width: 70 loads.

Results are one of: **pass**, **fail**, **not applicable**, **not exercised** (with the reason).

## Resolve before merging, because merging goes live

Items 1 to 4 were the largest. Peter decided all four on November 26, 2026. What was decided and what was done is recorded once, in `docs/site/v1-copy-changes.md`, and each item below links to its section there. Items 5 to 10 are still Peter's to settle before the pull request is merged, and item 11 lists the smaller notes that remain from items 1 to 4. Later on November 26, 2026 Peter made five more decisions, which closed five of those notes: they are item 12, and are recorded in [copy changes 6.5](v1-copy-changes.md#65-five-more-decisions-of-november-26-2026).

1. **Resolved: the public Zack files match Zack 2.0.** See [copy changes 6.1](v1-copy-changes.md#61-resolved-the-public-zack-files-match-zack-20).
2. **Resolved: the site's wording follows the Zack 2.0 instructions.** See [copy changes 2.5](v1-copy-changes.md#25-what-zack-reads-skips-removes-and-sends), and [6.4](v1-copy-changes.md#64-what-the-accuracy-audit-of-the-privacy-and-terms-drafts-left-open) (a) and (b).
3. **Resolved: privacy and terms are reviewed**, and render without "Draft, under review." See [copy changes 6.3](v1-copy-changes.md#63-resolved-privacy-and-terms-are-reviewed).
4. **Resolved: a deleted account's shared plays say "unknown author".** See [copy changes 6.4](v1-copy-changes.md#64-what-the-accuracy-audit-of-the-privacy-and-terms-drafts-left-open) (c), which also has what code review added on November 26: the admin log no longer ties a deleted account to a seed contributor, and the hourly task changes nothing while the `users` table is empty.
5. **The sample play text** (plan R12; copy changes 2.2). The homepage, `/agents` and `/how-it-works` print one real play, cleaned. Peter approves the text, including that it names Claude.
6. **The one change to Peter's letter** (copy changes 2.1), and the letter edit the spec asks for. Until the edit arrives the pages show only the paragraphs still true.
7. **Production values the pages read** (the plan's go-live check). A preview uses a separate database, so nobody has seen v1 with production data. Before merging, check in production: the six `v3.*` prices against US$200 / US$200 / CA$280 / CA$280 / US$400 / CA$560; whether a sample play is chosen in the admin and reads cleanly (see "Open defects", item 6: the claims test cannot see it); which testimonials are cleared, and that each reads acceptably word for word; and the labels of the library's categories (item 7).
8. **Lesser copy items** (copy changes 6.2): "A compounding view of what you have set up" while the app's graph is planned for later; `/how-it-works` not saying sharing can be turned off; the free run's risks accepted in the plan (KTD12).
9. **The photograph and signature.** Neither file exists. The pages lay out without them (see "Sections absent for lack of data").
10. **The production Node version, for British Columbia clocks.** Raised with the Vancouver clock tests merged from `main`: the runtime's time zone data decides Vancouver times, so the Node version production runs on should be confirmed. Nothing in this unit touches it.
11. **What remains from items 1 to 4.** None of these blocks the checks. Each is in copy changes section 6.
    - **Three one-line summaries still say details are "removed"** (2.5): the homepage's second step, Sunday on `/how-it-works`, and the first step on `/agents`. The detailed answers beside them say "is instructed to". They are three strings if Peter wants them changed.
    - **Resolved: the warning above the paste box on `/zack`** now agrees with the privacy page. It keeps the spec's first sentence and then says "It may be read by Roger’s team and by Cora, Roger’s ranking agent. If you sign up, its plays are shared with other users in anonymous form." Changed in code review on November 26, 2026; Peter has not read the line itself. See [copy changes 2.5](v1-copy-changes.md#25-what-zack-reads-skips-removes-and-sends).
    - **The model provider's position on training is still to be stated** (6.3). The privacy page says it is being confirmed, and Peter confirmed the page with that sentence in it.
    - **The topics privacy and terms do not cover** (copy changes section 3) are kept as a reference list.
    - **A seed contributor's rows stay** when the account it was linked to is deleted (6.4 c). They name the hidden seed record, not the account, and the admin log's link rows for the deleted account no longer name that record.
    - **A play placed at the moment its account is deleted keeps the old id for up to an hour.** If Cora's merge commits a contributor row after the deleting statement has started, that statement does not see the row. The hourly `unknown_authors` task relabels it at its next pass; until then the privacy page's sentence is not true of that one row.
    - **The `retention` task still waits for the paid cycle and Stripe.** The hourly task that erases a departed user's runs (`retention` in `src/lib/housekeeping/job.ts`) runs only when `v3.cycleLive` is on and Stripe is set up, while `/privacy`, now shown without the draft note, states the period with no such condition. Three tasks run always (`expired_cleanup`, `free_run_purge`, `unknown_authors`); this one does not.
    - **Text published from the database is not read by the claims check.** Testimonials an admin clears, the library's rows and an admin-chosen sample play reach production pages without passing through `src/lib/site/claims.test.tsx`, which reads rendered fixtures only (see "Open defects", items 5 to 7, and item 7 above).
    - **The other app-side notes in 6.4 c that were not changed:** nothing clears the cached settings when a setting changes; shortening the retention setting applies to people who already left; "the first miss each billing month" is typed while the number is a setting; a free-list setting of 0 garbles the copy; a run's row is never fully removed while the account exists; the run history shows the newest 60 runs. And the three in 6.3 on the free Zack run: signing up with a different email attaches nothing and says nothing, a person who already has an account gets nothing attached, and run tokens would go to an analytics provider if analytics were ever switched on.
12. **Resolved: five more decisions, November 26, 2026.** What was decided and what was done is in [copy changes 6.5](v1-copy-changes.md#65-five-more-decisions-of-november-26-2026). Each closed a note that stood in item 11 or in the checks below.
    - **No Zack 2.0 copy has a Circles-era section.** "The 2.0 Zack source should not have circles-era section. Remove it from all copies." The collector section is gone from the four 2.0 source documents (`artifacts/Zack`) and the four connected instructions (`content/zack`), as it already was from the four public files. In its place the connected instructions say what happens to a run sent to Roger, in the privacy page's words.
    - **`/hampton`, `/rlp` and `/founders` are deleted, and `/zack` is the single address.** Each old address answers with a permanent redirect to `/zack`. No page tells a visitor to email a report any more. See check 3 below.
    - **The "has not been run" notice is gone from every copy.** "Version 2.0 and all future versions are being run on all accounts of all agents." The section "Not confirmed about <agent>" was removed from the Claude, Duet and Hark files in all three sets. The Grok Bot files never had it.
    - **The scroll story ends at 78 bricks.** The data held a fifth step (week 27, 81 bricks) that the page never showed. It is removed, so the data ends at week 26 with 78, as the page does.
    - **The brokerage's name is not used and not recorded.** "Do not use the brokerage name." The claims check keeps its rule and its empty list, by decision. See check 6 below.
    - **Resolved: the draft note is off the version line.** Peter approved the Zack 2.0 files on November 26, 2026, so "· Draft for Peter's approval" was removed from the version line of the four connected instructions and the four 2.0 source documents. The public files never carried it. The same note came off Cora's instructions (`content/cora/cora.md`) and the two documents in `artifacts/Cora` the same day, on Peter's word.
    - **The upload fallback was kept.** "If Zack cannot send the files, the member uploads the run file in their Roger dashboard" stands in the delivery section of all twelve files.

## A.16, check by check

| # | Check | Result |
|---|---|---|
| 1 | No header, footer, homepage or sitemap link to a Circles page or old offer; those URLs still load with noindex; `/apply` redirects | pass |
| 2 | With the version switched back, the Circles preview returns | not applicable now: see below |
| 3 | The unlisted pages render as before | pass for `/rlpsignature`; `/hampton`, `/rlp` and `/founders` were deleted afterwards by Peter's decision and redirect to `/zack`: see below |
| 4 | Every start button reaches `/start` with the right `path` and `cur` | pass |
| 5 | Price block: currency by country, choice kept in the tab, no bare "$", trial line under the price | pass |
| 6 | No user count, hard-coded number, brokerage name or income claim | pass, with the settled exceptions; the brokerage rule ships with an empty list, by Peter's decision of November 26, 2026 |
| 7 | Testimonials absent with none switched on, present with one, word for word | pass |
| 8 | Sample idea section absent until a play is chosen | settled exception: a bundled play shows |
| 9 | Monthly is the marked choice; no non-contributor plan | pass |
| 10 | "agent" never without "AI", outside `/agents` and `/zack` | pass after a fix on `/library`; one line on the app's `/getstarted` is open |
| 11 | Forms by keyboard; accordion and toggle expose state; nothing moves under reduced motion | pass; the two small items in shared styles and the `/library` fields were fixed on November 26 (see "Defects fixed", 3 and 4) |
| 12 | `npm run build` and `npm run lint` pass | pass |

### 1. No link to a Circles page or old offer

- **Did:** on every route at every width, collected every link whose address starts with `/apply`, `/setup`, `/companies`, `/packs/`, `/workshops`, `/refunds`, `/business`, `/families` or `/thanks`. Fetched each hidden address. Read `/sitemap.xml`.
- **Saw:** no such link on any of the 70 loads, in header, footer or page. `/setup`, `/companies`, `/packs/solopreneur`, `/workshops`, `/refunds` and `/thanks/work` each answer 200 with `<meta name="robots" content="noindex, nofollow">`. `/apply` answers 307 to `/start`. The sitemap lists exactly `/`, `/agents`, `/pricing`, `/how-it-works`, `/faq`, `/about`, `/zack`, `/library`, `/getstarted`, `/privacy`, `/terms`.
- **Also seen:** in development the hidden legacy pages `/setup`, `/companies` and `/packs/[id]` log a Next "URL data during prerendering" error on the server. They are older pages no v1 page links to; nothing was changed.

### 2. Switching back to Circles

Not applicable as written. On November 26 the owner decided that merging v1 replaces Circles outright, so `site.live` and `site.preview` are both `"v1"` and the Circles comparison test and its saved pages were removed. The Circles pages and components are still in the repo, and `SITE_VERSION=circles npm run dev` still serves them locally; that path keeps its own tests (`version.test.ts`, `robots.test.ts`, `sitemap.test.ts`, `legacy-site.test.tsx`). Going back in production is reverting the merge.

### 3. Unlisted pages

- **Did:** loaded `/hampton`, `/rlpsignature`, `/rlp` and `/founders` at 375 and 1440.
- **Saw:** each renders its own page (titles "Zack The Collector Page" and "Roger for RLP Signature"), with `noindex, nofollow, nocache`, no header links, no start button, no horizontal scroll and a clean console. `navFor` returning the same for these paths under Circles and v1 is a unit test (`site-header.test.ts`).
- **Not exercised:** `/for/[slug]`, which needs a slug from the database. A byte-for-byte comparison with the pages before this branch was not made.
- **Changed afterwards, November 26, 2026.** Peter decided: "Let's delete /hampton, /rlp and /founders and just use /zack as a single go to URL." The three routes are deleted. `/hampton`, `/rlp` and `/founders` each answer with a permanent redirect (308) to `/zack` (`next.config.ts`), so links already sent to people land on the free-run tool. They are no longer unlisted pages: `isUnlisted` in `src/components/site-header.tsx` now names only `/rlpsignature` and `/for/[slug]`, which keep the quiet header and footer. `/zack` has one meaning, the free-run picker; when the served site is Circles or the legacy site it is not found, as `/zack/[agent]` already was. Tests: `src/app/redirects.test.ts`, `site-header.test.ts`, and "under circles, /zack and /zack/claude are not found" in `zack.test.tsx`. What was seen on the served build is under check 12.

### 4. Start links

All in the browser, at 1440, each starting from a tab with nothing remembered.

| Step | Start links seen |
|---|---|
| (i) on `/` | header and page: `/start?path=re` |
| (i) on `/agents` | header and page: `/start?path=agents` |
| (ii) `/agents`, then `/pricing` by the header link (a client navigation) | `/start?path=agents` |
| (iii) choose CAD on `/pricing` | `/start?path=agents&cur=CAD` |
| (iii) then `/faq` by the header link | `/start?path=agents&cur=CAD` |
| then `/` | `/start?path=re&cur=CAD`: the page's own audience wins, and the price block there shows CA$280 |
| (iv) land on `/?utm_source=partner&utm_medium=email&utm_campaign=dec-1` | `/start?path=re&utm=partner%2Femail%2Fdec-1` |
| (iv) then `/pricing` | the same; `utm` appears once, with the value `partner/email/dec-1` |
| (v) click the start button | the address is `/start?path=re&utm=partner%2Femail%2Fdec-1`, title "Start · Roger", heading "Roger isn't open for sign-up yet.", console clean. Nothing was submitted |

With no script, the served HTML of `/agents` has `/start` in the header and `/start?path=agents` in the page, so the plain links work.

### 5. Price block

- **Currency by country.** Sent the header `x-vercel-ip-country` with each request. `CA`: CAD is pressed and the block shows "CA$280 / month CAD plus HST" and "CA$280 / list CAD plus HST" on `/`, `/agents` and `/pricing`. `US` and `GB`: USD is pressed and it shows "US$200 / month USD plus tax where it applies" and "US$200 / list USD plus tax where it applies". With no header (local), USD.
- **Choice kept.** From Canada, chose USD on `/pricing`: stays USD on `/` by a header link and on `/agents` by a full load in the same tab. The choice is in the tab's session storage.
- **No bare "$".** None in the visible text of any v1 page at any width, in either currency. `/library` has nine, all inside use-case rows (see "Open defects", item 5).
- **Trial line.** On `/pricing` the text runs "… One list, for one Monday. Your first two Monday lists are free. We ask for a card when …": directly after the prices, before the button.

### 6. Counts, numbers, the brokerage, income claims

- **Did:** the claims test, on every page, with and without testimonials and with a scored sample play; and a sweep of the visible text in the browser with the design guide's suggested pattern.
- **Saw:** zero violations in the test. In the browser the pattern's only hits on v1 pages are "Save a skill called …" in the sample play, which is on the allow-list. No "!" on any page.
- **The brokerage.** Decided by Peter on November 26, 2026: "Do not use the brokerage name." The name is not used on the site and is not recorded in the repo. The rule is "no word from a deny-list" and the list stays empty by that decision (`brokerages` in `ClaimsContext`), so this rule checks nothing, and nothing is waiting on Peter. A search of the site copy (`src/data/site`, `src/components/site`, `public/zack`, `content/zack`) for a brokerage or realty company name found none.
- Every digit on a page is explained by an allow-list entry. The entries and their reasons are in `src/lib/site/claims.ts`.

### 7. Testimonials

- **No data:** no "What people say" heading or wrapper on `/` or `/agents`.
- **With data:** put three made-up rows in the stand-in database: one cleared for real estate, one cleared for agent users, one not cleared. `/` shows "What people say" with exactly "“My agent drafts every listing email now. It saves me about 3 hours a week!”" then "Sample P. · Made-up attribution, for the acceptance run". `/agents` shows "“I stopped working this out alone.”" then "Sample Q." The uncleared row appears nowhere. No carousel control. No horizontal scroll at 375 or 1440.
- The quote above has "agent" without "AI", a time-saved figure and an exclamation mark, as a user's own words may. The claims rules allow that inside the quotation only: the test shows the same words fail anywhere else, and fail beside the quote in the attribution.

### 8. Sample idea section

Settled exception (plan Key Decision "The sample idea card shows a real play now", R11, KTD7): the section is never absent. A cleaned real play bundled with the site shows until one is chosen in the admin. An admin-chosen play replacing it is a unit test (`sample.test.ts`); it was not exercised in the browser.

### 9. Monthly marked; no non-contributor plan

"Most people choose this" appears once, on Monthly. The block names two plans: "Monthly" and "One list at a time". Monthly's price is set larger. The US$400 / CA$560 rate appears only in sentences about sharing being off or a second missed week, never as a plan.

### 10. "AI agent"

- **Found by the claims test:** `/library` said "agent" without "AI" in four places in Roger's own words. Fixed; see "Defects fixed".
- **After the fix:** in the browser, no bare "agent" on `/`, `/pricing`, `/faq`, `/about`, `/library`, `/privacy`, `/terms` or the not-found page. `/how-it-works` has one, inside the quoted line added to every playbook ("works for my agent system"), which is marked verbatim and listed for Peter in copy changes section 5.
- **Open:** `/getstarted` says "use your agent setup every day". It is the app's page. See "Open defects", item 1.
- **Found in code review afterwards:** `/watch/confirm`, reached from the library's watch email, said "someone’s agent". Fixed; see "Defects fixed", item 6. The browser pass above did not open the two watch pages.

### 11. Keyboard, state, reduced motion

**Skip link.** First Tab on `/` lands on "Skip to content", shown at the top left (144 by 40 pixels) with a ring. Enter moves to `#main`; the next Tab lands on the hero's start button, past the header.

**Tab order and focus.** At 1440 on `/pricing`: Skip to content, Roger, How it works, Pricing, Use cases, FAQ, About, Sign in, Get two free Monday lists, USD, CAD. The ring is a 2-pixel solid copper outline. Tabbed through every stop on all twelve v1 routes (18 to 70 stops each): every one is on screen, none sits under the sticky header, and every one shows a ring, except three fields on `/library`. The two watch-sentence fields were fixed afterwards (see "Defects fixed", item 3); the search field shows a dark border on focus, as before.

**Phone menu, at 375.** Tab order: Skip to content, Roger, Sign in, Start free, Open menu. The button has `aria-expanded="false"`. Enter: `aria-expanded="true"`, its name becomes "Close menu", and focus moves to "How it works". Tab runs How it works, Pricing, Use cases, FAQ, About, Sign in. Escape closes it and returns focus to the button. Space opens it again. Enter on "Pricing" goes to `/pricing` and the menu is closed.

**Currency toggle.** Two real `<button>` elements in a group labelled "Show prices in". Enter on CAD: `aria-pressed` becomes true on CAD and false on USD, and the prices change. Shift+Tab and Space on USD: back again.

**Accordion, `/faq`.** 18 questions in four groups (Getting started, Zack and privacy, Cora and the ideas, Price and billing). Tab reaches the first question. Enter opens it and the answer becomes visible; Space closes it. The browser's accessibility tree gives each question as a disclosure with `expanded: true` or `false`.

**Free Zack run, email step (no database).** Enter on "Run Zack on Claude" goes to `/zack/claude`. The field is `type="email"`, required, with the visible label "Email address". Enter with "not-an-email": the field gets `aria-invalid="true"`, is described by an inline error "Enter a valid email address.", keeps what was typed and keeps focus. A good address: the page says saving is not switched on, and keeps the address.

**Free Zack run, with the stand-in database, at 1440 and 375.** Reran the U8 script: 81 of 91 checks pass. By keyboard: email typed and submitted, the page address gains a run token, the instructions and paste box appear; an empty report gets "Paste your report first."; a report of 40,001 characters is refused with a message and stays in the box; a real report saves, the button shows "Saving…" meanwhile, focus moves to "Your top plays", and the one start button carries `path=agents` and the token; Tab reaches it and Enter opens `/start`. The warning line sits above the paste box, word for word. The 10 that did not pass are 5 expectations, each at two widths, that the script still holds from before later U8 decisions: it expects three play titles where the summary now lists four; an older wording of the inactive-link line; a claimed run left untouched, where the plan now resets it (KTD12, two checks); and a console with no warning, where the known `scroll-behavior` line appears. None is a defect.

**Copy buttons.** `/zack/claude`: Enter on "Copy" changes it to "Copied", announced in a live region, and the clipboard holds "Run Zack the Collector now from the attached file and create a .md output file." Homepage: Enter on "Copy prompt and playbook" gives "Copied", and the clipboard holds 3,071 characters starting with the playbook's first line. `/zack/other`: the field labelled "Your agent" is reached by Tab, and typing "Lindy" changes the prompt to "… works for Lindy".

**Other state.** Every element with `aria-pressed` on the site is a `<button>`. On `/library` the filters are buttons with `aria-pressed`, and all three fields have labels.

**Reduced motion.** With `prefers-reduced-motion: reduce`, at 1440 and 375:

- At load on `/`: 0 running animations; all 78 compounding bricks and all 4 labels shown; every hero brick, headline line and revealed element at full opacity with no transform. Unchanged 1.5 seconds later.
- Scrolling the whole page in 300-pixel steps: nothing changed at any step, 0 animations at any point.
- `/agents`, `/pricing`, `/faq`, `/how-it-works`, `/about`, `/zack`, `/zack/claude`, `/library`, `/privacy`, `/terms`: 0 running animations and nothing left hidden.
- `scroll-behavior` is `auto`. The accordion's plus sign has no transition.
- **Two things could still move,** both in shared base styles: a pressed button and a link's chevron on hover. Both were fixed afterwards: see "Defects fixed", item 4.

For comparison, with motion allowed: 75 animations run at load, the compounding bricks start hidden and arrive as the labels cross the middle of the screen (0, 1, 12, 48, 75, then 78 shown), and nothing is pinned.

### 12. Build and lint

`npm run lint`: 0 errors, 6 warnings, the baseline. `npx tsc --noEmit`: clean. `npm test`: 1,520 passed, 13 skipped. `npm run test:scenarios`: 23 passed. `npm run build`: passes.

Run again on November 26, 2026 after the work on Peter's four decisions and the three defects below: lint 0 errors and 6 warnings, `npx tsc --noEmit` clean, `npm test` 1,592 passed and 13 skipped (72 new tests), `npm run test:scenarios` 23 passed, `npm run build` passes.

Run a third time on November 26, 2026 after the last round of code-review fixes ("Defects fixed", items 6 and 7, and the deletion work in copy changes 6.4 c): lint 0 errors and 6 warnings, `npx tsc --noEmit` clean, `npm test` 1,607 passed and 13 skipped (15 new tests), `npm run test:scenarios` 23 passed, `npm run build` passes.

Run a fourth time on November 26, 2026 after the work on Peter's five further decisions (item 12 of "Resolve before merging"): lint 0 errors and 6 warnings, `npx tsc --noEmit` clean, `npm test` 1,634 passed and 13 skipped, `npm run test:scenarios` 23 passed, `npm run build` passes; its route list has no `/hampton`, `/rlp` or `/founders`. That build was then served with `npm run start` on port 3295, with no database, and fetched with curl (no browser):

| Address | Seen |
|---|---|
| `/hampton`, `/rlp`, `/founders` | each answers 308 Permanent Redirect with `location: /zack`; followed, `/zack` answers 200. A query string is carried over (`/hampton?utm_source=x` goes to `/zack?utm_source=x`) |
| `/zack` | 200, the picker: "Run Zack on yourself first", "Pick your agent" |
| `/zack/claude` | 200, "Run Zack on Claude", "Version 2.0", and the link to `/zack/zack-the-collector-claude.md` |
| `/zack/zack-the-collector-claude.md` | 200, byte for byte the file in `public/zack`: no "has not been run" notice, no "Not confirmed" section, no collector section; it ends with "Setting it up" |
| `/rlpsignature` | 200, title "Roger for RLP Signature", with its video |
| `/start/zack/claude` (the app's page, which shows `content/zack` to a person signing up) | 200, with the section "What happens to a run sent to Roger" and none of the old collector section or the notice |

### The pass after Peter's four decisions

November 26, 2026. Headless Chrome against `npm run dev` on port 3290, with no database, at 1440 wide. Each page was loaded once.

| Page | Seen |
|---|---|
| `/zack/claude` | "Run Zack on Claude". The file card says "Version 2.0". The saving-is-off line shows once before a submit and once after one, with no second message under the field; the email typed stays in the field. Console clean. |
| `/how-it-works` | "Zack, in detail" carries the new wording for what he reads, what he never reads and what he removes. The four file links are there; `/zack/zack-the-collector-claude.md` answers 200 with the updated file: it has the public-copy line and the section on a report pasted at `/zack`, has no collector section, and its version line reads "Version 2.0 · November 22, 2026 · Roger (meetroger.ai)". Console clean. |
| `/faq` | "What does Zack read?" and "What leaves my account?" carry the new answers. Console clean. |
| `/privacy` | No "Draft, under review." and no note element. The sentence "When your account is deleted, that record is changed to say “unknown author”." is on the page, and so is the sentence that the model provider's position on training is being confirmed. Console clean. |
| `/terms` | No "Draft, under review." and no note element. Console clean. |
| `/library` | Tab reaches both watch-sentence fields; each shows a 2-pixel solid copper outline, 3 pixels off the field. Console clean. |

"Console clean" means only the development build's own lines: the React DevTools notice and the hot-reload connection.

With `prefers-reduced-motion: reduce` on `/`: hovering "See how it works" leaves its chevron with no transform, and a pressed "Get two free Monday lists" has no transform. With motion allowed, the pressed button is scaled to 0.98.

## Part F, item by item

Items that restate an A.16 check point to it.

| Item | Result | Evidence |
|---|---|---|
| Build and lint pass | pass | A.16 check 12 |
| Keyboard: every form, toggle, accordion | pass | check 11 |
| The pull-out sheet works by keyboard, traps focus, closes on Escape | not applicable | The public sample card is inline and has no sheet (plan KTD6). The homepage has no `dialog` or modal element |
| Toggles are buttons with `aria-pressed`; accordion and toggle expose state | pass | check 11 |
| Every form field has a visible label and an inline error | pass | `/zack` email, paste and agent-name fields; `/library` fields have labels. The library's watch form shows its error under the sentence |
| Skip link, visible focus, contrast kept | pass | check 11; contrast below; the `/library` watch fields were fixed afterwards ("Defects fixed", item 3) |
| Nothing moves under reduced motion | pass | check 11; the pressed button and the chevron were fixed afterwards ("Defects fixed", item 4) |
| Five widths | pass | No horizontal scroll on any of the 70 loads: the document is never wider than the viewport, and no element sticks out to the right unclipped |
| No income claims, counts, numbers, brokerage; monthly marked; wording rule | pass | checks 6, 9, 10 |
| No link to a Circles page; `/apply` redirects | pass | check 1 |
| Sitemap lists the eleven paths; robots disallows the hidden paths, `/app`, `/admin`, `/start`, `/api` | pass, with a settled exception | check 1. Robots, production rules: allows `/` and `/api/zack/instructions`; disallows `/thanks/`, `/for/`, `/apply`, `/setup`, `/companies`, `/packs/`, `/workshops`, `/refunds`, `/app/`, `/app$`, `/admin`, `/start`, `/api`. Local development shows these production rules, because only a Vercel preview disallows everything |
| Unlisted partner pages unchanged | pass for `/rlpsignature`; three deleted by decision | check 3. `/hampton`, `/rlp` and `/founders` now redirect to `/zack` |
| `/about` lays out without the photograph and signature | pass | No image element, no empty frame; the name is typed. No broken image on any page |
| Testimonials and sample card absent, not empty boxes | pass / settled exception | checks 7 and 8 |
| `/zack` paste-back: limits, cap, warning line | pass, with a settled exception | Cap is 40,000, exercised at 40,001. Warning line above the box. The rate limits are unit tests (`actions.test.ts`); they were not driven to their limit in the browser |
| Price block: country default, choice kept, set prices, no bare "$" | pass | check 5 |
| Screenshots compared with approved mockups | not applicable | v1 has no mockups; that is v3's process |
| Sections re-checked after a port from a prototype | not applicable | v1 was not ported from a prototype |
| Brick animation frame rate on laptop and phone; its size | not exercised | Needs real devices. The story uses no animation library (KTD11) |
| Tuning jig absent from production | not applicable | v3 only |
| Data palette 3:1 on ground, surface and night; text AA | pass | Computed from the tokens. Bars and bricks on ground: hours 3.98, reach 5.45, ease 4.43, proof 6.03, surprise 5.11; on ground-2 the lowest is hours at 3.71. Night values on night: 7.41 to 9.00. Text: ink on ground 16.28, second ink on ground 6.33 and on ground-2 5.90, night ink 17.95, second night ink 7.80, copper on ground 5.63, white on copper 5.82 |
| Image dimensions, fonts preloaded, no layout shift | pass after a fix | No images on v1 pages (no photograph yet). Mona Sans loads with one preload. Layout shift is 0 on every route and width after the fix to `/zack/[agent]` (see "Defects fixed") |
| Social card updated, no numbers or claims | pass by test, not fetched | `version-pages.test.tsx` holds the card's words to the headline with no digit. The image itself was not opened in this pass |

**Console.** Clean on every v1 route at every width. Lines seen, all known or not the site's:

- `Failed to load resource: 404` on a not-found address: the browser reporting the page's own status.
- `Encountered a script tag while rendering React component` on a dynamic route's not-found (`/zack/nope`). Known.
- `Detected scroll-behavior: smooth on the <html> element` on some client navigations. Known.
- Nothing else.

**Signed-in header.** Set only the hint cookie `roger-in=1`. At 1440 "Sign in" and the start button are replaced by "Open Roger" to `/app`; the navigation's right edge stays at the same pixel (945) so nothing shifts; the hidden pair is `visibility: hidden` and out of the tab order (Tab goes About, Open Roger, USD). At 375 the header shows "Open Roger" and the menu's last row is "Open Roger". `/start` and `/signin` have no header links or button.

## Defects fixed in this unit

1. **`/library` said "agent" without "AI"** (A.16 check 10), found by the claims test. Four places in Roger's own words: the intro ("real things people's agents did"), the watch sentence's label ("the morning someone's agent can"), the line under it, and the label "Any agent" on a row that names no tool. Under a site version they now say "AI agents", "AI agent" and "Any AI agent". Files: `src/app/library/page.tsx`, `src/components/home/watch-sentence.tsx`, `src/components/use-case-card.tsx`, `src/components/library-browser.tsx`. The last three are shared library components, outside `src/components/site`; each takes the word as an optional prop whose default is the old wording. Test: "holds /library's own words to the vocabulary rule" in `claims.test.tsx`.
2. **The footer jumped on `/zack/[agent]`.** The steps stream in after the heading; at 1920 wide the footer was on screen and moved when they arrived (layout shift 0.5 with no database, 0.09 with one). The steps' column now keeps 70% of the screen's height from the start. Measured after: 0 on `/zack`, `/zack/claude` and `/zack/other` at all five widths. File: `src/components/site/v1/zack.tsx`. Test: "holds the steps' column to most of a screen" in `zack.test.tsx`.

Fixed on November 26, 2026, after the acceptance pass. Each was listed under "Open defects" until then.

3. **Two `/library` fields showed focus only as a faint change of background** (was open defect 3). The watch sentence's "you@example.com" and "book a table" fields carried `outline-none` beside the classes that asked for an outline on focus, and it switched the outline off. The outline classes were removed, so the fields take the site's own focus ring. Seen in the browser: Tab to either field and it shows a 2-pixel solid copper outline, 3 pixels off the field. File: `src/components/home/watch-sentence.tsx`. Test: "leaves the watch sentence's two fields their focus ring" in `claims.test.tsx`. The search field on the same page was not changed: it shows a dark border on focus.
4. **Two small movements ignored reduced motion** (was open defect 2). `.btn:active` scaled a pressed button to 0.98, and `.chev:hover::after` moved a link's chevron 2 pixels. Both rules are now inside `@media (prefers-reduced-motion: no-preference)`, the convention the rest of `src/app/globals.css` uses, so with motion allowed they behave as before. Seen in the browser with reduced motion: a pressed button and a hovered chevron have no transform. The rules are shared with the app's buttons, which get the same fix. Test: "shrink a pressed button and nudge a link's chevron only where motion is allowed" in `home.test.tsx`.
5. **The saving-is-off message showed twice on `/zack/[agent]` with no database** (was open defect 8): once as the standing line and again under the field after a submit. The email form is now told which message the page already shows above it, and does not print the same words again. Seen in the browser: one line before a submit and one after. Files: `src/components/site/shared/free-run-form.tsx`, `src/components/site/v1/zack.tsx`. Test: "does not print the action's message a second time" in `zack.test.tsx`.

Fixed in the last round of code review, November 26, 2026. Verified by tests; not opened in a browser.

6. **The two pages the library's watch email leads to kept the old wording and a wrong link** (A.16 check 10). `/watch/confirm` said "the day someone’s agent does", and both it and `/watch/stop` ended on "Back to the library" linked to `/`, which under a site version is the homepage. Under a site version the confirm page now says "AI agent" and both links go to `/library`; Circles and the legacy site keep what they had. Both routes are in the claims check's route list, rendered once with a link that no longer works and once with one that finds its watch. Files: `src/app/watch/confirm/page.tsx`, `src/app/watch/stop/page.tsx`, `src/test-helpers/site-pages.tsx`. Test: "holds the two pages the library’s watch email leads to" in `claims.test.tsx`.
7. **A run token in the address of `/zack/[agent]` could be passed on as a referrer.** With a token in its address the page now sets its referrer policy to `no-referrer`, as `/auth/confirm` does for its own token. Without a token the page sets none. File: `src/app/zack/[agent]/page.tsx`. Test: "is open to search, and kept out once its address carries a run token" in `zack.test.tsx`.

## Open defects

None blocks the checks above. Each is outside the marketing files, or is a decision. The numbers are the ones the items had before three of them were fixed (2, 3 and 8, now under "Defects fixed"), so references elsewhere in this file still point to the right item.

1. **`/getstarted` says "agent" without "AI".** Open `/getstarted`; the text includes "use your agent setup every day". It is the app's page (spec A.2) and is in the sitemap, so check 10 covers it. Not changed: app file.
4. **After a click from a marketing page to `/start`, the page left behind is still in the document, hidden.** Open `/pricing`, click a start button, then look for `[data-site]`: one element, inside a `display: none` wrapper. A full load of `/start` has none. Nothing in v1 depends on it. It matters for v2: plan KTD13 keys v2's look on `html:has([data-site="v2"])`, and that selector would match on `/start` after such a click. U12 must use the fallback KTD13 names.
5. **`/library` rows carry dollar amounts and time figures.** For example "$650 saved in four weeks" and "2–3 hours saved weekly". They are summaries of named people's public posts, read from the database, on a page that says "None of them are Roger clients", and the spec keeps the library as it is (A.12). The claims check treats each row as a public use case and reads only the page's own words. Whether such figures belong on a Roger page is Peter's call.
6. **A play chosen in the admin is not covered by the claims test.** The test can only render the bundled play. The made-up seed play (`db/seeds/sample-play.fixture.json`) says "the agent reads yesterday's buyer inquiries", which would break check 10 on the homepage; a test shows the rules catch it. A real choice is read before merging (item 7 of "Resolve before merging").
7. **A library category is labelled "Real Estate Agents".** It is a filter on `/library` that shows once a use case is filed under it; none is in the bundled data. On a site whose rule exists because readers are also called agents, the label would read correctly but would trip the vocabulary sweep. Check the production library.

## Sections absent for lack of data

| Section | State now | What shows instead |
|---|---|---|
| Testimonials ("What people say") on `/` and `/agents` | No quote is cleared, so the section is absent: no heading, no wrapper | Nothing. The neighbouring sections close up, and night and ground still alternate |
| Peter's photograph on `/` ("Who runs this") and `/about` | `siteConfig.founder.photo` is empty | The text column alone, centred, with no image element and no frame |
| Peter's signature on `/about` | `siteConfig.founder.signature` is empty | His name, typed |
| The letter's later paragraphs | They mention Circles and applications | Only the paragraphs still true: three on the homepage, and those plus the greeting and sign-off on `/about` |
| A sample play chosen in the admin | None chosen; a preview's database has none | The bundled cleaned play, "Client email in two tones", with no score section because it has no scores |
| The weekly group session line on `/pricing` | That part of the product is not live | Left out of "What is included" |

## Settled exceptions to the spec's checks

| Exception | Decision |
|---|---|
| "It compounds" prints week numbers and brick counts (Week 1, 2, 3 and 26; 3, 6, 9 and 78 bricks), against "no hard-coded numbers" | Plan Key Decision "The compounding section is animated in all three, with week labels and brick counts"; R10. The claims check allows these numbers inside that section only. The story ends at 78 bricks (Peter, November 26, 2026): the data no longer holds a week 27 or an 81, and the claims check no longer allows them |
| The section is a scroll story, where the spec says a static picture | The same Key Decision; KTD11. Under reduced motion it is the finished picture |
| The free Zack run accepts 40,000 characters, not 20,000 | Copy changes 6.2: ten of thirteen real reports are longer than 20,000. One constant, `FREE_RUN_REPORT_CHARS` |
| `robots.txt` allows `/api/zack/instructions` while disallowing `/api` | Copy changes section 4: a user's own AI agent fetches that address during Zack setup, and many fetch tools obey robots |
| One list costs US$200 / CA$280, not US$100 / CA$140 | Plan Key Decision "Single list is US$200 / CA$280"; R8 |
| The higher rate and the one-list price are given in both currencies where the spec gives US dollars alone | Copy changes 2.3 |
| The sample idea shows before any play is chosen in the admin | Plan Key Decision "The sample idea card shows a real play now"; R11 |

## What each environment serves

`siteConfig.site.live` and `siteConfig.site.preview` are both `"v1"`. The resolver in `src/lib/site/version.ts` is unchanged: production serves `live` and ignores `SITE_VERSION`; elsewhere a valid `SITE_VERSION` wins.

| Surface | Plain `npm run build` (no `VERCEL_ENV`), served on 3281 | Build with `VERCEL_ENV=preview`, served on 3281 |
|---|---|---|
| `/` | v1 home, "Your AI agents, smarter every Monday." | the same |
| `/pricing`, `/agents`, `/faq`, `/how-it-works`, `/about` | 200, the v1 pages | the same |
| `/zack` | 200, the free-run picker, "Run Zack on yourself first" | the same |
| `/zack/claude` | 200, "Run Zack on Claude" | the same |
| `/library`, `/privacy`, `/terms` | 200, with the v1 band and the v1 privacy and terms (they showed the draft note when this table was made; since Peter's review on November 26 they do not) | the same |
| `/apply` | 307 to `/start` | the same |
| `/sitemap.xml` | the eleven paths | the same |
| `/robots.txt` | the v1 production rules listed under Part F | `Disallow: /` and nothing else |
| `/site-preview/blocks` (the builder's preview page) | 404 | 200, noindex |
| A not-found address | 404, the v1 not-found page, noindex | the same |

`.next` was left as the plain build. `/site-preview/blocks` is the only development-only page the site work added; its test (`src/app/site-preview/blocks/page.test.tsx`) holds it to not-found on Vercel production and on a production build with no `VERCEL_ENV`.

## After v1 is live: cleanup

None of this is needed for the merge. It is what the code review of November 26, 2026 found that only exists because Circles is still in the repo. Do it in one change once v1 is live and nobody needs `SITE_VERSION=circles` locally. Going back to Circles after it means restoring files as well as reverting the merge.

**Delete**

- **Already removed on November 26, 2026, with Peter's decision to delete `/hampton`, `/rlp` and `/founders`:** the three routes (`src/app/hampton`, `src/app/rlp`, `src/app/founders`); the Circles arm of `/zack`, which rendered the Hampton page; `src/components/circles/zack-page.tsx`, which nothing imported; the `site` argument of `isUnlisted` and `footerFor`, and the `site` prop of `FooterSwitch`. `/zack` is now gated like the other new routes, so it is in the `requireBuiltVersion` list below.
- **The Circles pages and components:** `src/components/circles` (`home.tsx`, `agents.tsx`, `price.tsx`, `proof.tsx`), `src/data/circles-legal.ts`, the "Run Zack" link in the Circles header (`circles` in `src/components/site-header.tsx`), which leads to a not-found page when Circles is served locally, and the Circles arms of the routes that branch on the served site: `/`, `/library`, `/privacy`, `/terms`, `/apply`, the root layout, the header, the footer, `robots.ts` and `sitemap.ts`. Decide with it what becomes of the hidden legacy pages (`/setup`, `/companies`, `/packs/[id]`, `/workshops`, `/refunds`, `/thanks`), which still answer 200 with noindex.
- **The `circlesMode` flag and the "legacy" site variant.** `flags.circlesMode` in `src/data/config.ts` is always true, so no environment reaches "legacy": only a source edit does. Remove the flag, `"legacy"` from `ServedSite`, the `legacy` key of `bySite` and its callers, the legacy arms in the footer, header, layout, library and robots, and the whole of `src/lib/site/legacy-site.test.tsx`. `hiddenLegacyRobots` then always returns noindex and can be a constant.
- **The `requireBuiltVersion` gates and the literal `export const instant = false`** on `/pricing`, `/faq`, `/how-it-works`, `/about`, `/agents`, `/zack` and `/zack/[agent]`, with the not-built branch of `builtPageMetadata` in `src/lib/site/chrome.ts` and of `generateMetadata` on `/zack/[agent]`. The gate fires only under Circles or the legacy site. Keep `instant = false` wherever a route needs it for another reason (`/apply` has one of its own). **Confirm with `npm run build`:** the review could not tell whether the build accepts these routes without the export.

**Tests that pin output only Circles serves.** Delete each with the code it covers.

- `src/app/robots.test.ts`: "keeps the Circles disallow list in production". This file and `src/app/sitemap.test.ts` also default to `site = "circles"`, so their general production tests run against Circles; point them at v1.
- `src/app/sitemap.test.ts`: "lists exactly /, /library, /privacy and /terms under Circles".
- `src/components/site/v1/home.test.tsx`: "is unchanged under Circles".
- `src/app/not-found.test.tsx`: "is unchanged under Circles and on the legacy site".
- `src/app/agents/page.test.tsx` and `src/app/reading-pages.test.tsx`: "is not found when the version is Circles (covers AE8)".
- `src/components/site-header.test.ts`: "leaves other Circles pages alone, including /apply", "treats /zack as any other page under Circles and the legacy site, where the route is not found", and the Circles half of "is the same under Circles and under a version for the app, the admin and the unlisted pages".
- `src/components/site-header.signed-in.test.tsx`: "has no account row under Circles, signed in or not".
- `src/components/site/v1/zack.test.tsx`: the two tests "under circles …" and "under legacy, /zack and /zack/claude are not found".
- `src/lib/site/version.test.ts`: "serves the legacy site when Circles resolves with circlesMode off", "tells a built version from Circles and the legacy site" and "is not found while Circles or the legacy site is served".
- `src/lib/site/legacy-site.test.tsx`: the whole file.

**Two tests that will fail outright when the Circles files go.** Rewrite them first.

- `src/components/site/shared/currency-store.test.ts`, "the Circles price block": it reads `src/components/circles/price.tsx` from disk.
- `src/data/site/legal.test.ts`: it imports `circlesPrivacyPreview` from `@/data/circles-legal` to hold v1's kept privacy passages word for word against the Circles text. Keep the passages' wording in the test, or in a fixture, before the import goes.

**Rename, in the same change and not before, so the names change once**

- `isBuiltVersion`, `requireBuiltVersion` and the type `BuiltVersion` in `src/lib/site/version.ts`. They read as the special case, and a built version will be the only case served. The comment on `SiteVersion` ("The Circles preview, or a site version") goes with them.

**Keep.** The `live` and `preview` fields, the `SITE_VERSION` override and `isKnownNonProduction` are how a v2 branch is previewed while v1 stays live, and what keeps `/site-preview/blocks` out of production.

## How to view v1

- **Preview.** The preview deployment of branch `feat/site-v1` shows v1 once this unit is pushed. It uses a separate database, so it shows no testimonials and the bundled sample play. Its robots file disallows everything.
- **Locally.** `npm run dev`. To see the Circles pages that are still in the repo: `SITE_VERSION=circles npm run dev`.
- **Going live.** Merging the pull request into `main` makes v1 live on meetroger.ai. There is no separate switch.
- **Going back.** Revert the merge.
