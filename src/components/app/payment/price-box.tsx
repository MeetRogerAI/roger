"use client";

import { useId, useState, type ReactNode } from "react";
import type { MonthlyPreview } from "@/lib/billing/gateway";
import { discountDuration, dueToday, taxLine, thenLine, totalText, type PromoView } from "@/lib/billing/payment-view";
import { moneyCents, type Currency } from "@/lib/billing/prices";

/**
 * The Price Box (plan 2026-11-26-001, Unit 6; origin R14–R16): the USD / CAD
 * toggle, "Roger monthly", any discount, the tax (named once Stripe can work
 * it out from the billing address), "Total per month", and "Due today".
 * Every amount comes from the server. Beside the form from `md`; below that
 * it collapses into a "{total} / month · Details" bar that opens in place.
 * Changes to the total are announced (one polite live region).
 */
export function PriceBox({
  price,
  promo,
  onCurrency,
  currencyBusy = false,
  promoSlot,
  notice,
}: {
  price: MonthlyPreview;
  promo: PromoView | null;
  onCurrency?: (c: Currency) => void;
  /** Another change on the page is in flight: the toggle waits. */
  currencyBusy?: boolean;
  promoSlot?: ReactNode;
  notice?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const currency = price.currency;
  const tax = taxLine(price);
  const total = totalText(price);
  const due = dueToday(currency);
  const duration = discountDuration(promo, price);
  // A discount that ends: the total shown is the first month's, and the regular monthly amount follows it.
  const then = thenLine(promo, price);
  const totalLabel = then ? "First month" : "Total per month";
  // The currency toggle sits on the same line as the price, on every width, so people see at once that they can switch.
  const toggle = (
    <div role="group" aria-label="Currency" className="inline-flex shrink-0 rounded-full border border-rule bg-ground-2 p-1">
      {(["USD", "CAD"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={currency === value}
          disabled={currencyBusy}
          onClick={() => value !== currency && onCurrency?.(value)}
          className={`min-h-11 min-w-14 cursor-pointer rounded-full px-3 text-meta font-semibold disabled:cursor-wait ${currency === value ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"}`}
        >
          {value}
        </button>
      ))}
    </div>
  );
  return (
    <aside aria-labelledby={`${id}-title`} className="rounded-[8px] border border-rule bg-surface">
      <h2 id={`${id}-title`} className="sr-only">
        Summary
      </h2>
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5 md:pt-5 md:pb-0">
        {/* Phone: the total opens the details. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-details`}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 min-w-0 cursor-pointer flex-col items-start text-left md:hidden"
        >
          <span className="font-semibold tabular-nums">{then ? `${total} first month` : `${total} / month`}</span>
          <span className="text-small text-ink-2">{open ? "Hide details" : "Details"}</span>
        </button>
        {/* Desktop: the monthly price, always shown. */}
        <p className="hidden min-w-0 md:block">
          <span className="block text-meta text-ink-2">Roger monthly</span>
          <span className="whitespace-nowrap">
            <span className="text-title font-semibold tabular-nums">{moneyCents(price.subtotalCents, currency)}</span>
            <span className="text-small text-ink-2"> / month</span>
          </span>
        </p>
        {toggle}
      </div>
      <div id={`${id}-details`} className={`${open ? "block" : "hidden"} border-t border-rule px-4 py-5 md:block md:border-t-0 md:px-5`}>
        <dl className="space-y-3 text-small">
          {/* On desktop the monthly price is already in the top row beside the toggle. */}
          <div className="flex justify-between gap-4 md:hidden">
            <dt>Roger monthly</dt>
            <dd className="tabular-nums">{moneyCents(price.subtotalCents, currency)}</dd>
          </div>
          {promo && price.discountCents > 0 && (
            <div className="flex justify-between gap-4">
              <dt>
                {promo.label}
                {duration && <span className="block text-meta text-ink-2">{duration}</span>}
              </dt>
              <dd className="tabular-nums">−{moneyCents(price.discountCents, currency)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt>{tax.label}</dt>
            <dd className={price.tax === "pending" ? "max-w-[11rem] text-right text-ink-2" : "tabular-nums"}>{tax.value}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-rule pt-3 font-semibold text-ink">
            <dt>{totalLabel}</dt>
            <dd className="tabular-nums">{total}</dd>
          </div>
        </dl>
        {then && <p className="mt-1 text-right text-meta text-ink-2">{then}</p>}

        {promoSlot && <div className="mt-4">{promoSlot}</div>}

        <p className="mt-5 rounded-[8px] bg-accent-wash px-3 py-3 text-small">
          <strong className="font-semibold">{due.lead}</strong> {due.rest}
        </p>
        {notice && (
          <p role="status" className="mt-3 text-small text-ink-2">
            {notice}
          </p>
        )}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {totalLabel} {total}
        {then ? `. ${then}` : ""}
      </p>
    </aside>
  );
}
