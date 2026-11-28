import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCoraJob, type CoraDeps } from "@/lib/cora/job";
import type { FitModel } from "@/lib/cora/fit";
import type { MergeModel } from "@/lib/cora/merge";
import type { Query } from "@/lib/db-query";
import type { IntakeModel } from "@/lib/intake/model";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "./pglite-db";
import {
  expectNoLevelTables,
  expectSameTrace,
  formatTrace,
  idLabels,
  levelStatements,
  normaliseTrace,
  recordQueries,
  sequentialRandomUUID,
  sequentialDbIds,
  type RecordedStatement,
} from "./query-trace";
import { ALL_SWITCH_OFF_EXCEPTIONS, SWITCH_OFF_EXCEPTIONS, type SwitchOffException } from "./switch-off-exceptions";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/** A fake Query that runs one statement at a time, first come first served, as PGlite does; each takes `delays[sql]` ticks. */
function fakeQuery(delays: Record<string, number> = {}): Query {
  let queue: Promise<unknown> = Promise.resolve();
  return async <T,>(sql: string) => {
    const mine = queue.then(async () => {
      for (let i = 0; i < (delays[sql] ?? 1); i++) await Promise.resolve();
    });
    queue = mine;
    await mine;
    return [] as T[];
  };
}

describe("normaliseTrace", () => {
  const path = async (q: Query, o: { id: string; holder: string; code: string; at: Date; sha: string }) => {
    await q("update cora_weeks set holder = $2, lease_until = $3 where week_of = $1", ["2026-11-30", o.holder, o.at]);
    await q("insert into picks (user_id, idea_code, reason) values ($1, $2, $3)", [o.id, o.code, `{"seen":"${o.at.toISOString()}"}`]);
    await q("insert into cora_user_weeks (user_id, method_version, at_ms) values ($1, $2, $3)", [o.id, o.sha, o.at.getTime()]);
  };

  it("gives two runs with different ids, holders, idea codes, clocks and method stamps the same trace", async () => {
    const a = recordQueries(fakeQuery());
    const b = recordQueries(fakeQuery());
    await path(a.query, { id: crypto.randomUUID(), holder: crypto.randomUUID(), code: "R-ABCDEFGH", at: new Date("2026-11-30T06:05:00Z"), sha: "a".repeat(40) });
    await path(b.query, { id: crypto.randomUUID(), holder: crypto.randomUUID(), code: "R-ZZZZ2345", at: new Date("2026-11-30T06:17:31.123Z"), sha: "b".repeat(40) });
    const ta = normaliseTrace(a.recorded());
    expect(formatTrace(ta)).toBe(formatTrace(normaliseTrace(b.recorded())));
    expectSameTrace(ta, normaliseTrace(b.recorded()));
    // The same id twice keeps one placeholder, and dates without a time are kept as data.
    expect(ta[1].params).toEqual(["<id:2>", "<code:1>", '{"seen":"<time>"}']);
    expect(ta[0].params).toEqual(["2026-11-30", "<id:1>", "<time>"]);
    expect(ta[2].params).toEqual(["<id:2>", "<sha:1>", "<time>"]);
  });

  it("tells a different id relation apart (one id where there were two)", async () => {
    const id = crypto.randomUUID();
    const a = recordQueries(fakeQuery());
    const b = recordQueries(fakeQuery());
    await path(a.query, { id, holder: crypto.randomUUID(), code: "R-ABCDEFGH", at: new Date(), sha: "a".repeat(40) });
    await path(b.query, { id, holder: id, code: "R-ABCDEFGH", at: new Date(), sha: "a".repeat(40) });
    expect(() => expectSameTrace(normaliseTrace(a.recorded()), normaliseTrace(b.recorded()))).toThrow();
  });

  it("normalises a value passed as a stamp (a stubbed deploy commit)", () => {
    const rec: RecordedStatement[] = [{ sql: "x", params: ["c0ffee", "kept"], batch: 1 }];
    expect(normaliseTrace(rec, { stamps: ["c0ffee", null] })[0].params).toEqual(["<stamp:1>", "kept"]);
  });

  it("fails on SQL text changed by one column, or by whitespace", () => {
    const base = normaliseTrace([{ sql: "select id, title from pool_plays where active", params: [], batch: 1 }]);
    const oneMore = normaliseTrace([{ sql: "select id, title, score from pool_plays where active", params: [], batch: 1 }]);
    const spaced = normaliseTrace([{ sql: "select id,  title from pool_plays where active", params: [], batch: 1 }]);
    expect(() => expectSameTrace(base, oneMore)).toThrow();
    expect(() => expectSameTrace(base, spaced)).toThrow();
    expect(() => expectSameTrace(base, [])).toThrow();
  });

  it("sorts a concurrent batch, so one issued in another order still matches, but keeps sequential order", async () => {
    const run = async (delays: Record<string, number>, order: string[]) => {
      const r = recordQueries(fakeQuery(delays));
      await r.query("select 1");
      await Promise.all(order.map(async (s) => {
        await r.query(s, [crypto.randomUUID()]);
        await r.query(`${s} again`);
      }));
      await r.query("select 2");
      return r;
    };
    const a = await run({ "select b": 5 }, ["select a", "select b", "select c"]);
    const b = await run({ "select a": 5, "select c": 2 }, ["select c", "select b", "select a"]);
    expect(a.recorded().map((s) => s.batch)).toEqual([1, 2, 2, 2, 2, 2, 2, 3]);
    expectSameTrace(normaliseTrace(a.recorded()), normaliseTrace(b.recorded()));
    // Outside a batch, order is the code's: swapping two sequential statements fails.
    const c = recordQueries(fakeQuery());
    await c.query("select 2");
    await c.query("select 1");
    const d = recordQueries(fakeQuery());
    await d.query("select 1");
    await d.query("select 2");
    expect(() => expectSameTrace(normaliseTrace(c.recorded()), normaliseTrace(d.recorded()))).toThrow();
  });
});

describe("the exception list and the level-table check", () => {
  const allow: SwitchOffException = { ...SWITCH_OFF_EXCEPTIONS.levelFenceAtReceipt, addedStatements: [/^insert into level_submissions/] };

  it("allows only the statements an exception passed in names, and renumbers ids around them", () => {
    const id = crypto.randomUUID();
    const other = crypto.randomUUID();
    const base = normaliseTrace([{ sql: "insert into zack_profiles (user_id) values ($1)", params: [other], batch: 1 }]);
    const actual = normaliseTrace([
      { sql: "insert into level_submissions (user_id) values ($1)", params: [id], batch: 1 },
      { sql: "insert into zack_profiles (user_id) values ($1)", params: [other], batch: 2 },
    ]);
    expectSameTrace(base, actual, [allow]);
    expect(() => expectSameTrace(base, actual)).toThrow();
    expect(() => expectSameTrace(base, actual, ALL_SWITCH_OFF_EXCEPTIONS)).toThrow();
  });

  it("finds any statement on a B4 table or column, except one an exception allows", () => {
    const trace = normaliseTrace(
      [
        "select level_earned from user_levels where user_id = $1",
        "update cora_user_weeks set review_hold = 'waiting'",
        "select has_level_block from zack_profiles",
        "insert into level_submissions (user_id) values ($1)",
        "select 1 from cora_job_matches",
        "select slot from promo_reservations",
      ].map((sql, i) => ({ sql, params: [], batch: i + 1 })),
    );
    expect(levelStatements(trace).map((s) => s.sql)).toHaveLength(5);
    expect(levelStatements(trace, [allow]).map((s) => s.sql)).not.toContain("insert into level_submissions (user_id) values ($1)");
    expect(() => expectNoLevelTables(trace)).toThrow();
    expectNoLevelTables(trace.slice(5));
  });

  it("lists the plan's four reviewed exceptions, each with a path, a difference and a reason", () => {
    expect(ALL_SWITCH_OFF_EXCEPTIONS.map((e) => [e.id, e.unit])).toEqual([
      ["level-fence-at-receipt", 5],
      ["profile-settings-read", 7],
      ["retention-level-erase", 14],
      ["hourly-level-tasks", 7],
    ]);
    for (const e of ALL_SWITCH_OFF_EXCEPTIONS) for (const k of ["path", "difference", "why"] as const) expect(e[k].length, `${e.id}.${k}`).toBeGreaterThan(20);
  });
});

// The Cora job (B1's Monday pick) on a fixed fixture: the trace is stable across two runs, and a real SQL change shows.
describe("on a B1 path: the Cora job", () => {
  const WEEK = "2026-11-30";
  const ONE_AM = new Date("2026-11-30T06:05:00Z");
  const live = mergeV3([{ key: "v3.cycleLive", value: true }]);
  const intake: IntakeModel = { readRun: async () => Promise.reject(new Error("unused")), review: async () => [] };
  const merge: MergeModel = { sameJob: async (p, cands) => cands.find((c) => c.job.split(" ")[0] === p.job.split(" ")[0])?.id ?? null };
  const fit: FitModel = { fit: async (_u, cands) => cands.map((c) => ({ id: c.id, fit: 3 as const, frictionMatch: false, why: "category" as const })) };
  const transport: Transport = async () => ({ ok: true });
  const play = (title: string, job: string, category = "Email and calendar", set = "A") => ({
    set, title, category, job, description: `${title}.`, minutes_saved_each: 10, current_hours_week: 1, confidence: "Medium", basis: "Implied",
    playbook_md: "1. Do the thing.\n2. Check it.", install_notes: "Save as a skill.",
  });
  const report = (plays: unknown[]) => `# Zack v2.0\n\n\`\`\`roger-run\n${JSON.stringify({ zack_version: "2.0", plays })}\n\`\`\`\n`;

  /**
   * A fresh database with three members and their runs, its ids counting from `start` (B1 reads
   * pending plays and pool candidates in id order, so random ids could take another valid path).
   */
  async function seeded(start: number) {
    const { query } = await testDb();
    await sequentialDbIds(query, start);
    const member = async (email: string) =>
      (await query<{ id: string }>("insert into users (email, status, plan, sharing) values ($1, 'active', 'monthly', 'share') returning id", [email]))[0].id;
    // Fixed receipt times: merging takes plays in received_at order, and inserts in one millisecond would tie.
    const run = (u: string, at: string, plays: unknown[]) =>
      query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, received_at) values ($1, $2, 'connector', 'hark', 'share', $3, $4)", [u, WEEK, report(plays), at]);
    const a = await member("a@example.com");
    const b = await member("b@example.com");
    const c = await member("c@example.com");
    await run(a, "2026-11-29T20:00:00Z", [play("Inbox triage", "inbox sort"), play("Listing post", "listing weekly", "Listings", "B")]);
    await run(b, "2026-11-29T21:00:00Z", [play("Calendar prep", "calendar briefs"), play("Follow-up drafts", "followup drafts", "Client follow-up", "B")]);
    await run(c, "2026-11-29T22:00:00Z", [play("Expense log", "expense capture", "Operations"), play("Inbox sorter", "inbox triage")]);
    const recorder = recordQueries(query);
    return { ...recorder, raw: query, start };
  }
  /** Runs the job with ids and lease holders made in code counting from the fixture's own start. */
  const job = async (r: Awaited<ReturnType<typeof seeded>>, o: { q?: Query; now?: Date; dryRun?: boolean } = {}) => {
    const spy = vi.spyOn(crypto, "randomUUID").mockImplementation(sequentialRandomUUID(r.start));
    try {
      const q = o.q ?? r.query;
      return await runCoraJob(q, deps(q), { now: o.now ?? ONE_AM, settings: live, dryRun: o.dryRun });
    } finally {
      spy.mockRestore();
    }
  };
  const traceOf = async (r: Awaited<ReturnType<typeof seeded>>) =>
    normaliseTrace(r.recorded(), { stamps: ["c0ffee"], labels: await idLabels(r.raw) });
  const deps = (q: Query): CoraDeps => ({ intake, merge, fit, query: q, transport, sleep: async () => {} });

  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "c0ffee");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("gives the same normalised trace on two runs (new ids, holders and a later clock), touching no level table", async () => {
    const first = await seeded(1);
    const second = await seeded(5000);
    expect(await job(first)).toMatchObject({ status: "ready" });
    expect(await job(second, { now: new Date(ONE_AM.getTime() + 7 * 60_000) })).toMatchObject({ status: "ready" });
    // The two runs really had different ids.
    expect(first.recorded().map((s) => JSON.stringify(s.params)).join()).not.toBe(second.recorded().map((s) => JSON.stringify(s.params)).join());
    const a = await traceOf(first);
    const b = await traceOf(second);
    expect(a.length).toBeGreaterThan(20);
    expect(a.some((s) => /insert into picks/i.test(s.sql))).toBe(true);
    expectSameTrace(a, b);
    expectNoLevelTables(a);
    // Nothing generated survives normalisation.
    expect(formatTrace(a)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(formatTrace(a)).not.toContain("c0ffee");
  }, 30_000);

  it("detects a real SQL change in the same path (one select gaining a column), and a different path", async () => {
    const base = await seeded(1);
    await job(base);
    // The same job with one statement edited, as a code change to that constant would.
    const edited = await seeded(1);
    const decidedSql = "select user_id from cora_user_weeks where week_of = $1 and dry_run = $2";
    expect(base.recorded().some((s) => s.sql === decidedSql)).toBe(true);
    const changed: Query = (sql, params) => edited.query(sql === decidedSql ? "select user_id, outcome from cora_user_weeks where week_of = $1 and dry_run = $2" : sql, params);
    await job(edited, { q: changed });
    const baseTrace = await traceOf(base);
    const editedTrace = await traceOf(edited);
    expect(() => expectSameTrace(baseTrace, editedTrace)).toThrow();
    // A dry run is another path, and its trace differs too.
    const dry = await seeded(1);
    await job(dry, { dryRun: true });
    const dryTrace = await traceOf(dry);
    expect(() => expectSameTrace(baseTrace, dryTrace)).toThrow();
  }, 30_000);
});
