import { hasDb, sql } from "./db";

/**
 * Whether the connected database says it is not production. The marker is a
 * settings row ("db.environment") written by `db/setup.mjs --mark=...` when a
 * Neon branch is made. No marker, or any error, means production.
 */
export async function databaseMarkedNonProduction(): Promise<boolean> {
  if (!hasDb()) return false;
  try {
    const rows = (await sql`select value from settings where key = 'db.environment'`) as { value: unknown }[];
    return rows[0]?.value === "preview" || rows[0]?.value === "local" || rows[0]?.value === "test";
  } catch {
    return false;
  }
}
