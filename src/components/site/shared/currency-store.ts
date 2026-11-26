"use client";

import { useSyncExternalStore } from "react";
import type { Currency } from "@/lib/site/amounts";

/**
 * The visitor's USD or CAD choice, kept for the tab (plan KTD10). Lifted from
 * src/components/circles/price.tsx with the same storage key and window event,
 * so a choice made on the Circles site holds on a site version and back.
 * Every price block and every start link on a page reads this one store.
 */
export type { Currency };

export const currencyStorageKey = "roger-circles-currency";
export const currencyEvent = "roger-currency";

// Private browsing may disable storage; the choice then lasts until the page is reloaded.
let unsaved: Currency | null = null;

/** The currency the visitor picked this visit, or null if they have not picked one. */
export function chosenCurrency(): Currency | null {
  try {
    const saved = sessionStorage.getItem(currencyStorageKey);
    if (saved === "USD" || saved === "CAD") return saved;
  } catch {
    /* Storage is unavailable. */
  }
  return unsaved;
}

export function subscribeCurrency(listener: () => void) {
  window.addEventListener(currencyEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(currencyEvent, listener);
    window.removeEventListener("storage", listener);
  };
}

export function chooseCurrency(value: Currency) {
  unsaved = value;
  try {
    sessionStorage.setItem(currencyStorageKey, value);
  } catch {
    /* Optional persistence. */
  }
  window.dispatchEvent(new Event(currencyEvent));
}

/**
 * The currency to show and the function that changes it. `initial` is the
 * default for the visitor's country; it is what the server renders and what
 * shows until the visitor picks.
 */
export function useCurrency(initial: Currency = "USD"): [Currency, (value: Currency) => void] {
  const currency = useSyncExternalStore(
    subscribeCurrency,
    () => chosenCurrency() ?? initial,
    () => initial,
  );
  return [currency, chooseCurrency];
}
