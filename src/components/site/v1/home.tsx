import type { ReactNode } from "react";
import { CountryDefault } from "@/components/site/shared/country-default";
import { StartLink } from "@/components/site/shared/start-link";
import { examplesFrom } from "@/data/site/examples";
import { priceBlockCopy, questionsOn } from "@/data/site/v1";
import { getAmounts, type Amounts } from "@/lib/site/amounts";
import type { Overlay } from "@/lib/site/content/format";
import { questionGroupsShown, sectionsShown, v1Copy } from "@/lib/site/content/model";
import { getSiteContent } from "@/lib/site/content/read";
import { exampleViews, getPlaybookPreface } from "@/lib/site/sample";
import { getTestimonials, type Testimonial } from "@/lib/site/testimonials";
import type { BuiltVersion } from "@/lib/site/version";
import { ClosingBand } from "./blocks/closing-band";
import { Compounding } from "./blocks/compounding";
import { ControlBlock } from "./blocks/control-block";
import { HeroSteps } from "./blocks/hero-steps";
import { PriceBlock } from "./blocks/price-block";
import { Questions } from "./blocks/questions";
import { ExamplesSection, InOrder, Problem, pageParts } from "./blocks/sections";
import { Testimonials } from "./blocks/testimonials";

/**
 * The homepage of site version 1, for anyone who uses AI agents (Peter's
 * homepage reviews of November 26 and 27, 2026):
 *
 *   1. hero, with the four steps     night
 *   2. the problem                   ground
 *   3. Cora Curation examples        ground     id "examples"
 *   4. it compounds                  ground-2
 *   5. what people say               ground     absent when no quote is cleared
 *   6. you decide what Zack shares   ground
 *   7. price                         night      id "price": the header's "Pricing" lands here
 *   8. questions                     ground
 *   9. closing band                  night
 *
 * "How it works" is not a section any more: its four steps are the right side
 * of the hero. "Who runs this" is gone from this page; Peter's letter is on
 * /about. There is no /pricing and no /agents page: the price is here.
 *
 * No two night chapters are neighbours, with or without testimonials. Where
 * two ground sections are neighbours, a hairline keeps them apart.
 *
 * That is the BUILT-IN order. An admin may switch a section off or move it
 * (Pages, plan U6): the page prints the sections that are on, in the stored
 * order, and the line between neighbours follows one rule whatever the order
 * (InOrder in blocks/sections.tsx): two neighbours on the same background get
 * a line in that background's rule colour, and two on different backgrounds
 * get none. A section that prints nothing (no testimonial is cleared) is no
 * neighbour. With nothing stored, the markup is what it was before the rule.
 *
 * Every start button carries the audience "re", which is the name sign-up
 * knows this page by, not a word any visitor reads. Nothing here links to /zack.
 */

/** Reads what the page shows, all of it cached, so the page keeps its static shell. */
export async function V1Home({ version }: { version: BuiltVersion }) {
  const [amounts, preface, testimonials, content] = await Promise.all([getAmounts(), getPlaybookPreface(), getTestimonials("re"), getSiteContent()]);
  return <V1HomeView version={version} amounts={amounts} preface={preface} testimonials={testimonials} content={content} />;
}

export function V1HomeView({
  version,
  amounts,
  preface,
  testimonials,
  content,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
  /** The line added to the top of every playbook, from the settings: the examples' copy buttons put it first. */
  preface: string;
  /** Cleared quotes for the audience "re". Empty leaves the section out. */
  testimonials: Testimonial[];
  /** Everything stored that the page should show, as one overlay on the code copy (getSiteContent). Left out, the page prints the code copy alone. */
  content?: Overlay;
}) {
  const { copy, examples } = v1Copy(amounts, content);
  const home = copy.home;
  // The examples as published, in their order (plan U8): the first is the one shown first.
  const shown = exampleViews(examplesFrom(examples), preface);
  const priceCopy = priceBlockCopy(copy);

  // The homepage's questions are /faq's: a group switched off there is off here too, and the order is /faq's.
  const questions = questionsOn({ questions: questionGroupsShown(copy.questions, content) }, "home");

  // Each section by its id in the registry (src/lib/site/content/registry.ts), numbered as the built-in order has them.
  const nodes: Record<string, ReactNode> = {
    // 1. Hero: the headline and one button, and beside them how Roger works, in four steps
    hero: (
      <section aria-labelledby="hero-title" className="on-night bg-night text-night-ink">
        <div className="wrap grid items-center gap-14 pb-20 pt-16 md:pt-24 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16 lg:pb-28 lg:pt-24 xl:gap-24">
          <div>
            <h1 id="hero-title" className="lines max-w-[14ch] text-display text-stretch-display">
              <span className="line">
                <span data-line>{home.hero.headline}</span>
              </span>
            </h1>
            <div className="after-lines">
              <p className="mt-8 max-w-[34rem] text-lead">{home.hero.sub}</p>
              <div data-hero-actions className="mt-10">
                <StartLink audience="re" className="btn btn-l">
                  {copy.buttons.start}
                </StartLink>
              </div>
            </div>
          </div>
          <HeroSteps copy={home.hero.graphic} words={copy.bricks} className="after-lines justify-self-start lg:justify-self-end" />
        </div>
      </section>
    ),
    // 2. The problem
    problem: <Problem copy={home.problem} />,
    // 3. Cora Curation examples: nothing at all with no example
    examples: shown.length > 0 ? <ExamplesSection examples={shown} copy={copy.sample} /> : null,
    // 4. It compounds
    compounds: <Compounding copy={home.compounds} words={copy.bricks} />,
    // 5. What people say: nothing at all when no quote is cleared
    testimonials: testimonials.length > 0 ? <Testimonials title={copy.testimonials.title} items={testimonials} /> : null,
    // 6. You decide what Zack shares
    control: <ControlBlock copy={copy.control} />,
    // 7. Price, with the currency for the visitor's country
    price: <CountryDefault>{(currency) => <PriceBlock amounts={amounts} copy={priceCopy} initialCurrency={currency} audience="re" />}</CountryDefault>,
    // 8. Questions: nothing at all when every group that has one for this page is switched off
    questions: questions.length > 0 ? <Questions title={copy.questionsBlock.title} items={questions} more={copy.questionsBlock.more} /> : null,
    // 9. Closing band: the line and the button, with nothing under either
    closing: <ClosingBand copy={{ line: home.closing.line, start: home.closing.start }} audience="re" />,
  };

  return (
    <div data-site={version}>
      <InOrder parts={pageParts("home", sectionsShown("home", content), nodes)} />
    </div>
  );
}
