import { Reveal } from "@/components/site/shared/reveal";
import type { SampleCardCopy } from "@/data/site/copy-types";
import type { ExampleView } from "@/lib/site/sample";
import { ExampleTabs } from "./example-tabs";
import { SampleCard } from "./sample-card";
import { SectionHead } from "./section-head";

/**
 * Sections of the homepage (spec A.5): the problem, the examples, and the
 * hairline between two ground sections that are neighbours, which the reading
 * pages use too.
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

/**
 * "Cora Curation Examples", on ground (Peter's third homepage review, November 27, 2026): the heading with no
 * line under it, a row of short titles to pick an example by, and each example as a full card. One example
 * shows at a time once script is running; with none, all are in the page (ExampleTabs). The rows inside a
 * card close one another within that card only: each card's rows have their own name.
 */
export function ExamplesSection({ examples, copy, id = "examples" }: { examples: ExampleView[]; copy: SampleCardCopy & { title: string; nav: string }; id?: string }) {
  const titleId = `${id}-title`;
  if (examples.length === 0) return null;
  return (
    <section id={id} aria-labelledby={titleId} className="examples scroll-mt-14 bg-ground">
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} />
        <div className="mt-12">
          <ExampleTabs
            id={id}
            name={copy.nav}
            tabs={examples.map((example) => ({ id: example.id, label: example.label }))}
            panels={examples.map((example) => (
              <SampleCard key={example.id} idea={example.idea} copy={copy} id={`${id}-${example.id}-card`} />
            ))}
          />
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
