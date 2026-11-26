/**
 * The agents the free Zack run offers (spec A.11) and the public Zack file
 * each one starts from. Server files only: the list in src/data/zack.ts looks
 * on disk for each agent's file.
 *
 * An agent with no file of its own, and "other" for an agent we do not list,
 * start from the Hark file and adapt it, as on /hampton.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { zackAgents } from "@/data/zack";

/** The address and the stored agent for "Agent not listed". */
export const OTHER_AGENT = "other";
const BASE_AGENT = "hark";

export type FreeRunAgent = {
  slug: string;
  /** Null for "other": the visitor names their own agent. */
  name: string | null;
  /** The public file to start from, under /zack/. */
  file: string;
  /** Whose file that is: the agent's own name, or Hark's when it has none. */
  fileFor: string;
  /** False when the agent starts from the Hark file and adapts it. */
  hasOwnFile: boolean;
};

type Listed = { slug: string; name: string; file: string; available: boolean };

/** Every agent with a page under /zack, in the list's order, then "other". */
export function freeRunAgents(listed: readonly Listed[] = zackAgents): FreeRunAgent[] {
  const base = listed.find((a) => a.slug === BASE_AGENT && a.available) ?? listed.find((a) => a.available);
  // With no public file at all there is nothing to run.
  if (!base) return [];
  const agents = listed.map((a) => (a.available ? { slug: a.slug, name: a.name, file: a.file, fileFor: a.name, hasOwnFile: true } : { slug: a.slug, name: a.name, file: base.file, fileFor: base.name, hasOwnFile: false }));
  return [...agents, { slug: OTHER_AGENT, name: null, file: base.file, fileFor: base.name, hasOwnFile: false }];
}

export function freeRunAgent(slug: string, listed: readonly Listed[] = zackAgents): FreeRunAgent | null {
  return freeRunAgents(listed).find((a) => a.slug === slug) ?? null;
}

/** "2.0" from the file's own "Version 2.0 · …" line; "" when it has none. */
export function fileVersion(text: string): string {
  return text.match(/^Version\s+(\d+(?:\.\d+)+)/m)?.[1] ?? "";
}

export type ZackFile = { text: string; version: string };

/** A public Zack file as it is served, with the version it states. Read from the file Download serves, so Copy and Download never differ. */
export async function zackFile(file: string): Promise<ZackFile> {
  "use cache";
  const text = await readFile(path.join(process.cwd(), "public", "zack", path.basename(file)), "utf8");
  return { text, version: fileVersion(text) };
}

/** The name a downloaded file is saved under. */
export function downloadName(fileFor: string, version: string): string {
  return `Zack The Collector (for ${fileFor})${version ? ` v${version}` : ""}.md`;
}
