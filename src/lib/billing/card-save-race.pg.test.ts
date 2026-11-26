import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { splitSchema } from "../../../db/schema-split.mjs";
import { NON_PRODUCTION } from "../../../db/setup-rules.mjs";
import { CARD_SAVE_CLAIM_SQL } from "./card-setup";

/**
 * The card-save claim's last-slot race on a real, networked Postgres (plan
 * 2026-11-26-001, Unit 5 review F8). PGlite runs one statement at a time, so
 * there the race is shown with a trigger; here two claims run at once on
 * separate connections (Neon over HTTP: one connection and one transaction per
 * statement, as in production).
 *
 * Skipped unless RACE_TEST_DATABASE_URL points at a Neon database marked
 * non-production by db/setup.mjs (--mark=test, local or preview); the test
 * refuses an unmarked one. It applies the schema (idempotent), makes two
 * members and a code of its own, and deletes them afterwards.
 */
const url = process.env.RACE_TEST_DATABASE_URL;

describe.skipIf(!url)("CARD_SAVE_CLAIM_SQL on a real Postgres", () => {
  it("two members claiming the last use of a limited code at once on separate connections: exactly one reservation", { timeout: 120_000 }, async () => {
    const sql = neon(url!);
    const q: Query = async <T,>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];
    const [marker] = await q<{ value: string }>(`select value #>> '{}' as value from settings where key = 'db.environment'`).catch(() => []);
    if (!marker || !NON_PRODUCTION.includes(marker.value)) throw new Error("RACE_TEST_DATABASE_URL must be a database marked non-production (db/setup.mjs --mark=test)");
    for (const s of splitSchema(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf8"))) await q(s);

    const code = `promo_race_${randomUUID()}`;
    const ids: string[] = [];
    for (const who of ["a", "b"]) {
      const [u] = await q<{ id: string }>(
        `insert into users (email, name, status, plan, currency, consent_at, signup_step, promo_code, promo_coupon)
         values ($1, 'Race test', 'trial', 'monthly', 'USD', now(), 'done', 'RACE', 'coupon_race') returning id`,
        [`race-${who}-${randomUUID()}@example.test`],
      );
      ids.push(u.id);
    }
    try {
      const now = new Date().toISOString();
      // $1 user, $2 clock, $3 currency, $4 country, $5 pending code, $6 promotion code id, $7 max, $8 Stripe's redeemed, $9 first-time, $10 fingerprint.
      const claim = (userId: string) => q<{ verdict: string; saved: boolean }>(CARD_SAVE_CLAIM_SQL, [userId, now, "USD", "US", "RACE", code, 1, 0, false, null]);
      const first = await Promise.all(ids.map(claim));
      const verdicts = first.map((r) => r[0].verdict);
      // Whoever lost the slot after its count (lost_race, nothing written) counts again and is refused.
      for (const [i, v] of verdicts.entries()) if (v === "lost_race") verdicts[i] = (await claim(ids[i]))[0].verdict;
      expect(verdicts.sort()).toEqual(["refused", "reserved"]);

      const rows = await q<{ user_id: string; slot: number }>(`select user_id, slot from promo_reservations where promotion_code = $1`, [code]);
      expect(rows).toHaveLength(1);
      expect(rows[0].slot).toBe(1);
      const users = await q<{ saved: boolean; promo_code: string | null }>(`select trial_started_at is not null as saved, promo_code from users where id = any($1::uuid[])`, [ids]);
      expect(users.every((u) => u.saved)).toBe(true);
      expect(users.filter((u) => u.promo_code === "RACE")).toHaveLength(1);
    } finally {
      await q(`delete from users where id = any($1::uuid[])`, [ids]);
    }
  });
});
