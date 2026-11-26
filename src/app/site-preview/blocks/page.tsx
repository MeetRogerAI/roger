import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CountryDefault } from "@/components/site/shared/country-default";
import { BrickStack, type BrickLevel } from "@/components/site/v1/blocks/brick-stack";
import { ClosingBand } from "@/components/site/v1/blocks/closing-band";
import { ControlBlock } from "@/components/site/v1/blocks/control-block";
import { PriceBlock } from "@/components/site/v1/blocks/price-block";
import { Questions } from "@/components/site/v1/blocks/questions";
import { SampleCard } from "@/components/site/v1/blocks/sample-card";
import { SectionHead } from "@/components/site/v1/blocks/section-head";
import { Testimonials } from "@/components/site/v1/blocks/testimonials";
import { compoundingFinal, compoundingSteps } from "@/data/site/compounding";
import { letter, letterShown } from "@/data/site/letter";
import { samplePlay } from "@/data/site/sample-play";
import { closingBandCopy, priceBlockCopy, questionsOn, v1Copy } from "@/data/site/v1";
import { getAmounts } from "@/lib/site/amounts";
import { getPlaybookPreface, publicIdeaView, resolveSamplePlay, type SamplePlay } from "@/lib/site/sample";
import type { Testimonial } from "@/lib/site/testimonials";
import { isKnownNonProduction } from "@/lib/site/version";

export const metadata: Metadata = { title: "Site blocks preview", robots: { index: false, follow: false } };

// Made up, for this preview only: no testimonial is cleared, so the real list is empty.
const madeUpQuotes: Testimonial[] = [
  { id: "a", person: "Sample P.", attribution: "Made-up attribution", quote: "A made-up quote, to show the layout of one testimonial.", saidOn: null, audience: "re", position: 0, cleared: true },
  { id: "b", person: "Sample Q.", attribution: "", quote: "A second made-up quote, with no attribution line under the name.", saidOn: null, audience: "both", position: 1, cleared: true },
];

const levels: BrickLevel[] = [1, 2, 3, 4, 5];

// Made up, for this preview only: the bundled play has no scores, so its card has no score section.
const madeUpScores: SamplePlay["scores"] = { hours: 7, reach: 8, ease: 6, proof: 5, surprise: 4 };

/**
 * Builder's preview of the v1 blocks on ground and on night. Served only where
 * the environment is known not to be live, by the rule that picks the preview
 * site version: a production build with no VERCEL_ENV does not serve it.
 */
export default async function SiteBlocksPreview() {
  if (!isKnownNonProduction()) notFound();
  const [amounts, preface, play] = await Promise.all([getAmounts(), getPlaybookPreface(), resolveSamplePlay(samplePlay)]);
  const { copy, agents } = v1Copy(amounts);
  const idea = publicIdeaView(play, preface);
  const scoredIdea = publicIdeaView({ ...play, scores: madeUpScores }, preface);
  const priceCopy = priceBlockCopy(copy);

  const stacks = (night: boolean) => (
    <div className="flex flex-wrap items-end justify-center gap-10">
      {compoundingSteps.slice(0, 3).map((s) => (
        <BrickStack key={s.week} weeks={s.week} size="l" night={night} words={copy.bricks} caption />
      ))}
      <BrickStack weeks={compoundingFinal.week} perRow={13} night={night} words={copy.bricks} caption />
      <BrickStack weeks={2} setUp={4} size="l" night={night} words={copy.bricks} />
      {levels.map((level) => (
        <BrickStack key={level} weeks={1} level={level} night={night} words={copy.bricks} />
      ))}
    </div>
  );

  return (
    <>
      <Label>Section head, on ground and on night</Label>
      <div className="bg-ground py-16">
        <SectionHead title={copy.home.compounds.title} sub={copy.home.compounds.line} />
      </div>
      <div className="on-night bg-night py-16 text-night-ink">
        <SectionHead title={copy.home.how.title} sub={copy.home.hero.sub} night />
      </div>

      <Label>Brick stack: weeks 1, 2, 3 and 26, part set up, and the five levels</Label>
      <div className="bg-ground py-16">{stacks(false)}</div>
      <div className="on-night bg-night py-16 text-night-ink">{stacks(true)}</div>

      <Label>Price block (night), with the currency for this visitor’s country</Label>
      <CountryDefault>{(currency) => <PriceBlock amounts={amounts} copy={priceCopy} initialCurrency={currency} audience="re" />}</CountryDefault>

      <Label>Control block, on ground and on night</Label>
      <ControlBlock copy={copy.control} />
      <ControlBlock copy={copy.control} night id="control-night" />

      <Label>Sample idea card on ground, as the site shows it: a play with no scores has no score section</Label>
      <div className="bg-ground py-16">
        <SectionHead title={copy.sample.title} sub={copy.sample.line} className="mb-10" />
        <div className="wrap">
          <SampleCard idea={idea} copy={copy.sample} />
        </div>
      </div>
      <Label>Sample idea card on night, with made-up scores to show the five bars</Label>
      <div className="on-night bg-night py-16 text-night-ink">
        <div className="wrap">
          <SampleCard idea={scoredIdea} copy={copy.sample} id="sample-night" />
        </div>
      </div>

      <Label>Testimonials with made-up quotes, on ground and on night. An empty list renders nothing (below this line).</Label>
      <Testimonials title={copy.testimonials.title} items={[]} />
      <Testimonials title={copy.testimonials.title} items={madeUpQuotes} />
      <Testimonials title={copy.testimonials.title} items={madeUpQuotes.slice(0, 1)} night id="say-night" />

      <Label>Questions: the homepage subset on ground, the /agents subset on night</Label>
      <Questions title={copy.questionsBlock.title} items={questionsOn(copy, "home")} more={copy.questionsBlock.more} />
      <Questions title={copy.questionsBlock.title} items={questionsOn(copy, "agents")} night id="questions-night" />

      <Label>Letter paragraphs that are still true</Label>
      <div className="bg-ground py-16">
        <div className="mx-auto max-w-[40rem] space-y-5 px-4">
          <p>{letter.greeting}</p>
          {letterShown.map((p) => (
            <p key={p.id}>{p.shown}</p>
          ))}
        </div>
      </div>

      <Label>Closing band (night): the homepage line, then the /agents line</Label>
      <ClosingBand copy={closingBandCopy(copy, copy.home.closing.line)} audience="re" />
      <ClosingBand copy={closingBandCopy(copy, agents.closing.line)} audience="agents" id="closing-agents" />
    </>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="border-y border-rule bg-ground-2 px-4 py-2 text-meta text-ink-2">{children}</p>;
}
