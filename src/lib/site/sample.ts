/**
 * The plays the public pages show (plan R11): the cleaned examples bundled
 * with the site (src/data/site/examples.ts), so the section is never absent
 * and needs no database. Until November 27, 2026 a play chosen in the admin
 * (/admin/sample) replaced the bundled one. It no longer does: the public
 * pages read the bundled examples only.
 */
import { cacheLife, cacheTag } from "next/cache";
import { buildIdeaView, type IdeaView, type PlaySource } from "@/lib/cora/idea-view";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

type SamplePlay = PlaySource;

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
 * What the public card shows for a play. The play's figures are dropped
 * first, so no time-saved figure can reach a public page whatever a play
 * carries (plan R11, KTD6).
 */
export function publicIdeaView(play: SamplePlay, preface: string): IdeaView {
  return buildIdeaView({ ...play, figures: {} }, preface);
}

export type ExampleView = { id: string; label: string; idea: IdeaView };

/** The bundled examples as the card takes them, in their order. */
export function exampleViews(examples: readonly { id: string; label: string; play: SamplePlay }[], preface: string): ExampleView[] {
  return examples.map((example) => ({ id: example.id, label: example.label, idea: publicIdeaView(example.play, preface) }));
}
