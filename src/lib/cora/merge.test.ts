import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { IntakeModel } from "@/lib/intake/model";
import { computePoints, owePointsRebuildFor, REBUILD_OWED_KEY, refreshPoints, runPointsTask, standingOf } from "@/lib/growth/points";
import { testDb } from "@/test-helpers/pglite-db";
import { mergePending, type MergeModel, type MergeTally } from "./merge";
import { importSeedRun } from "./seed-import";

/**
 * Set-up confirmation in the Cora merge (B2 Unit 6, spec B.10 "confirmed by
 * Zack") and contributed_at, on real SQL. Weeks are Mondays; times are UTC
 * (Toronto is UTC-4 until November 1).
 */
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let lastTally: MergeTally;
const cleanReview: IntakeModel = { readRun: async () => Promise.reject(new Error("unused")), review: async () => [] };

/** Plays whose job starts with the same word are the same. */
const keyModel: MergeModel = {
  async sameJob(p, cands) {
    const key = p.job.split(" ")[0];
    return cands.find((c) => c.job.split(" ")[0] === key)?.id ?? null;
  },
};

const report = (title: string, job: string) =>
  `# Zack The Collector (for Hark) v2.0\n\n\`\`\`roger-run\n${JSON.stringify({
    zack_version: "2.0",
    plays: [{ set: "A", title, category: "Email and calendar", job, description: `${title} does things.`, minutes_saved_each: 10, playbook_md: "1. Step one.\n2. Step two.", install_notes: "Save as a skill." }],
  })}\n\`\`\`\n`;

async function user(email: string, sharing = "share") {
  const [u] = await query<{ id: string }>("insert into users (email, status, sharing) values ($1, 'active', $2) returning id", [email, sharing]);
  return u.id;
}

/** A run received at `receivedAt` for `week`, through intake, then merged with the job clock `now`. Returns the pool play it joined or made. */
async function run(userId: string, week: string, receivedAt: string, now: string, o: { job?: string; sharing?: string } = {}) {
  const { processRun } = await import("@/lib/intake/process");
  const [r] = await query<{ id: string }>(
    "insert into runs (user_id, week_of, route, agent, sharing, raw_text, received_at) values ($1, $2, 'connector', 'hark', $3, $4, $5) returning id",
    [userId, week, o.sharing ?? "share", report("Inbox triage", o.job ?? "inbox sort and draft"), receivedAt],
  );
  await processRun(query, r.id, { model: cleanReview, query });
  lastTally = await mergePending(query, keyModel, { now: new Date(now) });
  const [p] = await query<{ pool_play_id: string | null }>("select pool_play_id from plays where run_id = $1", [r.id]);
  return p.pool_play_id;
}

async function pick(userId: string, week: string, poolPlay: string, deliveredAt: string | null, o: { dry?: boolean; position?: number } = {}) {
  await query(
    "insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at) values ($1, $2, $3, $4, 80, 4, 'fits', $5, $6)",
    [userId, week, o.position ?? 1, poolPlay, o.dry ?? false, deliveredAt],
  );
}

const confirmedAt = async (userId: string, week: string, position = 1) =>
  (await query<{ at: string | null }>("select to_char(setup_confirmed_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI') as at from picks where user_id = $1 and week_of = $2 and position = $3", [userId, week, position]))[0]?.at ?? null;

const totals = async (now: string) => {
  const out: Record<string, number> = {};
  for (const w of await computePoints(query, new Date(now))) out[w.userId] = (out[w.userId] ?? 0) + w.total;
  return out;
};

beforeEach(async () => {
  ({ query } = await testDb());
  vi.stubEnv("ADMIN_EMAILS", "");
});

describe("set-up confirmation in the merge", () => {
  it("confirms B's pick of A's play when B's next run merges into it, and A has 2 points; B earns nothing for it", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const play = (await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z"))!;
    const [c] = await query<{ at: string }>("select to_char(contributed_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI') as at from pool_play_contributors where contributor = $1", [a]);
    expect(c.at).toBe("2026-10-05T04:05"); // the job clock, not the database's
    await pick(b, "2026-10-12", play, "2026-10-12T13:00:00Z");
    expect(await totals("2026-10-13T00:00:00Z")).toEqual({ [a]: 1 });

    // B's next run (received after the list) does the same job.
    expect(await run(b, "2026-10-19", "2026-10-17T12:00:00Z", "2026-10-19T04:05:00Z", { job: "inbox triage each morning" })).toBe(play);
    expect(await confirmedAt(b, "2026-10-12")).toBe("2026-10-19T04:05");
    // B is now a contributor too, but only from the merge on: their own earlier pick gives them nothing.
    expect(await query("select 1 from pool_play_contributors where pool_play_id = $1", [play])).toHaveLength(2);
    expect(await totals("2026-10-20T00:00:00Z")).toEqual({ [a]: 2 });
  });

  it("a pick of A's own play for A gives no point, even once confirmed", async () => {
    const a = await user("a@example.com");
    const play = (await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z"))!;
    await pick(a, "2026-10-12", play, "2026-10-12T13:00:00Z");
    await run(a, "2026-10-19", "2026-10-17T12:00:00Z", "2026-10-19T04:05:00Z");
    expect(await confirmedAt(a, "2026-10-12")).toBe("2026-10-19T04:05");
    expect(await totals("2026-10-20T00:00:00Z")).toEqual({});
  });

  it("leaves dry-run and undelivered picks alone, and a second matching run does not stamp again", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const play = (await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z"))!;
    await pick(b, "2026-10-12", play, "2026-10-12T13:00:00Z");
    await pick(b, "2026-10-12", play, "2026-10-12T13:00:00Z", { dry: true, position: 2 });
    await pick(b, "2026-10-12", play, null, { position: 3 });
    await run(b, "2026-10-19", "2026-10-17T12:00:00Z", "2026-10-19T04:05:00Z");
    expect(await confirmedAt(b, "2026-10-12", 1)).toBe("2026-10-19T04:05");
    expect(await confirmedAt(b, "2026-10-12", 2)).toBeNull();
    expect(await confirmedAt(b, "2026-10-12", 3)).toBeNull();
    // The dry-run pick earns nothing either.
    expect(await totals("2026-10-20T00:00:00Z")).toEqual({ [a]: 2 });

    await run(b, "2026-10-26", "2026-10-24T12:00:00Z", "2026-10-26T04:05:00Z");
    expect(await confirmedAt(b, "2026-10-12", 1)).toBe("2026-10-19T04:05");
    expect(await totals("2026-10-27T00:00:00Z")).toEqual({ [a]: 2 });
  });

  it("a run for the list's own week, or an earlier one, does not confirm it", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const play = (await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z"))!;
    await pick(b, "2026-10-19", play, "2026-10-19T13:00:00Z");
    // B's run for the week of the 19th, though received (by its stamp) after the list.
    await run(b, "2026-10-19", "2026-10-20T12:00:00Z", "2026-10-21T04:05:00Z");
    expect(await confirmedAt(b, "2026-10-19")).toBeNull();
  });

  it("confirms by week order alone, on an as-of run whose job clock is ahead of the database's", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const play = (await run(a, "2026-11-30", "2026-11-28T12:00:00Z", "2026-11-30T06:05:00Z"))!;
    // The list was delivered on the job clock (Dec 7); B's run was received on the database's clock, which is earlier.
    await pick(b, "2026-12-07", play, "2026-12-07T14:00:00Z");
    await run(b, "2026-12-14", "2026-12-01T12:00:00Z", "2026-12-14T06:05:00Z");
    expect(await confirmedAt(b, "2026-12-07")).toBe("2026-12-14T06:05");
    expect(await totals("2026-12-15T00:00:00Z")).toEqual({ [a]: 2 });
  });

  it("confirms a play picked twice for the member once: the latest list, and never again", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const play = (await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z"))!;
    await pick(b, "2026-10-12", play, "2026-10-12T13:00:00Z");
    await pick(b, "2026-10-26", play, "2026-10-26T13:00:00Z");
    await run(b, "2026-11-02", "2026-10-31T12:00:00Z", "2026-11-02T06:05:00Z");
    expect(await confirmedAt(b, "2026-10-26")).toBe("2026-11-02T06:05");
    expect(await confirmedAt(b, "2026-10-12")).toBeNull();
    await run(b, "2026-11-09", "2026-11-07T12:00:00Z", "2026-11-09T06:05:00Z");
    expect(await confirmedAt(b, "2026-10-12")).toBeNull();
    expect(await totals("2026-11-10T00:00:00Z")).toEqual({ [a]: 3 }); // two adoptions, one confirmation
  });

  it("a matching-only run confirms the pick, though it never adds a contributor", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com", "match_only");
    const play = (await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z"))!;
    await pick(b, "2026-10-12", play, "2026-10-12T13:00:00Z");
    await run(b, "2026-10-19", "2026-10-17T12:00:00Z", "2026-10-19T04:05:00Z", { sharing: "match_only" });
    expect(await confirmedAt(b, "2026-10-12")).toBe("2026-10-19T04:05");
    expect(await query("select 1 from pool_play_contributors where pool_play_id = $1", [play])).toHaveLength(1);
  });

  it("a play with two contributors gives each of them both points", async () => {
    const a = await user("a@example.com");
    const c = await user("c@example.com");
    const b = await user("b@example.com");
    const play = (await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z"))!;
    expect(await run(c, "2026-10-05", "2026-10-04T12:00:00Z", "2026-10-05T04:06:00Z")).toBe(play);
    await pick(b, "2026-10-12", play, "2026-10-12T13:00:00Z");
    await run(b, "2026-10-19", "2026-10-17T12:00:00Z", "2026-10-19T04:05:00Z");
    expect(await totals("2026-10-20T00:00:00Z")).toEqual({ [a]: 2, [c]: 2 });
  });

  it("C contributing in week 10 gets nothing for picks of the play delivered in weeks 1 to 9", async () => {
    const a = await user("a@example.com");
    const play = (await run(a, "2026-07-27", "2026-07-25T12:00:00Z", "2026-07-27T04:05:00Z"))!;
    // Nine weekly picks, for nine different members, weeks 1 to 9 (Aug 3 to Sep 28).
    for (let i = 0; i < 9; i++) {
      const m = await user(`m${i}@example.com`);
      const week = new Date(Date.UTC(2026, 7, 3 + 7 * i)).toISOString().slice(0, 10);
      await pick(m, week, play, `${week}T13:00:00Z`);
    }
    const c = await user("c@example.com");
    expect(await run(c, "2026-10-05", "2026-10-04T12:00:00Z", "2026-10-05T04:05:00Z")).toBe(play); // week 10
    const late = await user("late@example.com");
    await pick(late, "2026-10-12", play, "2026-10-12T13:00:00Z");
    expect(await totals("2026-10-13T00:00:00Z")).toEqual({ [a]: 10, [c]: 1 });
  });

  it("a merge that loses the claim stamps nothing", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const play = (await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z"))!;
    await pick(b, "2026-10-12", play, "2026-10-12T13:00:00Z");
    const { processRun } = await import("@/lib/intake/process");
    const [r] = await query<{ id: string }>(
      "insert into runs (user_id, week_of, route, agent, sharing, raw_text, received_at) values ($1, '2026-10-19', 'connector', 'hark', 'share', $2, '2026-10-17T12:00:00Z') returning id",
      [b, report("Inbox triage", "inbox sort")],
    );
    await processRun(query, r.id, { model: cleanReview, query });
    // Another worker places B's play while this one waits for the model: this merge's claim then fails.
    const racing: MergeModel = {
      async sameJob(p, cands) {
        await query("update plays set merged_at = now() where id = $1", [p.id]);
        return keyModel.sameJob(p, cands);
      },
    };
    await mergePending(query, racing, { now: new Date("2026-10-19T04:05:00Z") });
    expect(await confirmedAt(b, "2026-10-12")).toBeNull();
    expect(await query("select 1 from pool_play_contributors where pool_play_id = $1", [play])).toHaveLength(1);
  });
});

describe("contributed_at and contributed_week", () => {
  const stamps = () =>
    query<{ contributor: string; at: string | null; week: string | null }>(
      "select contributor, to_char(contributed_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI') as at, to_char(contributed_week, 'YYYY-MM-DD') as week from pool_play_contributors order by contributor",
    );

  it("a merge without a job clock still stamps the contributor, with the run's week", async () => {
    const a = await user("a@example.com");
    const { processRun } = await import("@/lib/intake/process");
    const [r] = await query<{ id: string }>(
      "insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-10-05', 'connector', 'hark', 'share', $2) returning id",
      [a, report("Inbox triage", "inbox sort")],
    );
    await processRun(query, r.id, { model: cleanReview, query });
    await mergePending(query, keyModel);
    const [s] = await stamps();
    expect(s.at).not.toBeNull();
    expect(s.week).toBe("2026-10-05");
  });

  it("a joining contributor gets the week of the run that joined", async () => {
    const a = await user("a@example.com");
    const c = await user("c@example.com");
    await run(a, "2026-10-05", "2026-10-03T12:00:00Z", "2026-10-05T04:05:00Z");
    await run(c, "2026-10-19", "2026-10-17T12:00:00Z", "2026-10-19T04:05:00Z");
    expect(await stamps()).toEqual(
      [
        { contributor: a, at: "2026-10-05T04:05", week: "2026-10-05" },
        { contributor: c, at: "2026-10-19T04:05", week: "2026-10-19" },
      ].sort((x, y) => x.contributor.localeCompare(y.contributor)),
    );
  });

  it("a seed import stamps contributed_at with the clock it is given", async () => {
    const r = await importSeedRun(
      query,
      { label: "Rob", agent: "hark", text: report("Listing post", "listing post weekly"), ranOn: "2026-11-12" },
      { model: cleanReview, merge: keyModel, query, now: new Date("2026-11-13T15:30:00Z") },
    );
    expect(await stamps()).toEqual([{ contributor: `seed:${r.contributorId}`, at: "2026-11-13T15:30", week: "2026-11-16" }]);
    // Every seed import owes a points rebuild.
    expect(await query("select 1 from settings where key = $1", [REBUILD_OWED_KEY])).toHaveLength(1);
  });
});

describe("a late contributor owes a points rebuild", () => {
  it("a merge adding a contributor from before the newest closed week sets the marker, and the next hourly pass credits the closed week", async () => {
    const real = new Date("2026-11-27T12:00:00Z");
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const play = (await run(a, "2026-09-28", "2026-09-26T12:00:00Z", "2026-09-28T04:05:00Z"))!;
    expect(lastTally.earliestContribution).toBeNull(); // a new pool play: nothing to owe
    await pick(b, "2026-10-05", play, "2026-10-05T13:00:00Z");
    await refreshPoints(query, { now: new Date("2026-10-21T12:00:00Z"), realNow: real }); // closes the week of the 5th

    // C's run for the week of Sep 28 is merged only now (it was held, say), joining the same play.
    const c = await user("c@example.com");
    expect(await run(c, "2026-09-28", "2026-09-27T12:00:00Z", "2026-10-22T04:05:00Z")).toBe(play);
    expect(lastTally.earliestContribution).toBe("2026-09-28");
    expect(await owePointsRebuildFor(query, lastTally.earliestContribution)).toBe(true);
    // A contributor from the open weeks owes nothing.
    expect(await owePointsRebuildFor(query, "2026-10-19")).toBe(false);

    expect(await refreshPoints(query, { now: new Date("2026-10-22T12:00:00Z"), realNow: real })).toMatchObject({ from: "2026-10-12" });
    expect(await standingOf(query, c)).toMatchObject({ total: 0 }); // the refresh alone never revisits the closed week
    expect(await runPointsTask(query, { now: new Date("2026-10-22T13:00:00Z"), realNow: real })).toMatchObject({ rebuilt: true });
    expect(await standingOf(query, c)).toMatchObject({ total: 1 });
    expect(await query("select 1 from settings where key = $1", [REBUILD_OWED_KEY])).toHaveLength(0);
  });
});
