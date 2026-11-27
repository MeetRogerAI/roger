---
title: "A feature switch's module holds only the read; anything derived from it lives in the callers"
date: 2026-11-27
category: docs/solutions/best-practices/
module: billing
problem_type: best_practice
component: plan_switch
symptoms:
  - A test mocks the switch on, and code under test still behaves as if it were off
  - The test passes or fails for the wrong reason, with no error
root_cause: test_isolation
tags: [vitest, vi.mock, feature-switch, billing]
---

## Problem

`src/lib/billing/offered.ts` reads the launch switch `plans.oneAtATimeOffered`. Tests turn it on
with `vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig()), oneAtATimeOffered: () => true }))`.
A helper added to that same module, which called `oneAtATimeOffered()` itself, kept calling the
real function, so those tests silently ran with the launch value.

## Why

`vi.mock` replaces the module's exports as other modules see them. A function inside the module
that calls a sibling by its local name does not go through the exports, so it never sees the mock.

## What to do

- Keep the switch module to the bare read, one exported function and nothing that calls it.
- Put wording or behaviour derived from the switch in the modules that use it (the email helper
  now lives in `src/lib/mail/templates/charges.ts`).
- When a switch gates money, enforce it at every server entry point, including the step that
  finishes a flow someone started before the switch changed (here, the card step after Stripe's
  page). Hiding the button is not the gate.
