import { SiteLegalPage } from "@/components/site/shared/site-legal";
import { getServedSite, isBuiltVersion } from "@/lib/site/version";
import { circlesTerms } from "@/data/circles-legal";
import { siteLegalMeta } from "@/data/site/legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { terms } from "@/data/legal";

const site = getServedSite();

// A site version has its own draft and its own words for search. Circles and the legacy site keep theirs.
export const metadata: Metadata = isBuiltVersion(site)
  ? {
      title: { absolute: siteLegalMeta.terms.title },
      description: siteLegalMeta.terms.description,
      alternates: { canonical: "/terms" },
      openGraph: { url: "/terms", title: siteLegalMeta.terms.headline, description: siteLegalMeta.terms.description },
    }
  : {
      title: "Terms",
      description: site === "circles" ? "Draft terms and the 45-day guarantee for Roger Circles." : "The plain-language terms for Roger setups.",
      alternates: { canonical: "/terms" },
    };

export default function Page() {
  if (site === "circles") return <LegalPage doc={circlesTerms} reviewed={false} />;
  if (isBuiltVersion(site)) return <SiteLegalPage version={site} name="terms" />;
  return <LegalPage doc={terms} />;
}
