import { cacheLife, cacheTag } from "next/cache";
import { hasDb, sql } from "./db";
import { mergeV3, type V3Settings } from "./v3-settings";

/**
 * The cached read behind getV3SettingsForDisplay. It throws when the database
 * does not answer: a call that throws stores nothing, so the next render asks
 * again. Another cached reader built on these settings (the site's amounts,
 * the playbook preface) calls this one, never the fallback below, or its own
 * entry would keep the defaults
 * (docs/solutions/runtime-errors/catch-inside-use-cache-stores-the-fallback-2026-11-27.md).
 */
export async function cachedV3SettingsForDisplay(): Promise<V3Settings> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86400 });
  cacheTag("settings");
  if (!hasDb()) return mergeV3([]);
  const rows = (await sql`select key, value from settings where key like 'v3.%'`) as { key: string; value: unknown }[];
  return mergeV3(rows);
}

/**
 * v3 settings for pages that only show them (prices, the session card).
 * Cached and tagged "settings" like getSettings(); falls back to the defaults
 * if the database is missing or a saved value is invalid, and, outside the
 * cache, for one render when the database does not answer. Never use this to
 * decide whether to charge, send, or open sign-up: use readV3Settings().
 */
export async function getV3SettingsForDisplay(): Promise<V3Settings> {
  try {
    return await cachedV3SettingsForDisplay();
  } catch (e) {
    console.error("[settings] v3 settings for display: database did not answer, showing the defaults", e instanceof Error ? e.message : e);
    return mergeV3([]);
  }
}
