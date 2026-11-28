"use client";

import type { ReactNode } from "react";
import { isUnlisted, useShownPath } from "./site-header";

/** The Payment step (and its return page) has no footer at all: nothing to leave by but "Not now" and the policy links (origin R22). */
export const isPaymentPath = (path: string) => path === "/start/payment" || path.startsWith("/start/payment/");

/** A page prepared for one company or group gets a quiet footer: nothing to sell around it. */
export function footerFor(path: string): "full" | "minimal" {
  return isUnlisted(path) ? "minimal" : "full";
}

/** Drawn for the same path as the header (useShownPath): on the not-found page, the not-found route, never the address. */
export function FooterSwitch({ full, minimal }: { full: ReactNode; minimal: ReactNode }) {
  const path = useShownPath();
  if (isPaymentPath(path)) return null;
  return <>{footerFor(path) === "minimal" ? minimal : full}</>;
}
