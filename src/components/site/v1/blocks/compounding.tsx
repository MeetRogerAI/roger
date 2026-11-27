import { compoundingSteps } from "@/data/site/compounding";
import type { BrickWords } from "@/data/site/copy-types";
import { CompoundingLoop, type CompoundingLoopCopy } from "./compounding-loop";
import { SectionHead } from "./section-head";

/**
 * "It compounds" (plan R10, KTD11): a loop that plays by itself through seven
 * weeks, each one that week's bricks and its label (Peter's homepage review,
 * November 26, 2026; before that it was a scroll story of four).
 *
 * What the server sends is the last state, the whole stack, with every state
 * as a line of text under it. CompoundingLoop and the rules in globals.css
 * ("Bricks in motion") turn it into a loop only when script is running and
 * motion is allowed.
 *
 * Every number is from src/data/site/compounding.ts, in the words of the
 * copy's brick caption. None is about time or money.
 */
export function Compounding({ copy, words, id = "compounds" }: { copy: { title: string; line: string; loop: CompoundingLoopCopy }; words: BrickWords; id?: string }) {
  const titleId = `${id}-title`;
  return (
    // data-claims: the one place the week numbers and brick counts may be printed (src/lib/site/claims.ts).
    <section id={id} aria-labelledby={titleId} className="scroll-mt-14 bg-ground-2" data-claims="compounding">
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} sub={copy.line} />
        <CompoundingLoop steps={compoundingSteps} words={words} copy={copy.loop} className="mt-14 lg:mt-16" />
      </div>
    </section>
  );
}
