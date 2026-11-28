---
title: "Draft Mode read inside `use cache` gives the prerender's answer on a client-side navigation"
date: 2026-11-27
category: docs/solutions/runtime-errors/
module: site
component: cached_readers
problem_type: runtime_error
symptoms:
  - An admin's preview of the drafts shows the drafts on the page it opens, then the published content after one click on a link to the homepage
  - A full reload of the same address shows the drafts again
  - Unit tests pass; vitest does not run `"use cache"` or the resume data cache
root_cause: wrong_assumption
resolution_type: code_fix
severity: medium
tags: [next16, cache-components, use-cache, draft-mode, ppr, resume-data-cache, preview]
---

# Draft Mode read inside `use cache` gives the prerender's answer on a client-side navigation

## Problem

The Pages preview (plan U9) followed the Draft Mode guide's Cache Components pattern: the cached content reader
read `(await draftMode()).isEnabled` inside its `"use cache"` scope and returned it beside the published content,
and the plain function around it read the drafts when that was true. The docs say `isEnabled` is readable there
and that in Draft Mode "all cached functions re-execute on every request".

That holds for a document request. It does not hold for a client-side navigation (an RSC request) to a partially
prerendered route (`◐ /` here) with `cacheComponents` on. Next 16.4 then resumes the render with the **resume data
cache** of the stored prerender, Draft Mode or not:

- `node_modules/next/dist/build/templates/app-page-runtime.js`, "RDC for Navigations": the stored entry's
  `postponed` data is used for `isDynamicRSCRequest`, with no `isDraftMode` check.
- `node_modules/next/dist/server/use-cache/use-cache-wrapper.js`: a hit in the resume data cache is served
  before `shouldForceRevalidate` (which is where Draft Mode forces a re-run) is consulted.

So the cached reader answered from what the prerender stored, where Draft Mode is always off. The preview lost
its drafts on the first click to the homepage.

## Solution

Ask Draft Mode per request, in the plain function **outside** the cached one, and keep the cached function free
of anything about the request (`src/lib/site/content/read.ts`):

```ts
async function cachedPublished() {
  "use cache";
  cacheLife(/* … */);
  cacheTag(CONTENT_TAG);
  // published content only: no draftMode, no cookies, no admin check
}

export async function getSiteContentView() {
  const published = /* await cachedPublished(), with the catch outside (see the catch-inside-use-cache lesson) */;
  if (await previewAsked()) {            // (await draftMode()).isEnabled, false when there is no request
    const draft = await draftForAdmin(); // React cache(); isAdmin() then a plain query, never a shared cache
    if (draft) return { content: draft, preview: true };
  }
  return { content: published, preview: false };
}
```

Reading `draftMode()` outside `use cache` does not cost a static shell: during a prerender Next hands the render
an empty Draft Mode (`server/request/draft-mode.js`, case `'prerender'`), and reading it is not a dynamic access.
The build's route table and every public page's `Cache-Control` / `x-nextjs-cache` were identical before and after
(U9 review, HEAD build against the worktree build).

Draft content passed into another cached function is still safe: with `workStore.isDraftMode` the wrapper neither
saves the entry nor joins another request's fill (`use-cache-wrapper.js`, "When draft mode is enabled, we must not
save the cache entry", and `skipCrossRequestDedupe`).

## Prevention

- With `cacheComponents` and Partial Prerendering, treat "a cached function sees this request's Draft Mode" as
  true for document requests only. Anything that must follow the request (Draft Mode, who is viewing) is read
  outside every `"use cache"` scope.
- A test holds the shape: the cached function's body mentions no `draftMode`, `isAdmin`, `cookies` or draft read
  (`src/lib/site/content/read.test.ts`).
- Check a preview in a browser on a production build with a **client-side** link into a `◐` route, not only by
  opening the address; `next dev` and unit tests do not use the resume data cache.
