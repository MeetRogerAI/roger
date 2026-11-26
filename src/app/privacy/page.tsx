import { SiteLegalPage } from "@/components/site/shared/site-legal";
import { getServedSite, isBuiltVersion } from "@/lib/site/version";
import { circlesPrivacyPreview } from "@/data/circles-legal";
import { siteLegalMeta } from "@/data/site/legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { privacy } from "@/data/legal";

const site = getServedSite();

// A site version has its own draft and its own words for search. Circles and the legacy site keep theirs.
export const metadata: Metadata = isBuiltVersion(site)
  ? {
      title: { absolute: siteLegalMeta.privacy.title },
      description: siteLegalMeta.privacy.description,
      alternates: { canonical: "/privacy" },
      openGraph: { url: "/privacy", title: siteLegalMeta.privacy.headline, description: siteLegalMeta.privacy.description },
    }
  : {
      title: "Privacy",
      description: "What Roger collects, why, and what stays in your browser.",
      alternates: { canonical: "/privacy" },
    };

export default function Page() {
  if (site === "circles") return <LegalPage doc={circlesPrivacyPreview} reviewed={false} />;
  if (isBuiltVersion(site)) return <SiteLegalPage version={site} name="privacy" />;
  return <LegalPage doc={privacy} />;
}
