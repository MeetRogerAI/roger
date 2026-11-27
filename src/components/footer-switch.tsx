"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isUnlisted } from "./site-header";

/** A page prepared for one company or group gets a quiet footer: nothing to sell around it. */
export function footerFor(path: string): "full" | "minimal" {
  return isUnlisted(path) ? "minimal" : "full";
}

export function FooterSwitch({ full, minimal }: { full: ReactNode; minimal: ReactNode }) {
  const path = usePathname() || "/";
  return <>{footerFor(path) === "minimal" ? minimal : full}</>;
}
