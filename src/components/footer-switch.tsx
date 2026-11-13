"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A page prepared for one company or group gets a quiet footer: nothing to sell around it. */
export function FooterSwitch({ full, minimal }: { full: ReactNode; minimal: ReactNode }) {
  const path = usePathname() || "/";
  return <>{path.startsWith("/for/") || path === "/rlpsignature" || path === "/hampton" || path === "/founders" || path === "/rlp" ? minimal : full}</>;
}
