import { CountryDefault } from "@/components/site/shared/country-default";
import { priceBlockCopy, v1Copy } from "@/data/site/v1";
import { getAmounts, type Amounts } from "@/lib/site/amounts";
import type { BuiltVersion } from "@/lib/site/version";
import { PriceBlock } from "./blocks/price-block";
import { ReadingSection, StartBand } from "./blocks/reading";
import { Hairline } from "./blocks/sections";

/**
 * /pricing on site version 1, in the spec's order (A.7):
 *
 *   1. the price block, as the page's heading   night
 *   2. what is included                         ground
 *   3. monthly, explained                       ground
 *   4. how contributing works                   ground
 *   5. no refunds                               ground
 *   6. the start button                         night
 *
 * Monthly is the one way to buy the page shows (Peter's homepage review,
 * November 26, 2026), and nothing else on the page is a plan. The higher rate
 * is named only inside the running text of "How
 * contributing works": it has no card, no price line and no button of its own.
 *
 * The weekly group session is not in "What is included" until that part of
 * the product is live.
 *
 * No start button here has an audience, so each carries the one remembered
 * from the homepage or /agents (plan AE11).
 */

/** Reads the amounts, cached, so the page keeps its static shell. */
export async function V1Pricing({ version }: { version: BuiltVersion }) {
  return <V1PricingView version={version} amounts={await getAmounts()} />;
}

export function V1PricingView({
  version,
  amounts,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
}) {
  const { copy } = v1Copy(amounts);
  const pricing = copy.pricing;
  // The block's own words, under this page's heading.
  const priceCopy = { ...priceBlockCopy(copy), title: pricing.title };

  return (
    <div data-site={version}>
      {/* 1. The price block, with the currency for the visitor's country. Its heading is the page's. */}
      <CountryDefault>{(currency) => <PriceBlock amounts={amounts} copy={priceCopy} initialCurrency={currency} as="h1" />}</CountryDefault>

      {/* 2. What is included: a plain list */}
      <ReadingSection id="included" title={pricing.included.title}>
        <ul className="border-b border-rule">
          {pricing.included.items.map((item) => (
            <li key={item} className="border-t border-rule py-4 text-lead">
              {item}
            </li>
          ))}
        </ul>
      </ReadingSection>

      {/* 3. Monthly, explained: when the card is charged, and one line under it */}
      <Hairline />
      <ReadingSection id="explained" title={pricing.explained.title}>
        <p className="text-body">{pricing.explained.body}</p>
        <p data-under-monthly className="mt-6 border-t border-rule pt-6 text-body text-ink-2">
          {pricing.explained.under}
        </p>
      </ReadingSection>

      {/* 4. How contributing works: an explanation in running text, never a plan */}
      <Hairline />
      <ReadingSection id="contributing" title={pricing.contributing.title}>
        <p className="text-body">{pricing.contributing.body}</p>
      </ReadingSection>

      {/* 5. No refunds, stated plainly */}
      <Hairline />
      <ReadingSection id="refunds" title={pricing.refunds.title}>
        <p className="text-lead">{pricing.refunds.body}</p>
      </ReadingSection>

      {/* 6. The start button */}
      <StartBand start={copy.buttons.start} cardLine={copy.cardLine} />
    </div>
  );
}
