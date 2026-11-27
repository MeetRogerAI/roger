"use client";

import { useEffect, useState, type CSSProperties } from "react";

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
 * and the part changes every few seconds. It stops while the pointer is over
 * it, while anything in it has focus, and when "Pause" is pressed. A label
 * jumps to its part. Nothing announces a change to a screen reader.
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

/** Whether the loop is moving: not paused by its button, the pointer or focus. */
export function isPlaying(state: { paused: boolean; hovered: boolean; focused: boolean }): boolean {
  return !state.paused && !state.hovered && !state.focused;
}

export type HeroStepsCopy = { name: string; labels: string[]; pause: string; play: string };

// The four parts in the four level colours of the night chapters (globals.css), in the order of the bricks' own palette.
const brick = ["bg-f-reach-night", "bg-f-ease-night", "bg-f-proof-night", "bg-f-surprise-night"];

export function HeroSteps({ copy, headlines, className = "" }: { copy: HeroStepsCopy; /** The headline of each part, from the "How it works" copy. */ headlines: string[]; className?: string }) {
  const count = Math.min(copy.labels.length, headlines.length);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const playing = isPlaying({ paused, hovered, focused });

  useEffect(() => {
    if (!playing || count < 2) return;
    // With reduced motion the still picture is showing, so there is nothing to advance.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const timer = window.setInterval(() => setCurrent((c) => nextStep(c, count)), HERO_STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing, count]);

  return (
    <div
      data-hero-steps
      data-current={current}
      data-playing={playing ? "yes" : "no"}
      className={`hero-steps w-full lg:w-[27rem] ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
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
            onClick={() => setPaused((p) => !p)}
            className="hidden min-h-11 cursor-pointer items-center gap-2 rounded-full border border-night-rule px-4 text-meta font-semibold text-night-ink-2 transition-colors duration-[180ms] hover:text-night-ink"
          >
            {paused ? copy.play : copy.pause}
          </button>
        </div>
      </div>
    </div>
  );
}
