import type { Metadata } from "next";
import { V1Agents } from "@/components/site/v1/agents";
import { agentsMeta } from "@/lib/site/chrome";
import { getServedSite, isBuiltVersion, requireBuiltVersion } from "@/lib/site/version";

const site = getServedSite();

// This address exists only in a site version (plan KTD4). Under Circles or the legacy site it is not found, so it has nothing to index.
export const metadata: Metadata = isBuiltVersion(site)
  ? {
      title: { absolute: agentsMeta(site).title },
      description: agentsMeta(site).description,
      alternates: { canonical: "/agents" },
      openGraph: { url: "/agents", title: agentsMeta(site).headline, description: agentsMeta(site).description },
    }
  : { robots: { index: false, follow: false } };

// Under Circles or the legacy site this page is only "not found", so there is no instant shell to validate,
// and development logs an error for trying. It has to be a literal: the build rejects a value worked out from the version.
export const instant = false;

export default function AgentsPage() {
  const version = requireBuiltVersion(site);
  // v2 and v3 show v1's page until each has its own (U13, U17).
  return <V1Agents version={version} />;
}
