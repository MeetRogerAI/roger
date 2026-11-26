"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The Payment step (and its return page) has no footer at all: nothing to leave by but "Not now" and the policy links (origin R22). */
export const isPaymentPath = (path: string) => path === "/start/payment" || path.startsWith("/start/payment/");

/** A page prepared for one company or group gets a quiet footer: nothing to sell around it. */
export function FooterSwitch({ full, minimal }: { full: ReactNode; minimal: ReactNode }) {
  const path = usePathname() || "/";
  if (isPaymentPath(path)) return null;
  return <>{path.startsWith("/for/") || path === "/rlpsignature" || path === "/hampton" || path === "/founders" || path === "/rlp" || path === "/zack" ? minimal : full}</>;
}
