/**
 * The play the public sample card shows (plan KTD7, R11): the one chosen in
 * the admin, else the cleaned play bundled with the site, so the section is
 * never absent. The caller passes the bundled play (src/data/site/sample-play.ts).
 */
import { getPublicSamplePlay, type SamplePlay } from "@/lib/cora/sample";

export type { SamplePlay };

export async function resolveSamplePlay(bundled: SamplePlay, read: () => Promise<SamplePlay | null> = getPublicSamplePlay): Promise<SamplePlay> {
  try {
    return (await read()) ?? bundled;
  } catch {
    return bundled;
  }
}
