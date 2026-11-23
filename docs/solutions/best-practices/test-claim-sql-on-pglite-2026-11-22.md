---
title: Test claim-first SQL against an in-process Postgres, not mocks
date: 2026-11-22
category: docs/solutions/best-practices/
module: data
problem_type: best_practice
component: testing_framework
severity: high
applies_when:
  - Code relies on a single SQL statement for correctness (insert ... on conflict ... returning, conditional update ... returning)
  - The database driver has no interactive transactions (Neon over HTTP)
  - A test would otherwise mock the sql function
tags: [pglite, vitest, neon, claims, idempotency, at-most-once, testing]
last_updated: 2026-11-23
---

# Test claim-first SQL against an in-process Postgres, not mocks

## Context
The v3 app has no interactive transactions (Neon over HTTP), so "send this email once", "use this link once" and "count this attempt" each rest on one SQL statement. A mocked `sql` proves nothing about that statement. In Phase 0, tests that ran the real SQL on PGlite caught three bugs the mocks would have passed:
- A test SQL string copied by hand drifted from the real rate-limit query.
- The testimonial seed relied on its caller to run only once; the statement did not.
- The rate counter could come back as a string from some drivers, which breaks a `count <= limit` comparison.

## Guidance
- Write claim code against a small query type, not the driver's tagged template:
  ```ts
  export type Query = <T>(text: string, params?: unknown[]) => Promise<T[]>;
  ```
  Production passes `sql.query`. Tests pass PGlite's `db.query(...).rows` (`src/test-helpers/pglite-db.ts`).
- `testDb()` applies `db/schema.sql` with the same splitter `db/setup.mjs` uses, so tests also prove the schema file still applies.
- Test the race directly: `Promise.all([claim(), claim()])` must yield exactly one winner.
- Keep SQL that both the app and tests use in one exported constant or function (`counterFor(q)`, `SEED_TESTIMONIALS_SQL`). Never re-type it in a test.
- Convert numeric results with `Number(...)` before comparing.

Vitest-specific: a `vi.fn()` whose returned promise rejects is reported as an unhandled rejection, even when the code under test catches it, and the test fails. For "the database is down" cases, mock with a plain function that throws, not `vi.fn().mockRejectedValue(...)`.

## Why This Matters
These statements are where money and email are kept to "exactly once". A bug there means double charges, double emails or a dead sign-in link. Mocks show the code calls something; only real SQL shows the something works.

## When to Apply
Charges, notifications, sign-in tokens, picks, rate limits, and any `on conflict` or `update ... where ... returning` logic.

## Examples
```ts
const { query } = await testDb();
const r = await Promise.all([consumeToken(query, tok), consumeToken(query, tok)]);
expect(r.filter(Boolean)).toHaveLength(1);
```
Each `testDb()` gives a fresh database. Applying the whole schema per test grew to several seconds as the schema grew, and with every test file running in parallel the `beforeEach` hooks began timing out at 10 s (2026-11-23). The helper now applies the schema once per test worker, keeps it with `db.dumpDataDir("none")`, and starts each test from `new PGlite({ loadDataDir: snapshot })`. `vitest.config.ts` also allows 30 s for hooks. A timed-out hook is a setup-speed problem, not a test failure: check the durations before suspecting the code.

## Related
- `src/test-helpers/pglite-db.ts`, `src/lib/db-query.ts`
- `src/lib/mail/send.test.ts`, `src/lib/auth/auth-core.test.ts`, `src/lib/rate-limit.pg.test.ts`, `db/setup-rules.test.ts`
