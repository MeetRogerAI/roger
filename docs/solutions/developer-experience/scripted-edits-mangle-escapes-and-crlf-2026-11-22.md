---
title: Scripted file edits turn escape sequences into raw control characters and miss CRLF text
date: 2026-11-22
category: docs/solutions/developer-experience/
module: tooling
problem_type: developer_experience
component: tooling
severity: high
applies_when:
  - Editing TypeScript, SQL or JSON from a Python or Node script, a heredoc, or sed
  - The text being written contains backslash escapes (regexes, \u sequences, \t, \n)
  - The target file was checked out by git on Windows (it may have CRLF line endings)
tags: [escapes, regex, crlf, windows, heredoc, python, node, sed, edit-tool]
---

# Scripted file edits turn escape sequences into raw control characters and miss CRLF text

## Context
During Phase 0 of the v3 app, a Python `str.replace` script rewrote `src/lib/auth/tokens.ts` to add a regex with `\x00-\x20` and `\s`. Python decoded those escapes inside its own string literal, so the file received real NUL, tab and newline bytes. `file` then reported the TypeScript file as `data`, and the Write tool refused to overwrite it ("File has NUL bytes"). The same session, Node replace scripts failed with "missing:" on files git had checked out with CRLF endings (`src/app/admin/actions.ts`, `db/setup.mjs`), because the search text used `\n`.

An older note in auto memory records the same trap for `\uXXXX` in JSON-LD (auto memory [claude]).

## Guidance
- Prefer the Edit and Write tools for any change containing a backslash. They write the text literally.
- In code, avoid escape-heavy regex literals where a plain check reads as well. For example, test character codes in a loop (`c <= 32 || c === 127 || c === 92`) instead of `/[\\\x00-\x20\x7f]/`.
- When a script is unavoidable, build special characters at runtime (`String.fromCharCode(9)`), use raw strings (`r"..."` in Python, `String.raw` in JS), and keep the script ASCII-only.
- Before matching multi-line text in a script, check endings: `grep -c $'\r' file`. Normalise in the script (`s.replace(/\r\n/g, "\n")`) or use the Edit tool, which matches either.
- After any scripted edit, verify: `file <path>` must say "text", and `git diff` must show only the intended lines.
- If a file was corrupted with NUL bytes, delete it and rewrite it with Write. The Write tool will not overwrite a file it reads as binary.

## Why This Matters
A corrupted source file fails the build in confusing places, or worse, compiles with a regex that means something else. A silent CRLF miss makes a script exit early. With a loop of several replacements, earlier ones may already be written before the failing one (a Node script that wrote `src/lib/auth/cookies.ts` and then failed on the next file left a half-applied change).

## When to Apply
- Any automated or bulk edit of source files, especially regexes, escapes or multi-line blocks.
- Rename sweeps with `sed -i` across many files: check the match list first. In this session a sweep meant for `src/lib/auth/` also rewrote `src/lib/email.ts` to import from the wrong module.

## Examples
Before (Python wrote raw control bytes into the file):
```python
s = s.replace(old, '''/[\\\\\\x00-\\x20\\x7f]/''')
```
After (no regex escapes to mangle):
```ts
function hasUnsafeChar(path: string): boolean {
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c <= 32 || c === 127 || c === 92) return true;
  }
  return false;
}
```
Test data built the same way: `"/" + String.fromCharCode(9) + "/evil.test"`.

## Related
- `src/lib/auth/tokens.ts` (`safeNext`)
