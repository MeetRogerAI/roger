---
title: "The page you left is still in the document: page-keyed selectors and path-keyed chrome both leak"
date: 2026-11-26
category: docs/solutions/ui-bugs/
module: site
problem_type: ui_bug
component: site_preview_sketches
symptoms:
  - After a click from one page to another, the second page has the first page's body background
  - A fresh load of the second page looks right, so tests on rendered markup pass
  - A not-found page at a hidden address has no site header or footer
root_cause: wrong_assumption
tags: [next16, cache-components, css-has, client-navigation, not-found, layout]
---

## Problem

Two things went wrong in the version 2 hero sketches (plan unit U11), and both came from deciding
something about the whole page from a clue that outlives, or precedes, the page it describes.

1. Each sketch set the body background with `html:has([data-sketch="N"]) body { … }`. After a client
   click from a sketch to `/pricing`, the body kept the sketch's colour.
2. The site header and footer were left off any address starting `/site-preview/hero/`. In
   production those addresses are not-found pages, and they lost their header and footer too.

## Why

1. With Next 16 and `cacheComponents`, the page a visitor leaves by a client click stays in the
   document, hidden, so the back button is instant. Any selector of the form
   `html:has([marker-of-page-A])` therefore still matches on page B. A full load of page B does not
   have page A in it, which is why `renderToStaticMarkup` tests and screenshots of fresh loads
   never see the fault. The v1 acceptance notes had already recorded the same thing for
   `[data-site]`; it was written again anyway.
2. The header and footer are client components that looked only at the path. The browser cannot
   read `VERCEL_ENV`, so "is this address really a sketch here?" cannot be answered from the path.

## What to do

- Style a page from its own wrapper element, never from `html:has(…)`, `body` or `:root`. If the
  whole viewport must take a colour, give the wrapper `min-height` and its own background.
- If the look of shared chrome depends on whether a gated page is being served, compute the gate on
  the server (the root layout) and pass it down as a prop that defaults to "not served".
- Match gated paths exactly (one segment, known values), not by prefix.
- A unit test cannot see the first fault. Guard it with a test that reads the stylesheets and
  refuses `html`, `body`, `:root` and `:has(` selectors, and check it once in a browser by clicking
  from the page to another one and reading the body's computed background.

## Where this matters next

Plan decision KTD13 keys the version 2 theme on `html:has([data-site="v2"])`. That selector has
this fault. Unit U12 must scope the theme to the site wrapper, or set the marker on `<html>` from
the server for the whole deployment, which is fixed at build time and so cannot go stale.
