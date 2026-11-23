import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { SimpleMarkdown } from "@/components/app/simple-markdown";
import { isZackAgent, ZACK_AGENTS } from "@/lib/zack/agents";

export const metadata: Metadata = { title: "What Zack does", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return ZACK_AGENTS.map((agent) => ({ agent }));
}

async function zackText(agent: string): Promise<string> {
  "use cache";
  cacheLife("max");
  return readFile(path.join(process.cwd(), "content/zack", `${agent}.md`), "utf8");
}

/** "Read what Zack does first" (spec B.4): the full Zack 2.0 instructions for the person's AI agent. */
export default async function ZackText({ params }: PageProps<"/start/zack/[agent]">) {
  const { agent } = await params;
  if (!isZackAgent(agent)) notFound();
  const text = await zackText(agent);
  return (
    <article>
      <p className="text-small text-ink-2">These are the exact instructions Zack follows. Your own rules are added at the end once you’re set up.</p>
      <SimpleMarkdown source={text} className="mt-8 text-small" />
    </article>
  );
}
