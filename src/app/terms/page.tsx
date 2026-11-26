import { SiteNotBuilt } from "@/components/site/not-built";
import { bySite, getServedSite, isBuiltVersion } from "@/lib/site/version";
import { circlesTerms } from "@/data/circles-legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { terms } from "@/data/legal";

const site = getServedSite();

export const metadata: Metadata = {
  title: "Terms",
  description: bySite<string | undefined>(site, { circles: "Draft terms and the 45-day guarantee for Roger Circles.", built: undefined, legacy: "The plain-language terms for Roger setups." }),
  alternates: { canonical: "/terms" },
  // The placeholder stays out of search until the version's own terms are written.
  ...(isBuiltVersion(site) ? { robots: { index: false, follow: false } } : {}),
};

export default function Page() {
  if (site === "circles") return <LegalPage doc={circlesTerms} reviewed={false} />;
  // The Circles terms do not describe a site version, so nothing is shown until its own are written.
  if (isBuiltVersion(site)) return <SiteNotBuilt version={site} page="Terms" />;
  return <LegalPage doc={terms} />;
}
