import type { Metadata } from "next";
import { V1ZackPicker } from "@/components/site/v1/zack";
import { builtPageMetadata } from "@/lib/site/chrome";
import { getServedSite, requireBuiltVersion } from "@/lib/site/version";

const site = getServedSite();

// This address has one meaning: the free Zack run (spec A.11), the agent picker, open to search.
// It is also where /hampton, /rlp and /founders now lead (next.config.ts; Peter's decision of November 26, 2026).
export const metadata: Metadata = builtPageMetadata(site, "zack", "/zack");

// Under Circles or the legacy site this page is only "not found", so there is no instant shell to validate,
// and development logs an error for trying. It has to be a literal: the build rejects a value worked out from the version.
export const instant = false;

export default async function ZackPage() {
  const version = requireBuiltVersion(site);
  return <V1ZackPicker version={version} />;
}
