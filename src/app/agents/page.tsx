import type { Metadata } from "next";
import { V1Agents } from "@/components/site/v1/agents";
import { builtPageMetadata } from "@/lib/site/chrome";
import { getServedSite, requireBuiltVersion } from "@/lib/site/version";

const site = getServedSite();

export const metadata: Metadata = builtPageMetadata(site, "agents", "/agents");

// Under Circles or the legacy site this page is only "not found", so there is no instant shell to validate,
// and development logs an error for trying. It has to be a literal: the build rejects a value worked out from the version.
export const instant = false;

export default function AgentsPage() {
  const version = requireBuiltVersion(site);
  return <V1Agents version={version} />;
}
