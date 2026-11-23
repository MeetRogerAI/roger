---
title: React 19 resets a form after its action runs, bringing back stale default values
date: 2026-11-23
category: docs/solutions/ui-bugs/
module: app
component: frontend_stimulus
problem_type: ui_bug
symptoms:
  - After saving, the settings form shows the values from before the save
  - A second save silently undoes the first (a checkbox switched on comes back off)
  - On a validation error, everything the user typed is wiped
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [react-19, useActionState, server-actions, forms, defaultValue, refresh, nextjs-16]
---

# React 19 resets a form after its action runs, bringing back stale default values

## Problem
The `/app/zack` settings form used `<form action={action}>` with `useActionState` and uncontrolled fields (`defaultChecked`, `defaultValue`) set from server props. React 19 resets a form's uncontrolled fields after a form action completes. The server action did not refresh the page, so the props, and therefore the defaults, were still the values from before the save. Every field snapped back to the old values. If the user then changed one more thing and saved, the old values for everything else were written back. On a validation error the user's typing vanished the same way.

## Symptoms
- Save "Skip Marketing", then change plays per week and save: Marketing is no longer skipped.
- A rejected never-include list empties the textarea.

## What Didn't Work
- Relying on the action's success message: the reset happens regardless of what the action returns.

## Solution
1. Call `refresh()` from `next/cache` at the end of each successful server action (Next 16; only callable inside a Server Action), so the server props carry the saved values.
2. Return the values in the action state: the saved ones on success, what the user typed on an error.
3. Render the fields from `state.values ?? props.values`, inside a child keyed by those values, so the reset lands on the right defaults:

```tsx
const [state, action, pending] = useActionState(saveSettings, { status: "idle" });
const shown = state.values ?? values;
return <SettingsFields key={`${JSON.stringify(shown)}:${state.at ?? ""}`} shown={shown} state={state} action={action} pending={pending} />;
```

A controlled field (here the extra-rules textarea) is not reset, which is why the bug showed up everywhere except there.

## Why This Works
The reset restores `defaultValue`. Making the defaults equal to what should be on screen (saved or typed) turns the reset into a no-op from the user's point of view, and the key remounts the fields when those defaults change.

## Prevention
- Any form using a server action plus `defaultValue`/`defaultChecked`: refresh on success and return the submitted values on error.
- A state like "the value now in force" that is held only in `state.status === "saved"` is lost on the next action; derive it from the server props after `refresh()` (the sharing form had this bug too).
- Test it in a browser or a component test: save twice and check the first change survives.

## Related Issues
- `src/components/app/zack-controls.tsx`, `src/app/app/zack/actions.ts`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md`
