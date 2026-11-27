import Link from "next/link";
import { Reveal } from "@/components/site/shared/reveal";
import type { ControlBlockCopy } from "@/data/site/copy-types";
import { SectionHead } from "./section-head";

/**
 * "You decide what Zack shares" (spec A.4): three points and a link to the
 * detail on /how-it-works. Each point is a short sentence set as its title,
 * and the sentences under it.
 */
export function ControlBlock({ copy, night = false, id = "control" }: { copy: ControlBlockCopy; night?: boolean; id?: string }) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className={`scroll-mt-14 ${night ? "on-night bg-night text-night-ink" : "bg-ground"}`}>
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} night={night} />
        <Reveal as="ul" className="mx-auto mt-14 grid max-w-[64rem] gap-10 md:grid-cols-3 md:gap-12">
          {copy.points.map((point) => (
            <li key={point.title} className={`border-t pt-6 ${night ? "border-night-rule" : "border-rule-strong"}`}>
              <p className="text-title">{point.title}</p>
              <p className={`mt-3 text-body ${night ? "text-night-ink-2" : "text-ink-2"}`}>{point.body}</p>
            </li>
          ))}
        </Reveal>
        <p className="mt-12 text-center">
          <Link href={copy.link.href} className="tlink chev">
            {copy.link.label}
          </Link>
        </p>
      </div>
    </section>
  );
}
