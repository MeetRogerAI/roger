import { Reveal } from "@/components/site/shared/reveal";
import type { Testimonial } from "@/lib/site/testimonials";
import { SectionHead } from "./section-head";

/**
 * "What people say" (spec A.4): each quote word for word, then who said it.
 * A simple grid, no carousel. With no cleared quote the whole section is
 * absent: no heading and no wrapper (plan R13).
 *
 * The caller passes the list for its audience (getTestimonials in
 * src/lib/site/testimonials.ts).
 */
export function Testimonials({ title, items, night = false, id = "say" }: { title: string; items: Testimonial[]; night?: boolean; id?: string }) {
  if (items.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className={`scroll-mt-14 ${night ? "on-night bg-night text-night-ink" : "bg-ground"}`}>
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={title} night={night} />
        <Reveal as="ul" className={`mx-auto mt-14 grid gap-4 ${items.length > 1 ? "max-w-[64rem] md:grid-cols-2" : "max-w-[40rem]"}`}>
          {items.map((t) => (
            <li key={t.id}>
              <figure className={`flex h-full flex-col rounded-[8px] border p-6 sm:p-8 ${night ? "border-night-rule bg-night-2" : "border-rule bg-surface"}`}>
                {/* data-claims: a user's own words, which the claims check reads by its testimonial rules (src/lib/site/claims.ts). */}
                <blockquote data-claims="testimonial" className="text-lead">
                  <p>{`“${t.quote}”`}</p>
                </blockquote>
                <figcaption className={`mt-6 text-small ${night ? "text-night-ink-2" : "text-ink-2"}`}>
                  <span className={`font-[600] ${night ? "text-night-ink" : "text-ink"}`}>{t.person}</span>
                  {t.attribution && <span className="block">{t.attribution}</span>}
                </figcaption>
              </figure>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
