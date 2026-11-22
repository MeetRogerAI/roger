# Roger v3: design and build spec for meetroger.ai

Version 1.1 · November 21, 2026 · Owner: Peter Kuperman · Repo: `MeetRogerAI/roger` (branch from `main`)

**What this is.** A spec to hand to Claude Code. It replaces the Circles spec (`artifacts/Circles/Roger (CTA Circles) - design spec.md`, version 0.6) and turns meetroger.ai into the v3 product: a free trial, two ways to pay (monthly, or one list at a time), and a weekly cycle that sends each user three ideas every Monday. Strategy source: `artifacts/v3/strategy/Roger-Strategy-v3.1.md`. Decisions source: the design interview with Peter on November 21, 2026.

**Two builders, two parts.**

| Part | Who reads it | What it covers |
|---|---|---|
| Part 0 | Both builders | Product, decisions, claims, codebase, ownership, design system, shared rules |
| Part A | The marketing-site builder | Every public page, its copy, and its checks |
| Part B | The app builder | Sign-up, accounts, billing, Zack, Cora, the dashboard, the admin, and their checks |

**Which document wins.** Where this spec and the strategy disagree, this spec wins; section 0.3 lists every difference. Where this spec is silent, the strategy applies. Layout is the builder's decision inside the design system in section 0.7.

**Labels.** "Decided" means Peter stated or approved it. "Default" means chosen here to fill a gap and easy to change. Sizes are in half-days of build, before review and testing, and are estimates.

**What changed in 1.1** (Peter's decisions on November 21, after reading 1.0):

- Single lists are sold again. After the two free lists a user chooses US$200 a month, presented as the clear pick, or US$100 for one list at a time.
- No non-contributor plan is offered on the site or at sign-up. Everyone starts as a contributor. The US$400 monthly rate remains only as what happens after two missed weeks in a month, or when a user switches sharing off in the dashboard.
- The à la carte demand link is gone, because single lists are now a real product.
- A one-at-a-time list is ordered, never charged automatically (B.9).
- On the other eight differences with the strategy, this spec stands. The strategy file has been updated to match (0.3).

---

# Part 0. Shared context

## 0.1 The product in one paragraph

Roger makes each user's AI agents better every week. An agent called Zack runs inside the user's own agent account each Sunday and writes up the week's most useful work as "plays", with private details removed. Roger pools the plays from every contributing user. Early Monday, an agent called Cora picks the three plays most worth adopting for each user and sends them, each with a playbook the user pastes into their own agent to install. New users get two free Monday lists and add a card when they start. After that they choose US$200 a month, which is presented as the clear pick, or US$100 for one list at a time.

## 0.2 Decisions

| Topic | Decision |
|---|---|
| What is sold | Two ways to buy after the trial: US$200 a month, presented as the clear pick, or US$100 for one list at a time, ordered when wanted. |
| Prices | US$200 a month or US$100 a list. CA$280 a month or CA$140 a list. Set prices, not live conversion. |
| The higher rate | No non-contributor plan is offered on the site or at sign-up; everyone starts as a contributor. A monthly rate of US$400 (CA$560) applies only after two missed weeks in a month, or when a user switches sharing off in the dashboard. |
| Sales tax | HST and other applicable tax is charged from this build onward. Prices are shown before tax. |
| Free trial | Two delivered Cora lists are free. A card is collected at sign-up. Monthly users are charged with the third list. One-at-a-time users are charged only when they order a list. |
| What counts as a free run | Only a list actually delivered. A trial with no first list within 21 days of sign-up closes without a charge. |
| Refunds | None. Cancel any time in one click. |
| Zack | Runs automatically each Sunday under standing consent given at sign-up, and sends its report to Roger. The user can turn sharing off in the dashboard, which moves a monthly user to the higher rate. |
| Zack transparency | A signed-in user can read every line of the instructions their Zack runs and change what it collects, using switches, lists, and one free-text box for extra rules. |
| Users with sharing off | Cora matches them from a private Zack run ("matching only", never pooled) when Zack is on, and from their sign-up profile when Zack is off. |
| What a user sees on Monday | Three ideas only. Cora's tiers and the full pool stay internal. |
| Contributor rule | For monthly users. One missed week per billing month is forgiven. A second miss makes that month US$400; the difference goes on the next invoice. A miss caused by Roger never counts. Users are told at every step (B.9). |
| Referral credit | A referrer earns a credit equal to the referred user's first payment at list price (one month, or one list), in the referrer's own currency, when that payment clears. No cap. (Version B2.) |
| Office deals | Sponsor codes created in the admin. Sponsored users skip the card step. The brokerage receives an invoice and nothing else: no login, no reporting. (Version B2.) |
| Group session | Weekly, hosted by Ehab, for subscribers, one guest each. A session card in the dashboard. (Version B2.) |
| Audiences | The homepage is for people in real estate. `/agents` is for people who already run AI agents. |
| Sign-up quiz | Routes people into three paths and never blocks anyone. Its answers become the profile Cora matches on. |
| Sign-in | Email link, plus "Sign in with Google". No passwords. |
| Admins | Peter and Ehab are both admins with the same access. |
| Where the app lives | Same repo and domain. Public pages at `/`, the app under `/app/`. |
| Design | The site's existing system (Mona Sans, copper, ground and night), plus a small data palette for score bars and bricks. |
| Agents supported | Every agent platform. Zack files exist for Claude, Duet, Grok Bot, and Hark; any other agent adapts one with a single prompt, or the user uploads the report. The site may say "Works with every agent." |
| Testimonials | All four pilot users have agreed. One switch per quote in the admin. Attributed without the brokerage. |
| Timing | Toronto time. Runs due Sunday 11:59 PM, Cora at 1:00 AM, lists sent Monday 7:00 AM, stats email Wednesday 9:00 AM. |
| Retention | Runs are kept while a user subscribes and for 90 days after. A user can delete any run. Plays already shared stay in the pool in anonymous form. |
| Starter setup for people with no agent | Grok Bot is the recommended agent. The starter-team text lives on a startup page and is edited in the admin with version history. |

## 0.3 How this spec and Strategy v3.1 were reconciled

Version 1.0 of this spec differed from the strategy in ten places. Peter settled all ten on November 21, 2026, and the strategy file was updated the same day, so the two documents now agree.

| # | Topic | Settled as |
|---|---|---|
| 1 | Single runs | The strategy stands, simplified: two free lists, then US$200 a month or US$100 a run, with monthly as the clear pick. No non-contributor plan is offered. |
| 2 | Referral script | The strategy stands: "$200 a month or $100 a run". |
| 3 | Time-saved claims | This spec: Roger makes no income claims and no time-saved promises in its own voice. A named user's own words are their testimonial and may include time saved. |
| 4 | Zack's sharing rule | This spec: standing consent at sign-up, an automatic weekly send, and controls in the dashboard. |
| 5 | Users with sharing off | This spec: matched from a private Zack run, or from their sign-up profile when Zack is off. |
| 6 | Currency | This spec: US and Canadian set prices. The $30,000 target is counted in Canadian dollars, with US charges converted at the fixed 1.4. |
| 7 | Sales tax | This spec: HST and other applicable tax is charged from this build. |
| 8 | The extra $200 after a second missed week | This spec: on the next invoice, with notices before it. |
| 9 | Office deals | This spec: sponsor codes; the brokerage gets an invoice and nothing else. |
| 10 | Admin roles | This spec: Peter and Ehab, with equal access. |

## 0.4 What the site and the app may and may not say

| Allowed | Not allowed |
|---|---|
| What Zack and Cora do, step by step | Income, revenue, or productivity promises in Roger's voice |
| "Two free Monday lists. Your card is charged only with the third." | Any wording that hides the card or the charge date |
| "Works with every agent" | A list of "supported" agents that includes one with no Zack file, without the word "adapt" |
| The live count of public use cases, read from the database | User counts, "join hundreds", or any hard-coded number |
| Testimonials whose switch is on, word for word, with the person's first name and last initial | The brokerage's name, or any suggestion that a brokerage is an enterprise customer |
| A user's own statement of time saved, inside their testimonial | The same figure restated as Roger's claim |
| One real week as a worked example with its size stated: "In the pilot's first week, three users were sent nine ideas and set up all nine" | That line without its sample size |
| Cora's time estimates on an idea card, labelled as estimates from other users' runs | Turning hours into money anywhere |
| Peter's real background | Legal assurances the product cannot back |

**Vocabulary on public pages.** Software is always "AI agent" or "AI agents", in full. People are "you", "people in real estate", or "users". On every page except `/agents` and `/zack`, never write "agent" or "agents" without "AI" in front, because readers in real estate are also called agents.

## 0.5 The codebase today

Read from the repo on November 21, 2026 (`main` at the merge of pull request 20). Pull before branching.

- **Stack:** Next.js 16.4.1 App Router with Cache Components, React 19.3, Tailwind 4, TypeScript, Neon Postgres over HTTP (`src/lib/db.ts`), Resend through its REST API (`src/lib/email.ts`), Vercel Cron (`vercel.json`), the AI SDK through the Vercel AI Gateway (`src/lib/ingest/extract.ts` shows the pattern), zod.
- **Read `AGENTS.md` first.** This Next.js version has breaking changes. Check `node_modules/next/dist/docs/` before writing code.
- **Design tokens:** all in `src/app/globals.css`. Mona Sans. Light "ground" pages with dark "night" chapters. One accent, copper (`--color-accent: #9a5226`), used only for actions.
- **The public site is a Circles preview** behind `siteConfig.flags.circlesMode` in `src/data/config.ts`. Its homepage is `src/components/circles/home.tsx`. `/apply` is a closed preview that saves nothing.
- **Nothing in the app exists yet.** There are no user accounts, no sign-in, no Stripe integration (only payment links in config), no run intake, no Cora job, and no dashboard.
- **Admin:** `/admin`, one shared password (`src/lib/admin-auth.ts`), tabs in `src/components/admin-ui.tsx`: Overview, Use cases, Sign-ups, Watches, Connections, Settings.
- **Tables:** `db/schema.sql` holds `use_cases`, `raw_posts`, `watches`, `watch_hits`, `leads`, `ingest_runs`, `settings`, `secrets`, `sheet_posts`. Setup script: `db/setup.mjs`.
- **Form pattern:** server actions in `src/app/library-actions.ts` (`saveLead`, `saveWatch`): honeypot field, trimmed inputs, a clear message when the database is not configured. Follow it.
- **Cron pattern:** `src/app/api/cron/sheet/route.ts`: bearer check against `CRON_SECRET`, `maxDuration = 300`.
- **Zack files:** four live files at `public/zack/zack-the-collector-{claude,duet,grok-bot,hark}.md`, version 1.9, listed by `src/data/zack.ts`. Sources are in `artifacts/Zack/`.
- **Earlier design work worth reusing:** `artifacts/Circles/design/` (frames for the homepage, Zack tool, FAQ, About, admin), `artifacts/Circles/Cora The Curator v1.1.md`, and `artifacts/v3/Monday Morning Playbooks/Monday Morning Playbooks v1.0 Nov 14.html` (the idea card and its pull-out sheet).
- **Unlisted pages that must keep working untouched:** `/rlpsignature`, `/rlp`, `/hampton`, `/founders`, `/for/[slug]`.

## 0.6 Who owns what

The two builders work in the same repo. Ownership is by path so they rarely touch the same file.

| Owner | Paths |
|---|---|
| Marketing builder (Part A) | `src/app/page.tsx`, `src/app/agents/`, `src/app/pricing/`, `src/app/how-it-works/`, `src/app/faq/`, `src/app/about/`, `src/app/zack/`, `src/app/library/`, `src/app/privacy/`, `src/app/terms/`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/opengraph-image.tsx`, `src/components/v3/`, `src/components/site-header.tsx`, `src/components/site-footer.tsx`, `src/data/v3-copy.ts`, `src/data/legal.ts` |
| App builder (Part B) | `src/app/start/`, `src/app/signin/`, `src/app/auth/`, `src/app/getstarted/`, `src/app/app/`, `src/app/admin/`, `src/app/api/` (new routes), `src/app/r/`, `src/app/g/`, `src/components/app/`, `src/lib/auth/`, `src/lib/billing/`, `src/lib/zack/`, `src/lib/cora/`, `src/lib/intake/`, `src/lib/mail/`, `content/zack/`, `content/cora/`, `db/`, `vercel.json` |
| Shared, changed by small agreed pull requests | `src/app/globals.css`, `src/data/config.ts`, `src/app/layout.tsx` |

**The handoff point.** Every "start" button on the public site links to `/start`, which the app builder owns. The public site passes context in the query string and the app reads it:

| Parameter | Values | Meaning |
|---|---|---|
| `path` | `re`, `agents` | Which page the visitor came from; preselects the quiz route |
| `cur` | `USD`, `CAD` | The currency showing when they clicked |
| `ref` | referral code | Set by `/r/[code]` (B2); carried through |
| `zack` | token | A free Zack report made on `/zack` to carry into the account |
| `utm` | string | Campaign tags, stored on the user |

**What the public site reads from the database.** Only these: `use_cases` (library count and cards), `testimonials` where `cleared` is true, the `v3.*` settings, and the published `setup_files` row. It writes only to `leads` and `free_runs`. Everything else belongs to the app.

**The switch.** Add `siteConfig.flags.v3Mode = true`. With it on, the header, footer, homepage, sitemap, and robots serve v3. With it off, the site returns to the Circles preview. `circlesMode` stays in the code and is ignored while `v3Mode` is on.

## 0.7 Design system

**Keep:** every token in `globals.css`, Mona Sans, light ground with night chapters, copper only on the primary button and text links, one 8px corner, generous white space, no stock photography. The only photograph on the site is Peter.

**Layout rules carried from the Circles design:** centred section headings with one or two lines of sub-copy, about 44rem wide; long-form text in one narrow column, about 40rem; numbered steps with a large pale numeral above a short title; the primary button in the hero, the price block, and the closing band, with text links between.

**Add a data palette.** These colours are for graphics only: Cora's five score bars, the bricks, and the compounding graph. Text is never set in them and they never mark an action.

| Token | Use | Starting value |
|---|---|---|
| `--color-f-hours` | Hours saved bar | `#b86a12` |
| `--color-f-reach` | Reach bar | `#2a6aa8` |
| `--color-f-ease` | Ease to copy bar | `#2c8463` |
| `--color-f-proof` | Proof bar | `#6650b4` |
| `--color-f-surprise` | Surprise bar | `#b0457a` |
| `--color-level-1` to `--color-level-5` | Brick and graph colour for each level | reach, ease, proof, surprise, hours, in that order |
| `--color-marker` | The "you are here" dot on the graph | `#c63b2b` |

Check each value for at least 3:1 contrast against `--color-ground` and `--color-surface`, and add lifted versions for night chapters. Adjust lightness if needed and keep the hue. Every bar and brick also carries a text label or number, so colour is never the only signal.

**The one recurring visual: bricks.** It replaces the eight seats. Three bricks arrive each Monday and the stack grows. It appears in the homepage hero, in "how it works", in the Monday email header, and in the dashboard's compounding graph. A brick is a small rounded square. An empty slot is an outlined square; a brick the user has set up is filled in the level colour.

**The idea card.** One component, used in the Monday view, in the email (simplified), and as the sample on the public site. Its structure comes from the Monday Morning Playbooks prototype, restyled in the site's tokens:

- **Front:** title, the user's personal score out of 100, one sentence on why it fits them, and a time line ("about 3.5 hours a week for people who run it").
- **Pull-out sheet:** the description; four tiles (hours a week with range and whether counted or estimated, minutes saved each time, heavy-user best guess, run by how many users); the "paste to install" block with a "Copy prompt and playbook" button; Cora's five scores as bars; the playbook; and how the time saved was worked out.
- The prototype's tier trays, tier colours, purple accent, and its two typefaces are not used.

**Accessibility.** Keep the existing contrast ratios, skip link, visible focus, and reduced-motion behaviour. Every form field has a visible label and an inline error. Toggles are real buttons with `aria-pressed`. The pull-out sheet traps focus, closes on Escape, and returns focus to the card that opened it.

## 0.8 Words used in this spec

| Word | Meaning |
|---|---|
| User | A person with a Roger account |
| Agent | AI software the user runs (Grok Bot, Claude, Hark, Duet, and others) |
| Zack | The collector that runs in the user's agent account and writes a weekly run |
| Run | One week's Zack report from one user |
| Play | One use of an agent written up in a run, with a playbook |
| Pool | Every shareable play from every contributing user, merged and scored |
| Cora | The curator that scores the pool and picks each user's three ideas |
| Idea | A pool play picked for one user in one week |
| Brick | An idea the user has set up |
| Contributor | A user whose plays enter the pool |
| Sponsor | An organisation that pays for a group of users (B2) |

## 0.9 Settings

Admin-editable values live in the `settings` table with defaults in `src/data/config.ts`, following the existing pattern.

| Key | Default |
|---|---|
| `v3.priceUsd`, `v3.priceCad` | 200, 280 (monthly) |
| `v3.priceRunUsd`, `v3.priceRunCad` | 100, 140 (one list) |
| `v3.priceHigherUsd`, `v3.priceHigherCad` | 400, 560 (monthly, after two missed weeks or with sharing off) |
| `v3.freeRuns` | 2 |
| `v3.trialCloseDays` | 21 |
| `v3.forgivenMissesPerMonth` | 1 |
| `v3.runCutoff` | Sunday 11:59 PM, America/Toronto |
| `v3.coraAt`, `v3.chargeAt`, `v3.sendAt` | Monday 1:00 AM, 6:00 AM, 7:00 AM |
| `v3.statsAt` | Wednesday 9:00 AM (B2) |
| `v3.zackDefaultSchedule` | Sunday 6:00 PM in the user's own time zone |
| `v3.playbookPreface` | "I want you to take this document, and update it so that it works for my agent system and then install the playbook, asking me questions as needed." |
| `v3.retentionDays` | 90 |
| `v3.signupOpen` | true |
| `v3.sessionDay`, `v3.sessionTime`, `v3.sessionLink` | empty until set (B2) |
| `v3.recencyWeights` | Seen in the last 4 weeks: 1. Weeks 5 to 12: 0.5. Older: 0.25. (Default; see B.7.) |

---

# Part A. The marketing website

## A.1 Goal, audience, tone

**Goal.** A visitor understands in ten seconds what arrives on Monday, believes a real person runs it, sees exactly what it costs and when the card is charged, and starts the free trial.

**Two audiences.**

| | Homepage `/` | `/agents` |
|---|---|---|
| Reader | People in real estate. Most have no AI agents yet, or one they barely use. | People who already run AI agents daily for work. Sceptical of hype. |
| What they need to hear | Other people in your business have worked out what to use AI agents for. You get their best three ideas each week, ready to install. | You are working out the same things alone that others already solved. Trade plays. |
| First step after sign-up | Install an agent and the starter team | Install Zack |
| Secondary button | "See how it works" | "Run Zack on yourself first" |

**Tone.** Plain, direct, exact. Short sentences in the second person. No hype words, no exclamation marks, no emoji. Numbers only where real.

## A.2 Routes

| Route | Status | Notes |
|---|---|---|
| `/` | Rebuilt | Real estate homepage (A.5) |
| `/agents` | New | Agent-user page (A.6) |
| `/pricing` | New | Prices and trial terms (A.7) |
| `/how-it-works` | New | The week in detail and the anatomy of an idea (A.8) |
| `/faq` | New | All questions (A.9) |
| `/about` | New | Peter's letter (A.10) |
| `/zack`, `/zack/[agent]` | Reworked | Free Zack run for agent users (A.11) |
| `/library` | Kept, public | Adds a trial band (A.12) |
| `/privacy`, `/terms` | Rewritten | A.13 |
| `/apply` | Redirects to `/start` | Circles application removed from view |
| `/setup`, `/companies`, `/packs/[id]`, `/workshops`, `/refunds`, `/thanks/*` | Stay hidden | Already noindex; no links to them |
| `/rlpsignature`, `/rlp`, `/hampton`, `/founders`, `/for/[slug]` | Unchanged | Unlisted; keep their own header behaviour |
| `/start`, `/signin`, `/getstarted`, `/app/*`, `/admin/*` | App builder | Linked to, not built here |

Sitemap with `v3Mode` on: `/`, `/agents`, `/pricing`, `/how-it-works`, `/faq`, `/about`, `/zack`, `/library`, `/getstarted`, `/privacy`, `/terms`. Robots disallows the hidden paths, `/app`, `/admin`, `/start`, and `/api`.

## A.3 Header and footer

- **Header links:** How it works (`/how-it-works`), Pricing (`/pricing`), Use cases (`/library`), FAQ (`/faq`), About (`/about`).
- **Header right:** "Sign in" as a text link to `/signin`, and the button "Start free" (short) or "Get two free Monday lists" (long) to `/start`. A signed-in visitor sees "Open Roger" to `/app` in place of both. The app builder exposes one helper that says whether a visitor is signed in; the header must not block rendering on it.
- **No header button** on `/start/*`, `/signin`, and `/app/*`.
- **Footer:** contact email, Pricing, How it works, FAQ, About, Use cases, For people who run agents (`/agents`), Privacy, Terms.
- `navFor(path)` in `site-header.tsx` gains a v3 branch; the unlisted pages keep their current exclusion.

## A.4 Shared blocks

Build these once in `src/components/v3/` and reuse them across pages.

1. **Brick stack.** The recurring visual (0.7). Takes a week count and a level.
2. **Price block (night).** USD and CAD toggle, reusing the behaviour in `src/components/circles/price.tsx`: default from the `x-vercel-ip-country` header, the choice kept for the tab, the currency code always shown after the amount. Two ways to buy, side by side: monthly, marked "Most people choose this" and visually the larger of the two, and one list at a time. Under them: the trial line and the tax line. No non-contributor plan is shown anywhere on the public site.
   - Display: "US$200 / month USD" and "US$100 / list USD", or "CA$280 / month CAD" and "CA$140 / list CAD". With CAD showing, add "plus HST". With USD showing, add "plus tax where it applies".
   - Trial line, always directly under the prices: "Your first two Monday lists are free. We ask for a card when you start. On monthly it is charged with your third list. On one at a time it is charged only when you order a list. Cancel before then and you pay nothing."
3. **Testimonials.** Reads `testimonials` where `cleared` is true, ordered by `position`, filtered by audience. Each shows the quote word for word, then the attribution. The whole section is absent when no row is cleared. No carousel; a simple column or grid.
4. **Sample idea card.** One real pool play, chosen in the admin, rendered with the idea card (0.7) and opened to show the sheet. Until a play is chosen, the section is absent.
5. **The control block.** Short section titled "You decide what Zack shares", with three points and a link to `/how-it-works#zack`:
   - "Read every line. The exact instructions your Zack runs are in your dashboard."
   - "Set your own rules. Skip whole subjects, block names and words, or add rules in your own words."
   - "Turn sharing off any time in your dashboard. On monthly your ideas keep coming and the price becomes US$400 a month."
6. **Questions.** An accordion fed from one list in `src/data/v3-copy.ts`, with a per-question audience tag so each page shows its own subset.
7. **Closing band (night).** One line, the primary button, and the trial line.

## A.5 Homepage, in order

1. **Hero (night).** Headline, sub-line, primary button "Get two free Monday lists", secondary link "See how it works". The brick stack, with three bricks arriving. Under the buttons, in small type: "Card required. Charged only with your third list."
2. **The problem (ground).** Three short statements (copy in A.14).
3. **How it works (night), id `how`.** Four numbered steps: set up your AI agents, Zack reviews your week, Cora picks your three ideas, paste to install. The brick stack grows across the four steps.
4. **What arrives on Monday (ground).** The sample idea card (A.4), with one line above it: "This is one idea, as it arrives." Absent until a play is chosen.
5. **It compounds (ground-2).** A static version of the 26-week graph: three bricks at the start, three more each week. One sentence. No numbers about time or money.
6. **What people say (ground).** Testimonials, audience `re`.
7. **You decide what Zack shares (ground).** The control block.
8. **Who runs this (ground).** The first three paragraphs of Peter's letter, his photograph, and a link to `/about`.
9. **Price (night).** The price block.
10. **Questions (ground).** Six questions tagged for the homepage, and a link to `/faq`.
11. **Closing band (night).**

Remove from view: every Circles section (seats, rules, vetting, application). Keep the components in the repo.

## A.6 `/agents`

Same blocks, different copy and order.

1. **Hero (night).** Pain-led headline, sub-line, primary button "Get two free Monday lists", secondary button "Run Zack on yourself first" to `/zack`. Under the hero, the text-only strip of agents from the Circles design, generated from `src/data/zack.ts`, with the heading "Works with every agent" and the line "Zack files for Claude, Duet, Grok Bot and Hark. Any other agent adapts one with a single prompt."
2. **The problem (ground).** Three statements for agent users.
3. **How it works (night).** Three steps: add Zack, Cora picks your three, paste to install.
4. **The sample idea card (ground).**
5. **The control block (ground).** For this audience it sits higher, because security questions come first.
6. **What people say.** Audience `agents` or `both`; absent if none.
7. **Price (night).**
8. **Questions**, tagged for this page.
9. **Closing band.**

Every start button here links to `/start?path=agents`.

## A.7 `/pricing`

1. The price block, full width, with monthly first and marked as the choice most people make.
2. **What is included,** as a plain list: three ideas every Monday, each with a full playbook; your own history of every idea you have received; your Zack controls; a compounding view of what you have set up; the weekly group session (shown only once B2 is live; controlled by a flag).
3. **Monthly or one at a time, explained.** Two short columns.
   - Monthly: "Three ideas every Monday. Charged once a month, starting with your third list."
   - One at a time: "Order a list for any Monday you want one. You are charged only for the lists you order."
   - One line under both: "Two lists one at a time cost the same as a whole month."
4. **How contributing works.** A short paragraph, set as an explanation and not as a plan: "Roger works because everyone's Zack contributes. On monthly, if Zack misses a week, the first miss each month is forgiven. A second miss makes that month US$400. We email you both times, and the difference appears on your next invoice. If you switch sharing off in your dashboard, the monthly price is US$400. One-at-a-time lists need that week's Zack report."
5. **No refunds, stated plainly.** "There are no refunds. You get two free lists before any charge, and you can cancel in one click."
6. Primary button.

## A.8 `/how-it-works`

Narrow column, long form.

1. **The week.** Sunday, Monday, Tuesday, Wednesday, each one short paragraph: what happens, what the user does (usually nothing), what they receive.
2. **Zack, in detail,** id `zack`. What he reads (the past seven days of the user's own agent activity), what he never reads, what he removes, and what the user can change. Link to the public Zack files so anyone can read them before signing up.
3. **Cora, in detail.** She scores every play on five things: hours saved, reach, ease to copy, proof, and surprise. She never sends a user something they already run, and never names who a play came from.
4. **The anatomy of an idea.** The sample idea card laid out with a one-line margin note on each part: Play, Trigger, Setup first, Steps, Guardrails, Output, Pitfalls seen, Done when, Paste to install. The preface paragraph is shown first, labelled "Added to the top of every playbook".
5. **Your first two weeks.** The trial, step by step, with the card and the charge date stated again.
6. **If you have no AI agent yet.** Two sentences and a link to `/getstarted`.

## A.9 `/faq`

All questions from the copy file, grouped: Getting started, Zack and privacy, Cora and the ideas, Price and billing. Each answer one to three sentences. Copy in A.14.

## A.10 `/about`

Peter's letter in a narrow column with his photograph and signature, using the Circles About frame as the layout. The approved letter (Circles spec 10.2) mentions Circles and applications, so it needs an edit from Peter before launch (see "Needed from Peter"). Until the new text arrives, the page shows only the paragraphs that are still true: the first two, and the paragraph about his background. The page must lay out correctly while the photograph and signature files are missing.

## A.11 `/zack` and `/zack/[agent]`

The free Zack run stays, for agent users only. It is linked from `/agents` and nowhere on the homepage.

- **Flow:** pick an agent → email → instructions with the run-once prompt in a code block and a "Copy" button → paste the report back. This is the flow in the Circles spec 6.5; build it as specified there, with these changes.
- **The public Zack files stay at version 1.9** for this tool. They run on demand and send nothing. The scheduled, connected version (B.5) is served only to signed-in users.
- **"Agent not listed"** stays as on `/hampton`: start from the Hark file and ask your own agent to adapt it.
- **After paste-back,** the visitor sees their own top plays summarised, then one button: "Get two free Monday lists". It links to `/start?path=agents&zack={token}`, and the app attaches the report to the new account as its first run.
- **The page says, above the paste box:** "Check your report for client names or private details before pasting. It is read by Roger's team and by Cora, Roger's ranking agent, and is never published."
- Storage for this tool is the `free_runs` table (B.14). The app builder creates the table; the marketing builder writes to it from this tool's own server actions, following the `saveLead` pattern, and rate-limits by IP and email with a 20,000-character cap on the report.

## A.12 `/library`

Unchanged, plus one band above the footer: "This is what people post in public. Roger sends you what works in private." with the primary button. Library cards must not link to `/setup` in v3 mode.

## A.13 Privacy and terms

Rewrite both in `src/data/legal.ts`, in the existing plain style, dated November 2026. They are drafts until Peter has them read (see "Needed from Peter"). They must say, accurately:

**Privacy**

- What sign-up collects: name, email, the quiz answers, the agent used, country, and time zone.
- That a card is collected by Stripe and Roger never sees the number.
- What Zack does: it runs in the user's own agent account, reads only that account's activity from the past seven days, removes private details, and sends its report to Roger each week because the user agreed to that at sign-up. The user can read the instructions, change what is collected, and turn sharing off.
- What happens to a run: it is checked again for private details, stored, and processed by Cora, an AI system, through a model provider. State the provider's position on training once Peter confirms it.
- What other users see: anonymous plays only, never who a play came from.
- Retention: runs are kept while the user subscribes and for 90 days after; a user can delete any run; plays already shared stay in the pool without anything that identifies the user.
- Services that hold the data: Vercel, Neon, Resend, Stripe, Google (sign-in and Meet), and the model provider. Some store data outside Canada.
- The existing passages on the library, watches, and analytics, kept as they are.
- How to ask what is held, correct it, or delete it, with a 30-day promise.

**Terms**

- The trial: two free lists, a card on file, the charge with the third list, the 21-day close.
- The monthly price, the one-list price, the contributor rule, the higher monthly rate and the two cases where it applies, and how the difference is billed.
- No refunds; cancel any time; access continues to the end of the paid month.
- Tax is added where it applies.
- Plays are shared so other users can use them; a user keeps the right to their own work and grants Roger the right to share the anonymised play.
- The ideas are other people's working methods, offered as they are, with no promise of a result.

## A.14 Copy

Draft copy for the builder to place. Peter edits before launch.

**Homepage**

- **Headline:** "Your AI agents, smarter every Monday."
- **Sub-line:** "Roger makes your AI agents smarter every week, with ideas that worked for other real estate users."
- **The problem:**
  - "Everyone in real estate is being told to use AI. Almost nobody is told what to use it for."
  - "The people getting real work out of AI agents rarely post how. It involves their clients and their business."
  - "So each person works out the same things alone, a few months apart."
- **How it works:**
  1. "Set up your AI agents. If you don't have any, our starter team takes about half an hour to install."
  2. "Each Sunday, an AI agent called Zack reviews your week and writes up what worked, with client details removed."
  3. "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best."
  4. "Open one, press copy, paste it into your AI agent. It sets itself up and asks you what it needs to know."
- **It compounds:** "Three ideas a week. Each one you set up stays set up. Six months in, your AI agents do things you would not have thought to ask for."
- **Who runs this, lead-in:** "Roger is run by Peter Kuperman."
- **Closing band:** "See what your first two Mondays bring."

**`/agents`**

- **Headline:** "Stop figuring out AI agents alone."
- **Sub-line:** "Every Monday, Roger sends you the three plays most worth installing, drawn from what other heavy users ran last week."
- **The problem:**
  - "The most useful things people do with agents never get posted. They involve clients, money, and how the business runs."
  - "What gets posted is the highlight reel, never the playbook."
  - "So you work out alone what someone else solved last month."
- **How it works:**
  1. "Add Zack to your agent. He reviews your past seven days and writes up your best plays, with identities removed."
  2. "Cora scores every play in the pool on hours saved, reach, ease to copy, proof and surprise, then picks the three that fit your work and that you don't already run."
  3. "Each idea comes with a full playbook. Paste it into your agent and it adapts itself to your setup."
- **Closing band:** "Find out what other heavy users know."

**Referral script (for Ehab and referrers; not on the site).** "I've been using Roger with my AI agents for a few weeks. Every Monday it sends me three ideas that are working for other real estate people, and I set them up in a few minutes. The first two weeks are free, then it's $200 a month or $100 a run, and you can cancel any time. You add a card to start and it isn't charged until the third week. They run a short group call to get you set up. Want me to connect you?"

**Questions**

*Getting started*

- *I don't use AI agents yet. Can I start?* "Yes. The startup page walks you through installing one and setting up a starter team for real estate. Most people finish in about half an hour."
- *Which AI agents does Roger work with?* "Every AI agent. Zack has ready-made files for Claude, Duet, Grok Bot and Hark. On any other, one prompt adapts him, or you can upload his report yourself."
- *What do I have to do each week?* "Open your three ideas on Monday and set up the ones you want. Zack runs on his own on Sunday."

*Zack and privacy*

- *What does Zack read?* "Only your own activity inside your AI agent account, from the past seven days. He does not read your email, calendar or files."
- *What leaves my account?* "Zack's weekly report: a write-up of your most useful plays with names, clients, addresses, amounts and other private details replaced by placeholders. You agree to this when you sign up, and you can turn it off."
- *Can I see and change what Zack does?* "Yes. Your dashboard shows the exact instructions your Zack runs. You can tell him to skip whole subjects, block specific words and names, share an outline only, or follow rules you write yourself."
- *Who sees my plays?* "Other Roger users, without your name or anything that identifies you. A play is described as 'run by 3 users', never as yours."
- *I compete with other people on Roger. What if I don't want to share?* "You decide exactly what Zack shares, down to skipping whole subjects and blocking names. If you switch sharing off completely in your dashboard, monthly still brings three ideas every Monday and costs US$400 a month."
- *Can I delete what I've sent?* "Yes. You can delete any weekly report from your dashboard."

*Cora and the ideas*

- *How are my three ideas chosen?* "Cora scores every play on hours saved, reach, ease to copy, proof and surprise, then matches plays to the kind of work your own week shows. She never sends something you already run."
- *What if an idea doesn't fit me?* "Paste it into your AI agent anyway and ask how it would apply to you. Every playbook starts by telling your AI agent to adapt it to your setup."
- *Will an idea work on my AI agent if it came from a different one?* "Yes. Your own AI agent rewrites the playbook for itself before installing it."

*Price and billing*

- *What does it cost?* "US$200 a month, or US$100 for one list at a time, plus tax where it applies. In Canada it is CA$280 a month or CA$140 a list, plus HST."
- *When is my card charged?* "On monthly, with your third Monday list and not before. On one at a time, only when you order a list. Your first two lists are free either way, and we email you after your second list with what happens next."
- *Why do you need a card for a free trial?* "So that nothing changes on your third Monday. If you don't want to continue, cancel in one click before then and you pay nothing."
- *What if Zack misses a week?* "On monthly, the first miss each month is forgiven. A second miss makes that month US$400. We email you both times."
- *Can I get a refund?* "No. You get two free lists before any charge, and you can cancel any time."
- *Can I buy one list at a time?* "Yes. It is US$100 a list, ordered whenever you want one. Monthly costs less if you want a list most weeks."

## A.15 Versions and sizes

**A1: the public site.** About 12.5 half-days.

| Piece | Half-days |
|---|---|
| Shared blocks: brick stack, price block, control block, questions, closing band | 2 |
| Homepage | 2 |
| `/agents` | 1 |
| `/pricing` | 1 |
| `/how-it-works` | 1 |
| `/faq` and `/about` | 1 |
| `v3Mode` switch, header, footer, sitemap, robots, social card, hiding Circles | 1 |
| Testimonials block and sample idea card block (reading only) | 0.5 |
| `/zack` tool: picker, email gate, instructions, paste-back, handoff | 1.5 |
| Privacy and terms text | 0.5 |
| Checks at five widths, keyboard, reduced motion | 1 |

**A2: proof, once it exists.** About 2 half-days: a 2 to 3 minute demo video section with poster, captions, and a pause control (0.5); the "one real week" worked example with its sample size (1); the group-session line on `/pricing` and the homepage once B2 ships (0.5).

## A.16 Acceptance checks

1. With `v3Mode` on, no page in the header, footer, homepage, or sitemap links to a Circles page or an old offer; each of those URLs still loads and carries noindex. `/apply` redirects to `/start`.
2. With `v3Mode` off, the Circles preview returns exactly as it is today.
3. The unlisted pages render exactly as before.
4. Every start button reaches `/start` with the right `path` and `cur`.
5. The price block shows the right currency by country, keeps the visitor's choice across pages in the tab, never shows a bare "$", and always shows the trial line directly under the price.
6. No page shows a user count, a hard-coded number, the brokerage's name, or an income claim.
7. The testimonials section is absent when no quote is switched on, appears when one is, and shows each quote word for word.
8. The sample idea section is absent until a play is chosen in the admin.
9. The price block shows monthly as the marked choice beside one list at a time, and no non-contributor plan appears anywhere on the public site.
10. On every page except `/agents` and `/zack`, the words "agent" and "agents" never appear without "AI" in front, outside a testimonial's own words.
11. Forms work by keyboard alone; the accordion and the currency toggle expose their state; nothing moves under `prefers-reduced-motion`.
12. `npm run build` and `npm run lint` pass.

---

# Part B. The app

## B.1 Goal and rules

**Goal.** A person can go from the public site to a working weekly cycle without talking to anyone: sign up, connect Zack, receive two free lists, be charged with the third, and manage everything themselves. Ehab can see every user's state on one screen and step in where someone is stuck.

**Rules that apply to every screen and email in the app.**

1. **Least friction.** After one-time setup the user just uses their agent normally. Nothing in the weekly cycle needs them to log in.
2. **Nothing is shared without consent the user gave knowingly.** Consent is asked once, in plain words, at sign-up. It can be read, narrowed, or withdrawn in the dashboard at any time.
3. **Over-communicate about money.** A user is told about every charge before it happens, in the dashboard and by email, with the date and the amount including tax. No charge is ever a surprise.
4. **The cycle runs with nobody in the loop.** From Sunday's runs to Monday's lists, no person approves anything. People act only on failures and flags.
5. **Numbers are computed, not written by a model.** Medians, deciles, scores, prices, and dates are calculated in code. Models make judgement calls only (B.7).
6. **Every automatic email is sent at most once** for its trigger, recorded in `notifications`.

## B.2 Routes

| Route | Version | What it is |
|---|---|---|
| `/start`, `/start/account`, `/start/plan`, `/start/card`, `/start/done` | B1 | Sign-up |
| `/signin`, `/auth/*` | B1 | Email link and Google sign-in |
| `/getstarted` | B1 | Public startup page with the versioned setup file |
| `/app` | B1 | Home: status and this week's three ideas |
| `/app/week/[date]` | B1 | Any past week's three ideas |
| `/app/history` | B1 | Every idea received, and which are set up |
| `/app/zack` | B1 | Zack connection, controls, instructions, run history |
| `/app/billing` | B1 | Plan, next charge, invoices, card, cancel |
| `/app/settings` | B1 | Name, display name, email, time zone, email preferences |
| `/app/referrals`, `/app/sessions`, `/app/leaderboard` | B2 | Growth features |
| `/r/[code]`, `/g/[token]` | B2 | Referral link and guest invitation |
| `/api/zack/instructions`, `/api/zack/runs` | B1 | The Zack connection (B.5) |
| `/api/stripe/webhook` | B1 | Stripe events |
| `/api/cron/cora`, `/api/cron/charge`, `/api/cron/send`, `/api/cron/housekeeping` | B1 | The weekly cycle and daily upkeep |
| `/api/cron/stats` | B2 | Wednesday stats email |
| `/admin/ops`, `/admin/users`, `/admin/users/[id]`, `/admin/runs`, `/admin/flags`, `/admin/cora`, `/admin/testimonials`, `/admin/setup-file`, `/admin/interest` | B1 | New admin pages |
| `/admin/sponsors`, `/admin/sessions`, `/admin/referrals` | B2 | |
| `/admin/measures`, `/admin/pipeline`, `/admin/review` | B3 | |

Every `/app/*` and `/admin/*` page carries noindex and requires a session.

## B.3 Accounts and sign-in

- **Email link.** The user enters an email and receives a link that is valid for 15 minutes and works once. The sign-in page offers "send it again" after 30 seconds.
- **Google.** "Sign in with Google" using the verified email from Google. An account is identified by its email, so the same person can use either method.
- **No passwords** are stored anywhere.
- **Session:** an httpOnly, secure cookie lasting 30 days, renewed on use. Sign-out clears it.
- **Admins:** Peter and Ehab. An admin is a signed-in user whose email is listed in the `ADMIN_EMAILS` environment variable. Both have identical access. The existing `/admin` pages move to this check, and the shared `ADMIN_PASSWORD` login is removed once it works.
- **Rate limits** on sign-in requests by email and by IP.
- The choice of auth library is the builder's. The existing HMAC cookie in `src/lib/admin-auth.ts` shows the house style.

## B.4 Sign-up

Five short screens. Progress is saved after each, so a person who leaves can return by signing in.

**1. The quiz (`/start`).** Six questions, one screen. The answers are saved as the user's profile, which Cora uses for matching (B.7).

| # | Question | Answers |
|---|---|---|
| 1 | What do you do? | "I work in real estate" or "Something else", then one line: role and kind of business |
| 2 | Do you use AI agents for work today? | Not yet / Most weeks / Every day |
| 3 | Which AI agent do you use, or plan to? | The list in `src/data/zack.ts`, "Another one" (with a text field), "Not sure yet" |
| 4 | How many agents, bots or scheduled routines do you run? | None / 1–2 / 3–5 / 6 or more |
| 5 | What do you most want help with? | Choose any, from the fixed category list (B.5) |
| 6 | How do you feel about trying new software for work? | I avoid it / I'll try it if someone shows me / I try new tools often |

**Routing.** The quiz sets one of three paths. It never blocks anyone.

| Path | When | What changes |
|---|---|---|
| `running` | Uses agents every day, or runs 3 or more | Onboarding goes straight to connecting Zack |
| `new` | Everyone else | Onboarding starts with the startup page: install an agent and the starter team, then connect Zack |
| `not_ready` | "Not yet" on question 2 and "I avoid it" on question 6 | An honest note before the account step: "Roger works best once you use AI agents most days. You can start anyway, or leave your email and we'll check in later." Two buttons. Choosing "later" saves a `leads` row with `kind = 'not_ready'`. Choosing "start anyway" continues on the `new` path with the tag kept for the admin. |

**2. Account (`/start/account`).** Name, then email link or Google.

**3. Plan (`/start/plan`).** Two choices, with monthly selected and marked "Most people choose this".

- **Monthly, US$200 a month.** "Three ideas every Monday. Charged once a month, starting with your third list."
- **One list at a time, US$100 each.** "Order a list for any Monday you want one, after your two free lists."
- No non-contributor plan is offered. Everyone starts with sharing on. Sharing can be changed later on the Zack page (B.5).
- **Consent,** required, as a checkbox the user ticks themselves: "I agree that Zack will run in my agent account each week and send his report to Roger. I can read exactly what Zack does, change what he collects, and turn this off at any time."
- A link, "Read what Zack does first", opens the full instruction text.
- One short line under the choices states the contributor rule for monthly: "If Zack misses two weeks in a month, that month is US$400. We always tell you first."

**4. Card (`/start/card`).** A Stripe-hosted card step that saves the card and billing address without charging. Directly above it, in body-size type, not small print:

> You get two free Cora curations. Your card is charged only on the third.
> Monthly: then {price} a month plus {tax name}. Your first charge will be no earlier than {date}. We will email you the exact date and amount before it happens. Cancel any time in one click.
> One at a time: after your two free lists, you are charged {price} plus {tax name} only when you order a list.

Only the line for the chosen plan is shown.

The currency shown is the one passed in `cur`, changeable here, and fixed for the account once the card is saved.

**5. Done (`/start/done`).** One sentence and a button into `/app`, where the onboarding checklist is waiting.

**Sign-up with a free Zack report.** If `zack` is present, the report in `free_runs` for that token is attached as the user's first run and goes through intake (B.6).

**Existing pilot users.** The admin can create an account for a person and send them a link that opens at the plan step, so the five current users add a card and start their two free lists like everyone else.

## B.5 Zack

### The connection

Zack's instructions live in the Roger codebase. The user installs a small connector in their agent once; from then on their agent fetches the current instructions each week, follows them, and sends the report back. Improvements to Zack reach every user on their next run with nothing to re-paste.

| | |
|---|---|
| **Key** | Each user has one secret Zack key, shown in onboarding and on `/app/zack`, replaceable there. Only a hash is stored. |
| **Fetch** | `GET /api/zack/instructions?agent={slug}` with `Authorization: Bearer {key}`. Returns Markdown: the core instructions for that agent, then a generated section with this user's rules, then how to send the report. A `key` query parameter is accepted for agents that cannot set headers. |
| **Send** | `POST /api/zack/runs` with the same key. The body is the report as Markdown, up to 80,000 characters. Returns `{ ok, week_of, replaced }`. A second run before the cutoff replaces the first; a run after the cutoff counts for the following week. |
| **Limits** | Six sends a day per key. Requests without a valid key get a plain 401 with no detail. |
| **Connector text** | A short block the user pastes into their agent, one version per agent in `content/zack/connect/{slug}.md`: "Every Sunday at 6:00 PM, fetch your instructions from {url} using this key, follow them exactly, and send the finished report to {url}. Do not share this key." The onboarding step shows it with a "Copy" button and the key filled in. |
| **Upload fallback** | `/app/zack` always accepts a report as a pasted text or a `.md` file. This is the route for any agent that cannot make web requests, and for unlisted agents. Users on this route get a reminder on Sunday at 6:00 PM their time if no run has arrived. |
| **Test** | Onboarding shows the prompt for an immediate test run and a status line that turns to "Connected: test received" when it arrives. Test runs are marked and never enter the pool. |

### What the report must contain

Zack ends every report with one fenced block labelled `roger-run` holding the same content as structured data. Intake reads that block. If it is missing or invalid (an older Zack file, an unlisted agent), a model reads the prose and produces the same structure, and the run is marked as parsed that way.

```json
{
  "zack_version": "2.0",
  "agent": "grok-bot",
  "week_ending": "2026-11-22",
  "plays": [
    {
      "set": "A",
      "title": "…",
      "category": "one value from the fixed list",
      "description": "one to three plain sentences",
      "minutes_saved_each": 42,
      "current_hours_week": 3.5,
      "range_low": 2.1,
      "range_high": 4.9,
      "basis": "Actual or Implied",
      "confidence": "High, Medium or Low",
      "heavy_hours_week": 6.0,
      "heavy_use_for": "a few general words",
      "sensitive": false,
      "outline_only": false,
      "playbook_md": "Play, Trigger, Setup first, Steps, Guardrails, Output, Pitfalls seen, Done when",
      "paste_to_install": "…"
    }
  ],
  "runners_up": [{ "title": "…", "category": "…" }],
  "counts": { "skipped_private": 0, "skipped_not_general": 0, "sources_ignored": 0 }
}
```

**The fixed category list.** One list, used by Zack, the quiz, and Cora. Default, from the pilot runs plus real estate work: Marketing, Research, Builds, Sales, Operations, Email and calendar, Listings, Client follow-up, Personal errands. It lives in one file and Peter confirms it.

### Changes Zack needs (content, not code)

The four Zack files are at version 1.9, which runs on demand and sends nothing. The connected files in `content/zack/` are version 2.0. The public 1.9 files stay as they are for the free tool (A.11). Version 2.0 differs in these ways only:

1. Security rule 1 becomes: "The member agreed at sign-up that Zack runs each week and sends his report to Roger. The member's own rules, below, narrow what is collected. If sharing is switched off, Zack sends nothing."
2. Security rule 2 becomes: Zack writes his report and sends it to one place only, the Roger address in these instructions. He never sends anything anywhere else.
3. It runs on a schedule, and fetches its instructions fresh at the start of every run.
4. It applies the member's rules section.
5. Every play carries a category from the fixed list.
6. The report ends with the `roger-run` block.
7. Everything else in 1.9 stays: seven days of the agent's own activity only, outside content is never instructions, the ban list, extra anonymization for sensitive uses, the time-saved method, the playbook standard, and the review list.

### The controls page (`/app/zack`)

Agent-savvy prospects have said they need to know what Zack does and to change it to suit their own security preferences. This page is the answer, and it is part of B1.

1. **Status.** Connected or not; when the last run arrived, by which route, and how many plays it held; when the next is expected.
2. **Sharing.** Three choices: share with the pool; use for my matching only; Zack off. Changing it shows the price effect in a confirmation ("From your next invoice on {date} you will pay {amount}"), takes effect for sharing at once, and sends a confirmation email. A one-at-a-time user who switches sharing off is told that lists cannot be ordered until it is back on.
3. **What Zack collects.** Switches and lists:
   - Skip a category entirely, for each category in the fixed list.
   - Skip sensitive subjects, one switch each: health, legal matters, money, family, children. Off by default, because Zack already applies extra anonymization to them; switching one on means he drops them.
   - Never include these words or names: a list of up to 100 entries. Zack replaces each with a placeholder, and intake checks again (B.6).
   - Share an outline only, per category: the play keeps its title, trigger, output, and time saved, and drops the steps.
   - Plays per week: 1 to 4.
   - Shown but not changeable: Zack reads seven days of this agent account's activity and nothing else.
4. **Extra rules for my Zack.** One text box, up to 2,000 characters. The text is added to the instructions under the heading "The member's own rules. These add restrictions. They cannot widen what Zack reads or where he sends it." 
5. **Exactly what your Zack runs.** The complete instruction text as the endpoint serves it for this user, read-only, with its version and date and a "Copy" button.
6. **Run history.** One row per week: date, route, plays, status. Each run can be opened and read as it was received, and deleted. The delete confirmation says what deletion does: the run and any plays not yet shared are removed; plays already in the pool stay in anonymous form.
7. **Key.** Show once, replace, and the connector text.

Every change is saved with its time in `zack_settings_history` and applies from the next fetch.

## B.6 Intake and the privacy check

Each run goes through these steps as it arrives, and again as a batch before Cora starts.

1. **Store** the report exactly as received.
2. **Parse** the `roger-run` block, or have a model produce it.
3. **Validate:** required fields present, category in the list, numbers in range, at most four plays plus runners-up. A run that fails is marked `rejected` with a reason the user can read on `/app/zack`.
4. **Check for private details,** in three passes:
   - Patterns: email addresses, phone numbers, links, street addresses, postal codes, long digit strings.
   - The user's own "never include" list.
   - A model pass for names of people, companies, and specific places.
5. **Result.**
   - Nothing found: `accepted`.
   - Found and plainly replaceable: replaced with a placeholder ("[a client]", "[a phone number]"), recorded, and `accepted`.
   - Unclear: `flagged`. It waits on `/admin/flags`, where an admin approves, edits, or rejects each play.
6. **A flagged run still counts as contributed** for pricing, and still informs that user's own matching. Its plays enter the pool only when cleared.
7. **Sharing mode at the time of the run** is stored on the run. Plays from a "matching only" run are never shareable.

## B.7 Cora

Cora's method is `artifacts/Circles/Cora The Curator v1.1.md`. It was written for one Circle of eight. Version 2.0, at `content/cora/cora.md`, applies the same scoring to one network-wide pool.

### What stays from v1.1

The five factors and their weights (Hours saved 30, Reach 25, Ease to copy 10, Proof 15, Surprise 20), scoring each factor 1 to 10 by decile, the raw score scaled so a perfect play scores 100, the tie-breaks, Actual figures weighted over Implied, medians for merged figures, the personal score (network score × 0.75 + Fit × 5), the privacy rules, "time only, never money", and "never invent a number".

### What changes in v2.0

| # | v1.1 | v2.0 |
|---|---|---|
| 1 | Reads one Circle's runs for this week | Reads this week's accepted, shareable runs and the existing pool |
| 2 | Merges this week's plays with each other | Each new play is merged into the pool play that does the same job, or becomes a new pool play. When in doubt, keep them separate. |
| 3 | This week only | Cumulative. Evidence is weighted by recency using `v3.recencyWeights`; a pool play with no evidence in 26 weeks is retired from picking and kept on record. |
| 4 | Deciles across the week's plays | Deciles across all active pool plays |
| 5 | Reach is the share of the Circle who could use it | Reach is the share of active users who could use it, judged from their runs and profiles |
| 6 | Sorts into tiers and writes a sort file | No tiers and no file. Writes records: pool scores, and three picks per user. |
| 7 | "Your top 3" from this week's plays | Three picks per user from the whole pool |
| 8 | Fit comes from the member's own run | Fit comes from the user's runs (shared or matching-only), and from their quiz profile when they have none |
| 9 | "Members" | "Users" |

### Picking a user's three

1. **Leave out** every play the user already runs (their own plays and runners-up from their last four weeks of runs), every play that came from their own contributions, and every idea already sent to them.
2. **Fit, 0 to 5:** 5 when the play's "Heavy use for" matches the role or kind of work the user's runs or profile show; 3 when they run, or asked for help with, a play in the same category; 1 otherwise.
3. **Personal score** = network score × 0.75 + Fit × 5.
4. **Pick** the three highest personal scores with Fit 3 or more. If fewer than three qualify, fill with the highest network scores at Fit 1. Cora always sends the best three available.
5. **The reason line** says only which role or category matched. It never mentions the user's own plays or anyone else's identity.
6. A play is described as "run by 3 users", never by name.
7. Every playbook starts with `v3.playbookPreface`.

### Who gets a list each Monday

| User | Gets a list when |
|---|---|
| In trial, Zack on | Their run for this week arrived. A week without a run does not use a free list. |
| In trial, Zack off | Every Monday from sign-up, matched from the profile |
| Monthly or sponsored | Every Monday, whether or not their run arrived. A missing run affects price, not delivery (B.9). |
| One at a time, after the trial | Only on a Monday they ordered, when that week's run arrived and the charge succeeded |
| Payment held, cancelled and past the paid month, or trial closed | Never |

### The job

- `/api/cron/cora` is scheduled at 05:00 and 06:00 UTC on Mondays and runs only when it is 1:00 AM in Toronto, so it survives the clock change. This is the pattern in the Circles spec, section 8.
- Steps: close intake for the week; finish parsing and checking any waiting runs; merge new plays into the pool; rescore the pool; pick for every eligible user; mark the week `ready`.
- It must be safe to run twice, able to resume, and finished before 6:00 AM. Work through users in batches. There is exactly one set of picks per user per week.
- Model calls go through the existing AI Gateway setup. A model decides: whether two plays do the same job, which category and role a play fits, Fit, the reason line, and the second privacy check. Code computes everything numeric.
- **Seed data.** All existing test runs count. An admin tool imports a run file as seed data under a seed user; seed plays are shareable and are never attributed to a real account.
- **When it fails:** nothing is sent, the week is marked `failed`, and both admins get an alert email. `/admin/cora` has "Run Cora now" and "Send now".

## B.8 Monday

1. **6:00 AM, charge.** For each monthly trial user whose third list is ready, start their subscription and charge the card. For each one-at-a-time order whose list is ready, charge the card for that list (B.9). Users whose charge fails are held.
2. **7:00 AM, send.** Each user with picks and no hold gets one email and sees the same three ideas at `/app`. For a trial user, this delivery counts as a free list.
3. **The email.** Subject: "Your three ideas for the week of {date}". The three ideas, each with its title, the reason it fits, the time line, and one button, "Open and install". Then one status line that is always present:
   - Trial: "Free list 1 of 2." or "Free list 2 of 2. Your next list is your first paid one: {date}, {amount} plus {tax}."
   - Monthly: "Next charge {date}: {amount}." plus the contribution line from B.9.
   - One at a time: "This list: {amount}. Order next Monday's whenever you want one." For their second free list the line reads: "Free list 2 of 2. Order your next list whenever you want one: {amount} plus {tax}."
4. **The view (`/app`).** Three idea cards (0.7). Opening one shows the sheet with "Copy prompt and playbook", which copies the preface, the prompt, and the playbook together. Under the sheet's title, one button: "I set this up".
5. **"I set this up"** places a brick at once. The user's next Zack run confirms it when the play shows up in their own activity. Both states are stored. The north-star number, ideas adopted, is reported two ways: marked by the user, and confirmed by Zack.
6. **No list this week.** A trial user with Zack on and no run gets a short note instead: "Zack hasn't sent a report yet, so there is no list this week and no free list was used. Here is how to connect him." No other user ever gets an empty Monday.

## B.9 Billing

### How it is built in Stripe

- **At sign-up:** a customer and a saved card. No subscription and no charge.
- **Products:** a monthly price at the standard rate and at the higher rate, and a one-list price, each in USD and CAD.
- **Tax:** Stripe Tax is on from the first charge. Prices are before tax. The billing address is collected with the card. Invoices show the tax line. This needs Peter's tax registration entered in Stripe before launch.
- **Events handled:** card saved, invoice paid, invoice payment failed, subscription changed, subscription ended, dispute opened (alerts both admins).

### The trial and the first charge

| Moment | What happens | What the user is told |
|---|---|---|
| Sign-up | Card saved. Status `trial`. | The terms above the card form. A welcome email restating them. |
| First list sent | Free list 1 of 2 | The status line in the email and on `/app` |
| Second list sent | Free list 2 of 2 | An email the same day: "Your next list is your first paid one", with the date, the amount with tax, and a one-click cancel link |
| 48 hours before the third list | Nothing changes | A reminder email with the same date and amount |
| Third list ready, Monday 6:00 AM | The subscription starts and the card is charged | A receipt, and "You're subscribed" on `/app` |
| The charge fails | The list is held. The card is retried on days 1, 3 and 7. | An email each time with a link to update the card. The list is sent the moment a charge succeeds. |
| Still failing after day 7 | The trial closes. No charge. | A closing email with a link to restart |
| 21 days after sign-up with no first list | The trial closes. No charge. | Nudges on days 3, 10 and 17; a closing email |
| The user cancels during the trial | The trial ends at once. The saved card is removed. | A confirmation: "You have not been charged." |

### One list at a time

- After the two free lists, nothing is charged automatically.
- The user orders with one button, "Get next Monday's list", which shows the price with tax. It is on `/app`, on `/app/billing`, and in a short prompt email each Friday that the user can switch off.
- An order is for the coming Monday. It can be placed or cancelled until the Sunday cutoff.
- On Monday at 6:00 AM, if that week's Zack run arrived and the list is ready, the card is charged and the list is sent at 7:00 AM. If no run arrived, there is no charge and no list, the user is emailed why, and the order does not carry over.
- It needs sharing switched on. With sharing off the button is disabled and says why.
- The contributor rule does not apply to one-at-a-time users.
- Every email to a one-at-a-time user ends with one line: "Monthly is {price} for every Monday." Switching to monthly is one click on `/app/billing`.

### The contributor rule

This applies to monthly users only.

- A billing month is the subscription's own monthly period.
- A week counts as **contributed** when an accepted or flagged run from a user in "share with the pool" mode arrived before the cutoff.
- A week counts as **not contributed** when no such run arrived, or the user was in "matching only" or "Zack off" mode at the cutoff.
- A week is **excused** when Roger caused the miss: the send endpoint was failing, or an admin marks the week excused for one user or for everyone. Excused weeks never count.
- For a monthly user, the first week not contributed in a month is forgiven. At the second, that month is billed at the higher rate: the difference is added as a labelled line to the next invoice. If the user cancels before that invoice, it is not collected.
- A monthly user who switches sharing off pays the higher rate from their next invoice, and no adjustment applies. This is never offered as a plan; it exists only as the effect of that switch, and the confirmation states the new price before it is saved.
- Nothing is counted during the trial.

**Telling the user, at every step.** All six are required.

| # | When | Where | What it says |
|---|---|---|---|
| 1 | Sign-up | Plan step and welcome email | The rule in two sentences |
| 2 | Always | A status strip on `/app` and `/app/billing` | "Contributing. This month: 0 of 1 forgiven misses used. Next charge {date}: {amount} plus {tax}." |
| 3 | First miss | Email and status strip | "Zack didn't send a report this week. This one is forgiven. A second miss before {date} makes this month {amount}." With the fix. |
| 4 | Second miss | Email, status strip, and a banner on `/app` | "This is your second missed week this month, so this month is billed at {amount}. The difference of {amount} will be on your invoice of {date}." With the fix and the option to switch plans. |
| 5 | Three days before any invoice that carries an adjustment | Email | The full amount, itemised |
| 6 | The invoice | Invoice line | "Higher-rate adjustment for {period}: two missed weeks" |

### Changing and cancelling

- **Switch between monthly and one at a time** on `/app/billing`, in one click. Moving to one at a time takes effect when the paid month ends. Moving to monthly starts the subscription with the next list. A confirmation shows the effect before it is saved, and an email follows.
- **Change sharing** on `/app/zack`. Sharing changes at once; a monthly price changes from the next invoice.
- **Cancel** in one click on `/app/billing`. No retention screen. One optional question, "Why are you leaving?". Under the cancel button, one plain text link: "Or switch to one list at a time." Access continues to the end of the paid month. No refund.
- **A renewal that fails** is retried by Stripe. After 7 days unpaid, lists are held until it is paid; the user is emailed at each step.
- **Invoices** are listed on `/app/billing` with links to Stripe's hosted copies. "Update card" opens Stripe's own page.

## B.10 The dashboard

| Page | What is on it |
|---|---|
| `/app` | The status strip. The onboarding checklist until it is complete. This week's three ideas. A link to last week. |
| `/app/history` | Every idea ever sent, newest first, each marked "set up", "confirmed by Zack", or not yet. A count of bricks. (The compounding graph arrives in B2.) |
| `/app/zack` | B.5 |
| `/app/billing` | Plan, price, next charge with tax, the status strip, invoices, update card, switch plan, cancel |
| `/app/settings` | Name, display name, email, time zone, and which emails to receive. The Monday list can be switched off; billing emails cannot. |

**Onboarding checklist,** shown at the top of `/app` until done. Each step ticks itself when the app sees it happen.

| Path `new` | Path `running` |
|---|---|
| 1. Install your AI agent (link to `/getstarted`) | 1. Connect Zack |
| 2. Set up your starter team | 2. Send a test run |
| 3. Agree your daily goal | 3. Check your Zack controls |
| 4. Connect Zack | 4. Wait for Monday |
| 5. Send a test run | |
| 6. Wait for Monday | |

## B.11 The startup page and its setup file

**`/getstarted`** is public, so referrers and Ehab can send it to anyone.

1. **Install.** Grok Bot is the recommended agent for someone starting from nothing: go to its site, download, open, upgrade to a paid plan of your choice, name your Chief of Staff.
2. **Set up your starter team.** The current setup file in a block with a "Copy" button, and the instruction to paste it when the agent asks "What's the first task I can help you with?" Under the block: "Version {n}, updated {date}."
3. **Your daily goal.** "You are all set up. Your responsibility is to use your agent setup every day until you have saved at least 30 minutes that day." A signed-in user sees a button, "That's my goal", which ticks the checklist. The goal is motivational and is never measured.
4. **Next.** Signed out: the start button. Signed in: "Connect Zack".

**The setup file is edited in the admin, with version history** (`/admin/setup-file`).

- A Markdown editor and a required note, "What changed".
- "Save as new version" always adds a version and never overwrites one.
- A list of every version: number, date, who saved it, the note. Any version can be opened and read.
- "Publish" makes one version the live one. "Restore" copies an old version into a new one.
- The public page always shows the published version, its number, and its date.
- **First version:** seeded from `Real estate Grok Bot Setup.md` in Peter's Roger folder, with two edits: remove the two Google Docs links, and remove the line that installs Zack from a document, since Zack now arrives through the connection in B.5.

## B.12 The admin

Both admins see everything. New tabs are added to `src/components/admin-ui.tsx`; the existing tabs stay.

**Operations (`/admin/ops`).** The screen that lets one person run the cycle. One row per user:

| Column | Shows |
|---|---|
| User | Name, path, and the `not_ready` tag where it applies |
| Status | Trial (free lists used), monthly, one at a time, payment held, sponsored, cancelled |
| Sharing | Pool, matching only, or off |
| Zack this week | Received (time and route), missing, flagged, rejected |
| Cora this week | Ready, sent, held, none |
| Money | Date and amount of the next charge; misses used this month |
| Last seen | Last sign-in; last time an idea was opened |
| Note | A private note either admin can edit |

Filters: "Needs attention" (no run by Sunday 8:00 PM, a flagged or rejected run, a held payment, a trial closing within five days), by status, and by path. Row actions, each one logged with who did it: add a run for this user, excuse a missed week, give one extra free list, send a template nudge, open in Stripe.

**Users.** A list and a detail page with everything about one person: profile, plan, runs, ideas sent and set up, emails sent, and the log of admin actions.

**Runs.** Every run with its status. Open any to read it.

**Flags.** The queue from B.6. For each flagged play: the text, what was flagged, and approve, edit, or reject.

**Cora.** This week's status, counts (runs read, plays merged, pool size, users picked for), the times of the next charge and send, and "Run Cora now" and "Send now". The seed-import tool. A read-only view of any user's picks.

**Testimonials.** Add and edit: name, attribution, quote, date, audience, order, and the **cleared** switch. The public site shows only cleared rows. Seeded with these, word for word from the testimonials document, cleared, since all four people have agreed:

| Person | Attribution | Quote | Date |
|---|---|---|---|
| Chris M. | Real estate, Toronto | "After looking at my own Grok Bot activity and the Zack the Collector reports in the shared folder, I already have three useful ideas I'm putting to work just in Week 1." | Nov 17, 2026 |
| Robyn M. | Real estate, Toronto | "I had Grok Bot look over my past week of activity along with the Zack reports in our shared folder, and asked it for the top 3 ways I could get more out of it. Here's what it came up with, and I've now set all three up in my system." | Nov 17, 2026 |
| Robyn M. | Real estate, Toronto | "I'm discovering something new with this every day and it's exciting to see what's possible for the office." | Nov 11, 2026 |
| Ken F. | Real estate, Toronto | "Everything is looking good with Grok. I am saving well over 30 minutes a day with the bots. I have created new bots to organize my database." | Nov 12, 2026 |

There is no solo quote from Grace in the document; one is needed (see "Needed from Peter").

**Sample idea.** Choose which pool play is shown on the public site. Choosing one requires ticking "I have read this play and it contains nothing private."

**Interest.** Counts and lists: "not ready" emails, cancellation reasons, and how many users are on monthly and on one at a time.

## B.13 Emails

Plain and short, sent through the existing `sendEmail`. Automatic emails come from "Roger support". Ehab's personal follow-ups are written and sent by him, outside the app.

| # | Email | Trigger | Version |
|---|---|---|---|
| 1 | Sign-in link | Requested | B1 |
| 2 | Welcome, with the terms restated and the next step for the user's path | Card saved | B1 |
| 3 | Zack is connected | First run or test received | B1 |
| 4 | Zack hasn't sent a report yet | Trial days 3, 10, 17 with no run | B1 |
| 5 | Your three ideas | Monday send | B1 |
| 6 | No list this week, and why | Trial, Zack on, no run | B1 |
| 7 | Your next list is your first paid one (monthly), or how to order your next list (one at a time) | After the second free list | B1 |
| 8 | Reminder of the first charge | 48 hours before | B1 |
| 9 | You're subscribed | First charge succeeded | B1 |
| 10 | We couldn't charge your card | Each failed attempt | B1 |
| 11 | Your trial has closed, no charge | Day 7 of failures, or day 21 | B1 |
| 12 | Missed week, forgiven | First miss in a month | B1 |
| 13 | Second missed week, and what it costs | Second miss | B1 |
| 14 | Your next invoice, itemised | Three days before an invoice with an adjustment | B1 |
| 15 | Your sharing or plan has changed | On change | B1 |
| 16 | Your run needs a look (only when the user must act) | Run rejected | B1 |
| 17 | Cancellation confirmed | On cancel | B1 |
| 18 | Run deleted | On delete | B1 |
| 19 | Cora failed; a payment was disputed | To both admins | B1 |
| 20 | Your week in numbers | Wednesday 9:00 AM | B2 |
| 21 | Someone you referred has joined; you've earned a credit | Referral events | B2 |
| 22 | You're invited to a Roger session | Guest invited | B2 |
| 23 | Want a list this Monday? | Fridays, to one-at-a-time users without an order | B1 |
| 24 | Your list is ordered | Order placed or cancelled | B1 |
| 25 | Your list, and your receipt | Order charged and sent | B1 |
| 26 | No list this Monday, and you were not charged | An order with no Zack run by the cutoff | B1 |

## B.14 Data

New tables for B1. Column lists show intent; the builder settles types and indexes. Add them to `db/schema.sql` and `db/setup.mjs`.

```sql
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  display_name text not null default '',
  path text not null default 'new' check (path in ('new','running')),
  not_ready boolean not null default false,
  profile jsonb not null default '{}',        -- quiz answers
  agent text not null default '',
  status text not null default 'signup'
    check (status in ('signup','trial','active','held','cancelled','closed')),
  plan text not null default 'monthly' check (plan in ('monthly','per_run')),
  sharing text not null default 'share' check (sharing in ('share','match_only','off')),
  consent_at timestamptz,                     -- when the Zack consent box was ticked
  currency text check (currency in ('USD','CAD')),
  country text not null default '',
  timezone text not null default 'America/Toronto',
  stripe_customer text,
  stripe_subscription text,
  free_lists_used int not null default 0,
  first_charge_at timestamptz,
  zack_key_hash text,
  sponsor_id uuid,                            -- B2
  referral_code text unique,                  -- B2
  referred_by uuid,                           -- B2
  utm text not null default '',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists login_tokens (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists zack_settings (
  user_id uuid primary key references users (id) on delete cascade,
  skip_categories text[] not null default '{}',
  skip_sensitive text[] not null default '{}',
  never_words text[] not null default '{}',
  outline_categories text[] not null default '{}',
  plays_per_week int not null default 4,
  extra_rules text not null default '',
  updated_at timestamptz not null default now()
);
-- zack_settings_history: the same columns plus changed_at, one row per change.

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,                      -- the Monday the run counts for
  route text not null check (route in ('connector','upload','free_tool','admin','seed')),
  sharing text not null,                      -- the user's mode when it arrived
  raw_text text not null,
  parsed jsonb,
  parsed_by text check (parsed_by in ('block','model')),
  status text not null default 'received'
    check (status in ('received','accepted','flagged','rejected','deleted')),
  reason text not null default '',
  is_test boolean not null default false,
  zack_version text not null default '',
  received_at timestamptz not null default now(),
  unique (user_id, week_of, is_test)
);

create table if not exists plays (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  user_id uuid not null,
  week_of date not null,
  set_ text not null check (set_ in ('A','B','runner_up')),
  title text not null,
  category text not null,
  body jsonb not null,                        -- the play as parsed and checked
  shareable boolean not null default false,
  flag jsonb,                                 -- what the privacy check found
  pool_play_id uuid
);

create table if not exists pool_plays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text not null,
  heavy_use_for text not null default '',
  playbook_md text not null,
  paste_to_install text not null,
  written_on text not null default '',        -- the agent it was written on
  figures jsonb not null default '{}',        -- medians, ranges, counts, confidence
  f_hours int, f_reach int, f_ease int, f_proof int, f_surprise int,
  score int,
  active boolean not null default true,
  is_public_sample boolean not null default false,
  first_seen date not null,
  last_seen date not null
);

create table if not exists cora_weeks (
  week_of date primary key,
  status text not null default 'running' check (status in ('running','ready','sent','failed')),
  runs_read int not null default 0,
  plays_merged int not null default 0,
  pool_size int not null default 0,
  users_picked int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sent_at timestamptz
);

create table if not exists picks (
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,
  position int not null check (position between 1 and 3),
  pool_play_id uuid not null references pool_plays (id),
  personal_score int not null,
  fit int not null,
  reason text not null,
  delivered_at timestamptz,
  is_free_list boolean not null default false,
  opened_at timestamptz,
  setup_marked_at timestamptz,
  setup_confirmed_at timestamptz,
  primary key (user_id, week_of, position)
);

create table if not exists orders (              -- one-at-a-time lists
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,                      -- the Monday the list is for
  status text not null default 'ordered'
    check (status in ('ordered','cancelled','charged','sent','no_run','failed')),
  amount_cents int,
  currency text,
  stripe_payment text,
  created_at timestamptz not null default now(),
  unique (user_id, week_of)
);

create table if not exists contribution_weeks (
  user_id uuid not null references users (id) on delete cascade,
  week_of date not null,
  result text not null check (result in ('contributed','missed','by_choice','excused')),
  excused_by text,
  period_start date,                          -- the billing month it falls in
  primary key (user_id, week_of)
);

create table if not exists notifications (
  user_id uuid,
  kind text not null,
  ref text not null,                          -- the week, period or event it is about
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

create table if not exists admin_actions (
  id bigserial primary key,
  admin_email text not null,
  user_id uuid,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  attribution text not null,
  quote text not null,
  said_on date,
  audience text not null default 're' check (audience in ('re','agents','both')),
  position int not null default 0,
  cleared boolean not null default false
);

create table if not exists free_runs (          -- the public "Run Zack on yourself" tool (A.11)
  token text primary key,
  email text not null,
  agent text not null,
  report text,
  report_at timestamptz,
  claimed_by uuid,                            -- the user who carried it into an account
  utm text not null default '',
  created_at timestamptz not null default now(),
  unique (email, agent)
);

create table if not exists setup_files (
  id uuid primary key default gen_random_uuid(),
  slug text not null default 'real-estate-starter',
  version int not null,
  body_md text not null,
  note text not null,
  saved_by text not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (slug, version)
);
```

**Deleting and keeping.** A daily job removes runs and unshared plays 90 days after a user's access ends, and removes expired sign-in tokens. Deleting an account removes the user, their runs, settings, and picks; pool plays stay, and they hold nothing that points to a person.

## B.15 Version B2: growth

| Feature | What it does |
|---|---|
| **Referral links** | Every user has a link, `/r/{code}`, shown on `/app/referrals` with a "Copy" button and the referral script. Visiting it stores the code for 60 days and carries it into `/start`. The first referrer recorded for a person wins. A person cannot refer themselves. |
| **Referral credit** | When a referred user's first invoice is paid, the referrer is credited that first payment at list price (one month, or one list) in the referrer's own currency, applied to their Stripe balance so it comes off their next invoices or orders. No cap; unused credit carries forward. A sponsored referred user earns the referrer nothing. `/app/referrals` lists each person referred, their stage (invited, in trial, paying), and the credit earned and remaining. |
| **Wednesday stats email** | Level, bricks, contribution points, leaderboard rank, credit balance, and one invitation link. |
| **Bricks and levels** | On `/app/history`: a 26-week compounding graph, the line in the level colour, a larger marker on the user's current week. Each idea set up is a brick. After week 26 the graph starts again in the next level's colour, up to level 5. The colour is the whole reward. |
| **Leaderboard** | One network-wide board on `/app/leaderboard`. A user earns 1 point when Cora picks one of their plays for another user and 1 more when that user's set-up is confirmed. Users appear under a display name they choose. Counts are shown ("2 users adopted your idea"), never names. |
| **Group session** | A card on `/app/sessions`: the next session's day, time, and Google Meet link, with "Add to calendar". Paying and sponsored users only; trial users see it greyed out with "Opens when you subscribe". A subscriber invites one guest per session by name and email; the guest receives a one-time invitation at `/g/{token}` and is recorded as that subscriber's referral. Admins set the day, time, and link, and tick who attended. |
| **Sponsors** | In `/admin/sponsors` an admin creates a sponsor: name, currency, negotiated standard and higher monthly prices, number of seats, and a code. A person who signs up at `/start?sponsor={code}` skips the card step. Each month the admin page shows the seats in use at each price and prepares a Stripe invoice to the sponsor for an admin to send. The sponsor has no login and sees nothing about any user. The contributor rule applies to sponsored users at the sponsor's two prices. |

New tables: `referrals` (referrer, referred user or email, source, generation, stage, credit, dates), `credits`, `points`, `sessions_attendance`, `session_guests`, `sponsors`.

## B.16 Version B3: measurement and self-improvement

| Feature | What it does |
|---|---|
| **Loop measures** | `/admin/measures`, computed weekly: new users per existing user per week, days from a name being given to that person's first list, both by referral generation, and paid referrals per paying user. The December 14 checkpoint value is shown against its 0.25 floor. Also: ideas adopted out of ideas sent, marked and confirmed, against the 2-of-3 target. |
| **Pipeline** | `/admin/pipeline`: every person from first touch (lead, guest, referral, waitlist, sign-up) through trial to paying, with the date of each stage and where they came from. Replaces counting by hand. |
| **Review bot** | `/admin/review`: on a schedule, a model reads the week's runs, flags, rejections, picks, and set-up rates and proposes specific wording changes to the Zack and Cora instruction files. An admin reads each proposal and approves or rejects it. Nothing changes without approval, and approved changes go into the repo as a normal commit. |
| **Feedback** | Users' replies and notes are stored against their record and are part of what the review bot reads. |

## B.17 Versions and sizes

**B1: the paid weekly cycle.** About 37.5 half-days. This is the minimum that can take a payment the way the strategy describes, and it is the largest piece of v3 by a wide margin.

| Piece | Half-days |
|---|---|
| Accounts: email link, Google, sessions, admin check, moving `/admin` off the shared password | 2.5 |
| Sign-up: quiz, routing, account, plan and consent, card step, resume | 3 |
| Stripe: customer, saved card, products and prices in two currencies, tax, subscription start, webhooks, billing page, switch, cancel | 4.5 |
| Trial logic: counting delivered lists, the third-list charge, failed-card retries, the 21-day close, and their emails | 2.5 |
| One list at a time: ordering, the Monday charge for orders, the Friday prompt, switching to and from monthly | 1.5 |
| Zack connection: keys, instructions endpoint with per-user rules, send endpoint, upload, test run, connector text for four agents | 3 |
| Zack controls page, instruction view, run history and delete | 2 |
| Intake: parsing, validation, the three privacy passes, flags | 2.5 |
| Cora: pool, merging, scoring in code, picks, schedule, resume, failure handling, seed import | 5 |
| Monday: charge and send jobs, the email, the three-idea view, the card sheet, "I set this up", history | 3 |
| Contributor rule: weekly results, forgiveness, the invoice line, all six notices | 2 |
| Startup page and the versioned setup file editor | 1.5 |
| Admin: operations, users, runs, flags, Cora, testimonials, sample idea, interest | 3.5 |
| Retention job, deletion, onboarding checklist, settings page | 1 |

Add about 4 half-days for end-to-end testing with Stripe's test clock, which this version needs because most of its behaviour happens over weeks.

**What could come out of B1 if time is short,** in the order I would cut:

1. Google sign-in (0.5). Email link alone works.
2. The automatic invoice line for a second miss (1). An admin adds it by hand in Stripe from the operations view while user numbers are small. The notices stay.
3. The model fallback for reports without a `roger-run` block (0.5). Unlisted agents wait.
4. Run deletion by the user (0.5). An admin does it on request.
5. The sample idea chooser and the interest page (0.5).

That is about 3 half-days. Nothing else in B1 can go without breaking the trial, the charge, or the weekly cycle.

**B2: growth.** About 13 half-days: referral links and credit 3.5, stats email 1, bricks and levels 2, leaderboard and points 2, group session and guests 1.5, sponsors 3.

**B3: measurement.** About 8 half-days: measures 2, pipeline 3, review bot 3.

## B.18 Acceptance checks

**Sign-up and sign-in**

1. A person can complete sign-up on each of the three quiz routes; nobody is blocked.
2. The card step shows the two-free-lists statement directly above the card form, and no charge is made at sign-up.
3. The consent box is unticked by default, and a plan that runs Zack cannot be chosen without it.
4. A sign-in link works once and stops working after 15 minutes. No password is stored anywhere.

**Zack**

5. The instructions endpoint returns the core text plus this user's rules, and changes when the user changes a control.
6. A run sent with a valid key appears on `/app/zack` and in the admin within a minute. A run with a bad key is refused with no detail.
7. A second run before the cutoff replaces the first; a run after it counts for the next week.
8. With sharing set to "matching only", no play from that user is ever shareable. With "Zack off", the instructions endpoint tells Zack to send nothing.
9. The instruction view shows exactly what the endpoint serves for that user.
10. A word on the user's "never include" list does not appear in any pool play that came from their runs.
11. A run containing an email address or phone number never reaches the pool with it intact.

**Cora and Monday**

12. With runs in by Sunday night, every eligible user has exactly three picks by 6:00 AM and one email at 7:00 AM, with no one signed in.
13. No user is ever sent a play they run, a play from their own contributions, or an idea they were sent before.
14. No email or page shows who a play came from.
15. Every copied playbook starts with the preface, word for word.
16. Running the Cora job twice for the same week changes nothing.
17. If Cora fails, no user email is sent and both admins are alerted.
18. Scores match a hand calculation from the same figures.

**Money**

19. A trial user is charged for the first time on the Monday of their third delivered list, and at no other time.
20. A week with no delivered list does not use a free list.
21. The email after the second list and the 48-hour reminder both state the date and the amount with tax, and both match the charge.
22. A failed first charge holds the list; a later success sends it at once; seven days of failure closes the trial with no charge.
23. A trial with no first list after 21 days closes with no charge.
24. A first missed week in a month sends the "forgiven" email and changes nothing on the invoice. A second adds the labelled difference to the next invoice and sends the second notice, the banner, and the three-day reminder.
25. An excused week never counts.
26. Tax appears as its own line on every invoice.
27. Cancelling takes one click, shows no retention screen, and leaves access until the paid month ends.
28. A Canadian and a US user each see and are charged their own currency's set price.

**Admin**

29. Only the emails in `ADMIN_EMAILS` reach `/admin`.
30. The operations view shows the true state of every user and its "needs attention" filter catches each listed case.
31. Every admin action on a user is recorded with who did it.
32. A testimonial appears on the public site only while its switch is on.
33. Saving the setup file always creates a new version; the public page shows the published one with its number and date.

**General**

34. Reports and runs are visible only to their owner and to admins.
35. The unlisted pages and the existing library, watches, and admin tabs work as before.
36. `npm run build` and `npm run lint` pass.

**One list at a time**

37. A one-at-a-time user is never charged without an order.
38. An order for a Monday with no Zack run produces no charge, no list, and an email saying why.
39. With sharing off, the order button is disabled and says why.
40. Neither the public site nor sign-up offers a non-contributor plan.
41. Switching between monthly and one at a time takes one click and never produces two charges for the same Monday.

---

# Needed from Peter

| # | Item | Blocks |
|---|---|---|
| 1 | **Zack version 2.0** for Claude, Duet, Grok Bot, and Hark, with the seven changes in B.5 | The connected weekly cycle |
| 2 | **Cora version 2.0**, with the nine changes in B.7 | The Cora job |
| 3 | The fixed category list, confirmed | Zack, the quiz, and Cora |
| 4 | Tax registration entered in Stripe, and a word from your accountant on charging US customers | The first charge |
| 5 | Google sign-in credentials for the project | "Sign in with Google" |
| 6 | The letter, edited for v3 (the approved text mentions Circles and applications) | `/about` and the homepage block |
| 7 | Headshot at `public/media/peter.jpg` and signature at `public/media/peter-signature.svg` | Nothing; both have fallbacks |
| 8 | Each testimonial's attribution confirmed (role and city), and a quote from Grace | The testimonials section |
| 9 | The starter setup file, version 1, read through after the two edits in B.11 | The startup page |
| 10 | A read of the privacy and terms text, and the model provider's position on training | Launch |
| 11 | The session day, time, and Meet link | The session card (B2) |
| 12 | The demo video and the data for the "one real week" example | A2 |
| 13 | Keys and settings in Vercel: Stripe secret key and webhook secret, the Stripe prices created (monthly at both rates, and one list, in both currencies), `ADMIN_EMAILS` (Peter and Ehab), and the sending address for "Roger support" | Billing, the admin, and every automatic email |

Items 1 and 2 are documents, not code. They can be drafted from this spec and the existing 1.9 and 1.1 files.

The live checklist for these items and for the defaults below is `artifacts/v3/launch-list.html`. Check it before starting any version.

# Defaults to confirm

These were chosen to fill gaps. Each is easy to change before it is built.

1. A flagged run still counts as contributed for pricing.
2. A trial user with Zack on gets a list only in weeks their run arrives; a trial user with Zack off gets one every Monday.
3. Recency weights: last 4 weeks at 1, weeks 5 to 12 at 0.5, older at 0.25; a play with no evidence in 26 weeks is retired from picking.
4. Zack's default schedule is Sunday 6:00 PM in the user's own time zone.
5. The referral link is remembered for 60 days, and the first referrer wins.
6. A sponsor is invoiced from each sponsored user's third list, as an individual would be.
7. Testimonials are seeded with their switches on.
8. The "not ready" route applies only to people who answer both "not yet" and "I avoid it".
9. Retired on November 21, 2026: single lists are sold at US$100 or CA$140, so there is no demand link.
10. The category list: Marketing, Research, Builds, Sales, Operations, Email and calendar, Listings, Client follow-up, Personal errands.
11. A one-at-a-time order is charged on Monday at 6:00 AM only if that week's Zack run arrived. If not, there is no charge and no list, and the order does not carry over.
12. One-at-a-time lists need sharing switched on.
