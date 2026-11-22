# Zack Run - Rob - 2026-11-13

## Summary

| Play | Set | Minutes saved each time | Current | Heavy user (best guess) | Heavy use for |
|---|---|---|---|---|---|
| Reorganize a shared file library | A: top for you | about 225 | 13 a year, 0.9 hours a week | 104 a year, 7.5 hours a week | A records or IT consultant who cleans up client file libraries |
| Draft an agreement from a form | A: top for you | about 202 | 13 a year, 0.8 hours a week | 156 a year, 10.1 hours a week | In-house counsel or a small-firm lawyer who adapts form agreements |
| Answer a legal question with statutes | B: my garbage, your treasure | about 164 | 7 a year, 0.4 hours a week | 260 a year, 13.7 hours a week | A solo attorney who answers client legal questions |
| Rebuild a pitch deck from a teaser | B: my garbage, your treasure | about 223 | 4 a year, 0.3 hours a week | 104 a year, 7.4 hours a week | A startup advisor or capital-raise consultant |

1. Reorganize a shared file library: about 0.9 hours a week saved over a year (0.7 to 1.2). This week: 468 to 879 minutes saved (about 674).
2. Draft an agreement from a form: about 0.8 hours a week saved over a year (0.6 to 1.1). This week: 141 to 263 minutes saved (about 202).
3. Answer a legal question with statutes: about 0.4 hours a week saved over a year (0.3 to 0.5). This week: 112 to 216 minutes saved (about 164).
4. Rebuild a pitch deck from a teaser: about 0.3 hours a week saved over a year (0.2 to 0.4). This week: 152 to 293 minutes saved (about 223).

Total over a year: about 2.4 hours a week saved (1.7 to 3.2), 88 to 165 hours a year

Total this week: 14.6 to 27.5 hours saved (about 21.1)

---

## 1. Reorganize a shared file library — about 0.9 hours a week saved (0.7 to 1.2)

Claude surveys a SharePoint or OneDrive library, designs a folder structure by owner and by property ID, builds the folders, moves and renames items with a change log, and writes a README. The member starts it with one request that names the library. The member gets a working structure, a README, a change log and a short list of decisions only the member can make.

### This week (3 times)

**Doing this by hand**
- Opening and reviewing each folder in the shared accounting library: 20 folders × 1.5 minutes = 30 minutes
- Designing the new folder plan and the old-to-new map: 1 plan × 60 minutes (est.) = 60 minutes
- Creating the new folders one at a time: 136 folders × 0.5 minutes (est.) = 68 minutes
- Writing the README for the library: 5 pages × 15 minutes = 75 minutes
- Writing the recommendation on separate libraries and metadata columns: 2 pages × 15 minutes = 30 minutes
- Logging the follow-up items in the task sheet: 2 rows × 5 minutes (est.) = 10 minutes
- Surveying a 22,000-file company drive three levels deep: 1 survey × 120 minutes (est.) = 120 minutes
- Moving or renaming a folder, with a check after each: 115 moves × 1 minute = 115 minutes
- Writing a change-log line for each move: 115 lines × 0.5 minutes (est.) = 57.5 minutes
- Writing the list of decisions for the owner: 1 page × 15 minutes = 15 minutes
- Searching OneDrive and SharePoint for skill files: 4 searches × 5 minutes = 20 minutes
- Opening and checking each skill file or folder: 30 items × 1.5 minutes (count est.) = 45 minutes
- Moving skill files into the new folders: 25 moves × 1 minute (count est.) = 25 minutes
- Writing the summary of what was found and moved: 1 page × 15 minutes = 15 minutes
- **Total by hand: about 686 minutes**

**Using Claude**
- Typing requests and instructions: 6 messages × 1 minute = 6 minutes (2 inferred)
- Reading the plans, README and summaries Claude sent: 6 reads × 1 minute = 6 minutes (2 inferred)
- **Total using Claude: about 12 minutes**

Not counted: approving deletes later, and closing a locked file so one rename can finish.

**Time saved**
- 686 minutes by hand − 12 minutes with Claude = **about 674 minutes saved** (about 225 minutes saved each time × 3 times this week)

**Range**
- Low: if the job took 30% less by hand, 480 − 12 = 468 minutes saved
- High: if the job took 30% more by hand, 891 − 12 = 879 minutes saved
- **468 to 879 minutes saved**

**Confidence: Low**, because several step times and counts are estimates, and two messages were inferred from the chat's turn count.

### Over a year

\# of occurrences per year: 13 (0.25 per week)

Time saved per occurrence: 225 minutes

Hours saved per week: 0.9 (Range: 0.7 - 1.2)

Hours saved per year: 34 - 64

Source: counted from your Claude history (3 in the past 12 weeks)

Heavy user (best guess): 104 per year (2 per week), 7.5 hours saved per week

Heavy use for: a records or IT consultant who cleans up client file libraries

Your hours a week = your runs a week × 225 minutes ÷ 60

### Playbook

1. **Play**: Reorganize a shared file library. Result: one clear structure, every move logged, nothing deleted without approval.
2. **Trigger**: A request that names the library or the synced folder path, for example "restructure the drive found here."
3. **Setup first**:
   - Is the Microsoft 365 connector on, with write access to SharePoint?
   - Is the synced library folder added in the desktop app so Claude can survey it?
   - What are your sort keys? (For example: by owner for working files, by period YYYYMM for monthly work, by property ID first for permanent records.)
   - Which outside parties use the library, and what may each one edit or only read?
   - Where do you track follow-up tasks?
4. **Steps**:
   1. Survey the live library, not only the synced copy. The synced copy can be nearly empty. Count files and folders, and map three levels.
   2. Read any notes on how the business works (entities, property IDs, who owns which work).
   3. Propose the structure: top-level folders by owner, a drop folder for inbound files, a restricted folder, and an archive. Show an old-to-new table.
   4. List problems found: credentials or wire instructions in shared folders, duplicates, empty folders, old libraries that copy the live one.
   5. Wait for approval. Then create the folders.
   6. Move and rename with server-side moves, so item IDs, links and sync stay intact. Never delete. Put duplicates and empty folders in an archive folder marked "Pending Delete."
   7. Write a change log (CSV) with old path, new path and time for every move. Save it in the library.
   8. Write a README: purpose, folder owners, filing rules, naming rule, migration map, open items.
   9. Log the follow-up decisions in the task tracker.
5. **Guardrails**: Needs the member's yes before any move and before any delete. Never move a folder that may feed another system (a dashboard knowledge base, a scheduled task path) until the member confirms. Do not move during a month-end close. If a move fails because a file is open, stop on that folder and report it. Do not retry in a loop. Folder creation is rate-limited (about 30 writes at a time), so work in batches.
6. **Output**: The new folders in place; a README (.docx) in the library; a change log (.csv); and a short reply with "Not done" and "Your decisions" lists.
7. **Pitfalls seen**: The synced copy held almost nothing, so the first survey had to switch to SharePoint. One rename failed three times because a file was open. Permissions, libraries and metadata columns cannot be set with the connector; a site owner must do them in the browser.
8. **Done when**: Every top-level folder matches the approved plan, the change log has a line for every move, and the README is in the library.
9. **Paste to install**: "Reorganize the library at [path or site]. Follow the 'Reorganize a shared file library' playbook: survey the live library, propose a structure by owner and [your sort keys], show an old-to-new map and the problems you find, and wait for my approval. Then build it with server-side moves only, log every move to a CSV, write a README, and list the decisions I must make. Never delete anything."

---

## 2. Draft an agreement from a form — about 0.8 hours a week saved (0.6 to 1.1)

Claude reads a form agreement, fills it for a specific person and a specific set of entities, pulls the entity list from the accounting system, and returns a redline against the form plus a clean copy. The member starts it by attaching the form and stating the deal terms. The member gets both Word files and a short list of defects in the form that need a decision.

### This week (1 time)

**Doing this by hand**
- Reading the form agreement section by section and noting what matters: 12 sections × 5 minutes = 60 minutes
- Searching the accounting system for the entity list: 1 search × 5 minutes = 5 minutes
- Filtering the list to the entities in the deal: 1 filter × 3 minutes = 3 minutes
- Looking up the [employee] in the staff directory: 1 search × 5 minutes = 5 minutes
- Searching for the tax rule on profits interests: 1 search × 5 minutes = 5 minutes
- Reading the tax rule and noting what matters: 1 source × 6 minutes = 6 minutes
- Writing the agreement changes across the [entities]: 6 pages × 15 minutes (count est.) = 90 minutes
- Checking the redline and the clean copy: 2 versions × 5 minutes = 10 minutes
- Writing the list of form defects to decide: 1 page × 15 minutes = 15 minutes
- Logging the follow-up item in the task sheet: 1 row × 5 minutes (est.) = 5 minutes
- **Total by hand: 204 minutes**

**Using Claude**
- Typing the request with the deal terms: 1 message × 1 minute = 1 minute
- Reading the redline, clean copy and defect list Claude sent: 1 read × 1 minute = 1 minute
- **Total using Claude: about 2 minutes**

Not counted: finding and attaching the form.

**Time saved**
- 204 minutes by hand − 2 minutes with Claude = **about 202 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 143 − 2 = 141 minutes saved
- High: if the job took 30% more by hand, 265 − 2 = 263 minutes saved
- **141 to 263 minutes saved**

**Confidence: Low**, because the page count of the draft and the logging time are estimates.

### Over a year

\# of occurrences per year: 13 (0.25 per week)

Time saved per occurrence: 202 minutes

Hours saved per week: 0.8 (Range: 0.6 - 1.1)

Hours saved per year: 31 - 57

Source: counted from your Claude history (3 in the past 12 weeks)

Heavy user (best guess): 156 per year (3 per week), 10.1 hours saved per week

Heavy use for: in-house counsel or a small-firm lawyer who adapts form agreements

Your hours a week = your runs a week × 202 minutes ÷ 60

### Playbook

1. **Play**: Draft an agreement from a form. Result: a tracked-changes redline against the form, a clean execution copy, and a list of defects in the form.
2. **Trigger**: The member attaches a form and states who it is for, the terms, and which [entities] it covers or excludes.
3. **Setup first**:
   - Is your accounting system connected, so Claude can pull legal entity names and IDs?
   - Is your staff directory (Microsoft 365) connected, so Claude can confirm the person's legal name?
   - What is your file naming rule?
   - Where do you track follow-up tasks?
   - Is there a house legal format Claude must follow?
4. **Steps**:
   1. Convert the form to text and read every section. Note gaps, broken cross-references and terms that are used but not defined.
   2. Pull the entity list from the accounting system. Apply the member's exclusions. Check entity names against the state registry where possible, or flag them to verify.
   3. Confirm the person's legal name from the directory.
   4. Make the changes as tracked changes against the original form, with a clear author name.
   5. Put all covered entities in one joinder or signature section, if the form allows it.
   6. Check any tax or legal rule the terms depend on. Cite the source.
   7. Accept the changes into a clean copy. Render both to PDF and look at the signature page before sending.
   8. List defects that need the member's decision. Do not fix them silently.
   9. Log one follow-up item with the open decisions.
5. **Guardrails**: Do not invent terms, percentages, dates or entity names. Change only what the request covers; flag everything else. Never sign, date or send the agreement. If the accounting system or directory is not reachable, use bracketed placeholders and say so.
6. **Output**: Two Word files (redline and clean), named by the house rule, and a short reply with the defect list.
7. **Pitfalls seen**: The form had an incomplete sentence, a cross-reference to the wrong sections, and a clause that could turn a profits interest into a capital interest for tax. These must go to the member as decisions, not as quiet edits. The signature header needed a rebuild to fit on one page.
8. **Done when**: The redline opens with tracked changes, the clean copy has no changes left, every covered entity appears, and the defect list is in the reply.
9. **Paste to install**: "Use the attached form to draft an agreement for [person] covering [entities], excluding [entities], on these terms: [terms]. Follow the 'Draft an agreement from a form' playbook: pull entity names from [accounting system], make tracked changes against the form, give me a redline and a clean copy, and list every defect in the form that needs my decision. Do not invent terms."

---

## 3. Answer a legal question with statutes — about 0.4 hours a week saved (0.3 to 0.5)

Claude answers a legal question by searching and reading the governing statutes, then gives a bottom-line answer with section cites and the follow-up points that change the result. The member starts it by typing the question. The member gets a short written answer, cites, and flags on what to verify with counsel.

### This week (1 time)

**Doing this by hand**
- Searching for the governing statutes: 3 searches × 5 minutes = 15 minutes
- Reading each statute and noting what matters: 3 sources × 6 minutes = 18 minutes
- Searching for the follow-up questions: 6 searches × 5 minutes (count est.) = 30 minutes
- Reading sources for the follow-up questions: 6 sources × 6 minutes (count est.) = 36 minutes
- Writing an answer to each question: 5 answers × 15 minutes = 75 minutes
- **Total by hand: 174 minutes**

**Using Claude**
- Typing each question: 5 messages × 1 minute = 5 minutes (4 inferred)
- Reading each answer Claude sent: 5 reads × 1 minute = 5 minutes (4 inferred)
- **Total using Claude: about 10 minutes**

**Time saved**
- 174 minutes by hand − 10 minutes with Claude = **about 164 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 122 − 10 = 112 minutes saved
- High: if the job took 30% more by hand, 226 − 10 = 216 minutes saved
- **112 to 216 minutes saved**

**Confidence: Low**, because four of the five questions were inferred from the chat's turn count and the follow-up research counts are estimates.

### Over a year

\# of occurrences per year: 7 (0.13 per week)

Time saved per occurrence: 164 minutes

Hours saved per week: 0.4 (Range: 0.3 - 0.5)

Hours saved per year: 13 - 25

Source: counted from your Claude history over the past 12 months (a floor; chats in projects are not counted)

Heavy user (best guess): 260 per year (5 per week), 13.7 hours saved per week

Heavy use for: a solo attorney who answers client legal questions

Your hours a week = your runs a week × 164 minutes ÷ 60

### Playbook

1. **Play**: Answer a legal question with statutes. Result: a bottom-line answer, statute and case cites, and the points to verify.
2. **Trigger**: The member types a legal question, often a "what happens if" about [entity type], [creditor remedy] or [event].
3. **Setup first**:
   - Which state's law applies by default?
   - Is a legal research connector available (a case-law or statute tool), or should Claude use web search only?
   - Is the member a lawyer? (This sets how technical the answer can be.)
   - Should answers end with a "not legal advice, verify with counsel" line?
4. **Steps**:
   1. Restate the question as the exact legal issue and the state. If the facts point to a different state than the question names, say so.
   2. Search the governing statutes. Fetch the statute text from an official source.
   3. Lead with the answer in one sentence, then the reasons, each with a section cite.
   4. Name the facts that would change the answer.
   5. Mark anything not checked against a primary source with "verify this."
   6. For each follow-up question, repeat steps 2 to 5.
5. **Guardrails**: Never invent a cite. Do not state a case holding without a source. Do not give a filing deadline from memory. Keep personal facts out of any shared notes; write the question in general terms.
6. **Output**: A short answer in the chat: bottom line, numbered reasons with cites, "what changes the answer," and "verify" flags.
7. **Pitfalls seen**: The question named one state, but the research ran on another state's statutes. Confirm the governing state first.
8. **Done when**: Every claim has a cite or a "verify this" flag, and the member has a clear yes or no.
9. **Paste to install**: "Answer this legal question under [state] law: [question]. Follow the 'Answer a legal question with statutes' playbook: confirm the governing state, read the statute text, lead with the bottom line, cite every section, name the facts that would change the answer, and mark anything you did not check against a primary source."

---

## 4. Rebuild a pitch deck from a teaser — about 0.3 hours a week saved (0.2 to 0.4)

Claude rebuilds a rough teaser PDF into an investor-ready PowerPoint, using only the facts in the source, and lists the claims an investor will challenge. The member starts it by attaching the teaser and asking for a stronger deck with no new facts. The member gets a .pptx and a PDF render, plus a list of weak points.

### This week (1 time)

**Doing this by hand**
- Opening and reviewing each slide of the source teaser: 9 slides × 1.5 minutes = 13.5 minutes
- Cropping the logo, product image and photo out of the slides: 3 images × 5 minutes (est.) = 15 minutes
- Searching to check a market claim: 1 search × 5 minutes = 5 minutes
- Reading the source for that claim: 1 source × 6 minutes = 6 minutes
- Building each content slide: 10 slides × 15 minutes = 150 minutes
- Reviewing each revision round and noting the changes: 6 rounds × 5 minutes = 30 minutes
- Writing the list of weak points investors will push on: 1 page × 15 minutes = 15 minutes
- **Total by hand: about 235 minutes**

**Using Claude**
- Typing requests and changes: 6 messages × 1 minute = 6 minutes (2 inferred)
- Reading the deck and notes Claude sent: 6 reads × 1 minute = 6 minutes (2 inferred)
- **Total using Claude: about 12 minutes**

Not counted: drawing the product diagram the member supplied.

**Time saved**
- 235 minutes by hand − 12 minutes with Claude = **about 223 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 164 − 12 = 152 minutes saved
- High: if the job took 30% more by hand, 305 − 12 = 293 minutes saved
- **152 to 293 minutes saved**

**Confidence: Low**, because the image steps are estimates and two messages were inferred from the chat's turn count.

### Over a year

\# of occurrences per year: 4 (0.08 per week)

Time saved per occurrence: 223 minutes

Hours saved per week: 0.3 (Range: 0.2 - 0.4)

Hours saved per year: 10 - 20

Source: counted from your Claude history over the past 12 months

Heavy user (best guess): 104 per year (2 per week), 7.4 hours saved per week

Heavy use for: a startup advisor or capital-raise consultant

Your hours a week = your runs a week × 223 minutes ÷ 60

### Playbook

1. **Play**: Rebuild a pitch deck from a teaser. Result: a clean investor deck in a set order, with only source facts, and a list of claims to fix before sending.
2. **Trigger**: The member attaches a teaser (PDF or PPTX) and asks to make it stronger without adding facts.
3. **Setup first**:
   - Who is the audience (seed investors, lenders, partners)?
   - Is there a brand palette or template to use?
   - Should Claude flag claims it cannot support, or change them?
   - What is your file naming rule?
4. **Steps**:
   1. Extract text and images from the source. Crop logos and photos from the slide images.
   2. Put the slides in investor order: problem, insight, how it works, market, unit economics, IP or regulatory, ask, team.
   3. Build each slide with real content. Every box and diagram must have content; no empty space.
   4. Check each statistic against a source. Where wording overstates the source, correct it and say why.
   5. Label targets as "est." when nothing proves them yet.
   6. Put "what to verify" in the speaker notes of each slide.
   7. Render to PDF and look at every slide for overflow, overlap and empty space. Fix, then render again.
   8. Write the weak-points list: math that does not tie, missing slides (use of funds, terms, competition, team), and unproven credentials.
5. **Guardrails**: Add no new numbers, names or claims. Derived numbers (a difference of two source numbers) go in the speaker notes with the math. Rendering in LibreOffice can move line breaks; tell the member to check in PowerPoint before sending.
6. **Output**: A .pptx and a matching PDF, and a short reply with "What I changed," "Claims I changed and why," and "Weak points."
7. **Pitfalls seen**: The first build left empty space in cards and diagrams; the member asked for every box to have content. Founder and contact text sat high in its cards; center it. A cost-over-time figure did not match the annual price times years.
8. **Done when**: Every slide renders clean, every fact traces to the source, and the weak-points list is in the reply.
9. **Paste to install**: "Rebuild the attached teaser into an investor deck. Follow the 'Rebuild a pitch deck from a teaser' playbook: investor slide order, only facts from the source, no empty boxes, check every statistic, put what to verify in the speaker notes, render to PDF and check every slide, and give me the weak points an investor will push on."

---

## Runners-up

- **Build-vs-buy check on a software vendor**: about 55 minutes saved each time. Current: 0.3 hours a week. Heavy user (best guess): 4.6 hours a week. Heavy use for: a COO who screens software vendors.
- **Property performance pull from the PMS**: about 63 minutes saved each time. Current: 0.4 hours a week. Heavy user (best guess): 5.3 hours a week. Heavy use for: an asset manager who tracks a hotel portfolio daily.
- **Clean a signature page for re-signing**: about 44 minutes saved each time. Current: 0.1 hours a week. Heavy user (best guess): 7.3 hours a week. Heavy use for: a closing paralegal or title agent.
- **Repair diagnosis from a photo**: about 33 minutes saved each time. Current: 0.2 hours a week. Heavy user (best guess): 5.5 hours a week. Heavy use for: a maintenance supervisor across a rental portfolio.
- **Brand graphic in house style**: about 63 minutes saved each time. Current: 0.06 hours a week. Heavy user (best guess): 3.2 hours a week. Heavy use for: a marketing coordinator for a hospitality brand.

Written by Zack The Collector (for Claude) version 1.8
