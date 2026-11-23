import { cacheLife, cacheTag } from "next/cache";
import { hasDb, sql } from "./db";
import { mergeV3, type V3Settings } from "./v3-settings";

/**
 * v3 settings for pages that only show them (prices, the session card).
 * Cached and tagged "settings" like getSettings(); falls back to the defaults
 * if the database is missing or a saved value is invalid. Never use this to
 * decide whether to charge, send, or open sign-up: use readV3Settings().
 */
export async function getV3SettingsForDisplay(): Promise<V3Settings> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86400 });
  cacheTag("settings");
  const fallback = mergeV3([]);
  if (!hasDb()) return fallback;
  try {
    const rows = (await sql`select key, value from settings where key like 'v3.%'`) as { key: string; value: unknown }[];
    return mergeV3(rows);
  } catch {
    return fallback;
  }
}

