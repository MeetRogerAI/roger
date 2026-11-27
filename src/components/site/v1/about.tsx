import Image from "next/image";
import { siteConfig } from "@/data/config";
import { letter, letterShown } from "@/data/site/letter";
import { v1Copy } from "@/data/site/v1";
import { getAmounts, type Amounts } from "@/lib/site/amounts";
import type { BuiltVersion } from "@/lib/site/version";
import { StartBand } from "./blocks/reading";
import { SectionHead } from "./blocks/section-head";

/**
 * /about on site version 1 (spec A.10): Peter's letter in one narrow column,
 * then the start button.
 *
 * The letter is printed as it may be today (plan R13): its greeting, the
 * paragraphs that are still true, its sign-off and his name. The paragraphs
 * about Circles and applications stay out until Peter sends a new letter
 * (src/data/site/letter.ts).
 *
 * The photograph and the signature are each optional, and each is
 * configuration, not a look at the disk (see V1Home). With no photograph the
 * page is the text column alone, with no image element and no empty frame.
 * With no signature file his name is typed.
 */

/** Reads the amounts the button names, cached, so the page keeps its static shell. */
export async function V1About({ version }: { version: BuiltVersion }) {
  return <V1AboutView version={version} amounts={await getAmounts()} photo={siteConfig.founder.photo} signature={siteConfig.founder.signature} />;
}

export function V1AboutView({
  version,
  amounts,
  photo,
  signature,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
  /** The path of Peter's photograph under public/. Empty leaves it out. */
  photo: string;
  /** The path of his signature under public/. Empty types his name instead. */
  signature: string;
}) {
  const { copy } = v1Copy(amounts);
  const about = copy.about;

  return (
    <div data-site={version}>
      <section aria-labelledby="about-title" className="bg-ground">
        <div className="wrap pb-24 pt-16 md:pb-32 md:pt-24">
          <SectionHead id="about-title" title={about.title} as="h1" />
          <div className={`mx-auto mt-14 ${photo ? "grid max-w-[60rem] items-start gap-10 md:grid-cols-[minmax(0,16rem)_minmax(0,40rem)] md:gap-16" : "max-w-[40rem]"}`}>
            {photo && (
              <div data-photo className="relative aspect-[4/5] w-full max-w-[16rem] overflow-hidden rounded-[8px] bg-ground-2">
                <Image src={photo} alt={about.photoAlt} fill sizes="16rem" className="object-cover" />
              </div>
            )}
            <div data-letter>
              <p className="text-title">{about.leadIn}</p>
              {/* data-claims: Peter's letter, word for word, for the claims check (src/lib/site/claims.ts). */}
              <div data-claims="letter" className="mt-8 space-y-5 text-body">
                <p>{letter.greeting}</p>
                {letterShown.map((p) => (
                  <p key={p.id}>{p.shown}</p>
                ))}
                <p>{letter.signOff}</p>
              </div>
              {signature ? (
                <div data-signature="file" className="relative mt-4 h-16 w-48">
                  <Image src={signature} alt={about.signatureAlt} fill sizes="12rem" className="object-contain object-left" />
                </div>
              ) : (
                <p data-signature="typed" className="mt-3 text-title">
                  {letter.signature}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      <StartBand start={copy.buttons.start} cardLine={copy.cardLine} />
    </div>
  );
}
