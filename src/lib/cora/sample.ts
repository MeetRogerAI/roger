import { cacheLife, cacheTag } from "next/cache";
import { hasDb, sql } from "@/lib/db";

/**
 * The one pool play chosen in the admin to show on the public site (spec A.4,
 * "Sample idea card"). Returns null until a play is chosen, and on any error,
 * so the public section is simply absent.
 *
 * Cached and tagged "sample-play": choosing a new one in the admin calls
 * updateTag("sample-play") and the public pages show it on the next view.
 */
export type SamplePlay = {
  id: string;
  title: string;
  category: string;
  description: string;
  heavyUseFor: string;
  playbookMd: string;
  pasteToInstall: string;
  figures: Record<string, unknown>;
  scores: { hours: number | null; reach: number | null; ease: number | null; proof: number | null; surprise: number | null };
  score: number | null;
};

export const SAMPLE_PLAY_TAG = "sample-play";

export async function getPublicSamplePlay(): Promise<SamplePlay | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(SAMPLE_PLAY_TAG);
  if (!hasDb()) return null;
  try {
    const rows = (await sql`
      select id, title, category, description, heavy_use_for, playbook_md, paste_to_install, figures,
             f_hours, f_reach, f_ease, f_proof, f_surprise, score
      from pool_plays where is_public_sample and active limit 1`) as Record<string, unknown>[];
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      title: r.title as string,
      category: r.category as string,
      description: r.description as string,
      heavyUseFor: r.heavy_use_for as string,
      playbookMd: r.playbook_md as string,
      pasteToInstall: r.paste_to_install as string,
      figures: (r.figures as Record<string, unknown>) ?? {},
      scores: {
        hours: r.f_hours as number | null,
        reach: r.f_reach as number | null,
        ease: r.f_ease as number | null,
        proof: r.f_proof as number | null,
        surprise: r.f_surprise as number | null,
      },
      score: r.score as number | null,
    };
  } catch {
    return null;
  }
}
