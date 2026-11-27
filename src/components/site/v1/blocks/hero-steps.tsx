"use client";

import { useEffect, useState } from "react";
import type { BrickWords } from "@/data/site/copy-types";
import { BrickStack } from "./brick-stack";
import { stepAfter, useLoopPlay } from "./use-loop-play";

/**
 * The right side of the homepage hero: how Roger works, in four steps (Peter's
 * third homepage review, November 27, 2026, which merged the homepage's "How
 * it works" section into the hero). Each step is its label (Use, Collect,
 * Curate, Deploy), its number, its headline, its text and its stack of ideas:
 * three for the first step and three more at each one after, drawn as that
 * section drew them.
 *
 * The markup is the still picture: an ordered list of the four steps, all
 * readable. That is what shows with no script and under reduced motion, and
 * nothing in it moves.
 *
 * Only once script is running and motion is allowed (html.js, in globals.css,
 * "The hero's four steps") does it become a loop: the labels become a row of
 * buttons above the frame, the frame shows one step at a time, all four in the
 * same place so its height never changes, and the step changes every few
 * seconds. It moves only while it is on screen, and stops while the keyboard's
 * focus is in it, while the tab is hidden and when "Pause" is pressed, and not
 * for a pointer resting on it (use-loop-play.ts). A label jumps to its step,
 * which then stays up for its full time. Nothing announces a change to a
 * screen reader.
 */

/** How long one step stays up: long enough to read its text. */
export const HERO_STEP_MS = 5000;

/** The step after `current`, coming back to the first after the last. */
export function nextStep(current: number, count: number): number {
  return count > 0 ? (current + 1) % count : 0;
}

/** `id` is the step's name in the copy, which never changes; a step is never known by its place in the list. */
export type HeroStep = { id: string; label: string; title: string; body: string };
export type HeroStepsCopy = { name: string; /** The name for a list that does not have NAMED_STEPS steps. */ nameAny?: string; steps: HeroStep[]; pause: string; play: string };

/** How many steps the picture's name counts ("in four parts"). */
const NAMED_STEPS = 4;

/**
 * The picture lays out by how many steps there are (an admin may add or remove one in Pages, between two and
 * five: src/lib/site/content/registry.ts). The row of buttons has one column for each. Every step's number and
 * stack share a box as tall as the LAST step's stack, which is one row of three squares for each step: 20 pixels
 * a square and 6 between rows (BrickStack, size "m"). The classes are written out so that Tailwind finds them.
 */
const tabColumns: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };
const stackHeight: Record<number, string> = { 3: "h-[72px]", 4: "h-[98px]", 5: "h-[124px]" };
/** With fewer than three steps: no shorter than the step's number beside the stack. */
const LEAST_HEIGHT = "h-[72px]";
const MOST_HEIGHT = "h-[124px]";

export function HeroSteps({ copy, words, className = "" }: { copy: HeroStepsCopy; /** The words of each idea's label in a stack. */ words: BrickWords; className?: string }) {
  const count = copy.steps.length;
  const [chosen, setCurrent] = useState(0);
  // A step that is no longer there (the list got shorter under a page that stayed open) is the first one.
  const current = chosen < count ? chosen : 0;
  const { playing, paused, toggle, stageRef, holdProps } = useLoopPlay();

  useEffect(() => {
    if (!playing || count < 2) return;
    // With reduced motion the still picture is showing, so there is nothing to advance.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    // One wait for each step, started again when the step changes: a step a label jumped to gets its full time.
    return stepAfter(HERO_STEP_MS, () => setCurrent((c) => nextStep(c, count)));
  }, [playing, current, count]);

  return (
    <div data-hero-steps data-current={current} data-playing={playing ? "yes" : "no"} className={`hero-steps w-full lg:w-[27rem] xl:w-[30rem] ${className}`} {...holdProps}>
      {/* The labels as buttons. Shown only as part of the loop: with no script they could do nothing. */}
      <div data-step-tabs role="group" aria-label={count === NAMED_STEPS || !copy.nameAny ? copy.name : copy.nameAny} className={`mb-3 hidden ${tabColumns[count] ?? "grid-cols-5"} gap-1 rounded-full border border-night-rule bg-night-2 p-1`}>
        {copy.steps.map((step, i) => (
          <button
            key={step.id}
            type="button"
            aria-current={i === current ? "step" : undefined}
            onClick={() => setCurrent(i)}
            className={`min-h-11 cursor-pointer rounded-full px-1 text-meta font-semibold transition-colors duration-[180ms] ${i === current ? "bg-night-ink text-night" : "text-night-ink-2 hover:text-night-ink"}`}
          >
            {step.label}
          </button>
        ))}
      </div>

      <div ref={stageRef} data-step-stage className="rounded-[8px] border border-night-rule bg-night-2 p-6 sm:p-8">
        <ol data-step-list className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-1">
          {copy.steps.map((step, i) => (
            <li key={step.id} data-step={i} data-active={i === current ? "yes" : "no"}>
              <span data-step-label className="mb-4 block text-meta font-semibold uppercase tracking-wider text-night-ink-2">
                {step.label}
              </span>
              {/* As tall as the last step's stack, so the numbers share a line and the stacks grow up from it. */}
              <div className={`flex ${count < 3 ? LEAST_HEIGHT : (stackHeight[count] ?? MOST_HEIGHT)} items-end justify-between gap-6`}>
                {/* Decoration: the list is ordered, so a screen reader already counts the steps. */}
                <span aria-hidden="true" data-claims="numeral" data-step-number className="tabular text-[4.5rem] font-[650] leading-[0.8] tracking-[-0.04em] text-night-ink-2/60">
                  {i + 1}
                </span>
                <BrickStack weeks={i + 1} size="m" night words={words} />
              </div>
              <h2 data-step-headline className="mt-6 text-h3">
                {step.title}
              </h2>
              <p data-step-body className="mt-3 text-body text-night-ink-2">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
        <div data-step-controls className="mt-6 hidden justify-end">
          <button
            type="button"
            data-step-pause
            onClick={toggle}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-night-rule px-4 text-meta font-semibold text-night-ink-2 transition-colors duration-[180ms] hover:text-night-ink"
          >
            {paused ? copy.play : copy.pause}
          </button>
        </div>
      </div>
    </div>
  );
}
