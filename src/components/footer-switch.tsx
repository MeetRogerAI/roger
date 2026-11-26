"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { ServedSite } from "@/lib/site/version";
import { isUnlisted } from "./site-header";

/** A page prepared for one company or group gets a quiet footer: nothing to sell around it. */
export function footerFor(path: string, site: ServedSite): "full" | "minimal" {
  return isUnlisted(path, site) ? "minimal" : "full";
}

export function FooterSwitch({ site, full, minimal }: { site: ServedSite; full: ReactNode; minimal: ReactNode }) {
  const path = usePathname() || "/";
  return <>{footerFor(path, site) === "minimal" ? minimal : full}</>;
}
