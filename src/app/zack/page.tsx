import type { Metadata } from "next";
import { SiteNotBuilt } from "@/components/site/not-built";
import { getServedSite, isBuiltVersion } from "@/lib/site/version";
import HamptonPage, { metadata as hampton } from "../hampton/page";

const site = getServedSite();

// Under Circles, exactly the same page as /hampton, at its own link.
// Under a site version this address is the free Zack run, which is not built yet.
export const metadata: Metadata = isBuiltVersion(site)
  ? { title: "Run Zack", robots: { index: false, follow: false }, alternates: { canonical: "/zack" } }
  : {
      ...hampton,
      alternates: { canonical: "/zack" },
      openGraph: { ...hampton.openGraph, url: "/zack" },
    };

export default async function ZackPage() {
  if (isBuiltVersion(site)) return <SiteNotBuilt version={site} page="Run Zack" />;
  return HamptonPage();
}
