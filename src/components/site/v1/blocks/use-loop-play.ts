"use client";

import { useReducer, useSyncExternalStore, type FocusEvent, type PointerEvent } from "react";

/**
 * What stops and starts the homepage's two loops (the hero's four parts and
 * "It compounds"), in one place so both behave the same.
 *
 * A loop stops for four things:
 *
 * - its Pause button, until Play is pressed;
 * - a mouse pointer resting on it. Only a mouse: a finger has no way to
 *   leave, so a tap would stop the loop for good with nothing saying so;
 * - keyboard focus inside it. Only focus the browser shows a ring for: a
 *   button keeps focus after a mouse click, and that must not hold the loop
 *   once the pointer has gone;
 * - the tab being hidden.
 *
 * The button says what it will do: "Pause" until it is pressed, then "Play".
 * Pressing Play also lets go of the pointer and of focus, which are both on
 * the button at that moment, so the loop moves when the button says it does.
 * They hold it again the next time the pointer or focus comes in.
 */
export type Holds = { paused: boolean; hovered: boolean; focused: boolean };

export type HoldEvent =
  | { type: "toggle" }
  | { type: "pointerenter"; pointerType: string }
  | { type: "pointerleave" }
  | { type: "focus"; visible: boolean }
  /** `left` is whether focus went out of the loop, not to another control in it. */
  | { type: "blur"; left: boolean };

export const noHolds: Holds = { paused: false, hovered: false, focused: false };

export function holdsAfter(holds: Holds, event: HoldEvent): Holds {
  switch (event.type) {
    case "toggle":
      return holds.paused ? noHolds : { ...holds, paused: true };
    case "pointerenter":
      return event.pointerType === "mouse" ? { ...holds, hovered: true } : holds;
    case "pointerleave":
      return holds.hovered ? { ...holds, hovered: false } : holds;
    case "focus":
      return event.visible && !holds.focused ? { ...holds, focused: true } : holds;
    case "blur":
      return event.left && holds.focused ? { ...holds, focused: false } : holds;
  }
}

/** Whether the loop is moving: not stopped by its button, the pointer, focus or a hidden tab. */
export function isPlaying(holds: Holds, tabHidden = false): boolean {
  return !holds.paused && !holds.hovered && !holds.focused && !tabHidden;
}

function watchVisibility(changed: () => void) {
  document.addEventListener("visibilitychange", changed);
  return () => document.removeEventListener("visibilitychange", changed);
}

export function useLoopPlay() {
  const [holds, send] = useReducer(holdsAfter, noHolds);
  const tabHidden = useSyncExternalStore(
    watchVisibility,
    () => document.hidden,
    () => false,
  );
  return {
    playing: isPlaying(holds, tabHidden),
    /** Whether the button has been pressed to stop the loop: the button then reads "Play". */
    paused: holds.paused,
    /** For the Pause and Play button. */
    toggle: () => send({ type: "toggle" }),
    /** For the element that holds the whole loop. */
    holdProps: {
      onPointerEnter: (e: PointerEvent<HTMLElement>) => send({ type: "pointerenter", pointerType: e.pointerType }),
      onPointerLeave: () => send({ type: "pointerleave" }),
      onFocus: (e: FocusEvent<HTMLElement>) => send({ type: "focus", visible: e.target.matches(":focus-visible") }),
      onBlur: (e: FocusEvent<HTMLElement>) => send({ type: "blur", left: !e.currentTarget.contains(e.relatedTarget) }),
    },
  };
}
