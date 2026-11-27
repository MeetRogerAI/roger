---
title: "An inline script that applies stored state before hydration leaves dead controls if React is late or never arrives"
date: 2026-11-27
category: docs/solutions/ui-bugs/
module: admin
problem_type: ui_bug
component: admin_sidebar
symptoms:
  - A group folded by the inline script cannot be opened when the page's scripts are slow or fail to load
  - The server's markup has every group open, so the page looks safe without script, but it is not
root_cause: wrong_assumption
resolution_type: code_fix
severity: low
tags: [hydration, inline-script, localstorage, useSyncExternalStore, suspense, admin]
---

# An inline script that applies stored state before hydration leaves dead controls if React is late or never arrives

## Problem

The admin sidebar remembers which groups are folded in `localStorage`. To avoid a flash on reload, an
inline `<script>` after the list folds the stored groups as the markup is read (`hidden` on the list,
`aria-expanded="false"` on the heading). React then reads the same value through
`useSyncExternalStore` and takes over.

"With no script every group is open" was true and tested. The gap is between the two scripts: the
inline one has run and React has not. A folded group's heading is a button with no handler, so its
links cannot be reached. If the bundle fails to load, that lasts for the life of the page.

## Why the obvious fixes are wrong

- **A full toggle in the inline script.** After hydration React re-renders with the stored value and
  writes only the attributes whose value changed between its two renders. A list the script left
  `hidden` that React believes open is never corrected: `false` to `false` writes nothing, and
  `suppressHydrationWarning` means nobody is told. Anything the early script does must be something
  React will redo, or something React's next render overwrites.
- **Relying on the handler everywhere before hydration.** Once React's root is live but the
  `<Suspense>` boundary holding the sidebar has not hydrated, React's own listener at the root stops
  a click inside that boundary before it reaches any listener lower in the page. An early handler
  works only until React's root exists. Measured in headless Chrome: with the framework chunks served
  from cache and the rest held back, the press did nothing; with every chunk held back, it worked.

## Fix

In `src/components/admin-ui.tsx`, the inline script also listens for clicks on the menu and:

- acts only while its own `<script>` tag is still in the page. The tag is rendered only while the
  server snapshot is in use, so React removing it is the signal that React has the stored value;
- only ever opens a folded group, and takes the heading out of the stored list, so React agrees when
  it arrives. Opening is self-correcting: if the write fails, React folds the group again;
- registers nothing when storage cannot be read, since then it folded nothing.

The React side toggles from what is stored at the moment of the press, not from the value its last
render read. A press handled by a render that still held the server snapshot would otherwise store
that one heading and forget the others.

## How to check

`src/components/admin-ui.test.tsx` runs the script text against a stand-in page: folding, opening on
a press, the stored value afterwards, and going quiet once the tag is disconnected. In a browser,
block `*/_next/static/chunks/*.js` (DevTools request blocking), reload with two groups stored as
folded, and press a folded heading: it opens.

## Rule of thumb

A script that changes server markup before hydration creates a state React did not render. Give every
control it disables a way to work without React, make that path only move towards the server's
markup, and tie its off-switch to something React itself removes.
