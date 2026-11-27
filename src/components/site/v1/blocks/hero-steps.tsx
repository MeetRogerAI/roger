"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useLoopPlay } from "./use-loop-play";

/**
 * The picture beside the homepage headline (Peter's homepage review,
 * November 26, 2026): the four parts of "How it works", one headline at a
 * time, under a row of four labels, Use, Collect, Curate and Deploy.
 *
 * The markup is the still picture: a list of the four parts, each its label
 * and its headline, all readable. That is what shows with no script and under
 * reduced motion, and nothing in it moves.
 *
 * Only once script is running and motion is allowed (html.js, in globals.css,
 * "The hero's four parts") does it become a loop: the labels become a row of
 * buttons above the frame, the frame shows the current part's headline alone,
 * and the part changes every few seconds. It stops while a mouse is over it,
 * while the keyboard's focus is in it, while the tab is hidden and when
 * "Pause" is pressed (use-loop-play.ts). A label jumps to its part, which
 * then stays up for its full time. Nothing announces a change to a screen
 * reader.
 *
 * The four bricks under the headline are decoration: one for each part, lit
 * up to the current one. In the still picture all four are lit.
 */

/** How long one part stays up. */
export const HERO_STEP_MS = 3200;

/** The part after `current`, coming back to the first after the last. */
export function nextStep(current: number, count: number): number {
  return count > 0 ? (current + 1) % count : 0;
}

export type HeroStepsCopy = { name: string; labels: string[]; pause: string; play: string };

// The four parts in the four level colours of the night chapters (globals.css), in the order of the bricks' own palette.
const brick = ["bg-f-reach-night", "bg-f-ease-night", "bg-f-proof-night", "bg-f-surprise-night"];

export function HeroSteps({ copy, headlines, className = "" }: { copy: HeroStepsCopy; /** The headline of each part, from the "How it works" copy. */ headlines: string[]; className?: string }) {
  const count = Math.min(copy.labels.length, headlines.length);
  const [current, setCurrent] = useState(0);
  const { playing, paused, toggle, holdProps } = useLoopPlay();

  useEffect(() => {
    if (!playing || count < 2) return;
    // With reduced motion the still picture is showing, so there is nothing to advance.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    // One wait for each part, started again when the part changes: a part a label jumped to gets its full time.
    const timer = window.setTimeout(() => setCurrent((c) => nextStep(c, count)), HERO_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, current, count]);

  return (
    <div
      data-hero-steps
      data-current={current}
      data-playing={playing ? "yes" : "no"}
      className={`hero-steps w-full lg:w-[27rem] ${className}`}
      {...holdProps}
    >
      {/* The labels as buttons. Shown only as part of the loop: with no script they could do nothing. */}
      <div data-step-tabs role="group" aria-label={copy.name} className="mb-3 hidden grid-cols-4 gap-1 rounded-full border border-night-rule bg-night-2 p-1">
        {copy.labels.slice(0, count).map((label, i) => (
          <button
            key={label}
            type="button"
            aria-current={i === current ? "step" : undefined}
            onClick={() => setCurrent(i)}
            className={`min-h-11 cursor-pointer rounded-full px-1 text-meta font-semibold transition-colors duration-[180ms] ${i === current ? "bg-night-ink text-night" : "text-night-ink-2 hover:text-night-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-[8px] border border-night-rule bg-night-2 p-6 sm:p-8">
        <ol data-step-list className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {headlines.slice(0, count).map((headline, i) => (
            <li key={headline} data-step={i} data-active={i === current ? "yes" : "no"}>
              <span data-step-label className="block text-meta font-semibold uppercase tracking-wider text-night-ink-2">
                {copy.labels[i]}
              </span>
              <span data-step-headline className="mt-1 block text-title">
                {headline}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex items-center justify-between gap-4">
          {/* Decoration: one brick for each part, lit up to the current one. */}
          <ul aria-hidden="true" data-step-bricks className="flex gap-2">
            {brick.slice(0, count).map((colour, i) => (
              <li key={colour} data-lit={i <= current ? "yes" : "no"} style={{ "--i": i } as CSSProperties} className={`size-8 rounded-[8px] ${colour}`} />
            ))}
          </ul>
          <button
            type="button"
            data-step-pause
            onClick={toggle}
            className="hidden min-h-11 cursor-pointer items-center gap-2 rounded-full border border-night-rule px-4 text-meta font-semibold text-night-ink-2 transition-colors duration-[180ms] hover:text-night-ink"
          >
            {paused ? copy.play : copy.pause}
          </button>
        </div>
      </div>
    </div>
  );
}
