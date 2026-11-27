import { Fragment, type ReactNode } from "react";
import { Reveal } from "@/components/site/shared/reveal";
import type { SampleCardCopy, TextItem } from "@/data/site/copy-types";
import { siteRegistry, type Ground } from "@/lib/site/content/registry";
import type { ExampleView } from "@/lib/site/sample";
import { ExampleTabs } from "./example-tabs";
import { SampleCard } from "./sample-card";
import { SectionHead } from "./section-head";

/**
 * Sections of the homepage (spec A.5): the problem, the examples, and the
 * hairline between two ground sections that are neighbours, which the reading
 * pages use too.
 */

/**
 * The columns of a row of short items (the problem's statements, the control block's points), by how many there
 * are: three side by side as built, and up to six as two rows of three (an admin may add and remove them in
 * Pages). One, two and four get columns of their own count, so no row is left with a hole in it. The classes are
 * written out so that Tailwind finds them.
 */
export function itemColumns(count: number): string {
  if (count === 1) return "max-w-[40rem] gap-10 md:grid-cols-1 md:gap-12";
  if (count === 2 || count === 4) return "max-w-[48rem] gap-10 md:grid-cols-2 md:gap-12";
  return "max-w-[64rem] gap-10 md:grid-cols-3 md:gap-12";
}

/** "The problem", on ground: three statements side by side. */
export function Problem({ copy, id = "problem" }: { copy: { title: string; statements: TextItem[] }; id?: string }) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-14 bg-ground">
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} />
        {/* An admin may remove every statement (Pages): then the section is its heading alone. */}
        {copy.statements.length > 0 && (
          <Reveal as="ul" className={`mx-auto mt-14 grid ${itemColumns(copy.statements.length)}`}>
            {copy.statements.map((statement) => (
              <li key={statement.id} className="border-t border-rule-strong pt-6">
                <p className="text-lead">{statement.text}</p>
              </li>
            ))}
          </Reveal>
        )}
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

/**
 * The same line for two neighbours on one of the other two backgrounds. The built-in order has no such pair: it
 * takes an admin moving a section, or switching one off, to put two night chapters (or two ground-2 ones) side by
 * side. The line is the background's own rule colour, so the two read as two chapters and not as one tall block.
 */
function Seam({ ground }: { ground: "night" | "ground-2" }) {
  return (
    <div data-seam={ground} className={ground === "night" ? "bg-night" : "bg-ground-2"}>
      <div className="wrap">
        <hr className={ground === "night" ? "border-night-rule" : "border-rule-strong"} />
      </div>
    </div>
  );
}

/** One section of a page, ready to print: its id in the registry, the background it is painted on, and its markup. */
export type PagePart = { id: string; ground: Ground | null; node: ReactNode };

/**
 * A page's sections in the order given, with a line between two neighbours on the same background (plan U6):
 * the hairline between two ground sections, as the built-in order has always had, and its like between two night
 * chapters or two ground-2 ones. Neighbours on different backgrounds get nothing: the change of colour is the break.
 *
 * Hand it only the sections that print something: one that is switched off, or has nothing to show, is no
 * neighbour. A part with no ground (null) never gets a line on either side.
 */
export function InOrder({ parts }: { parts: PagePart[] }) {
  return parts.map((part, i) => {
    const before = i > 0 ? parts[i - 1].ground : null;
    return (
      <Fragment key={part.id}>
        {before !== null && before === part.ground && (part.ground === "ground" ? <Hairline /> : <Seam ground={part.ground} />)}
        {part.node}
      </Fragment>
    );
  });
}

/**
 * A page's sections that are on, in the page's order, as parts to print. `shown` is sectionsShown's answer, and
 * `nodes` each section's markup by its id in the registry: null for one that has nothing to print (no testimonial
 * is cleared), which is then no part at all. The grounds are the registry's.
 */
export function pageParts(pageId: string, shown: readonly string[], nodes: Record<string, ReactNode>): PagePart[] {
  const sections = siteRegistry.pages.find((page) => page.id === pageId)?.sections ?? [];
  return shown.flatMap((id) => {
    const section = sections.find((entry) => entry.id === id);
    const node = Object.hasOwn(nodes, id) ? nodes[id] : null;
    return section && node !== null && node !== undefined && node !== false ? [{ id, ground: section.ground, node }] : [];
  });
}
