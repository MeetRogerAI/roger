import { SiteNotBuilt } from "@/components/site/not-built";
import { getServedSite, isBuiltVersion } from "@/lib/site/version";
import { circlesPrivacyPreview } from "@/data/circles-legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { privacy } from "@/data/legal";

const site = getServedSite();

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Roger collects, why, and what stays in your browser.",
  alternates: { canonical: "/privacy" },
  // The placeholder stays out of search until the version's own text is written.
  ...(isBuiltVersion(site) ? { robots: { index: false, follow: false } } : {}),
};

export default function Page() {
  if (site === "circles") return <LegalPage doc={circlesPrivacyPreview} reviewed={false} />;
  // The Circles text does not describe a site version, so nothing is shown until its own is written.
  if (isBuiltVersion(site)) return <SiteNotBuilt version={site} page="Privacy" />;
  return <LegalPage doc={privacy} />;
}
