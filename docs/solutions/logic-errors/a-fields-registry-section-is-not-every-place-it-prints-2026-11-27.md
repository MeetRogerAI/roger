---
title: "A field's registry section is not every place a page prints it, so 'hidden' cannot be read off the registry"
date: 2026-11-27
category: docs/solutions/logic-errors/
module: site-content
problem_type: logic_error
component: release_export
symptoms:
  - With the homepage's examples switched off on preview, the release snapshot carried the release file's examples, and production's How it works took apart a different first example than preview showed
  - The examples' "copy" button wording, edited on preview, was lost from the release when only the homepage's examples were off, though How it works still printed it
  - Words of Shared printed only inside switchable sections (a price's unit and tax notes, the line under the prices) were released while every section printing them was off, making hidden text public
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [cms, release, export, hidden-section, registry, property-test, render]
---
# A field's registry section is not every place a page prints it

## Problem
The release export (`src/lib/site/content/export.ts`, plan KTD9) must carry exactly what a visitor to preview can
read: a field of a switched-off section keeps the previous release's wording, so hidden text is never made public
and nothing a page shows is lost. The first build decided "hidden" from the registry alone: a field is hidden when
the section the registry files it under is off, and a list is hidden with its section.

That is wrong wherever a page prints a field outside its own section:

- How it works takes apart the FIRST of the homepage's examples (`how-it-works.tsx`). With Home's examples off, the
  export replaced the whole list with the release file's, so production showed another example there.
- The examples card's copy button label (`sample.install.copy`, filed under Home's examples) is also How it works'.
- `price.perMonth` and the tax notes are Shared (never "off"), but only Home's Price prints them; `trialLine` is
  printed by Home's Price and by Use cases' band. With all of those off they are on no page, yet were released.

Unit tests written from the same mental model as the code all passed.

## Fix
Hidden is decided per field, by where it is PRINTED: `printedIn` maps each field printed outside its own section
to every section that prints it (hidden only when all are off), and `shownElsewhere` says How it works shows the
examples list's first item (released as the site shows it, the rest from the release file). The Pages screen's
"No visitor sees this" note uses the same `fieldHidden`.

## How it was found, and how to keep it found
`src/lib/site/content/export.render.test.tsx` renders the real page views (home, How it works, FAQ, About, the
chrome, Use cases' words) twice: with the site's release file plus its published edits, and with the export as the
only layer. Any difference is wording a release loses. Then every site-tagged wording in the export must appear in
the first rendering, or it is wording a release newly exposes (a short list of texts that show only after a press
is excepted by name). Two inputs:

- every field edited at once, with each switchable section off alone (finds single-host cases deterministically);
- generated sites (sections off and moved, list items removed, added and moved) on generated release files; 400
  sites found the multi-host `trialLine` case that single-section sweeps cannot.

The oracle is the rendered markup, not the registry, so it does not share the code's assumptions.

## Prevention
- When a view starts printing a field of another section (or stops), update `printedIn` / `shownElsewhere`; the
  render test fails otherwise.
- For any rule of the form "X is visible", test against what is rendered, not against the metadata that describes
  where things are supposed to be.
- Found on the way: `priceBlock.sub` is an editable field no page prints.
