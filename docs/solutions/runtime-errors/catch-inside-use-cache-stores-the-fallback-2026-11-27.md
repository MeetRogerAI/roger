---
title: "A catch inside a `use cache` function stores the fallback as the answer"
date: 2026-11-27
category: docs/solutions/runtime-errors/
module: site
problem_type: runtime_error
component: cached_readers
symptoms:
  - After one dropped database connection, admin-edited text is gone from the public pages and the built-in text is back
  - It comes back by itself up to an hour later, or as soon as an admin saves anything
  - No error is logged, and every test passes
root_cause: wrong_assumption
resolution_type: code_fix
severity: medium
tags: [next16, cache-components, use-cache, cacheTag, fallback, neon]
---

# A catch inside a `use cache` function stores the fallback as the answer

## Problem

The reader behind the admin-edited questions (`getQuestionOverrides` in `src/lib/site/questions.ts`) was written
so that a public page never breaks: with no database, or on any error, it returns no edits and the page shows
the built-in wording. The `try`/`catch` that did this was inside the function marked `"use cache"`:

```ts
export async function getQuestionOverrides() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(QUESTIONS_TAG);
  try {
    return await readQuestionOverrides(query);
  } catch {
    return {};
  }
}
```

To the cache, a caught error is a successful call that returned `{}`. One failed read over HTTP was stored as
"there are no edits" for the entry's whole `revalidate` time. An answer an admin had rewritten went back to the
built-in text for up to an hour, with nothing logged.

## Why the tests missed it

In vitest `"use cache"` does nothing, so "returns `{}` when the database throws" passes either way. The fault is
only in what the cache keeps, which no unit test sees.

## Solution

The cached function throws. The catch is in a plain function around it:

```ts
async function cachedQuestionOverrides() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(QUESTIONS_TAG);
  if (!hasDb()) return {};
  return readQuestionOverrides(query);
}

export async function getQuestionOverrides() {
  try {
    return await cachedQuestionOverrides();
  } catch {
    return {};
  }
}
```

A call that throws stores nothing, so the next render reads the database again. The page still renders with the
built-in text for that one render.

## Prevention

- In a `"use cache"` function, return only what is true. Anything that stands in for a failure (an empty list,
  a default) is returned from outside the cached scope.
- "No database configured" is a true answer and may stay inside. "The database did not answer" is not.
- A test can hold the shape: the cached function's body has no `catch` (`src/lib/site/content/read.test.ts` for
  the site's words, `src/lib/settings.test.ts` for the admin's settings). The questions reader above, and its
  test, went with the Edit Questions screen.

## Done since, and still to do

- November 27, 2026 (admin-cms plan, U11): `getSettings` in `src/lib/settings.ts` had the same shape, read by the
  root layout of every page. Its cached part now throws and `getSettings` catches around it. It also reads only its
  own keys: `r.key in defaults` matched `toString` and the other names every object inherits, so a row by such a
  name would have been copied into the settings.
- November 27, 2026 (U11 review): `clearedTestimonials` in `src/lib/site/testimonials.ts` had the same shape (one
  hour), so a failed read removed the homepage's testimonials section for up to an hour. Its cached part now throws
  and `getTestimonials` catches around it; `src/lib/site/testimonials.test.ts` holds the shape.
