# Zack Run - 2026-11-15

Zack The Collector (for Grok Bot) v1.9 · Lookback: the past 7 days of the member's own Grok Bot activity · Delivered to the member only

---

## 1. Summary

| Play | Set | Minutes saved each time | Current | Heavy user (best guess) | Heavy use for |
|---|---|---|---|---|---|
| Inbox-to-draft emails | A, top for you | 20.2 | 29 a week (estimated from one week) | 60 a week | Agents, team leads and assistants who answer a lot of deal, client and vendor email |
| Copied-thread digest | A, top for you | 31.5 | 10 a week (routine cadence) | 15 a week | Team leads and agents copied on many deal threads they don't own |
| Phone camera roll to styled Reels | B, my garbage, your treasure | 142 | 1 a week (estimated from one week) | 3 a week | Local-brand agents, small shops and creators who post short video often |
| "Who's waiting on me?" inbox sweep | B, my garbage, your treasure | 38 | 2 a week (estimated from one week) | 5 a week | Anyone with a busy shared inbox who closes out each day |

- **Inbox-to-draft emails:** 9.77 hours a week (range 6.43 to 13.10). This week: 586 minutes (386 to 786).
- **Copied-thread digest:** 5.25 hours a week (range 3.62 to 6.88). This week: 252 minutes (174 to 330), from 8 runs.
- **Phone camera roll to styled Reels:** 2.37 hours a week (range 1.62 to 3.12). This week: 142 minutes (97 to 187).
- **"Who's waiting on me?" inbox sweep:** 1.27 hours a week (range 0.87 to 1.67). This week: 76 minutes (52 to 100).

**Total over a year: about 18.7 hours a week saved (12.5 to 24.8), 652 to 1,288 hours a year.**
**Total this week: 11.8 to 23.4 hours saved (about 17.6).**

(Totals cover the four plays above, current figures only. Heavy-user figures are never added in.)

---

## 2. The plays

### Play 1 (Set A): Inbox-to-draft emails

The member says who the email is for and what it should say in one line; Grok Bot finds the right thread in Gmail, pulls the contact details, documents and facts it needs from other emails, writes the email in the member's voice and saves it as a draft (usually as a reply on the existing thread). Nothing is sent; the member reviews and sends.

**Doing this by hand**
- Search the inbox for the thread, contact details or document: 1 × 5 min = 5 min (Default)
- Open and verify 2 items (the thread and a supporting email or attachment): 2 × 1.5 min = 3 min (Default)
- Write a short email: 1 × 15 min = 15 min (Default)
- Manual total: 23 minutes per email

**Using Grok Bot**
- 29 typed requests (1 min each) = 29 min
- 29 results read (1 min each) = 29 min
- 23 typed corrections counted across the week (add a cc, add the meeting time, fix an attachment, add a phone number, change the subject) = 23 min
- Total 81 min ÷ 29 emails = 2.8 minutes per email

**Time saved:** (23 − 2.8) × 29 = 586 minutes this week, 20.2 minutes each time.

**Range:** low (23 × 0.7 − 2.8) × 29 = 386 minutes; high (23 × 1.3 − 2.8) × 29 = 786 minutes.

**Confidence:** Medium (default step times and counted messages; the rate comes from one week).

**Over a year**
- # of occurrences per year: 1,508 (29 per week)
- Time saved per occurrence: 20.2 minutes
- Hours saved per week: 9.77 (Range: 6.43 - 13.10)
- Hours saved per year: 334 - 681
- Source: estimated from one week
- Heavy user (best guess): 3,120 per year (60 per week), 20.2 hours saved per week
- Heavy use for: agents, team leads and assistants who answer a lot of deal, client and vendor email
- Your hours a week = your runs a week × 20.2 minutes ÷ 60

#### Playbook

**1. Play:** Inbox-to-draft emails. One line from you becomes a ready-to-send draft in Gmail, on the right thread, with the right people and facts in it.

**2. Trigger:** A request, typed or dictated, such as "Draft a reply to [the property manager] thanking her for booking the repairs and attach the signed agreement" or "Draft an intro email between [a new lead] and [your mortgage partner]".

**3. Setup first** (answer once):
- Which email account should drafts be saved in (for example, your work Gmail), and should replies always go on the existing thread?
- Do you want your signature added, or left off because your email app adds it automatically?
- How do you sign off (for example, "Thank you, [your first name]")?
- Who is usually cc'd on what (for example, your team partner on purchases, your office on paperwork)?
- What should never be opened? (For example: financial emails, statements, receipts, tax or expense sheets. Grok Bot looks only at the subject and preview line for those.)
- Public services to have connected: Gmail (to read and save drafts). Google Calendar if you want meeting times checked.

**4. Steps:**
1. Read the request and list what the email needs: who it goes to, who is cc'd, the facts to include, and any attachment.
2. Search Gmail for the latest thread with that person or topic. If one exists, write the draft as a reply on that thread so the history travels with it.
3. Find every contact detail the request mentions. If a phone number or email isn't in the thread, search that person's other emails and read their signature block.
4. If an attachment is needed (a signed agreement, a notice, a paperwork set), find the most recent fully signed version (often the newest e-signature email, for example from DocuSign), download it, re-save it as a clean PDF, and attach it.
5. Write the email in your voice: short, warm, plain. Use the facts from the request exactly; don't add promises, prices or dates you didn't give.
6. Save it as a draft. Don't send.
7. Reply in chat with: who it's to and cc'd, the subject, which thread it's on, what's attached, and anything you couldn't find (for example, "no phone number for [the tenant] in any email; send it and I'll add it").
8. Make any change you ask for on the same draft rather than starting a new one, unless you ask for a fresh email (for example, a new email with a clear subject line so the reader can find it later).

**5. Guardrails:**
- Never send. Never schedule a send unless you say "schedule it" and give the time.
- Never invent a phone number, email address or figure. If it isn't in your mail, ask.
- Financial emails: subject and preview only, never opened, unless you say so for that email.
- If an attachment won't open after saving, rebuild it before telling you it's ready.

**6. Output:** A Gmail draft (reply on the right thread, or a new email if asked) plus a short chat note: To, Cc, Subject, thread, attachments, and any gaps.

**7. Pitfalls seen:**
- Attachments on drafts sometimes wouldn't open on a phone. Fix: re-save each file as a clean PDF, attach again, and check each one opens before saying it's ready.
- "The complete paperwork" meant the fully signed versions, not the first copies. Fix: always pick the latest fully signed and initialled version of every document.
- Gmail added the signature automatically under the typed one, so it appeared twice. Fix: ask once whether to type a signature, and remember the answer.
- A scheduled email went out before a last edit was made. Fix: when a draft is scheduled, confirm the final wording first.
- An old draft was left sitting on the same thread. Fix: point out any older draft on that thread so it can be deleted and doesn't go out by mistake.
- A contact's email looked wrong to the requester. Fix: say exactly which email the address came from, so it can be checked at the source.
- The cell number wasn't in the thread. Fix: search that person's other emails for a signature block before asking.

**8. Done when:** The draft is in your Drafts folder on the right thread, the people and facts match your request, every attachment opens, and nothing was sent.

**9. Paste to install:**
> Written by another member. Read sections 1 to 8 before pasting this.
>
> Save this as a skill called "Inbox-to-draft emails". When I ask you to draft an email, follow the Steps, Guardrails and Output in the playbook I've pasted above. Use only accounts I've already connected. Save drafts only; never send or schedule anything unless I say so in that message. Before your first draft, ask me the "Setup first" questions once and remember my answers.

---

### Play 2 (Set A): Copied-thread digest

Twice each weekday, Grok Bot reads the email threads the member is only copied on (team, deal and office threads), and sends one short summary in chat: what needs the member at the top, then everything else grouped by deal, then FYI. It's read-only; it never replies, archives or deletes.

**Doing this by hand**
- Search the inbox for copied threads since the last check: 1 × 5 min = 5 min (Default)
- Open and verify each thread: 15 threads (counted from one run) × 1.5 min = 22.5 min (Default)
- Write yourself a short summary of what needs you: 5 min (est.)
- Manual total: 32.5 minutes per run

**Using Grok Bot**
- Reading the digest: 1 min. No typing (it runs on a schedule).
- Total: 1 minute per run

**Time saved:** (32.5 − 1) × 8 runs this week = 252 minutes this week, 31.5 minutes each time.

**Range:** low (32.5 × 0.7 − 1) × 8 = 174 minutes; high (32.5 × 1.3 − 1) × 8 = 330 minutes. At full cadence (10 a week): 218 to 413 minutes.

**Confidence:** Low (one "est." step).

**Over a year**
- # of occurrences per year: 520 (10 per week)
- Time saved per occurrence: 31.5 minutes
- Hours saved per week: 5.25 (Range: 3.62 - 6.88)
- Hours saved per year: 188 - 358
- Source: routine cadence (weekdays, twice a day); estimated
- Heavy user (best guess): 780 per year (15 per week), 7.9 hours saved per week
- Heavy use for: team leads and agents copied on many deal threads they don't own
- Your hours a week = your runs a week × 31.5 minutes ÷ 60

#### Playbook

**1. Play:** Copied-thread digest. A twice-daily summary of the threads you're only copied on, with "needs you" at the top, so you can stop opening every cc.

**2. Trigger:** A schedule: weekdays, once in the morning before work starts and once mid-afternoon (for example [8:50 AM] and [3:00 PM], your time zone). The Monday morning run covers everything since Friday afternoon.

**3. Setup first** (answer once):
- What times do you want it, and in which time zone?
- Which threads count: everything you're cc'd on, or only team and deal threads? Any senders to always include (your team, your office's deals desk, your showing service) or always ignore (newsletters, promos)?
- How do you want deals grouped (by property address, client name or file number)?
- What should never be opened? (For example: deposit, bank, payment or compliance threads. Those get listed from subject and preview only.)
- Public service to have connected: Gmail (read access is enough). Google Calendar if you want same-day showings and meetings mentioned.

**4. Steps:**
1. At each run, search Gmail for threads where you're on cc (not the main recipient) since the last run.
2. Drop newsletters, promos and anything on your ignore list.
3. For financial or compliance threads, read only the subject and preview, and say so at the end of the digest.
4. Sort each remaining thread into: **Needs you** (someone asked you directly, a deadline or irrevocable time is close, or a reply from you is missing), **By deal** (one bullet per property or client: the latest status in one line), **FYI** (events, office notices).
5. Under Needs you, name who's asking, what they need, and by when. If a reply you started is already sitting in Drafts, say so.
6. Keep it short: one line per item, times in your time zone.
7. Post the digest in chat. Don't reply to, archive, label or delete anything.
8. If something urgent arrives between runs and you're mid-conversation, a short "updates since this morning's digest" note is fine.

**5. Guardrails:**
- Read-only. Never sends, archives, labels or deletes.
- Never opens financial threads; lists them from subject and preview only.
- If Gmail can't be reached, post one line saying the digest was skipped and why, instead of a partial summary.

**6. Output:** A chat message with three headed lists: **Needs you**, **By deal**, **FYI**, plus one closing line naming any threads it didn't open.

**7. Pitfalls seen:**
- Monday's first run has to cover the whole weekend. Fix: always cover "since the last run", not "since yesterday".
- Drafts you'd started were easy to forget. Fix: flag any unsent draft that answers a Needs-you item.
- Deadlines like irrevocable times or awards cut-offs got buried in long threads. Fix: put any time-limited ask at the very top with its deadline.
- Payment and deposit threads shouldn't be opened. Fix: preview only, and say so at the end.

**8. Done when:** The digest arrives at each set time, Needs-you items match what people actually asked, and you didn't have to open the copied threads to know where things stand.

**9. Paste to install:**
> Written by another member. Read sections 1 to 8 before pasting this.
>
> Save this as a skill called "Copied-thread digest" and create a routine that runs it on weekdays at the two times I give you. Follow the Steps, Guardrails and Output in the playbook I've pasted above. Use only accounts I've already connected, read only, and never send, archive or delete anything. Ask me the "Setup first" questions once before the first run.

---

### Play 3 (Set B, my garbage, your treasure): Phone camera roll to styled Reels

The member shares a batch of everyday phone photos and clips from around their neighbourhood. Grok Bot sorts them, picks what works for Instagram, studies what top accounts in the field are posting, and makes finished short Reels in that style (B-roll with bold on-brand text), with a content plan to follow.

**Doing this by hand**
- Go through the photo dump and pick usable clips: 30 min (est.)
- Look at what top accounts in your field are posting: 3 searches × 5 min = 15 min (Default)
- Edit 3 Reels with text overlays: 3 × 20 min = 60 min (est.)
- Write on-screen text and captions: 3 × 15 min = 45 min (Default)
- Manual total: 150 minutes

**Using Grok Bot**
- 7 typed messages (requests, two shared-album links, style notes): 7 min
- Reading the result: 1 min
- Total: 8 minutes

**Time saved:** (150 − 8) × 1 = 142 minutes this week, 142 minutes each time.

**Range:** low (150 × 0.7 − 8) × 1 = 97 minutes; high (150 × 1.3 − 8) × 1 = 187 minutes.

**Confidence:** Low ("est." steps and a rate from one week).

**Over a year**
- # of occurrences per year: 52 (1 per week)
- Time saved per occurrence: 142 minutes
- Hours saved per week: 2.37 (Range: 1.62 - 3.12)
- Hours saved per year: 84 - 162
- Source: estimated from one week
- Heavy user (best guess): 156 per year (3 per week), 7.1 hours saved per week
- Heavy use for: local-brand agents, small shops and creators who post short video often
- Your hours a week = your runs a week × 142 minutes ÷ 60

#### Playbook

**1. Play:** Phone camera roll to styled Reels. A pile of phone photos and clips becomes finished vertical Reels in the style top accounts use, ready for you to post.

**2. Trigger:** A request with a shared album link, for example "Here's a batch from my camera roll, only things from [your neighbourhood]. Make Reels from it."

**3. Setup first** (answer once):
- Which places or topics should clips come from (for example, only [your neighbourhood]: local shops, events, seasonal scenes, street B-roll)?
- What are your brand colours and fonts for on-screen text?
- What's your posting voice (friendly local guide, expert, playful)?
- Should Grok Bot add music, or leave it out so you add a song in the app?
- How do you share media: a shared photo-album link (for example, iCloud Photos or Google Photos) or a Drive folder?
- Public services: none need connecting for the first batch if you share a link. Instagram is only needed later if you want drafts placed there.

**4. Steps:**
1. Download everything from the shared link(s). Tell the requester it may take a while for a big album.
2. Keep only items that match the chosen places or topics; drop blurry, private or people-heavy shots of strangers.
3. Sort what's left into themes (for example: a weekend-in-the-neighbourhood POV, things I love about the area, local shops and spots, an event recap, seasonal scenes).
4. Look at what top accounts in the same field are posting right now: hooks, length, text-over-B-roll style, list formats. Note 3 to 5 patterns.
5. Build 3 Reels first, each 10 to 30 seconds, vertical, with a strong first-second hook and bold text in the brand colours. Leave music out unless asked.
6. Write a short caption and on-screen text for each.
7. Send the 3 Reels to the requester to approve the style before making more.
8. After approval, make the rest and a simple posting plan (which Reel or post goes on which day, through the period they choose). Add new album links to the batch as they arrive.

**5. Guardrails:**
- Never post or schedule anything on social media. Finished files and drafts only.
- Don't use copyrighted music.
- Don't feature identifiable strangers, children, or private homes without the requester's OK.
- If a download link fails or expires, ask for a new link rather than guessing.

**6. Output:** 3 finished vertical Reel files (then more after approval), a caption for each, and a posting-plan page listing date, Reel or post, caption and theme.

**7. Pitfalls seen:**
- Licensed songs in a video got it blocked by a copyright claim on another platform. Fix: leave music out and let the requester add a song inside the app, or use a free library track.
- The requester wanted to see the style before a full plan. Fix: send 3 samples first, then build the rest.
- Media arrived in several batches. Fix: start on the first batch, and fold later links into the plan as they come.
- "Use my camera roll" needs a sharing method the bot can reach. Fix: ask for a shared album link.

**8. Done when:** The requester has 3 Reels they like the look of, captions for each, and a plan for the rest.

**9. Paste to install:**
> Written by another member. Read sections 1 to 8 before pasting this.
>
> Save this as a skill called "Camera roll to Reels". When I send a photo-album link and ask for Reels, follow the Steps, Guardrails and Output in the playbook I've pasted above. Never post or schedule anything for me. Ask me the "Setup first" questions once before the first batch.

---

### Play 4 (Set B, my garbage, your treasure): "Who's waiting on me?" inbox sweep

On request, Grok Bot goes through the last week (or the day) of the member's inbox and lists everyone still waiting on a reply or a to-do from the member, newest first, with what each person needs and any draft already started.

**Doing this by hand**
- Search the inbox for recent threads: 1 × 5 min = 5 min (Default)
- Open and verify about 20 threads to see who's still waiting: 20 × 1.5 min = 30 min (Default)
- Write yourself the list: 5 min (est.)
- Manual total: 40 minutes per sweep

**Using Grok Bot**
- 1 typed request: 1 min
- Reading the list: 1 min
- Total: 2 minutes per sweep

**Time saved:** (40 − 2) × 2 = 76 minutes this week, 38 minutes each time.

**Range:** low (40 × 0.7 − 2) × 2 = 52 minutes; high (40 × 1.3 − 2) × 2 = 100 minutes.

**Confidence:** Low (one "est." step).

**Over a year**
- # of occurrences per year: 104 (2 per week)
- Time saved per occurrence: 38 minutes
- Hours saved per week: 1.27 (Range: 0.87 - 1.67)
- Hours saved per year: 45 - 87
- Source: estimated from one week
- Heavy user (best guess): 260 per year (5 per week), 3.2 hours saved per week
- Heavy use for: anyone with a busy client inbox who wants to close out each day with nothing missed
- Your hours a week = your runs a week × 38 minutes ÷ 60

#### Playbook

**1. Play:** "Who's waiting on me?" inbox sweep. A newest-first list of every person still waiting on a reply or task from you, so nothing slips before you sign off.

**2. Trigger:** A request, for example "Anyone in my inbox waiting on a reply from the last week?" or "Any emails or to-dos I need to do before I close off for the day?" It can also be made a routine (for example, weekdays late afternoon).

**3. Setup first** (answer once):
- How far back should a sweep look by default (today, 3 days, a week)?
- Which senders matter most (clients, your team, your office, vendors), and which to ignore?
- Should it also mention tomorrow's or this weekend's calendar items?
- What should never be opened? (For example, financial threads: subject and preview only.)
- Public services to have connected: Gmail (read). Google Calendar if you want upcoming items included.

**4. Steps:**
1. Search Gmail for threads in the chosen window where the last message is from someone else and asks you something, or where you promised a follow-up.
2. Skip newsletters, automated notices and threads already answered by you or a teammate.
3. For each one left, note: who, what they're asking, when they asked (in your time zone), and the property or client it's about.
4. Check Drafts: if a reply is already started, say so ("your reply is in Drafts but hasn't gone out").
5. List anything you're still waiting on from others separately, so it's clear whose move it is.
6. If asked, add tomorrow's or the weekend's calendar items that need prep, and flag anything unclear (for example, an untitled event someone added).
7. Post the list in chat, newest first. Offer to draft any of the replies, but don't draft until asked.

**5. Guardrails:**
- Read-only. Never sends, archives or marks as read.
- Financial threads: subject and preview only, and say which ones weren't opened.
- If a thread is ambiguous (you may have already replied by phone), list it as "check" rather than leaving it out.

**6. Output:** A chat list with three parts: **Waiting on you** (name, ask, when, related deal, draft status), **You're waiting on** (name, what, since when), and **Coming up** (only if requested).

**7. Pitfalls seen:**
- Replies the person had started but not sent were the easiest to miss. Fix: always check Drafts against each waiting thread.
- Some asks sat inside long copied threads. Fix: read the latest message in each thread, not just the subject line.
- A teammate sometimes answered for the person already. Fix: check whether anyone on the team replied before listing it.
- Payment and compliance threads came up. Fix: preview only, and say so.

**8. Done when:** The list matches your sense of what's open, every item has a name and an ask, and nothing that needed you that day is missing.

**9. Paste to install:**
> Written by another member. Read sections 1 to 8 before pasting this.
>
> Save this as a skill called "Who's waiting on me". When I ask who's waiting on me, follow the Steps, Guardrails and Output in the playbook I've pasted above. Use only accounts I've already connected, read only, and never send or archive anything. Ask me the "Setup first" questions once before the first sweep.

---

## 3. Runners-up

- Interview questions built from a candidate's résumé and a recruiter's notes, including follow-ups during the interview (3 this week, about 20 minutes saved each).
- Uploading finished videos as private drafts on YouTube with titles and descriptions, and fixing a music copyright block (1 this week).
- Critiquing a just-sold mailer and making the edits on a copy in Canva (1 this week).
- Old-lead revival: mining years of portal lead emails (for example from REALTOR.ca) into a Google Sheet, sorting by lead type and age, writing call and follow-up email scripts in the team's voice, and adding call-log columns (one-off, about 7 hours saved; heavy user best guess about 1.6 hours a week).
- Past-client reconnect list in a Google Sheet with sample email and LinkedIn drafts, leaving out active clients and anyone emailed in the last 90 days (one-off).
- A newsletter template in Canva modelled on a sample guide the member admires, in the team's colours (one-off).
- Two training plans for new team members with different experience levels (one-off).
- Filling in a standard lease in an online forms platform by copying a past lease and changing only the names and terms (one-off).
- Searching past leases for whether a specific clause was ever used (1 this week).
- Moving a recurring team meeting onto the right shared calendar, and checking room bookings (small, several this week).
- An onboarding plan for a new team member's first meeting (1 this week).
