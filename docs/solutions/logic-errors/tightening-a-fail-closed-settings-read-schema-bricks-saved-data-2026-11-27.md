---
title: Tightening a fail-closed settings read schema can halt every job when one saved value is out of range
date: 2026-11-27
category: logic-errors
module: settings
problem_type: logic_error
component: background_job
symptoms:
  - Narrowing v3.statsAt from any HH:MM to 08:00–12:00 would make mergeV3 reject a value that was saved earlier
  - readV3Settings would then throw SettingsUnavailable, halting every settings-gated job (Monday cora, charge and send), not only the stats email
  - A unique index on (referral_id, source_object_id) did not stop duplicate clawback rows when source_object_id was null
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components: [database, payments]
tags: [fail-closed, settings, validation, schema-tightening, postgres, null-unique-index, idempotency, ledger]
---

# Tightening a fail-closed settings read schema can halt every job when one saved value is out of range

## Problem
`src/lib/v3-settings.ts` validates all `v3.*` settings together and fails closed on read. This is deliberate: a bad money or cycle switch must stop jobs, not guess. B2 Unit 1 narrowed `v3.statsAt` to 08:00–12:00 in that same read schema. Review caught the consequence: one `statsAt` saved earlier outside the window would make every settings read throw `SettingsUnavailable`. That would halt the Monday jobs as well as the new stats email.

## Symptoms
- `mergeV3` → `v3Schema.parse` throws on a stored row that used to be valid.
- `readV3Settings` turns this into `SettingsUnavailable`, so every gated job stops.
- `saveV3Settings` reads first, so the bad row can't even be fixed from the app.

## What Didn't Work
- Narrowing the shared schema, then relying on "nobody saved an odd value". Values are stored, and a validator change reinterprets old data.

## Solution
Split the rule by direction:
- **Read** keeps accepting the old shape (any well-formed HH:MM). A value outside the new window falls back to the default ("09:00") and doesn't throw. A *malformed* value still throws, so the fail-closed guarantee holds for corrupt data.
- **Write** (`saveV3Settings`) enforces 08:00–12:00 before it reads or writes anything.
- Boundary tests on both paths: on read, 07:59 and 12:01 fall back while 08:00 and 12:00 are kept; on write, 07:59, 12:01 and 13:30 are rejected and 08:00 and 12:00 are saved.

## Why This Works
Fail-closed is meant to catch **corruption**, not **policy changes**. A tighter business rule is a policy change, so it belongs at the write boundary. Old data that is now out of policy should degrade to a safe default, scoped to that one field.

## Prevention
- Before narrowing any validator on a fail-closed read path, ask: "what happens to rows saved under the old rule?" Add a test that loads an old-rule value.
- The same applies to `zod` schemas over JSON columns and to `check` constraints added to existing tables.

## The same trap elsewhere: re-labelling saved answers (B2 Unit 1b)
Quiz question 5 moved from the v1.0 list (0–8, where 8 meant "8 or above") to v1.1 (0–9, new descriptions). The old answers still parse, so nothing failed loudly. The silent failure was in the **form**: a sign-up draft saved before the change pre-selected the same number on the new list, where it now means something else. On submit it was stamped `levelQuiz: "1.1"`, which made an ambiguous old answer look like a deliberate new one.

What fixed it:
- Stamp a version marker on every stored answer.
- Read unmarked answers as the old version.
- **Never pre-fill** an answer from an older version into a form whose options now mean something else. Leave the question blank so the person answers again.

Test both directions: an old draft renders nothing checked, and a new draft renders exactly its own choice.

## Secondary: NULLs are distinct in Postgres unique indexes
`credits_one_clawback` was unique on `(referral_id, source_object_id)`, but `source_object_id` was nullable. Postgres treats NULLs as distinct, so a clawback inserted without a source id could be inserted any number of times, and each one would become a real Stripe balance debit. The fix is a check that requires `source_object_id` for `clawback` and `lapse` rows. The alternatives are `NULLS NOT DISTINCT` or a `not null` column. Any idempotency index over a nullable column needs the same question asked.

## Related
- `docs/solutions/database-issues/data-modifying-cte-runs-even-when-insert-conflicts-2026-11-22.md`
- `docs/solutions/best-practices/test-claim-sql-on-pglite-2026-11-22.md`
- `docs/solutions/logic-errors/one-money-rule-two-mechanisms-double-charges-2026-11-23.md`
