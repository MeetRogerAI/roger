import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDb } from "../src/test-helpers/pglite-db";
import { splitSchema } from "./schema-split.mjs";

const statements: string[] = splitSchema(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

describe("schema.sql on a real Postgres", () => {
  it("survives a second run, and the token purposes are checked by the database", async () => {
    const { db, query } = await testDb(); // already applied once
    for (const s of statements) await db.query(s);
    const purposeChecks = await query<{ n: number }>(
      `select count(*)::int as n from pg_constraint where conrelid = 'login_tokens'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%purpose%'`,
    );
    expect(purposeChecks[0].n).toBe(1);
    const insert = (purpose: string) =>
      query(`insert into login_tokens (token_hash, email, purpose, expires_at) values ($1, 'a@example.com', $2, now() + interval '1 hour')`, [`h-${purpose}`, purpose]);
    for (const ok of ["signin", "pilot", "email_change", "email_approve"]) await insert(ok);
    await expect(insert("email_revert")).rejects.toThrow(/check constraint/);
    await expect(insert("whatever")).rejects.toThrow(/check constraint/);
  });

  it("replaces a purpose check of any name", async () => {
    const { db, query } = await testDb();
    await db.query(`alter table login_tokens drop constraint login_tokens_purpose_check`);
    await db.query(`alter table login_tokens add constraint some_other_name check (purpose in ('signin'))`);
    for (const s of statements) await db.query(s);
    const names = await query<{ conname: string }>(`select conname from pg_constraint where conrelid = 'login_tokens'::regclass and contype = 'c'`);
    expect(names.map((n) => n.conname)).toEqual(["login_tokens_purpose_check"]);
  });
});
