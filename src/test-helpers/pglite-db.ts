import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { Query } from "@/lib/db-query";
import { splitSchema } from "../../db/schema-split.mjs";

/**
 * A fresh in-process Postgres with schema.sql applied, for tests that must
 * run real SQL (claims, uniqueness, single-statement updates).
 *
 * The schema is applied once per test worker and kept as a snapshot; each
 * test starts from a copy of it. Applying the whole schema for every test
 * grew slow enough to time out when all test files run in parallel.
 */
let template: Promise<Blob> | null = null;

function schemaSnapshot(): Promise<Blob> {
  template ??= (async () => {
    const db = new PGlite();
    const schema = readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8");
    for (const s of splitSchema(schema)) await db.query(s);
    const snapshot = (await db.dumpDataDir("none")) as Blob;
    await db.close();
    return snapshot;
  })();
  return template;
}

export async function testDb(): Promise<{ db: PGlite; query: Query }> {
  const db = new PGlite({ loadDataDir: await schemaSnapshot() });
  const query: Query = async <T,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
  return { db, query };
}
