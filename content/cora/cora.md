# Cora The Curator

Version 2.0 · November 23, 2026 · Roger (meetroger.ai) · Draft for Peter's approval (launch list S2)
Changes: 1.0 first version. 1.1 Surprise weighted 20; Ease ranks the simplest highest; Scores printed 1 to 10; Hours ranked on the hours figure; tiers widen; every playbook starts with the adapt-and-install paragraph. **2.0 one network-wide pool instead of one Circle (design spec B.7, nine changes), and built for Zack 2.0 ("Cora 2.0 - changes for Zack 2.0", fifteen changes): figures come from each play's "Facts for Cora"; merging compares Job lines; Reach, Ease and Proof use Zack's stated facts; Fit uses the private matching profile; three picks per user, written as records, not a sort file.**

This file is the method. The Roger code base runs it (`src/lib/cora/`); where this file and the code disagree, the code is wrong.

## What Cora does
Every Monday at 1:00 AM Toronto, after the Sunday cutoff, Cora reads the week's runs, merges each new play into the pool play that does the same job (or makes a new one), scores every active pool play, and picks three ideas for every user who gets a list. Cora runs unattended, never messages users, never changes anyone's figures, and never shares names, clients, contact details or a user's private profile.

## What Cora reads
1. **This week's runs** that passed intake (spec B.6): their plays, with each play's "Facts for Cora", and their "Also runs".
2. **The pool**: every pool play and the plays merged into it, from every earlier week.
3. **Each user's matching profile** (Zack 2.0's private file): work, setup, friction and gaps, past ideas. Matching only: nothing from it appears in any idea except the user's own general reason line. Users with no profile are matched from their sign-up quiz.

Figures are taken from the "Facts for Cora" block or the `roger-run` block. Prose is read only when a fact is missing. **Actual or Implied** is Zack's stated Basis; heavy-user figures are always Implied.

## Which plays count
- A play counts toward the pool only if it is shareable at the cutoff: its run was shared, the user still shares, it is not a test run, and any flag on it was cleared by an admin.
- A "matching only" play never adds evidence; it tells Cora the user already runs that job.
- **One person counts once** in every figure: a member with runs from several agents, or over several weeks, is one person. A seed contributor linked to a member's account is that member.

## Step 1. Merge into the pool
1. Two plays are the same play when their **Job lines** describe the same kind of trigger, work and result. Titles, wording, tools and schedules do not make them different.
2. **When in doubt, keep them separate.** A wrong merge hides a play; a missed merge only costs a little reach. A play that cannot be compared (an error) stays separate.
3. A play the same as a retired pool play revives it.
4. Each pool play's text comes from its best evidence: the highest Confidence with an Actual basis, then the most complete playbook. Its title is the plainest one under eight words. "Heavy use for" is the role named most often.

## Step 2. Merged figures
Evidence is weighted by age (`v3.recencyWeights`): the first four weeks count fully, weeks five to twelve half, older a quarter. A pool play with no evidence in 26 weeks is retired from picking and kept on record.
- **Minutes saved each time, current hours a week, heavy-user hours, size**: each person's own figure, then the median across people. In the hours median an Actual figure counts twice.
- **Range**: the lowest low end and the highest high end.
- **Never invent a number.** A figure nobody stated stays missing.

## Step 3. Score each pool play (0 to 100)
Each factor is scored 1 to 10 by decile across all active pool plays (top tenth 10, bottom tenth 1; equal figures score the same; a missing figure scores 1).

Score = (Hours × 30 + Reach × 25 + Ease × 10 + Proof × 15 + Surprise × 20) ÷ 10

| Factor | Weight | Figure, best end first |
|---|---|---|
| Hours saved | 30 | The current hours a week, or half the heavy-user hours if higher. Highest is best. |
| Reach | 25 | The share of users who could use it: their profile meets "Who can use it", their role matches "Heavy use for", or they work in the same category. Highest is best. |
| Ease to copy | 10 | Zack's Size: steps × 1 + connections × 5 + setup questions × 1. Lowest is best. |
| Proof | 15 | For each person: Confidence (Low 1, Medium 2, High 3; one level higher when "Running for" is four weeks or more, to High at most), doubled for an Actual basis, weighted by age. A user running it because Roger sent it counts. Highest is best. |
| Surprise | 20 | For each person running it: 2 from Set A, 1 otherwise. People who run it because Roger sent it are left out. Lowest is best. |

**Tie-breaks**, in order: higher Surprise, higher Reach, more people with an Actual figure, higher hours figure, title in alphabetical order.

## Step 4. Three ideas for each user
**Who gets a list** (spec B.7 table): a trial user with Zack on when their run arrived; a trial user with Zack off every Monday; monthly and sponsored users every Monday; one-at-a-time users only on a Monday they ordered, when their run arrived and the charge succeeded; never a held, closed, or cancelled-and-expired account.

1. **Leave out** every pool play the user already runs (their plays in the last four weeks; "Also runs" and the jobs in their profile's Setup once they are matched to pool plays), every pool play they ever contributed to, every idea already delivered to them, and every past idea they removed or skipped. An idea that could not be installed may be sent again once their Setup has what it needed.
2. **Fit**: 5 when the play's Job matches an item in their "Friction and gaps", or its "Heavy use for" matches their role; 3 for the same category; 1 otherwise.
3. **Personal score** = network score × 0.75 + Fit × 5.
4. **Pick** the three highest personal scores at Fit 3 or more, then fill with the highest network scores at Fit 1. A play that needs a connection or feature the user's Setup lacks ranks below every play they can install today, and its reason says what it needs. On equal personal scores, a friction match wins. One or two picks are fine when that is all there is; none is recorded.
5. **The reason line** is one of a few fixed sentences, naming at most the play's category or role ("Matches something your week still had you doing by hand", "Fits the listings work your week shows"). It never names a person, a company, or the user's own plays. A model may judge Fit, but never below what the categories show, and 5 only with a friction, role or category match.

## Privacy
- Plays are anonymous: "run by 3 users", never a name.
- Zack and intake already removed private details; Cora's records hold only cleaned text.
- The matching profile never appears in any idea.

## Numbers and claims
- Time only. Never turn hours into money or promise any income.
- Heavy-user figures are always "best guess".
- Every figure is copied from Zack or worked out from Zack's figures with the steps above.

## What Cora writes
Records, not a file: each pool play's factor scores and score, and three picks per user per week with the personal score, Fit and reason line. Each idea is shown in the layout of "Roger Install (Implement these 3) v1.0", Part 2, with the install instructions (Part 1) once at the top of the list.

## When it fails
A passing error is retried by the next run. If the model has no credits, errors repeat three times, or the week is not ready by noon Toronto, nothing is sent, the week is marked failed, and both admins are alerted. A failed week never becomes ready later.

## Decisions Peter confirmed (2026-11-27)
The readings the build made, confirmed as built (formerly launch list S20):
- A play the user cannot install ranks below every play they can, even a Fit 1 play (change 9, read literally).
- An idea that could not be installed may be sent again once the setup has what it needs (change 12).
- The "Running for" Proof bonus (change 6) and leaving adopted plays out of Surprise (change 7) are built in, with no switch.
- A missing figure scores 1 on its factor (v1.1 said "or 0").
- With fewer than ten active plays, the lowest decile is above 1.
- A runner-up counts 1 toward Surprise.

Not built, and not needed for launch: "Also runs" and the profile's Setup matched to pool plays (change 8) is built first in B4; upgrades (change 11, including how many per list) and adoption counts (change 15) are in B3 (design spec B.16).

## Open decisions for Peter
1. Reach is judged in code from categories and roles; "Who can use it" is not yet compared with each profile by a model.
2. A user found not eligible at 1:00 AM (for example a held payment that succeeds at 6:00) gets no list that Monday.
