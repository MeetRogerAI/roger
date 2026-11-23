import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDb } from "../src/test-helpers/pglite-db";
import { fixturesAllowed, LIVE_DATA_SQL, markRefusal, SEED_TESTIMONIALS_SQL } from "./setup-rules.mjs";

const quotes = readFileSync(new URL("./seeds/testimonials.json", import.meta.url), "utf8");
const none = { leads: 0, synced: 0, accounts: 0 };

describe("markRefusal", () => {
  it("allows marking a fresh branch", () => {
    expect(markRefusal("preview", none)).toBeNull();
  });

  it("refuses a database that holds live data, which is what production looks like", () => {
    expect(markRefusal("local", { ...none, leads: 3 })).toMatch(/live data/);
    expect(markRefusal("local", { ...none, synced: 120 })).toMatch(/live data/);
    expect(markRefusal("local", { ...none, accounts: 1 })).toMatch(/live data/);
  });

  it("refuses an unknown marker", () => {
    expect(markRefusal("production", none)).toMatch(/must be one of/);
  });

  it("counts live data with SQL that runs", async () => {
    const { query } = await testDb();
    const [live] = await query<typeof none>(LIVE_DATA_SQL);
    expect(live).toEqual(none);
    await query("insert into leads (email, kind, persona) values ('a@example.com', 'pack', 'x')");
    expect(markRefusal("preview", (await query<typeof none>(LIVE_DATA_SQL))[0])).toMatch(/1 sign-ups/);
  });
});

describe("fixturesAllowed", () => {
  it("needs the flag and a non-production marker, both", () => {
    expect(fixturesAllowed(true, "preview")).toBe(true);
    expect(fixturesAllowed(false, "preview")).toBe(false);
    expect(fixturesAllowed(true, null)).toBe(false);
    expect(fixturesAllowed(true, "production")).toBe(false);
  });
});

describe("SEED_TESTIMONIALS_SQL", () => {
  it("adds the four quotes once, and not again after an admin deletes them all", async () => {
    const { query } = await testDb();
    await query(SEED_TESTIMONIALS_SQL, [quotes]);
    expect(await query("select 1 from testimonials")).toHaveLength(4);
    await query("delete from testimonials");
    // The statement itself refuses to run twice, whatever the caller checks.
    await query(SEED_TESTIMONIALS_SQL, [quotes]);
    expect(await query("select 1 from testimonials")).toHaveLength(0);
    expect(await query("select 1 from settings where key = 'seed.testimonials'")).toHaveLength(1);
  });
});
