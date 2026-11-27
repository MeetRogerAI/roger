---
title: Next 16 hides a page you navigate away from, so its "on mount" effects run again on the way back
date: 2026-11-27
category: docs/solutions/ui-bugs/
module: admin
component: frontend_stimulus
problem_type: ui_bug
symptoms:
  - A "run once when the screen opens" effect runs a second time after a client-side navigation away and back
  - State and refs from before the navigation are still there, so a ref used as "already done" or "the user left" is stale
  - Typing the owner agreed to discard is still in the form when they come back
root_cause: wrong_assumption
resolution_type: code_fix
severity: medium
tags: [nextjs-16, cache-components, activity, useEffect, useRef, forms, session-storage]
---

# Next 16 hides a page you navigate away from, so its "on mount" effects run again on the way back

## Problem
With `cacheComponents: true`, Next does not unmount a page on a client-side navigation. It wraps it in React's `<Activity>` and hides it (`display: none`), and shows it again when the user comes back (`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`). React state, refs and the DOM are kept. Effects are not: they are cleaned up when the page is hidden and run again when it is shown.

So an effect with `[]` (or a stable) dependency list is not "once per visit to this screen". It runs once per time the screen becomes visible, each time with the refs and state of the first visit.

## How it showed
The Pages editor (`src/app/admin/pages/field-editor.tsx`) keeps unsaved typing in `sessionStorage` and puts it back when the screen opens. The first version:

- read the storage in a mount effect and kept the raw value in a ref, then applied it;
- set a ref `left.current = true` when the owner confirmed "Leave without saving", to stop writing to the storage.

In a browser, on a production build: type, click a link, confirm Leave, click back to the page. The page was the same instance. The typing was still in the box, `left.current` was still `true` (so typing was never backed up again on that screen), and the restore effect ran again with the storage value read on the first visit, which would have put old text over anything typed or saved since.

Unit tests could not see any of it: they render the screen once.

## Solution
- Treat a mount effect as "runs every time the screen is shown". If something must happen once per instance, clear its input after using it (`keptAtFirst.current = null` inside the effect's work), not just guard on "has it been read".
- Do not keep "the user left" in a ref or in state. The instance outlives the leaving. Do the one-off work in the event handler (here: remove the storage entry) and let the effects start again from what is true when the screen is shown.
- Listeners added in an effect are fine: the cleanup runs when the page is hidden, so a hidden editor does not ask "leave without saving?" on another screen.
- Remember that the hidden page's DOM is still in the document. `document.getElementById` and `querySelector` can find elements of a hidden screen; ids must be unique across screens that can be alive together.

## Prevention
- Check any form or editor with a real client-side round trip in a browser: go away by a link, come back by a link and by the Back button, and look at state, messages and storage.
- When writing `useEffect(..., [])` in this repo, ask what happens the second time it runs with old refs.
