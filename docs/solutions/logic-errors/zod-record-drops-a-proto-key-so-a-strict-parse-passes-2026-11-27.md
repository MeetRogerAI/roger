---
title: "zod's `z.record` leaves out a `__proto__` key without an error, so a strict parse passes what it should refuse"
date: 2026-11-27
category: docs/solutions/logic-errors/
module: site
problem_type: logic_error
component: site_content
symptoms:
  - A file held to "every key must be known" passes its check while holding a key the check never saw
  - The parsed value has one entry fewer than the file, and nothing says so
root_cause: wrong_assumption
resolution_type: code_fix
severity: low
tags: [zod, z.record, strictObject, proto, prototype-pollution, json, validation, cms]
---

# zod's `z.record` leaves out a `__proto__` key without an error, so a strict parse passes what it should refuse

## Problem

The release file of the site's content (`src/data/site/released.json`) is read by `parseOverlayStrict` in
`src/lib/site/content/format.ts`. Its promise is that nothing is dropped without a word: an entry the code does
not know is a reported problem, because a dropped entry in that file is wording silently lost at a release.

The shape is checked with zod, and the three maps of the overlay are `z.record(...)`:

```ts
text: z.record(z.string().max(PATH_MAX), z.string().max(TEXT_MAX)),
```

After the schema passed, the function walked `Object.entries(parsed.text)` and reported each id the registry did
not have. A file with `"text": { "__proto__": "x" }` came back `{ ok: true }` with an empty `text`.

## Why

`JSON.parse` gives `__proto__` as an ordinary own key of the object. zod 4 (4.6.7 here) guards against prototype
pollution, and does it differently per schema:

| Schema | An own `__proto__` key in the input |
|---|---|
| `z.strictObject({...})` | refused: `Unrecognized key: "__proto__"` |
| `z.object({...})` | stripped, like any unknown key |
| `z.record(key, value)` | **left out of the output, and the parse succeeds** |

So the check that ran on the parsed value never met the key. Every other odd name (`constructor`, `toString`,
`hasOwnProperty`) is kept by `z.record` and was reported correctly, which is why tests on those names passed.

## Solution

Compare the keys that were written with the keys the schema kept, on the raw value, once the shape has passed:

```ts
const written = value as Record<"text" | "sections" | "lists", Record<string, unknown>>;
for (const part of ["text", "sections", "lists"] as const) {
  for (const key of Object.keys(written[part])) if (!Object.hasOwn(overlay[part], key)) problems.push(`${part}.${key}: not a name anything can have`);
}
```

The lenient reader needed no change: it looks each key up in a `Map` and builds a new object from known ids only.

## Prevention

- A parse that promises "nothing unknown gets through" must be tested with the input as it arrives, through
  `JSON.parse('{"__proto__": ...}')`. An object literal `{ __proto__: x }` in a test sets the prototype and has
  no such key, so it tests nothing.
- When the keys of a `z.record` matter, do not reason from the parsed value alone. Either compare the key sets as
  above, or refuse the name in the key schema's place by checking the raw value first.
- The test is "rejects a key that names the prototype" in `src/lib/site/content/format.test.ts`.
