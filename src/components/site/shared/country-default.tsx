import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { currencyForCountry, type Currency } from "@/lib/site/amounts";

/**
 * Renders its child for the visitor's country (plan KTD10), the way the
 * Circles home does: the header is read in a child under Suspense, so the page
 * keeps its static shell. The shell holds the USD rendering and the streamed
 * part replaces it for Canada.
 *
 *   <CountryDefault>{(currency) => <PriceBlock initialCurrency={currency} />}</CountryDefault>
 */
type Render = (currency: Currency) => ReactNode;

export function CountryDefault({ children }: { children: Render }) {
  return (
    <Suspense fallback={children("USD")}>
      <ForCountry>{children}</ForCountry>
    </Suspense>
  );
}

async function ForCountry({ children }: { children: Render }) {
  const h = await headers();
  return children(currencyForCountry(h.get("x-vercel-ip-country")));
}
