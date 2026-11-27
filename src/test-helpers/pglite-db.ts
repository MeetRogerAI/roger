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

/** The sponsor testSponsor() makes by default, for tests that only need a member to be sponsored. */
export const TEST_SPONSOR = "00000000-0000-4000-8000-000000000001";

/**
 * Adds a sponsor row and returns its id. users.sponsor_id references sponsors
 * (since B2), so a sponsored test member needs one. Safe to call twice.
 */
export async function testSponsor(query: Query, id: string = TEST_SPONSOR): Promise<string> {
  await query(
    "insert into sponsors (id, name, currency, standard_cents, higher_cents, seats, code_hash, billing_email) values ($1, 'Test sponsor', 'USD', 20000, 40000, 100, $2, 'billing@example.com') on conflict do nothing",
    [id, `test_${id}`],
  );
  return id;
}

export async function testDb(): Promise<{ db: PGlite; query: Query }> {
  const db = new PGlite({ loadDataDir: await schemaSnapshot() });
  const query: Query = async <T,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
  return { db, query };
}
