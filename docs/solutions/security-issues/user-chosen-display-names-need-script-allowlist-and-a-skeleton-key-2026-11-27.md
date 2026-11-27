---
title: User-chosen display names need a script allowlist, a folded skeleton key for uniqueness, and word-aware reserved rules
date: 2026-11-27
category: security-issues
module: growth
problem_type: security_issue
component: authentication
symptoms:
  - "Rоger" and "Аdmin" (Cyrillic о and А) passed the reserved-name check and looked identical to staff names on the public leaderboard
  - "Аnna" was accepted beside a top member called "Anna", because the unique index compared lower(display_name)
  - Latin-script look-alikes (ɡ, ø, ı, small capitals) and i/l swaps still cloned names after a Latin-only rule
  - The first "contains a staff word" fix rejected real names such as Roger Alvarez, Stafford and Badminton
root_cause: missing_validation
resolution_type: code_fix
severity: high
related_components: [database]
tags: [display-name, impersonation, homoglyph, confusables, unicode, nfkc, skeleton, leaderboard, unique-index]
---

# User-chosen display names need a script allowlist, a folded skeleton key for uniqueness, and word-aware reserved rules

## Problem
B2 Unit 7's opt-in leaderboard shows member-chosen names to every member. Three review rounds broke the name rules one layer at a time: other scripts, then Latin-script look-alikes, then over-broad fixes that blocked real people.

## Symptoms
See the frontmatter. Each fix exposed the next gap. NFKC alone doesn't fold confusables, and `lower()` uniqueness doesn't see look-alikes.

## What Didn't Work
- **NFKC plus a lowercase reserved list:** it misses cross-script and same-script look-alikes.
- **"Latin script only"** without an allowlist: `\p{Script=Latin}` includes IPA letters, small capitals and letters that don't decompose (ø, ł, ı).
- **Substring bans on the folded key** (support, staff, admin, rogerai): these rejected Stafford, Badminton and Roger Alvarez, because i and l fold to the same letter.

## Solution
In `src/lib/growth/leaderboard-name.ts`:
- **An explicit letter allowlist:** A–Z, Latin-1 letters, Latin Extended-A, and named Extended-B letters (Vietnamese, pinyin, Romanian), plus digits, spaces and `. ' - &`. Reject default-ignorable and blank characters, stacked combining marks, and names with fewer than two visible letters or digits.
- **`skeleton()`:** NFKC, strip marks, lowercase, fold letters that don't decompose (ø→o, ł→l, ß→ss and so on), fold i, l, 1 and | together, map leet digits, rn→m, vv→w, then drop everything that isn't alphanumeric.
- **Uniqueness is on the skeleton:** `users.leaderboard_name_key`, with a unique index where `leaderboard_opt_in_at is not null`. Catch only *that* constraint's unique violation as "name taken", and rethrow any other.
- **Reserved rules that respect words:**
  - whole-name list (roger, zack, cora, admin and so on);
  - joined staff forms anywhere (rogeradmin, rogerbot, meetroger, moderator);
  - admin and official only at the start or end of a word, so Badminton passes and TheAdmin fails;
  - staff, support, team, help, bot and hq only as whole words after "Roger", or as the whole name.
- **Release names when an account leaves:** a trigger (`users_leave_board_on_close`, `create or replace trigger` on one line) clears the opt-in on closed or cancelled. That covers every close path without patching each one.

## Why This Works
Display is what an attacker controls, so uniqueness and reservation have to run on a key that collapses everything a reader can't tell apart. An allowlist bounds the alphabet so the fold map can be complete. Word-aware rules keep real names working.

## Prevention
- Keep a table of tests for each layer: cross-script (`Rоger`), same-script look-alikes (`Roɡer`, `Røger`, `ᴀdmin`), i/l (`Iian` against `lian`), leet (`R0ger`, `Ann4` against `Anna`), blank and zalgo characters, joined staff words (`RogerAdmin`, `TheAdmin`). Also test real names that must pass: Zoë Gauthier, Roger Tremblay, Roger Alvarez, Stafford, Badminton, Łukasz Øster.
- Schema changes for a new key must not destroy data on re-apply: no repeated `update ... set opt_in = null`. Treat a missing key as "not on the board", and create the new index before dropping the old one.
- Known gap, accepted: "Roger Botha" is rejected, because its key contains rogerbot.

## Related
- `docs/solutions/security-issues/strip-markdown-fences-by-pairing-not-regex-2026-11-27.md` (another case where a single regex wasn't enough)
- `docs/solutions/logic-errors/tightening-a-fail-closed-settings-read-schema-bricks-saved-data-2026-11-27.md` (schema changes reinterpreting stored data)
