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

export type HeroStep = { label: string; title: string; body: string };
export type HeroStepsCopy = { name: string; steps: HeroStep[]; pause: string; play: string };

export function HeroSteps({ copy, words, className = "" }: { copy: HeroStepsCopy; /** The words of each idea's label in a stack. */ words: BrickWords; className?: string }) {
  const count = copy.steps.length;
  const [current, setCurrent] = useState(0);
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
      <div data-step-tabs role="group" aria-label={copy.name} className="mb-3 hidden grid-cols-4 gap-1 rounded-full border border-night-rule bg-night-2 p-1">
        {copy.steps.map((step, i) => (
          <button
            key={step.label}
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
            <li key={step.label} data-step={i} data-active={i === current ? "yes" : "no"}>
              <span data-step-label className="mb-4 block text-meta font-semibold uppercase tracking-wider text-night-ink-2">
                {step.label}
              </span>
              {/* As tall as the last step's stack, so the numbers share a line and the stacks grow up from it. */}
              <div className="flex h-[98px] items-end justify-between gap-6">
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
