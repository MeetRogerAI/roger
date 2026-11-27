"use client";

import type { ReactNode } from "react";
import { useCurrency, type Currency } from "@/components/site/shared/currency-store";

/**
 * The two parts of the price block that need the visitor's currency choice
 * (plan KTD10). Both read the one currency store, so every price block and
 * every start link on a page stays in step.
 *
 * With no script, html has no "js" class: the switch stays hidden, because it
 * could do nothing, and both currencies stay on the page.
 */

/**
 * USD and CAD as two real buttons that expose which one is on. `options` is
 * `currencies` from src/lib/site/amounts.ts, handed down by the price block:
 * that file reads the settings, so nothing in the browser imports it.
 */
export function CurrencyToggle({ initial, label, options }: { initial: Currency; label: string; options: readonly Currency[] }) {
  const [currency, choose] = useCurrency(initial);
  return (
    <div role="group" aria-label={label} className="hidden rounded-full border border-night-rule bg-night-2 p-1 [.js_&]:inline-flex">
      {options.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={currency === value}
          onClick={() => choose(value)}
          className={`min-h-11 min-w-16 cursor-pointer rounded-full px-4 text-meta font-semibold ${currency === value ? "bg-night-ink text-night" : "text-night-ink-2 hover:text-night-ink"}`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

/** Shows its children when `currency` is the one chosen. Without script it always shows them. */
export function ForCurrency({ currency, initial, children }: { currency: Currency; initial: Currency; children: ReactNode }) {
  const [chosen] = useCurrency(initial);
  return (
    <span data-currency={currency} className={chosen === currency ? "block" : "block [.js_&]:hidden"}>
      {children}
    </span>
  );
}
