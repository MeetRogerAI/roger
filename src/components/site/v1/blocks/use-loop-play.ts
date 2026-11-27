"use client";

import { useReducer, useSyncExternalStore, type FocusEvent } from "react";

/**
 * What stops and starts the homepage's two loops (the hero's four parts and
 * "It compounds"), in one place so both behave the same.
 *
 * A loop stops for three things:
 *
 * - its Pause button, until Play is pressed;
 * - keyboard focus inside it. Only focus the browser shows a ring for: a
 *   button keeps focus after a mouse click, and that must not hold the loop;
 * - the tab being hidden.
 *
 * A pointer resting on a loop does not stop it. It used to, and that is what
 * made "It compounds" look as if it ended: a reader watches a loop with the
 * mouse over it, so it stopped under them, at whatever state it had reached,
 * with the button still reading "Pause" (Peter's review of the preview,
 * November 26, 2026). The Pause button is the way to stop a loop.
 *
 * The button says what it will do: "Pause" until it is pressed, then "Play".
 * Pressing Play also lets go of focus, which is on the button at that moment,
 * so the loop moves when the button says it does. Focus holds it again the
 * next time it comes in by keyboard.
 */
export type Holds = { paused: boolean; focused: boolean };

export type HoldEvent =
  | { type: "toggle" }
  | { type: "focus"; visible: boolean }
  /** `left` is whether focus went out of the loop, not to another control in it. */
  | { type: "blur"; left: boolean };

export const noHolds: Holds = { paused: false, focused: false };

export function holdsAfter(holds: Holds, event: HoldEvent): Holds {
  switch (event.type) {
    case "toggle":
      return holds.paused ? noHolds : { ...holds, paused: true };
    case "focus":
      return event.visible && !holds.focused ? { ...holds, focused: true } : holds;
    case "blur":
      return event.left && holds.focused ? { ...holds, focused: false } : holds;
  }
}

/** Whether the loop is moving: not stopped by its button, keyboard focus or a hidden tab. */
export function isPlaying(holds: Holds, tabHidden = false): boolean {
  return !holds.paused && !holds.focused && !tabHidden;
}

/**
 * One wait of a loop's clock: `advance` is called once, `ms` from now, unless
 * the returned function is called first. A loop calls this for the state it is
 * at, every time that state changes, so each state schedules the one after it
 * and nothing in the clock itself can end the loop.
 */
export function stepAfter(ms: number, advance: () => void): () => void {
  const timer = setTimeout(advance, ms);
  return () => clearTimeout(timer);
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
      onFocus: (e: FocusEvent<HTMLElement>) => send({ type: "focus", visible: e.target.matches(":focus-visible") }),
      onBlur: (e: FocusEvent<HTMLElement>) => send({ type: "blur", left: !e.currentTarget.contains(e.relatedTarget) }),
    },
  };
}
