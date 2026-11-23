---
title: In AI SDK 7, a structured answer cut off for length throws before finishReason can be checked
date: 2026-11-23
category: docs/solutions/integration-issues/
module: intake
problem_type: integration_issue
component: tooling
symptoms:
  - A "retry with a smaller scope when the answer is cut off" branch never runs
  - Long reports fail with a generic error on every attempt, at full cost each time
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [ai-sdk, generate-text, structured-output, finish-reason, truncation, model-calls]
---

# In AI SDK 7, a structured answer cut off for length throws before finishReason can be checked

## Problem
Intake asks the model for a structured object (`generateText` with `output: Output.object(...)`) and, if the answer is cut off for length, retries with fewer plays. The first version checked `result.finishReason === "length"` after the call. With `ai@7` that line is never reached for a truncated object: `generateText` parses the output itself and throws `NoObjectGeneratedError` when the JSON is incomplete. The cut-off branch was dead code, and the fakes in our tests (which threw our own `ModelCutOff`) hid it.

## Symptoms
- The smaller-scope retry never happens; the same oversized call repeats on every attempt.
- The error reads as an ordinary failure, not "too long".

## What Didn't Work
- Checking `finishReason` on the result. There is no result when the object cannot be parsed.

## Solution
Wrap the call and map both shapes to one error:

```ts
async function call<T>(f: () => Promise<{ output: T; finishReason: string }>): Promise<T> {
  try {
    const r = await f();
    if (r.finishReason === "length") throw new ModelCutOff("cut off");
    return r.output;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e) && e.finishReason === "length") throw new ModelCutOff("cut off");
    throw e;
  }
}
```

Set an explicit `maxOutputTokens` so "too long" is a predictable outcome rather than a provider default.

## Why This Works
`NoObjectGeneratedError` carries `finishReason`, so a truncation can still be told apart from a malformed answer or a network error.

## Prevention
- Read `node_modules/ai/docs/03-ai-sdk-core/10-generating-structured-data.mdx` (error handling) before relying on result fields with structured output.
- When a test fake throws your own error class, add one test that uses the library's real error shape, or the mapping goes untested.

## Related Issues
- `src/lib/intake/model.ts` (`call`), `src/lib/intake/process.ts` (`readWithModel`)
