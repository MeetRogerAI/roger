---
title: Strip private fenced blocks by pairing fences line by line, not with one regex
date: 2026-11-27
category: security-issues
module: intake
problem_type: security_issue
component: service_object
symptoms:
  - A private roger-level block in a member's report could still reach the intake model
  - An empty private block deleted the rest of the report from the model's text, so plays and stated figures vanished
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components: [assistant]
tags: [intake, markdown, fenced-block, regex, privacy, zack, roger-level, crlf]
---

# Strip private fenced blocks by pairing fences line by line, not with one regex

## Problem
Zack 2.1 adds a private ` ```roger-level ` block to reports. Intake must remove it before the text goes to the intake model, or to the stated-figures check (`statedIn`), when a run has no `roger-run` block. The first version used one regex, `/```[ \t]*(roger-[\w-]+)[^\n]*(?:\n[\s\S]*?\n[ \t]*```|[\s\S]*$)/g`. Five reviewers broke it in different ways.

## Symptoms
- **An empty block** (opener, then the closer on the next line) failed the "closed" branch, which needs two newlines. It fell into the "unclosed" branch and deleted everything after it.
- **Other fence styles leaked:** a `~~~roger-level` fence, a ` ````roger-level ` fence, and the names `Roger-Level` and `roger_level` were all left in place, so the private text reached the model.
- **An inner fence line ended the block early:** the lazy body stopped at the first ` ``` ` line inside it, and the rest of the private block leaked.
- **An unclosed private block swallowed the next block's opening line,** such as ` ```roger-run `.
- **A mention in mid-line prose matched,** because the opener wasn't anchored to the start of a line.

## What Didn't Work
- Patching the regex one case at a time, for example by making the body optional. Each fix left the others open. The core problem is that a regex can't pair a closer with its opener by character and length.

## Solution
`withoutPrivateBlocks` in `src/lib/intake/parse-block.ts` walks the lines and pairs fences the way Markdown does:
- An opener is up to three spaces, then three or more backticks or tildes, at the start of a line.
- A block closes only on a **bare** fence of the **same character** that is **at least as long** as its opener.
- The block name is the first word of the info string, lowercased, with `_` read as `-`. Every `roger-*` name other than `roger-run` and `roger-profile` is dropped.
- An unclosed private block runs to the end of the text.
- A private opener inside a kept block that was left unclosed (`roger-run` or `roger-profile`) starts a private block there.
- CRLF is handled by stripping a trailing `\r` before testing each line and keeping the original line.

In `process.ts`, the model read and `cleanPlay` (which runs `statedIn`) both get the stripped text. `parseRunBlock` still reads the raw text.

## Why This Works
Markdown fences are a small pairing grammar, not a single pattern. Pairing on character and length is what makes an inner ` ``` ` line content rather than a closer, and what lets ` ```` ` wrap a block that contains backticks. A line walker states those rules directly, and each rule gets its own test.

## Prevention
- Any filter that hides member data from a model should be tested against fence variants: an empty body, `~~~`, a longer fence with an inner fence line, mixed case or underscores, CRLF, unclosed blocks, and a fence in mid-line prose. See `src/lib/intake/parse-block.test.ts`.
- Assert on what the model **receives**, not only on its output. The intake test fake records `readRun`'s input (`calls.reports`) for this reason.
- Related: `docs/solutions/developer-experience/scripted-edits-mangle-escapes-and-crlf-2026-11-22.md` (CRLF and regex escapes).
