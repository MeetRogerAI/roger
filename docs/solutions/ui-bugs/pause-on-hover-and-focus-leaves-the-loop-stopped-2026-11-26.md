---
title: "Pause on hover and focus: the loop stays stopped on touch and after a click, while the button says Pause"
date: 2026-11-26
category: docs/solutions/ui-bugs/
module: site
problem_type: ui_bug
component: auto_playing_loops
symptoms:
  - On a phone, one tap on an auto-playing block stops it for good
  - After a mouse click on Pause then Play, the loop does not move until focus goes elsewhere
  - The button reads "Pause" while nothing is moving
  - The browser check passes, because it used element.click() and blur()
root_cause: wrong_assumption
tags: [animation, accessibility, touch, focus-visible, testing]
---

## Problem

The homepage's two self-playing blocks (the hero steps and "It compounds") stopped while the
pointer was over them or focus was inside them. Both could end up stopped with no way to tell.

## Why

- A tap fires `mouseenter` and never a matching `mouseleave`, so a hover hold taken on touch is
  never released.
- A button keeps focus after a mouse click, so a focus hold outlives the click that caused it.
- A keyboard user who presses Play still has focus on the button, so the focus hold cancels the
  press.

## What to do

- Take the hover hold only when `pointerType === "mouse"`.
- Take the focus hold only for `:focus-visible` focus (keyboard), not for focus left by a click.
- Pressing Play releases every hold. The button's label is derived from whether the timer is
  actually running, never from the user's last press alone.
- Hold while the tab is hidden.
- Put this in one shared hook (`src/components/site/v1/blocks/use-loop-play.ts`) so every loop
  behaves the same.

## Testing

Use real input in the browser check: mouse moves and clicks, touch taps and the Tab key sent
through the DevTools protocol. `element.click()` followed by `blur()` cannot show this fault.
A related trap when listing what Tab can reach: `getClientRects()` is non-empty for content
inside a closed `<details>`; use `checkVisibility()`.
