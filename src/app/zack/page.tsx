import type { Metadata } from "next";
import { V1ZackPicker } from "@/components/site/v1/zack";
import { zackMeta } from "@/lib/site/chrome";
import { getServedSite, isBuiltVersion } from "@/lib/site/version";
import HamptonPage, { metadata as hampton } from "../hampton/page";

const site = getServedSite();

// Under Circles, exactly the same page as /hampton, at its own link.
// Under a site version this address is the free Zack run (spec A.11): the agent picker, open to search.
export const metadata: Metadata = isBuiltVersion(site)
  ? {
      title: { absolute: zackMeta(site).title },
      description: zackMeta(site).description,
      alternates: { canonical: "/zack" },
      openGraph: { url: "/zack", title: zackMeta(site).headline, description: zackMeta(site).description },
    }
  : {
      ...hampton,
      alternates: { canonical: "/zack" },
      openGraph: { ...hampton.openGraph, url: "/zack" },
    };

export default async function ZackPage() {
  if (isBuiltVersion(site)) return <V1ZackPicker version={site} />;
  return HamptonPage();
}
