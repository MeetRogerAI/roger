"use client";

import type { ReactNode } from "react";
import { isUnlisted, useShownPath } from "./site-header";

/** A page prepared for one company or group gets a quiet footer: nothing to sell around it. */
export function footerFor(path: string): "full" | "minimal" {
  return isUnlisted(path) ? "minimal" : "full";
}

/** Drawn for the same path as the header (useShownPath): on the not-found page, the not-found route, never the address. */
export function FooterSwitch({ full, minimal }: { full: ReactNode; minimal: ReactNode }) {
  const path = useShownPath();
  return <>{footerFor(path) === "minimal" ? minimal : full}</>;
}
