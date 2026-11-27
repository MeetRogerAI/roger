---
title: "The not-found page is one cached shell, so a header that branches on `usePathname()` is rendered for someone else's address"
date: 2026-11-27
category: docs/solutions/runtime-errors/
module: site
problem_type: runtime_error
component: site_header
symptoms:
  - React error 418 (hydration mismatch, text) in the console on a not-found page
  - Which unknown addresses show it changes from one build, and one five minutes, to the next
  - Before its scripts run, a not-found page can show the header of another kind of page (no navigation and no start button, or the admin's links)
  - The page looks right in the end, because React throws the server markup away and renders again in the browser
root_cause: wrong_assumption
resolution_type: known_issue
severity: medium
tags: [next16, cache-components, not-found, hydration, usePathname, revalidate, site-header]
---

# The not-found page is one cached shell, so a header that branches on `usePathname()` is rendered for someone else's address

## Problem

After `/admin/sample` was deleted, opening it logged React error 418. It was reported first as
"every not-found page", then measured as "only unknown addresses under `/admin`". Both were true,
at different minutes.

## Why

- With `cacheComponents`, an address that matches no route is answered with the one stored
  `/_not-found` shell. `curl` returns byte-identical HTML for `/nothing-here` and `/admin/sample`.
- That shell holds the root layout, and so `SiteHeader`, whose links come from
  `navFor(usePathname())` (`src/components/site-header.tsx`). The stored header is the one for
  whatever path the shell was rendered with.
- In the browser `usePathname()` is the address in the address bar. When `navFor` gives that
  address a different header from the stored one, React reports the mismatch and renders the
  whole document again.
- The shell is not fixed at build time. `.next/prerender-manifest.json` gives `/_not-found`
  `initialRevalidateSeconds: 300`, because the layout's readers are cached for five minutes. When
  it is stale, the next request for an unknown address regenerates it, and that request's path
  can decide the header. Measured twice on one build: a request for `/start/zzz` on a stale
  shell left every not-found page with the sign-up header (no links, no start button), so
  `/nothing-here` failed to hydrate and `/signin/nothing` did not. Five minutes later a request
  for `/admin/zzz` put the ordinary header back (not the admin's; why was not found out). With
  the ordinary header in the shell it is `/admin/sample` and `/start/nothing` that fail, and
  `/nothing-here` that does not.
- So one visitor's (or crawler's) mistyped address decides the header every other visitor's
  not-found page arrives with, for at least five minutes.
- Next's docs name the mechanism for rewrites (`use-pathname.md`, "Avoid hydration mismatch
  with rewrites"): the first value comes from the stored render and may not be the browser's path.

## What to do

Not fixed as of November 27, 2026. It is older than the admin sidebar, it is in the public
header, and the repo has no test environment with a DOM to hold a change to how that header
hydrates. The fix, when it is made:

- The header must hydrate with what the shell was rendered for, and only then follow the
  browser's path: write the rendered path into the markup, read it back as the server snapshot
  of a `useSyncExternalStore`, and the mismatch becomes an ordinary re-render. Reading the path
  in an effect on every page would flash the header on every page.
- Better still, a not-found page should not have a path-dependent header at all: the shell
  cannot know the address, so it should always carry the site's ordinary navigation.
- Do not branch a root-layout client component on `usePathname()` for a new path prefix without
  opening an unknown address under that prefix, and one outside it, and reading the console.

## Testing

- Compare the served HTML with the page after hydration: fetch the address, read
  `document.documentElement.outerHTML` in headless Chrome, and find the first tag that differs.
  That named the header's links in one step. The minified error says only "text".
- Compare the served HTML with `.next/server/app/_not-found.html` too. When they differ, the
  shell has been regenerated since the build, and a result from ten minutes ago no longer holds.
- A result on one unknown address says nothing about another. Check one under each prefix
  `navFor` treats specially (`/admin`, `/start`, `/signin`, `/auth`) and one under none.
- `renderToStaticMarkup` tests cannot see this: they render once, with one path.
