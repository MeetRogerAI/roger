/**
 * Sandbox mode for the scenario tests (B3 plan Unit 13; spec B.16, "Scenario
 * tests against the sandbox"). How to run it: tests/scenarios/README.md.
 *
 * - `sandboxEnvPresent` gates every sandbox `describe` (`describe.skipIf`),
 *   so the default suite and CI skip them.
 * - `openSandbox` refuses an unsafe target before anything is touched, in
 *   this order: a key that is not `sk_test_` (a live key above all); a
 *   missing `SCENARIO_DATABASE_URL`, or one equal to `DATABASE_URL`; then,
 *   on the first query, a database without the marker row `db.environment`
 *   = "test". Only then is the database reset and the Stripe client made.
 * - `resetScenarioDb` empties every app table (one `truncate … restart
 *   identity cascade` built from `information_schema`) and every settings
 *   row but the marker: the baseline the fakes mode starts from (a schema
 *   with no rows). No Neon API and no branch reset.
 * - `TestClocks`: a Stripe test clock holds at most three customers, so the
 *   customers go onto clocks three at a time, in creation order, and a new
 *   clock is made (frozen at the app clock) when one fills. `advance` moves
 *   every clock to the same instant, at most a calendar month a step (Stripe
 *   allows two billing intervals a step), waits until every clock is ready,
 *   and only then runs the step's work (the world's events, then accounts).
 *
 * The Stripe test-clock calls (`stripe.testHelpers.testClocks.create`,
 * `.advance`, `.retrieve`, `.del`; `customers.create({ test_clock })`) are
 * wrapped in `stripeTestClocks`, so the rules above are tested on a fake
 * (tests/scenarios/helpers.test.ts) with no network.
 */
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import type { Query } from "@/lib/db-query";
import { anniversary } from "@/lib/billing/period";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe";

type Env = Record<string, string | undefined>;

/** The six price ids the app reads (src/lib/billing/prices.ts), as the sandbox's own test prices. */
export const SANDBOX_PRICE_VARS = [
  "STRIPE_PRICE_MONTHLY_USD",
  "STRIPE_PRICE_MONTHLY_CAD",
  "STRIPE_PRICE_MONTHLY_HIGHER_USD",
  "STRIPE_PRICE_MONTHLY_HIGHER_CAD",
  "STRIPE_PRICE_RUN_USD",
  "STRIPE_PRICE_RUN_CAD",
] as const;

/** The one marker value a scenario database may carry (`node db/setup.mjs --mark=test`). Preview is never reset. */
export const SCENARIO_MARK = "test";

/**
 * Whether the sandbox runs: `SCENARIO_TARGET=sandbox` and a key, the six
 * price ids and `SCENARIO_DATABASE_URL` all set. The key's kind is not
 * checked here: a live key must reach `openSandbox` and be refused loudly,
 * never be skipped quietly.
 */
export function sandboxEnvPresent(env: Env = process.env): boolean {
  const set = (k: string) => Boolean(env[k]?.trim());
  return (env.SCENARIO_TARGET ?? "").trim().toLowerCase() === "sandbox" && set("STRIPE_SECRET_KEY") && set("SCENARIO_DATABASE_URL") && SANDBOX_PRICE_VARS.every(set);
}

export class SandboxRefused extends Error {
  constructor(message: string) {
    super(`Sandbox refused: ${message}`);
    this.name = "SandboxRefused";
  }
}

/** The key and the URLs, checked before any connection or Stripe call. */
function refuseUnsafeEnv(env: Env): { key: string; url: string } {
  const key = (env.STRIPE_SECRET_KEY ?? "").trim();
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) throw new SandboxRefused("STRIPE_SECRET_KEY is a live key. Scenario tests only ever run against the Stripe sandbox.");
  if (!key.startsWith("sk_test_")) throw new SandboxRefused("STRIPE_SECRET_KEY must be the sandbox's secret key (sk_test_…).");
  const url = (env.SCENARIO_DATABASE_URL ?? "").trim();
  if (!url) throw new SandboxRefused("SCENARIO_DATABASE_URL is not set.");
  if (url === (env.DATABASE_URL ?? "").trim()) throw new SandboxRefused("SCENARIO_DATABASE_URL is the same as DATABASE_URL. Point it at the scenario-test branch only.");
  return { key, url };
}

/** The database must say it is the scenario database; any error (no settings table, no row) is a refusal. */
async function refuseUnmarked(q: Query): Promise<void> {
  let rows: { value: unknown }[];
  try {
    rows = await q<{ value: unknown }>(`select value from settings where key = 'db.environment'`);
  } catch (e) {
    throw new SandboxRefused(`the scenario database's marker could not be read (${e instanceof Error ? e.message : String(e)}).`);
  }
  const value = rows[0]?.value;
  if (!rows.length) throw new SandboxRefused("the scenario database has no non-production marker row (db.environment). Nothing was reset.");
  if (value !== SCENARIO_MARK) throw new SandboxRefused(`the database is marked "${String(value)}", not "${SCENARIO_MARK}". Only a scenario database marked test is reset.`);
}

/**
 * Back to the fakes baseline: every app table emptied and every settings row
 * but the marker deleted. Checks the marker itself first, so nothing is ever
 * truncated on an unmarked database.
 */
export async function resetScenarioDb(q: Query): Promise<void> {
  await refuseUnmarked(q);
  const tables = await q<{ name: string }>(
    `select table_name as name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'settings' order by 1`,
  );
  if (tables.length) await q(`truncate table ${tables.map((t) => `"${t.name.replaceAll('"', '""')}"`).join(", ")} restart identity cascade`);
  await q(`delete from settings where key <> 'db.environment'`);
}

export type SandboxDeps = { connect: (url: string) => Query; stripeClient: (key: string) => Stripe };

const realDeps: SandboxDeps = {
  connect: (url) => {
    const sql = neon(url);
    return async <T,>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];
  },
  stripeClient: (key) => new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 30_000, typescript: true }),
};

/** The refusals, then the reset, then the Stripe client: the only way a sandbox scenario gets a database and Stripe. */
export async function openSandbox(env: Env = process.env, deps: SandboxDeps = realDeps): Promise<{ query: Query; stripe: Stripe }> {
  const { key, url } = refuseUnsafeEnv(env);
  const query = deps.connect(url);
  await resetScenarioDb(query);
  return { query, stripe: deps.stripeClient(key) };
}

// ---------------------------------------------------------------------------
// Test clocks.

/** Stripe's limit (Test clocks, Limitations: three customers per clock). */
export const CUSTOMERS_PER_CLOCK = 3;

/** The clock group of the n-th customer (0-based, creation order). */
export const clockGroup = (n: number) => Math.floor(n / CUSTOMERS_PER_CLOCK);

export type ClockState = { id: string; status: string; frozenTime: number };

/** The part of Stripe's test-clock API the harness uses; times are unix seconds. */
export interface TestClockApi {
  create(o: { frozenTime: number; name: string }): Promise<{ id: string }>;
  advance(id: string, frozenTime: number): Promise<void>;
  retrieve(id: string): Promise<ClockState>;
  del(id: string): Promise<void>;
}

export function stripeTestClocks(s: Stripe): TestClockApi {
  const c = s.testHelpers.testClocks;
  return {
    async create({ frozenTime, name }) {
      const x = await c.create({ frozen_time: frozenTime, name });
      return { id: x.id };
    },
    async advance(id, frozenTime) {
      await c.advance(id, { frozen_time: frozenTime });
    },
    async retrieve(id) {
      const x = await c.retrieve(id);
      return { id: x.id, status: x.status, frozenTime: x.frozen_time };
    },
    async del(id) {
      await c.del(id);
    },
  };
}

const toSec = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * The instants a move from `from` to `to` goes through: a calendar month at
 * a time from `from` (the billing anniversary rule, src/lib/billing/period.ts),
 * then `to`. A monthly subscription's two-interval limit is never reached.
 */
export function monthSteps(from: Date, to: Date): Date[] {
  if (to < from) throw new Error(`The clock only moves forward (${from.toISOString()} -> ${to.toISOString()}).`);
  const out: Date[] = [];
  for (let k = 1; ; k++) {
    const next = anniversary(from, k);
    if (next >= to) break;
    out.push(next);
  }
  if (to > from) out.push(to);
  return out;
}

export type ClockOptions = { sleep?: (ms: number) => Promise<void>; clock?: () => number; readyTimeoutMs?: number; pollMs?: number; name?: string };

/** One app clock, and the Stripe test clocks that move with it. */
export class TestClocks {
  readonly ids: string[] = [];
  private customers = 0;
  private at: Date;
  private o: Required<ClockOptions>;

  constructor(
    private api: TestClockApi,
    start: Date,
    o: ClockOptions = {},
  ) {
    this.at = new Date(toSec(start) * 1000);
    this.o = {
      sleep: o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      clock: o.clock ?? Date.now,
      readyTimeoutMs: o.readyTimeoutMs ?? 90_000,
      pollMs: o.pollMs ?? 2_000,
      name: o.name ?? "roger scenario",
    };
  }

  get now(): Date {
    return this.at;
  }

  /** The clock the next customer goes on; a new one, frozen at the app clock, when the last is full. */
  async nextCustomerClock(): Promise<string> {
    const g = clockGroup(this.customers);
    if (g >= this.ids.length) {
      const { id } = await this.api.create({ frozenTime: toSec(this.at), name: `${this.o.name} ${g + 1}` });
      this.ids.push(id);
    }
    this.customers++;
    return this.ids[g];
  }

  /** Every clock to `to`, in steps; after each step, once all are ready, `onStep` (the world's events, then accounts). */
  async advance(to: Date, onStep?: (at: Date) => Promise<void>): Promise<void> {
    for (const step of monthSteps(this.at, new Date(toSec(to) * 1000))) {
      const t = toSec(step);
      for (const id of this.ids) await this.api.advance(id, t);
      await this.waitReady(t);
      this.at = step;
      await onStep?.(step);
    }
  }

  private async waitReady(t: number): Promise<void> {
    const deadline = this.o.clock() + this.o.readyTimeoutMs;
    for (const id of this.ids) {
      for (;;) {
        const c = await this.api.retrieve(id);
        if (c.status === "internal_failure") throw new Error(`Test clock ${id} reported internal_failure advancing to ${new Date(t * 1000).toISOString()}.`);
        if (c.status === "ready" && c.frozenTime === t) break;
        if (this.o.clock() >= deadline) throw new Error(`Test clock ${id} did not reach ready at ${new Date(t * 1000).toISOString()} within ${this.o.readyTimeoutMs / 1000}s (status ${c.status}).`);
        await this.o.sleep(this.o.pollMs);
      }
    }
  }

  /** Deletes every clock, and with it every customer on it. */
  async deleteAll(): Promise<void> {
    const ids = this.ids.splice(0);
    const failed: string[] = [];
    for (const id of ids) await this.api.del(id).catch(() => failed.push(id));
    if (failed.length) throw new Error(`Test clocks not deleted (delete them in the Stripe sandbox): ${failed.join(", ")}`);
  }
}
