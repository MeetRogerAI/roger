---
title: Model-written edits for a public repo need line-anchored hunks, discard-not-strip character rules, whole-file checks, and a write gateway that guards itself
date: 2026-11-28
category: security-issues
module: review
problem_type: security_issue
component: background_job
symptoms:
  - The model's copied "old text" didn't match the file byte for byte, so find-and-replace either failed or matched the wrong place
  - Stripping zero-width and bidi characters from an added line let the rest of a disguised line through
  - A Cyrillic look-alike letter in an otherwise Latin line passed every word check
  - A member's client name, quoted in their note, reached a proposed edit of an instruction file in a public repository
  - Per-hunk checks missed a quote split across two hunks, and a PR body could claim a different diff from the one committed
  - Branch and base safety depended on every caller passing the right names
root_cause: missing_validation
resolution_type: code_fix
severity: high
related_components: [database, tooling]
tags: [llm, review-bot, github, public-repo, prompt-injection, homoglyph, unicode, privacy, pull-request, defense-in-depth]
---

# Model-written edits for a public repo need line-anchored hunks, discard-not-strip character rules, whole-file checks, and a write gateway that guards itself

## Problem
The B3 review bot reads a week of member evidence (runs, picks, notes) and proposes edits to Zack's and Cora's instruction files. An approved proposal opens a pull request on `MeetRogerAI/roger`, which is **public**. The model's input is member-written text, so the model's output has to be treated as untrusted. That means trusting nothing the model says about its own edit, including what it claims it replaced.

## What Didn't Work
- **Model-supplied find-and-replace** (`old_text` → `new_text`). The model retyped curly quotes, dashes and spacing unreliably. When the copy was wrong, the code either refused good edits or matched somewhere else.
- **Stripping hidden characters and checking what was left.** Removing a zero-width joiner or a bidi isolate changes what a reader sees, but not what the line was built to do. The cleaned line passed checks that the real line would have failed.
- **Checking each hunk on its own.** A member quote split across two adjacent hunks, or a name assembled from two edits, passed every per-hunk check.
- **Trusting callers to pass `review-bot/…` and `main`.** Every new call site was one typo away from writing to another branch.

## Solution
- **Line-anchored hunks, with old text taken from the file** (`src/lib/review/hunks.ts`). The model sees the file with line numbers and answers `{ path, start_line, end_line, new_text }`. Code fills in `old_text` from those lines, so the model's copying never decides what is replaced. Ranges must be in the file and must not overlap. Each resolved `old_text` must occur exactly once (exact, then quote- and dash-normalised, always line-aligned), so it can be found again on a later `main`. A range of blank lines is widened to the nearest non-blank line. Work on LF text and fold only CRLF.
- **Discard, never strip** (`hiddenOrForeign` in `src/lib/review/safety.ts`). Added text holding a control, format, private-use, unassigned, tag or variation-selector character, or a letter from a script the base file never uses, discards the whole proposal (counted as `harm`). `stripHidden` exists only for model prose kept on a proposal for display, which is never applied.
- **Names from members' own text, not a list.** Names come from the members' account fields (name, display name, email, contributor labels) and from the evidence itself: capitalised words and runs of them that members wrote and the base file never uses (`evidenceNames`, `thirdPartySpans`). A client name nobody registered is still caught, by its shape. Quotes of eight or more words (or 40 or more characters) from evidence, privacy patterns, obfuscated emails and secrets block the proposal. A blocked proposal is stored redacted and can never be approved.
- **Whole-file checks as well as per-hunk ones.** After the hunks are spliced, the file's full added text against `main` is checked again. At approval time the code checks the whole new content going into the tree, and checks that the PR's diff matches that content exactly, whatever the body claims (`src/lib/review/approve.ts`).
- **A write gateway that refuses by branch name and base** (`guardWrite` in `src/lib/review/github.ts`). Every create, update or delete of a ref must name `^review-bot/[a-z2-7]{10}$`. A pull request's head must be such a branch, and its base must be `main`. PR numbers must be positive integers. The check runs inside the gateway on every write, so safety doesn't rely on callers. Branch protection on `main` (a required human review, from a token owned by a machine account) is the second line, not the first.
- **Keep model and member text out of logs, errors and alerts.** Errors are stored as a class name and a fixed message (`errorLabel`). GitHub errors are shown through `gitHubErrorText`, never GitHub's raw text, and never a token.

## Why This Works
Each layer removes a way for the model's output to decide something: what is replaced (line anchors), what characters reach the repo (discard), whose words reach it (evidence-derived names and quotes, checked on the whole file), and where it is written (the gateway). Nothing depends on the model following its instructions, and nothing depends on a caller remembering a rule.

## Prevention
- Test each layer with adversarial fixtures: a zero-width character inside an added word, a Cyrillic `о` in a Latin file, a member's client name in a note, a quote split across two hunks, a body whose diff disagrees with the tree, and a gateway write to `main`, to `feature/x` and with base `develop`. See `src/lib/review/safety.test.ts`, `propose.test.ts`, `approve.test.ts` and `github.test.ts`.
- Tests reach GitHub only through `src/test-helpers/fake-github.ts`. The write token is set only on Production, never on Preview.
- When adding a new write operation, add it to `WriteOp` and `guardWrite` first.

## Related
- `docs/solutions/security-issues/user-chosen-display-names-need-script-allowlist-and-a-skeleton-key-2026-11-27.md` (look-alike letters and why folding alone isn't enough)
- `docs/solutions/developer-experience/scripted-edits-mangle-escapes-and-crlf-2026-11-22.md` (CRLF and escapes in edited text)
- `docs/solutions/integration-issues/ai-sdk-7-truncated-object-throws-before-finish-reason-2026-11-23.md` (a cut-off model answer is a failed attempt)
- `docs/solutions/best-practices/fail-closed-read-log-one-statement-before-render-2026-11-28.md`
