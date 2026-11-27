import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { bricks, brickSeries, brickSummary, buildBrickSeries } from "./week";

/** Plan B2 Unit 2: the 26-week brick graph, one Season at a time (spec B.15). */

const FIRST = "2026-12-07"; // a Monday
/** Wednesday 10:00 Toronto of week `n` (1-based) since `first`. */
const inWeek = (n: number, first = FIRST) => new Date(`${addDays(first, 7 * (n - 1) + 2)}T15:00:00Z`);

describe("buildBrickSeries", () => {
  it("counts set-ups in weeks 1, 2 and 4 as 1, 2, 2, 3", () => {
    const s = buildBrickSeries(FIRST, [inWeek(1), inWeek(2), inWeek(4)], inWeek(4), 1);
    expect(s).toEqual({ weekIndex: 4, season: 1, weekOfSeason: 4, points: [1, 2, 2, 3], thisWeek: 1, seasonBricks: 3, lifetime: 3, confirmed: 1 });
  });

  it("is week 1 with no bricks on the first Monday", () => {
    expect(buildBrickSeries(FIRST, [], inWeek(1))).toEqual({ weekIndex: 1, season: 1, weekOfSeason: 1, points: [0], thisWeek: 0, seasonBricks: 0, lifetime: 0, confirmed: 0 });
  });

  describe("Toronto weeks across the clock changes", () => {
    const MAR = "2027-03-01"; // Monday; clocks spring forward Sunday March 14, 2027

    it("Sunday 23:30 on the spring-forward weekend counts in the earlier week", () => {
      const sunday = new Date("2027-03-14T23:30:00-04:00"); // EDT, already Monday 03:30Z
      const s = buildBrickSeries(MAR, [sunday], inWeek(3, MAR));
      expect(s.points).toEqual([0, 1, 1]);
    });

    it("Sunday 23:30 on the fall-back weekend counts in the earlier week", () => {
      // Clocks fall back Sunday November 7, 2027; Monday November 1 is week 36 from March 1.
      const sunday = new Date("2027-11-07T23:30:00-05:00"); // EST, already Monday 04:30Z
      const s = buildBrickSeries(MAR, [sunday], new Date("2027-11-10T15:00:00Z"));
      expect(s).toMatchObject({ weekIndex: 37, season: 2, weekOfSeason: 11, thisWeek: 0, seasonBricks: 1 });
      expect(s.points.slice(-2)).toEqual([1, 1]);
    });

    it("gives the right week index when the first week is before a clock change and now is after", () => {
      expect(buildBrickSeries(MAR, [], new Date("2027-03-15T04:30:00Z")).weekIndex).toBe(3); // Monday 00:30 EDT
      expect(buildBrickSeries(MAR, [], new Date("2027-03-15T03:30:00Z")).weekIndex).toBe(2); // Sunday 23:30 EDT
      expect(buildBrickSeries(MAR, [], new Date("2027-11-08T05:30:00Z")).weekIndex).toBe(37); // Monday 00:30 EST
      expect(buildBrickSeries(MAR, [], new Date("2027-11-08T04:30:00Z")).weekIndex).toBe(36); // Sunday 23:30 EST
    });
  });

  describe("clamps", () => {
    it("counts a set-up before the first week in week 1", () => {
      expect(buildBrickSeries(FIRST, [new Date("2026-11-20T15:00:00Z")], inWeek(2)).points).toEqual([1, 1]);
    });

    it("counts a set-up after now in the current week", () => {
      expect(buildBrickSeries(FIRST, [inWeek(9)], inWeek(3))).toMatchObject({ points: [0, 0, 1], thisWeek: 1 });
    });

    it("is week 1 when now is before the first week", () => {
      expect(buildBrickSeries(FIRST, [], new Date("2026-12-01T15:00:00Z"))).toMatchObject({ weekIndex: 1, season: 1, weekOfSeason: 1 });
    });
  });

  describe("Seasons", () => {
    it("starts Season 2 in week 27 with the count back at 0", () => {
      const s = buildBrickSeries(FIRST, [inWeek(3), inWeek(26), inWeek(27)], inWeek(27));
      expect(s).toMatchObject({ weekIndex: 27, season: 2, weekOfSeason: 1, points: [1], thisWeek: 1, seasonBricks: 1, lifetime: 3 });
    });

    it("week 26 → 27: a set-up in week 26 leaves Season 2 at 0 and stays in the lifetime count", () => {
      expect(buildBrickSeries(FIRST, [inWeek(26)], inWeek(26))).toMatchObject({ season: 1, weekOfSeason: 26, seasonBricks: 1, lifetime: 1 });
      expect(buildBrickSeries(FIRST, [inWeek(26)], inWeek(27))).toMatchObject({ season: 2, weekOfSeason: 1, points: [0], seasonBricks: 0, lifetime: 1 });
    });

    it("week 130 → 131 stays Season 5 and restarts the count", () => {
      expect(buildBrickSeries(FIRST, [inWeek(130)], inWeek(130))).toMatchObject({ season: 5, weekOfSeason: 26, seasonBricks: 1 });
      expect(buildBrickSeries(FIRST, [inWeek(130)], inWeek(131))).toMatchObject({ season: 5, weekOfSeason: 1, points: [0], seasonBricks: 0, lifetime: 1 });
    });

    it("stops at Season 5 (week 200), with the count still restarting every 26 weeks", () => {
      const s = buildBrickSeries(FIRST, [inWeek(10), inWeek(190)], inWeek(200));
      expect(s).toMatchObject({ weekIndex: 200, season: 5, weekOfSeason: 18, seasonBricks: 1, lifetime: 2 });
      expect(s.points).toHaveLength(18);
    });
  });
});

describe("brickSummary", () => {
  it("says Season, the week of 26, this Season's bricks and the lifetime total", () => {
    expect(brickSummary(buildBrickSeries(FIRST, [inWeek(1), inWeek(2), inWeek(4)], inWeek(4)))).toBe("Season 1 · week 4 of 26 · 3 bricks this Season · 3 in all");
    expect(brickSummary(buildBrickSeries(FIRST, [inWeek(1)], inWeek(2)))).toBe("Season 1 · week 2 of 26 · 1 brick this Season · 1 in all");
  });
});

describe("brickSeries (database)", () => {
  let query: Query;
  let userId: string;

  async function newUser(email: string): Promise<string> {
    const [u] = await query<{ id: string }>("insert into users (email, status, plan) values ($1, 'active', 'monthly') returning id", [email]);
    return u.id;
  }

  async function pick(
    week: string,
    position: number,
    cols: { user?: string; delivered?: boolean; dryRun?: boolean; setUpAt?: Date | null; confirmed?: boolean } = {},
  ) {
    const [p] = await query<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('t', 'Sales', 'd', 'p', 'i', $1, $1) returning id",
      [week],
    );
    const setUp = cols.setUpAt?.toISOString() ?? null;
    await query(
      `insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at, setup_marked_at, setup_confirmed_at)
       values ($1, $2, $3, $4, 70, 3, 'r', $5, $6, $7, $8)`,
      [cols.user ?? userId, week, position, p.id, cols.dryRun ?? false, cols.delivered === false ? null : `${week}T11:00:00Z`, setUp, cols.confirmed ? setUp : null],
    );
  }

  beforeEach(async () => {
    ({ query } = await testDb());
    userId = await newUser("a@example.com");
  });

  it("is null with no delivered lists (dry runs and held lists don't count)", async () => {
    await pick(FIRST, 1, { dryRun: true, setUpAt: inWeek(1) });
    await pick(FIRST, 2, { delivered: false });
    expect(await brickSeries(query, userId, inWeek(3))).toBeNull();
  });

  it("starts at the first delivered week and counts each set-up in the week it was marked", async () => {
    await pick(FIRST, 1, { setUpAt: inWeek(1), confirmed: true });
    await pick(FIRST, 2, { setUpAt: inWeek(2) }); // week 1's idea, set up in week 2
    await pick(FIRST, 3);
    await pick(addDays(FIRST, 7), 1);
    await pick(addDays(FIRST, 21), 1, { setUpAt: inWeek(4) });
    await pick(addDays(FIRST, 21), 2, { dryRun: true, setUpAt: inWeek(4) });
    expect(await brickSeries(query, userId, inWeek(4))).toEqual({
      weekIndex: 4,
      season: 1,
      weekOfSeason: 4,
      points: [1, 2, 2, 3],
      thisWeek: 1,
      seasonBricks: 3,
      lifetime: 3,
      confirmed: 1,
    });
  });

  it("agrees with bricks() on the same data", async () => {
    await pick(FIRST, 1, { setUpAt: inWeek(1), confirmed: true });
    await pick(FIRST, 2, { setUpAt: inWeek(2) });
    await pick(FIRST, 3, { dryRun: true, setUpAt: inWeek(2), confirmed: true });
    await pick(addDays(FIRST, 7), 1, { delivered: false, setUpAt: inWeek(2) });
    await pick(addDays(FIRST, 7), 2);
    const b = await bricks(query, userId);
    const s = await brickSeries(query, userId, inWeek(3));
    expect(b).toEqual({ marked: 2, confirmed: 1 });
    expect({ marked: s!.lifetime, confirmed: s!.confirmed }).toEqual(b);
  });

  it("counts only the member's own picks", async () => {
    const other = await newUser("b@example.com");
    await pick("2026-11-02", 1, { user: other, setUpAt: inWeek(1) }); // an earlier first week, and a brick
    await pick(FIRST, 1, { setUpAt: inWeek(2) });
    expect(await brickSeries(query, userId, inWeek(2))).toMatchObject({ weekIndex: 2, points: [0, 1], lifetime: 1 });
    expect(await brickSeries(query, other, inWeek(2))).toMatchObject({ weekIndex: 7, lifetime: 1 });
  });

  it("wraps into Season 2 with the count restarting", async () => {
    await pick(FIRST, 1, { setUpAt: inWeek(5) });
    await pick(FIRST, 2, { setUpAt: inWeek(28) });
    expect(await brickSeries(query, userId, inWeek(29))).toMatchObject({ weekIndex: 29, season: 2, weekOfSeason: 3, points: [0, 1, 1], seasonBricks: 1, lifetime: 2 });
  });
});
