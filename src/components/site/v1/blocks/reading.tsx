import type { ReactNode } from "react";
import { StartLink } from "@/components/site/shared/start-link";
import { SectionHead } from "./section-head";

/**
 * What the three reading pages share (spec A.8 to A.10): /how-it-works, /faq
 * and /about. A page heading, a section of running text and the start button
 * a page ends on.
 *
 * A reading page's h1 is set in the size of a section heading, so the
 * headings under it take the next size down.
 */

/** The heading that opens a reading page, on ground. The first section's own space follows it. */
export function PageHead({ title, id = "page" }: { title: string; id?: string }) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="bg-ground">
      <div className="wrap pt-16 md:pt-24">
        <SectionHead id={titleId} title={title} as="h1" />
      </div>
    </section>
  );
}

const widths = { text: "max-w-[40rem]", head: "max-w-[44rem]", wide: "max-w-[60rem]" };

/**
 * One section of a reading page, on ground: a centred heading about 44rem
 * wide, and under it one column. Long-form text is 40rem wide (spec 0.7);
 * `head` and `wide` are for two columns side by side and for the annotated card.
 */
export function ReadingSection({ id, title, width = "text", children }: { id: string; title: string; width?: keyof typeof widths; children: ReactNode }) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-14 bg-ground">
      <div className="wrap py-16 md:py-20">
        <h2 id={titleId} className="mx-auto max-w-[44rem] text-center text-h3">
          {title}
        </h2>
        <div className={`mx-auto mt-10 ${widths[width]}`}>{children}</div>
      </div>
    </section>
  );
}

/**
 * The start button a reading page ends on, a night chapter: the primary
 * button with the card line under it. No audience is given, so the link
 * carries the one remembered from the homepage or the free Zack run (plan KTD9, AE11).
 */
export function StartBand({ start, cardLine }: { start: string; cardLine: string }) {
  return (
    <div data-start-band className="on-night bg-night text-night-ink">
      <div className="wrap py-20 text-center md:py-24">
        <StartLink className="btn btn-l">{start}</StartLink>
        <p className="mt-5 text-meta text-night-ink-2">{cardLine}</p>
      </div>
    </div>
  );
}
