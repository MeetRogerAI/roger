---
title: "A screen-reader label inside a sideways scroller widens the whole page unless the scroller is positioned"
date: 2026-11-27
category: docs/solutions/ui-bugs/
module: admin
problem_type: ui_bug
component: admin_tables
symptoms:
  - The page scrolls sideways although the wide table sits in an `overflow-x-auto` box
  - It shows only once the column beside the table gets narrower (the admin sidebar at 1024 pixels)
  - No visible element is wider than the window; the one that is measures 1 pixel
root_cause: wrong_assumption
resolution_type: code_fix
severity: low
tags: [layout, overflow, sr-only, position-absolute, tables, admin]
---

# A screen-reader label inside a sideways scroller widens the whole page unless the scroller is positioned

## Problem

On Needs attention the table is 72rem wide and sits in `<div class="overflow-x-auto">`. With the
admin sidebar taking 13rem, the page itself began to scroll sideways at 1024 pixels.

## Why

- Each row's note field has a label with the class `sr-only`, which is `position: absolute`.
- An absolutely placed element belongs to its nearest positioned ancestor, not to the scroller
  it is written inside. `overflow` clips and scrolls only what the box contains in that sense.
- So the label of a cell that is scrolled out of sight is not clipped by the scroller. It stays
  where the cell would be, far to the right, and the document grows to reach it.

## What to do

- Give the scroller `relative` (`src/app/admin/ops/page.tsx`). It becomes the labels' containing
  block, and they scroll and clip with the table.
- Do the same for any `overflow-x-auto` or `overflow-auto` box whose content holds `sr-only`
  text, a tooltip or anything else absolutely placed. A component rendered inside it counts:
  the label here comes from `NoteEditor`, not from the page file.
- A grid or flex child that holds a wide table also needs `min-w-0`, or the column grows to the
  table's width before the scroller is asked to scroll.
- The same search finds a different fault with the same symptom: a `<select>` with `flex-1` is
  as wide as its longest option until it has `min-w-0` (`src/app/admin/cora/page.tsx`).

## Testing

- In a browser, compare `document.documentElement.scrollWidth` with `clientWidth` on every
  screen at 375, 768, 1024 and 1280, with rows in the tables. An empty table hides it.
- To name the culprit, list the elements whose right edge is past the window and whose
  `position` is `absolute`. Do not skip an element because an ancestor scrolls: that ancestor
  is the box that was expected to hold it. Do not filter by size either; the label is 1 pixel.
- Seed long values. The select fault appeared only with a 50-character email address.
