import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { applyRetention, cleanUpExpired } from "./retention";

let query: Query;
const NOW = new Date("2027-03-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

async function member(email: string, cols: Record<string, unknown>): Promise<{ id: string; run: string; pooled: string; unshared: string; pool: string }> {
  const keys = Object.keys(cols);
  const [{ id }] = await query<{ id: string }>(
    `insert into users (email, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [email, ...Object.values(cols)],
  );
  const [{ id: run }] = await query<{ id: string }>(
    "insert into runs (user_id, week_of, route, agent, sharing, raw_text, parsed) values ($1, '2026-11-30', 'connector', 'hark', 'share', 'the report', '{}'::jsonb) returning id",
    [id],
  );
  const [{ id: pool }] = await query<{ id: string }>(
    "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('Pooled', 'Marketing', 'd', 'p', 'i', '2026-11-30', '2026-11-30') returning id",
  );
  const play = async (position: number, poolId: string | null) =>
    (
      await query<{ id: string }>(
        "insert into plays (run_id, user_id, week_of, set_, position, title, category, body, shareable, pool_play_id) values ($1, $2, '2026-11-30', 'A', $3, 't', 'Marketing', '{}'::jsonb, $4, $5) returning id",
        [run, id, position, poolId != null, poolId],
      )
    )[0].id;
  const pooled = await play(1, pool);
  const unshared = await play(2, null);
  await query("insert into zack_profiles (user_id, week_of, route, raw_text) values ($1, '2026-11-30', 'connector', 'profile')", [id]);
  return { id, run, pooled, unshared, pool };
}

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("retention (spec B.14)", () => {
  it("erases runs and unshared plays 90 days after access ends, and keeps pooled plays", async () => {
    const m = await member("gone@example.com", { status: "cancelled", access_ends_at: daysAgo(91) });
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toEqual({ users: 1, runs: 1, plays: 1, profiles: 1 });
    expect(await query("select status, raw_text, parsed from runs")).toEqual([{ status: "deleted", raw_text: "", parsed: null }]);
    expect((await query<{ id: string }>("select id from plays")).map((p) => p.id)).toEqual([m.pooled]);
    expect(await query("select id from pool_plays")).toEqual([{ id: m.pool }]);
    expect(await query("select status, raw_text from zack_profiles")).toEqual([{ status: "deleted", raw_text: "" }]);
    // Nothing left to do: the next pass finds no one.
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toEqual({ users: 0, runs: 0, plays: 0, profiles: 0 });
  });

  it("leaves a member at day 89 untouched", async () => {
    await member("recent@example.com", { status: "closed", access_ends_at: daysAgo(89) });
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toMatchObject({ users: 0 });
    expect(await query("select status, raw_text from runs")).toEqual([{ status: "received", raw_text: "the report" }]);
    expect(await query("select count(*)::int as n from plays")).toEqual([{ n: 2 }]);
  });

  it("never touches a member with access, whatever their dates say", async () => {
    await member("back@example.com", { status: "active", access_ends_at: daysAgo(200) });
    await member("noend@example.com", { status: "closed" });
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toMatchObject({ users: 0 });
  });
});

describe("clean-up of expired sign-in material", () => {
  it("removes links a day past expiry, expired sessions, old Google states and spent counters, and keeps live ones", async () => {
    const [{ id }] = await query<{ id: string }>("insert into users (email) values ('a@example.com') returning id");
    await query(
      `insert into login_tokens (token_hash, email, expires_at) values
        ('old', 'a@example.com', now() - interval '2 days'), ('recent', 'a@example.com', now() - interval '1 hour'), ('live', 'a@example.com', now() + interval '10 minutes')`,
    );
    await query("insert into sessions (id_hash, user_id, method, expires_at) values ('dead', $1, 'email', now() - interval '1 minute'), ('live', $1, 'email', now() + interval '1 day')", [id]);
    await query("insert into oauth_states (state_hash, verifier, nonce, expires_at) values ('s1', 'v', 'n', now() - interval '2 hours'), ('s2', 'v', 'n', now() + interval '5 minutes')");
    await query("insert into rate_events (key, window_start, expires_at) values ('k', 1, now() - interval '1 minute'), ('k', 2, now() + interval '1 minute')");
    expect(await cleanUpExpired(query)).toEqual({ tokens: 1, sessions: 1, states: 1, counters: 1 });
    expect((await query<{ token_hash: string }>("select token_hash from login_tokens order by 1")).map((r) => r.token_hash)).toEqual(["live", "recent"]);
    expect(await query("select id_hash from sessions")).toEqual([{ id_hash: "live" }]);
  });
});
