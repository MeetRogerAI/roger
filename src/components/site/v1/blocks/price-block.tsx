import { StartLink } from "@/components/site/shared/start-link";
import type { PriceBlockCopy } from "@/data/site/copy-types";
import { currencies, money, type Amounts, type Currency } from "@/lib/site/amounts";
import type { SiteAudience } from "@/lib/site/start-link";
import { CurrencyToggle, ForCurrency } from "./price-currency";

/**
 * The price block, a night chapter (spec A.4). Two ways to buy, side by side:
 * monthly, marked as the choice most people make and the larger of the two,
 * and one list at a time. The trial line always sits directly under the
 * prices. No other plan is shown.
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
  as: Heading = "h2",
}: {
  amounts: Amounts;
  copy: PriceBlockCopy;
  initialCurrency?: Currency;
  /** The audience of the page, carried by the start button. */
  audience?: SiteAudience;
  id?: string;
  /** "h1" on /pricing, where the block opens the page. */
  as?: "h1" | "h2";
}) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="on-night scroll-mt-14 bg-night text-night-ink">
      <div className="wrap py-24 text-center md:py-32">
        <Heading id={titleId} className="text-h2">
          {copy.title}
        </Heading>
        <div className="mt-8">
          <CurrencyToggle initial={initialCurrency} label={copy.switchLabel} options={currencies} />
        </div>

        <div className="mx-auto mt-8 grid max-w-[60rem] items-stretch gap-4 text-left md:grid-cols-[1.35fr_1fr]" aria-live="polite">
          <div data-plan="monthly" className="rounded-[8px] border border-night-ink-2 bg-night-2 p-6 sm:p-10">
            <p className="inline-block rounded-full border border-night-ink-2 px-3 py-1 text-meta font-semibold">{copy.popular}</p>
            <h3 className="mt-5 text-title">{copy.monthly.name}</h3>
            {currencies.map((currency) => (
              <ForCurrency key={currency} currency={currency} initial={initialCurrency}>
                <Price currency={currency} amount={amounts.monthly[currency]} per={copy.perMonth} tax={copy.tax[currency]} large />
              </ForCurrency>
            ))}
            <p className="mt-5 text-small">{copy.monthly.note}</p>
          </div>

          <div data-plan="list" className="rounded-[8px] border border-night-rule p-6 sm:p-8">
            <h3 className="text-title">{copy.list.name}</h3>
            {currencies.map((currency) => (
              <ForCurrency key={currency} currency={currency} initial={initialCurrency}>
                <Price currency={currency} amount={amounts.list[currency]} per={copy.perList} tax={copy.tax[currency]} />
              </ForCurrency>
            ))}
            <p className="mt-5 text-small text-night-ink-2">{copy.list.note}</p>
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
function Price({ currency, amount, per, tax, large = false }: { currency: Currency; amount: number; per: string; tax: string; large?: boolean }) {
  // The same words as priceLine in src/lib/site/amounts.ts, in two sizes. A test holds the two together.
  return (
    <span className="mt-4 block">
      <span className={`tabular block font-[650] leading-none tracking-[-0.04em] ${large ? "text-[clamp(3rem,7vw,5rem)]" : "text-h3"}`}>
        {money(currency, amount)}
        <span className={`font-medium tracking-[-0.02em] text-night-ink-2 ${large ? "text-[clamp(1.1875rem,2vw,1.5rem)]" : "text-small"}`}>{` / ${per} ${currency}`}</span>
      </span>
      <span className="mt-2 block text-meta text-night-ink-2">{tax}</span>
    </span>
  );
}
