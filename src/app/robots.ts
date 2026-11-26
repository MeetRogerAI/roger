import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/config";
import { bySite, getServedSite } from "@/lib/site/version";

// Hidden while Circles or a site version is served; /apply only redirects under a version.
const hiddenLegacy = ["/apply", "/setup", "/companies", "/packs/", "/workshops", "/refunds"];

/** Previews (preview.meetroger.ai and branch addresses) are public but never indexed. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === "preview") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/thanks/", "/for/", ...bySite(getServedSite(), { circles: hiddenLegacy, built: hiddenLegacy, legacy: [] })] },
    sitemap: `${siteConfig.domain}/sitemap.xml`,
  };
}
