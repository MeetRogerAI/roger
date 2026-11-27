import type { Metadata } from "next";
import { V1HowItWorks } from "@/components/site/v1/how-it-works";
import { builtPageMetadata } from "@/lib/site/chrome";
import { getServedSite, requireBuiltVersion } from "@/lib/site/version";

const site = getServedSite();

export const metadata: Metadata = builtPageMetadata(site, "howItWorks", "/how-it-works");

// Under Circles or the legacy site this page is only "not found", so there is no instant shell to validate,
// and development logs an error for trying. It has to be a literal: the build rejects a value worked out from the version.
export const instant = false;

export default function HowItWorksPage() {
  const version = requireBuiltVersion(site);
  return <V1HowItWorks version={version} />;
}
