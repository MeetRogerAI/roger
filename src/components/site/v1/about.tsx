import Image from "next/image";
import { siteConfig } from "@/data/config";
import { getAmounts, type Amounts } from "@/lib/site/amounts";
import type { Overlay } from "@/lib/site/content/format";
import { sectionsShown, v1Copy } from "@/lib/site/content/model";
import { getSiteContent } from "@/lib/site/content/read";
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
 * (src/data/site/letter.ts). The words come through the content model, so
 * wording published in the admin is shown in place of the built-in wording.
 *
 * The photograph and the signature are each optional, and each is
 * configuration, not a look at the disk: a page regenerated inside a serverless
 * function may not have public/ beside it. With no photograph the
 * page is the text column alone, with no image element and no empty frame.
 * With no signature file his name is typed.
 */

/** Reads the amounts the button names and the published content, both cached, so the page keeps its static shell. */
export async function V1About({ version }: { version: BuiltVersion }) {
  const [amounts, content] = await Promise.all([getAmounts(), getSiteContent()]);
  return <V1AboutView version={version} amounts={amounts} content={content} photo={siteConfig.founder.photo} signature={siteConfig.founder.signature} />;
}

export function V1AboutView({
  version,
  amounts,
  content,
  photo,
  signature,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
  /** Everything stored that the page should show, as one overlay on the code copy (getSiteContent). Left out, the page prints the code copy alone. */
  content?: Overlay;
  /** The path of Peter's photograph under public/. Empty leaves it out. */
  photo: string;
  /** The path of his signature under public/. Empty types his name instead. */
  signature: string;
}) {
  const { copy, letter } = v1Copy(amounts, content);
  const about = copy.about;

  // The page's two sections, the letter and the start band: the ones that are on, in the stored order (plan U6).
  const shown = sectionsShown("about", content);
  // In the built-in order the letter follows the title directly, and the two share one block. Otherwise the title
  // stands alone, and the letter, where it is on, gets a block of its own further down.
  const letterFirst = shown[0] === "letter";
  const space = "wrap pb-24 pt-16 md:pb-32 md:pt-24";

  const letterBody = (
    <div className={`mx-auto ${letterFirst ? "mt-14 " : ""}${photo ? "grid max-w-[60rem] items-start gap-10 md:grid-cols-[minmax(0,16rem)_minmax(0,40rem)] md:gap-16" : "max-w-[40rem]"}`}>
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
          {letter.paragraphs.map((p) => (
            <p key={p.id}>{p.text}</p>
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
  );

  return (
    <div data-site={version}>
      <section aria-labelledby="about-title" className="bg-ground">
        <div className={space}>
          <SectionHead id="about-title" title={about.title} as="h1" />
          {letterFirst && letterBody}
        </div>
      </section>
      {shown.slice(letterFirst ? 1 : 0).map((id) =>
        id === "startBand" ? (
          <StartBand key={id} start={copy.buttons.start} cardLine={copy.cardLine} />
        ) : id === "letter" ? (
          <div key={id} data-letter-block className="bg-ground">
            <div className={space}>{letterBody}</div>
          </div>
        ) : null,
      )}
    </div>
  );
}
