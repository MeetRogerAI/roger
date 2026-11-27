import { Reveal } from "@/components/site/shared/reveal";
import type { SampleCardCopy } from "@/data/site/copy-types";
import type { IdeaView } from "@/lib/site/sample";
import { SampleCard } from "./sample-card";
import { SectionHead } from "./section-head";

/**
 * The sections the homepage and /agents both have, with each page's own words
 * (spec A.5, A.6): the problem, the sample idea under its one line, and the
 * hairline between two ground sections that are neighbours.
 */

/** "The problem", on ground: three statements side by side. */
export function Problem({ copy, id = "problem" }: { copy: { title: string; statements: string[] }; id?: string }) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-14 bg-ground">
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} />
        <Reveal as="ul" className="mx-auto mt-14 grid max-w-[64rem] gap-10 md:grid-cols-3 md:gap-12">
          {copy.statements.map((statement) => (
            <li key={statement} className="border-t border-rule-strong pt-6">
              <p className="text-lead">{statement}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/** "What arrives on Monday", on ground: the sample card under its one line. */
export function SampleSection({ idea, copy, id = "sample" }: { idea: IdeaView; copy: SampleCardCopy & { title: string; line: string }; id?: string }) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-14 bg-ground">
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} sub={copy.line} />
        <div className="mt-14">
          <SampleCard idea={idea} copy={copy} />
        </div>
      </div>
    </section>
  );
}

/** Between two ground sections that are neighbours, so one does not run into the next. */
export function Hairline() {
  return (
    <div data-hairline className="bg-ground">
      <div className="wrap">
        <hr className="border-rule" />
      </div>
    </div>
  );
}
