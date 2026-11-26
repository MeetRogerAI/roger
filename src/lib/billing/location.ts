import type { BillingCountry } from "./gateway";

/**
 * The billing location the Payment page asks for (plan 2026-11-26-001,
 * Unit 4): Canada and the US only (Peter, 2026-11-26), so a country and a
 * postal code are always enough for Stripe Tax (Canada: the province from the
 * postal code; US: the ZIP's centre point). Anything else is refused on the
 * server, whatever the page sent.
 */
export type BillingLocation = { country: BillingCountry; postal: string };

export type LocationCheck = { ok: true; location: BillingLocation } | { ok: false; reason: "country" | "postal" };

/** Canada Post's letters: never D, F, I, O, Q or U; never W or Z first. */
const CA_POSTAL = /^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]) ?(\d[ABCEGHJ-NPRSTV-Z]\d)$/;
const US_ZIP = /^\d{5}$/;

/** Validates and normalises: "m5v2t6" → "M5V 2T6", " 10001 " → "10001". */
export function checkBillingLocation(country: unknown, postal: unknown): LocationCheck {
  const c = typeof country === "string" ? country.trim().toUpperCase() : "";
  if (c !== "CA" && c !== "US") return { ok: false, reason: "country" };
  const p = typeof postal === "string" ? postal.trim().toUpperCase() : "";
  if (c === "CA") {
    const m = CA_POSTAL.exec(p);
    return m ? { ok: true, location: { country: "CA", postal: `${m[1]} ${m[2]}` } } : { ok: false, reason: "postal" };
  }
  return US_ZIP.test(p) ? { ok: true, location: { country: "US", postal: p } } : { ok: false, reason: "postal" };
}

/** What a person outside Canada and the US reads. */
export const OUTSIDE_COVERAGE = "Roger is available in Canada and the US for now.";
