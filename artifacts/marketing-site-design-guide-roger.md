# Marketing site design guide for coding agents: meetroger.ai (Roger only)

**Who this is for:** a coding agent (Cursor, Claude Code or similar) designing and building the public marketing pages of meetroger.ai so they look like a skilled designer made them, with no "AI slop", while staying exactly inside Roger's product decisions, design system and claims rules.
**Compiled:** Thursday, November 26, 2026 (America/Toronto).
**How to use it:** read all of Part A (Roger's fixed facts and rules) before anything else. Part B applies the techniques from the two source posts to Roger. Parts C–F are the process, rules, checklists and acceptance checks. Part G is the ready-to-paste prompt. The appendix repeats the full source notes (both posts, the verbatim Kamens prompts, the other sources) so this file stands alone.

**Labels used in this file**

- **[Spec]** A Roger fact or rule from `/workspace/website-spec/james-camarota-website-spec.md` (compiled from the "Your new site" email thread with James Camarota and its attachments, chiefly *Roger v3 - design spec.md* v1.1, which Peter called "the final word for this build"). Where the spec cites a section (0.7, A.4, A.16 …) it is noted.
- **[Kamens]** Ben Kamens, "How we built olddogs.ai with lots of agents but zero slop", X Article, posted Oct 1, 2026 (10:32 PM ET): https://x.com/kamens/status/2105848263505285450; blog version with the full prompts: https://olddogs.ai/blog/how-we-made-olddogs-ai-with-ai
- **[Kamens skill]** His `design-build-loop` skill: https://olddogs.ai/blog/how-we-made-olddogs-ai/design-build-loop.zip
- **[Yakko]** Yakko (@yakkomajuri), "How my vibe coded website looks like a designer made it", X Article, posted Aug 10, 2026 (1:33 PM ET): https://x.com/yakkomajuri/status/2086868581619581262; the site: https://railcode.dev
- **[Every]** Jack Cheng, "Designing with AI: make a jig" (linked by Kamens): https://every.to/p/designing-with-ai-make-a-jig
- Full notes on all of these are in Appendix X.
- **[Anthropic skill]**, **[Anthropic cookbook]**, **[Refactoring UI]**, **[Vercel WIG]**: other respected sources, kept separate (appendix X4).
- **[Observed]**: what this guide's author saw on live sites on Nov 26, 2026.
- **[Guide]**: used in the appendix for synthesis in the generic guide rather than a quote from a source.
- **[Suggestion]**: this guide's idea for Roger. Not in the spec. Needs Peter's (or the builder's) OK before it ships.

**The rule of precedence:** the spec wins over every technique in this guide. Where a source post suggests something the spec forbids, follow the spec and use the technique only inside it. [Anthropic skill: "the brief's own words always win"]

---

## Part A. Roger's fixed facts and rules (from the spec)

### A1. What Roger is [Spec, 0.1–0.2]

Roger makes each user's AI agents better every week. Zack, the collector, runs in the user's own agent account each Sunday and writes up the week's most useful work as "plays", with private details removed. Roger pools the plays from contributing users. Early Monday, Cora, the curator, picks the three plays most worth adopting for each user and sends them, each with a playbook the user pastes into their own AI agent to install. New users get two free Monday lists and add a card when they start. After that they choose US$200 a month (presented as the clear pick) or US$100 for one list at a time.

**Goal of the marketing site:** "A visitor understands in ten seconds what arrives on Monday, believes a real person runs it, sees exactly what it costs and when the card is charged, and starts the free trial." [Spec, A.1]

Peter's earlier brief, which the spec still serves: a site that conveys the value of a compounding weekly loop (Zack collects, Cora curates three personalized improvements, they're installed, and the next week compounds on the last). [Spec]

**Deadline:** live on meetroger.ai on November 30, 2026, ahead of Peter's December 1 meeting with a real estate distribution partner. Preview URLs are fine until then. [Spec]

**Brand direction from Peter:** "mastery and excellence: with Roger, you develop mastery and excellence in your agent setup." No logo or brand files yet; the chef's hat is a placeholder; Peter "kind of like[s] a magnifying glass indicating detective work." [Spec]

### A2. Two audiences [Spec, 0.2, A.1]

| | Homepage `/` | `/agents` |
|---|---|---|
| Reader | People in real estate. Most have no AI agents yet, or one they barely use. | People who already run AI agents daily for work. Sceptical of hype. |
| What they need to hear | Other people in your business have worked out what to use AI agents for. You get their best three ideas each week, ready to install. | You are working out the same things alone that others already solved. Trade plays. |
| First step after sign-up | Install an AI agent and the starter team | Install Zack |
| Secondary button | "See how it works" | "Run Zack on yourself first" |

The individual user is the buyer. [Spec]

### A3. Hard rules (never break these)

1. **No income claims.** No income, revenue or productivity promises in Roger's voice. [Spec, 0.4; Peter's standing rule]
2. **No time-saved promises in Roger's voice.** A named user's own words in a cleared testimonial may include time saved, but the figure must never be restated as Roger's claim. Source materials (the forwarded sample report, the Monday Morning Playbooks v1.0 prototype, the idea-card time line and tiles in 0.7) contain time figures; do not copy them onto the site as Roger's claims. Whether any time figure belongs on the public sample card is an open decision for Peter. The compounding section has its own hard rule: "No numbers about time or money." [Spec]
3. **No user counts and no hard-coded numbers.** No "join hundreds". The only live count allowed is the count of public use cases read from the database. [Spec, 0.4]
4. **Never name the brokerage**, and never suggest a brokerage is an enterprise customer. [Spec, 0.4]
5. **Vocabulary:** software is always "AI agent" or "AI agents", in full. On every page except `/agents` and `/zack`, never write "agent" or "agents" without "AI" in front, because readers in real estate are also called agents. People are "you", "people in real estate" or "users". [Spec, 0.4]
6. **Never hide the card or the charge date.** "Card required. Charged only with your third list." sits under the hero buttons. The trial line always sits directly under the prices. [Spec, A.4, A.5]
7. **No legal assurances the product cannot back.** [Spec, 0.4]
8. **"Works with every agent"** is allowed; a list of "supported" agents that includes one with no Zack file is not allowed without the word "adapt". [Spec, 0.4]
9. **Testimonials** only if their cleared switch is on, word for word, first name and last initial. No carousel; a simple column or grid; filtered by audience; absent if none are cleared (currently off). [Spec, A.4]
10. **No stock photography. The only photograph on the site is Peter.** [Spec, 0.5, 0.7]
11. **Tone:** plain, direct, exact. Short sentences, second person. No hype words, no exclamation marks, no emoji. Numbers only where real. [Spec, A.1]

### A4. The existing design system (keep every token) [Spec, 0.5, 0.7]

All tokens live in `src/app/globals.css`. Keep:

- **Typeface:** Mona Sans.
- **Light "ground" pages with dark "night" chapters.** (The spec also names a "ground-2" variant, used for the compounding section, and a "surface".)
- **One accent, copper:** `--color-accent: #9a5226`, used only for the primary button and text links.
- **One 8px corner** radius.
- **Generous white space.**
- **No stock photography;** the only photograph is Peter.

**Layout rules carried from the Circles design:** centred section headings with one or two lines of sub-copy, about 44rem wide; long-form text in one narrow column, about 40rem; numbered steps with a large pale numeral above a short title; the primary button in the hero, the price block and the closing band, with text links between. [Spec, 0.7]

**Data palette (graphics only):** Cora's five score bars, the bricks, and the compounding graph. Text is never set in these colours and they never mark an action. Starting values: hours saved `#b86a12`, reach `#2a6aa8`, ease `#2c8463`, proof `#6650b4`, surprise `#b0457a`. Brick and graph levels use reach, ease, proof, surprise, hours, in that order. The "you are here" dot is `#c63b2b`. Check at least 3:1 contrast against ground and surface, add lifted versions for night chapters, adjust lightness if needed but keep the hue. Every bar and brick also carries a text label or number, so colour is never the only signal. [Spec, 0.7]

**The recurring visual is bricks** (not the older eight seats). Three bricks arrive each Monday and the stack grows. It appears in the homepage hero, in "how it works", in the Monday email header (app) and in the dashboard's compounding graph (app). A brick is a small rounded square. An empty slot is an outlined square; a brick the user has set up is filled in the level colour. This is the later form of Peter's "lego bricks" idea: start with 3, add 3 each week, show week 3 and then week 26. [Spec, 0.7]

**The idea card:** one component, used in the Monday view, the email (simplified, app side) and as the sample on the public site. Front: title, the user's personal score out of 100, one sentence on why it fits them, and a time line. Pull-out sheet: description, four tiles, the "paste to install" block with a "Copy prompt and playbook" button, Cora's five scores as bars, the playbook, and a note on how time figures were worked out. The structure comes from the *Monday Morning Playbooks v1.0* prototype, restyled in the site's tokens; the prototype's tier trays, tier colours, purple accent and two typefaces are not used. Peter said v1.0 "has too much information, but it's a start." The time line and time tiles are not cleared as claims (see A3.2). [Spec, 0.7]

**Logo:** not designed. The chef's hat is a placeholder; Peter leans toward a magnifying glass (detective work). [Spec]

**Reference sites for the marketing feel**, sent by Peter and agreed by James: https://theacademysf.com/, https://earth-ai.com/, https://maticrobots.com/. "The shared direction is more visual, less text, and a story told as you scroll." [Spec]

**Later visual references (Nov 24):** Peter sent the two posts this guide is built on (Yakko and Kamens) "so the site and project are outstanding". "These are inspiration, not a requirement to copy either site." [Spec]

**Work from the existing design system, then make the marketing pages better than a straight build of the spec.** Peter asked James to "throw away everything bad and reimagine it to actually be cool and good." Layout is the builder's decision inside the design system. [Spec]

### A5. Accessibility (from the spec) [Spec, 0.7, A.16]

Keep the existing contrast ratios, skip link, visible focus and reduced-motion behaviour. Every form field has a visible label and an inline error. Toggles are real buttons with `aria-pressed`. The pull-out sheet traps focus, closes on Escape and returns focus to the card that opened it. Forms work by keyboard alone; the accordion and the currency toggle expose their state; **nothing moves under `prefers-reduced-motion`**. Checks at five widths.

### A6. Pages and sections [Spec, A.2–A.12]

**Public routes:** `/` (rebuilt, real estate homepage), `/agents` (new, for people who already run AI agents), `/pricing`, `/how-it-works`, `/faq`, `/about` (Peter's letter), `/zack` and `/zack/[agent]` (free Zack run, linked from `/agents` only, never from the homepage), `/library` (kept, adds a trial band), `/privacy` and `/terms` (rewritten drafts until Peter has read them). `/apply` redirects to `/start`. Hidden legacy routes stay noindex with no links. The unlisted partner pages named in the spec stay unchanged and keep their own header behaviour. `/start`, `/signin`, `/getstarted`, `/app/*` and `/admin/*` are the app (Peter's): link to them, don't build them.

**Header:** How it works, Pricing, Use cases (`/library`), FAQ, About. Right side: "Sign in" text link to `/signin`, and the button "Start free" (short) or "Get two free Monday lists" (long) to `/start`. A signed-in visitor sees "Open Roger" to `/app` instead. The header must not block rendering on the signed-in check. No header button on `/start/*`, `/signin`, `/app/*`.

**Footer:** contact email, Pricing, How it works, FAQ, About, Use cases, For people who run agents (`/agents`), Privacy, Terms.

**Shared blocks, built once:** the brick stack; the night price block; testimonials (absent when none are cleared); the sample idea card (absent until a play is chosen in the admin); the "You decide what Zack shares" control block; the questions accordion; the night closing band (one line, the primary button, the trial line).

**Homepage `/`, in order:**

1. Hero (night): headline, sub-line, primary button "Get two free Monday lists", secondary link "See how it works", the brick stack with three bricks arriving, and under the buttons in small type "Card required. Charged only with your third list."
2. The problem (ground): three short statements.
3. How it works (night), id `how`: four numbered steps (set up your AI agents; Zack reviews your week; Cora picks your three ideas; paste to install). The brick stack grows across the four steps.
4. What arrives on Monday (ground): the sample idea card, with "This is one idea, as it arrives." Absent until a play is chosen.
5. It compounds (ground-2): a 26-week compounding picture, three bricks at the start, three more each week. One sentence. No numbers about time or money. (Static vs animated is an open question; see A10.)
6. What people say (ground): testimonials for audience `re`; absent if none are cleared.
7. You decide what Zack shares (ground): the control block.
8. Who runs this (ground): the first three paragraphs of Peter's letter, his photograph, a link to `/about`.
9. Price (night): the price block.
10. Questions (ground): six homepage questions and a link to `/faq`.
11. Closing band (night).

Every Circles section is removed from view; keep those components in the repo.

**`/agents`:** same blocks, different copy and order. (1) Hero (night) with a pain-led headline, primary "Get two free Monday lists", secondary "Run Zack on yourself first" to `/zack`; under it a text-only strip generated from `src/data/zack.ts`, headed "Works with every agent", with the line "Zack files for Claude, Duet, Grok Bot and Hark. Any other agent adapts one with a single prompt." (2) Problem (ground). (3) How it works (night), three steps. (4) Sample idea card (ground). (5) Control block (ground), placed higher "because security questions come first". (6) Testimonials (audience `agents` or `both`; absent if none). (7) Price (night). (8) Questions. (9) Closing band. Every start button links to `/start?path=agents`.

**`/pricing`:** the price block full width, monthly first and marked as the choice most people make; "What is included" as a plain list; "Monthly or one at a time, explained" in two short columns with "Two lists one at a time cost the same as a whole month."; "How contributing works" (a short explanation, not a plan to choose); "No refunds", stated plainly; primary button.

**`/how-it-works`:** narrow column, long form. The week (Sunday to Wednesday); Zack in detail (id `zack`) with a link to the public Zack files; Cora in detail (five scores: hours saved, reach, ease to copy, proof, surprise; never sends what you already run; never names who a play came from); the anatomy of an idea (the sample card with a one-line margin note on each part: Play, Trigger, Setup first, Steps, Guardrails, Output, Pitfalls seen, Done when, Paste to install; the preface paragraph first, labelled "Added to the top of every playbook."); your first two weeks; if you have no AI agent yet (link to `/getstarted`).

**`/faq`:** all questions, grouped: Getting started; Zack and privacy; Cora and the ideas; Price and billing. One to three sentences each.

**`/about`:** Peter's letter in a narrow column with his photograph and signature, in the Circles About frame. Until Peter's edited letter arrives, show only the paragraphs still true (the first two and the background paragraph). The page must lay out correctly while the photograph and signature files are missing.

**`/zack`:** pick an agent → email → instructions with the run-once prompt in a code block and a "Copy" button → paste the report back. After paste-back the visitor sees their top plays summarised, then one button, "Get two free Monday lists", to `/start?path=agents&zack={token}`. Above the paste box: "Check your report for client names or private details before pasting. It is read by Roger's team and by Cora, Roger's ranking agent, and is never published."

**`/library`:** unchanged plus one band above the footer: "This is what people post in public. Roger sends you what works in private." with the primary button.

### A7. Repo, stack and ownership [Spec]

- **Repo:** `MeetRogerAI/roger`; branch from `main` (pull first). Read `AGENTS.md` first. "This Next.js version has breaking changes; check `node_modules/next/dist/docs/` before writing code."
- **Stack:** Next.js 16.4.1 App Router with Cache Components, React 19.3, Tailwind 4, TypeScript, Neon Postgres over HTTP (`src/lib/db.ts`), Resend (`src/lib/email.ts`), Vercel Cron, the AI SDK through the Vercel AI Gateway, zod. Hosted on Vercel.
- **Tokens:** all in `src/app/globals.css`.
- **Marketing owns:** the public routes, `src/components/v3/`, `src/components/site-header.tsx`, `src/components/site-footer.tsx`, `src/data/v3-copy.ts`, `src/data/legal.ts`, sitemap, robots, and the Open Graph image (`src/app/opengraph-image.tsx`). **Shared files** (`globals.css`, `config.ts`, `layout.tsx`) change only by small agreed pull requests. The app (`/app/`, `/start`, `/signin`, billing, Zack/Cora jobs, admin) is Peter's.
- **Feature flag:** `siteConfig.flags.v3Mode = true` serves v3 header, footer, homepage, sitemap and robots; off returns the Circles preview.
- **Data the public site reads:** only `use_cases`, `testimonials` where `cleared` is true, the `v3.*` settings, and the published `setup_files` row. It writes only to `leads` and `free_runs`.
- **Forms:** follow the server-action pattern in `src/app/library-actions.ts` (`saveLead`, `saveWatch`): honeypot, trimmed inputs, a clear message when the database isn't configured.
- **Price block behaviour:** USD/CAD toggle reusing `src/components/circles/price.tsx`; default from the `x-vercel-ip-country` header; choice kept for the tab; currency code always shown after the amount; set prices (US$200 / US$100, CA$280 / CA$140), never live conversion; shown before tax; never a bare "$".
- **Start handoff:** every start button goes to `/start` with `path` (`re` or `agents`), `cur`, `ref` (later), `zack`, and `utm` in the query string.

### A8. Copy you must use (draft copy from the spec; Peter edits before launch) [Spec, A.4, A.14]

- **Homepage headline:** "Your AI agents, smarter every Monday." **Sub-line:** "Roger makes your AI agents smarter every week, with ideas that worked for other real estate users."
- **Homepage problem:** "Everyone in real estate is being told to use AI. Almost nobody is told what to use it for." / "The people getting real work out of AI agents rarely post how. It involves their clients and their business." / "So each person works out the same things alone, a few months apart."
- **Homepage how it works:** (1) "Set up your AI agents. If you don't have any, our starter team takes about half an hour to install." (2) "Each Sunday, an AI agent called Zack reviews your week and writes up what worked, with client details removed." (3) "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best." (4) "Open one, press copy, paste it into your AI agent. It sets itself up and asks you what it needs to know."
- **It compounds:** "Three ideas a week. Each one you set up stays set up. Six months in, your AI agents do things you would not have thought to ask for."
- **Who runs this, lead-in:** "Roger is run by Peter Kuperman." **Closing band:** "See what your first two Mondays bring."
- **Under the start button:** "Card required. Charged only with your third list."
- **`/agents` headline:** "Stop figuring out AI agents alone." **Sub-line:** "Every Monday, Roger sends you the three plays most worth installing, drawn from what other heavy users ran last week." **Closing band:** "Find out what other heavy users know." (Problem statements and three steps are in the spec.)
- **Price block:** "US$200 / month USD" and "US$100 / list USD", or "CA$280 / month CAD" and "CA$140 / list CAD"; CAD adds "plus HST", USD adds "plus tax where it applies". Monthly is marked "Most people choose this" and is visually the larger of the two. No non-contributor plan is shown as a choice.
- **Trial line (always directly under the prices):** "Your first two Monday lists are free. We ask for a card when you start. On monthly it is charged with your third list. On one at a time it is charged only when you order a list. Cancel before then and you pay nothing."
- **Control block:** "You decide what Zack shares": "Read every line. The exact instructions your Zack runs are in your dashboard." / "Set your own rules. Skip whole subjects, block names and words, or add rules in your own words." / "Turn sharing off any time in your dashboard. On monthly your ideas keep coming and the price becomes US$400 a month."
- **FAQ:** use the questions and answers in the spec verbatim (Getting started; Zack and privacy; Cora and the ideas; Price and billing). Don't invent new answers.

### A9. Not in scope for Nov 30 [Spec, A.15]

A 2–3 minute demo video section (with poster, captions, pause control), a "one real week" worked example that states its sample size, and the group-session line. These are version A2, once the proof exists.

### A10. Open decisions that affect design (don't decide these yourself) [Spec]

1. **Logo:** still a placeholder; Peter leans toward a magnifying glass.
2. **About letter:** needs Peter's v3 edit; headshot and signature files still to come.
3. **Testimonials:** off until quotes that mention Cora are cleared.
4. **Time figures on the sample idea card:** Peter's call; until then, show no time figures.
5. **Compounding section, animated or static:** Peter and James first agreed a scroll story (week 1, 2, 3, then a jump to week 26: 3 → 6 → 9, then 78 → 81, "like lego bricks"); the later spec says "a static version of the 26-week graph" and one sentence; James said he'd start the scroll story from the spec. Build so both work (see B6), and ask.
6. **Privacy and terms:** drafts need Peter's read.

---

## Part B. Applying the two posts to Roger

### B1. What the posts give Roger, in one table

| Technique | Source | How it applies to meetroger.ai |
|---|---|---|
| Draw, then code: 5–10 genuinely different directions as images before code | Kamens | Explore composition, the brick visual, night/ground rhythm and motion ideas as images first, all inside Mona Sans, copper, ground/night, 8px. Don't explore new fonts or accents; the spec fixes them [Spec] |
| Loop per section, using screenshots of the built page | Kamens | Hero first, then each homepage block in the spec's order, each new round seeded with screenshots of what's built |
| Screenshot vs mockup until they match | Kamens skill | At the spec's five widths [Spec, A.16] plus the mockup width |
| In-app design jig, `?tweak=1`, copy diff back | Kamens, Every | Wire it to the `globals.css` tokens and the brick stack's parameters; diffs to `globals.css` go through a small agreed PR [Spec] |
| Standalone app jig | Kamens | A sample-card and copy review bench, a brick-motion bench, and a test bench for the vocabulary and claims rules (B7) [Suggestion] |
| Raise your agent's ambitions | Kamens | The brick stack as the one magical moment (B6), with reduced motion meaning nothing moves [Spec] |
| Find the concept in the name and the feeling | Yakko | Roger already has its concept, the bricks, from Peter's "lego bricks" compounding idea [Spec]. Make it the world of the page, not a widget |
| Levels of intensity; "go wild" on half | Yakko | Apply to the brick treatment and the hero composition, from a single quiet row of three bricks to a full-bleed brick field |
| Don't paste an illustration onto a template | Yakko | The brick stack must not look like a chart dropped into a generic hero ("wtf is a rollercoaster doing in the middle of this website?") |
| A strip that becomes the section transition | Yakko | A brick row as the seam between night and ground chapters [Suggestion] |
| Single HTML file until settled; forks side by side; never delete forks | Yakko | Prototype the hero and brick stack as standalone HTML using the real tokens, then port into `src/components/v3/` |
| Playgrounds for colours and placement | Yakko | A playground for the data-palette lifted night values and brick spacing [Suggestion] |
| Background colour sets the mood | Yakko | The ground/night split is fixed; tune ground and night tones only within the existing tokens and contrast rules [Spec] |
| The hero dictates the rest | Yakko | Once the hero's brick treatment is set, reuse it in how-it-works, compounding, the price block and the closing band |
| Nav that morphs to the section colour | Yakko | Header that switches between ground and night treatments as chapters scroll under it [Suggestion]. It must not block rendering on the signed-in check [Spec] |
| Named, specific references | Yakko | The three reference sites [Spec], plus the two posts' sites, each with the specific thing to take (B3) |

### B2. Roger's concept, stated [Spec + Suggestion]

The concept is given by the spec, so you don't need to hunt for one from scratch (Step 2 in the generic guide becomes "deepen the given concept"):

- **Bricks that compound.** Three arrive each Monday; the ones you set up stay set up; the stack grows. [Spec]
- **Monday arrival.** "What arrives on Monday" is the ten-second test. [Spec, A.1]
- **A real person runs it.** Peter is the only photograph; his letter carries trust. [Spec]
- **Mastery and excellence**, with a detective/magnifying-glass leaning for the eventual logo. [Spec]

**[Suggestion] Concept seeds to explore within that**, for the first image round:

1. The brick stack as a quiet architectural object on night: three bricks land in the hero, with copper reserved for the button.
2. A Monday "delivery" metaphor: three bricks set down beside the headline, with empty outlined slots for the weeks to come.
3. A brick wall growing across the page width as you scroll from hero to compounding, so the page itself is the compounding chart.
4. A "close inspection" treatment that nods to Peter's magnifying-glass leaning: one brick opens into the idea card's anatomy on `/how-it-works`. (Only as a nod; don't design a logo.)
5. **Go wild** [Yakko]: let at least half of the round ignore these seeds, staying inside the tokens.

### B3. Reference board for Roger

From the spec (Peter's picks, agreed by James): "more visual, less text, and a story told as you scroll." [Spec] What this guide's author saw on Nov 26, 2026 [Observed], and how it translates:

- **theacademysf.com:** a full-bleed photo/video hero under a very large, tightly set, centred two-line sans headline; a floating translucent nav panel; a single bright orange-red "Apply" button. **Take:** headline scale and confidence, one button, a calm centred hero. **Don't take:** the full-bleed photography; Roger's only photograph is Peter [Spec].
- **earth-ai.com:** dark, with a loading screen ("Worth the wait"); custom type (a serif, a sans and a mono: TWK Ghost, Beausite Classic, ABC Diatype Mono, as observed in its CSS); the story is told section by section with large figures. **Take:** a story told as you scroll on a dark ground, with quiet type. **Don't take:** big numbers; Roger allows no hard-coded numbers or time and money figures [Spec]. Don't add a loading screen.
- **maticrobots.com:** a warm, photographic product hero ("Hello, Canada. Meet Matic."), a white pill button, an awards strip, a CAD currency selector in the nav. **Take:** the warmth, and a currency choice that's visible and simple (Roger has a USD/CAD toggle [Spec]). **Don't take:** product photography, awards or press logos (Roger has none to show, and invented proof is banned).
- **railcode.dev** [Yakko]: an ownable illustrated world that becomes the section transitions; a nav that adapts to sections; chunky, tactile primary button; warm-tinted lines and shadows. **Take:** the integration of the illustration with the layout. **Don't take:** pixel art, Press Start 2P, the yellow button; Roger's accent is copper and only copper [Spec].
- **olddogs.ai** [Kamens]: one hero interaction that rewards attention (the hover reveal), calm type around it, a narrow founder-note column. **Take:** "one magical moment" and a short founder note signed by a person (Roger's "Who runs this" section). **Don't take:** the cream + Didot palette.

### B4. Avoid the AI-default clusters with Roger's fixed tokens [Anthropic skill + Suggestion]

Roger's fixed tokens sit near two of the clusters Anthropic's skill lists as AI tells, so be deliberate:

- **Copper `#9a5226` on a light ground** is close to "warm cream with a high-contrast serif and a terracotta accent". The tokens are fixed [Spec], so the difference has to come from everything else: Mona Sans rather than a high-contrast serif [Spec]; don't push ground toward cream `#F4F1EA`; let the bricks and data palette, not copper, carry colour (copper stays on the primary button and text links only [Spec]).
- **Night chapters** are close to "near-black with one bright accent". Keep night a deliberate colour from the existing tokens rather than `#111`, and let the lifted data palette on the bricks give night its colour [Spec, 0.7].
- **Numbered steps with a large pale numeral** [Spec] are fine because how-it-works really is a sequence [Anthropic skill]. Don't add numbers anywhere else.
- **Cards:** the spec fixes one 8px corner [Spec]. Avoid the "identical cards with grey shadow" kit by varying content blocks (a sample card, a control block, a price block, a letter) rather than repeating a feature-card grid.
- **Eyebrows and arrows:** don't add a tracked ALL-CAPS label above every section or "→" to every link by habit [Anthropic skill].

### B5. Imagery for Roger

- **Bricks are the illustration.** Small rounded squares; outlined empty slots; filled bricks in the level colour (reach, ease, proof, surprise, hours, in that order); every brick and bar has a text label or number [Spec, 0.7].
- **No stock photos, no AI-generated people, no generic 3D.** Peter's photograph is the only photo [Spec].
- **Image-generation mockups are for exploration only** [Kamens]. Don't ship generated illustration of people or offices; the shipped visuals are bricks, the sample idea card, type, and Peter's photo [Spec].
- **The sample idea card is real content** (one real pool play chosen in the admin, names removed). Until a play is chosen, the section is absent [Spec]. Don't design around fake card content in the shipped build; use a clearly marked fixture only in exploration.
- **[Suggestion]** Build the bricks as SVG or CSS (crisp at every size, themeable for ground and night, lightweight), not raster images.

### B6. The one magical moment: the brick stack [Kamens + Spec + Suggestion]

Kamens: "ask your agent for the most magical thing you can think of." For Roger, the obvious candidate is the brick stack: three bricks arriving in the hero, growing across how-it-works, compounding to week 26 [Spec].

- **[Suggestion]** Hero: three bricks land with a short, weighted motion once on load (one orchestrated moment [Anthropic skill]); empty outlined slots show where next week's bricks go.
- **[Suggestion]** How it works: the stack grows step by step as the four steps scroll by (the spec says the stack "grows across the four steps").
- **Compounding:** build it so it works **static by default** (the spec's "static version of the 26-week graph" plus one sentence) and can be enhanced to the scroll story (week 1, 2, 3, then week 26) if Peter approves [Spec, open question]. Put the animated version behind a flag or a separate component so the decision is a one-line switch. **No numbers about time or money.** The week counts (3, 6, 9 … 78, 81) are brick counts, not claims; confirm with Peter before showing any number, given the no-hard-coded-numbers rule [Spec].
- **Reduced motion:** "nothing moves" [Spec]. Show the final stack state.
- **Budget [Kamens]:** measure fps during scroll on a mid-range laptop and a phone, and report the KB cost of the animation code. Prefer CSS transforms; use canvas/WebGL only if CSS can't hold the frame rate.

### B7. Jigs for Roger [Kamens + Every + Yakko; specifics are Suggestions]

**In-app tuning jig** (use Kamens's prompt, appendix X1.6), loaded only in development or behind `?tweak=1`, nothing in production. Parameters worth exposing [Suggestion]:

- Type: hero headline size, line-height and tracking; section heading size; body size; the large pale numeral's size and opacity.
- Layout: hero composition variant (e.g. centred / split / stacked), section padding, heading width (around 44rem [Spec]), long-form width (around 40rem [Spec]).
- Colour: ground and night tones, the lifted data-palette values for night (contrast shown live against 3:1 [Spec]).
- Bricks: size, gap, corner (locked at 8px unless Peter changes the token), outline weight for empty slots, arrival timing and easing, stagger, stack growth per step.
- Header: ground/night switch threshold (if the morphing header is approved).

"Copy settings" outputs a diff. Changes that land in `globals.css` go through a small agreed PR, because it is a shared file [Spec]. Component-level values go in `src/components/v3/`.

**Standalone workbench jigs** (use Kamens's prompt, appendix X1.6) [Suggestion]:

- **Exploration review bench:** every generated mockup with approve / reject / star / tags / notes and an "Export for agent" button.
- **Copy and claims bench:** every string in `src/data/v3-copy.ts` listed with automatic flags for the vocabulary rule (bare "agent"/"agents" outside `/agents` and `/zack`), digits, currency without a code, "$" alone, "hours", "minutes", "save", "income", "revenue", "join", and the brokerage name. Peter can mark each flag OK or change it, then export.
- **Breakpoint bench:** each page at the five check widths side by side, to review at a glance.

### B8. Copy notes [Spec + Anthropic skill]

- Use the spec's draft copy (A8) as written; Peter edits before launch. Don't "improve" it with taglines [Kamens skill: "Do not invent ... clever taglines"].
- Keep every action named the same through the flow: "Get two free Monday lists" in the hero, the price block and the closing band, and "Start free" as the short header form [Spec].
- Sentence case, no exclamation marks, no emoji, no hype [Spec].
- "AI agent" in full on every page except `/agents` and `/zack` [Spec].

---

## Part C. Step-by-step process for meetroger.ai

**Step 0. Set up.** Pull `main` in `MeetRogerAI/roger` and branch. Read `AGENTS.md`. Read `node_modules/next/dist/docs/` for Next.js 16 changes. Read `src/app/globals.css`, `src/components/v3/` (if any), `src/data/v3-copy.ts`, `src/components/circles/price.tsx`, `src/app/library-actions.ts`. Run the site locally and screenshot the current homepage at the five widths. Read this guide and the spec. [Spec][Kamens skill §8]

**Step 1. Restate the brief.** Write a short brief from Part A: the two audiences, the ten-second goal, the fixed tokens, the hard rules (A3), the pages in scope, the open decisions (A10). Gate: Peter (or the person driving) confirms. [Kamens prompt §1]

**Step 2. Reference board.** Screenshot the three reference sites [Spec] and the two posts' sites, and write next to each the one thing to take and the thing not to take (B3). [Yakko 2.8]

**Step 3. Hero exploration.** Generate 6–10 genuinely different hero directions as separate high-resolution images (or, if no image tool is available, say so and ask before using single-file HTML mockups). Every candidate uses Mona Sans, copper only on the primary button, a night hero, the 8px corner, the real headline, sub-line, buttons and the card line under them, and a brick stack with three bricks arriving. Vary composition, scale, density, the brick treatment, the ground/night seam, and motion idea. Guide half with the B2 seeds; go wild on the rest; add a minimal → outlandish spectrum on the strongest seed [Yakko]. Review every image; regenerate generic, cluttered or rule-breaking ones (wrong vocabulary, numbers, stock-photo people, a second accent). Save under `design-explorations/roger-hero/01-initial-exploration/` with a `PROMPTS.md` index [Kamens skill][Yakko]. **[Suggestion]** Keep `design-explorations/` out of the production build (gitignored or outside `src/`). Gate: Peter picks.

**Step 4. Branch.** 3–4 variations per pick, feedback carried forward as constraints, fresh round on rejection, forks never deleted [Kamens skill][Yakko]. Gate: Peter approves one.

**Step 5. Lock and plan.** Summarise the locked direction and write the token use plan: which existing tokens go where, brick dimensions, the type scale for Mona Sans, motion principles, an ASCII wireframe of the homepage in the spec's order. Check against B4. Ask: "Would you like me to implement this now?" [Kamens skill §7][Anthropic skill]

**Step 6. Prototype the hero as one HTML file** with the real tokens copied in, plus the tuning jig [Yakko 2.6][Kamens 1.3]. Peter tunes; you apply the diff.

**Step 7. Verify the prototype** against the approved mockup at its width and the five widths [Kamens skill §9][Spec].

**Step 8. Section loop**, in the homepage order (A6): problem → how it works → sample card (absent until a play is chosen, so design it with a marked fixture) → compounding (static first, B6) → testimonials (off) → control block → who runs this (works without the photo file) → price → questions → closing band. Each round seeds the image generator with screenshots of what's built [Kamens]. Design the night/ground seams [Yakko 2.5].

**Step 9. Port to Next.js** under `src/components/v3/` and the public routes, behind `v3Mode`. Copy comes from `src/data/v3-copy.ts`; prices and the currency toggle reuse `price.tsx` behaviour. No direct edits to shared files except by small agreed PRs [Spec]. Re-verify screenshots after the port [Yakko].

**Step 10. The other pages:** `/agents` (same blocks, its own order and copy), `/pricing`, `/how-it-works` (long form, the idea-card anatomy), `/faq`, `/about`, `/zack` flow, `/library` band, privacy and terms (drafts). Each gets a short design/verify loop using the homepage's established style [Yakko: "I could reference it throughout"].

**Step 11. Ambition pass:** the brick moment (B6) within budgets, reduced motion meaning nothing moves [Kamens][Spec].

**Step 12. Detail pass:** header behaviour (signed-in "Open Roger" without blocking render; no button on `/start/*`, `/signin`, `/app/*`), currency toggle states, accordion states, focus styles, empty states (no testimonials, no sample play, no photo), Open Graph image, 404 [Spec][Yakko 2.7].

**Step 13. Claims and vocabulary sweep:** run the copy bench (B7) or a scripted search over every rendered page (Part E).

**Step 14. QA and acceptance (Part F), then handoff:** what was built, screenshots compared, deliberate differences, measured performance, open decisions still waiting for Peter.

---

## Part D. Do and don't rules for Roger

### Do

- Keep every token in `globals.css`: Mona Sans, ground/night, copper only on the primary button and text links, one 8px corner [Spec].
- Make the bricks the world of the page, carried from hero to closing band [Spec][Yakko].
- Put "Card required. Charged only with your third list." under the hero buttons and the trial line directly under the prices [Spec].
- Make monthly visibly the larger, "Most people choose this" option [Spec].
- Always show the currency code after the amount; never a bare "$" [Spec].
- Give every brick and score bar a text label or number [Spec].
- Let sections be absent cleanly when their data is missing (testimonials, sample card, Peter's photo) [Spec].
- Explore wide in images first, branch, keep forks, verify with screenshots [Kamens][Yakko].
- Use the tuning jig for brick motion and spacing instead of rounds of chat [Kamens][Every].

### Don't

- Don't write "agent"/"agents" without "AI" outside `/agents` and `/zack` [Spec].
- Don't add income, revenue, productivity or time-saved claims in Roger's voice, including on the sample card, unless Peter clears it [Spec].
- Don't add user counts, "join hundreds", or any hard-coded number; the public use-case count must come from the database [Spec].
- Don't name the brokerage or imply an enterprise customer [Spec].
- Don't use stock photos, AI-generated people or any photo other than Peter [Spec].
- Don't add a second accent colour, set text in data-palette colours, or use data colours on actions [Spec].
- Don't use a carousel for testimonials [Spec].
- Don't link to `/zack` from the homepage [Spec].
- Don't show the US$400 rate as a plan to choose [Spec].
- Don't link to Circles pages or old offers from the header, footer, homepage or sitemap while `v3Mode` is on [Spec].
- Don't use exclamation marks, emoji or hype words [Spec].
- Don't design a logo; use the placeholder until Peter decides [Spec].
- Don't use Yakko's anti-reference look (purple gradients, glow cards, "New:" pill, avatar stack with a user count) [Yakko]; it also breaks Roger's no-user-count rule [Spec].
- Don't fade-and-slide every section or lift every card on hover [Anthropic skill]. Under reduced motion, nothing moves [Spec].

---

## Part E. Anti-slop and claims checklist for meetroger.ai

**Design (anti-slop)**

- [ ] The hero is built around the brick stack and the Monday promise, not a generic headline-plus-screenshot layout [Spec][Yakko][Anthropic skill]
- [ ] One memorable moment (the bricks); everything around it quiet [Anthropic skill]
- [ ] The bricks are integrated through the page (hero, how it works, compounding, seams), not pasted in as a chart [Yakko]
- [ ] Copper appears only on the primary button and text links [Spec]
- [ ] Ground isn't pushed toward cream; no high-contrast serif added; night isn't flat `#111` [Anthropic skill][Spec]
- [ ] No grid of identical feature cards with grey shadows; one 8px corner throughout [Spec][Anthropic skill]
- [ ] Numerals only on the how-it-works steps [Anthropic skill][Spec]
- [ ] No tracked caps eyebrow over every section; no arrows on every link by habit [Anthropic skill]
- [ ] No purple gradients, glows, "New:" pills or avatar stacks [Yakko]
- [ ] Seams between night and ground are designed [Yakko]
- [ ] Header fits the chapter it's over, and doesn't block render [Yakko][Spec]
- [ ] Self-review: "Would I land here for any SaaS brief?" If yes, revise [Anthropic skill]

**Claims and vocabulary (every rendered page)**

- [ ] No bare "agent"/"agents" outside `/agents` and `/zack` [Spec]
- [ ] No income, revenue or productivity claims [Spec]
- [ ] No time-saved figures in Roger's voice; none on the sample card unless Peter cleared it [Spec]
- [ ] No user counts, "join hundreds" or hard-coded numbers; the use-case count comes from the database [Spec]
- [ ] Brokerage not named or implied as a customer [Spec]
- [ ] Card line under the hero buttons; trial line directly under the prices [Spec]
- [ ] Monthly marked "Most people choose this" and visually larger; no non-contributor plan shown as a choice [Spec]
- [ ] Currency code after every amount; "plus HST" with CAD, "plus tax where it applies" with USD; no bare "$" [Spec]
- [ ] Testimonials only if cleared; word for word; first name and last initial; no carousel [Spec]
- [ ] Only photograph: Peter [Spec]
- [ ] No exclamation marks, emoji or hype words [Spec]
- [ ] "Works with every agent" strip lists only agents with Zack files and says others adapt one [Spec]

**[Suggestion] A quick scripted sweep** (run against the built HTML of every public route): search for `\bagents?\b` not preceded by "AI " outside `/agents` and `/zack`; for `\$\d` not followed by a currency code; for `join|hundreds|thousands|users? love|hours? (a|per)|minutes? (a|per)|save|income|revenue|earn`; for `!`; and for the brokerage's name. Review each hit by hand.

---

## Part F. QA and acceptance checks

**From the spec (A.16 and 0.7)**

- [ ] `npm run build` and `npm run lint` pass [Spec]
- [ ] Keyboard: every form, toggle, accordion and the pull-out sheet work by keyboard alone [Spec]
- [ ] Toggles are real buttons with `aria-pressed`; the accordion and currency toggle expose state [Spec]
- [ ] The pull-out sheet traps focus, closes on Escape, returns focus to the card that opened it [Spec]
- [ ] Every form field has a visible label and an inline error [Spec]
- [ ] Skip link, visible focus and existing contrast ratios kept [Spec]
- [ ] Nothing moves under `prefers-reduced-motion` [Spec]
- [ ] Checked at five widths [Spec]. **[Suggestion]** 375, 768, 1024, 1440, 1920 px
- [ ] No income claims; no user counts or hard-coded numbers; no brokerage name; monthly marked as the choice; no non-contributor plan; "AI agent" wording rule followed [Spec]
- [ ] With `v3Mode` on: no header, footer, homepage or sitemap link to a Circles page or old offer; those URLs still load with noindex; `/apply` redirects to `/start` [Spec]
- [ ] Sitemap lists exactly: `/`, `/agents`, `/pricing`, `/how-it-works`, `/faq`, `/about`, `/zack`, `/library`, `/getstarted`, `/privacy`, `/terms`. Robots disallows the hidden paths, `/app`, `/admin`, `/start`, `/api` [Spec]
- [ ] Unlisted partner pages render exactly as before [Spec]
- [ ] `/about` lays out correctly without the photograph and signature files [Spec]
- [ ] Testimonials and sample-card sections are absent (not empty boxes) when there's no data [Spec]
- [ ] `/zack` paste-back: rate limit by IP and email, 20,000-character cap, warning line above the paste box [Spec]
- [ ] Price block: defaults from `x-vercel-ip-country`, remembers the choice for the tab, set prices, never a bare "$" [Spec]

**From the posts and other sources**

- [ ] Screenshots compared with the approved mockups at each width; deliberate differences listed [Kamens skill]
- [ ] Every section re-checked after the port from HTML prototype to components [Yakko]
- [ ] Brick animation fps measured during scroll on laptop and phone; its KB cost reported [Kamens]
- [ ] Tuning jig absent from the production bundle [Kamens prompt]
- [ ] Data-palette colours meet 3:1 against ground, surface and night (lifted values) [Spec]; text meets AA [Vercel WIG]
- [ ] Explicit image dimensions (Peter's photo), fonts preloaded, no layout shift [Vercel WIG]
- [ ] Open Graph image updated for v3 (`src/app/opengraph-image.tsx`), with no numbers or claims [Spec]

---

## Part G. Ready-to-paste prompt (Roger)

Put this guide and the spec in the repo (for example `docs/marketing-site-design-guide-roger.md` and `docs/james-camarota-website-spec.md`), then paste:

```text
You are designing and building the public marketing pages of meetroger.ai in the MeetRogerAI/roger repo (Next.js 16.4.1 App Router, React 19.3, Tailwind 4, TypeScript). It must look like a skilled designer made it, with no AI slop, and stay exactly inside Roger's spec. Before anything else, read docs/marketing-site-design-guide-roger.md (all of it) and docs/james-camarota-website-spec.md. Read AGENTS.md and node_modules/next/dist/docs/ (this Next.js has breaking changes). The spec wins over any technique in the guide.

Non-negotiable rules:
- Keep every token in src/app/globals.css: Mona Sans; light ground pages with dark night chapters; one accent, copper #9a5226, only on the primary button and text links; one 8px corner; generous white space. No stock photography; the only photograph is Peter.
- Data palette for graphics only (score bars, bricks, compounding graph): hours saved #b86a12, reach #2a6aa8, ease #2c8463, proof #6650b4, surprise #b0457a; "you are here" #c63b2b; at least 3:1 contrast, lifted versions for night; every brick and bar also has a text label or number.
- The recurring visual is bricks: three arrive each Monday and the stack grows. Small rounded squares; empty slot = outlined; set-up brick = filled in its level colour.
- Always "AI agent"/"AI agents" in full, except on /agents and /zack.
- No income, revenue or productivity claims. No time-saved promises in Roger's voice (none on the sample card unless Peter clears it). No user counts, "join hundreds" or hard-coded numbers. Never name the brokerage. No exclamation marks, emoji or hype.
- "Card required. Charged only with your third list." under the hero buttons. The trial line directly under the prices. Monthly marked "Most people choose this" and visually larger. Currency code after every amount; never a bare "$".
- Testimonials only if cleared, word for word, first name and last initial, no carousel; currently off. Sample card absent until a play is chosen in the admin.
- Marketing owns the public routes, src/components/v3/, site-header.tsx, site-footer.tsx, src/data/v3-copy.ts, src/data/legal.ts, sitemap, robots and the OG image. globals.css, config.ts and layout.tsx change only by small agreed PRs. Don't touch /app, /start, /signin, billing or admin.
- Accessibility: skip link, visible focus, labelled fields with inline errors, toggles as buttons with aria-pressed, the pull-out sheet traps focus and closes on Escape, keyboard-only forms, nothing moves under prefers-reduced-motion, checks at five widths.

Work in this order and stop at every gate:
1. Set up: pull main, branch, read the files above, run the site, screenshot the current homepage at 375, 768, 1024, 1440 and 1920 px.
2. Restate the brief from Part A of the guide (audiences, the ten-second goal, tokens, hard rules, pages, open decisions). STOP for my OK.
3. Reference board: screenshot theacademysf.com, earth-ai.com, maticrobots.com, railcode.dev and olddogs.ai, and note one thing to take and one not to take from each (the guide's B3).
4. Hero exploration: 6–10 genuinely different hero directions as separate high-resolution images (if you have no image tool, tell me and ask before making single-file HTML mockups). Every candidate uses the real tokens, the real headline "Your AI agents, smarter every Monday.", the real sub-line, buttons "Get two free Monday lists" and "See how it works", the card line, and a brick stack with three bricks arriving. Vary composition, scale, density, the brick treatment, the night/ground seam and the motion idea. Guide half with the guide's B2 seeds; go wild on the rest (inside the tokens); add a minimal → outlandish spectrum for the strongest seed. Review every image and regenerate any that are generic, cluttered or break a rule. Save to design-explorations/roger-hero/01-initial-exploration/ with descriptive names and a PROMPTS.md index (keep design-explorations out of the production build). List them with one line each. STOP for my picks; don't choose for me.
5. Branch: 3–4 variations per pick, my feedback carried forward as constraints; a fresh round if I reject all; never delete forks. STOP when I approve one.
6. Lock and plan: summarise the direction, map existing tokens to elements, set brick dimensions, the Mona Sans type scale and motion principles, and draw an ASCII wireframe of the homepage in the spec's section order. Check it against the guide's B4 (Roger's tokens sit near two AI-default looks; make everything else deliberate). Ask "Would you like me to implement this now?" STOP.
7. Prototype the hero as one HTML file with the real tokens, plus a dev-only tuning panel (only in development or with ?tweak=1; nothing in production) wired to CSS variables: hero type size/leading/tracking, section padding, heading and long-form widths, ground and night tones, lifted data colours with live contrast readout, brick size/gap/outline/arrival timing/easing/stagger. Remember settings, reset per control and for all, and a "Copy settings" button that copies only changed values as a diff. I'll paste diffs back; changes to globals.css go in a small separate PR.
8. Verify against the approved mockup at its width and the five widths; fix and repeat until they match; list deliberate differences.
9. Section loop in the spec's homepage order (problem, how it works, sample card with a marked fixture, compounding, testimonials off, control block, who runs this, price, questions, closing band), each round seeded with screenshots of what's built. Design the night/ground seams. Build compounding static by default, with the scroll-story version behind a flag for Peter to decide; no numbers about time or money; reduced motion shows the final state.
10. Port to src/components/v3/ and the public routes behind v3Mode, with copy from src/data/v3-copy.ts and the currency toggle reusing src/components/circles/price.tsx behaviour. Re-verify screenshots.
11. Build /agents, /pricing, /how-it-works, /faq, /about (works without the photo and signature files), /zack, the /library band, and privacy/terms drafts, each in the homepage's established style.
12. Ambition: make the brick stack the one magical moment, within budget. Report fps during scroll on laptop and phone and the KB cost.
13. Detail pass: header (signed-in "Open Roger" without blocking render; no button on /start/*, /signin, /app/*), toggle and accordion states, focus styles, empty states, OG image, 404.
14. Claims and vocabulary sweep over every rendered page using the guide's Part E checklist and scripted search; fix every hit.
15. Run Part F acceptance checks (npm run build and lint, keyboard, reduced motion, five widths, sitemap/robots, v3Mode link rules), then hand off: what you built, screenshots compared, deliberate differences, measured performance, and the open decisions still waiting for Peter (logo, About letter, testimonials, sample-card time figures, animated compounding, privacy/terms).

Never invent Roger facts, numbers, testimonials or features. If something isn't in the spec or this prompt, ask.
```

---

## Appendix X. Full source notes (identical to sections 1–4 and 12 of the generic guide)

These notes are what the two posts and the other sources actually say, with verbatim quotes and the three Kamens prompts. They are not Roger-specific. Where they conflict with Part A, Part A wins.

## X1. What Ben Kamens said and did (olddogs.ai) [Kamens]

### X1.1 The claim

"We made olddogs.ai into a site that feels uniquely ours (despite being built by agents) using a few tricks." The caption on his overview video: "Everything on our homepage was made by prompting agents. These four tools are how we kept it uniquely ours, with zero slop." The four tricks:

1. Have your agent draw, then code
2. Build an in-app design jig
3. Build a standalone app jig
4. Raise your agent's ambitions

His closing note: "Every word I write is mine. But the interactive components in our blog's version of this post were built using the exact same tools."

### X1.2 Trick 1: Have your agent draw, then code

The problem, in his words: "Just diving in and letting an agent start coding can get you trapped in the rut of the first design it considers (which probably looks a lot like everybody else's)."

The insight: "With the right prompting, generative image models are incredible at exploring design space. These days we're constantly going through a loop of generative imaging to explore alternative designs, picking our favorites and asking for refined image options, then letting models implement in code, and finally having them verify their work with screenshots." And: "You can repeat the loop to your heart's content, prompting for different design vibes, and refining vision without constraining yourself in code. Free your agents' artistic talents!"

His "How" steps (verbatim):

1. Ask for 5–10 genuinely different design directions using generative imaging, not coding.
2. Pick promising directions, ask for refined iterations.
3. Let your agent build.
4. Ask your agent to use screenshots to compare their work to your chosen mockups.

The worked example on the blog (the "See it" panel):

- Prompt 1: "Show me very different visual worlds for our homepage: old dogs learning new tricks. Different styles, moods, and materials. Don't build anything yet." Result: "34 options generated".
- Prompt 2: "I like these three. Make more like each one. Keep what makes it special and try new variations." Result: "4 variations of each".
- Prompt 3: "This lighthouse one. Build it, then compare a screenshot with the mockup until they match." Result: the built homepage.

From the screenshot of that panel: the 34 first-round options span very different worlds (sepia engraving-style scenes, a saturated blue-sky alpine scene, a warm desert/peach scene, a pale coastal scene with a lighthouse). He kept three, got four variations of each, and chose the pale coastal lighthouse one.

Section by section: "We reused this design-build loop for every section of the page. Each time the image generator would use screenshots of the currently-built page while exploring a bunch of novel designs for the next section we were focused on." Counts the blog gives per homepage section:

| Section | Options generated | Design/build rounds |
|---|---|---|
| Logo rail | 16 | 3 |
| Founder note | 12 | 3 |
| How we work together | 16 | 2 |
| Customer quotes | 11 | 2 |
| Why work with us | 38 | 7 |
| The team | 38 | 5 |
| Contact form | 8 | 1 |
| Footer | 34 | 4 |

The whole project: "All 2,460 images we generated, in order." Caption: "Overall, this workflow produced an amount of design exploration and variety that would've bordered on completely unreasonable in the before times."

He shares this as a skill ("an agent skill you can drop into Claude, ChatGPT, or any agent that supports skills" on X; "An agent skill for Claude Code, Codex, or any agent that supports skills" on the blog) and as one copy-paste prompt (X1.6).

### X1.3 Trick 2: Build an in-app design jig

"Both Every and Josh Puckett have leaned into the term 'jig' to describe a small interface widget you build and embed in your app that lets you tweak a bunch of design parameters, watching things update live until it feels just right." He calls these "personalized mini-Figmas made just for your site. Or mini little airplane cockpit panels full of controls for tweaking parameters only your team will understand." They are "perfect follow-up tools that let you dial in the exact feel of your app after the image<>code loop has generated your chosen interface. We used this in-app design jig extensively to get the feel of our retro animated dog transitions just right."

"How" (verbatim):

1. Ask your agent for a dev-only panel of controls to tweak all sorts of design parameters on the page.
2. Keep adding settings to it as you build.
3. Ask for an easy way to sync your changed settings back to the committed code.

The live jig on the blog ("Design tweaks") shows exactly what they tuned. Under "The digital surface": Cell density (55), Cell fill (94%), Wash strength (0%), Reveal edge animation (Clean organic / Flowing granular / Flowing blob), Reveal tile shape (Round mosaic / Hex mosaic), Trail hold (0.05 s). Under "Type & composition": Your headline (editable text), Type size (100%), Layout (Quiet left / Quiet center / Giant masthead). Then "What goes back to Codex", a JSON blob, and a "Copy my settings" button. The JSON shown:

```json
{
  "headline": "Transform your company\nfrom behind in AI\nto leading the pack",
  "layout": "quietLeft",
  "typeScale": 1,
  "density": 55,
  "cellFill": 0.94,
  "revealDensity": 70,
  "underprintMode": "tint",
  "washStrength": 0,
  "edgeMode": "granular-flow",
  "revealShape": "round",
  "unflipDelay": 0.05
}
```

### X1.4 Trick 3: Build a standalone app jig

"A completely standalone app, quickly vibe coded, that speeds up a key workflow. This is not a control panel for making design tweaks, it is a workbench for sawing materials." Their case: "We needed to generate a bunch of pairs of images of old dogs: matching pairs that included both a dog in a calm, resting state and the same dog in an energized, tool-using, futuristic state. This required a ton of fast image review, feedback, refinement, and selection to find the dogs we liked that lived up to our image gen standards."

"How" (verbatim):

1. Notice when you've got a schlep of work in front of you.
2. Let yourself daydream about the tool that'd make things easier.
3. Ask your agent to build it, along with an easy "export" to get your jig's results back into the agent. It'll figure this out.

Their "Character review" jig (from the video frames and blog labels): each dog's before and after drawings side by side ("Dog 1 of 50"), progress counts at the top, one-click feedback tags plus a free-text note, Favourite/Approve buttons, and "One button copies every note back to Codex." Result: "Built from one prompt in minutes, this standalone app jig dramatically sped up the image-by-image review, refinement, and regeneration process for 50+ pairs of dog images." Video caption: "My custom jig for tweaking image generation touches on 50 different pairs of dog images".

### X1.5 Trick 4: Raise your agent's ambitions

"It's counterintuitively powerful to just naively ask your agent for the most magical thing you can think of. We made two asks that would've been absurd to ask AI months ago. Astra knocked them both out of the park." (Astra is the name he uses for the agent.)

Ask 1 (verbatim from the blog): "Make it much much MUCH faster. Keep the look and feel identical. I want absolute blazing speed, it can't slow down anybody's computer at all, don't lose any of the nature of the cell-by-cell simulation we have or any of our carefully tuned behavior. Aren't GPU shaders a thing can you just do this as some magic GPU shader thing?" Result: "Rewrote it as a GPU shader. 14 → 117 fps during fast mouse drags." (Measured "from our 1440 × 900 test on a 120 Hz display"; 14 fps was "the rate the original Canvas version dropped to during fast mouse drags.")

Ask 2 (verbatim): "When you hover over a dog and it activates, can it somehow also do a little animation, like part of the dog is coming alive in a subtle way? Make it cute and subtle. I dunno how to do it. Also I don't want to blow up the page size with tons of animation frames so somehow do this with GPU shader magic." Result: "Animated each dog inside the shader. Cut each dog into moving parts and wrote five animations into the GPU shader, adding about 77 KB to the page."

### X1.6 Kamens's three copy-paste prompts (verbatim, from the blog's "Copy the prompt" buttons)

**Design-build loop prompt** ("The whole design-build loop in one prompt."):

```text
I want to design [the page or component] properly before we build it. Work in a design → build loop: image generation for design, code only after I approve a direction.

1. Brief. Summarize what we're designing, the content and functionality that must stay, and any style direction or dislikes I've given. If a version already exists, look at it first (screenshots or the running app) so new designs fit. Only ask me about something essential that's missing.

2. Explore. Generate 6 genuinely different design directions as separate, high-resolution images. No code yet. Vary composition, hierarchy, typography, color, density, and mood, not just small tweaks. Each one should be a coherent design a top designer would be proud to present. Use real content; don't invent features, taglines, or filler UI. Look at every image yourself and regenerate any that are generic, cluttered, or break the brief. Save them in one folder with descriptive filenames, list them with one line on what makes each distinct, then stop and wait for me.

3. Refine. For each direction I pick, generate 3–4 variations that keep its core idea and explore nearby choices. Carry all of my feedback forward as explicit constraints. If I reject a whole round, start fresh instead of making timid variations.

4. Build. Only after I approve one image, implement it with our existing code, components, and design system. Treat the mockup as the source of truth; don't flatten it into a generic approximation.

5. Verify. Screenshot the result at the mockup's size (and on mobile), compare it side by side with the mockup, fix what's different, and repeat until they match. Tell me about any deliberate differences.

Then we'll run the loop again for the next part of the page, using screenshots of what's already built as context.
```

**In-app design jig (tuning panel) prompt** ("Asks your agent for a dev-only tuning panel wired to your real page."):

```text
Build me a design tuning panel for this page: a dev-only overlay of controls that change design parameters live, so I can dial in the look by feel instead of describing changes to you.

1. Read the page and propose the 8–15 parameters most worth tuning: type sizes and spacing, colors, layout variants, animation timing and easing, image treatment, effect intensity, whatever matters most here. Group them sensibly and let me confirm or add to the list.

2. Build it as a small, collapsible floating panel that stays out of the way. Use the right control for each value: sliders that show their number, color pickers, dropdowns for variants, toggles. Every change should update the real page instantly, without a reload.

3. Wire the controls to the values the page actually uses (CSS variables, config, component props), not a parallel mock, so what I see is exactly what ships.

4. Only load it in development or behind a URL flag like ?tweak=1. It must add nothing to production.

5. Remember my settings across reloads, with reset for each control and for everything.

6. Add a "Copy settings" button that copies only what I changed, as a compact diff against the current defaults. When I paste that back to you, update the committed defaults so the code and the panel stay in sync.

Make it easy to add new controls. We'll keep adding to it as we build.
```

**Standalone app jig (workbench) prompt** ("Asks your agent for a workbench for any repetitive job, with an export it can act on."):

```text
Before we keep going, build me a small standalone tool for this part of the work. It isn't part of the product; it's a workbench that helps me make it, like a woodworker's jig.

The job: [describe the repetitive or precise task, e.g. reviewing 40 generated images, sorting test cases, comparing versions].

Design it around doing that job fast:

- Show every item in one place, large enough to judge, with before/after or alternate versions side by side.
- Let me act on each item in one or two clicks: approve, reject, star, apply reusable tags I can define, and add a short note. Add keyboard shortcuts for the common actions.
- Show my progress (done vs. remaining) and let me filter by status or tag.
- Save everything automatically so I can close it and come back.
- Add an "Export for agent" button that copies my decisions as clean, structured text: tag definitions once at the top, then each item's ID, decision, tags, and notes. I'll paste that back to you, and you'll work through it item by item.

Keep it simple, fast, and local. It's a tool for the two of us, not a polished product. Ask me anything essential about the job, then build it and tell me how to open it.
```

### X1.7 The `design-build-loop` skill, in detail [Kamens skill]

Description: "Explore diverse, high-quality visual directions, refine selected concepts, implement the approved design, and visually verify the result against the chosen mockup." Core line: "Explore broadly, select intentionally, build faithfully, and verify visually. Preserve the user's taste, product constraints, and approved decisions throughout the process. Remain in design exploration until the user approves a direction and explicitly chooses to implement it."

The ten steps, condensed but faithful:

1. **Build the brief from the conversation.** Extract: the artifact; fixed information architecture, functionality, content and approved elements; desired style, mood, references, density, degree of experimentation; explicit dislikes and lessons from rejected work; requested concept count (default 5). Don't re-ask settled questions. Inspect every referenced screenshot, image, live page or implementation first. When extending an existing product, new concepts should "feel native to the surrounding experience" unless the brief invites reimagining.
2. **Keep one browsable exploration tree:** `design-explorations/<subject-slug>/01-initial-exploration/`, `02-branch-<relevant-title>/`, `03-branch-<relevant-title>/`. Only candidate images go here. Sequentially numbered rounds; descriptive ordered filenames like `01-asymmetric-register.png`; preserve earlier candidates; no HTML galleries, code or prose docs during exploration unless asked.
3. **Generate a broad first exploration** with the available image tool: separate high-quality images, not a contact sheet. "If no image generation is available, tell the user rather than substituting code-built mockups." Act "as a world-class brand and interface designer." Vary composition and page architecture; hierarchy and grouping; typography, scale, rhythm, density; palette, contrast, surface, graphic language; navigation and interaction placement; the balance of expressive character and product clarity. "Do not invent features, marketing claims, clever taglines, excess metadata, or decorative UI merely to fill space. Favor clarity, simplicity, legibility, and understandable actions."
4. **Review before presenting.** Look at every image. Regenerate any that miss a fixed requirement, are "cluttered, generic, incoherent, or substantially duplicates another candidate", use the wrong page type, hierarchy, content or theme, include avoid-listed things, or have generation artifacts.
5. **Open the folder and ask for direction.** List filenames with one phrase each; ask which to explore and what to change; stop and wait. "Do not choose a winner on the user's behalf unless they ask for a recommendation."
6. **Branch from favourites without merely cloning them.** New folder `NN-branch-<title>`, 3–5 descendants each, keeping the parent's defining idea while exploring "sizing, hierarchy, geometry, typography, color, balance, or interaction treatment". Use the parent mockup as reference. Carry all likes and dislikes forward as explicit constraints. If the whole round is rejected, "do not make timid variants"; translate the critique into constraints and start a fresh exploration.
7. **Lock the approved direction.** Keep the chosen image where it is (no duplicate), summarise the locked details, and ask "Would you like me to implement this now?" Don't implement until yes.
8. **Implement faithfully.** Inspect the existing implementation, repo instructions, design system, assets and viewports first. "Do not use implementation convenience as a reason to flatten the approved design into a generic approximation." Adapt only for accessibility, responsiveness, real content or function.
9. **Visual verification loop.** Screenshot at the mockup's viewport (plus key responsive widths); compare composition first, then hierarchy, dimensions, alignment, spacing, typography, color, imagery, controls and responsiveness; fix; re-screenshot; repeat until "no material visual discrepancies remain." Inspect the actual screenshots "rather than relying only on code, computed values, or memory." If rendering or screenshots aren't possible, say so plainly.
10. **Handoff.** Report what was implemented, which viewports were compared, and any deliberate differences.

### X1.8 What olddogs.ai actually looks like [Kamens images + Observed]

From the article images and the live page (loaded Nov 26, 2026):

- **Hero:** a greyscale, engraving-like coastal scene with a lighthouse, rendered as a mosaic of small round or hex cells (the "digital surface" from the jig). Dogs sit in the scene; hovering reveals a dog in full colour inside a warm cream "wash" bloom (one on a hoverboard, others building, using a computer, balancing). Reveal edge, tile shape and trail are tunable (see the jig). The scene dissolves into the cream page with a scattered cell edge rather than a hard line.
- **Wordmark:** "OLD DOGS / NEW TRICKS" in a stacked, heavy grotesk with the second line offset right.
- **Headline:** a large, light, high-contrast serif (a Didot/Bodoni stack): "Transform your company from **behind in AI** to leading the pack", with "behind in AI" reversed (cream type on a near-black block).
- **Below the hero:** a logo rail; a short founder note in a narrow centred serif column signed "BEN / JACE, FOUNDERS"; four numbered "How we work together" cards, each with a painted dog vignette; a black quotes band with a large serif pull quote, a 01/03 pager and progress rules; a "Why work with us" heading whose second half dissolves into a dot-matrix texture; a team section; a contact form; a footer. Dogs come as calm/energised pairs (Schnauzer, Mastiff, Terrier, Saluki).
- **Observed CSS tokens:** `--paper:#f6f1e5`, `--ink:#191b22`, `--muted:#6b665c`, `--faint:#a59d8a`, `--accent:#356f97`, `--band-surface:#111`, `--band-ink:#f6f1e5`, `--band-accent:#77a8c9`. Font stacks: display `Didot, "Bodoni 72", "Bodoni MT", Georgia, serif`; sans `"Helvetica Neue", Helvetica, Arial`; nav `"DIN Condensed", "Arial Narrow", Impact`. The stylesheet also loads many trial display faces (FH Oscar, FH Premier, Satoshi, Cabinet Grotesk and others, under "local-trials"), which suggests they auditioned typefaces in the live page. It includes `prefers-reduced-motion` rules.
- **For AI agents:** there is a "For AI agents" footer link, and the contact form says "Or let your agent check the fit first."

---

## X2. What Yakko said and did (railcode.dev) [Yakko]

### X2.1 The claim and the mindset

He opens with the generic look ("When you think of a vibe coded website, you probably think of something like this:"), shown as a fake dark SaaS page: a dark background, a purple/violet gradient headline "Plan less. **Ship more.**", a "New: AI task triage is live" pill, a glowing product card, a "Start Free Trial" pill button with "No credit card required", and "4,000+ teams build with Loopline" with an avatar stack. Caption: "fake website for example purposes (that looks like a lot of real websites that are not for example purposes)". Treat that image as the anti-reference.

Mindset quotes:

- "I've actually found myself more excited about design now that I have coding agents to help me. I was helpless before, but now I can actually make a creative vision I have a reality."
- "My goal here is to show that you can leverage coding agents for tasteful design (tasteful meaning something you yourself like) and that you should feel empowered to do so."
- In the post that shared it: "coding agents are awesome and you shouldn't settle for AI slop to represent your brand".
- He indexed every prototype with its prompt: "In order to write this post I pulled in *every* prototype into an index with the exact prompt that generated it so I could truly trace my process back and ground this article in facts". The index screenshot is a card grid: thumbnail, filename (e.g. `mockup-2-brutalist.html`, `mockup-3-clay.html`, `mockup-4-comic.html`, `mockup-5-tycoon.html`, `new/dark-color-playground.html`), date, and the prompt in quotes.

### X2.2 Find the concept in the name and the feeling

"The name Railcode comes from the idea of 'code on rails'... Then, the week before I decided to make the website, I realized I was having a ton of fun building stuff for myself inside Railcode (I'm an active user) and when I asked customers about it, they said they were having fun too. Rails + fun = rollercoaster, so I decided the website was going to have a rollercoaster on it."

### X2.3 Inspiration methods

"I'm not a designer, so it's really hard for me to create concepts from scratch. That means I have to rely on examples and inspiration. For this, I have two methods:

1. Browse the web for designs that I like
2. Tell an agent to generate a ton of designs of a thing in different styles

The idea here is to open my mind up to what might be possible. Most times I'll grab ideas from multiple places, combine them, and endlessly iterate on them until I get to something I'm happy with. Most times it's a dead end."

First rollercoaster seeds (screenshot): `coaster-2-ascii-standard.html`, `coaster-3-ascii-hyper.html`, `coaster-5-canvas-neon.html`, `coaster-6-css-only.html`. "The ASCII designs (two top ones) were inspired by a friend's website that I'd seen earlier in the week" (https://www.context.store/). "The other ones I left up to Fable's imagination. These were meant to serve as the seed for inspiration."

Two levers he names:

- **Levels of intensity:** "I'll tell the agent to take a concept/idea and generate designs that fall on different parts of the spectrum of intensity/complexity. This allows me to have a sense of if the concept as a whole is interesting (if I don't like anything on the spectrum probably I'm on the wrong spectrum), as well as gives me a sense if I think I want to be more minimalistic with a concept or if there's space to go for something crazier."
- **Go wild:** "I usually ask an agent for at least 4 versions when trying out a concept, and sometimes even 10. I'll provide some level of guidance for at least half of the versions, and then tell the agent to go wild with the remaining ones. Most of the time these will absolutely suck, but they are useful in providing a spark for new ideas." The "crazy ugly neon design" from the go-wild set "took me away from the ASCII idea and into something more ambitious."

### X2.4 From one ugly idea to a strong reference: Rollercoaster Tycoon

"Looking at the Neon monstrosity that Claude created, I was reminded of this game, and that's when I knew I wanted my website to be a reference to it." (The game is Rollercoaster Tycoon: https://atari.com/pages/rollercoaster-tycoon.) He then had the agent build a playable mini version. The caption is the prompt: "build a rollercoaster tycoon like contained component that I can actually play around with in an html  build two in parallel actually. one of them should have a transparent background". Verdict: "This was cool and for a second I thought my website would actually have a game in it, but after playing around with it for a bit I realized that it would have been a little too much."

Then a single coaster "that I really liked. After enough attempts, I finally got it". He put it on a template (a dark, generic hero with an isometric wireframe coaster and the line "Fun and safe, like a rollercoaster") and concluded: "This was cool and all but like wtf is a rollercoaster doing in the middle of this website? It was out of place. Clearly, we needed a whole park."

**Lesson [Guide, from Yakko]:** an illustration dropped onto a template looks pasted on. The concept has to become the world of the page.

### X2.5 The park strip and the section transition

"Having decided I needed a park, I felt for some reason it would need to go at the bottom of the hero." Prompt (caption): "add a thin strip of maybe 200px height where we have a bunch of amusement park attractions in the same style as the rollercoaster". On a page "it still looks pretty bad". Iterated, it became the final hero. How: "by anchoring the asset designs on the rollercoaster from earlier, hand-picking and working on the individual animations, and deciding that the strip shouldn't be standalone but actually a color transition to the next section."

What the final hero looks like (screenshots and the article cover): a pale sky-blue background with small drifting pixel clouds; a large, light-weight sans headline ("Build the tools your team needs" in one version, "Internal tools, shipped from a sentence." in another); a short sub-line with key phrases in a darker blue weight; a chunky yellow pill button with a darker bottom edge and soft drop shadow ("TALK TO FOUNDER →" or "BOOK A DEMO →", uppercase, small tracking); on the right a dark, warm-brown terminal window ("claude", traffic-light dots, a pixel mascot, "Opus 4.8 with high effort", a typed prompt with a blinking coral cursor, "? for shortcuts"); below it a row of small greyscale agent/tool icons. Along the bottom, a pixel-art amusement park (rollercoaster, Ferris wheel, carousel, swing ride, food stand, pine trees, flags, lamp posts, tiny people) on a green diamond-checker "grass" band that becomes the next section's background.

### X2.6 Forks on forks, and playgrounds

"When I build websites, I do one single HTML file until it's basically ready to go, and only then turn it into React with various components that can be edited by agents in parallel. The reason for this is that it makes it really fast to fork/copy a design, change one or two things, and look at them side by side."

His fork grid shows prompts such as: "now create a dark mode version of /index-park-motion.html"; "copy file:///Users/yakko/Desktop/gh/one-offs/railcode-landing/new/index-park-motion.html into a new file and make the for the park be green"; "...substitute the terminals section for this new section"; "copy ... index-park.html into a new file and make the attractions and people move. I want the... same exact design we have here, just some movement"; "don't use that concept. do your own. following the rollercoaster style. make sure to include a rollercoaster"; "can you make a 'playground' file out of this where I can manually choose a color and see what it looks like".

Playgrounds: "Another thing I do is build what I call 'playgrounds' where I can play with colors and other variables. In this case, I started by changing the grass color from blue to green (because grass is green, duh), but the green I got wasn't exactly what I wanted. So I got Claude to build one of these playgrounds where I could try different accent colors, text colors, grass colors, background colors, and so on, which is how I landed on the tone of grass that I wanted." He adds: "(I almost feel like building a little open source tool that helps with these forks and playgrounds. Maybe I'll give it a try when I have time.)" The index also lists `new/dark-color-playground.html` with the prompt "finish yourwork, then build a new playground now where I can tinker with the background color, accent color (including second section, and other relevant colors".

### X2.7 Obsess over details; exposure to bad designs pays off later

- **A CTA from an early discard:** "Before even going on the rollercoaster direction, I kicked this whole process off by having Fable build me 'mockups of a fun website for a dev tool'. They were mostly all slop, but when thinking about a better design for the CTA, I remembered having seen something that would fit". The image is a small yellow pixel-font "PRIVATE BETA" badge beside a pixel logo; it became the chunky yellow button. "This is the argument for being exposed to a lot of designs early in the process, even if they're terrible. You might find a diamond in the rough later down the line." The early mockups in his index (brutalist, clay, comic, tycoon) came from the prompt "in parallel create 4 html mockups of a fun website. it should just feel fun. this will be for a dev tool" and "make a rollercoaster tycoon inspired website".
- **Background colour sets the mood:** "the white background didn't make the site feel fun (which is what I wanted), so I made it sky blue, then added in clouds for the vibes". Caption: "The white -> blue change makes a world of difference".
- **The hero dictates the rest:** "Everything else followed from there. The hero dictated the rest of the site." "The accent color of the Railcode product is currently blue, but the green on the website happened so naturally that I just embraced it instead of fighting back. That's how we got light green and dark green sections, and eventually the soil footer. I might need to revisit the product's design as a result..."
- **Reuse the established style:** "once the style had generally fallen into place, I could reference it throughout when making new icons and assets. It was important to get the vibe down, because then I had a solid sense of direction."
- **The nav morphs to the section colour:** "the nav, which felt like it didn't belong as a static color, so I made it morph into the background color of whatever section is in view. Makes a huge difference in my opinion!" Caption: "I tried static versions in white, light blue, light green, and dark green, before realizing that the best was to just have them all".

### X2.8 Inspiration, named and specific

- "getting inspiration from existing work is essential for my creative process as a non-designer. And clear examples are also the best way to steer coding agents."
- "Sometimes you end up with a very similar representation of something you saw, like this light section turning dark that is a relatively common pattern but that I often refer to @ContextualAI for". The side-by-side shows contextual.ai's white section meeting a near-black section with a rounded top edge, next to Railcode's light green testimonial section meeting a dark green "Make tools you'll want to use" section with tabbed product UI.
- "But other times things are less clear. Like this Railcode section that was actually inspired by @ClayRunHQ". The side-by-side shows clay.com's mixed-size bento cards with illustration, next to Railcode's dark green "The section to screenshot and send to IT" grid of four cards, each with a small pixel-art icon (a traffic cone, a ledger, a door, a house).
- "Railcode's website is nothing like @sentry 's but I kept looking at their site to get a feel for illustrations that tie in well with content."
- He asks an assistant for references. A screenshot shows "what are some fun saas websites" and then, after midnight, "more" (caption: "30min past midnight: 'more'"). The first answer listed PostHog, Butter, Clay, Pitch, Gumloop, Slite and Spline; Raycast is visible in the second.

### X2.9 His summary list (verbatim)

- "I exclusively use Anthropic models for design. I've found that the OpenAI models really struggle even with specific directions. Fable is the best of the best."
- "I keep everything in one HTML file until I'm satisfied with the design and ready to work on things like copy."
- "I look at a lot of websites for inspiration. I regularly go back to websites I really like and constantly look for new ones. If I really like a specific component, I'll use it as the base for me to build on top of."
- "I get Claude to generate tons of different websites at the start and end up throwing 99% of this work away, but will occasionally pull a component from one of them, or just get a new idea to try out."
- "I often tell coding agents to 'go wild' on a few designs, and also to take the seed of an idea and build multiple versions of it in a spectrum from minimal -> outlandish."
- "I like having an easily accessible trace of my process, so I'll constantly 'fork' a design, change a few things, and compare with the original. I might then continue working on top of the fork or go back to the original, but I never delete any of the forks."
- "I build playgrounds where I can easily play around with colors, fonts, and placements and see the results in real time rather than go through the slow iteration process of telling an agent to change something."
- "I iterate, and iterate, and iterate some more. Most iterations are dead ends."
- "And most importantly, I have fun in the process :)"

### X2.10 What railcode.dev uses [Observed, Nov 26, 2026]

- **Fonts (Google Fonts):** **Rubik** (300–900) as `--sans`; **Schibsted Grotesk** 600 as `--brand-font`; **Press Start 2P** as `--pixel`; a system monospace stack as `--mono`.
- **Tokens** include sky `--paper:#dff0fb` and `--paper-2:#e7eff8`; warm ink `--ink:#221812` and `--muted:#6f6156`; greens `--band-2:#cde5b0`, `--band-lift:#e1efd0`, `--showcase-bg:#21452d`, `--ink-cool:#1e3a22`; soil `--footer-bg:#4a3423`; terminal panel `--panel:#2c2520` and `--panel-fg:#eee8e1`; blue links and buttons `--coral:#4c8dd4`. Lines and shadows are tinted from the ink colour (`--line:#2218121c`, `--shadow:#22181217`), not neutral grey.
- **Rendering:** pixel art uses `image-rendering: pixelated` / `crisp-edges`. There is a `useReducedMotion` module and `prefers-reduced-motion` rules. A source comment says the guardrails section can export a PNG of itself with the right fonts embedded (the section says "Click here to actually download a screenshot of this section that you can share").
- **Now live:** the hero copy has since changed to "Where non-technical teammates deploy vibe coded apps safely", and the nav has "For agents", "Talk to founder" and "Get started". Content animates in on load; a headless screenshot captured only the sky, nav and clouds.

---

## X3. Common ground between the two posts [Guide]

| Principle | Kamens | Yakko |
|---|---|---|
| Explore wide before committing | 5–10 directions as images; 34 first-round options; 2,460 images total | 4–10 versions per concept; "tons of different websites at the start", 99% thrown away |
| Deliberately weird options | "very different visual worlds... styles, moods, and materials" | "go wild" on half; minimal → outlandish spectrum |
| One ownable concept from the subject | Old dogs learning new tricks, in a coastal lighthouse world | Code on rails + fun = rollercoaster park |
| The human picks | Skill: "Do not choose a winner on the user's behalf" | "tasteful meaning something you yourself like" |
| Branch and keep lineage | Numbered round/branch folders; preserve candidates | Forks side by side, never deleted; prompt index |
| Tune by feel, not by prompt | In-app jig wired to real values; copy the diff back | Playgrounds for colours, fonts, placements |
| Build tools for the schlep | Standalone review jig with export | Playable mini game; playground files |
| Section by section | Loop rerun per section with screenshots of what's built | Hero first; "the hero dictated the rest" |
| Verify visually | Screenshot vs mockup until they match | Side-by-side fork comparison |
| Ambition | GPU shader rewrite; animated dogs in about 77 KB | Animated pixel park; morphing nav |
| Real references | Every / Josh Puckett jigs | Contextual AI, Clay, Sentry, Rollercoaster Tycoon, context.store |

---

## X4. Other respected sources (separate from the two posts)

Use these as guardrails and a quality floor. Nothing in this section came from Kamens or Yakko.

### X4.1 Anthropic, `frontend-design` skill [Anthropic skill]

https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md

- Act as the design lead at a studio known for distinct identities; the client "has already rejected proposals that felt cliché or templated".
- Ground the design in the subject: "The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from".
- Hero: "Open with the most characteristic thing in the subject's world". "A big number with a small label, supporting stats, and a gradient accent is the default treatment, so only use it if that's truly the best option."
- Type: one or two families, clearly distinct if two; choose deliberately; set a clear scale following *The Elements of Typographic Style*; line length under 80 characters; serif body text gets slightly more line-height.
- Typographic tells to avoid: accenting a single word or phrase in a headline with italic, bold or colour; all-caps labels; unnecessary labels above content.
- "Visual structure is information." Use numbered markers only when the content really is a sequence.
- Motion: sparing. "A single orchestrated moment — one page-load sequence or one reveal — lands better than scattered effects; fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated." Motion that answers a person's action is welcome.
- Current AI clusters to avoid unless the brief asks for them: (1) warm cream near `#F4F1EA` with a high-contrast serif and a terracotta accent near `#D97757`; (2) near-black with one acid-green or vermilion accent; (3) broadsheet hairlines, zero radius, dense columns; (4) the SaaS card kit: identical rounded cards, one radius everywhere, `rgba(0,0,0,.1)` shadows, gradient washes; (5) template chrome: a tracked ALL-CAPS eyebrow over every heading, "A · B · C" meta strings, "WORD — fragment" labels, `#0B0B0B`/`#111` standing in for black, monospace for small data labels, "→" appended to links and buttons.
- "Where the brief pins down a visual direction, follow it exactly — the brief's own words always win, including when it asks for one of these looks."
- Two passes: first a compact token plan (4–6 named hex colours; typefaces and roles; a layout concept with ASCII wireframes and alignment; principles), then review it against the brief for genericness and revise, then write code.
- Watch CSS specificity collisions (for example `.section` padding fighting `.cta` padding).
- "Spend your boldness in one place." Quality floor: responsive to mobile, visible keyboard focus, reduced motion respected, accessible, harmonious palette. Take screenshots to critique as you build ("a picture is worth 1000 tokens"). Chanel: before leaving the house, "remove one accessory".
- Writing: words exist to make the design easier to understand and use. Use the user's language, not the system's; active voice; a CTA says exactly what happens; the same action keeps the same name; sentence case; no filler; errors explain what happened and how to fix it.

**Note [Guide]:** olddogs.ai (cream paper, Didot serif, black band, a reversed headline phrase, tracked caps labels, 01/02 numbering) and railcode.dev (arrows and uppercase in buttons) each use several items on this list. They work there because they were chosen inside a strong concept and tuned by hand. That is the point of the list: a default is fine only when it is a choice.

### X4.2 Anthropic, "Prompting for frontend aesthetics" [Anthropic cookbook]

https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics (Prithvi Rajasekaran, Oct 21, 2025)

- Three strategies: guide specific design dimensions (typography, colour, motion, backgrounds) one at a time; reference design inspirations (for example IDE themes or cultural aesthetics); call out common defaults.
- From its prompt: "You tend to converge toward generic, 'on distribution' outputs." Typography: "Avoid generic fonts like Arial and Inter". Colour: "Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes." Motion: "one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions." Backgrounds: "Create atmosphere and depth rather than defaulting to solid colors." Avoid overused fonts (Inter, Roboto, Arial, system fonts), "purple gradients on white backgrounds", predictable layouts. It notes the model still converges on choices like Space Grotesk.

### X4.3 Refactoring UI, "7 Practical Tips for Cheating at Design" [Refactoring UI]

Adam Wathan and Steve Schoger: https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886 (book: https://www.refactoringui.com/)

1. Use colour and weight for hierarchy, not only size: dark-but-not-black for primary text, grey for secondary, lighter grey for ancillary; two weights (400 or 500, and 600 or 700); avoid weights under 400 for UI text.
2. Don't use grey text on coloured backgrounds; lower the opacity of white, or hand-pick a colour of the same hue.
3. Offset shadows vertically instead of using big blur and spread.
4. Use fewer borders: a shadow, two background colours, or extra space instead.
5. Don't blow up icons drawn for small sizes; enclose them in a shape, or use icons drawn for large sizes.
6. Accent borders add colour to bland areas.
7. Not every button needs a background: primary solid and high contrast, secondary outline or low contrast, tertiary as links.

### X4.4 Vercel, Web Interface Guidelines [Vercel WIG]

https://github.com/vercel-labs/web-interface-guidelines (agent version: `AGENTS.md` in that repo)

Rules most relevant to marketing pages: visible `:focus-visible` rings; hit targets of at least 24 px (44 px on mobile); mobile input font at least 16 px; never disable zoom; navigation uses `<a>`; honour `prefers-reduced-motion`; animate only `transform` and `opacity`; never `transition: all`; autoplay motion longer than 5 s needs pause, stop or hide; verify mobile, laptop and ultra-wide; skip link, `scroll-margin-top` and hierarchical headings; curly quotes and `text-wrap: balance`; `tabular-nums` for compared numbers; never colour alone for status; explicit image dimensions to prevent layout shift; preload above-the-fold images and critical fonts; prefer `<video autoplay muted loop playsinline>` to GIFs, with a still or reduced-motion fallback; `color-scheme` and `theme-color` match the page; layered shadows; concentric nested radii; tint borders, shadows and text toward the background hue; meet contrast (they prefer APCA to WCAG 2).

### X4.5 Every, "Designing with AI: make a jig" [Every] (linked by Kamens)

https://every.to/p/designing-with-ai-make-a-jig (Jack Cheng)

- The woodworking origin: "A jig, by its broadest definition, is a tool that makes it easier to make something else." He first saw the term used for AI interface design by Josh Puckett.
- He built on-page control panels for a particle "river" (how close it came to text, size and opacity ranges of particles), separate jigs to move and resize text blocks and drop-cap spacing; the largest "tuned 27 distinct visual variables" for one explainer step.
- "Designers are relearning the lesson with chat interfaces, discovering that prompting is too coarse a method of adjustment compared with what they're used to."
- Premade jigs he mentions: Josh Puckett's DialKit ("A floating control panel for real-time parameter tweaking", listed at https://joshpuckett.me/), Alex Barashkov's open-source Toolcraft, Codex's in-app browser annotation mode, Figma Motion.
- His prompt: "Make a collapsible UI jig to help me tune [site, page, or element] / Let me control [the parameters you want to control] / Remember my settings so the jig survives restarts and disconnections. Ask me before making any local adjustments public."

---

## X5. What could not be read or verified

- **The authors' replies and threads on X** could not be read: the X connector hit the account's daily read limit (it resets at 7:00 PM ET on Nov 26, 2026). Both article bodies, all captions, and all images and videos were read in full through a public mirror of the X posts (the fxtwitter API). Any follow-up tips the authors posted as replies are not in this guide.
- **Videos and GIFs** were downloaded and reviewed as sampled frames, not frame by frame.
- **The railcode.dev hero** did not render in a headless screenshot (its content animates in). Details come from the article images and the site's CSS.
- **Josh Puckett's DialKit and Alex Barashkov's Toolcraft** were not opened; they are described only as Every and Puckett's homepage describe them.
- **"Fable"** is the name Yakko uses for the model he designs with. This guide says nothing more about it than he did.

---
