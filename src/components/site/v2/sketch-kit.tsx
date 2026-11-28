import { bricksPerWeek } from "@/data/site/compounding";
import type { BrickWords } from "@/data/site/copy-types";
import type { V1Copy } from "@/data/site/v1";
import type { Amounts } from "@/lib/site/amounts";
import "./placeholder.css";

/**
 * What the five v2 hero sketches share (plan U11): the props each one takes,
 * the header's links, the logo slot and the words of a brick. Nothing here has
 * a look of its own beyond the logo slot's dashed outline: each sketch styles
 * its own header, type and bricks, and no sketch imports another.
 */

/** A sketch prints the v1 words, with the amounts filled in. It never types a line of copy. */
export type SketchProps = { copy: V1Copy; amounts: Amounts };

/** The header links of a site version (spec A.3), in the copy's own words and order. */
export function navItems(copy: V1Copy): { href: string; label: string }[] {
  return copy.nav.map(({ href, label }) => ({ href, label }));
}

/**
 * Where the mark goes. The current mark is a placeholder and the owner leans
 * to a magnifying glass, so a sketch shows a neutral slot beside the word
 * "Roger" and the asset checklist decides what fills it (plan R16, R18a).
 */
export function LogoSlot({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="Logo placeholder" data-logo-slot className={`v2-logo ${className}`}>
      <span aria-hidden="true">logo</span>
    </span>
  );
}

/** The first thing the keyboard reaches: past the sketch's header to its hero. */
export function SkipLink({ to }: { to: string }) {
  return (
    <a href={`#${to}`} className="v2-skip">
      Skip to content
    </a>
  );
}

export type Brick = { week: number; idea: number; setUp: boolean; label: string };

/**
 * The bricks of the first `weeks` Mondays, three a week, oldest first. The
 * first `setUp` are set up (all of them when left out). Each carries the label
 * a screen reader hears, "Week 2, idea 3: set up", in the copy's words.
 */
export function bricksFor(words: BrickWords, weeks: number, setUp = weeks * bricksPerWeek): Brick[] {
  return Array.from({ length: weeks * bricksPerWeek }, (_, i) => {
    const week = Math.floor(i / bricksPerWeek) + 1;
    const idea = (i % bricksPerWeek) + 1;
    const done = i < setUp;
    return { week, idea, setUp: done, label: `${words.week} ${week}, ${words.idea} ${idea}: ${done ? words.setUp : words.empty}` };
  });
}

/**
 * Words the sketches were drawn with that version 1's homepage has since dropped (its third review, November 27,
 * 2026: the "How it works" section merged into the hero, the second hero link and "Who runs this" removed). The
 * sketches keep their layouts, so they keep these here. The four steps are still read from version 1's copy.
 */
export function sketchWords(copy: V1Copy) {
  return {
    secondary: { label: "See how it works", href: "#how" },
    how: { id: "how", title: "How it works", steps: copy.home.hero.graphic.steps },
    whoRuns: { title: "Who runs this", leadIn: "Roger is run by Peter Kuperman.", link: { label: "Read Peter’s letter", href: "/about" } },
    sampleLine: "This is one idea, as it arrives.",
  };
}
