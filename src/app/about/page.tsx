import type { Metadata } from "next";
import { V1About } from "@/components/site/v1/about";
import { builtPageMetadata } from "@/lib/site/chrome";
import { getServedSite, requireBuiltVersion } from "@/lib/site/version";

const site = getServedSite();

export const metadata: Metadata = builtPageMetadata(site, "about", "/about");

// Under Circles or the legacy site this page is only "not found", so there is no instant shell to validate,
// and development logs an error for trying. It has to be a literal: the build rejects a value worked out from the version.
export const instant = false;

export default function AboutPage() {
  const version = requireBuiltVersion(site);
  return <V1About version={version} />;
}
