import { describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import {
  CUSTOMERS_PER_CLOCK,
  clockGroup,
  monthSteps,
  openSandbox,
  resetScenarioDb,
  SandboxRefused,
  sandboxEnvPresent,
  TestClocks,
  type ClockState,
  type TestClockApi,
} from "./helpers";

/**
 * B3 plan Unit 13: the sandbox harness's own rules, with no credentials and
 * no network (this file runs in the default suite). The refusals come before
 * any database or Stripe call; customers go onto test clocks three at a time;
 * every clock moves to the same instant, at most a month a step, and is
 * waited on until ready.
 */

const SANDBOX_ENV = {
  SCENARIO_TARGET: "sandbox",
  STRIPE_SECRET_KEY: "sk_test_abc",
  SCENARIO_DATABASE_URL: "postgres://scenario.example/roger",
  DATABASE_URL: "postgres://preview.example/roger",
  STRIPE_PRICE_MONTHLY_USD: "price_1",
  STRIPE_PRICE_MONTHLY_CAD: "price_2",
  STRIPE_PRICE_MONTHLY_HIGHER_USD: "price_3",
  STRIPE_PRICE_MONTHLY_HIGHER_CAD: "price_4",
  STRIPE_PRICE_RUN_USD: "price_5",
  STRIPE_PRICE_RUN_CAD: "price_6",
};

/** A query that records every call, over a real (PGlite) database. */
async function recordingDb() {
  const { query } = await testDb();
  const calls: string[] = [];
  const q: Query = async <T,>(text: string, params?: unknown[]) => {
    calls.push(text);
    return query<T>(text, params);
  };
  return { q, raw: query, calls };
}

/** openSandbox with a recording database and a Stripe factory that only counts. */
async function open(env: Record<string, string | undefined>, db?: Awaited<ReturnType<typeof recordingDb>>) {
  const d = db ?? (await recordingDb());
  const seen = { connect: 0, stripe: 0 };
  const run = openSandbox(env, {
    connect: () => {
      seen.connect++;
      return d.q;
    },
    stripeClient: () => {
      seen.stripe++;
      return {} as never;
    },
  });
  return { run, seen, db: d };
}

describe("when sandbox mode runs", () => {
  it("needs SCENARIO_TARGET=sandbox, an sk_test_ key, the six price ids and SCENARIO_DATABASE_URL", () => {
    expect(sandboxEnvPresent(SANDBOX_ENV)).toBe(true);
    expect(sandboxEnvPresent({})).toBe(false);
    expect(sandboxEnvPresent({ ...SANDBOX_ENV, SCENARIO_TARGET: "fakes" })).toBe(false);
    expect(sandboxEnvPresent({ ...SANDBOX_ENV, SCENARIO_TARGET: undefined })).toBe(false);
    expect(sandboxEnvPresent({ ...SANDBOX_ENV, SCENARIO_DATABASE_URL: "" })).toBe(false);
    expect(sandboxEnvPresent({ ...SANDBOX_ENV, STRIPE_PRICE_RUN_CAD: undefined })).toBe(false);
    expect(sandboxEnvPresent({ ...SANDBOX_ENV, STRIPE_SECRET_KEY: undefined })).toBe(false);
  });

  it("is present-looking with a live key, so the run reaches the refusal instead of skipping quietly", () => {
    // A live key must fail loudly, never skip: the refusal below is what stops it.
    expect(sandboxEnvPresent({ ...SANDBOX_ENV, STRIPE_SECRET_KEY: "sk_live_abc" })).toBe(true);
  });
});

describe("the refusals, before anything is touched", () => {
  it.each(["sk_live_abc", "rk_live_abc"])("refuses a live key (%s) before any database or Stripe call", async (key) => {
    const { run, seen, db } = await open({ ...SANDBOX_ENV, STRIPE_SECRET_KEY: key });
    await expect(run).rejects.toThrow(SandboxRefused);
    await expect(run).rejects.toThrow(/live/i);
    expect(seen).toEqual({ connect: 0, stripe: 0 });
    expect(db.calls).toEqual([]);
  });

  it.each([undefined, "", "rk_test_abc", "pk_test_abc", "whsec_abc"])("refuses anything but an sk_test_ key (%s)", async (key) => {
    const { run, seen } = await open({ ...SANDBOX_ENV, STRIPE_SECRET_KEY: key });
    await expect(run).rejects.toThrow(/sk_test_/);
    expect(seen).toEqual({ connect: 0, stripe: 0 });
  });

  it("refuses SCENARIO_DATABASE_URL equal to DATABASE_URL, before connecting", async () => {
    const { run, seen, db } = await open({ ...SANDBOX_ENV, DATABASE_URL: SANDBOX_ENV.SCENARIO_DATABASE_URL });
    await expect(run).rejects.toThrow(/SCENARIO_DATABASE_URL.*DATABASE_URL/);
    expect(seen).toEqual({ connect: 0, stripe: 0 });
    expect(db.calls).toEqual([]);
  });

  it("refuses a missing SCENARIO_DATABASE_URL", async () => {
    const { run, seen } = await open({ ...SANDBOX_ENV, SCENARIO_DATABASE_URL: undefined });
    await expect(run).rejects.toThrow(/SCENARIO_DATABASE_URL/);
    expect(seen.connect).toBe(0);
  });

  it("refuses an unmarked database, and truncates nothing", async () => {
    const db = await recordingDb();
    await db.raw(`insert into users (email, name, status, plan) values ('keep@example.com', 'Keep', 'trial', 'monthly')`);
    const { run, seen } = await open(SANDBOX_ENV, db);
    await expect(run).rejects.toThrow(/marker/);
    expect(seen.stripe).toBe(0);
    expect(db.calls.some((c) => /truncate|delete/i.test(c))).toBe(false);
    expect(await db.raw(`select email from users`)).toEqual([{ email: "keep@example.com" }]);
  });

  it.each(["preview", "local"])("refuses a database marked %s (only a scenario database marked test is reset)", async (mark) => {
    const db = await recordingDb();
    await db.raw(`insert into settings (key, value) values ('db.environment', $1::jsonb)`, [JSON.stringify(mark)]);
    await db.raw(`insert into users (email, name, status, plan) values ('keep@example.com', 'Keep', 'trial', 'monthly')`);
    const { run } = await open(SANDBOX_ENV, db);
    await expect(run).rejects.toThrow(/test/);
    expect(await db.raw(`select email from users`)).toHaveLength(1);
  });

  it("resets a database marked test: every app table emptied, the marker kept, other settings gone; then Stripe is made", async () => {
    const db = await recordingDb();
    await db.raw(`insert into settings (key, value) values ('db.environment', '"test"'::jsonb), ('v3.referralsOn', 'true'::jsonb)`);
    await db.raw(`insert into users (email, name, status, plan) values ('old@example.com', 'Old', 'trial', 'monthly')`);
    const { run, seen } = await open(SANDBOX_ENV, db);
    const s = await run;
    expect(seen).toEqual({ connect: 1, stripe: 1 });
    expect(s.query).toBe(db.q);
    expect(await db.raw(`select 1 from users`)).toEqual([]);
    expect(await db.raw(`select key, value from settings`)).toEqual([{ key: "db.environment", value: "test" }]);
  });
});

describe("resetScenarioDb on its own", () => {
  it("checks the marker itself, so it can never be called on an unmarked database by mistake", async () => {
    const db = await recordingDb();
    await db.raw(`insert into users (email, name, status, plan) values ('keep@example.com', 'Keep', 'trial', 'monthly')`);
    await expect(resetScenarioDb(db.q)).rejects.toThrow(SandboxRefused);
    expect(await db.raw(`select 1 from users`)).toHaveLength(1);
  });
});

describe("customers onto test clocks", () => {
  it("puts customers 1 to 3 on clock A and customer 4 on clock B", () => {
    expect(CUSTOMERS_PER_CLOCK).toBe(3);
    expect([0, 1, 2, 3, 4, 5, 6].map(clockGroup)).toEqual([0, 0, 0, 1, 1, 1, 2]);
  });
});

/** A fake of Stripe's test-clock API: advancing takes `polls` reads before the clock reports ready. */
function fakeClocks(o: { polls?: number; failOn?: string; stuck?: string } = {}) {
  const clocks = new Map<string, ClockState & { readsLeft: number }>();
  const log: string[] = [];
  let n = 0;
  const api: TestClockApi = {
    async create({ frozenTime }) {
      const id = `clock_${String.fromCharCode(65 + n++)}`;
      clocks.set(id, { id, status: "ready", frozenTime, readsLeft: 0 });
      log.push(`create ${id} ${frozenTime}`);
      return { id };
    },
    async advance(id, frozenTime) {
      const c = clocks.get(id)!;
      if (c.status !== "ready") throw new Error(`${id} is ${c.status}`);
      if (frozenTime <= c.frozenTime) throw new Error(`${id}: frozen_time must move forward`);
      log.push(`advance ${id} ${frozenTime}`);
      Object.assign(c, { status: "advancing", frozenTime, readsLeft: o.polls ?? 2 });
    },
    async retrieve(id) {
      const c = clocks.get(id)!;
      if (c.status === "advancing" && id !== o.stuck) {
        if (id === o.failOn) c.status = "internal_failure";
        else if (--c.readsLeft <= 0) c.status = "ready";
      }
      return { id: c.id, status: c.status, frozenTime: c.frozenTime };
    },
    async del(id) {
      log.push(`delete ${id}`);
      clocks.delete(id);
    },
  };
  return { api, clocks, log };
}

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const noSleep = async () => {};

describe("monthSteps: the instants a clock moves through", () => {
  it("is one instant for a move of a month or less", () => {
    expect(monthSteps(new Date("2026-12-01T15:00:00Z"), new Date("2026-12-20T15:00:00Z")).map((d) => d.toISOString())).toEqual(["2026-12-20T15:00:00.000Z"]);
    expect(monthSteps(new Date("2026-12-01T15:00:00Z"), new Date("2027-01-01T15:00:00Z")).map((d) => d.toISOString())).toEqual(["2027-01-01T15:00:00.000Z"]);
  });

  it("splits a longer move into steps of at most a calendar month (Stripe allows two billing intervals a step)", () => {
    const steps = monthSteps(new Date("2027-01-31T15:00:00Z"), new Date("2027-04-15T15:00:00Z"));
    expect(steps.map((d) => d.toISOString())).toEqual(["2027-02-28T15:00:00.000Z", "2027-03-31T15:00:00.000Z", "2027-04-15T15:00:00.000Z"]);
  });

  it("is nothing for no move, and refuses to go back", () => {
    expect(monthSteps(new Date("2026-12-01T15:00:00Z"), new Date("2026-12-01T15:00:00Z"))).toEqual([]);
    expect(() => monthSteps(new Date("2026-12-02T15:00:00Z"), new Date("2026-12-01T15:00:00Z"))).toThrow(/forward/);
  });
});

describe("TestClocks: one app clock, every Stripe clock in step", () => {
  it("makes a new clock, frozen at the app clock, when a group of three fills", async () => {
    const f = fakeClocks();
    const c = new TestClocks(f.api, new Date("2026-12-01T15:00:00Z"), { sleep: noSleep });
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await c.nextCustomerClock());
    expect(ids).toEqual(["clock_A", "clock_A", "clock_A", "clock_B"]);
    expect(c.ids).toEqual(["clock_A", "clock_B"]);
    expect(f.log).toEqual([`create clock_A ${sec("2026-12-01T15:00:00Z")}`, `create clock_B ${sec("2026-12-01T15:00:00Z")}`]);
  });

  it("moves every clock to the same instant, step by step, waiting for all to be ready before the next step and before the step's work", async () => {
    const f = fakeClocks({ polls: 3 });
    const c = new TestClocks(f.api, new Date("2027-01-31T15:00:00Z"), { sleep: noSleep });
    for (let i = 0; i < 4; i++) await c.nextCustomerClock();
    const seenAtStep: string[] = [];
    await c.advance(new Date("2027-03-15T15:00:00Z"), async (at) => {
      // The step's work (events, then accounts) only once every clock is ready at that instant.
      for (const id of c.ids) expect(f.clocks.get(id)).toMatchObject({ status: "ready", frozenTime: Math.floor(at.getTime() / 1000) });
      seenAtStep.push(at.toISOString());
    });
    const feb = sec("2027-02-28T15:00:00Z");
    const mar = sec("2027-03-15T15:00:00Z");
    expect(f.log.filter((l) => l.startsWith("advance"))).toEqual([`advance clock_A ${feb}`, `advance clock_B ${feb}`, `advance clock_A ${mar}`, `advance clock_B ${mar}`]);
    expect(seenAtStep).toEqual(["2027-02-28T15:00:00.000Z", "2027-03-15T15:00:00.000Z"]);
    expect(c.now.toISOString()).toBe("2027-03-15T15:00:00.000Z");
    expect([...f.clocks.values()].map((x) => x.frozenTime)).toEqual([mar, mar]);
  });

  it("makes a clock after an advance frozen at the moved app clock", async () => {
    const f = fakeClocks();
    const c = new TestClocks(f.api, new Date("2026-12-01T15:00:00Z"), { sleep: noSleep });
    await c.nextCustomerClock();
    await c.advance(new Date("2026-12-10T15:00:00Z"));
    for (let i = 0; i < 3; i++) await c.nextCustomerClock();
    expect(f.log.at(-1)).toBe(`create clock_B ${sec("2026-12-10T15:00:00Z")}`);
  });

  it("with no clocks yet, still moves the app clock and runs the step's work", async () => {
    const f = fakeClocks();
    const c = new TestClocks(f.api, new Date("2026-12-01T15:00:00Z"), { sleep: noSleep });
    const steps: string[] = [];
    await c.advance(new Date("2026-12-03T15:00:00Z"), async (at) => void steps.push(at.toISOString()));
    expect(steps).toEqual(["2026-12-03T15:00:00.000Z"]);
    expect(f.log).toEqual([]);
  });

  it("fails the scenario with the clock id when a clock does not reach ready in time", async () => {
    const f = fakeClocks({ stuck: "clock_B" });
    let t = 0;
    const c = new TestClocks(f.api, new Date("2026-12-01T15:00:00Z"), { sleep: async (ms) => void (t += ms), clock: () => t, readyTimeoutMs: 10_000, pollMs: 1_000 });
    for (let i = 0; i < 4; i++) await c.nextCustomerClock();
    await expect(c.advance(new Date("2026-12-05T15:00:00Z"))).rejects.toThrow(/clock_B.*ready/);
  });

  it("fails with the clock id on Stripe's internal_failure", async () => {
    const f = fakeClocks({ failOn: "clock_A" });
    const c = new TestClocks(f.api, new Date("2026-12-01T15:00:00Z"), { sleep: noSleep });
    await c.nextCustomerClock();
    await expect(c.advance(new Date("2026-12-05T15:00:00Z"))).rejects.toThrow(/clock_A.*internal_failure/);
  });

  it("refuses to move backwards", async () => {
    const c = new TestClocks(fakeClocks().api, new Date("2026-12-05T15:00:00Z"), { sleep: noSleep });
    await expect(c.advance(new Date("2026-12-01T15:00:00Z"))).rejects.toThrow(/forward/);
  });

  it("deletes every clock at the end (which deletes their customers)", async () => {
    const f = fakeClocks();
    const c = new TestClocks(f.api, new Date("2026-12-01T15:00:00Z"), { sleep: noSleep });
    for (let i = 0; i < 4; i++) await c.nextCustomerClock();
    await c.deleteAll();
    expect(f.log.filter((l) => l.startsWith("delete"))).toEqual(["delete clock_A", "delete clock_B"]);
    expect(c.ids).toEqual([]);
  });
});
