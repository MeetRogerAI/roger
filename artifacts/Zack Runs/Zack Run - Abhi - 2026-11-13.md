# Zack Run - Abhi - 2026-11-13

## Summary

| Play | Set | Minutes saved each time | Current | Heavy user (best guess) | Heavy use for |
|---|---|---|---|---|---|
| Twice-daily store performance report | A: top for you | About 217 (one day: morning report plus afternoon pulse) | 365 a year, 25.3 hours a week | 365 a year, 25.3 hours a week | An online store owner who spends on ads every day |
| Meeting prep from notes, chat and email | A: top for you | About 58 | 169 a year, 3.1 hours a week | 780 a year, 14.5 hours a week | A founder or chief of staff with daily status meetings |
| Find a past file, draft the reply | B: my garbage, your treasure | About 104 | 48 a year, 1.6 hours a week | 520 a year, 17.3 hours a week | An executive assistant or account manager who fields "did we ever send that?" requests |
| Full website review before a planning call | B: my garbage, your treasure | About 1,036 | 3 a year (estimated), 1.0 hours a week | 52 a year, 17.3 hours a week | A web or search agency that audits a client site every week |

1. Twice-daily store performance report: about 25.3 hours a week saved over a year (2.5 to 32.9). This week: 571 to 1,066 minutes saved (about 818).
2. Meeting prep from notes, chat and email: about 3.1 hours a week saved over a year (2.2 to 4.1). This week: 83 to 155 minutes saved (about 119).
3. Find a past file, draft the reply: about 1.6 hours a week saved over a year (1.1 to 2.1). This week: 144 to 272 minutes saved (about 208).
4. Full website review before a planning call: about 1.0 hours a week saved over a year (0.2 to 2.6). This week: 722 to 1,349 minutes saved (about 1,036).

Total over a year: about 31.0 hours a week saved (6.0 to 41.7), 313 to 2,168 hours a year

Total this week: 25.3 to 47.4 hours saved (about 36.3)

---

## 1. Twice-daily store performance report: about 25.3 hours a week saved (2.5 to 32.9)

Every morning Claude reads yesterday's numbers for an online store (visitors, orders, where orders came from, ad spend, conversion, email, support tickets) and sends one summary message with the actions that matter. Every afternoon it sends a short pulse on today so far, with alerts only when a threshold is crossed. Both run on a schedule with nobody at the keyboard, and each closed day is added to a running ledger so trends are real and not one day's wiggle.

### This week

Four morning reports (November 10 to 13) and three afternoon pulses (November 10 to 12) finished. A duplicate morning run on the first day is not counted. Step counts are the median of the finished runs. All step minutes are the guide's defaults.

**Doing this by hand**

Morning report, each time:
- Running store analytics queries (visitors, orders, sources, conversion, devices, landing pages): 15 queries × 3 minutes = 45 minutes
- Pulling ad spend from the ad platform, by day and by ad: 2 pulls × 3 minutes = 6 minutes
- Adding yesterday's numbers to the running ledger (orders by source, the day's funnel, referrers): 3 updates × 3 minutes = 9 minutes
- Checking the 10-day trend, the alert thresholds and the referrer watch list: 3 checks × 3 minutes = 9 minutes
- Opening the newsletter platform for list growth, send stats and the latest posts: 4 items × 1.5 minutes = 6 minutes
- Searching the support inbox for new tickets and their themes: 1 search × 5 minutes = 5 minutes
- Opening the last two reports and the standing action list: 3 items × 1.5 minutes = 4.5 minutes
- Building the report tables (scoreboard, order sources, paid, site and conversion, and so on): 7 tables × 10 minutes = 70 minutes
- Writing the summary message: 1 message × 15 minutes = 15 minutes
- Morning total: about 170 minutes

Afternoon pulse, each time:
- Running store analytics queries for today so far: 5 queries × 3 minutes = 15 minutes
- Pulling today's ad spend: 1 pull × 3 minutes = 3 minutes
- Comparing today's referrers with the ledger: 1 check × 3 minutes = 3 minutes
- Opening the newsletter platform for list growth: 1 item × 1.5 minutes = 1.5 minutes
- Opening the morning report to see what moved: 1 item × 1.5 minutes = 1.5 minutes
- Building the "today so far" table: 1 table × 10 minutes = 10 minutes
- Writing the pulse message: 1 message × 15 minutes = 15 minutes
- Afternoon total: 49 minutes

- **Total by hand: 4 mornings × 169.5 minutes + 3 afternoons × 49 minutes = 825 minutes**

**Using Claude**
- Reading the morning report Claude sent: 4 reports × 1 minute = 4 minutes
- Reading the afternoon pulse Claude sent: 3 pulses × 1 minute = 3 minutes
- Typed requests: none, the runs are scheduled
- **Total using Claude: about 7 minutes**

**Time saved**
- 825 minutes by hand − 7 minutes with Claude = **about 818 minutes saved** (7 runs this week)

**Range**
- Low: if the job took 30% less by hand, 577.5 − 7 = about 571 minutes saved
- High: if the job took 30% more by hand, 1,072.5 − 7 = about 1,066 minutes saved
- **571 to 1,066 minutes saved**

**Confidence: Medium**, because the minutes for each step are defaults and the step counts were read from 7 real runs. The yearly figure is softer: the routine started on November 10, so its rate is the schedule, not a track record. Nobody would build this report by hand twice a day, which is what the low end of the range shows (once a week by hand).

Also worth: problems get caught the same day (an ad spending against a ship date the store cannot meet, a referrer that suddenly appears), and every closed day sits in one ledger.

Not counted: the five pages of written analysis in each saved morning note. Only the tables and the summary message are counted, to keep the by-hand job realistic.

**Over a year**

\# of occurrences per year: 365 (7 per week)

Time saved per occurrence: 217 minutes

Hours saved per week: 25.3 (Range: 2.5 - 32.9)

Hours saved per year: 131 - 1,711

Source: its schedule (7:00 AM and 5:00 PM daily), 7 finished runs counted from your Claude history

Heavy user (best guess): 365 per year (7 per week), 25.3 hours saved per week

Heavy use for: an online store owner who spends on ads every day

Your hours a week = your runs a week × 217 minutes ÷ 60

### Playbook

1. **Play**: Twice-daily store performance report. A morning message with yesterday's full read and a short afternoon pulse on today, each ending in the few actions worth taking.
2. **Trigger**: A schedule. Every day at 7:00 AM Eastern (full report on yesterday, a closed day) and 5:00 PM Eastern (pulse on today so far). Can also be run on demand.
3. **Setup first**:
   - Which store and which ad account should Claude read? Connect the store's analytics, the ad platform, the newsletter platform and the support desk.
   - Do you have a post-purchase survey or a site-behaviour tool (clicks, scroll depth)? Connect them if so.
   - What do you earn on one paid order before ad costs, and do you pay an agency fee? These set the break-even cost per order.
   - Which attribution do you make spending decisions on? The original uses last click, with first click shown beside it.
   - What cost per order is acceptable, and what is the month's ad budget cap?
   - Where should the ledger and the report notes live, and where should the message go (a private message to yourself)?
4. **Steps**:
   1. Check today's date. Read the last two reports and the standing action list. Carry forward open actions and anything marked "watch".
   2. Open the ledger and find every closed day that is missing. Normally that is just yesterday.
   3. Pull from the store, for those days: the funnel (sessions, cart adds, checkouts started, checkouts completed), sales by channel, orders by source on last click, sessions by referrer, devices, top landing pages, paid landing pages, paid orders by ad, products sold, top countries, and shipping status. Add paid orders on first click beside last click.
   4. Leave out draft orders, free comps and in-person event sales. They are not store performance.
   5. Pull ad spend by day and by ad from the ad platform, plus the live budget. Show the ad platform's own order count only as an over-claim ratio against the store's count.
   6. Write the day into the ledger with a script, not by mental arithmetic: channel buckets, cost per order including any agency fee, profit, and flags.
   7. Run the referrer watch: new, returning, rising, falling and vanished referrers, and the best converting ones.
   8. Read list growth and the last send from the newsletter platform, new tickets by theme from the support desk, and the survey's "how did you hear about us" answers.
   9. Write the report in this order: Scoreboard, Where orders came from, Paid, Site and conversion, Email and list, Social and press, Operations and support, Actions, Not checked. Include a since-launch column in the channel table.
   10. Send the summary as one private message to the member. Save the full note in the report folder.
   11. Afternoon pulse: today so far against the same hours yesterday, alerts only when a threshold is crossed, what moved since the morning. If nothing crossed a threshold, say so in a few lines and stop.
5. **Guardrails**:
   - Read-only everywhere. The only writes are the ledger, the report note and one message to the member.
   - Never post in a shared channel, never message the ad agency, never change the store, the ads or a budget.
   - Never put margin, break-even or fee figures into anything written for an agency.
   - Every recommendation names the number behind it or is labelled a hunch. A cut with fewer than about 30 orders or 300 sessions is "too small to act on". A trend is three or more days in one direction.
   - A threshold Claude proposed stays labelled "proposed" until the member confirms it.
   - If a source cannot be reached, list it under "Not checked" and report the rest.
6. **Output**: One private message each morning and afternoon. One saved note per run with tables for the scoreboard (yesterday against the 7-day trend), order sources (sessions, cart rate, orders, conversion by channel), paid (spend, orders on last and first click, cost per order by ad), and site. A ledger file with one row per closed day.
7. **Pitfalls seen**:
   - The ad platform claimed about 1.8 times the orders the store recorded. Fix: one basis for every channel, the store's last-click orders.
   - Comps and event sales inflated order counts. Fix: step 4.
   - The first day produced two morning runs. Fix: only the scheduled task carries the "send the message" instruction, so a manual re-run never sends twice.
   - The site-behaviour tool allowed only 10 requests a day. Fix: cache each day's answers and cap the morning run at 3.
   - A shipping delay made some promotions unsafe. Fix: keep a "standing context" block in the instructions so every report checks the promised date against the real one.
   - Scheduled runs only fire while the desktop app is open.
8. **Done when**: The morning message arrives with yesterday's scoreboard and a short action list, the ledger has a new row for each closed day, and "Not checked" names anything that could not be read.
9. **Paste to install**: "Set up a twice-daily store performance report from the playbook above. Ask me the Setup questions once. Then create two scheduled tasks in my time zone: 7:00 AM for the full report on yesterday and 5:00 PM for a short pulse on today with alerts only. Keep a ledger of closed days and save each report as a note in [folder]. Send me the summary as a private message. Stay read-only everywhere else, and save the steps as a skill so I can also run it on demand."

---

## 2. Meeting prep from notes, chat and email: about 3.1 hours a week saved (2.2 to 4.1)

Shortly before a recurring meeting or a one-to-one, the member asks Claude to "update for today's call". Claude gathers what happened since the last one from meeting notes, team chat, email and saved notes, then writes a brief: what changed, decisions needed, open items by owner, and a status update the member can share with attendees.

### This week

One prep, for a company-wide call held every two weeks. All step minutes are the guide's defaults.

**Doing this by hand**
- Searching the meeting-notes tool for every call since the last meeting: 1 search × 5 minutes = 5 minutes
- Listing the saved notes that changed since the last meeting: 1 search × 5 minutes = 5 minutes
- Reading the notes that changed and noting what matters (an incident note, a sales report, partner notes, a backer-update review): 6 notes × 6 minutes = 36 minutes
- Writing the brief (agenda, progress, status update to share): 5 pages × 15 minutes = 75 minutes
- **Total by hand: 121 minutes**

**Using Claude**
- Typing the request: 1 message × 1 minute = 1 minute
- Reading the brief Claude wrote: 1 brief × 1 minute = 1 minute
- **Total using Claude: about 2 minutes**

**Time saved**
- 121 minutes by hand − 2 minutes with Claude = **about 119 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 84.7 − 2 = about 83 minutes saved
- High: if the job took 30% more by hand, 157.3 − 2 = about 155 minutes saved
- **83 to 155 minutes saved**

**Confidence: Medium**, because the minutes for each step are defaults and the counts were read from the history. The yearly rate is solid: 39 preps counted over 12 weeks, and the minutes saved each time are the median of those runs (3 searches, 5 sources read, 1 page written), which is smaller than this week's longer brief.

Also worth: nothing slips between meetings, and attendees get a status update without a second request.

**Over a year**

\# of occurrences per year: 169 (3.25 per week)

Time saved per occurrence: 58 minutes

Hours saved per week: 3.1 (Range: 2.2 - 4.1)

Hours saved per year: 113 - 214

Source: counted from your Claude history, 39 preps in 12 weeks

Heavy user (best guess): 780 per year (15 per week), 14.5 hours saved per week

Heavy use for: a founder or chief of staff with daily status meetings

Your hours a week = your runs a week × 58 minutes ÷ 60

### Playbook

1. **Play**: Meeting prep from notes, chat and email. A one-page brief that lets the member run the meeting without opening anything else.
2. **Trigger**: A request shortly before a meeting, such as "update for today's call" or "agenda for my one-to-one with [role]". Keep one running chat per meeting series so each prep builds on the last.
3. **Setup first**:
   - Connect your meeting-notes tool, team chat, email and calendar.
   - Which recurring meetings and one-to-ones do you want covered, and who attends each?
   - Where do job descriptions live? One-to-one agendas compare where a person's time went with what their role asks.
   - Which folder should briefs be saved in?
   - How do you like to run one-to-ones? The original listens first and holds the member's own items to a time-boxed second half.
4. **Steps**:
   1. Confirm the meeting on the calendar (time, attendees) and find the date of the last one in the series. These meetings move often.
   2. Open the last brief for the series and carry forward its open items.
   3. Search meeting notes for every call since then that involved the attendees. Pull decisions and pending action items by owner.
   4. Search team chat and email for the same people and topics over the same period. Open full threads, not search snippets, because a later message often settles an earlier one.
   5. Check saved notes and task lists that changed since the last meeting.
   6. For a one-to-one, compare where the person's time went with their job description.
   7. Write the brief to fit the time left before the call: the headline, what changed since last time, decisions needed today, open items split into "mine" and "theirs", and questions to ask. When the call is minutes away, lead with the five lines that matter.
   8. Add a short status update the member can paste to attendees.
   9. Save the brief in the team folder under the meeting date and give the top lines in chat.
5. **Guardrails**:
   - Read-only. Never message attendees, post in a channel or change a calendar event.
   - Never call an item open without reading the latest message in its thread.
   - Say plainly when a source could not be reached.
   - Be direct about where the member is the bottleneck.
6. **Output**: A saved one-page brief with sections for Headline, Since last time, Decisions today, Open items by owner and Questions, a chat summary of the top lines, and a status update ready to share.
7. **Pitfalls seen**:
   - Email search showed only the first few messages of long threads, so live threads looked stale. Fix: open the whole thread.
   - Requests came 2 to 15 minutes before the call. Fix: step 7, the short version first.
   - The first prep for a new person was the slow one (15 or more searches). Fix: later preps update the same note in the same chat.
8. **Done when**: The member can run the meeting from the brief alone, and every open item has an owner.
9. **Paste to install**: "Prepare my meetings from the playbook above. Ask me the Setup questions once. From then on, when I say 'update for today's [meeting] call', follow steps 1 to 9, save the brief in [folder] and give me the top lines here. Stay read-only and never message attendees. Save this as a skill named meeting-prep."

---

## 3. Find a past file, draft the reply: about 1.6 hours a week saved (1.1 to 2.1)

Someone asks for something from the past: a file that was sent before, or a fact such as whether the company was closed on a certain day last year. The member forwards the ask. Claude searches team chat, email, the shared drive and meeting notes together, checks that what it found is the right thing and that the requester can open it, answers with links, and leaves a reply as a draft in the original thread.

### This week

Two lookups: whether the company was closed on a holiday last year, and finding a print-ready logo sent to an event partner before, with a reply drafted. All step minutes are the guide's defaults.

**Doing this by hand**
- Searching team chat with different phrasings: 19 searches × 5 minutes = 95 minutes
- Searching email: 9 searches × 5 minutes = 45 minutes
- Searching the shared drive: 7 searches × 5 minutes = 35 minutes
- Searching meeting notes: 1 search × 5 minutes = 5 minutes
- Opening what was found to check it (threads, files, sharing settings, that day's calendar and meetings): 12 items × 1.5 minutes = 18 minutes
- Writing the reply to the event partner: 1 email × 15 minutes = 15 minutes
- **Total by hand: 213 minutes**

**Using Claude**
- Typing the two requests: 2 messages × 1 minute = 2 minutes
- Tapping "Draft reply": 1 reply × 0.25 minutes = 0.25 minutes
- Reading the answers and the draft Claude wrote: 3 results × 1 minute = 3 minutes
- **Total using Claude: about 5 minutes**

**Time saved**
- 213 minutes by hand − 5 minutes with Claude = **about 208 minutes saved** (2 times this week)

**Range**
- Low: if the job took 30% less by hand, 149.1 − 5.25 = about 144 minutes saved
- High: if the job took 30% more by hand, 276.9 − 5.25 = about 272 minutes saved
- **144 to 272 minutes saved**

**Confidence: Medium**, because the minutes for each step are defaults, the counts were read from the history, and only this week's two lookups were broken into steps. A person would stop searching sooner than Claude, which ran about 18 searches for each question at once, so the low end is the safer figure.

Also worth: the reply goes out with a file the recipient can actually open, and the answer's location is saved so the same question is quick next time.

**Over a year**

\# of occurrences per year: 48 (0.9 per week)

Time saved per occurrence: 104 minutes

Hours saved per week: 1.6 (Range: 1.1 - 2.1)

Hours saved per year: 57 - 108

Source: counted from your Claude history, 11 lookups in 12 weeks

Heavy user (best guess): 520 per year (10 per week), 17.3 hours saved per week

Heavy use for: an executive assistant or account manager who fields "did we ever send that?" requests

Your hours a week = your runs a week × 104 minutes ÷ 60

### Playbook

1. **Play**: Find a past file, draft the reply. The answer in one line with links to the evidence, and a reply waiting as a draft.
2. **Trigger**: A request, usually forwarded: "[partner] asked for the high-res logo, did we send one before?" or "were we closed on [holiday] last year?"
3. **Setup first**:
   - Connect team chat, email, the shared drive, meeting notes and the calendar.
   - Which mailboxes should Claude search, and whose signature goes on drafts?
   - Are there shared folders outsiders cannot open? Claude needs to know so it attaches files instead of linking.
4. **Steps**:
   1. Restate what is being asked, by whom and by when.
   2. Search chat, email, the shared drive and meeting notes at the same time, with several phrasings: the thing's name, the people involved, the event and the date range.
   3. Open each promising hit and check it is the right thing: version, format, size and date. A low-resolution preview often sits beside the print-ready original.
   4. For a file, check who can open it. If the requester cannot, plan to attach it or use a link they can open.
   5. For a fact, collect evidence from two kinds of source: the official record (a policy list, an announcement) and what people actually did that day (messages sent, meetings held). Note what was looked for and not found.
   6. Answer in chat: one line, then links to the evidence.
   7. If a reply is wanted, draft it in the original thread with everyone on the thread kept, the link or attachment, and the member's signature. Leave it as a draft.
   8. If the question will come up again, save where the answer lives.
5. **Guardrails**:
   - Never send. Drafts only.
   - Never change sharing settings without a yes.
   - Say "not found" rather than guess, and mark anything stated from memory and not re-checked.
6. **Output**: A one-line answer, a table of what was found (File, What it is, Link), and a draft reply in the original email thread.
7. **Pitfalls seen**:
   - The requester could not open the shared-drive link because the folder was limited to a few staff. Fix: step 4, attach small files.
   - "Nobody announced it" is not proof. Fix: step 5, check what people did that day.
   - The first hit was a preview image, not the print file. Fix: step 3.
8. **Done when**: The member can answer in one click (open the draft, press send) and every evidence link opens.
9. **Paste to install**: "When I forward a request for a past file or fact, follow the playbook above. Search chat, email, the shared drive and meeting notes together, check the hit is the right one and that the requester can open it, answer me in one line with links, and leave a reply as a draft in the original thread. Never send and never change sharing. Save this as a skill named find-and-reply."

---

## 4. Full website review before a planning call: about 1.0 hours a week saved (0.2 to 2.6)

Hours before a planning call about a content website, the member asks for a complete review: content, traffic, usability, features and design, what has worked, what was tried and failed, what to try next, and how to weigh the team's ideas. Claude pulls every analytics source, searches chat and meeting notes for the site's history, audits the live site, and writes a full review plus a shorter version for the team.

### This week

One review. Step minutes are the guide's defaults except the two lines marked est., where the count was read from tool names in the commands Claude ran.

**Doing this by hand**
- Searching the web for benchmarks, competitors and how the site shows up: 20 searches × 5 minutes = 100 minutes
- Opening live pages of the site to check them: 36 pages × 1.5 minutes = 54 minutes
- Searching team chat, meeting notes and email for what was tried before: 30 searches × 5 minutes = 150 minutes
- Reading the channels, meetings and saved notes that came up: 28 sources × 6 minutes = 168 minutes
- Pulling numbers from the analytics tools (web analytics, search data, audience tool, email platform): 49 pulls × 3 minutes = 147 minutes (est.)
- Running technical checks on the live site (sitemaps, page headers, speed): 20 checks × 1.5 minutes = 30 minutes (est.)
- Building charts: 2 charts × 10 minutes = 20 minutes
- Building tables: 14 tables × 10 minutes = 140 minutes
- Writing the full review: 13 pages × 15 minutes = 195 minutes
- Reworking it into a shorter version for the team: 8 pages × 5 minutes = 40 minutes
- **Total by hand: 1,044 minutes**

**Using Claude**
- Typing the request and two follow-ups: 3 messages × 1 minute = 3 minutes
- Confirming two data sources were connected: 2 short replies × 0.25 minutes = 0.5 minutes
- Reading the review, the team version and the three updates: 5 results × 1 minute = 5 minutes
- **Total using Claude: about 9 minutes**

**Time saved**
- 1,044 minutes by hand − 8.5 minutes with Claude = **about 1,036 minutes saved**

**Range**
- Low: if the job took 30% less by hand, 730.8 − 8.5 = about 722 minutes saved
- High: if the job took 30% more by hand, 1,357.2 − 8.5 = about 1,349 minutes saved
- **722 to 1,349 minutes saved**

**Confidence: Low**, because two step counts are estimates and the yearly rate is the default for a one-off.

Also worth: the live audit found faults to fix the same day, the method for stripping bought and automated traffic was saved for reuse, and two more data sources are now connected.

Not counted: signing in to the search data tool and adding the audience tool's login, both done outside the chat.

**Over a year**

\# of occurrences per year: 3 (0.06 per week)

Time saved per occurrence: 1,036 minutes

Hours saved per week: 1.0 (Range: 0.2 - 2.6)

Hours saved per year: 12 - 135

Source: estimated, one review of this size in 12 weeks of your Claude history (two lighter site reviews not counted)

Heavy user (best guess): 52 per year (1 per week), 17.3 hours saved per week

Heavy use for: a web or search agency that audits a client site every week

Your hours a week = your runs a week × 1,036 minutes ÷ 60

### Playbook

1. **Play**: Full website review before a planning call. A review that says what is really happening on the site, what to fix today and what to try next, plus a version the team can read.
2. **Trigger**: A request ahead of a planning call: "review the site across content, traffic, usability, features and design; what worked, what failed, what should we try, and how do we weigh the team's ideas?"
3. **Setup first**:
   - Connect web analytics, search data, any audience or engagement tool, the email platform, team chat, meeting notes and email. Test each one before starting.
   - Which traffic is bought or automated? Claude must strip it before reading any trend.
   - Who is on the call, and what decision must it reach?
   - Has anyone new taken over the site recently, and when?
   - Where are past experiments written down, if anywhere?
4. **Steps**:
   1. Test every data connection. List what is connected and what is missing before any analysis.
   2. Clean the traffic first: remove bought, automated and untagged campaign visits, and state how much was removed.
   3. Pull at least 12 months of traffic, top content, sources, search queries, returning readers and email clicks.
   4. Search team chat, meeting notes and email for what was tried before and why it stopped.
   5. Audit the live site: key pages, navigation, speed, sitemaps, search and AI-answer visibility, broken addresses.
   6. Compare the periods before and after any change in who runs the site.
   7. Write the review in this order: Fix today, Bottom line, Traffic (what is real), What has worked, What was tried and failed or never really tried, Contributors, Content that underperforms but matters, Sponsored content and bought traffic, Technical and search, Usability and design, What to try (in order), How to weigh the team's ideas, Things nobody asked about, Method, Data sources still needed.
   8. Give every recommendation the number behind it, or label it a hunch.
   9. Write a second, shorter version for the team with nothing about any individual's performance.
   10. For each fault, say where in the site's back end it gets fixed.
5. **Guardrails**:
   - Read-only on the site and every analytics tool. No change to the live site without a yes.
   - Nothing about individuals in the team version.
   - Say what could not be checked and why.
6. **Output**: A full review document (13 pages, 14 tables and 2 charts in the original), a shorter team version, and a "fix today" list at the top.
7. **Pitfalls seen**:
   - Raw analytics overstated the audience because bought and automated traffic were mixed in. Fix: step 2 before anything else.
   - Search data access had lapsed and one audience tool was not connected, so the review needed two extra passes. Fix: step 1.
   - A key page's main address was broken and nobody had noticed. Fix: always run the live audit, even when the ask is strategy.
8. **Done when**: The call can be run from "Bottom line" and "What to try", every number has a source, and the team version can be shared as it is.
9. **Paste to install**: "Run a full website review from the playbook above for [site], ahead of my call on [date] with [roles]. Ask me the Setup questions first and test every data connection before you start. Deliver the full review, a shorter team version and a fix-today list. Change nothing on the site."

---

## Runners-up

- **Turn a call into a build plan**: about 286 minutes saved. Current: 0.3 hours a week (estimated, 3 a year). Heavy user (best guess): 14.3 hours a week. Heavy use for: a consultant who turns discovery calls into proposals.
- **Weekly press and referrer sweep**: about 183 minutes saved. Current: 2.4 hours a week (its weekly schedule). Heavy user (best guess): 11.9 hours a week. Heavy use for: a publicist tracking coverage for several clients.
- **On-demand ad and sales read**: about 477 minutes saved (9 times this week). Current: 1.1 hours a week (counted from your Claude history, 15 in 12 weeks). Heavy user (best guess): 8.8 hours a week. Heavy use for: a media buyer reporting on client ad accounts.
- **Vendor quote and landed-cost comparison**: about 240 minutes saved (2 times this week). Current: 1.3 hours a week (counted from your Claude history, 8 in 12 weeks). Heavy user (best guess): 6.0 hours a week. Heavy use for: a purchasing or operations lead at a product business.
- **Weekly application tracker for [child]**: about 76 minutes saved (one finished run counted; a scheduled run that did not finish is left out). Current: 1.3 hours a week (its weekly schedule). Heavy user (best guess): 12.7 hours a week. Heavy use for: an independent college counselor with a senior caseload.
- **Delay notice to every buyer**: about 107 minutes saved. Current: 0.1 hours a week (estimated, 3 a year). Heavy user (best guess): 1.8 hours a week. Heavy use for: an online store's operations lead.
- **Vendor credit application fill**: about 45 minutes saved. Current: 0.2 hours a week (counted from your Claude history, 4 in 12 weeks). Heavy user (best guess): 2.2 hours a week. Heavy use for: an office manager or bookkeeper who opens vendor accounts.

Written by Zack The Collector (for Claude) version 1.8
