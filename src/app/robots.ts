import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/config";
import { bySite, getServedSite } from "@/lib/site/version";

// Hidden while Circles or a site version is served; /apply only redirects under a version.
const hiddenLegacy = ["/apply", "/setup", "/companies", "/packs/", "/workshops", "/refunds"];
// A site version also keeps crawlers out of the app, the admin, sign-up and the API (spec A.2).
// "/app" alone is a prefix rule and would also cover /apple-icon: "/app/" and "/app$" cover the app and nothing else.
const builtHidden = [...hiddenLegacy, "/app/", "/app$", "/admin", "/start", "/api"];
// The one API address a visitor's own AI agent fetches, during Zack setup (src/lib/zack/instructions.ts).
// A fetch tool that obeys robots.txt would be refused it otherwise. The longest matching rule wins
// (RFC 9309), so this Allow beats "Disallow: /api" for this address only.
const builtAllowed = ["/", "/api/zack/instructions"];

/** Previews (preview.meetroger.ai and branch addresses) are public but never indexed. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === "preview") return { rules: { userAgent: "*", disallow: "/" } };
  const site = getServedSite();
  return {
    rules: {
      userAgent: "*",
      allow: bySite<string | string[]>(site, { circles: "/", built: builtAllowed, legacy: "/" }),
      disallow: ["/thanks/", "/for/", ...bySite(site, { circles: hiddenLegacy, built: builtHidden, legacy: [] })],
    },
    sitemap: `${siteConfig.domain}/sitemap.xml`,
  };
}
