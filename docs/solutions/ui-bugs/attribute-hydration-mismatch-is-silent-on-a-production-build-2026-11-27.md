---
title: A hydration mismatch in an attribute is silent on a production build, so "no console error" there proves nothing
date: 2026-11-27
category: docs/solutions/ui-bugs/
module: site
component: frontend_stimulus
problem_type: ui_bug
symptoms:
  - A browser check on `next build` and `next start` reports a clean console, and `next dev` reports "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties" on the same page
  - The warning names a `className="is-in"` on a block marked `data-reveal`
  - It appears only once a block has been moved to the top of its page
root_cause: wrong_assumption
resolution_type: code_fix
severity: low
tags: [hydration, nextjs-16, react-19, data-reveal, next-dev, browser-checks, sections]
---

# A hydration mismatch in an attribute is silent on a production build, so "no console error" there proves nothing

## Problem
U6 lets the owner move a page's sections. The browser check ran on a production build, moved sections on every covered page, and found nothing in the console. The same pages under `next dev` reported a hydration mismatch on `/library` as soon as the watch block ("Not in the library yet?") was the first thing on the page.

React reports a mismatch in an attribute only in development. On a production build it keeps the server's attribute and says nothing. A clean console on `next start` is therefore evidence about thrown errors and about text mismatches that force a client render, and about nothing else.

## Cause
`src/components/reveals.tsx` adds the class `is-in` to every `[data-reveal]` block as it comes on screen, from an observer, outside React. In the built-in order the watch block is far down the page and is marked long after hydration. Moved to the top, it is on screen at once, and it is marked before the part of the page that holds it has hydrated: the DOM then has `class="is-in"` where React's tree has no class.

Nothing breaks. React leaves a mismatched attribute as it finds it, so the block stays revealed. But `next dev` says so on every load, and a real mismatch reported beside it would be easy to miss.

## Solution
`suppressHydrationWarning` on the one element whose class the observer owns (`src/app/library/page.tsx`, the `#final-cta` block). It covers that element's own attributes only, not its children.

## Prevention
- When a change lets content appear somewhere new (a moved section, a new first block), load the page under `next dev` too and read the console. The production build cannot show this class of fault.
- Any element whose attributes a script outside React writes before hydration can finish (`data-reveal`, anything an inline script touches) needs `suppressHydrationWarning` once it can be on screen at first paint.
- Before trusting anything seen under `next dev` in this worktree, delete `.next`. Started on top of the output of an earlier `next build`, `next dev` here reloaded the page about ten times a second (484 requests for `/about` in 45 seconds), so every reading was taken mid-load: empty pages, ids counted twice while a streamed part was still arriving. With `.next` removed the same sources loaded once. The same sources in a fresh checkout never looped.

## Related
- `docs/solutions/ui-bugs/inline-script-before-hydration-leaves-dead-controls-2026-11-27.md`: the other cost of a script that runs ahead of React.
- `docs/solutions/ui-bugs/next16-hidden-page-runs-mount-effects-again-2026-11-27.md`
