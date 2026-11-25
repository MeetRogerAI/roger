# Zack Run - Peter - 2026-11-12

## Summary

| Play | Set | Minutes saved each time | Current | Heavy user (best guess) | Heavy use for |
|---|---|---|---|---|---|
| Personalized explainer video for one viewer | A: top for you | 342 | 13 a year, 1.4 hours a week | 52 a year, 5.7 hours a week | A business that pitches named prospects every week |
| Strategy deep dive ending in a three-option deck | A: top for you | 557 | 2 a year, 0.4 hours a week | 12 a year, 2.1 hours a week | A consultant, or an owner weighing a big decision every month |
| Website build spec written against the code | B: my garbage, your treasure | 185 | 3 a year, 0.2 hours a week | 24 a year, 1.4 hours a week | A business that changes its site or product twice a month |
| LinkedIn profile rewrite by interview | B: my garbage, your treasure | 68 | 3 a year, 0.06 hours a week | 12 a year, 0.3 hours a week | An agency or recruiter rewriting profiles for clients |

1. Personalized explainer video for one viewer: about 1.4 hours a week saved over a year (1.0 to 1.9). This week: 228 to 455 minutes saved (about 342).
2. Strategy deep dive ending in a three-option deck: about 0.4 hours a week saved over a year (0.2 to 0.5). This week: 385 to 729 minutes saved (about 557).
3. Website build spec written against the code: about 0.2 hours a week saved over a year (0.04 to 0.5). This week: 127 to 244 minutes saved (about 185).
4. LinkedIn profile rewrite by interview: about 0.06 hours a week saved over a year (0.01 to 0.2). This week: 38 to 97 minutes saved (about 68).

Total over a year: about 2.0 hours a week saved (1.2 to 3.0), 65 to 157 hours a year

Total this week: 13.0 to 25.4 hours saved (about 19.2)

---

## 1. Personalized explainer video for one viewer
**about 1.4 hours a week saved (1.0 to 1.9)**

The member hands Claude a rough script and a folder of notes and asks for a short explainer video made for one decision-maker at a prospect company. Claude rewrites the script for that viewer, builds and renders the animation, adds music and revises it on short instructions. The member gets an .mp4 of about 90 seconds in their folder.

Category: Marketing. Volume: 1 (one video, eight versions).

**Doing this by hand**
- Converting the script to a clean document: 1 script × 5 minutes = 5 minutes (est.)
- Searching the web for the company's people and brand: 3 searches × 5 minutes = 15 minutes (Default)
- Opening one web page to find a photo or logo: 9 pages × 1.5 minutes = 13.5 minutes (Default)
- Rewriting the script for a single viewer: 1 script × 30 minutes = 30 minutes (est.)
- Building one animated scene in a video editor: 8 scenes × 30 minutes = 240 minutes (est.)
- Making one round of changes and exporting again: 7 rounds × 10 minutes = 70 minutes (est.)
- Adding the music track: 1 track × 5 minutes = 5 minutes (est.)
- **Total by hand: 378.5 minutes**

**Using Claude**
- Typing requests and corrections: 29 messages × 1 minute = 29 minutes (9 read, 20 inferred)
- Watching each version Claude sent: 8 versions × 1 minute = 8 minutes
- **Total using Claude: about 37 minutes**

**Time saved**
- 378.5 minutes by hand − 37 minutes with Claude = **about 342 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 264.95 − 37 = 228 minutes saved
- High: if the job took 30% more by hand, 492.05 − 37 = 455 minutes saved
- **228 to 455 minutes saved**

**Confidence: Low**, because five of the seven by-hand steps are estimates and 20 of the member's messages were inferred.

**Not counted:** the member saving headshots and a logo by hand. Claude put that at about 15 minutes.

**Also worth:** None.

**Over a year**

\# of occurrences per year: 13 (0.25 per week)

Time saved per occurrence: 342 minutes

Hours saved per week: 1.4 (Range: 1.0 - 1.9)

Hours saved per year: 49 - 99

Source: counted from your Claude history, 2 in 8 weeks

Heavy user (best guess): 52 per year (1 per week), 5.7 hours saved per week

Heavy use for: a business that pitches named prospects every week

Your hours a week = your runs a week × 342 minutes ÷ 60

### Playbook

1. **Play**: One-viewer explainer video. A 90-second captioned video that speaks to one named decision-maker and ends with one ask.
2. **Trigger**: a request. "I want to create an explainer video from [script file]."
3. **Setup first**:
   - Which folder holds the script, your notes and any screenshots? Attach it, and check the script is in it.
   - Has the company agreed in writing to be featured?
   - Who is the single viewer, and what do you want them to say yes to?
   - Do you have the logo, brand colours and headshots? Save them in an `assets` subfolder with one file per person, named for the person.
   - Do you have a music track?
   - Is a video-making skill turned on?
4. **Steps**:
   1. Read the script and notes. Save the script as a Markdown file with the wording unchanged.
   2. Ask one question at a time, starting with who will see the video and whether the company has agreed.
   3. Rewrite the script for the one viewer: address them by first name, name their company, replace any generic call to action with the specific ask.
   4. List open items to confirm on screen (titles, schedules, whether a pilot has started).
   5. Match photos to people by filename. Show initials in a circle for anyone without a photo.
   6. Use captions, not a voiceover.
   7. Show test frames before the first full render.
   8. Render, add the music, save the file to the folder with a version number.
   9. Collect on-screen wording corrections in batches and render once per batch.
5. **Guardrails**: Claude does not download photos of real people; the member or the company supplies them. Nothing is sent to the viewer by Claude. If a website blocks a logo fetch, Claude asks the member for the file.
6. **Output**: an .mp4 of about 90 seconds in the member's folder, named with its version, plus the final script as a Markdown file.
7. **Pitfalls seen**:
   - The script was not in the folder at the start. Fix: setup question 1.
   - The audience was assumed to be many prospects, then turned out to be one person. Fix: step 2.
   - Three of eight versions were capitalisation and wording fixes to one line. Fix: step 9.
   - The company's website blocked automated fetches. Fix: ask for a brand kit in one email.
8. **Done when**: the latest version plays through with correct names, the ask on the final scene and music, and the open items are confirmed.
9. **Paste to install**: "Make a one-viewer explainer video from [script file] in the attached folder. The viewer is [first name, role] at [company], and the ask is [ask]. Photos and logo are in `assets`. Follow these steps: [paste section 4]."

---

## 2. Strategy deep dive ending in a three-option deck
**about 0.4 hours a week saved (0.2 to 0.5)**

The member gives Claude one long brief, a folder of notes and a spreadsheet link, and asks for a deck that compares three business options. Claude asks scoping questions, researches competitors on the web, profiles the spreadsheet and delivers a 23-slide deck with sources in the speaker notes. The member gets analysis and makes the decision.

Category: Research. Volume: 1.

**Doing this by hand**
- Searching the web for one competitor or market fact: 18 searches × 5 minutes = 90 minutes (Default)
- Reading one source and noting its figures: 21 sources × 6 minutes = 126 minutes (Default)
- Running one count or filter on the spreadsheet: 13 queries × 3 minutes = 39 minutes (Default)
- Opening the files in the notes folder: 5 files × 1.5 minutes = 7.5 minutes (Default)
- Building one comparison table: 7 tables × 10 minutes = 70 minutes (Default)
- Writing one content slide with speaker notes: 16 slides × 15 minutes = 240 minutes (Default)
- **Total by hand: 572.5 minutes**

**Using Claude**
- Typing the brief and follow-up instructions: 7 messages × 1 minute = 7 minutes (1 read, 6 inferred)
- Answering Claude's multiple-choice scoping questions: 7 answers × 0.25 minutes = 1.75 minutes
- Reading the summaries Claude sent back: 7 replies × 1 minute = 7 minutes (1 read, 6 inferred)
- **Total using Claude: about 16 minutes**

**Time saved**
- 572.5 minutes by hand − 15.75 minutes with Claude = **about 557 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 400.75 − 15.75 = 385 minutes saved
- High: if the job took 30% more by hand, 744.25 − 15.75 = 728.5 minutes saved
- **385 to 729 minutes saved**

**Confidence: Low**, because six of the member's seven messages were inferred from the turn count.

**Not counted:** reading the 23 slides themselves. Later searches and spreadsheet queries in turns this run did not read.

**Also worth:** the deck's chosen option became the basis for play 3.

**Over a year**

\# of occurrences per year: 2 (0.04 per week)

Time saved per occurrence: 557 minutes

Hours saved per week: 0.4 (Range: 0.2 - 0.5)

Hours saved per year: 13 - 24

Source: counted from your Claude history, 2 in 12 months

Heavy user (best guess): 12 per year (0.23 per week), 2.1 hours saved per week

Heavy use for: a consultant, or an owner weighing a big decision every month

Your hours a week = your runs a week × 557 minutes ÷ 60

### Playbook

1. **Play**: Three-option strategy deck. One brief in, one sourced deck out, with the decision left to you.
2. **Trigger**: a request. "I want a deep strategy dive on choosing a business to build around [core idea]."
3. **Setup first**:
   - Which folder holds your notes, specs and scripts for the idea? Attach it through the Claude desktop app.
   - Is there a spreadsheet of examples or leads? Does its link open for someone who is not signed in, and which tab holds the data?
   - Which customer groups do you already have in mind, with sizes?
   - How do you define success: fastest revenue, largest outcome, or best odds of surviving?
4. **Steps**:
   1. Read every file in the folder.
   2. Open the spreadsheet, list its tabs and confirm the row count with the member before analysing it.
   3. Ask scoping questions as multiple choice, one at a time: evidence so far, platform, resources, definition of success, starting audience, who controls sharing.
   4. Search the web for direct competitors and for how the problem was solved before AI.
   5. Map every customer group against the same conditions in one table.
   6. Collapse the groups into three options by who pays.
   7. For each option write what it is, then strengths and weaknesses.
   8. Score the options on each success yardstick and say the scores are judgment.
   9. Close with tests, sized in half-days, that would prove each option.
   10. Build the deck and put sources and arithmetic in the speaker notes.
   11. Open the finished deck and check each slide for overflowing text.
5. **Guardrails**: Claude gives a read on the options and does not pick one. Any figure it cannot verify is labelled unverified. Prices it assumes are labelled assumptions.
6. **Output**: a slide deck of about 23 slides, plus a short chat summary with a scorecard table (option, who pays, one score per yardstick) and a list of things to know before deciding.
7. **Pitfalls seen**:
   - The spreadsheet link opened a small tab, not the full data, and the row count did not match the brief. Fix: step 2.
   - Claude did not render the slides to check layout. Fix: step 11.
   - The member challenged one number after delivery. Fix: read the speaker notes before relying on a slide.
8. **Done when**: you can name the three options, the payer for each, and the cheapest test that would change your mind.
9. **Paste to install**: "Run a three-option strategy deck on [core idea] using the attached folder and this spreadsheet [link]. Follow these steps: [paste section 4]. Ask me the scoping questions as multiple choice. Give me analysis, not a decision."

---

## 3. Website build spec written against the code
**about 0.2 hours a week saved (0.04 to 0.5)**

The member points Claude at a strategy document and the website's code folder and asks for a build spec to hand to a designer or a coding agent. Claude reads the code, asks questions, and writes one Markdown spec with decisions, a design brief, three shippable versions, page copy and risks. The member gets a file saved in their folder.

Category: Builds. Volume: 1.

**Doing this by hand**
- Reading the site's code to learn its pages, forms and tables: 1 codebase × 30 minutes = 30 minutes (est.)
- Writing one section of the spec: 11 sections × 15 minutes = 165 minutes (Default)
- **Total by hand: 195 minutes**

**Using Claude**
- Typing the request and follow-up instructions: 5 messages × 1 minute = 5 minutes (1 read, 4 inferred)
- Reading the replies Claude sent: 5 replies × 1 minute = 5 minutes (1 read, 4 inferred)
- **Total using Claude: about 10 minutes**

**Time saved**
- 195 minutes by hand − 10 minutes with Claude = **about 185 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 136.5 − 10 = 126.5 minutes saved
- High: if the job took 30% more by hand, 253.5 − 10 = 243.5 minutes saved
- **127 to 244 minutes saved**

**Confidence: Low**, because one by-hand step is an estimate and four of the member's five messages were inferred.

**Not counted:** the member's answers to Claude's questions. The run did not read those turns, so the member's time is understated.

**Also worth:** the spec flagged a promised feature that had not been built anywhere, before any page copy described it.

**Over a year**

\# of occurrences per year: 3 (0.06 per week)

Time saved per occurrence: 185 minutes

Hours saved per week: 0.2 (Range: 0.04 - 0.5)

Hours saved per year: 2 - 24

Source: estimated, default rate for a one-off

Heavy user (best guess): 24 per year (0.46 per week), 1.4 hours saved per week

Heavy use for: a business that changes its site or product twice a month

Your hours a week = your runs a week × 185 minutes ÷ 60

### Playbook

1. **Play**: Build spec from strategy and code. One Markdown file a builder can work from without asking you anything.
2. **Trigger**: a request. "I want a design document that updates [site] to focus on [strategy]."
3. **Setup first**:
   - Which folder holds the site's code? Attach it.
   - Which document holds the strategy, and which option in it is the chosen one?
   - Who will build from the spec: a designer, a coding agent, or both?
   - What is the price, the main call to action and the first cohort or launch size?
   - What has actually happened so far that the site is allowed to claim?
4. **Steps**:
   1. Read the code before asking anything: pages, existing form pattern, database tables, settings.
   2. Ask the member questions until the decisions table is complete.
   3. Write the product in one paragraph.
   4. Write a table of decisions already made.
   5. Write a table of what the site may and may not claim, based on what has really happened.
   6. Write the design brief.
   7. Split the build into three versions, each shippable alone, each sized in half-days, each with acceptance checks and real file names.
   8. Hide old pages behind one reversible switch. Do not delete them.
   9. Write draft copy for every section of the homepage, with headline options.
   10. List what the member must supply and the risks.
   11. Save the spec to the documents folder. Leave the code untouched.
5. **Guardrails**: Claude does not change the code. Copy never claims something that has not happened. Anything the spec assumes is listed as an assumption or an open question.
6. **Output**: one Markdown file with 11 sections, plus a chat summary holding a table (version, what it delivers, effort in half-days), a list of where the spec pushes back, and questions for the member.
7. **Pitfalls seen**:
   - The strategy promised a feature that nothing yet delivers. Fix: step 5, and say whether to build it or change the copy.
   - An entry rule quietly limited who could apply at launch. Fix: check each qualification rule against what exists today.
   - Currency was not stated. Fix: setup question 4.
8. **Done when**: a builder can start version 1 from the file alone, and every open question in it has an owner.
9. **Paste to install**: "Write a build spec for [site] based on [strategy document], option [name]. The code is in the attached folder; read it first and do not change it. Follow these steps: [paste section 4]. Ask me questions until the decisions table is complete."

---

## 4. LinkedIn profile rewrite by interview
**about 0.06 hours a week saved (0.01 to 0.2)**

The member asks Claude to update their LinkedIn profile and to ask questions one at a time. Claude reads the live profile in the member's browser, interviews them about the one offer and the one buyer the profile should serve, and rewrites the headline, About and Experience entries. With the member's approval it publishes a launch post and features it.

Category: Marketing. Volume: 1.

**Doing this by hand**
- Reading the current profile pages: 2 pages × 1.5 minutes = 3 minutes (Default)
- Writing a new headline: 1 headline × 5 minutes = 5 minutes (est.)
- Writing the About section: 1 section × 15 minutes = 15 minutes (Default)
- Rewriting one Experience entry: 4 entries × 8 minutes = 32 minutes (est.)
- Writing the Services description: 1 description × 5 minutes = 5 minutes (est.)
- Writing a launch post: 1 post × 15 minutes = 15 minutes (Default)
- Publishing the post and adding it to Featured: 2 actions × 1 minute = 2 minutes (est.)
- Pasting the new About into the live profile: 1 update × 2 minutes = 2 minutes (est.)
- Building the plan table and the settings checklist: 2 tables × 10 minutes = 20 minutes (Default)
- **Total by hand: 99 minutes**

**Using Claude**
- Typing answers to Claude's interview questions: 29 messages × 1 minute = 29 minutes (16 read, 13 inferred)
- Giving a short confirmation: 2 replies × 0.25 minutes = 0.5 minutes
- Reading the rewrite document and the post draft: 2 drafts × 1 minute = 2 minutes
- **Total using Claude: about 32 minutes**

**Time saved**
- 99 minutes by hand − 31.5 minutes with Claude = **about 68 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 69.3 − 31.5 = 37.8 minutes saved
- High: if the job took 30% more by hand, 128.7 − 31.5 = 97.2 minutes saved
- **38 to 97 minutes saved**

**Confidence: Low**, because five by-hand steps are estimates and 13 of the member's messages were inferred.

**Not counted:** a banner the member asked for. The run did not see whether it was finished.

**Also worth:** Claude caught a time-saved claim that was a usage target, before it went on a public profile.

**Over a year**

\# of occurrences per year: 3 (0.06 per week)

Time saved per occurrence: 68 minutes

Hours saved per week: 0.06 (Range: 0.01 - 0.2)

Hours saved per year: 1 - 10

Source: estimated, default rate for a one-off

Heavy user (best guess): 12 per year (0.23 per week), 0.3 hours saved per week

Heavy use for: an agency or recruiter rewriting profiles for clients

Your hours a week = your runs a week × 68 minutes ÷ 60

### Playbook

1. **Play**: Profile rewrite by interview. A LinkedIn profile rebuilt around one offer and one buyer, with every claim checked.
2. **Trigger**: a request. "I want to update my LinkedIn. Ask me questions one by one."
3. **Setup first**:
   - Is Claude in Chrome installed, and are you signed in to LinkedIn in that browser?
   - What is the one thing you want a visitor to do, and who is that visitor?
   - Which clients or employers may be named publicly, and which may not?
   - Do you have a script or pitch Claude can pull phrases from?
   - What are the titles and dates of each role, including any that has ended?
4. **Steps**:
   1. Ask what the profile has to do and for whom, before reading anything.
   2. Narrow the audience until it names one kind of buyer.
   3. Read the live profile in the browser. If the Experience section does not load, ask the member to paste it.
   4. Ask for results, then ask how each number was measured. Rewrite any target as a goal, not a result.
   5. Ask which names may appear publicly, and describe the rest by role.
   6. Close any role that has ended and put the current one first.
   7. Put the member's strongest credential for this buyer in the first two lines of the About.
   8. Write the headline, About, Experience entries and Services line in one document, with a plan sized in half-days.
   9. Draft a launch post and show the wording before publishing.
   10. After each change on the live profile, update the document to match.
5. **Guardrails**: Claude publishes nothing without the member's yes on the exact wording. It names no client without permission. It does not present a target or an estimate as a measured result.
6. **Output**: a rewrite document (headline, About, each Experience entry, Services line, settings checklist, phased plan), the same content as a Markdown file, and one approved post on the profile.
7. **Pitfalls seen**:
   - The first audience given was too broad to write to. Fix: step 2.
   - A time-saved figure turned out to be a daily target. Fix: step 4.
   - The Experience section did not load through the browser. Fix: step 3.
   - LinkedIn could not preview the member's website, so it could not be saved as a Featured link. Fix: check the site's bot protection, then test the link in LinkedIn's Post Inspector.
   - The website's homepage did not speak to the buyer the new profile targets. Fix: point the profile at a page written for that buyer.
   - The document fell behind the live profile. Fix: step 10.
8. **Done when**: a visitor from the target audience can tell in the first two lines what you offer and what to do next, and the document matches the live profile.
9. **Paste to install**: "Rewrite my LinkedIn profile at [URL] around [offer] for [buyer]. Ask me questions one at a time. Follow these steps: [paste section 4]. Show me any post before you publish it."

---

## Runners-up

None. Only four uses qualified this week.

Written by Zack The Collector (for Claude) version 0.6
