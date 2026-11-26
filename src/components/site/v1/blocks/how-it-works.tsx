import type { CSSProperties } from "react";
import { Reveal } from "@/components/site/shared/reveal";
import type { BrickWords } from "@/data/site/copy-types";
import { BrickStack } from "./brick-stack";
import { SectionHead } from "./section-head";

/**
 * "How it works", a night chapter (spec A.5): numbered steps, each a large
 * pale numeral above a short title (spec 0.7), with the brick stack one week
 * taller at every step.
 *
 * The numeral is decoration: the list is ordered, so a screen reader already
 * counts the steps.
 */
export function HowItWorks({ copy, words, id = "how" }: { copy: { title: string; steps: { title: string; body: string }[] }; words: BrickWords; id?: string }) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="on-night scroll-mt-14 bg-night text-night-ink">
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} night />
        <Reveal as="ol" className="mt-16 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map((step, i) => (
            <li key={step.title}>
              {/* As tall as the last step's stack, so the four numerals share a line and the stacks grow up from it. */}
              <div className="bricks-grow flex items-end sm:h-[98px]" style={{ "--step": i } as CSSProperties}>
                <BrickStack weeks={i + 1} size="m" night words={words} />
              </div>
              <p aria-hidden="true" className="tabular mt-8 text-[clamp(3.5rem,6vw,5rem)] font-[650] leading-none tracking-[-0.04em] text-night-ink-2/60">
                {i + 1}
              </p>
              <h3 className="mt-4 text-title">{step.title}</h3>
              <p className="mt-3 text-body text-night-ink-2">{step.body}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
