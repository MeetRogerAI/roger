import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SketchFrame } from "@/components/site/v2/sketch-frame";
import { heroSketches } from "@/components/site/v2/sketches";
import { isKnownNonProduction } from "@/lib/site/version";

export const metadata: Metadata = { title: "Version 2 hero sketches", robots: { index: false, follow: false } };

/**
 * The index of the five v2 hero sketches (plan U11, R15, F3): each one as a
 * desktop screen and a phone screen, with a link to its full page and a note
 * on what it takes from its example site. Peter picks one or a mix from here,
 * and the pick is recorded in docs/site/v2-reference-board.md.
 *
 * This page keeps the site's own header and footer and uses the current
 * tokens: it is the builder's page, not one of the looks. Served only where
 * the environment is known not to be live, as /site-preview/blocks is.
 */
export default function HeroSketchIndex() {
  if (!isKnownNonProduction()) notFound();
  return (
    <div className="bg-ground-2 pb-24">
      <div className="wrap-wide pt-14">
        <h1 className="text-h2">Version 2: five hero sketches</h1>
        <p className="mt-4 max-w-[46rem] text-ink-2">
          Each sketch is a first screen and the start of the next section, in the spirit of one of the five example sites. The words are the version 1 words. Every picture is a labelled placeholder at the size of the real one. Pick one, or name a mix,
          and the whole of version 2 is built in that look.
        </p>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-small">
          {heroSketches.map((sketch) => (
            <li key={sketch.n}>
              <a href={`#sketch-${sketch.n}`} className="tlink">
                {sketch.name}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {heroSketches.map((sketch) => {
        const href = `/site-preview/hero/${sketch.n}`;
        return (
          <section key={sketch.n} id={`sketch-${sketch.n}`} aria-labelledby={`sketch-${sketch.n}-title`} className="wrap-wide mt-16 scroll-mt-20">
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
              <h2 id={`sketch-${sketch.n}-title`} className="text-title">
                {sketch.name}
                <span className="font-normal text-ink-2">, in the spirit of {sketch.site}</span>
              </h2>
              <Link href={href} className="tlink chev">
                Open this sketch full page
              </Link>
            </div>

            <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.2083fr)]">
              <div className="overflow-hidden rounded-[8px] border border-rule-strong bg-surface">
                <SketchFrame src={href} title={`${sketch.name}, on a desktop screen`} width={1440} height={900} />
              </div>
              <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[8px] border border-rule-strong bg-surface lg:max-w-none">
                <SketchFrame src={href} title={`${sketch.name}, on a phone screen`} width={375} height={1125} />
              </div>
            </div>

            <p className="mt-5 max-w-[60rem] text-small text-ink-2">
              <strong className="font-semibold text-ink">It takes</strong> {sketch.takes} <strong className="font-semibold text-ink">It leaves</strong> {sketch.leaves} <strong className="font-semibold text-ink">It needs</strong> {sketch.needs}
            </p>
          </section>
        );
      })}
    </div>
  );
}
