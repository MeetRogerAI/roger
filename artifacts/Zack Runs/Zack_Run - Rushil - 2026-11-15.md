# Zack Run - 2026-11-15

Zack The Collector (for Claude) v1.9, run in Claude Code. This covers the member's own Claude Code sessions from the past 7 days.

## Summary

| Play | Set | Minutes saved each time | Current | Heavy user (best guess) | Heavy use for |
|---|---|---|---|---|---|
| 1. Demo-day prep: ship a tester build and record demo videos | A, top for you | 351 | 1 a week (your estimate) | 2 a week, 11.7 hours a week | Founders and sales engineers who demo an app several times a week |
| 2. Pre-meeting numbers: refresh a dashboard from Airtable and check submissions | A, top for you | 99 | 1 a week (your estimate) | 5 a week, 8.2 hours a week | Program and operations managers with daily or weekly check-ins |
| 3. Build an interactive lesson demo grounded in learning science | B, my garbage, your treasure | 747 | 3 a year (your estimate) | 1 a week, 12.4 hours a week | Curriculum designers, edtech builders, teachers making flagship lessons |
| 4. SEO and AI-search audit and fix across your websites | B, my garbage, your treasure | 358 | 12 a year (your estimate) | 2 a week, 11.9 hours a week | Freelance web developers and small agencies |

- Play 1: 5.9 hours a week (4.0 to 7.7). This week: 351 minutes (237 to 465).
- Play 2: 1.6 hours a week (1.1 to 2.2). This week: 99 minutes (68 to 129).
- Play 3: 0.7 hours a week (0.5 to 0.9). This week: 747 minutes (522 to 972).
- Play 4: 1.4 hours a week (0.9 to 1.8). This week: 716 minutes (493 to 938), from 2 jobs.

**Total over a year: about 9.6 hours a week saved (6.5 to 12.6), 340 to 657 hours a year.**
**Total this week: 22.0 to 41.7 hours saved (about 31.9).**

These are current figures only. Heavy-user figures are not included in the totals.

---

## Play 1: Demo-day prep: ship a tester build and record demo videos

*Set A, top for you.*

The morning of a live demo, Claude ships a fresh tester build of an app to tablet and desktop and gets the presenter's access working end to end. In parallel it records short demo videos of the app's best feature, plus a longer showcase reel. Each clip is checked frame by frame before it reaches you.

**Doing this by hand** (378.5 minutes)
- Check what's live, then cut a release branch from the live code plus unshipped fixes: 30 min (est.)
- Find and fix a desktop-only input bug: 60 min (est.)
- Run the test suites and review the results: 20 min (est.)
- Build, upload and distribute 2 tester builds, with notes: 2 × 30 = 60 min (est.)
- Create the presenter's account and give them demo access: 20 min (est.)
- Invite the presenter as a tester: 5 min (est.)
- Check production health and the AI credit balance: 1 search × 5 + 2 checks × 1.5 = 8 min (Default)
- Script and record 6 demo clips: 6 × 15 = 90 min (est.)
- Edit a 2–3 minute showcase reel: 60 min (est.)
- Verify each clip's content frame by frame: 7 × 1.5 = 10.5 min (Default)
- Write setup steps for the presenter: 15 min (Default: short email)

**Using Claude** (27.5 minutes, counted)
- 9 typed requests × 1 = 9 min
- 8 one-word replies × 0.25 = 2 min
- 2 multiple-choice answers × 0.25 = 0.5 min
- 14 results read × 1 = 14 min
- 1 account step only the member could do (accepting a store agreement): 2 min (est.)

**Time saved:** (378.5 − 27.5) × 1 = **351 minutes**

**Range:** low = 378.5 × 0.7 − 27.5 = 237 minutes; high = 378.5 × 1.3 − 27.5 = 465 minutes

**Confidence:** Low. Most steps are "est."

**Over a year**
- # of occurrences per year: 52 (1 per week)
- Time saved per occurrence: 351 minutes
- Hours saved per week: 5.9 (Range: 4.0 - 7.7)
- Hours saved per year: 206 - 403
- Source: your estimate
- Heavy user (best guess): 104 per year (2 per week), 11.7 hours saved per week
- Heavy use for: founders and sales engineers who demo an app to customers or schools several times a week
- Your hours a week = your runs a week × 351 minutes ÷ 60

### Playbook

**1. Play**
Demo-day prep. Result: the presenter can open the newest build on their own device with the demo feature already on, and has a polished showcase video plus short clips, all checked for correctness.

**2. Trigger**
A request on the morning of a demo, or the day before: "We have a demo at [time]. Push the newest version to [tablet] and [desktop] and record videos of [feature]."

**3. Setup first** (answer once)
- Which app is it, and where does its code live?
- Which platforms should the build reach (tablet, desktop, phone)? Do you publish through TestFlight / App Store Connect or another tester service?
- Who presents, on which device, and where are they? Do they already have an account and tester access?
- What is the demo time, and in which time zone?
- Which feature should the videos show, and for what audience level?
- Is there a reference video whose style the clips should match?
- Do you already have a recording harness or simulator setup for scripted sessions?
- Which test account can the recording use? Where is its password stored (Keychain or a password manager)? It is never typed into chat.
- Where should the finished files go (for example Downloads)?
- Does the demo depend on a paid service (an AI provider, an API) whose balance could run out?

**4. Steps**
1. First ask when the demo is and **who presents on which device**. This sets the deadline, and whether the presenter needs their own account and tester access.
2. Find out what's live: the last released build, merged changes, and fixes that are ready but unshipped. Cut a release branch from the live code plus the ready fixes. Leave unrelated work-in-progress alone.
3. Split the work into two lanes that run in parallel, each in its own worktree and its own simulator: a **Ship lane** and a **Videos lane**.
4. **Ship lane:**
   1. Check that the store or tester service accepts requests before building. If an agreement has expired, stop and tell the copier the exact screen to accept it on, then retry after a few minutes.
   2. Build for each platform. When a tablet app runs on desktop, test pointer input specifically (mouse and trackpad drawing, pinch, scroll). Also test sign-in without the tablet's device checks and window resizing, and hide features that can't work on desktop.
   3. Test **without touching the copier's screen**: run the app in the background or a hidden simulator, inject input inside the app, and screenshot the app window.
   4. Run the full test suite. Open a pull request and merge it only if the change is app-only and the copier agrees.
   5. Upload the build, add what-to-test notes, add it to the tester groups, and confirm desktop availability.
5. **Check the demo's dependencies:** production health, the server route the demo feature calls, and the balance of any paid service the app uses. If a balance is low, tell the copier to top it up.
6. **Presenter access:**
   1. Create the presenter's account or invite them, and add them to the internal tester group (internal testers skip beta review).
   2. Give them only what the demo needs: a role, a feature flag, demo credits so they don't hit a paywall. Do this for demo day only.
   3. If a feature switch is saved per device, turn it on through an account flag (this may need a small app change and a new build). Plan time for that.
   4. Check the presenter's sign-in end to end on their platform.
   5. Write numbered setup steps for the presenter, and note when the temporary access will be removed.
7. **Videos lane:**
   1. Before recording anything, study the reference video's frames and match its pacing and look.
   2. Confirm the audience level and which feature to show. Script 5–6 problems from simple to harder.
   3. Record in a hidden simulator with the test account. Hide debug buttons and status chips, and keep handwriting or input realistic.
   4. Review every clip frame by frame for correctness (counts, answers, ticks) before showing it to the copier.
   5. Cut a longer showcase (2–3 minutes): several problems back to back, small topic labels, one title card and one end card.
8. Move only approved files to the agreed folder. Keep them small enough to send by AirDrop or message. Report the build number, the presenter's steps and any known flaky test.

**5. Guardrails**
- Needs the copier's yes: merging to the main branch, creating accounts in production, granting any role or flag, turning a paid feature on for all users, and anything that costs money.
- Never: move the copier's real mouse or keyboard, or use their screen. Never print a password in chat; store it in Keychain or a password manager and tell the copier where it is. Never leave demo access in place after the demo.
- If blocked (store agreement, failed upload, missing account), stop that lane and give the copier Apple's or the service's exact error and the single step that fixes it. Keep the other lane running.

**6. Output**
- One message: "Build [number] is live for [tablet] and [desktop] in [tester groups]", the presenter's numbered setup steps, QA results (tests passed, known flaky test) and any risk (for example a low API balance).
- Files: `[App]-showcase.mp4` (2–3 minutes) and a `[App]-clips/` folder of 5–6 clips, in the agreed folder.

**7. Pitfalls seen**
- The agent tested the desktop build by moving the real mouse. Say "test in the background, never use my screen" up front.
- The first videos didn't match the style wanted. Get the reference video before recording.
- The first video list targeted the wrong audience level and the wrong feature. Confirm both before scripting.
- On desktop, mouse input arrived as a different kind of touch than a finger and was silently dropped. Always test pointer input on a desktop port.
- An expired store agreement blocked every upload. Check it first; only the account holder can accept it.
- Creating an account in production failed until the sign-up included the app's current terms version. Read how the app signs users up before creating one by hand.
- A new account had a role but no plan, so it would have hit a paywall. Give demo credits as well as the role.
- Both lanes used the same simulator and killed each other's takes. Give each lane its own simulator.
- The demo's AI credit balance was nearly empty. Check paid balances on demo day.

**8. Done when**
The presenter signs in on their own device with the new build and the demo feature is already on. The approved showcase and clips are in the agreed folder, and every clip's content was checked.

**9. Paste to install**
> Written by another member. Read sections 1 to 8 before pasting this.
>
> Save this as a skill called "demo-day-prep". When I say I have a demo coming up, follow the steps, guardrails and output in the playbook I'm attaching (sections 1 to 8). Ask me the setup questions in section 3 the first time. Run on request only. Never use my screen, never print passwords, and ask before merging, creating accounts, granting access or spending money.

---

## Play 2: Pre-meeting numbers: refresh a dashboard from Airtable and check submissions

*Set A, top for you.*

Before a recurring meeting, Claude reads your existing dashboard and pulls current figures from Airtable. It answers the one question you need settled (has everything been submitted downstream?) and gives you talking points. On request it refreshes the dashboard itself.

**Doing this by hand** (102.5 minutes)
- Open the dashboard and verify its current figures: 5 × 1.5 = 7.5 min (Default)
- Query Airtable for submission status: 3 searches × 5 = 15 min (Default)
- Break the blocked rows down by problem: 10 min (est.)
- Pull current values for 5 stale metrics: 5 × 5 = 25 min (Default)
- Rebuild the dashboard's data files and update the page: 30 min (est.)
- Write talking points for the call: 15 min (Default: short email)

**Using Claude** (4 minutes, counted)
- 2 typed requests × 1 = 2 min
- 2 results read × 1 = 2 min

**Time saved:** (102.5 − 4) × 1 = **98.5 minutes**, about 99

**Range:** low = 102.5 × 0.7 − 4 = 68 minutes; high = 102.5 × 1.3 − 4 = 129 minutes

**Confidence:** Low. Two steps are "est."

**Over a year**
- # of occurrences per year: 52 (1 per week)
- Time saved per occurrence: 99 minutes
- Hours saved per week: 1.6 (Range: 1.1 - 2.2)
- Hours saved per year: 59 - 112
- Source: your estimate
- Heavy user (best guess): 260 per year (5 per week), 8.2 hours saved per week
- Heavy use for: program and operations managers who report numbers at daily or weekly check-ins
- Your hours a week = your runs a week × 99 minutes ÷ 60

### Playbook

**1. Play**
Pre-meeting numbers. Result: a short, sourced answer to "where do the numbers stand and has everything been submitted?", plus a refreshed dashboard if you ask for one.

**2. Trigger**
A request ("I have a call with [your manager] about [the program]; show the numbers and check everything was submitted"), or a weekly schedule set the morning of the recurring meeting (for example Mondays 9:00 in your time zone).

**3. Setup first** (answer once)
- Which Airtable base and tables hold the numbers? Connect Airtable read-only.
- Which dashboard shows them (for example a Claude artifact), and which data files or tables feed it?
- Which metrics matter in the meeting, and which are final (from a closed period) and must not change?
- What counts as "submitted": which field or status marks a row as sent to [the downstream system], and is there a field that records problems blocking it?
- Who is the audience, and how much detail do they want?

**4. Steps**
1. Read the dashboard first. List every figure with its "as of" date and where it comes from.
2. Read the Airtable schema and find the status, submission and problem fields.
3. **Answer the yes/no question first**: "Has everything been submitted?" Give counts by status, then break the blocked rows down by reason. Check both the "submit" flag and the problem field, because a row can be flagged but still blocked.
4. For each figure that might be stale, pull the current value. Leave figures from a closed period as they are and say so.
5. Write the talking points: a headline table, what changed since the last version, and open issues.
6. If asked to update the dashboard, find **every** data file the page reads (some figures live in separate files). Rebuild them, add a card for the submission check and a "refreshed on" note, upload, then open the dashboard.
7. Tell the copier which numbers changed, from what to what. Say whether the page was visually checked.

**5. Guardrails**
- Airtable is read-only for this play. Never tick submission flags, trigger submissions or edit rows.
- Only update the copier's own dashboard.
- If a source can't be reached, mark those figures as stale with their date. Never guess.
- Needs the copier's yes: changing any figure from a closed period.

**6. Output**
- One line answering the submission question.
- A table: Metric | Value | As of | Source.
- Blocked rows: Reason | Count.
- What changed: Metric | Old | New.
- The dashboard link, with a note on whether it was visually checked.

**7. Pitfalls seen**
- The page read some figures from separate data files, so updating only the obvious one would have left stale numbers. Find every data source the page uses.
- The update wasn't rendered and checked before the meeting. Ask Claude to render it, or look yourself before the call.
- "Submitted" looked done from one field while another field showed problems blocking every row. Check both.
- Figures from a closed season don't need refreshing. Say so instead of re-pulling them.

**8. Done when**
You can answer "has everything been submitted, and if not, why?" in one sentence. Every figure on the dashboard has a current date or a stated reason it's final.

**9. Paste to install**
> Written by another member. Read sections 1 to 8 before pasting this.
>
> Save this as a skill called "pre-meeting-numbers". When I say I have a meeting about [my program], follow the steps, guardrails and output in the playbook I'm attaching (sections 1 to 8). Ask me the setup questions in section 3 the first time. Treat Airtable as read-only. Only update my own dashboard when I ask. Optional: also run it every [weekday] at [time, time zone] and show me the result.

---

## Play 3: Build an interactive lesson demo grounded in learning science

*Set B, my garbage, your treasure.*

From a single request, Claude researches a curriculum topic and the misconceptions students commonly hold about it, then builds a complete interactive lesson. The lesson includes a live simulation, a pretest and post-test, practice, an exam-style question and spaced review. Claude deploys it and walks through it as a student on the live site.

**Doing this by hand** (750 minutes)
- Research the curriculum standard and common misconceptions: 3 searches × 5 = 15 min (Default)
- Study the inspiration example and the reference design system: 30 min (est.)
- Build and validate a small simulation model: 240 min (est.)
- Build 7 lesson stages: 7 × 60 = 420 min (est.)
- Visual check of 10 pages at desktop and phone widths: 10 × 1.5 = 15 min (Default)
- End-to-end student walkthrough: 20 min (est.)
- Deploy and check the live site: 10 min (est.)

**Using Claude** (3.25 minutes, counted)
- 1 typed request × 1 = 1 min
- 1 one-word reply × 0.25 = 0.25 min
- 2 results read × 1 = 2 min

**Time saved:** (750 − 3.25) × 1 = **747 minutes**

**Range:** low = 750 × 0.7 − 3.25 = 522 minutes; high = 750 × 1.3 − 3.25 = 972 minutes

**Confidence:** Low. Most steps are "est."

**Over a year**
- # of occurrences per year: 3 (0.06 per week)
- Time saved per occurrence: 747 minutes
- Hours saved per week: 0.7 (Range: 0.5 - 0.9)
- Hours saved per year: 26 - 49
- Source: your estimate
- Heavy user (best guess): 52 per year (1 per week), 12.4 hours saved per week
- Heavy use for: curriculum designers, edtech product teams and teachers building flagship lessons
- Your hours a week = your runs a week × 747 minutes ÷ 60

### Playbook

**1. Play**
An interactive lesson demo. Result: a live, deployed lesson on one topic, built around learning science and tested end to end as a student.

**2. Trigger**
A request: "Build an interactive lesson on [topic] for [course/level]. Use [reference design] for the UI and make it the best it can be."

**3. Setup first** (answer once)
- Which course, topic and official standard?
- What level are the students?
- Is there a design system or repository the UI should match? Any inspiration examples (a post or a video)?
- Where should it deploy (for example your personal Vercel team), and is a login wall acceptable?
- Is it a demo (no student data) or will real students use it?
- How much time can it take?

**4. Steps**
1. Research the official standard for the topic and the published misconceptions students hold about it.
2. Study the inspiration example. If the page blocks automated fetching, search for it or download its video and look at frames. Copy the reference design's tokens, fonts and components.
3. Pick a real case or story to hook the lesson on.
4. Build a small simulation model first, and **check that it reproduces textbook results** before building any UI on top of it.
5. Build the stages:
   1. a warm-up pretest with confidence ratings
   2. the case
   3. a lab, using predict-observe-explain on the live simulation: guided experiments, an open bench, and a mystery to solve
   4. learn: animated visuals plus a build-it task
   5. practice: worked examples with fading support
   6. an exam-style free-response question whose data is generated by the same model, so the lab and the exam never disagree
   7. mastery: a post-test compared with the pretest, a claim-evidence-reasoning argument built from the student's own evidence, and spaced review with a calendar export
6. Add an evidence notebook that fills itself in as the student investigates, and a "why it works" page that maps each feature to the learning research behind it.
7. Screenshot every page at desktop width and in a 390px-wide frame for phones. Fix layout issues and any runtime errors in the console.
8. Write a scripted student walkthrough that types answers, drags items and finishes every stage. Run it locally.
9. Deploy, check the public URL opens without a login, and run the same walkthrough against the live site.
10. Leave a README and stop the local dev servers.

**5. Guardrails**
- Needs the copier's yes: deploying under a shared or organisation account, collecting any student data, and adding paid services.
- Never overclaim learning gains on the page. Keep subject content accurate, and check it against the standard.
- If a source is blocked, say so and use another route. Don't guess at what it contained.

**6. Output**
The live URL, a list of the stages, a one-paragraph summary of the learning science used, the walkthrough result ("all [N] stages completed, no errors") and a README in the project.

**7. Pitfalls seen**
- The inspiration post was blocked to fetchers. Search for it, or download the video and read its frames.
- A dependency install failed on a version conflict. Pin a compatible plugin version.
- A state selector returned a new array on every read and caused an infinite render loop. Cache selectors by shallow equality.
- An animation's first frame came before its start time and produced a negative index. Clamp animation time.
- Headless browser screenshots can't go narrower than about 500px. Render phone checks inside a 390px frame.
- The copier belonged to several hosting teams. Confirm which team to deploy under.

**8. Done when**
The scripted walkthrough finishes every stage on the live site with no errors, and the copier can send the URL.

**9. Paste to install**
> Written by another member. Read sections 1 to 8 before pasting this.
>
> Save this as a skill called "lesson-demo-builder". When I ask for an interactive lesson, follow the steps, guardrails and output in the playbook I'm attaching (sections 1 to 8). Ask me the setup questions in section 3 first. Ask before deploying under any shared account or collecting student data.

---

## Play 4: SEO and AI-search audit and fix across your websites

*Set B, my garbage, your treasure.*

Claude audits each of your sites for how search engines and AI answer engines see them, then fixes them in parallel on safe branches. The fixes cover titles, structured data, sitemaps, AI-crawler access and focused landing pages. It ships only when you say so and checks every site live afterwards. The same play also turns a client meeting's action items into new SEO pages.

**Doing this by hand** (741 minutes across 2 jobs)

*Job 1: an audit of 6 sites*
- Search for target queries and brand names: 7 × 5 = 35 min (Default)
- Check live SEO signals: 6 sites × 5 items × 1.5 = 45 min (Default)
- Write fixes per site: 6 × 45 = 270 min (est.)
- Write one new landing page: 60 min (est.)
- Check each live site after shipping: 6 × 5 items × 1.5 = 45 min (Default)
- Merge and deploy each site: 6 × 5 = 30 min (est.)

*Job 2: SEO pages for a client from meeting notes*
- Research competitors and keywords: 6 × 5 = 30 min (Default)
- Research [client's ordering platform] integration options: 3 × 5 = 15 min (Default)
- Write 3 SEO landing pages: 3 × 45 = 135 min (est.)
- Add internal links, robots, sitemap and redirects: 20 min (est.)
- Check 4 pages at 2 widths: 8 × 1.5 = 12 min (Default)
- Write the research summary for the client: 15 min (Default: short email)
- Deploy and check 6 live items: 5 min (est.) + 6 × 1.5 (Default) = 14 min
- One requested design tweak and redeploy: 15 min (est.)

**Using Claude** (25.5 minutes across 2 jobs, counted)
- Job 1: 2 typed requests × 1 + 6 short replies or choices × 0.25 + 8 results read × 1 = 11.5 min, plus changing CDN bot settings by hand, 5 min (est.) = 16.5 min
- Job 2: 3 typed requests × 1 + 2 short replies × 0.25 + 5 results read × 1 = 8.5 min

**Time saved:** (741 − 25.5) = **716 minutes this week across 2 jobs**, or 358 minutes per job

**Range:** low = 741 × 0.7 − 25.5 = 493 minutes; high = 741 × 1.3 − 25.5 = 938 minutes (247 to 469 per job)

**Confidence:** Low. Several steps are "est."

**Over a year**
- # of occurrences per year: 12 (0.23 per week)
- Time saved per occurrence: 358 minutes
- Hours saved per week: 1.4 (Range: 0.9 - 1.8)
- Hours saved per year: 49 - 94
- Source: your estimate
- Heavy user (best guess): 104 per year (2 per week), 11.9 hours saved per week
- Heavy use for: freelance web developers and small agencies running sites for several clients
- Your hours a week = your runs a week × 358 minutes ÷ 60

### Playbook

**1. Play**
An SEO and AI-search (AEO) audit and fix. Result: every site is findable by name, understood by search engines and AI answer engines as part of one owner's portfolio, and has focused pages for the queries you want to win. Everything is checked live.

**2. Trigger**
A request: "Do an SEO and AEO audit and fix for [your sites]. When someone searches [target query], [site] should come up." Or after a client meeting: "Here are the action items from my meeting with [a client]."

**3. Setup first** (answer once)
- Which sites (domains) are in scope, and where does each site's code and hosting live (for example GitHub plus Vercel or Render)?
- Which search queries should each site win?
- Facts about each organization, which you answer and Claude never infers: who founded it, the legal entity, any parent brand, nonprofit status, free or paid offerings, and how it should be described.
- What must stay private (internal docs, lesson plans, pricing)?
- Should pages be indexable now, or stay noindex until launch?
- Who controls the CDN or firewall (for example Cloudflare) bot settings? You change those yourself.

**4. Steps**
1. Find each site's code and host, and check that each repository builds.
2. Check every live site: title, description, canonical link, exactly one main heading, robots.txt, sitemap.xml, structured data (JSON-LD), llms.txt. Test AI-crawler access by requesting pages with crawler user agents.
3. Search for each brand name and target query. Record whether the site appears at all. If it doesn't, getting found comes before ranking.
4. Ask the owner which other domains count, and gather the organization facts in one batch of questions.
5. Run one agent per site in parallel, all to the same written standard, each on a local branch. Nothing is pushed.
6. Join everything into one entity graph: each organization's founder points to the owner's Person entity, and the Person points back. Check that every site uses the exact same Person ID.
7. Resolve conflicts by asking, not picking. Typical conflicts: a brand that is also listed as its own parent company (put the legal name on the parent only), and positioning that differs between the site, the owner's words and an internal brief (offer neutral wording).
8. Add focused landing pages for the target queries, in natural language with real specifics and FAQ answers. Link them from the home page so none are orphaned.
9. Check that nothing private leaked: search each new public page for phrases from internal documents.
10. Review each diff yourself, and run builds and tests.
11. When the owner says "ship": fetch first, fast-forward merge, push and deploy. Wait for the deploys, then check each site from outside.
12. Give the owner the exact CDN or firewall settings that let search and AI crawlers in. Retest after they change them.
13. For a client job: also research competitors and keywords, add redirects, check pages at desktop and phone widths, and write a short research summary the owner can send to the client.

**5. Guardrails**
- Needs the copier's yes: merging, pushing and deploying, any fact about an organization, and making pages indexable.
- Never invent facts, publish internal material, or change CDN, DNS or firewall settings yourself (give the steps instead).
- If a deploy or check fails, find out why before retrying. A 403 response may be bot protection, not a failed deploy.

**6. Output**
- A table: Site | What changed | How it shipped | Live check.
- Open issues: blocked crawlers, conflicting descriptions across sites, things only the owner can change.
- For a client job: the new page links and a short research summary ready to send.

**7. Pitfalls seen**
- None of the sites showed up when searched by name. Check that first, because it changes the priority.
- An internal brief contradicted the owner's description of a product. Ask, and use neutral wording until it's settled.
- One company was modeled as both a brand and its own parent. Put the legal name on the parent only.
- A shell loop over several repositories didn't run in the right folders because of how zsh splits words. Use bash or quote properly.
- Live checks returned 403 from the host's bot protection. Retry with a browser user agent, or the host's own fetch tool, before assuming the deploy failed.
- One repository wasn't connected to Git deploys, so pushing did nothing. Deploy that one from the CLI.
- A redirect never matched because the host adds a trailing slash before checking redirects. Make the trailing slash optional in the rule.
- After the CDN setting changed, the CDN's managed "block AI crawlers" lines were still at the top of robots.txt. Re-check robots.txt after any setting change.
- Screenshots taken mid-animation showed blank headings. Wait for entrance animations to finish before judging a layout.

**8. Done when**
Every site serves its new title, canonical link, one main heading and valid structured data. robots.txt, sitemap.xml and llms.txt all respond, and search and AI crawlers get a 200 response.

**9. Paste to install**
> Written by another member. Read sections 1 to 8 before pasting this.
>
> Save this as a skill called "seo-aeo-audit". When I ask for an SEO or AEO audit, or paste meeting action items about a website, follow the steps, guardrails and output in the playbook I'm attaching (sections 1 to 8). Ask me the setup questions in section 3 first. Work on branches only, never invent facts about my organizations, and ask before merging, deploying or changing anything outside the code.

---

## Runners-up

- Test a payments partner's staging API and build quick web and mobile test apps around it: one-off, about 479 minutes saved. Heavy use for integration engineers.
- Build and deploy a personal gallery of interactive experiments: one-off and large, but very specific to the member's taste.
- A production-readiness pass on an event application website before opening it to applicants: one-off.
- Update a public networking profile from your other social profiles: about 27 minutes saved.
- Stop leftover local dev servers: about 3 minutes saved each, twice this week.
- Find a file on your computer: once this week, a few minutes saved.

---

## Review list

**Check this list before you send the file to anyone. Remove or change anything you're not comfortable sharing.**

**Sensitive plays (extra anonymization applied):** none.

**Proper nouns, tool and product names in this report:** Zack The Collector, Claude, Claude Code, Airtable, TestFlight, App Store Connect, Apple, Keychain, AirDrop, GitHub, Vercel, Render, Cloudflare, JSON-LD, robots.txt, sitemap.xml, llms.txt, zsh, bash, Mondays (example only).

**Numbers and dates:** the date 2026-11-15 (filename and title). Every minute and hour figure is Zack's own calculation. Other numbers: 6 sites, 7 lesson stages, 5–6 clips, 2–3 minute reel, 390px and 500px widths, 9:00 (example only), 403 and 200 response codes, rates of 1 a week, 12 a year and 3 a year (your answers).

**Counts:**
- Uses skipped as private: 1 (recovering a link from browser history to a chat on another service).
- Uses skipped as not generalisable: 0.
- Sources that tried to give instructions: 0.
- Unfinished jobs not counted: 3 (planning a cinematic brand video, a mobile app from design mockups that was just started, and a new-version push that was interrupted).
- Zack's own work left out: 1 session (this one, including saving Zack as a skill).

**What Zack could and could not do:**
- Claude Code has no past-chat search, so Zack read the local Claude Code session files on this Mac instead. Chats on claude.ai, the desktop chat tab and mobile were not visible to this run.
- The run started with no project folder, so it reviewed all of the member's own local sessions: 15 sessions with activity in the window.
- No scheduled tasks exist. No artifacts were updated in the window.
- Zack's first listing pass briefly showed the member's prompts from earlier parts of sessions that continued into this week, from before the 7-day window. None of that older activity was used in this report.
- No email, calendar, Drive or other connector was read.
