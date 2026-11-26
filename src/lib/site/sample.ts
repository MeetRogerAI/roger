/**
 * The play the public sample card shows (plan KTD7, R11): the one chosen in
 * the admin, else the cleaned play bundled with the site, so the section is
 * never absent. The caller passes the bundled play (src/data/site/sample-play.ts).
 */
import { cacheLife, cacheTag } from "next/cache";
import { buildIdeaView, type IdeaView } from "@/lib/cora/idea-view";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";
import { getPublicSamplePlay, type SamplePlay } from "@/lib/cora/sample";

export type { IdeaView, SamplePlay };

/**
 * The line added to the top of every playbook, which the card's copy button
 * puts on the clipboard. Cached for five minutes on the client so a page can
 * await it outside Suspense and keep its app shell (see getAmounts).
 */
export async function getPlaybookPreface(): Promise<string> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
  cacheTag("settings");
  return (await getV3SettingsForDisplay()).playbookPreface;
}

/**
 * What the public sample card shows, from either source. The play's figures
 * are dropped first, so no time-saved figure can reach a public page even
 * from a play chosen in the admin (plan R11, KTD6).
 */
export function publicIdeaView(play: SamplePlay, preface: string): IdeaView {
  return buildIdeaView({ ...play, figures: {} }, preface);
}

export async function resolveSamplePlay(bundled: SamplePlay, read: () => Promise<SamplePlay | null> = getPublicSamplePlay): Promise<SamplePlay> {
  try {
    return (await read()) ?? bundled;
  } catch {
    return bundled;
  }
}
