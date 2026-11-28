"use client";

import type { ReactNode } from "react";
import { isHeroSketch, isUnlisted, useShownPath } from "./site-header";

/** The Payment step (and its return page) has no footer at all: nothing to leave by but "Not now" and the policy links (origin R22). */
export const isPaymentPath = (path: string) => path === "/start/payment" || path.startsWith("/start/payment/");

/**
 * A page prepared for one company or group gets a quiet footer: nothing to sell around it.
 * A v2 hero sketch gets none: it is a first screen and the start of the next section, and nothing more.
 * `sketches` is whether this build serves the sketches (see isHeroSketch); where it does not, no path loses its footer.
 */
export function footerFor(path: string, sketches = false): "full" | "minimal" | "none" {
  if (isHeroSketch(path, sketches)) return "none";
  return isUnlisted(path) ? "minimal" : "full";
}

/** Drawn for the same path as the header (useShownPath): on the not-found page, the not-found route, never the address. */
export function FooterSwitch({ full, minimal, sketches = false }: { full: ReactNode; minimal: ReactNode; sketches?: boolean }) {
  const path = useShownPath();
  if (isPaymentPath(path)) return null;
  const footer = footerFor(path, sketches);
  if (footer === "none") return null;
  return <>{footer === "minimal" ? minimal : full}</>;
}
