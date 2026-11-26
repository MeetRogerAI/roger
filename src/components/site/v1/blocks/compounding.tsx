import { compoundingFinal, compoundingSteps } from "@/data/site/compounding";
import type { BrickWords } from "@/data/site/copy-types";
import { compoundingCaption } from "@/lib/site/compounding";
import { BrickStack } from "./brick-stack";
import { CompoundingStage } from "./compounding-stage";
import { SectionHead } from "./section-head";

/**
 * "It compounds" (plan R10, KTD11): a scroll story of week 1, 2 and 3, then
 * the jump to the finished stack.
 *
 * This markup is the finished picture: the whole stack, with every step's week
 * and brick count beside it. That is what shows with no script and under
 * reduced motion, and nothing in it moves. CompoundingStage and the rules in
 * globals.css ("Bricks in motion") turn it into a story only when script is
 * running and motion is allowed.
 *
 * Every number is from src/data/site/compounding.ts, in the words of the
 * copy's brick caption. None is about time or money.
 */

/** The story's steps: every step of the data up to the finished stack. */
export const storySteps = compoundingSteps.filter((step) => step.week <= compoundingFinal.week);

/** The steps as one line of text, for a screen reader: "Week 1: 3 bricks. Week 2: 6 bricks. …" */
export function storyText(words: BrickWords): string {
  return storySteps
    .map((step) => compoundingCaption(words.caption, step))
    .map((caption) => `${caption.week}: ${caption.bricks}.`)
    .join(" ");
}

export function Compounding({ copy, words, id = "compounds" }: { copy: { title: string; line: string }; words: BrickWords; id?: string }) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-14 bg-ground-2">
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} sub={copy.line} />
        {/* The sequence in words. The labels beside the stack say the same thing, so they are hidden from a screen reader. */}
        <p className="sr-only">{storyText(words)}</p>
        <CompoundingStage className="mt-14 flex items-stretch justify-center gap-5 sm:gap-12 lg:mt-16 lg:gap-20">
          <ol aria-hidden="true" className="grid shrink-0 auto-rows-fr">
            {storySteps.map((step, i) => {
              const caption = compoundingCaption(words.caption, step);
              const next = storySteps[i + 1];
              return (
                <li key={step.week} data-step-week={step.week} className="relative flex items-center gap-3 sm:gap-4">
                  {/* The line to the next step: dashed where the story jumps ahead. */}
                  {next && <span className={`absolute left-[5px] top-1/2 h-full border-l ${next.week - step.week > 1 ? "border-dashed border-ink-2" : "border-rule-strong"}`} />}
                  <span data-step-dot className="relative size-[11px] shrink-0 rounded-[3px] border border-level-1 bg-level-1" />
                  <span className="whitespace-nowrap">
                    <span className="block text-small font-[600] leading-tight">{caption.week}</span>
                    <span className="tabular block text-meta">{caption.bricks}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {/* A tower beside the labels on a phone, a wall on a wide screen. Either way all of it is on screen as each label crosses the middle. */}
          <BrickStack weeks={compoundingFinal.week} size="m" perRow={7} wide={{ size: "l", perRow: 13 }} words={words} className="justify-end" />
        </CompoundingStage>
      </div>
    </section>
  );
}
