import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { splitSchema } from "./schema-split.mjs";

// Applies schema.sql to a real (in-process) Postgres, the way setup.mjs does.
const statements: string[] = splitSchema(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

let db: PGlite;
const apply = async () => {
  for (const s of statements) await db.query(s);
};

beforeAll(async () => {
  db = new PGlite();
  await apply();
}, 60_000);

const columns = async () =>
  (
    await db.query<{ t: string; c: string }>(
      "select table_name as t, column_name as c from information_schema.columns where table_schema = 'public' order by 1, 2",
    )
  ).rows.map((r) => `${r.t}.${r.c}`);

describe("schema.sql on Postgres", () => {
  it("applies a second time with no error and no change", async () => {
    const before = await columns();
    await apply();
    expect(await columns()).toEqual(before);
  });

  it("lets one seed contributor keep runs from different agents in one week, but not two from the same agent", async () => {
    const [{ id }] = (await db.query<{ id: string }>("insert into seed_contributors (label) values ('Seed 1') returning id")).rows;
    const run = (agent: string) =>
      db.query("insert into runs (contributor_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-11-16', 'seed', $2, 'share', 'x')", [id, agent]);
    await run("claude");
    await run("hark");
    await expect(run("claude")).rejects.toThrow();
  });

  it("requires a run to belong to exactly one of a user or a seed contributor", async () => {
    await expect(
      db.query("insert into runs (week_of, route, sharing, raw_text) values ('2026-11-16', 'upload', 'share', 'x')"),
    ).rejects.toThrow();
  });

  it("keeps one run per user per week, and allows a new one after deletion", async () => {
    const [{ id }] = (await db.query<{ id: string }>("insert into users (email) values ('a@example.com') returning id")).rows;
    const insert = () =>
      db.query<{ id: string }>("insert into runs (user_id, week_of, route, sharing, raw_text) values ($1, '2026-11-23', 'upload', 'share', 'x') returning id", [id]);
    const first = (await insert()).rows[0].id;
    await expect(insert()).rejects.toThrow();
    await db.query("update runs set status = 'deleted' where id = $1", [first]);
    await expect(insert()).resolves.toBeTruthy();
  });

  it("claims an email once per (recipient, kind, ref)", async () => {
    const claim = () =>
      db.query("insert into notifications (recipient, kind, ref) values ('admins', 'cora_failed', '2026-11-23') on conflict do nothing returning id");
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
  });

  it("claims a charge attempt once", async () => {
    const [{ id }] = (await db.query<{ id: string }>("insert into users (email) values ('b@example.com') returning id")).rows;
    const claim = () =>
      db.query("insert into charge_attempts (user_id, purpose, week_of, attempt) values ($1, 'first_charge', '2026-11-30', 1) on conflict do nothing returning id", [id]);
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
  });

  it("allows at most three picks per user per week and only one public sample", async () => {
    const [{ id: u }] = (await db.query<{ id: string }>("insert into users (email) values ('c@example.com') returning id")).rows;
    const [{ id: p }] = (
      await db.query<{ id: string }>(
        "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, is_public_sample) values ('t','Research','d','p','i','2026-11-16','2026-11-16', true) returning id",
      )
    ).rows;
    await expect(
      db.query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1,'2026-11-23',4,$2,50,3,'r')", [u, p]),
    ).rejects.toThrow();
    await expect(
      db.query("insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, is_public_sample) values ('t2','Research','d','p','i','2026-11-16','2026-11-16', true)"),
    ).rejects.toThrow();
  });

  it("increments a rate counter in one statement", async () => {
    const hit = () =>
      db.query<{ count: number }>(
        "insert into rate_events (key, window_start, count, expires_at) values ('k', 100, 1, now()) on conflict (key, window_start) do update set count = rate_events.count + 1 returning count",
      );
    expect((await hit()).rows[0].count).toBe(1);
    expect((await hit()).rows[0].count).toBe(2);
  });
});
