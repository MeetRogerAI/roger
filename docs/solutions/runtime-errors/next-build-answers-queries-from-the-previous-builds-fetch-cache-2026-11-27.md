---
title: "`next build` answers a database query made inside `use cache` from the previous build's fetch cache"
date: 2026-11-27
category: docs/solutions/runtime-errors/
module: site
problem_type: runtime_error
component: database_client
symptoms:
  - Right after a build, some prerendered pages show the site's words, prices or settings as they were at an earlier build, and other pages of the same build show today's
  - The build makes no query, or far fewer than it has workers, although every page reads the database
  - It heals by itself at each page's first regeneration, five minutes later, or when an admin saves
  - Every test passes, and `next start` on its own never shows it
root_cause: wrong_assumption
resolution_type: code_fix
severity: medium
tags: [next16, cache-components, use-cache, fetch-cache, neon, build, prerender]
---

# `next build` answers a database query made inside `use cache` from the previous build's fetch cache

## Problem

Every public page reads the database through a function marked `"use cache"` (the site's published words in
`src/lib/site/content/read.ts`, the amounts, the settings, the testimonials, the library). The Neon driver sends
each query as an HTTP `POST` with `fetch`, and says nothing about caching.

At request time Next leaves such a fetch alone. During `next build` it does not. In
`node_modules/next/dist/server/lib/patch-fetch.js`:

```js
// We don't enable automatic no-cache behavior during build-time
// prerendering so that we can still leverage the fetch cache between
// export workers.
if (workStore.isBuildTimePrerendering) {
  isImplicitBuildTimeCache = true;
}
```

So while it prerenders, Next stores the answer of every query made inside a `"use cache"` function in
`.next/cache/fetch-cache`, keyed by the address and the body (the SQL and its parameters), `POST` or not. The
folder outlives the build. The next build that finds it there prerenders from those answers and does not ask the
database.

Seen on this repo, with a local Postgres behind the driver:

- A build with the content row holding one headline. Then the row was replaced by another headline and the build
  run again: no query reached the database, and every prerendered page held the first headline.
- A build made 23 minutes after another one that had used a different database: `/`, `/faq`, `/how-it-works`,
  `/library` and `/privacy` were prerendered with the other database's content, `/about`, `/terms` and `/zack`
  with the right one. Two of eleven workers asked the database; the rest were handed the old answers.

The entry is the whole answer of the statement, so the file for the content row also held the unpublished draft
(base64 inside JSON, on the build machine's disk only, never in a response).

What a visitor sees: for the first five minutes after a deploy (each page's revalidation time), a page can show
wording or prices from the previous deploy. The regeneration that follows runs in the server, where the fetch is
not cached, and the page is right again.

Whether a host restores `.next/cache/fetch-cache` between builds decides whether this happens there. Vercel keeps
`.next/cache` between builds of a project. It was reproduced here only locally, where the folder simply stays.

## Why nothing caught it

- In vitest there is no build and no patched `fetch`.
- A check that builds once against a fresh database passes: the entries of an earlier build are for other SQL, or
  the folder is empty.
- The page is right again within minutes, so it looks like a slow deploy.

## Solution

The database client opts out, in the one place every query goes through (`src/lib/db.ts`):

```ts
export const sql = neon(process.env.DATABASE_URL ?? "postgres://missing", { fetchOptions: { cache: "no-store" } });
```

An explicit `no-store` is not an "implicit build-time cache" fetch. Inside a `"use cache"` function it does not
make anything dynamic (`markCurrentScopeAsDynamic` returns at once in a cache scope), and the function's own
result is still cached with its `cacheLife` and `cacheTag`. After the change the same two builds each asked the
database (once in each worker that needed it), the pages held the row as it was at that build, nothing new was
written to `fetch-cache`, and the route table was the same as before, line for line.

## Prevention

- Caching belongs to the `"use cache"` function, which has a lifetime and a tag an admin's save can expire. A
  second, untagged cache underneath it, that no `updateTag` reaches, is never wanted for a database.
- Any other client that reaches a data source with `fetch` from inside `"use cache"` needs the same option: an
  HTTP API read for a public page has the same exposure.
- To see it: build twice with the data changed in between, and count the queries the second build makes.
  `src/lib/db.test.ts` holds only that the option is passed.
