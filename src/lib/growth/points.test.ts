import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { linkContributor } from "@/lib/admin/users";
import { currentMonday } from "@/lib/clock";
import { HOURLY_TASKS, type HourlyDeps } from "@/lib/housekeeping/job";
import { takeLease } from "@/lib/leases";
import { testDb, testSponsor } from "@/test-helpers/pglite-db";
import {
  computePoints,
  owePointsRebuild,
  rebuildPoints,
  REBUILD_OWED_KEY,
  refreshPoints,
  runPointsTask,
  standingOf,
  standings,
  standingsFor,
  WEEK_OF_SQL,
  WRITE_POINTS_SQL,
} from "./points";

/**
 * Points (B2 Unit 6): the rule from picks and contributors, the weekly cache
 * and the rank. Weeks are Toronto Mondays; times are UTC (Toronto is UTC-4
 * until November 1). Plays and picks are inserted directly; the confirmation
 * stamp itself is tested through the merge in src/lib/cora/merge.test.ts.
 */
let query: Query;
const REAL = new Date("2026-11-27T12:00:00Z");

beforeEach(async () => {
  ({ query } = await testDb());
});

/** A member; `active` has a card. */
async function user(email: string, o: { status?: string; cardAt?: string | null; sponsored?: boolean } = {}) {
  const sponsor = o.sponsored ? await testSponsor(query) : null;
  const [u] = await query<{ id: string }>("insert into users (email, status, trial_started_at, sponsor_id) values ($1, $2, $3, $4) returning id", [
    email,
    o.status ?? "active",
    o.cardAt ?? null,
    sponsor,
  ]);
  return u.id;
}
async function seed(label: string, linkedTo: string | null = null) {
  const [s] = await query<{ id: string }>("insert into seed_contributors (label, user_id) values ($1, $2) returning id", [label, linkedTo]);
  return s.id;
}
/** A pool play and its contributors: a key, or [key, contributed_week]. */
async function poolPlay(title: string, contributors: (string | [string, string])[]) {
  const [p] = await query<{ id: string }>(
    "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ($1, 'Email and calendar', 'd', 'p', 'i', '2026-08-03', '2026-08-03') returning id",
    [title],
  );
  for (const c of contributors) {
    const [key, week] = Array.isArray(c) ? c : [c, null];
    await query("insert into pool_play_contributors (pool_play_id, contributor, contributed_week) values ($1, $2, $3)", [p.id, key, week]);
  }
  return p.id;
}
async function pick(userId: string, week: string, position: number, play: string, deliveredAt: string | null, o: { dry?: boolean; confirmedAt?: string } = {}) {
  await query(
    "insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at, setup_confirmed_at) values ($1, $2, $3, $4, 80, 4, 'fits', $5, $6, $7)",
    [userId, week, position, play, o.dry ?? false, deliveredAt, o.confirmedAt ?? null],
  );
}
const cache = () =>
  query<{ user_id: string; week_of: string; adopted: number; confirmed: number; total: number; at: string }>(
    "select user_id, to_char(week_of, 'YYYY-MM-DD') as week_of, adopted, confirmed, total, to_char(computed_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI') as at from points order by week_of, user_id",
  );
const cached = async () => (await cache()).map((r) => ({ userId: r.user_id, weekOf: r.week_of, adopted: r.adopted, confirmed: r.confirmed, total: r.total }));
const refresh = (now: string, realNow: Date = REAL) => refreshPoints(query, { now: new Date(now), realNow });
const totals = async (now: string) => {
  const out: Record<string, number> = {};
  for (const w of await computePoints(query, new Date(now))) out[w.userId] = (out[w.userId] ?? 0) + w.total;
  return out;
};

describe("points, a seeded week by hand", () => {
  it("matches a hand calculation, in the computation, the cache and the rank", async () => {
    const [a, b, c, d, e] = [await user("a@x.com"), await user("b@x.com"), await user("c@x.com"), await user("d@x.com"), await user("e@x.com")];
    const s = `seed:${await seed("Sam", d)}`; // linked to D
    const t = `seed:${await seed("Tia")}`; // never linked
    const p1 = await poolPlay("P1", [a, c]);
    const p2 = await poolPlay("P2", [a]);
    const p3 = await poolPlay("P3", [s]);
    const p4 = await poolPlay("P4", [t]);
    const at = "2026-10-12T13:00:00Z";
    await pick(b, "2026-10-12", 1, p1, at, { confirmedAt: "2026-10-14T10:00:00Z" }); // A +2, C +2
    await pick(b, "2026-10-12", 2, p2, at); // A +1
    await pick(b, "2026-10-12", 3, p3, at, { confirmedAt: "2026-10-14T10:00:00Z" }); // D +2 (linked seed)
    await pick(e, "2026-10-12", 1, p1, at); // A +1, C +1
    await pick(e, "2026-10-12", 2, p4, at); // nobody: Tia is not linked
    await pick(e, "2026-10-12", 3, p2, at, { dry: true }); // nobody: a dry run
    await pick(a, "2026-10-12", 1, p2, at, { confirmedAt: "2026-10-14T10:00:00Z" }); // nobody: A's own play
    await pick(a, "2026-10-12", 2, p3, at); // D +1
    await pick(c, "2026-10-12", 1, p1, at); // A +1; C nothing (C's own play)
    await pick(c, "2026-10-12", 2, p2, null); // nobody: not delivered
    // By hand: A adopted 4 (P1 for B, P2 for B, P1 for E, P1 for C), confirmed 1 → 5.
    //          C adopted 2 (P1 for B, P1 for E), confirmed 1 → 3. D adopted 2 (P3 for B, P3 for A), confirmed 1 → 3.
    const want = [
      { userId: a, weekOf: "2026-10-12", adopted: 4, confirmed: 1, total: 5 },
      { userId: c, weekOf: "2026-10-12", adopted: 2, confirmed: 1, total: 3 },
      { userId: d, weekOf: "2026-10-12", adopted: 2, confirmed: 1, total: 3 },
    ].sort((x, y) => x.userId.localeCompare(y.userId));
    expect(await computePoints(query, new Date("2026-10-16T12:00:00Z"))).toEqual(want);

    expect(await refresh("2026-10-16T12:00:00Z")).toEqual({ from: null, written: 3, removed: 0 });
    expect(await cached()).toEqual(want);

    const [cd1, cd2] = [c, d].sort();
    expect((await standings(query)).map((x) => [x.userId, x.total, x.rank])).toEqual([
      [a, 5, 1],
      [cd1, 3, 2],
      [cd2, 3, 2],
    ]);
    expect(await standingOf(query, a)).toEqual({ userId: a, adopted: 4, confirmed: 1, total: 5, rank: 1 });
    expect(await standingOf(query, e)).toEqual({ userId: e, adopted: 0, confirmed: 0, total: 0, rank: 4 });
    const many = await standingsFor(query, [a, e]);
    expect(many.get(a)).toMatchObject({ total: 5, rank: 1 });
    expect(many.get(e)).toEqual({ userId: e, adopted: 0, confirmed: 0, total: 0, rank: 4 });
  });

  it("counts nothing that happens after the job clock, and a confirmation in the week it happened", async () => {
    const a = await user("a@x.com");
    const b = await user("b@x.com");
    const p = await poolPlay("P", [a]);
    await pick(b, "2026-10-12", 1, p, "2026-10-12T13:00:00Z", { confirmedAt: "2026-10-20T10:00:00Z" });
    expect(await computePoints(query, new Date("2026-10-12T12:00:00Z"))).toEqual([]);
    expect((await computePoints(query, new Date("2026-10-13T12:00:00Z"))).map((w) => w.total)).toEqual([1]);
    expect((await computePoints(query, new Date("2026-10-21T12:00:00Z"))).map((w) => [w.weekOf, w.adopted, w.confirmed])).toEqual([
      ["2026-10-12", 1, 0],
      ["2026-10-19", 0, 1],
    ]);
  });
});

describe("only real customers' picks score (anti-farming)", () => {
  it("a no-card trial's pick scores nothing; a card-saved trial, a sponsored member and a closed former customer do", async () => {
    const a = await user("a@x.com");
    const p = await poolPlay("P", [a]);
    const noCard = await user("nocard@x.com", { status: "trial" });
    const carded = await user("card@x.com", { status: "trial", cardAt: "2026-10-01T00:00:00Z" });
    const sponsored = await user("sp@x.com", { status: "trial", sponsored: true });
    const closed = await user("closed@x.com", { status: "closed", cardAt: "2026-09-01T00:00:00Z" });
    const closedNoCard = await user("closednc@x.com", { status: "closed" });
    for (const m of [noCard, carded, sponsored, closed, closedNoCard]) await pick(m, "2026-10-12", 1, p, "2026-10-12T13:00:00Z", { confirmedAt: "2026-10-19T10:00:00Z" });
    expect(await totals("2026-10-20T00:00:00Z")).toEqual({ [a]: 6 });
  });

  it("a reciprocal pair scores only for picks made for the carded member", async () => {
    const a = await user("a@x.com", { status: "trial" }); // no card
    const b = await user("b@x.com");
    const pa = await poolPlay("A's", [a]);
    const pb = await poolPlay("B's", [b]);
    await pick(b, "2026-10-12", 1, pa, "2026-10-12T13:00:00Z", { confirmedAt: "2026-10-19T10:00:00Z" });
    await pick(a, "2026-10-12", 1, pb, "2026-10-12T13:00:00Z", { confirmedAt: "2026-10-19T10:00:00Z" });
    expect(await totals("2026-10-20T00:00:00Z")).toEqual({ [a]: 2 });
  });
});

describe("seed contributors", () => {
  it("score only once an admin links them to an account, and a member with two keys on a play scores once", async () => {
    const b = await user("b@x.com");
    const d = await user("d@x.com");
    const sid = await seed("Sam");
    const p = await poolPlay("P", [`seed:${sid}`]);
    await pick(b, "2026-10-12", 1, p, "2026-10-12T13:00:00Z");
    expect(await computePoints(query, new Date("2026-10-13T00:00:00Z"))).toEqual([]);

    await query("update seed_contributors set user_id = $1 where id = $2", [d, sid]);
    expect((await computePoints(query, new Date("2026-10-13T00:00:00Z"))).map((w) => [w.userId, w.total])).toEqual([[d, 1]]);

    await query("insert into pool_play_contributors (pool_play_id, contributor) values ($1, $2)", [p, d]);
    expect((await computePoints(query, new Date("2026-10-13T00:00:00Z"))).map((w) => [w.userId, w.total])).toEqual([[d, 1]]);
    await pick(d, "2026-10-12", 1, p, "2026-10-12T13:00:00Z"); // D's own (linked) play
    expect((await computePoints(query, new Date("2026-10-13T00:00:00Z"))).map((w) => [w.userId, w.total])).toEqual([[d, 1]]);
  });
});

describe("the contributed_week rule", () => {
  it("counts a pick only for contributors who contributed in an earlier list week", async () => {
    const a = await user("a@x.com");
    const c = await user("c@x.com");
    const p = await poolPlay("P", [a, [c, "2026-10-12"]]);
    await pick(await user("b@x.com"), "2026-10-05", 1, p, "2026-10-05T13:00:00Z"); // before C
    await pick(await user("e@x.com"), "2026-10-12", 1, p, "2026-10-12T13:00:00Z"); // C's own week: not yet
    await pick(await user("f@x.com"), "2026-10-19", 1, p, "2026-10-19T13:00:00Z"); // after: counts
    const tot = Object.fromEntries((await computePoints(query, new Date("2026-10-20T00:00:00Z"))).map((w) => [`${w.userId}/${w.weekOf}`, w.total]));
    expect(tot).toEqual({ [`${a}/2026-10-05`]: 1, [`${a}/2026-10-12`]: 1, [`${a}/2026-10-19`]: 1, [`${c}/2026-10-19`]: 1 });
  });
});

describe("the points cache", () => {
  it("closes a past week only after two days' grace and never rewrites it; the current week is recomputed", async () => {
    const a = await user("a@x.com");
    const b = await user("b@x.com");
    const p = await poolPlay("P", [a]);
    await pick(b, "2026-10-12", 1, p, "2026-10-12T13:00:00Z");

    await refresh("2026-10-14T12:00:00Z");
    expect(await cache()).toEqual([{ user_id: a, week_of: "2026-10-12", adopted: 1, confirmed: 0, total: 1, at: "2026-10-14T12:00" }]);

    // Monday after the week: inside the grace, so the week is still open.
    await refresh("2026-10-19T12:00:00Z");
    // A late delivery stamped inside the week (Sunday) but committed after Monday 00:00 still counts.
    await pick(await user("e@x.com"), "2026-10-12", 1, p, "2026-10-18T20:00:00Z");
    expect(await refresh("2026-10-21T12:00:00Z")).toMatchObject({ from: null });
    expect(await cache()).toEqual([{ user_id: a, week_of: "2026-10-12", adopted: 2, confirmed: 0, total: 2, at: "2026-10-21T12:00" }]);

    // Now closed: a backdated change leaves it alone; the confirmation lands in the current week.
    await pick(await user("f@x.com"), "2026-10-12", 1, p, "2026-10-13T13:00:00Z");
    await query("update picks set setup_confirmed_at = '2026-10-21T10:00:00Z' where user_id = $1", [b]);
    expect(await refresh("2026-10-22T12:00:00Z")).toMatchObject({ from: "2026-10-19" });
    expect(await cache()).toEqual([
      { user_id: a, week_of: "2026-10-12", adopted: 2, confirmed: 0, total: 2, at: "2026-10-21T12:00" },
      { user_id: a, week_of: "2026-10-19", adopted: 0, confirmed: 1, total: 1, at: "2026-10-22T12:00" },
    ]);
    expect((await computePoints(query, new Date("2026-10-22T12:00:00Z")))[0]).toMatchObject({ weekOf: "2026-10-12", adopted: 3 });

    // The current week loses a point that went away (the member deleted): its row is removed.
    await query("delete from users where id = $1", [b]);
    expect(await refresh("2026-10-23T12:00:00Z")).toMatchObject({ removed: 1, written: 0 });
    expect((await cache()).map((r) => r.week_of)).toEqual(["2026-10-12"]);
    expect(await standingOf(query, a)).toMatchObject({ total: 2, rank: 1 });
  });

  it("never closes a week with a stamp ahead of the real clock", async () => {
    const a = await user("a@x.com");
    const p = await poolPlay("P", [a]);
    await pick(await user("b@x.com"), "2026-10-12", 1, p, "2026-10-12T13:00:00Z");
    await refresh("2026-10-22T12:00:00Z", new Date("2026-10-14T12:00:00Z"));
    expect((await cache()).map((r) => [r.total, r.at])).toEqual([[1, "2026-10-14T12:00"]]);
    await pick(await user("e@x.com"), "2026-10-12", 1, p, "2026-10-15T13:00:00Z");
    await refresh("2026-10-22T13:00:00Z");
    expect((await cache()).map((r) => [r.total, r.at])).toEqual([[2, "2026-10-22T13:00"]]);
  });

  it("writes nothing while another refresh holds the lease", async () => {
    const a = await user("a@x.com");
    await pick(await user("b@x.com"), "2026-10-12", 1, await poolPlay("P", [a]), "2026-10-12T13:00:00Z");
    expect(await takeLease(query, "points-refresh", "someone-else", 60)).toBe(true);
    expect(await refresh("2026-10-14T12:00:00Z")).toEqual({ busy: true });
    expect(await rebuildPoints(query, { now: new Date("2026-10-14T12:00:00Z") })).toEqual({ busy: true });
    expect(await cache()).toEqual([]);
  });

  it("runs as an hourly task on the pass's job clock", async () => {
    const a = await user("a@x.com");
    await pick(await user("b@x.com"), "2026-10-12", 1, await poolPlay("P", [a]), "2026-10-12T13:00:00Z");
    const task = HOURLY_TASKS.find((t) => t.name === "points")!;
    const d = { now: new Date("2026-10-14T12:00:00Z") } as unknown as HourlyDeps;
    expect(await task.run(query, d, { deadline: Date.now() + 60_000, realNow: REAL })).toMatchObject({ written: 1 });
    expect((await cache()).map((r) => [r.user_id, r.total, r.at])).toEqual([[a, 1, "2026-10-14T12:00"]]);
  });
});

describe("rebuilding the cache", () => {
  /** Three closed weeks of a seed play picked for B, then the cache refreshed well after. */
  async function history() {
    const b = await user("b@x.com");
    const d = await user("d@x.com");
    const sid = await seed("Sam");
    const p = await poolPlay("P", [`seed:${sid}`]);
    for (const w of ["2026-09-28", "2026-10-05", "2026-10-12"]) await pick(b, w, 1, p, `${w}T13:00:00Z`);
    return { b, d, sid };
  }

  it("a late link credits history through the rebuild, which the hourly refresh alone never would", async () => {
    const { b, d, sid } = await history();
    // Another member's point closes the weeks up to the 12th.
    const a = await user("a@x.com");
    await pick(b, "2026-10-12", 2, await poolPlay("A's", [a]), "2026-10-12T13:00:00Z");
    await refresh("2026-10-28T12:00:00Z");
    await query("update seed_contributors set user_id = $1 where id = $2", [d, sid]); // linked behind the admin action's back
    expect(await refresh("2026-10-28T12:30:00Z")).toMatchObject({ from: "2026-10-19" });
    expect(await standingOf(query, d)).toMatchObject({ total: 0 });
    await query("update seed_contributors set user_id = null where id = $1", [sid]);
    expect((await linkContributor(query, "admin@example.com", sid, d, new Date("2026-10-28T13:00:00Z"))).ok).toBe(true);
    expect((await cached()).filter((r) => r.userId === d).map((r) => [r.weekOf, r.total])).toEqual([
      ["2026-09-28", 1],
      ["2026-10-05", 1],
      ["2026-10-12", 1],
    ]);
    expect(await standingOf(query, d)).toMatchObject({ total: 3, rank: 1 });
  });

  it("an unlink after the weeks closed removes the points that were wrong", async () => {
    const { d, sid } = await history();
    await linkContributor(query, "admin@example.com", sid, d, new Date("2026-10-28T13:00:00Z"));
    await refresh("2026-10-29T12:00:00Z");
    expect(await cache()).toHaveLength(3);
    await linkContributor(query, "admin@example.com", sid, null, new Date("2026-10-30T12:00:00Z"));
    expect(await cache()).toEqual([]);
    expect(await standingOf(query, d)).toMatchObject({ total: 0 });
  });

  it("leaves the cache equal to the computation, every week", async () => {
    const a = await user("a@x.com");
    const p = await poolPlay("P", [a]);
    await pick(await user("b@x.com"), "2026-10-05", 1, p, "2026-10-05T13:00:00Z", { confirmedAt: "2026-10-13T10:00:00Z" });
    await refresh("2026-10-25T12:00:00Z");
    // Changes to closed weeks the refresh will not take: a backdated pick, and a contributor whose row is wrong.
    await pick(await user("e@x.com"), "2026-10-12", 1, p, "2026-10-12T13:00:00Z");
    await query("insert into points (user_id, week_of, adopted, total) values ($1, '2026-09-28', 7, 7)", [await user("x@x.com")]);
    const now = new Date("2026-10-26T12:00:00Z");
    expect(await rebuildPoints(query, { now, realNow: REAL })).toMatchObject({ from: null });
    expect(await cached()).toEqual(await computePoints(query, now));
  });
});

describe("the rebuild-owed marker", () => {
  const owed = async () => (await query<{ token: string }>("select value->>'token' as token from settings where key = $1", [REBUILD_OWED_KEY]))[0]?.token ?? null;

  it("a link made while the lease is busy owes a rebuild, which the next hourly pass does", async () => {
    const b = await user("b@x.com");
    const d = await user("d@x.com");
    const a = await user("a@x.com");
    const sid = await seed("Sam");
    const p = await poolPlay("P", [`seed:${sid}`]);
    await pick(b, "2026-10-05", 1, p, "2026-10-05T13:00:00Z");
    await pick(b, "2026-10-05", 2, await poolPlay("A's", [a]), "2026-10-05T13:00:00Z");
    await refresh("2026-10-21T12:00:00Z"); // closes the week of the 5th

    expect(await takeLease(query, "points-refresh", "someone-else", 60)).toBe(true);
    const r = await linkContributor(query, "admin@example.com", sid, d, new Date("2026-10-22T12:00:00Z"));
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining("next hourly pass") });
    expect(await owed()).not.toBeNull();
    expect(await cache()).not.toContainEqual(expect.objectContaining({ user_id: d }));

    await query("delete from leases where name = 'points-refresh'");
    const task = HOURLY_TASKS.find((t) => t.name === "points")!;
    const deps = { now: new Date("2026-10-22T13:00:00Z") } as unknown as HourlyDeps;
    expect(await task.run(query, deps, { deadline: Date.now() + 60_000, realNow: REAL })).toMatchObject({ rebuilt: true });
    expect(await standingOf(query, d)).toMatchObject({ total: 1 });
    expect(await owed()).toBeNull();
    // With nothing owed, the pass is the ordinary refresh again.
    expect(await task.run(query, deps, { deadline: Date.now() + 60_000, realNow: REAL })).not.toHaveProperty("rebuilt");
  });

  it("keeps the marker when the lease is busy, and a marker set during the rebuild survives it", async () => {
    const a = await user("a@x.com");
    await pick(await user("b@x.com"), "2026-10-05", 1, await poolPlay("P", [a]), "2026-10-05T13:00:00Z");
    await owePointsRebuild(query, "test");
    const now = new Date("2026-10-22T12:00:00Z");

    expect(await takeLease(query, "points-refresh", "someone-else", 60)).toBe(true);
    expect(await runPointsTask(query, { now, realNow: REAL })).toEqual({ busy: true });
    expect(await owed()).not.toBeNull();
    await query("delete from leases where name = 'points-refresh'");

    // Another owe lands while the rebuild's statement runs.
    let during: string | null = null;
    const racing: Query = async (text, params) => {
      if (text === WRITE_POINTS_SQL && !during) {
        await owePointsRebuild(query, "set during the rebuild");
        during = await owed();
      }
      return query(text, params);
    };
    expect(await runPointsTask(racing, { now, realNow: REAL })).toMatchObject({ rebuilt: true });
    expect(await owed()).toBe(during);
    expect(await runPointsTask(query, { now, realNow: REAL })).toMatchObject({ rebuilt: true });
    expect(await owed()).toBeNull();
  });
});

describe("rank", () => {
  it("ranks every live member by all-time total, ties sharing a rank, members with none after everyone", async () => {
    const [u1, u2, u3, u4] = [await user("1@x.com"), await user("2@x.com"), await user("3@x.com"), await user("4@x.com")];
    const row = (u: string, week: string, adopted: number, confirmed: number) =>
      query("insert into points (user_id, week_of, adopted, confirmed, total) values ($1, $2, $3, $4, $5)", [u, week, adopted, confirmed, adopted + confirmed]);
    await row(u1, "2026-10-05", 2, 1);
    await row(u1, "2026-10-12", 1, 1); // 5 over two weeks
    await row(u2, "2026-10-12", 3, 2); // 5
    await row(u3, "2026-10-12", 2, 1); // 3
    await row(u4, "2026-10-12", 0, 0); // a zero row counts as none
    const [t1, t2] = [u1, u2].sort();
    expect((await standings(query)).map((s) => [s.userId, s.total, s.rank])).toEqual([
      [t1, 5, 1],
      [t2, 5, 1],
      [u3, 3, 3],
    ]);
    expect(await standingOf(query, u1)).toEqual({ userId: u1, adopted: 3, confirmed: 2, total: 5, rank: 1 });
    expect((await standingOf(query, u3)).rank).toBe(3);
    expect((await standingOf(query, u4)).rank).toBe(4);
  });

  it("leaves closed and cancelled accounts out, keeping their rows", async () => {
    const [u1, u2, u3, u4] = [await user("1@x.com"), await user("2@x.com", { status: "closed" }), await user("3@x.com", { status: "cancelled" }), await user("4@x.com")];
    for (const [u, n] of [[u1, 2], [u2, 9], [u3, 8], [u4, 1]] as const) await query("insert into points (user_id, week_of, adopted, total) values ($1, '2026-10-12', $2, $2)", [u, n]);
    expect((await standings(query)).map((s) => [s.userId, s.rank])).toEqual([
      [u1, 1],
      [u4, 2],
    ]);
    expect(await standingOf(query, u1)).toMatchObject({ rank: 1 });
    expect(await standingOf(query, u2)).toMatchObject({ total: 0, rank: 3 });
    expect(await query("select 1 from points")).toHaveLength(4);
  });
});

describe("one week definition", () => {
  it("the SQL week equals currentMonday at the Sunday cutoff and Monday midnight, and across both clock changes", async () => {
    const instants = [
      "2026-10-12T03:59:00Z", // Sunday 23:59 EDT
      "2026-10-12T04:00:00Z", // Monday 00:00 EDT
      "2026-03-08T06:59:00Z", // Sunday 01:59 EST, just before spring forward
      "2026-03-08T07:00:00Z", // Sunday 03:00 EDT
      "2026-03-09T03:59:00Z", // Sunday 23:59 EDT
      "2026-03-09T04:00:00Z", // Monday 00:00 EDT
      "2026-11-01T05:30:00Z", // Sunday 01:30 EDT, before fall back
      "2026-11-01T06:30:00Z", // Sunday 01:30 EST, after
      "2026-11-02T04:59:00Z", // Sunday 23:59 EST
      "2026-11-02T05:00:00Z", // Monday 00:00 EST
    ];
    for (const t of instants) {
      const [r] = await query<{ wk: string }>(`select to_char(${WEEK_OF_SQL("$1::timestamptz")}, 'YYYY-MM-DD') as wk`, [t]);
      expect([t, r.wk]).toEqual([t, currentMonday(new Date(t))]);
    }
  });
});
