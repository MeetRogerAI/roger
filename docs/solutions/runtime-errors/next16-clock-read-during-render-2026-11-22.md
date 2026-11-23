---
title: "Next 16 Cache Components: reading the clock during render throws \"unstable value new Date()\""
date: 2026-11-22
category: docs/solutions/runtime-errors/
module: auth
problem_type: runtime_error
component: authentication
symptoms:
  - "Route \"/auth/confirm\": Next.js encountered the unstable value `new Date()` while prerendering."
  - The error appears in the dev console even though the page awaits searchParams inside Suspense
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [nextjs-16, cache-components, connection, prerender, new-date, suspense]
---

# Next 16 Cache Components: reading the clock during render throws "unstable value new Date()"

## Problem
`/auth/confirm` checks whether a sign-in token is still live. `tokenIsLive(q, token, now = new Date())` reads the clock through a default parameter. With `cacheComponents: true`, Next.js 16 treats a clock read during render as a prerender hazard and logs an error, even though the component sits inside `<Suspense>` and awaits `searchParams`.

## Symptoms
- Dev console: `Route "/auth/confirm": Next.js encountered the unstable value new Date() while prerendering. ... add a dynamic data access (e.g. await connection()) before this call`.
- The page still renders, so the bug is easy to miss without reading the console.

## What Didn't Work
- Relying on `await searchParams` to make the subtree dynamic. Next validates the prerender path too, so the clock read is still flagged.

## Solution
Call `await connection()` from `next/server` before anything that reads the clock or randomness during render:

```tsx
async function Confirm({ searchParams }: { searchParams: PageProps<"/auth/confirm">["searchParams"] }) {
  const { t } = await searchParams;
  await connection(); // the token check reads the clock: always at request time
  const live = hasDb() && token ? await tokenIsLive(query, token) : false;
```

## Why This Works
`connection()` tells Next the rest of the component must run per request, so it is excluded from prerendering. Reading `cookies()` first has the same effect, which is why `findSession(..., now = new Date())` in the access check did not trigger the error.

## Prevention
- Library functions here take `now` as a parameter (`src/lib/clock.ts`, sessions, tokens). Any page that calls one without first reading cookies or headers needs `await connection()` first.
- After adding a page, load it in dev with a clean console and look for "unstable value". The build alone did not report this one.
- Server actions and route handlers are not affected; only render paths are.

## Related Issues
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`
- `src/app/auth/confirm/page.tsx`
