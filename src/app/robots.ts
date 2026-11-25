import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/config";

/** Previews (preview.meetroger.ai and branch addresses) are public but never indexed. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === "preview") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/thanks/", "/for/", ...(siteConfig.flags.circlesMode ? ["/apply", "/setup", "/companies", "/packs/", "/workshops", "/refunds"] : [])] },
    sitemap: `${siteConfig.domain}/sitemap.xml`,
  };
}
