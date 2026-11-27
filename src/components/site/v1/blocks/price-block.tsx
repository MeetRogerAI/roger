import { StartLink } from "@/components/site/shared/start-link";
import type { PriceBlockCopy } from "@/data/site/copy-types";
import { currencies, money, type Amounts, type Currency } from "@/lib/site/amounts";
import type { SiteAudience } from "@/lib/site/start-link";
import { CurrencyToggle, ForCurrency } from "./price-currency";

/**
 * The price block, a night chapter (spec A.4). One plan, monthly (Peter's
 * homepage review, November 26, 2026: the marketing pages show no other), under
 * the block's heading and its one line. The trial line always sits directly
 * under the price.
 *
 * Rendered as the child of CountryDefault, which supplies the currency for the
 * visitor's country:
 *
 *   <CountryDefault>{(currency) => <PriceBlock initialCurrency={currency} … />}</CountryDefault>
 *
 * Both currencies are in the markup. The one not chosen is hidden only once
 * script is running, so with no script both stay readable.
 *
 * Build `copy` with priceBlockCopy in src/data/site/v1.ts.
 */
export function PriceBlock({
  amounts,
  copy,
  initialCurrency = "USD",
  audience,
  id = "price",
}: {
  amounts: Amounts;
  copy: PriceBlockCopy;
  initialCurrency?: Currency;
  /** The audience of the page, carried by the start button. */
  audience?: SiteAudience;
  /** "price" on the homepage: the header's and the footer's "Pricing" link to it, and /pricing redirects to it (PRICE_SECTION_HREF in src/lib/site/chrome.ts). */
  id?: string;
}) {
  const titleId = `${id}-title`;
  return (
    // Where "Pricing" lands. The page already keeps 72px clear at the top for a link's target (scroll-padding-top in
    // globals.css) and the sticky header is 60px tall, so the margin takes 12px back: the section starts flush under
    // the header, with its own padding between the header and its heading.
    <section id={id} aria-labelledby={titleId} className="on-night -scroll-mt-3 bg-night text-night-ink">
      <div className="wrap py-24 text-center md:py-32">
        <h2 id={titleId} className="text-h2">
          {copy.title}
        </h2>
        <div className="mt-8">
          <CurrencyToggle initial={initialCurrency} label={copy.switchLabel} options={currencies} />
        </div>

        <div className="mx-auto mt-8 max-w-[36rem] text-left" aria-live="polite">
          <div data-plan="monthly" className="rounded-[8px] border border-night-ink-2 bg-night-2 p-6 sm:p-10">
            <h3 className="text-title">{copy.monthly.name}</h3>
            {currencies.map((currency) => (
              <ForCurrency key={currency} currency={currency} initial={initialCurrency}>
                <Price currency={currency} amount={amounts.monthly[currency]} per={copy.perMonth} tax={copy.tax[currency]} />
              </ForCurrency>
            ))}
            <p className="mt-5 text-small">{copy.monthly.note}</p>
          </div>
        </div>
        <p data-trial-line className="mx-auto mt-8 max-w-[44rem] text-small text-night-ink-2">
          {copy.trialLine}
        </p>

        <StartLink audience={audience} className="btn btn-l mt-10">
          {copy.start}
        </StartLink>
      </div>
    </section>
  );
}

/** "US$200 / month USD", with the tax note under it. The amount is the large part. */
function Price({ currency, amount, per, tax }: { currency: Currency; amount: number; per: string; tax: string }) {
  // The same words as priceLine in src/lib/site/amounts.ts, in two sizes. A test holds the two together.
  return (
    <span className="mt-4 block">
      <span className="tabular block text-[clamp(3rem,7vw,5rem)] font-[650] leading-none tracking-[-0.04em]">
        {money(currency, amount)}
        <span className="text-[clamp(1.1875rem,2vw,1.5rem)] font-medium tracking-[-0.02em] text-night-ink-2">{` / ${per} ${currency}`}</span>
      </span>
      <span className="mt-2 block text-meta text-night-ink-2">{tax}</span>
    </span>
  );
}
