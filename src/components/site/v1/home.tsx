import Link from "next/link";
import { siteConfig } from "@/data/config";
import { CountryDefault } from "@/components/site/shared/country-default";
import { StartLink } from "@/components/site/shared/start-link";
import { letterShown } from "@/data/site/letter";
import { samplePlay } from "@/data/site/sample-play";
import { closingBandCopy, priceBlockCopy, questionsOn, v1Copy } from "@/data/site/v1";
import { getAmounts, type Amounts } from "@/lib/site/amounts";
import { getPlaybookPreface, publicIdeaView, resolveSamplePlay, type IdeaView } from "@/lib/site/sample";
import { getTestimonials, type Testimonial } from "@/lib/site/testimonials";
import type { BuiltVersion } from "@/lib/site/version";
import { BrickStack } from "./blocks/brick-stack";
import { ClosingBand } from "./blocks/closing-band";
import { Compounding } from "./blocks/compounding";
import { ControlBlock } from "./blocks/control-block";
import { HowItWorks } from "./blocks/how-it-works";
import { PriceBlock } from "./blocks/price-block";
import { Questions } from "./blocks/questions";
import { Hairline, Problem, SampleSection } from "./blocks/sections";
import { Testimonials } from "./blocks/testimonials";
import { WhoRunsThis } from "./blocks/who-runs-this";

/**
 * The real estate homepage of site version 1, in the spec's order (A.5):
 *
 *    1. hero                          night
 *    2. the problem                   ground
 *    3. how it works, id "how"        night
 *    4. what arrives on Monday        ground
 *    5. it compounds                  ground-2
 *    6. what people say               ground     absent when no quote is cleared
 *    7. you decide what Zack shares   ground
 *    8. who runs this                 ground
 *    9. price                         night
 *   10. questions                     ground
 *   11. closing band                  night
 *
 * No two night chapters are neighbours, with or without testimonials. Where
 * two ground sections are neighbours, a hairline keeps them apart.
 *
 * Every start button carries the audience "re". Nothing here links to /zack:
 * the free Zack run is reached from /agents only.
 */

/** How many letter paragraphs "Who runs this" prints: the first three that are still true. */
const LETTER_PARAGRAPHS = 3;

// The hero's stack is a picture, not a claim: a few Mondays already in place and the newest three arriving. No number is printed.
const HERO_WEEKS = 4;

/**
 * Reads what the page shows, all of it cached, so the page keeps its static shell.
 *
 * The photograph is configuration (siteConfig.founder.photo), not a look at the
 * disk: a page regenerated inside a serverless function may not have public/
 * beside it, and the answer must be the same there as at build.
 */
export async function V1Home({ version }: { version: BuiltVersion }) {
  const [amounts, preface, play, testimonials] = await Promise.all([getAmounts(), getPlaybookPreface(), resolveSamplePlay(samplePlay), getTestimonials("re")]);
  return <V1HomeView version={version} amounts={amounts} idea={publicIdeaView(play, preface)} testimonials={testimonials} photo={siteConfig.founder.photo} />;
}

export function V1HomeView({
  version,
  amounts,
  idea,
  testimonials,
  photo,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
  idea: IdeaView;
  /** Cleared quotes for the audience "re". Empty leaves the section out. */
  testimonials: Testimonial[];
  /** The path of Peter's photograph under public/. Empty leaves it out. */
  photo: string;
}) {
  const { copy } = v1Copy(amounts);
  const home = copy.home;
  const priceCopy = priceBlockCopy(copy);

  return (
    <div data-site={version}>
      {/* 1. Hero */}
      <section aria-labelledby="hero-title" className="on-night bg-night text-night-ink">
        <div className="wrap grid items-center gap-16 pb-24 pt-16 md:pt-24 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-24 lg:pb-32 lg:pt-28">
          <div>
            <h1 id="hero-title" className="lines max-w-[14ch] text-display text-stretch-display">
              <span className="line">
                <span data-line>{home.hero.headline}</span>
              </span>
            </h1>
            <div className="after-lines">
              <p className="mt-8 max-w-[34rem] text-lead">{home.hero.sub}</p>
              <div data-hero-actions className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
                <StartLink audience="re" className="btn btn-l">
                  {copy.buttons.start}
                </StartLink>
                <Link href={home.hero.secondary.href} className="tlink chev">
                  {home.hero.secondary.label}
                </Link>
              </div>
              <p className="mt-5 text-meta text-night-ink-2">{copy.cardLine}</p>
            </div>
          </div>
          <BrickStack weeks={HERO_WEEKS} size="xl" night words={copy.bricks} className="bricks-arrive justify-self-start lg:justify-self-end" />
        </div>
      </section>

      {/* 2. The problem */}
      <Problem copy={home.problem} />

      {/* 3. How it works */}
      <HowItWorks copy={home.how} words={copy.bricks} id={home.how.id} />

      {/* 4. What arrives on Monday */}
      <SampleSection idea={idea} copy={copy.sample} />

      {/* 5. It compounds */}
      <Compounding copy={home.compounds} words={copy.bricks} />

      {/* 6. What people say: nothing at all when no quote is cleared */}
      <Testimonials title={copy.testimonials.title} items={testimonials} />

      {/* 7. You decide what Zack shares */}
      {testimonials.length > 0 && <Hairline />}
      <ControlBlock copy={copy.control} />

      {/* 8. Who runs this */}
      <Hairline />
      <WhoRunsThis copy={home.whoRuns} paragraphs={letterShown.slice(0, LETTER_PARAGRAPHS)} photo={photo} />

      {/* 9. Price, with the currency for the visitor's country */}
      <CountryDefault>{(currency) => <PriceBlock amounts={amounts} copy={priceCopy} initialCurrency={currency} audience="re" />}</CountryDefault>

      {/* 10. Questions */}
      <Questions title={copy.questionsBlock.title} items={questionsOn(copy, "home")} more={copy.questionsBlock.more} />

      {/* 11. Closing band */}
      <ClosingBand copy={closingBandCopy(copy, home.closing.line)} audience="re" />
    </div>
  );
}
