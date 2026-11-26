import Link from "next/link";
import { CountryDefault } from "@/components/site/shared/country-default";
import { StartLink } from "@/components/site/shared/start-link";
import { samplePlay } from "@/data/site/sample-play";
import { closingBandCopy, priceBlockCopy, questionsOn, v1Copy, type V1AgentsCopy } from "@/data/site/v1";
import { zackAgents } from "@/data/zack";
import { getAmounts, type Amounts } from "@/lib/site/amounts";
import { getPlaybookPreface, publicIdeaView, resolveSamplePlay, type IdeaView } from "@/lib/site/sample";
import { getTestimonials, type Testimonial } from "@/lib/site/testimonials";
import type { BuiltVersion } from "@/lib/site/version";
import { BrickStack } from "./blocks/brick-stack";
import { ClosingBand } from "./blocks/closing-band";
import { ControlBlock } from "./blocks/control-block";
import { HowItWorks } from "./blocks/how-it-works";
import { PriceBlock } from "./blocks/price-block";
import { Questions } from "./blocks/questions";
import { Hairline, Problem, SampleSection } from "./blocks/sections";
import { Testimonials } from "./blocks/testimonials";

/**
 * /agents on site version 1, for people who already run AI agents, in the
 * spec's order (A.6). The blocks are the homepage's; the words and the order
 * are this page's.
 *
 *   1. hero, with the agent strip    night
 *   2. the problem                   ground
 *   3. how it works                  night
 *   4. the sample idea               ground
 *   5. you decide what Zack shares   ground     higher than on the homepage
 *   6. what people say               ground     absent when no quote is cleared
 *   7. price                         night
 *   8. questions                     ground
 *   9. closing band                  night
 *
 * No two night chapters are neighbours, with or without testimonials. Where
 * two ground sections are neighbours, a hairline keeps them apart.
 *
 * Every start button carries the audience "agents". This page may say "agent"
 * without "AI" in front (spec 0.4); the shared blocks keep the shared words.
 */

// The same picture as the homepage's hero: a few Mondays in place. No number is printed.
const HERO_WEEKS = 4;

/**
 * The names the strip lists: the agents whose Zack file exists, in alphabetical
 * order, which is the order the spec's sentence names them in. An agent with no
 * file is never listed.
 */
export function agentsWithFile(agents: readonly { name: string; available: boolean }[] = zackAgents): string[] {
  return agents
    .filter((agent) => agent.available)
    .map((agent) => agent.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

/** "Zack files for Claude, Duet, Grok Bot and Hark. Any other agent adapts one with a single prompt.", with the names from the data. */
export function agentsStripLine(strip: V1AgentsCopy["strip"], names: string[]): string {
  const listed = names.length > 1 ? `${names.slice(0, -1).join(", ")} ${strip.and} ${names.at(-1)}` : names.join("");
  return `${strip.filesFor} ${listed}. ${strip.others}`;
}

/** Reads what the page shows, all of it cached, so the page keeps its static shell. */
export async function V1Agents({ version }: { version: BuiltVersion }) {
  const [amounts, preface, play, testimonials] = await Promise.all([getAmounts(), getPlaybookPreface(), resolveSamplePlay(samplePlay), getTestimonials("agents")]);
  return <V1AgentsView version={version} amounts={amounts} idea={publicIdeaView(play, preface)} testimonials={testimonials} agentNames={agentsWithFile()} />;
}

export function V1AgentsView({
  version,
  amounts,
  idea,
  testimonials,
  agentNames,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
  idea: IdeaView;
  /** Cleared quotes for the audience "agents", rows marked for both included. Empty leaves the section out. */
  testimonials: Testimonial[];
  /** The agents with a Zack file (agentsWithFile). Empty leaves the strip out. */
  agentNames: string[];
}) {
  const { copy, agents } = v1Copy(amounts);

  return (
    <div data-site={version}>
      {/* 1. Hero, and under it the strip of agents */}
      <section aria-labelledby="hero-title" className="on-night bg-night text-night-ink">
        <div className="wrap grid items-center gap-16 pb-24 pt-16 md:pt-24 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-24 lg:pb-32 lg:pt-28">
          <div>
            <h1 id="hero-title" className="lines max-w-[14ch] text-display text-stretch-display">
              <span className="line">
                <span data-line>{agents.hero.headline}</span>
              </span>
            </h1>
            <div className="after-lines">
              <p className="mt-8 max-w-[34rem] text-lead">{agents.hero.sub}</p>
              <div data-hero-actions className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
                <StartLink audience="agents" className="btn btn-l">
                  {copy.buttons.start}
                </StartLink>
                <Link href={agents.hero.secondary.href} className="tlink chev">
                  {agents.hero.secondary.label}
                </Link>
              </div>
              <p className="mt-5 text-meta text-night-ink-2">{copy.cardLine}</p>
            </div>
          </div>
          <BrickStack weeks={HERO_WEEKS} size="xl" night words={copy.bricks} className="bricks-arrive justify-self-start lg:justify-self-end" />
        </div>
        {agentNames.length > 0 && (
          <div data-agent-strip className="border-t border-night-rule">
            <div className="wrap pb-14 pt-9 text-center">
              <h2 className="text-meta font-[600] text-night-ink-2">{agents.strip.title}</h2>
              <ul className="mt-4 flex flex-wrap justify-center">
                {agentNames.map((name) => (
                  <li key={name} className="-mb-px -mr-px border border-night-rule px-6 py-3 text-title sm:px-10">
                    {name}
                  </li>
                ))}
              </ul>
              <p className="mx-auto mt-5 max-w-[38rem] text-small text-night-ink-2">{agentsStripLine(agents.strip, agentNames)}</p>
            </div>
          </div>
        )}
      </section>

      {/* 2. The problem */}
      <Problem copy={agents.problem} />

      {/* 3. How it works */}
      <HowItWorks copy={agents.how} words={copy.bricks} />

      {/* 4. The sample idea */}
      <SampleSection idea={idea} copy={copy.sample} />

      {/* 5. You decide what Zack shares: higher here, because security questions come first */}
      <Hairline />
      <ControlBlock copy={copy.control} />

      {/* 6. What people say: nothing at all when no quote is cleared */}
      {testimonials.length > 0 && <Hairline />}
      <Testimonials title={copy.testimonials.title} items={testimonials} />

      {/* 7. Price, with the currency for the visitor's country */}
      <CountryDefault>{(currency) => <PriceBlock amounts={amounts} copy={priceBlockCopy(copy)} initialCurrency={currency} audience="agents" />}</CountryDefault>

      {/* 8. Questions */}
      <Questions title={copy.questionsBlock.title} items={questionsOn(copy, "agents")} more={copy.questionsBlock.more} />

      {/* 9. Closing band */}
      <ClosingBand copy={closingBandCopy(copy, agents.closing.line)} audience="agents" />
    </div>
  );
}
