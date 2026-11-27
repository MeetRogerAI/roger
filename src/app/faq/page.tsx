import type { Metadata } from "next";
import { V1Faq } from "@/components/site/v1/faq";
import { builtPageMetadata } from "@/lib/site/chrome";
import { getServedSite, requireBuiltVersion } from "@/lib/site/version";

const site = getServedSite();

export const metadata: Metadata = builtPageMetadata(site, "faq", "/faq");

// Under Circles or the legacy site this page is only "not found", so there is no instant shell to validate,
// and development logs an error for trying. It has to be a literal: the build rejects a value worked out from the version.
export const instant = false;

export default function FaqPage() {
  const version = requireBuiltVersion(site);
  return <V1Faq version={version} />;
}
