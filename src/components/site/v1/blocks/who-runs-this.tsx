import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/site/shared/reveal";
import { SectionHead } from "./section-head";

/**
 * "Who runs this" (spec A.5): the lead-in, the opening paragraphs of Peter's
 * letter in one narrow column, his photograph and a link to /about.
 *
 * The photograph is optional (plan R13). `photo` is its path under public/,
 * from siteConfig.founder.photo. While that is empty the section is the text
 * column alone: no image element and no empty frame.
 */
export function WhoRunsThis({
  copy,
  paragraphs,
  photo,
  id = "who",
}: {
  copy: { title: string; leadIn: string; photoAlt: string; link: { label: string; href: string } };
  /** The letter paragraphs to print, in order. */
  paragraphs: { id: string; shown: string }[];
  /** A path under public/, such as "/media/peter.jpg". Empty hides the photograph. */
  photo: string;
  id?: string;
}) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-14 bg-ground">
      <div className="wrap py-24 md:py-32">
        <SectionHead id={titleId} title={copy.title} />
        <Reveal className={`mx-auto mt-14 ${photo ? "grid max-w-[60rem] items-start gap-10 md:grid-cols-[minmax(0,16rem)_minmax(0,40rem)] md:gap-16" : "max-w-[40rem]"}`}>
          {photo && (
            <div data-photo className="relative aspect-[4/5] w-full max-w-[16rem] overflow-hidden rounded-[8px] bg-ground-2">
              <Image src={photo} alt={copy.photoAlt} fill sizes="16rem" className="object-cover" />
            </div>
          )}
          <div>
            <p className="text-title">{copy.leadIn}</p>
            {/* data-claims: Peter's letter, word for word, for the claims check (src/lib/site/claims.ts). */}
            <div data-claims="letter" className="mt-6 space-y-5 text-body">
              {paragraphs.map((p) => (
                <p key={p.id}>{p.shown}</p>
              ))}
            </div>
            <p className="mt-8">
              <Link href={copy.link.href} className="tlink chev">
                {copy.link.label}
              </Link>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
