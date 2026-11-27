"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isHeroSketch, isUnlisted } from "./site-header";

/**
 * A page prepared for one company or group gets a quiet footer: nothing to sell around it.
 * A v2 hero sketch gets none: it is a first screen and the start of the next section, and nothing more.
 * `sketches` is whether this build serves the sketches (see isHeroSketch); where it does not, no path loses its footer.
 */
export function footerFor(path: string, sketches = false): "full" | "minimal" | "none" {
  if (isHeroSketch(path, sketches)) return "none";
  return isUnlisted(path) ? "minimal" : "full";
}

export function FooterSwitch({ full, minimal, sketches = false }: { full: ReactNode; minimal: ReactNode; sketches?: boolean }) {
  const path = usePathname() || "/";
  const footer = footerFor(path, sketches);
  if (footer === "none") return null;
  return <>{footer === "minimal" ? minimal : full}</>;
}
