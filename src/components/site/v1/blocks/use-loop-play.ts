"use client";

import { useEffect, useReducer, useState, useSyncExternalStore, type FocusEvent } from "react";

/**
 * What stops and starts the homepage's two loops (the hero's four parts and
 * "It compounds"), in one place so both behave the same.
 *
 * A loop moves only while it is on screen: while at least half of its stage
 * is in the window, or the stage fills at least half of the window (Peter's
 * third homepage review, November 27, 2026: "It should only move forward when
 * I am on that part of the page"). Scrolled away, it waits at the state it
 * had reached and goes on from there when the reader comes back, so nobody
 * arrives in the middle of a state or at the wrap.
 *
 * On screen, a loop stops for three things:
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

/** Whether the loop is moving: on screen, and not stopped by its button, keyboard focus or a hidden tab. */
export function isPlaying(holds: Holds, tabHidden = false, onScreen = true): boolean {
  return onScreen && !holds.paused && !holds.focused && !tabHidden;
}

/** The share of the stage that must be in the window, and the share of the window a tall stage must fill, to count as on screen. */
export const ON_SCREEN_SHARE = 0.5;

/**
 * Whether a stage counts as on screen. `ratio` is the share of the stage that
 * is in the window. A stage taller than the window can never show half of
 * itself, so filling half of the window counts too.
 */
export function isOnScreen(ratio: number, visibleHeight: number, windowHeight: number): boolean {
  if (ratio <= 0) return false;
  return ratio >= ON_SCREEN_SHARE || (windowHeight > 0 && visibleHeight >= windowHeight * ON_SCREEN_SHARE);
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

// Enough steps that a stage taller than the window still reports as it comes and goes.
const SHARES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/** Whether `stage` is on screen now. False until the browser has said so, and for a stage that is not in the page. */
function useOnScreen(stage: HTMLElement | null): boolean {
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    if (!stage || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) setOnScreen(isOnScreen(entry.intersectionRatio, entry.intersectionRect.height, entry.rootBounds?.height ?? window.innerHeight));
      },
      { threshold: SHARES },
    );
    observer.observe(stage);
    return () => {
      observer.disconnect();
      // A page left by a click stays in the document, hidden: its loop must not be left believing it is on screen.
      setOnScreen(false);
    };
  }, [stage]);
  return onScreen;
}

export function useLoopPlay() {
  const [holds, send] = useReducer(holdsAfter, noHolds);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const onScreen = useOnScreen(stage);
  const tabHidden = useSyncExternalStore(
    watchVisibility,
    () => document.hidden,
    () => false,
  );
  return {
    playing: isPlaying(holds, tabHidden, onScreen),
    /** Whether the button has been pressed to stop the loop: the button then reads "Play". */
    paused: holds.paused,
    /** Whether the stage is on screen. */
    onScreen,
    /** For the Pause and Play button. */
    toggle: () => send({ type: "toggle" }),
    /** The `ref` of the stage: the part of the loop that has to be on screen for it to move. */
    stageRef: setStage,
    /** For the element that holds the whole loop. */
    holdProps: {
      onFocus: (e: FocusEvent<HTMLElement>) => send({ type: "focus", visible: e.target.matches(":focus-visible") }),
      onBlur: (e: FocusEvent<HTMLElement>) => send({ type: "blur", left: !e.currentTarget.contains(e.relatedTarget) }),
    },
  };
}
