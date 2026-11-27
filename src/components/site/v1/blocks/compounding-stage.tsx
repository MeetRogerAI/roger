"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The script half of the "It compounds" scroll story (plan KTD11). The markup
 * it wraps is the finished picture. Once this is running, and only while the
 * whole story is still below the screen, it marks the wrapper `is-staged`.
 * From then on a step is shown when its label crosses the middle of the
 * screen: the step's label and every brick up to its week get `is-in`. Nothing
 * is ever taken back, so a step already shown stays shown on the way back up.
 *
 * It never stages a story the visitor can already see or has scrolled past (a
 * reload part-way down the page, a link to a later section): that one stays
 * the finished picture, with no blank frame and no replay. And if the observer
 * says nothing within STAGE_FAILSAFE_MS of staging, the staging is taken off
 * again, so a stack is never left hidden.
 *
 * It only adds classes and one delay per brick. What those classes look like,
 * and whether anything moves at all, is in globals.css ("Bricks in motion"),
 * under prefers-reduced-motion: no-preference. With reduced motion, or with no
 * script, the finished picture stays as it is.
 */

// Bricks that arrive drop one after another; a long run before them fills in quickly.
const ARRIVING = 3;
const DROP_MS = 110;
const FILL_MS = 900;

/** How long the observer has to report after staging before the staging is taken off. */
export const STAGE_FAILSAFE_MS = 1000;

/**
 * The delay before one of `count` bricks shown together starts to move, by its
 * place among them (0 is the lowest). The last three drop one after another;
 * any before them fill in over FILL_MS, and the three wait for that.
 */
export function delayFor(place: number, count: number): number {
  const filling = Math.max(0, count - ARRIVING);
  if (place < filling) return Math.round((place * FILL_MS) / filling);
  return (filling > 0 ? FILL_MS + 200 : 0) + (place - filling) * DROP_MS;
}

/**
 * Whether to stage the story: only while all of it is still below the screen.
 * On screen, or already scrolled past, it stays the finished picture.
 */
export function shouldStage(rect: { top: number }, viewportHeight: number): boolean {
  return viewportHeight > 0 && rect.top >= viewportHeight;
}

/** What the story reads from one of the observer's entries. */
export type StepEntry = {
  target: unknown;
  isIntersecting: boolean;
  boundingClientRect: { top: number };
  /** The observed area, which ends at the middle of the screen. Null where the browser does not report it. */
  rootBounds: { bottom: number } | null;
};

/**
 * How many steps these entries say have been reached: the place, counted from
 * one, of the last step whose label is above the middle of the screen, whether
 * still on screen or already scrolled past. Zero when none is. `middle` is used
 * for an entry that does not carry its own root bounds.
 */
export function reachedStep(entries: readonly StepEntry[], steps: readonly unknown[], middle: number): number {
  let reached = 0;
  for (const e of entries) {
    const line = e.rootBounds ? e.rootBounds.bottom : middle;
    if (e.isIntersecting || e.boundingClientRect.top < line) reached = Math.max(reached, steps.indexOf(e.target) + 1);
  }
  return reached;
}

/** The count of steps shown after `reached` is reported. It only ever goes up. */
export function shownAfter(shown: number, reached: number): number {
  return Math.max(shown, reached);
}

export function CompoundingStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    // No observer: nothing is staged, and the finished picture stays.
    if (!el || !("IntersectionObserver" in window)) return;
    const steps = [...el.querySelectorAll<HTMLElement>("[data-step-week]")];
    const bricks = [...el.querySelectorAll<HTMLElement>("[data-brick]")];
    if (steps.length === 0) return;
    if (!shouldStage(el.getBoundingClientRect(), window.innerHeight)) return;
    let shown = 0;
    let heard = false;

    const showUpTo = (count: number) => {
      if (count <= shown) return;
      const week = Number(steps[count - 1].dataset.stepWeek);
      const fresh = bricks.filter((b) => !b.classList.contains("is-in") && Number(b.dataset.week) <= week);
      fresh.forEach((b, place) => {
        b.style.setProperty("--d", `${delayFor(place, fresh.length)}ms`);
        b.classList.add("is-in");
      });
      for (const step of steps.slice(shown, count)) step.classList.add("is-in");
      shown = count;
    };

    // The observed area ends at the middle of the screen, so a label "enters" as it crosses the middle.
    const io = new IntersectionObserver(
      (entries) => {
        heard = true;
        showUpTo(shownAfter(shown, reachedStep(entries, steps, window.innerHeight / 2)));
      },
      { rootMargin: "0px 0px -50% 0px" },
    );
    const unstage = () => {
      io.disconnect();
      el.classList.remove("is-staged");
    };
    el.classList.add("is-staged");
    for (const step of steps) io.observe(step);
    // An observer always reports once, straight after it starts. One that has not is not going to drive the story.
    const failsafe = window.setTimeout(() => {
      if (!heard) unstage();
    }, STAGE_FAILSAFE_MS);
    return () => {
      window.clearTimeout(failsafe);
      // Never leave a stack staged with nothing watching it. What was shown keeps its `is-in`.
      unstage();
    };
  }, []);

  return (
    <div ref={ref} className={`compounding ${className}`}>
      {children}
    </div>
  );
}
