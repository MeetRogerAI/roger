---
title: "A publish that trims the draft to what is shown loses what Undo and Put back need"
date: 2026-11-27
category: docs/solutions/logic-errors/
module: site-content
problem_type: logic_error
component: pages_editor
symptoms:
  - After publishing a list item's removal and undoing that publish, "Put back" brings the item back with its original wording, not the edited wording the site shows again
  - The review then lists that item's text as changing from the edited wording back to the original
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [cms, draft, publish, undo, overlay, two-sided-state]
---
# A publish that trims the draft to what is shown loses what Undo and Put back need

## Problem
The Pages editor's draft keeps the wording of a list item it has removed, so that "Put back" restores the item
as it was edited. That wording is on no page, so publish (`src/lib/site/content/store.ts`) stores only what the
draft shows (`shownOverlay`). The U7 build also wrote that trimmed overlay back as the draft:
`{ draft: shown, published: shown, previous }`.

Undo restores `published` from `previous` and, by design, leaves the draft alone. So after
edit, publish, remove, publish, Undo, the site showed the item with the edited wording again, the draft still
said "removed" and no longer held the wording, and "Put back" returned the original wording. The review then
offered to publish the edited text back to the original, a silent revert of a live edit.

## Why
Two transitions that each look right on their own: publish trims hidden state from the draft, Undo restores
one side only (`published`). Any state that exists only in the draft, and that Undo can make relevant again,
must survive the publish.

## Solution
Publish makes live what the draft shows and leaves the draft as it is:
`{ draft: now.draft, published: shownOverlay(base, now.draft), previous: now.published }`.
"Nothing is waiting" is then `sameOverlay(shownOverlay(base, draft), published)`, never `sameOverlay(draft,
published)`; the publish action and `publish` already compare that way. The Pages counts read what the draft
shows (`pageStatus` skips wording of removed items), so the kept wording is not counted as an edit.

Test: `src/lib/site/content/lists.test.ts`, "puts back an item, after its removal was published and undone,
with the wording the site shows for it again".

## Prevention
- When a draft holds state the site does not show (kept wording, a switched-off section's text), list every
  transition that can bring it back into view (Put back, Undo, switching a section on) and test each one after a
  publish.
- Compare "anything waiting?" on what would be shown, not on the stored overlays.
