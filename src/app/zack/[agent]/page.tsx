import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { V1ZackAgent } from "@/components/site/v1/zack";
import { zackMeta } from "@/lib/site/chrome";
import { getServedSite, isBuiltVersion, requireBuiltVersion } from "@/lib/site/version";
import { freeRunAgent, freeRunAgents } from "@/lib/site/zack-files";

const site = getServedSite();
const hidden = { index: false, follow: false } as const;

/** One page per agent in the list, and "other". Any other address is not found. */
export function generateStaticParams() {
  return freeRunAgents().map((agent) => ({ agent: agent.slug }));
}

/**
 * This address exists only in a site version (plan KTD4). The page for an
 * agent is open to search; the same page with a run token in its address is
 * one visitor's own, and is kept out.
 */
export async function generateMetadata({ params, searchParams }: PageProps<"/zack/[agent]">): Promise<Metadata> {
  if (!isBuiltVersion(site)) return { robots: hidden };
  const { agent: slug } = await params;
  const agent = freeRunAgent(slug);
  if (!agent) return { robots: hidden };
  const meta = zackMeta(site);
  const title = agent.name ? `${meta.title}: ${agent.name}` : meta.title;
  const { run } = await searchParams;
  return {
    title: { absolute: title },
    description: meta.description,
    alternates: { canonical: `/zack/${agent.slug}` },
    openGraph: { url: `/zack/${agent.slug}`, title: meta.headline, description: meta.description },
    ...(run === undefined ? {} : { robots: hidden }),
  };
}

// Under Circles or the legacy site this page is only "not found", so there is no instant shell to validate,
// and development logs an error for trying. It has to be a literal: the build rejects a value worked out from the version.
export const instant = false;

export default async function ZackAgentPage({ params, searchParams }: PageProps<"/zack/[agent]">) {
  const version = requireBuiltVersion(site);
  const { agent: slug } = await params;
  const agent = freeRunAgent(slug);
  if (!agent) notFound();
  // v2 and v3 show v1's page until each has its own (U13, U17).
  return <V1ZackAgent version={version} agent={agent} searchParams={searchParams} />;
}
