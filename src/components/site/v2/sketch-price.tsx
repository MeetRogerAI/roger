"use client";

import { useCurrency, type Currency } from "@/components/site/shared/currency-store";

/**
 * A price with a visible USD or CAD choice, for a v2 sketch. It reads and sets
 * the site's one currency store, so the choice made here is the one the start
 * link carries and every price block shows.
 *
 * The lines arrive ready-made from the server ("US$200 / month USD"), because
 * the amounts come from the settings and this file runs in the browser. The
 * server renders USD, as the price block does before the visitor's country is
 * known. Classes are plain hooks: the sketch that uses this styles them.
 */
export function SketchPrice({
  label,
  name,
  options,
}: {
  /** The switch's label, for screen readers: "Show prices in". */
  label: string;
  /** What is priced: "Monthly". */
  name: string;
  /** One entry per currency, in the order shown. */
  options: { currency: Currency; line: string; tax: string }[];
}) {
  const [currency, choose] = useCurrency("USD");
  const shown = options.find((option) => option.currency === currency) ?? options[0];
  return (
    <div className="v2-price">
      <p aria-live="polite">
        <span className="v2-price-name">{name}</span>
        <span className="v2-price-line">{shown.line}</span>
        <span className="v2-price-tax">{shown.tax}</span>
      </p>
      <div role="group" aria-label={label} className="v2-price-switch">
        {options.map((option) => (
          <button key={option.currency} type="button" aria-pressed={option.currency === shown.currency} onClick={() => choose(option.currency)}>
            {option.currency}
          </button>
        ))}
      </div>
    </div>
  );
}
