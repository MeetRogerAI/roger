import Link from "next/link";
import { Reveal } from "@/components/site/shared/reveal";
import type { Question } from "@/data/site/copy-types";

/**
 * The questions accordion (spec A.4), in the markup of FaqSection in
 * src/components/sections.tsx: native details and summary, so each one opens
 * by keyboard and tells a screen reader whether it is open, with no script.
 *
 * A page passes its own subset (questionsOn in src/data/site/v1.ts). /faq
 * renders one of these per group.
 */
export function Questions({
  title,
  items,
  more,
  night = false,
  id = "questions",
  as: Heading = "h2",
  group = false,
}: {
  title: string;
  items: Question[];
  /** The link under the list, to /faq. */
  more?: { label: string; href: string };
  night?: boolean;
  id?: string;
  /** "h3" for a group under a page's own heading. */
  as?: "h2" | "h3";
  /** One of several on a page, as on /faq: the heading keeps its level and takes the smaller size, and the groups sit closer together. */
  group?: boolean;
}) {
  if (items.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className={`scroll-mt-14 ${night ? "on-night bg-night text-night-ink" : "bg-ground"}`}>
      <Reveal className={`wrap grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16 ${group ? "py-10 md:py-14" : "py-24 md:py-32"}`}>
        <div>
          <Heading id={titleId} className={`${Heading === "h2" && !group ? "text-h2" : "text-h3"} md:sticky md:top-24`}>
            {title}
          </Heading>
        </div>
        <div>
          <div className="space-y-1">
            {items.map((item) => (
              <details
                key={item.q}
                className={`group rounded-[8px] px-5 transition-colors duration-[180ms] sm:px-6 ${night ? "bg-night-2" : "bg-ground-2 open:bg-surface"}`}
              >
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-title [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <svg
                    viewBox="0 0 20 20"
                    className={`size-4 shrink-0 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none ${night ? "text-night-ink-2" : "text-ink-2"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M10 3v14M3 10h14" />
                  </svg>
                </summary>
                <p className={`max-w-[40rem] pb-6 text-body ${night ? "text-night-ink-2" : ""}`}>{item.a}</p>
              </details>
            ))}
          </div>
          {more && (
            <p className="mt-8 px-5 sm:px-6">
              <Link href={more.href} className="tlink chev">
                {more.label}
              </Link>
            </p>
          )}
        </div>
      </Reveal>
    </section>
  );
}
