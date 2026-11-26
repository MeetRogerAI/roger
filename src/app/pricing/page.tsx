import type { Metadata } from "next";
import { V1Pricing } from "@/components/site/v1/pricing";
import { pageMeta } from "@/lib/site/chrome";
import { getServedSite, isBuiltVersion, requireBuiltVersion } from "@/lib/site/version";

const site = getServedSite();

// This address exists only in a site version (plan KTD4). Under Circles or the legacy site it is not found, so it has nothing to index.
export const metadata: Metadata = isBuiltVersion(site)
  ? {
      title: { absolute: pageMeta(site, "pricing").title },
      description: pageMeta(site, "pricing").description,
      alternates: { canonical: "/pricing" },
      openGraph: { url: "/pricing", title: pageMeta(site, "pricing").headline, description: pageMeta(site, "pricing").description },
    }
  : { robots: { index: false, follow: false } };

// Under Circles or the legacy site this page is only "not found", so there is no instant shell to validate,
// and development logs an error for trying. It has to be a literal: the build rejects a value worked out from the version.
export const instant = false;

export default function PricingPage() {
  const version = requireBuiltVersion(site);
  // v2 and v3 show v1's page until each has its own (U13, U17).
  return <V1Pricing version={version} />;
}
