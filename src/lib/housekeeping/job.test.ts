import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import { HOURLY_TASKS, reconcileStripe, runHourly, type HourlyTask } from "./job";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
const transport: Transport = async () => ({ ok: true });
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const NOW = new Date("2026-12-15T15:00:00Z");

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("the hourly pass", () => {
  it("runs the cheap database tasks first", () => {
    expect(HOURLY_TASKS.slice(0, 2).map((t) => t.name)).toEqual(["expired_cleanup", "retention"]);
  });

  it("leaves tasks not started by the pass's deadline to the next pass, and hands the deadline to each task", async () => {
    const seen: number[] = [];
    const tasks: HourlyTask[] = [
      { name: "a", run: async (_q, _d, c) => void seen.push(c.deadline) },
      { name: "b", run: async () => "ran" },
    ];
    const d = { gw: {} as BillingGateway, settings, now: NOW, query, transport };
    expect(await runHourly(query, d, tasks, { deadline: Date.now() + 60_000 })).toEqual({ a: undefined, b: "ran" });
    expect(seen).toHaveLength(1);
    expect(await runHourly(query, d, tasks, { deadline: Date.now() - 1 })).toEqual({ a: "out of time: next pass", b: "out of time: next pass" });
  });

  it("reads accounts back even when listing Stripe's events fails, and keeps the events step for the next hour", async () => {
    const plans = fakePlans();
    await query("insert into users (email, status, plan, currency, stripe_customer, stripe_subscription) values ('ana@example.com', 'active', 'monthly', 'USD', 'cus_1', 'sub_1')");
    plans.add("sub_1", "cus_1", new Date("2027-01-03T11:05:00Z"));
    plans.end("sub_1", new Date("2026-12-14T11:05:00Z"));
    const d = { gw: {} as BillingGateway, plans, settings, now: NOW, query, transport, sleep: async () => {} };
    const failing = { source: async () => Promise.reject(new Error("Stripe is down")), handle: async () => {} };
    // The simulated clock is also the real one here (finishing is never recorded ahead of the real clock).
    const ctx = (now: Date) => ({ deadline: Date.now() + 60_000, realNow: now });
    const out = (await reconcileStripe(query, d, ctx(NOW), failing)) as Record<string, unknown>;
    expect(out.events).toEqual({ error: "Stripe is down" });
    expect(out.users).toMatchObject({ finished: true });
    expect(out.finished).toBe(false);
    expect(await query("select status from users")).toEqual([{ status: "cancelled" }]);
    // Next hour: only the events step is left, and the pass then finishes.
    const ok = { source: async () => ({ events: [], hasMore: false }), handle: async () => {} };
    const hour = new Date(NOW.getTime() + 3_600_000);
    const next = (await reconcileStripe(query, { ...d, now: hour }, ctx(hour), ok)) as Record<string, unknown>;
    expect(next).toMatchObject({ users: "done", finished: true });
    const two = new Date(NOW.getTime() + 7_200_000);
    expect(await reconcileStripe(query, { ...d, now: two }, ctx(two), ok)).toBe("not due");
  });

  it("an 'as of' pass in the future records its finish at the real time, so the real daily pass is not held off", async () => {
    const d = { gw: {} as BillingGateway, plans: fakePlans(), settings, now: new Date(NOW.getTime() + 30 * 86_400_000), query, transport, sleep: async () => {} };
    const ok = { source: async () => ({ events: [], hasMore: false }), handle: async () => {} };
    expect(await reconcileStripe(query, d, { deadline: Date.now() + 60_000, realNow: NOW }, ok)).toMatchObject({ finished: true });
    const [r] = await query<{ at: string }>("select value->>'at' as at from settings where key = 'reconcile.lastFinished'");
    expect(r.at).toBe(NOW.toISOString());
    // The real clock a day later: due again.
    const later = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(await reconcileStripe(query, { ...d, now: later }, { deadline: Date.now() + 60_000, realNow: later }, ok)).toMatchObject({ finished: true });
  });
});

describe("welcome_unsent (plan 2026-11-26-001, Unit 2)", () => {
  let sent: Parameters<Transport>[0][];
  const recording: Transport = async (m) => {
    sent.push(m);
    return { ok: true };
  };
  const task = HOURLY_TASKS.find((t) => t.name === "welcome_unsent")!;
  const pass = (now = NOW) => runHourly(query, { gw: {} as BillingGateway, settings, now, query, transport: recording, sleep: async () => {} }, [task], { deadline: Date.now() + 60_000 });
  const trial = (email: string, consentAt = "2026-12-01T10:00:00Z", extra = "") =>
    query<{ id: string }>(
      `insert into users (email, name, path, currency, status, plan, signup_step, consent_at${extra ? ", trial_started_at" : ""})
       values ($1, 'Ana', 'running', 'CAD', 'trial', 'monthly', 'done', $2${extra ? `, '${extra}'` : ""}) returning id`,
      [email, consentAt],
    ).then((r) => r[0].id);

  beforeEach(() => {
    sent = [];
  });

  it("is registered, before the trial nudges", () => {
    const names = HOURLY_TASKS.map((t) => t.name);
    expect(names.indexOf("welcome_unsent")).toBeGreaterThan(-1);
    expect(names.indexOf("welcome_unsent")).toBeLessThan(names.indexOf("trial_nudges"));
  });

  it("welcomes a no-card trial that has none, once, however many passes run", async () => {
    await trial("ana@example.com");
    expect(await pass()).toEqual({ welcome_unsent: 1 });
    expect(await pass()).toEqual({ welcome_unsent: 0 });
    expect(sent.map((m) => [m.to[0], m.subject])).toEqual([["ana@example.com", "Welcome to Roger"]]);
    expect(sent[0].text).toContain("When your first list is ready we’ll ask for your card.");
  });

  it("welcomes a trial that saved its card before the retry ran", async () => {
    await trial("card@example.com", "2026-12-01T10:00:00Z", "2026-12-01T11:00:00Z");
    expect(await pass()).toEqual({ welcome_unsent: 1 });
    expect(await pass()).toEqual({ welcome_unsent: 0 });
    expect(sent.map((m) => [m.to[0], m.subject])).toEqual([["card@example.com", "Welcome to Roger"]]);
  });

  it("leaves alone accounts from before this release, accounts still signing up, and ones already welcomed", async () => {
    await trial("old@example.com", "2026-11-20T10:00:00Z");
    await trial("oldcard@example.com", "2026-11-20T10:00:00Z", "2026-11-20T11:00:00Z");
    await query("insert into users (email, name, status, consent_at) values ('signup@example.com', 'S', 'signup', '2026-12-01T10:00:00Z')");
    const done = await trial("done@example.com");
    await query("insert into notifications (recipient, kind, ref, status) values ($1, 'welcome', 'signup', 'sent')", [done]);
    expect(await pass()).toEqual({ welcome_unsent: 0 });
    expect(sent).toHaveLength(0);
  });

  it("stops retrying a welcome the mail layer gave up on", async () => {
    const id = await trial("ana@example.com");
    await query("insert into notifications (recipient, kind, ref, status, attempts) values ($1, 'welcome', 'signup', 'failed', 3)", [id]);
    expect(await pass()).toEqual({ welcome_unsent: 0 });
  });

  it("re-runs the free-tool claim on the job clock: the report becomes the run of the job's week", async () => {
    const id = await trial("ana@example.com");
    await query("insert into free_runs (token, email, agent, report, report_at) values ('tok1', 'ana@example.com', 'hark', '# free report', now())");
    await query("update users set pending_zack_token = 'tok1' where id = $1", [id]);
    await pass();
    const runs = await query<{ week_of: string }>("select week_of::text from runs where user_id = $1", [id]);
    // NOW is Tuesday 2026-12-15: before Sunday's cutoff, the run counts for Monday 2026-12-21.
    expect(runs).toEqual([{ week_of: "2026-12-21" }]);
  });

  it("sends at most MAX_WELCOMES a pass", async () => {
    const { MAX_WELCOMES } = await import("@/lib/signup/finish");
    for (let i = 0; i < MAX_WELCOMES + 2; i++) await trial(`u${i}@example.com`);
    expect(await pass()).toEqual({ welcome_unsent: MAX_WELCOMES });
    expect(await pass()).toEqual({ welcome_unsent: 2 });
  });
});
