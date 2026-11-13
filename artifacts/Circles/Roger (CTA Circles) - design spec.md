# Roger (CTA Circles): design and build spec for meetroger.ai

Version 0.6 · November 13, 2026 · Owner: Peter · Repo: `qed/roger` (branch from `main`)

**What this is.** A spec to hand to Claude Design or Claude Code. It turns meetroger.ai from "a library of agent use cases that sells setups" into "apply for a founding Roger Circle". Strategy source: `Zack the Collector - Three Businesses.md`, Option 2 (Circles). Ranking source: `Cora The Curator v1.1.md`, in the same folder. Design reference: joinhampton.com (structure and layout only; see section 5).

**How to use it.** Sections 1 to 4 are context every builder needs. Section 5 is the design brief. Sections 6 to 9 are the four versions, each with its features and their size in half-days; the engineering team decides what to build and in what order. Section 10 is the copy. Section 11 lists what Peter must supply. Section 12 lists the changes Cora needs.

**What changed in 0.6**

- The weekly cycle is fully automatic: run intake from email, Cora at 1:00 AM, each member's list sent at 7:00 AM Eastern. Nobody approves anything in between.
- "Install this week" widens until it holds at least three plays.
- Every playbook starts with a line telling the member's own agent to adapt it and install it.
- The applicant promise "never sent to any AI system" is replaced by "Only Roger's team reads it. It is never published or shared."
- The risks section and all build-order advice are removed.

**What changed in 0.5**

| Area | 0.4 | 0.5 |
|---|---|---|
| Headline | "Get better at using AI Agents" | Pain-led: "Stop figuring out AI agents alone." |
| Monday promise | "Three best uses each, 24 shared" | One ranked list from Cora in three tiers, plus your own top 3. The number 24 is gone from the product copy. |
| Grouping | One agent platform per Circle | **Circles are not platform-specific.** Eight people, any agents. |
| Entry bar | Soft, judged by Peter | Hard and stated: daily work use, three or more agents or routines, a Zack report. |
| Circle rules | Confidentiality only | Contribute, Confidential, Candid. Miss three weeks and the seat goes to the waiting list. |
| Proof | Library cards only | A "One cycle" section built from Roger's own pilot data, with an animation. |
| Application | One long form, report required | Two steps: qualify first, Zack report second. |
| Price | US$200 | US$200 or CA$280 a month, toggle, default by visitor location. No "founding price" label. |
| Guarantee | "Leave any time" | 45-day money-back guarantee, plus leave any time. |
| Founder block | Bio paragraph | Signed letter. Peter hosts the founding Circles' working sessions. |
| Pages | `/`, `/zack`, `/apply` | Adds `/how-it-works`, `/about`, `/faq`. |
| Look | Left-aligned cards | Same fonts and colours; centred editorial layout borrowed from Hampton. |
| Launch mechanics | Members send, Roger compiles by hand | Members email their Zack run on Sunday; Cora ranks overnight; the list goes out Monday morning. |

---

## 1. The product in one paragraph

A Roger Circle is a confidential group of eight people who use AI agents heavily for work. Circles mix agents on purpose: every playbook is a use case that can be adapted to any agent, and opens with one line telling the member's own agent to adapt it to their setup and install it. Each member runs **Zack the Collector** in their own agent account on Sunday; Zack writes up their best plays of the week as playbooks, with client details and sensitive information removed. Overnight, **Cora the Curator** merges plays that do the same job, scores each one on hours saved, reach, ease to copy, proof and surprise, and sorts the best into three tiers: Install this week, Worth trying, Niche but great. On Monday morning every member gets that list and their own top 3. Members also get help installing any play and two optional one-hour working sessions a week on Google Meet (Tuesdays and Thursdays, 12:00 PM Eastern), hosted by Peter for the founding Circles. Price: US$200 or CA$280 a month, charged from the day the Circle starts, with a 45-day money-back guarantee. The weekly cycle is Deploy → Use → Collect → Share.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Scope | Circles is the whole pitch. Homepage, header and every call to action point to it. |
| Old pages | Setup, plan, companies, packs and workshops are **hidden, not removed**. |
| Main call to action | "Apply for a founding Circle". Vetted by hand. No payment on the site. |
| Who it is for | Any heavy agent user, owner or employee. |
| Entry bar (stated on the site) | 1. Uses AI agents for work every day. 2. Runs three or more agents, bots or scheduled routines. 3. Has run Zack and can show real plays from the past week. |
| Grouping | **Not by platform.** A Circle is eight vetted people on any mix of agents, chosen for diverse use cases and with direct competitors kept apart. |
| Agents | Zack needs a file per agent. Live at launch: Claude, Grok Bot, Duet, Hark. Coming: Instinct, Muse, Dots, Viktor. Someone on a coming-soon agent can register interest but cannot produce a report yet. |
| Weekly cycle | Sunday: member runs Zack and emails the run to hello@meetroger.ai, where it is taken in automatically. Monday 1:00 AM ET: Cora runs. Monday 7:00 AM ET: each member is emailed the ranked list and their top 3. **Fully automatic: no person reviews or approves anything between Sunday night and Monday morning.** Tuesday and Thursday: working sessions. |
| What arrives Monday | Cora's sort: three tiers of up to five plays each, every play with a score and a full playbook, plus a personal top 3. The site describes this; it never says "24". |
| Playbook preface (decided Nov 13) | Every playbook starts with this paragraph, however it reaches the member (Monday's list, a copied block, a downloaded file): "I want you to take this document, and update it so that it works for my agent system and then install the playbook, asking me questions as needed." The member's own agent does the adapting. Peter has had five people on different agent setups run playbooks this way. |
| Circle rules | **Contribute:** no run on Sunday, no list on Monday; three missed weeks in a row and the seat goes to the waiting list. **Confidential:** nothing leaves the Circle, and plays are anonymous ("run by 3 members"). **Candid:** share what failed as well as what worked. |
| Price shown | US$200 or CA$280 a month. Toggle on the homepage price block and on `/apply`. Visitors in Canada start on CAD, everyone else on USD. No "founding price" label. |
| Guarantee | 45 days, money back. Wording in section 10; terms in 6.8. |
| What is included | The ranked list every Monday; a personal top 3; install help; two optional 1-hour working sessions a week. No group chat is promised. |
| First cohort | Three founding Circles, 24 seats. |
| Start and billing | Each Circle starts when its eight seats are filled. Billing begins at kickoff. |
| Confidentiality agreement | Handled by Peter off the site. The site only says Circles are confidential and members sign before joining. |
| Founder | A signed letter from Peter Kuperman with his LinkedIn headshot. He reads every application and hosts the founding Circles' working sessions. |
| Reply promise | Every completed application answered within 2 business days. |
| Zack tool | "Run Zack on yourself": pick an agent, give an email, get the instructions, paste the report back. It feeds step 2 of the application. |
| Library | Proof on the homepage. Also an internal lead engine (admin only). |
| Voice | Direct, not cheeky. Short second-person sentences, firm claims, no jokes at anyone's expense. |
| Look | Existing Roger tokens only (Mona Sans, copper). Layout borrowed from Hampton. |
| Delivery | Four versions: v1a public site core, v1b supporting pages and the real-week demo, v2 admin and the automatic weekly cycle, v3 lead engine. The spec lists features by version; build order is the engineering team's call. |

## 3. What the site may and may not claim

Zack has run on Peter's own accounts and in Roger's pilot. No paying Circle has met. The copy must stay inside that.

| Allowed | Not allowed |
|---|---|
| "Founding Circles are forming now." | Results, testimonials or time-saved figures attributed to Circle members. |
| Numbers from Roger's own pilot week, read from the real Cora sort file. | Calling pilot participants "members", naming them, or naming any organisation they belong to. |
| The live count of use cases in the library, read from the database. | "Join hundreds of members" or any member count above the real one. |
| "Seats left", computed from accepted applications. | A hard-coded or decorative seat counter. |
| What Zack and Cora do, step by step, including Cora's five scoring factors. | "Zack runs on" an agent before that agent's file is in the repo. |
| "Every playbook opens with a line that tells your own agent to adapt it to your setup and install it." | "Works on every agent", or a count of the setups it was tested on. |
| Hours and minutes saved, as Zack and Cora report them. | Turning hours into money. Income, revenue or productivity promises. |
| Peter's real background. | An acceptance rate, until there are enough applications for one to be true. |
| "Circles are confidential; members sign an agreement before joining." | The text of an agreement, or legal assurances the site cannot back. |
| "45-day money-back guarantee", with its terms one click away. | A guarantee without stated terms. |

## 4. The current codebase (what the builder is working with)

- **Stack:** Next.js 16.4 App Router with Cache Components, React 19, Tailwind 4, TypeScript, Neon Postgres, Resend for email, Vercel Cron. **Read `AGENTS.md` first:** this Next.js version has breaking changes; check `node_modules/next/dist/docs/` before writing code.
- **Design tokens:** all in `src/app/globals.css`. Mona Sans. Light "ground" pages with dark "night" chapters. One accent, copper (`--color-accent: #9a5226`), used only for actions. Reuse these; add no new colours or fonts.
- **Home today:** `src/app/page.tsx`. Sections: hero with live library search, shelves, free pack, plans ladder, "the morning", watch sign-up.
- **Header:** `src/components/site-header.tsx`, `navFor(path)` picks the nav set and the header button.
- **Forms that save to the database:** `src/app/library-actions.ts` (`saveLead`, `saveWatch`). Follow this pattern. Do not use the Formspree-forward pattern in `src/app/actions.ts`.
- **Tables:** `db/schema.sql` (`use_cases`, `leads`, `watches`, `sheet_posts`, `settings`, `secrets`). Setup script: `db/setup.mjs`.
- **Library data:** synced hourly from the Lomax Google Sheet by `/api/cron/sheet` into `sheet_posts`, then rewritten into `use_cases`.
- **Admin:** `/admin`, password login, tabs listed in `src/components/admin-ui.tsx`.
- **Unlisted page pattern:** `src/app/rlpsignature/page.tsx` (noindex metadata, no nav). Copy this pattern for hidden pages.
- **Config:** `src/data/config.ts` for values Peter edits by hand; `settings` table for values he edits in admin.
- **Library cards:** `src/components/use-case-card.tsx` links every card to `/setup`. In Circles mode that link must not render (see 6.2).

---

## 5. Design brief (for Claude Design)

**Goal of the homepage:** a heavy agent user arrives, recognises the problem in the headline, understands in ten seconds that this is a small vetted group that trades what actually works, believes a real person runs it, and applies.

**Audience:** people who already run agents daily for work and pay for them. They are sceptical of AI hype and have seen every "10 prompts" thread. They respond to specifics and to restraint.

**Tone:** direct, not cheeky. Short second-person sentences. Firm claims that are true. No hype words, no exclamation marks, no emoji, no jokes at anyone's expense. Numbers only where real.

### 5.1 What we take from Hampton, and what we leave

| Hampton pattern | Roger version |
|---|---|
| Headline names a pain the visitor already feels | "Stop figuring out AI agents alone." |
| Text-only strip of chapter cities under the hero | Text-only strip of the agents Zack runs on, in a ruled grid |
| Member results on the first screen-and-a-half | "One cycle": Roger's pilot data and an animation of the cycle |
| "What you actually get" as three plain blocks | Four plain blocks: the ranked list, your top 3, install help, working sessions |
| Three group principles (Commitment, Candor, Confidentiality) | Three rules: Contribute, Confidential, Candid |
| Vetting sold as the reason it works, in numbered steps with large pale numerals | "Circles work because every member is vetted", six numbered steps |
| A signed founder letter in a narrow column ("Hey there,") | Peter's letter, signed, in a narrow column |
| Money-back guarantee as its own short block | 45-day guarantee in the price block, terms on `/how-it-works` |
| Candidate requirements listed just before the apply button | The three-part entry bar, plus "Not for you if" |
| A closing "Think you're a fit?" band | "Already running agents every day? Find out what the other seven know." |
| A text link to go deeper after most sections | "See how a week works ›" and "Apply ›" after most sections |
| Deep pages: Explore Membership, About, FAQ | `/how-it-works`, `/about`, `/faq` |
| Wall of Fame of raw member messages | **Not yet.** Add only when real members have said real things. |
| Community veto, acceptance rate | **Not used.** Neither is true for Roger today. |
| Serif headlines, green-black and sand palette | **Not used.** Roger keeps Mona Sans, night and copper. |
| Price hidden until the call | **Not used.** Roger shows the price. |

**Layout rules borrowed**

1. Section headings are centred, with one or two lines of sub-copy centred beneath, max width about 44rem.
2. A short dashed vertical connector line sits above each section heading on light sections, so the page reads as one continuous argument.
3. Numbered steps use a large pale numeral above a short title.
4. Long-form text (the letter, FAQ answers, `/how-it-works` prose) runs in a single narrow column, about 40rem.
5. Strips of names (agents) are plain text in a ruled grid: no logos, no icons.
6. The primary button appears in the hero, the price block and the closing band. Between them, sections end with text links.

**Look:** keep the existing system. Light ground, night chapters for the three moments that need weight (the hero with the agent strip; how a Circle works; price and apply) and the short closing band. Copper only on the primary button and links. Generous white space. No stock photos. The only photograph on the site is Peter.

**The two recurring visuals**

- **The cycle ring** (hero): Deploy (Tuesday) → Use (All week) → Collect (Sunday) → Share (Monday) → back to Deploy. Four nodes on a ring with arrows. Centre: "Every week · Get better, get sharper".
- **Eight seats to one list** (how it works, `/how-it-works`): eight member accounts on the left, Cora in the middle, the three tiers and "Your top 3" on the right. The seat dots recur in the seat line.

**Screens to design**

1. Homepage (desktop and mobile).
2. Zack tool: agent picker, email gate, instructions view, paste-back step.
3. Application: step 1 qualify, the "not yet" state, step 2 report and placement, and the confirmation page.
4. Header and footer.
5. `/how-it-works`, `/about`, `/faq`.
6. v2: admin Applications list, Circle board with the weekly runs tracker and Cora sort.
7. v3: Prospects, Today's replies, Funnel.

**Accessibility:** keep the existing contrast ratios, the skip link, visible focus, and reduced-motion behaviour. Every form field has a visible label and an inline error. The currency toggle is two real buttons with `aria-pressed`. The real-week animation has a static poster, a pause control, captions for any text it shows, and does not autoplay under `prefers-reduced-motion`.

---

## 6. Version 1a: the public site core

**Outcome:** a visitor can understand Circles, run Zack on themselves, and apply in two steps. Peter gets an email for each completed application and can read applications in the database.

**Effort:** about 9 half-days of build, plus review.

| Piece | Half-days |
|---|---|
| Homepage rebuild (16 sections, centred layout, cycle ring, tier diagram) | 3 |
| Header, footer, hiding old pages, sitemap and robots | 0.5 |
| Zack tool (picker, email gate, instructions, paste-back) | 2 |
| Two-step application, confirmation page, emails | 2 |
| Currency toggle, location default, settings | 0.5 |
| Schema, privacy and terms updates (guarantee), checks | 1 |

### 6.1 Routes

| Route | Status | Version | Notes |
|---|---|---|---|
| `/` | Rebuilt | v1a | The Circles pitch. |
| `/zack` | New | v1a | Agent picker and email gate. |
| `/zack/[agent]` | New | v1a | Instructions for one agent, then paste-back. |
| `/apply` | New | v1a | Two-step application. |
| `/apply/thanks` | New | v1a | Confirmation. noindex. |
| `/how-it-works` | New | v1b | The week in detail, the anatomy of a play, how Cora ranks, the rules, the guarantee terms. |
| `/about` | New | v1b | Peter's letter in full. |
| `/faq` | New | v1b | Every question, grouped. |
| `/library` | Kept, public | v1a | Add a Circles call-to-action band. |
| `/privacy`, `/terms` | Kept | v1a | Both updated (see 6.8). |
| `/setup`, `/companies`, `/packs/[id]`, `/workshops`, `/refunds`, `/thanks/*` | **Hidden** | v1a | See 6.2. |
| `/for/[slug]`, `/rlpsignature` | Unchanged | | Already unlisted. |
| `/admin/*` | Unchanged in v1 | | |

Where one of `/how-it-works`, `/faq` or `/about` does not exist, its header link points to the matching homepage anchor: `/#how`, `/#questions` or `/#letter`.

### 6.2 Hiding pages (not removing them)

For each hidden route:

1. Keep the page file and its components. Delete nothing.
2. Add `robots: { index: false, follow: false }` to its metadata, as `/rlpsignature` does.
3. Remove it from `sitemap.ts`. The sitemap becomes `/`, `/zack`, `/apply`, `/how-it-works`, `/about`, `/faq`, `/library`, `/privacy`, `/terms`. The current sitemap also lists `/business` and `/families`, which are redirects; remove those too.
4. Add the hidden paths to `disallow` in `robots.ts`.
5. Remove every link to them from the header, footer, homepage and library page. This includes the "We can set this up" link on every library card: in Circles mode `UseCaseCard` and `UseCaseRow` render the author link only.
6. Leave the `/home`, `/families`, `/business` redirects in `next.config.ts` as they are.
7. On a hidden page, the header shows the new nav (below), so nothing on it links back into the old offers.

Add one switch, `siteConfig.flags.circlesMode = true`, that the header, footer, sitemap and library cards read. Turning it off restores today's navigation. This makes the change reversible in one line.

### 6.3 Header and footer

- **Header links:** How it works (`/how-it-works`), Run Zack (`/zack`), Use cases (`/library`), FAQ (`/faq`), About (`/about`).
- **Header button:** "Apply" (short) / "Apply for a founding Circle" (long), to `/apply`.
- **No header button** on `/apply` and `/apply/thanks`.
- **Mobile:** logo, "Apply", menu button. The menu lists the five links.
- **Footer:** "Roger, Toronto", contact email, then How it works, Run Zack, Use cases, FAQ, About, Privacy, Terms, year. Remove setup, plan, companies, workshops and refunds links.

### 6.4 Homepage sections, in order

1. **Hero (night).** Headline, sub-line, then Sunday / Monday / Tuesday as three short lines. Primary button "Apply for a founding Circle", secondary link "Or run Zack on yourself first". The cycle ring. Seat line: "Three founding Circles · 24 seats · {seatsLeft} left".
2. **Agent strip (night, joined to the hero).** "Zack runs on" then the live agents as plain text in a ruled grid; "Coming soon" then the rest, each linking to its interest sign-up. One line: "Circles mix agents. Every playbook tells your own agent to adapt it to your setup and install it." Both groups read from `src/data/zack.ts`.
3. **One cycle (ground).** A wide frame with the animation (or its poster) and four numbers. Specified in 7.4.
4. **Why use a Roger Circle (ground-2).** Three benefits, each a statement plus a one-sentence sub.
5. **How a Circle works (night), id `how`.** Four numbered steps: Join → Add Zack → Sunday: Zack writes up your best plays → Monday: Cora ranks them. Under them the eight-seats-to-one-list diagram, one line naming Cora's five scoring factors, and the dated launch note (copy in section 10). Text link to `/how-it-works`.
6. **What you get (ground).** Four blocks: the ranked list every Monday; your own top 3; install help; two working sessions a week.
7. **Three rules (ground-2).** Contribute, Confidential, Candid.
8. **Who gets in (ground).** The three-part entry bar on the left; "Not for you if" on the right.
9. **Vetting (ground-2).** "Circles work because every member is vetted." Six numbered steps.
10. **Proof from the public library (ground).** Live count from the database, six recent use-case cards, and the line "This is what people post. A Circle gets what they don't." Link to `/library`.
11. **Run Zack on yourself (ground-2).** One paragraph, three steps and a button to `/zack`.
12. **The letter (ground), id `letter`.** Peter's signed letter in a narrow column, with his photo. Link to `/about`.
13. **Price and apply (night), id `apply`.** Currency toggle, price, billing line, guarantee, primary button, seat line.
14. **Questions (ground), id `questions`.** The top six, then a link to `/faq`.
15. **Closing band (night).** One line, one button.
16. **Footer.**

Remove from the homepage: the live search hero, shelves, pack board, plans ladder, "the morning" and the watch sign-up. Keep those components in the repo.

### 6.5 The Zack tool

**Content source.** One markdown file per agent in `content/zack/`, supplied by Peter:

| Agent | Slug | File | Status at launch |
|---|---|---|---|
| Claude | `claude` | `Zack The Collector (for Claude).md` | **Live** (file exists, v1.8) |
| Hark | `hark` | `Zack The Collector (for Hark).md` | **Live** (file exists, v1.8) |
| Grok Bot | `grok-bot` | `Zack The Collector (for Grok Bot).md` | **Live** (file exists, v1.8) |
| Duet | `duet` | `Zack The Collector (for Duet).md` | **Live** (file exists, v1.8) |
| Dots | `dots` | `Zack The Collector (for Dots).md` | Coming soon |
| Instinct | `instinct` | `Zack The Collector (for Instinct).md` | Coming soon |
| Muse | `muse` | `Zack The Collector (for Muse).md` | Coming soon |
| Viktor | `viktor` | `Zack The Collector (for Viktor).md` | Coming soon |

**Launch state.** The four live files are in the repo at `artifacts/Zack/`. Copy each into `content/zack/` under its slug (`claude.md`, `hark.md`, `grok-bot.md`, `duet.md`), unchanged. Availability is read from the files, so any agent whose file is missing at build time shows as "Coming soon" automatically.

**Adding an agent later (Peter does this through Claude Code).** Drop the new file into `content/zack/` under its slug, commit, deploy. No other code change: the picker, the instructions page, the application's agent list, the homepage strip and the FAQ all read the same list. After a deploy that adds an agent, the admin shows how many people are waiting for it so Peter can email them.

Define the list once in `src/data/zack.ts` (`slug`, `name`, `file`, `available`). An unavailable agent still appears in the picker, marked "Coming soon", and choosing it saves the email as interest and says "We'll email you when Zack for {agent} is ready".

**Flow**

1. `/zack`: a short explanation (what Zack does, that it runs in your own account, that nothing is sent to Roger unless you paste it), then the agent picker.
2. Pick an agent → email field → "Send me Zack for {agent}". On submit: save a row in `zack_runs`, email the visitor a link to `/zack/{agent}?t={token}`, and show the instructions straight away on the same page.
3. `/zack/[agent]`: the markdown rendered as a guide. The run-once prompt sits in a code block with a "Copy" button. A sticky side note: "When Zack finishes, come back and paste your report."
4. **Paste-back:** a large text area, "Paste your Zack report", with a warning above it (see 6.8). On submit, save the text against the `zack_runs` row and offer "Continue to your application", which opens `/apply` with email, agent and report already filled.
5. Without a valid token, `/zack/[agent]` shows the email gate for that agent, not the instructions.

**Rendering.** Render the markdown on the server to a small fixed set of elements (headings, paragraphs, lists, tables, code). No raw HTML from the file. The copy button copies the code block's text exactly.

### 6.6 The application (two steps)

**Why two steps.** A visitor who is ready to apply should not have to leave, run Zack and come back before giving their name. Step 1 captures them in six questions and tests them against the entry bar. Step 2 collects the report. An application is reviewed only once step 2 is complete.

**Step 1: Qualify**

| Field | Type | Required | Notes |
|---|---|---|---|
| Name | text | Yes | |
| Email | email | Yes | Pre-filled from the Zack tool when present. |
| Main agent | select | Yes | All eight agents. Choosing one without a Zack file shows "Zack for {agent} isn't ready yet" and saves interest instead of continuing. |
| What you do | text | Yes | Role and kind of business, one line. |
| Do you use agents for work every day? | yes/no | Yes | |
| How many agents, bots or scheduled routines do you run? | select | Yes | 1–2, 3–5, 6–15, 16+. |

On "Continue":

- **Meets the bar** (daily = yes and 3 or more): save the row with status `started`, email a link back to step 2, and show step 2.
- **Below the bar:** save with status `not_yet` and show: "Circles are for people running three or more agents every day. You're not there yet, and that's fine. Run Zack on yourself for free, and apply again when you are." No step 2.

**Step 2: Your Zack report and placement**

| Field | Type | Required | Notes |
|---|---|---|---|
| Your Zack report | long text | Yes | Pre-filled from paste-back. If empty: a paste box, a link to `/zack`, and "Save and finish later", which keeps the row at `started`. |
| Other agents you use | multi-select | No | |
| Company or website | text | No | Used to keep direct competitors out of the same Circle. |
| LinkedIn or X profile | url | No | |
| Anyone you should not be in a Circle with? | text | No | Competitors, colleagues. |
| Time zone | select | Yes | For working sessions. |
| Currency | USD / CAD | Yes | Set by the toggle in the side panel; defaults by location. |
| Consent | checkbox | Yes | "I understand Circles are confidential and that members sign an agreement before joining." |

Hidden: honeypot field, UTM values, referring use-case id if they arrived from a library card.

**Behaviour**

- Server actions in the `saveLead` style: validate with zod, upsert into `applications`.
- On completing step 2: status becomes `new`, email Peter a link to the admin record, email the applicant a confirmation, redirect to `/apply/thanks`.
- One application per email. A second submission updates the first and says so.
- A `started` application has an emailed link that reopens step 2 with step 1 filled.
- If the database is not configured, show "Applications open shortly; email {contactEmail}", as other forms do today.
- `/apply/thanks`: what happens next (Peter reads every application himself; a reply within 2 business days; a short call; the agreement; a kickoff email when the Circle fills).

**Side panel on both steps:** the price with the currency toggle, the billing line, the guarantee, and the six vetting steps with the current one marked.

**Seat line.** `seatsLeft = 24 − count(applications where status = 'accepted' or 'seated')`. `circles.seatsTaken`, when set, overrides the count. Never show a number below zero; at zero the button reads "Join the waiting list".

### 6.7 Currency

- Two prices, both in settings: `circles.priceUsd` (200) and `circles.priceCad` (280).
- **Default:** read the visitor's country from the host's request header (`x-vercel-ip-country`). `CA` starts on CAD; everything else, or no header, starts on USD. The country is used for this only and is not stored.
- **Toggle:** two buttons, "USD" and "CAD", on the homepage price block and in the `/apply` side panel. The choice is kept for the tab and carried from the homepage to `/apply`.
- **Display:** "$200 / month USD" and "$280 / month CAD". The currency code always follows the amount; never a bare "$".
- **Record:** the application stores `currency`. At kickoff Peter sends the Stripe payment link for that currency.
- The CAD price is a set price, not a live conversion. Peter changes it in settings.

### 6.8 Data, privacy, terms and safety

**New tables**

```sql
create table if not exists zack_runs (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  agent text not null,
  token text not null unique,
  available boolean not null,          -- false = saved as interest only
  report text,                         -- pasted by the visitor; may be null
  report_at timestamptz,
  utm text not null default '',
  created_at timestamptz not null default now(),
  unique (email, agent)
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  agent text not null,                 -- main agent; informational, not used for grouping
  other_agents text[] not null default '{}',
  role text not null,
  daily_work_use boolean not null,
  agent_count text not null,
  company text not null default '',
  profile_url text not null default '',
  zack_report text,                    -- null until step 2 is complete
  report_at timestamptz,
  exclusions text not null default '',
  timezone text not null default '',
  currency text not null default 'USD' check (currency in ('USD','CAD')),
  status text not null default 'started'
    check (status in ('started','not_yet','new','reviewing','accepted','seated','waitlist','declined','withdrawn')),
  circle_id uuid,
  notes text not null default '',
  utm text not null default '',
  source_use_case text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applications_status on applications (status);
```

**Pasted reports are sensitive.** A Zack report describes someone's work and may contain a client name that Zack missed.

- Above every paste box: "Check your report for client names or private details before pasting. Only Roger's team reads it."
- Application reports are stored in Postgres, shown only in `/admin`, never rendered on a public page, and never included in the emailed copy to the applicant.
- **Decided Nov 13:** the site makes no promise about AI tools. The wording everywhere is "Only Roger's team reads it. It is never published or shared." The codebase itself does not send application reports to a model in v1a; Peter may use his own tools when he reads them, and the privacy page says so.
- The email to Peter contains a link to the admin record, not the report text.
- Add a "delete my application and report" route by emailed link, or at minimum a stated email address for deletion.
- Rate-limit both forms by IP and email. Cap report length at 20,000 characters.

**Member runs: the site must say an AI reads them.** Once someone is a member, their weekly Zack run is read by Cora, which is an AI. The privacy page, the FAQ and the confidentiality agreement must each say that Cora processes members' weekly runs.

**The guarantee, in terms**

- A member who asks within 45 days of their Circle's kickoff date gets back every membership payment they have made.
- The request is one email to {contactEmail}. No form, no call required.
- Refunds go to the original payment method, in the currency paid, within 10 business days.
- After a refund the membership ends and the seat goes to the waiting list.
- Because billing is monthly, 45 days covers the first charge and the second. Both are refunded.
- Add this to `terms` in `src/data/legal.ts` and to `/how-it-works`. The old `/refunds` page stays hidden; it describes the old offers.

**Privacy page**

*What is wrong with today's text for this launch* (`privacy` in `src/data/legal.ts`, dated October 2026): it says nothing about the Zack tool, applications, pasted reports, members' weekly runs, Cora or currency; it is already out of date about starter-pack and watch emails; it names only Formspree, Stripe and Cal.com as services; and it does not mention that the library summarises public posts.

*Replacement text* (same plain style; replace the whole `privacy` object, set `updated` to "November 2026"; `{retention}` is Peter's decision, see section 11):

> **Intro.** Roger is a for profit company. We're responsible for the personal information this site collects. Here is all of it, in plain language.
>
> **The Zack tool.** To get the Zack instructions you give us your email address and tell us which AI agent you use. We email you a link to the instructions. Zack runs inside your own agent account; this site never connects to that account and cannot see your activity.
>
> **Your Zack report, when you apply.** If you choose to paste your report into this site, we store the text you paste. It is read by our team to assess your application, and we may use AI tools to help us read it. It is never published, sold or shared with anyone outside our team and the services named on this page. Check it for client names and private details before you paste it. We keep it {retention}, and delete it sooner if you ask.
>
> **Circle applications.** The application collects what you type into it: your name, email, the agents you use, what you do, how you use agents, your company or website, a profile link, your time zone, anyone you should not be grouped with, the currency you chose, and your Zack report. We use it to decide on your application and to place you in a Circle.
>
> **If you become a member.** Each week you send us your Zack run. An AI agent we run, called Cora, reads the runs from your Circle, removes private details a second time, merges and ranks the plays, and writes the list your Circle receives. Plays are shared with your Circle without your name. Cora runs on an AI model provided through Vercel; your runs are sent to that provider to be processed and are not used to train its models. We keep each week's runs and lists for as long as you are a member, and delete yours if you ask.
>
> **Other sign-ups.** If you ask for a starter pack, or ask to be told about new use cases or about Zack for your agent, we store your email address and what you asked for. Every email we send has a way to stop.
>
> **The use-case library.** The library summarises public posts in our own words and links to the original. It shows the author's public handle. If a post of yours is in the library and you want it removed, email us and we will remove it.
>
> **Payments and bookings.** Payments are handled by Stripe and bookings by Cal.com, each under its own privacy policy. We never see your card number.
>
> **Your country.** We read your country from the request your browser makes, to decide whether to show prices in US or Canadian dollars first. We don't store it.
>
> **Services that hold this information for us.** The site runs on Vercel, the database is hosted by Neon, and email is sent through Resend. Circle working sessions use Google Meet. These services may store information outside Canada.
>
> **Analytics and cookies.** This site doesn't run analytics. It sets no cookies for visitors. Campaign tags from the link you arrived on, and your currency choice, are kept in your browser tab.
>
> **What we do with it.** We use it to reply to you, assess applications, run Circles and see which links bring people here. We don't sell or rent your personal information, and we share it only with the services named on this page.
>
> **Your choices.** You can ask what we hold about you, or ask us to correct or delete it, including your application, your Zack report and your weekly runs, by emailing {contactEmail}. We act on deletion requests within 30 days.
>
> **Questions.** Email us at {contactEmail}.

The sentence about the model provider not training on runs must be checked against the provider's actual terms before launch; change it if it is not true. This draft is written to be accurate about what the site does; it has not been reviewed by a lawyer, and Peter should decide whether to have it and the guarantee terms reviewed before launch.

**Settings (admin-editable, with defaults in `config.ts`)**

`circles.priceUsd` (200), `circles.priceCad` (280), `circles.guaranteeDays` (45), `circles.totalSeats` (24), `circles.seatsTaken` (0, used until v2), `circles.replyDays` (2), `circles.sessionTimes` ("Tuesdays and Thursdays, 12:00 PM Eastern, on Google Meet"), `circles.missLimit` (3), `circles.playbookPreface` (the paragraph in section 2), `circles.runsAddress` (hello@meetroger.ai), `circles.runCutoff` (Sunday 11:59 PM Eastern), `circles.sendAt` (Monday 7:00 AM Eastern), `circles.sharingMode` (`manual` at launch; `auto` later, which switches the launch note), `circles.versionLabel` ("November 13, 2026 version"), `circles.applyOpen` (true).

**Founder config.** Set `siteConfig.founder.fullName` to "Peter Kuperman", `founder.photo` to `/media/peter.jpg` (square, at least 480px) and `founder.signature` to `/media/peter-signature.svg`. The letter must lay out correctly while either file is missing: initials in place of the photo, the typed name "Peter" in place of the signature.

### 6.9 Acceptance checks for v1a

1. With `circlesMode` on, no page in the header, footer, homepage, library cards or sitemap links to setup, plan, companies, packs or workshops; each of those URLs still loads and carries noindex.
2. Turning `circlesMode` off restores the current navigation.
3. A visitor can pick a live agent, enter an email, see the instructions, copy the prompt, paste a report and land on step 2 of a pre-filled application.
4. Picking an agent with no file saves interest and shows "Coming soon"; no instructions page is reachable for it.
5. Step 1 with daily = no, or 1–2 agents, saves `not_yet` and shows the "not yet" message; no step 2 is reachable.
6. Step 1 that meets the bar saves `started` and sends one email with a link back to step 2.
7. Completing step 2 moves the row to `new`, sends two emails and shows the thanks page; submitting again with the same email updates the row.
8. A visitor whose request carries country `CA` sees CA$280 first; anyone else sees US$200 first; the toggle changes every price on the page; the application stores the choice.
9. The seat line matches the database and never goes below zero.
10. A pasted report appears nowhere outside `/admin`.
11. The homepage contains no member results, testimonials, money claims, the number 24 as a count of plays, or any "by platform" wording.
12. The words "45-day money-back guarantee" appear only next to a link to its terms.
13. Lighthouse accessibility score is no lower than the current homepage's; forms and the currency toggle work by keyboard alone.
14. `npm run build` and `npm run lint` pass.

---

## 7. Version 1b: supporting pages and the real week

**Outcome:** a visitor who wants more than the homepage can read exactly how a week works, read Peter's letter in full, and find every question answered; and the homepage shows one real week, animated.

**Effort:** about 3 half-days of build, plus 2 to 3 half-days to produce the animation.

| Piece | Half-days |
|---|---|
| `/how-it-works` | 1.5 |
| `/about` | 0.5 |
| `/faq` | 0.5 |
| Real-week section: data file, numbers, poster, player | 0.5 |
| Animation production (outside the codebase) | 2 to 3 |

### 7.1 `/how-it-works`

In order, in a single narrow column except where noted:

1. **Hero.** "Your week in a Circle." One line of sub-copy.
2. **The week, day by day** (wide). A seven-row timeline: Sunday (run Zack, read it, email it), Monday 1:00 AM ET (Cora runs), Monday morning (your list arrives), Tuesday 12:00 PM ET (working session), Wednesday (use), Thursday 12:00 PM ET (working session), Friday and Saturday (use).
3. **The anatomy of a play** (wide). One real play from the pilot sort, laid out exactly as Cora writes it: rank, title and score; the description; hours saved with its range and whether it was counted or estimated; minutes saved each time; run by how many members; why it landed in its tier; then the playbook: the preface paragraph shown first, labelled "Added to the top of every playbook", then its parts (Play, Trigger, Setup first, Steps, Guardrails, Output, Pitfalls seen, Done when, Paste to install), with "Download playbook" and "Copy" buttons. Each part has a one-line margin note saying what it is for.
4. **How Cora ranks.** The five factors in plain words: hours saved, reach, ease to copy, proof, surprise. Then the three tiers and what each means, with the line "Install this week always has at least three plays." Then "Your top 3". Do not publish the weights; they will change.
5. **What gets removed.** Names, clients, companies, addresses, emails, phone numbers, prices tied to a person. Replaced with roles ("a buyer", "a listing client"). Removed twice: once by Zack, once by Cora.
6. **The three rules.** Full wording.
7. **The guarantee.** Full terms from 6.8.
8. **Closing band.** Apply.

### 7.2 `/about`

Peter's letter in full (copy in section 10), in a narrow column, with his photo at the top and his signature at the bottom. Below it, three short promises set as a list: he reads every application; he hosts the founding Circles' working sessions; the 45-day guarantee. Then the closing band.

### 7.3 `/faq`

Every question from section 10, in four groups: The Circle; Zack and Cora; Privacy; Price and joining. Each group is a heading and a list of disclosure rows. The homepage shows the top six and links here. Generate "Which agents does Zack run on?" from `src/data/zack.ts`.

### 7.4 The "One cycle" section and its animation

**What it is.** The homepage's proof: one complete weekly cycle from Roger's own pilot, with real numbers. It replaces what a member-results strip does on Hampton.

**Data source.** One file, `content/pilot/week.json`, written by hand from the real Cora sort file for that week:

```json
{
  "weekOf": "YYYY-MM-DD",
  "runsRead": 0,
  "playsRead": 0,
  "mergedPlays": 0,
  "tiers": { "install": 0, "worth": 0, "niche": 0 },
  "samplePlays": [
    { "tier": "install", "title": "", "score": 0, "hoursAWeek": 0, "runBy": 0 }
  ]
}
```

Every number on screen comes from this file. If the file is missing or `runsRead` is 0, the whole section does not render. No number is ever typed into the page.

**Layout.** Centred heading. A wide 16:9 frame. Under it, four numbers in a row: Zack runs read, plays written up, plays after merging, plays in "Install this week". No sub-copy and no caption.

**Animation storyboard** (about 40 seconds, loops, no sound required):

| Beat | Seconds | What is on screen |
|---|---|---|
| 1. Collect | 0 to 8 | Seats appear one by one; each sends a run. A counter climbs to `runsRead`. Label: "Sunday. Zack writes up each person's best plays." |
| 2. Read | 8 to 14 | Play cards fan out from each run. Counter climbs to `playsRead`. |
| 3. Merge | 14 to 22 | Cards that do the same job slide together. Counter falls to `mergedPlays`. Label: "Monday, 1:00 AM. Cora merges plays that do the same job." |
| 4. Score | 22 to 30 | Each card gains a score; cards sort into three columns: Install this week, Worth trying, Niche but great. Real titles from `samplePlays`. |
| 5. Share | 30 to 36 | The list goes out to every seat; one seat lights up with "Your top 3". Label: "Monday morning. One list. Your own top 3." |
| 6. Deploy | 36 to 40 | One card opens to "Paste to install". Label: "Tuesday. You install the best one." Loop. |

**Delivery format.** A Lottie or MP4/WebM with a poster image, produced outside the codebase and saved under `public/media/`. When no animation file is present the section shows the poster. Titles shown in the animation come from the real sort, pass the same privacy rules as the sort itself, and must not identify a person or an organisation. This is a one-time check by whoever produces the animation; it is not part of the weekly cycle.

### 7.5 Acceptance checks for v1b

1. `/how-it-works`, `/about` and `/faq` are in the header, footer and sitemap; the homepage anchors still work.
2. The play shown in "The anatomy of a play" is a real play from the pilot sort, with no name, client or organisation in it.
3. Every number in the real-week section equals the value in `content/pilot/week.json`; deleting the file removes the section and nothing else breaks.
4. With `prefers-reduced-motion`, the animation does not play; the poster and numbers are shown.
5. The guarantee terms on `/how-it-works` and in `/terms` are word-for-word the same.

---

## 8. Version 2: admin, Circles and the automatic weekly cycle

**Outcome:** Peter can review applications, accept or decline, seat people in a Circle and see when a Circle is full. The weekly cycle runs with nobody in the loop: members' runs come in by email, Cora ranks them, and each member's list goes out on Monday morning.

**Effort:** about 9 half-days. Applications and Circles are 4; the weekly cycle is 5.

**Features in this version**

| # | Feature | Half-days |
|---|---|---|
| 1 | Applications admin: list, filters, detail, status, notes, CSV | 2 |
| 2 | Circles board: seats, create, mark full, kickoff date | 1.5 |
| 3 | Zack runs screen and Overview numbers | 0.5 |
| 4 | Automatic run intake from email | 1 |
| 5 | Cora on a schedule, with the sort stored | 1.5 |
| 6 | Automatic Monday send, one email per member | 1 |
| 7 | Playbook download links | 0.5 |
| 8 | "This week" status panel and failure handling | 1 |

**New tables**

```sql
create table if not exists circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- e.g. "Founding Circle 1"
  seats int not null default 8,
  status text not null default 'forming' check (status in ('forming','full','running','closed')),
  kickoff_on date,
  is_public boolean not null default false,   -- show its progress on the homepage
  created_at timestamptz not null default now()
);

create table if not exists weekly_runs (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles (id),
  application_id uuid not null references applications (id),
  week_of date not null,               -- the Monday of the week
  run_text text not null,              -- the Zack run as the member sent it
  received_at timestamptz not null default now(),
  unique (application_id, week_of)
);

create table if not exists cora_sorts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles (id),
  week_of date not null,
  sort_md text not null,               -- Cora's file, exactly as written
  runs_read int not null,
  status text not null default 'ready' check (status in ('ready','sent','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (circle_id, week_of)
);
```

There is no `platform` column on `circles`. A member's agent lives on their application and is shown for information only.

**Admin pages**

1. **Applications** (`/admin/applications`): table with name, agent, agent count, daily use, currency, status, date. Filters by status. `started` rows (step 1 only) sit in their own filter with a "Send reminder" button; `not_yet` rows are kept for the record. A detail view shows every field and the Zack report in a readable panel, a status control, a Circle selector listing every forming Circle, a warning if the applicant's company or exclusions match someone already in that Circle, and private notes. CSV export without the report column.
2. **Circles** (`/admin/circles`): one card per Circle with eight seats, filled seats named with their agent, the mix of agents, status. Create a Circle (name, seats). When the eighth member is seated the card offers "Mark full and set kickoff date".
3. **This week** (on each running Circle's card, and `/admin/circles/[id]`):
   This panel shows status. Nothing on it is an approval step.
   - **Runs in:** eight rows, one per member: received with time, or missing, plus a count of weeks missed in a row. "Add a run" is for a run that arrived some other way.
   - **Cora:** status of this week's sort (waiting, ready, sent, failed), runs read, the counts per tier, and the time it will send. "View the sort" shows the file read-only. "Run Cora now" runs it on demand.
   - **After a failure:** "Send now" sends a sort that missed its send time.
   - **Misses:** a member at the miss limit is flagged. Nobody is removed automatically.
4. **Zack runs** (`/admin/zack`): counts by agent (unlocked, pasted, applied), and the coming-soon interest list by agent, so Peter can see which agent file to write next.
5. **Overview** tab gains: applications this week, started but not finished, seats filled out of 24, runs received this week out of members, runs by agent.

**The weekly cycle.** From a member's email on Sunday to their list on Monday, no person takes part. Cora's behaviour is defined in `Cora The Curator v1.1.md`, not here; this spec covers the plumbing around her.

*Run intake*

- Members email their Zack run to the address in `circles.runsAddress` (hello@meetroger.ai at launch). An inbound-email webhook from the mail provider passes each message to the site.
- A message is a run when its sender matches the email of a seated member. The run text is the message body, or a `.md` or `.txt` attachment if there is one. It is stored in `weekly_runs` for the coming Monday.
- A second run from the same member before the cut-off replaces the first.
- The member gets an automatic one-line reply: run received for the week of {date}.
- Mail from anyone else is left alone; the address is also Roger's contact inbox.
- The cut-off is `circles.runCutoff` (Sunday 11:59 PM Eastern). A run that arrives later counts for the following week.

*Cora*

- A Vercel Cron route, `/api/cron/cora`, scheduled at 05:00 and 06:00 UTC on Mondays. It runs only when the time in Toronto is 1:00 AM, so it survives the clock change.
- For each running Circle it gathers that week's `weekly_runs`, calls Cora through the existing AI Gateway setup (`src/lib/ingest/extract.ts` shows the pattern), and stores her file in `cora_sorts` as `ready`.

*Monday send*

- A second cron route, `/api/cron/send`, runs when the time in Toronto is `circles.sendAt` (7:00 AM). For each `ready` sort it emails every member who sent a run, then marks the sort `sent`.
- Each email holds the Summary, the three tiers and **only that member's own** "Your top 3" section. Cora's file holds every member's top 3; an email must never include another member's.
- A member with no run that week gets one line: no run, no list this week.
- Every play in the email has a "Download playbook" link to that one play as a `.md` file. The file starts with the preface from `circles.playbookPreface`, then the playbook exactly as Cora wrote it. Links are signed per member and stop working when the membership ends.

*When something fails*

- If Cora errors, or there is no `ready` sort at send time, nothing is sent to members, the sort is marked `failed`, and Peter gets an alert email.
- "Run Cora now" and "Send now" in the admin recover it.

**Emails (Resend, plain and short)**

- **Automatic:** the Zack instructions link; the link back to step 2 of an application; run received; Monday's list; no run this week; the failure alert to Peter.
- **Sent by Peter, by button:** step 2 reminder, accepted (next steps and a booking link), waitlist, declined (kind, brief), Circle full (kickoff date, billing starts that day, how to send a run, session links), Zack for {agent} is ready. Nothing goes out automatically on an application status change.

**Seat line** now reads from `applications` and `circles`. The homepage may also show one line per forming Circle, for example "Founding Circle 1: 5 of 8", only for Circles Peter marks as public.

**Billing is not built here.** At kickoff Peter sends the Stripe payment link for the member's currency by email. Record `paid_from` on the application by hand. Refunds under the guarantee are done in Stripe by hand.

**Acceptance checks:** an application can move through every status; a member can be seated in any forming Circle, whatever their agent; a Circle cannot exceed its seats; the public seat line changes within a minute of seating someone; reports and runs are visible only when signed in; the Monday email to one member contains no other member's top 3 and no member's name against any play; the cron produces at most one sort per Circle per week; a downloaded playbook starts with the preface, word for word; a run emailed by a seated member before the cut-off appears in `weekly_runs` with no one touching it; with eight runs in by Sunday night, eight emails go out at the send time with no one signed in; if Cora fails, no member email is sent and Peter is alerted.

---

## 9. Version 3: the library as a lead engine (internal)

**Outcome:** the Lomax sheet stops being only content and becomes a ranked list of people to talk to, with the reply drafted and the result tracked. Nothing in this version appears on the public site except the tracked links.

**Effort:** about 6 half-days.

**Why it fits here.** `sheet_posts` already holds every post with its handle, agent, tab, tag, views and likes, refreshed hourly. The engine is a scoring pass and three admin screens on top of that table. Because Circles are no longer grouped by agent, every prospect is a possible member; the agent only decides whether they can run Zack today.

**Scoring (one row per X handle)**

```sql
create table if not exists prospects (
  handle text primary key,
  posts int not null default 0,
  work_posts int not null default 0,       -- tabs other than the personal ones
  multi_agent_posts int not null default 0, -- summary mentions bots plural, a bot team, or "team of"
  agents text[] not null default '{}',
  last_post_at timestamptz,
  median_views int,
  score int not null default 0,
  stage text not null default 'new'
    check (stage in ('new','queued','replied','engaged','ran_zack','applied','member','skip')),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists outreach (
  id bigserial primary key,
  handle text not null references prospects (handle),
  post_id text not null,
  draft text not null,
  sent_at timestamptz,
  link_code text unique,                    -- short code for a tracked link
  created_at timestamptz not null default now()
);
```

Starting score: repeat poster (2 or more posts) +3; each work-tab post +1, capped at 5; any multi-agent post +3; posted in the last 14 days +2; median views under 1,000 +1 (small accounts answer); median views over 50,000 −2; tagged caution only −1. Weights live in settings so Peter can tune them. Personal tabs: Household, Travel, Errands, Kids, Homework, Caregiving, Health.

**Admin screens**

1. **Prospects:** ranked list with the person's posts inline, agent, score and stage. Bulk "queue for today".
2. **Today's replies:** a queue of 20 to 30. For each: the original post, a drafted reply, an edit box, "Copy reply", "Open post on X", and "Mark sent". **A person posts every reply by hand.** X has blocked most automated replies through its API since February 2026, and the site must not post on Peter's behalf.
3. **Funnel:** counts by stage and by week; replies sent, link clicks, Zack runs, applications started, applications completed, members; broken out by library tab and by agent.

**Drafting.** Use the existing AI Gateway setup. Each draft must refer to the specific thing the person did, add one useful observation or question, and at most mention Zack as something they could run on themselves. No link in a first reply unless Peter adds it. Drafts are suggestions; nothing is stored as sent until Peter marks it.

**Tracked links.** `/z/{code}` redirects to `/zack?ref={code}` and records the click against the outreach row. `zack_runs` and `applications` store `ref`, which lets the funnel connect a reply to an application. This is the only public surface of v3.

**Weekly "best plays" post.** A screen that lists the week's top library entries by tab with their authors' handles, to assemble a post that credits each author. It reuses `used_in_post` in `sheet_posts` to avoid repeats. It uses public library entries only, never anything from a Circle.

**Acceptance checks:** prospects rebuild from `sheet_posts` in one command; a handle's posts and score are explainable on screen; no code path posts to X; a tracked link attributes a Zack run and an application to the reply that produced it; the funnel totals reconcile with the tables.

---

## 10. Copy

Everything below is draft copy for the builder to place. Peter edits before launch.

### 10.1 Homepage

**Headline:** "Stop figuring out AI agents alone."

**Sub-line:** "A Roger Circle is a confidential group of eight people who use AI agents heavily for work. Any agent: Claude, Grok Bot, Duet, Hark and more."

Then three lines:

- "Sunday: an agent called Zack collects everyone's best uses."
- "Monday: the Circle's best plays arrive ranked, with your own top 3."
- "Tuesday: you get better at using agents."

**Hero cycle labels:** Deploy (Tuesday) · Use (All week) · Collect (Sunday) · Share (Monday). Centre: "Every week · Get better, get sharper".

**Primary button:** "Apply for a founding Circle". **Secondary:** "Or run Zack on yourself first".

**Agent strip:** "Zack runs on" Claude · Grok Bot · Duet · Hark. "Coming soon" Instinct · Muse · Dots · Viktor. Line: "Circles mix agents. Every playbook tells your own agent to adapt it to your setup and install it."

**One cycle:** heading "One cycle, start to finish." No sub-copy and no caption (Peter's edit on the canvas, Nov 13). Number labels: "Zack runs read", "plays written up", "plays after merging", "in Install this week".

**Why use a Roger Circle**

1. "Find out what are the most useful things people do with AI Agents." Sub: "The best uses involve clients and money, so they rarely get posted. In a Circle, seven peers show you theirs every week."
2. "Get playbooks you can send directly to your agents." Sub: "Every playbook opens with one instruction to your own agent: adapt this to my setup and install it, asking me questions as needed."
3. "Get better at getting better, every week." Sub: "Each Monday's list is ranked for the Circle, then re-ranked for you, so you always know the one thing to try next."

**How a Circle works**

1. "Join seven other trusted professionals." Sub: "We group Circles by diverse use cases, not by agent, so you get fresh ideas for your AI agents every week."
2. "Add Zack to your account." Sub: "He lives in your account and reads your week of agent activity."
3. "Sunday: Zack writes up your best plays." Sub: "Each one becomes a playbook, with client details and sensitive information removed."
4. "Monday: Cora ranks the Circle's plays." Sub: "Stack ranked by usefulness, ready to install: Install this week, Worth trying, Niche but great. Your own top 3 are picked for the work you do."

**Under the diagram:** "Cora scores every play on five things: hours saved, reach, ease to copy, proof and surprise. Time only. No income claims."

**Launch note (`sharingMode = manual`), labelled with `circles.versionLabel`:** "v1: You run Zack on Sunday and email the result to hello@meetroger.ai. Cora ranks the Circle's plays overnight, and your list is in your inbox on Monday morning."

**Launch note (later, `sharingMode = auto`):** "Zack runs on a schedule in your account and sends your plays to your Circle. You have 48 hours to pull any of them first."

**What you get**

- "A ranked list every Monday." Sub: "The Circle's best plays in three tiers. Each comes with a full playbook: what it does, how to set it up, and the time it saves."
- "Your own top 3." Sub: "Three plays you don't already run, picked for the kind of work you do."
- "Install help." Sub: "When a play won't run on your setup, we help you get it working."
- "Two working sessions a week." Sub: "Tuesdays and Thursdays at 12:00 PM Eastern on Google Meet, one hour each, optional. Bring what you're building."

**Three rules:** heading "A Circle runs on three rules."

- "Contribute." "Send your Zack run by Sunday night. No run, no list that Monday. Miss three weeks in a row and your seat goes to the waiting list."
- "Confidential." "Nothing shared in your Circle leaves it. Plays are anonymous: the list says 'run by 3 members', never who."
- "Candid." "Share what failed as well as what worked. A play that wasted your week saves seven other people theirs."

**Who gets in:** heading "Who gets in."

- "You use AI agents for your work every day."
- "You run three or more agents, bots or scheduled routines."
- "You've run Zack and can show real plays from the past week."

**Not for you if:**

- "You're just getting started. Run Zack for free and see where you stand."
- "You want a course. Nobody teaches here. Members trade what works."
- "You'd rather not share. A Circle is give to get."

**Vetting:** heading "Circles work because every member is vetted." Sub: "Peter reads every application himself."

1. "Qualify." "Six short questions."
2. "Run Zack." "One prompt, in your own account. Add the report to your application."
3. "Review." "Peter reads your report and replies within 2 business days."
4. "Call." "A short conversation about how you work. It isn't a sales pitch."
5. "Agreement." "Every member signs a confidentiality agreement before joining."
6. "Kickoff." "When your Circle has eight members, you get a kickoff email. Billing starts that day."

**Library proof:** "{total} real uses collected from public posts." Closing line: "This is what people post. A Circle gets what they don't."

**Run Zack block:** "Zack reviews your past week with your agent, picks your best plays and estimates the time each saved. It runs in your own account. Your report is the main part of a Circle application. Nothing reaches Roger unless you paste it."

**Price block:** "{price} / month {currency}". "Billing starts the day your Circle starts, and each Circle starts when its eight seats are filled. Leave any time." Guarantee: "45-day money-back guarantee. If a Circle isn't for you, tell us within 45 days of kickoff and we refund what you've paid." Link: "Guarantee terms". Seat line: "Three founding Circles · 24 seats · {seatsLeft} left".

**Closing band:** "Already running agents every day?" "Find out what the other seven know." Button: "Apply for a founding Circle".

### 10.2 The letter

Short version (homepage). The `/about` version adds the two paragraphs marked *(about only)*.

> Hey there,
>
> I'm Peter Kuperman. I run AI agents every day, including my own AI chief of staff, and I deploy them inside companies for a living.
>
> Here is what I kept noticing. The most useful things people do with agents never get posted. They involve clients, money and how the business actually runs. What does get posted is the highlight reel. So everyone works out the same things alone, a few months apart.
>
> *(about only)* Every morning Roger reads public posts about what people's agents do and adds the real ones to a library. It holds {total} of them now. Reading them, one thing stands out: the people getting the most from agents are not the ones posting the most.
>
> A Circle fixes that. Eight people who already use agents heavily. Every Sunday an agent called Zack writes up what worked for each of you. Every Monday you get the best of it, ranked, with private details removed.
>
> I read every application myself, and I host the working sessions for the founding Circles.
>
> *(about only)* A bit about me. I made my first real estate investment at 17 and still own it. I spent 17 years in real estate finance, then built a company that taught children to code and went on to build AI software for businesses. I studied finance and computer science at Penn.
>
> If you're already running agents and suspect you're using a fraction of what they can do, apply.
>
> Peter

On the homepage the bio paragraph is replaced by one line under the signature: "Peter Kuperman · 17 years in real estate finance, then software and AI · Finance and computer science, Penn".

### 10.3 Application

**Step 1 heading:** "First, six questions." Sub: "This tells us whether a Circle fits you yet."

**Not-yet message:** "Circles are for people running three or more agents every day. You're not there yet, and that's fine. Run Zack on yourself for free, and apply again when you are."

**Step 2 heading:** "Now your Zack report." Sub: "It's the main part of your application. Only Roger's team reads it. It is never published or shared."

**Save for later:** "Save and finish later. We'll email you a link."

**Thanks page:** "Thank you. Peter will read it himself." "You'll hear back within 2 business days."

### 10.4 Questions

The six marked ★ appear on the homepage.

**The Circle**

- ★ *How much time does it take?* "Run Zack on Sunday and read Monday's list. The two working sessions are optional."
- ★ *I use a different agent from everyone else. Does that matter?* "No. Circles mix agents on purpose. Every playbook opens with a line that tells your own agent to adapt it to your setup and install it, asking you questions as needed. Install help is there if it gets stuck."
- *When are the working sessions?* "Tuesdays and Thursdays at 12:00 PM Eastern on Google Meet. Both are optional."
- *What if I miss a week?* "No run on Sunday means no list on Monday. Miss three weeks in a row and your seat goes to the waiting list."
- *Will I be in a Circle with a competitor?* "No. Tell us who to keep you apart from when you apply."
- *Can I sell to the other members?* "No. A Circle is for trading what works, not for finding customers."
- *How is this different from a course or a newsletter?* "Nobody teaches. Everything in Monday's list was run that week by someone in your Circle, on real work, and comes with the playbook."
- *When does it start?* "When your Circle's eight seats are filled. We'll tell you where it stands."

**Zack and Cora**

- ★ *What does Zack read?* "Your activity inside your agent account for the past seven days. He runs there, under your account."
- *Which agents does Zack run on?* "Claude, Grok Bot, Duet and Hark today. Instinct, Muse, Dots and Viktor are coming. Pick yours on the Zack page and we'll email you when it opens." (Generated from the list.)
- *Who ranks the plays?* "Cora, an agent Roger runs. She merges plays that do the same job, scores each on hours saved, reach, ease to copy, proof and surprise, and sorts the best into three tiers."
- *What is a playbook?* "Instructions an agent can follow: what triggers the play, what to set up first, the steps, the guardrails, what you get and the pitfalls members hit. It opens with one line that tells your own agent to adapt it to your setup and install it."
- *What if I don't use agents much yet?* "Run Zack on yourself for free and see. Circles are for people already running several."

**Privacy**

- ★ *What leaves my account?* "Your Zack run, with client names and private details removed. In v1 you read it and email it yourself."
- ★ *Who sees my plays?* "The other members of your Circle and Roger's host. Plays are anonymous: the list says 'run by 3 members', never who."
- *Does an AI read my run?* "Yes. Cora does, to rank it. Your application report is read only by Roger's team, and is never published or shared."

**Price and joining**

- ★ *What's the guarantee?* "If a Circle isn't for you, tell us within 45 days of kickoff and we refund what you've paid."
- *US or Canadian dollars?* "Either. US$200 or CA$280 a month. You choose when you apply and you're billed in that currency."
- *Can I leave?* "Any time. Billing is monthly."
- *When am I charged?* "From the day your Circle starts. Nothing is charged to apply."

---

## 11. What Peter still needs to supply

| # | Item | Needed for |
|---|---|---|
| 1 | Nothing: the Zack files for Claude, Grok Bot, Duet and Hark (all v1.8) are already in `artifacts/Zack/` | Those four agents showing as live. |
| 2 | Zack files for Instinct, Muse, Dots and Viktor | Opening those agents. |
| 3 | The pilot week: the real Cora sort file, turned into `content/pilot/week.json`. Everyone whose plays appear has agreed (confirmed Nov 13) | The "One cycle" section (it stays hidden without it). |
| 4 | The animation, to the storyboard in 7.4 | The animated version of that section (the poster shows without it). |
| 5 | LinkedIn headshot at `public/media/peter.jpg` and a signature at `public/media/peter-signature.svg` | The letter's photo and signature (both have fallbacks). |
| 6 | An edit and approval of the letter in 10.2 | The letter on the homepage and `/about`. |
| 7 | The confidentiality agreement, off the site. It must say that Cora, an AI, processes members' weekly runs | Seating the first member. |
| 8 | A decision on how long reports are kept, and a read of the privacy text and guarantee terms in 6.8 | The privacy and terms pages. |
| 9 | Two Stripe payment links: US$200 and CA$280 a month | The first kickoff. |
| 10 | The recurring Google Meet links | The kickoff email. |
| 11 | Confirmation of the `Cora The Curator v1.1.md` draft, which applies the changes in section 12 | The first Monday list. |
| 12 | Nothing: Zack for Claude can see chats inside Claude projects (confirmed Nov 13) | The Claude instructions page does not show its projects note. |

## 12. Changes from Cora v1.0 to v1.1

These six changes are applied in `Cora The Curator v1.1.md`.

| # | In Cora v1.0 | Change in v1.1 |
|---|---|---|
| 1 | Surprise is weighted 20 in the formula and table, but its heading says "weight 10" | Weight 20 everywhere, so the weights total 100. |
| 2 | Ease to copy ranks complexity in descending order, so the most complex play gets 10 points | Rank ascending: the simplest play gets 10. |
| 3 | The "Scores" line prints each factor as 0 to 5; the factors are scored 1 to 10 | Print each factor as 1 to 10. |
| 4 | "Install this week" needs the top three deciles in reach, proof and hours, which can leave it empty | Widen until the tier has at least three plays (decided Nov 13; wording below). |
| 5 | Hours saved says "after the Current hours a week is calculated", but the rule above it uses the higher of current hours and half the heavy-user hours | Rank on the hours figure: the higher of the two. |
| 6 | Playbooks carry no instruction to the receiving agent | Write the preface (section 2) as the first paragraph of every playbook (decided Nov 13). |

Cora still writes one file per Circle and sends nothing to members herself. The site splits that file per member and sends it (section 8).

**Wording for Cora's Step 3** (replaces tiers 1 and 2; tier 3 is unchanged):

1. **Install this week**: start with the plays in the top 3 deciles on reach, proof and hours saved. If fewer than 3 plays qualify, widen to the top 4 deciles on all three, then the top 5, and so on. Stop at the first width that gives at least 3 plays. If the Circle has fewer than 3 merged plays in total, show them all.
2. **Worth trying**: the plays within two deciles beyond the width "Install this week" stopped at, on all three, that did not make "Install this week". When Install stops at 3 deciles this is the top 5, as before; when it stops at 5, this is the top 7.

"Show up to 5 plays per tier" still applies. "Worth trying" keeps a two-decile gap behind "Install this week" so that a widened top tier does not empty it.

The site says: "Install this week always has at least three plays."
