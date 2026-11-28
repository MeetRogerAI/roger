"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { CompoundingStep } from "@/data/site/compounding";
import type { BrickWords } from "@/data/site/copy-types";
import { compoundingCaption } from "@/lib/site/compounding";
import { BrickStack } from "./brick-stack";
import { stepAfter, useLoopPlay } from "./use-loop-play";

/**
 * The moving half of "It compounds" (plan R10, KTD11; Peter's homepage
 * reviews of November 26 and 27, 2026): a loop that plays by itself through
 * the states of src/data/site/compounding.ts, each one that week's bricks and
 * its label.
 *
 * The markup is the last state: the whole stack, its week and its count, and
 * under it every state as a line of text. That is what shows with no script
 * and under reduced motion, and nothing in it moves.
 *
 * Once script is running and motion is allowed, it is a loop, and it moves
 * only while its stage (the week, the count and the stack) is on screen. The
 * first time the stage comes into view it starts from the first week. Scrolled
 * away, it waits where it was and goes on from there. Every state stays up for
 * the same time, the last one too, and then the wall fades back to the first.
 * On screen it stops while the keyboard's focus is in it, while the tab is
 * hidden and when "Pause" is pressed, and not for a pointer resting on it
 * (use-loop-play.ts). The line of the current state is marked. Nothing
 * announces a change to a screen reader: the lines under the stack already say
 * every state.
 *
 * It only says which state it is at. What that looks like, and whether
 * anything moves at all, is in globals.css ("Bricks in motion").
 */

/** How long every state stays up, the last one included: an even pace (Peter, November 27, 2026). */
export const LOOP_STATE_MS = 2200;

/** How long the whole stack is left up the first time the stage comes into view, before the loop starts from the first week. */
export const LOOP_START_MS = 700;

/** The state after `current`, coming back to the first after the last. */
export function nextState(current: number, count: number): number {
  return count > 0 ? (current + 1) % count : 0;
}

/**
 * How the bricks that arrive with the state at `current` are spread out: the
 * count already in place before it, and the wait between one new brick and the
 * next, shorter when many arrive together so a long jump still takes under a second.
 */
export function arrival(steps: readonly CompoundingStep[], current: number): { from: number; perBrickMs: number } {
  const from = current > 0 ? steps[current - 1].bricks : 0;
  const arriving = Math.max(1, steps[current].bricks - from);
  return { from, perBrickMs: Math.min(70, Math.round(800 / arriving)) };
}

export type CompoundingLoopCopy = { name: string; pause: string; play: string };

export function CompoundingLoop({ steps, words, copy, className = "" }: { steps: readonly CompoundingStep[]; words: BrickWords; copy: CompoundingLoopCopy; className?: string }) {
  const last = steps.length - 1;
  const [current, setCurrent] = useState(last);
  // Whether the loop has begun: it begins from the first week, the first time its stage is on screen.
  const [started, setStarted] = useState(false);
  const { playing, paused, toggle, stageRef, holdProps } = useLoopPlay();

  useEffect(() => {
    if (!playing || steps.length < 2) return;
    // With reduced motion the last state stays up, as it does with no script.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    if (!started) {
      return stepAfter(LOOP_START_MS, () => {
        setStarted(true);
        setCurrent(0);
      });
    }
    // One wait for each state, started again when the state changes: the last state schedules the first, so it never ends.
    return stepAfter(LOOP_STATE_MS, () => setCurrent((c) => nextState(c, steps.length)));
  }, [playing, current, started, steps.length]);

  const state = steps[current];
  const caption = compoundingCaption(words.caption, state);
  const { from, perBrickMs } = arrival(steps, current);

  return (
    <div
      role="group"
      aria-label={copy.name}
      data-loop
      data-state={current}
      data-started={started ? "yes" : "no"}
      data-playing={playing ? "yes" : "no"}
      className={`compounding-loop flex flex-col items-center ${className}`}
      style={{ "--from": from, "--per": `${perBrickMs}ms` } as CSSProperties}
      {...holdProps}
    >
      <div ref={stageRef} data-loop-stage className="flex flex-col items-center">
        {/* The state in large type. The lines under the stack say the same, so this one is hidden from a screen reader. */}
        <p aria-hidden="true" data-loop-caption className="text-center">
          <span className="tabular block text-h3">{caption.week}</span>
          <span className="tabular mt-1 block text-small text-ink-2">{caption.bricks}</span>
        </p>

        {/* Three weeks to a row on a phone, a wall on a wide screen. The whole stack keeps its place while bricks come and go. */}
        <BrickStack weeks={steps[last].week} shownWeeks={state.week} size="m" perRow={9} wide={{ size: "l", perRow: 13 }} words={words} className="mt-8" />
      </div>

      <ol data-loop-states className="mt-10 grid w-full max-w-[52rem] grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-7 sm:gap-x-4">
        {steps.map((step, i) => {
          const line = compoundingCaption(words.caption, step);
          return (
            <li key={step.week} data-loop-state={step.week} data-active={i === current ? "yes" : "no"} className="border-t-2 border-rule-strong pt-3">
              <span className="block text-small font-[600] leading-tight">{line.week}</span>
              <span className="tabular block text-meta text-ink-2">{line.bricks}</span>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        data-loop-pause
        onClick={toggle}
        className="mt-8 hidden min-h-11 cursor-pointer items-center rounded-full border border-rule-strong px-5 text-meta font-semibold text-ink-2 transition-colors duration-[180ms] hover:text-ink"
      >
        {paused ? copy.play : copy.pause}
      </button>
    </div>
  );
}
