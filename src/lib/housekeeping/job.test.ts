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

  it("purges free Zack runs on the retention setting, never ahead of the real clock", async () => {
    const task = HOURLY_TASKS.find((t) => t.name === "free_run_purge")!;
    const old = new Date(Date.now() - (settings.retentionDays + 1) * 86_400_000).toISOString();
    const recent = new Date(Date.now() - (settings.retentionDays - 1) * 86_400_000).toISOString();
    await query("insert into free_runs (token, email, agent, created_at) values ('old-token-0000000', 'old@example.com', 'claude', $1), ('new-token-0000000', 'new@example.com', 'claude', $2)", [old, recent]);
    const ctx = { deadline: Date.now() + 60_000 };
    // An "as of" run a year ahead still counts age from the real date.
    const ahead = { gw: {} as BillingGateway, settings, now: new Date(Date.now() + 365 * 86_400_000), query, transport };
    expect(await task.run(query, ahead, ctx)).toEqual({ deleted: 1, cleared: 0, orphaned: 0 });
    expect(await query("select email from free_runs")).toEqual([{ email: "new@example.com" }]);
  });

  /** One free run past the retention period, so a purge that runs has something to delete. */
  async function oldFreeRun() {
    const old = new Date(Date.now() - (settings.retentionDays + 1) * 86_400_000).toISOString();
    await query("insert into free_runs (token, email, agent, created_at) values ('old-token-0000000', 'old@example.com', 'claude', $1)", [old]);
  }
  const purged = { deleted: 1, cleared: 0, orphaned: 0 };
  const nothingExpired = { tokens: 0, sessions: 0, states: 0, counters: 0 };
  const noOrphans = { relabelled: 0, dropped: 0 };

  it("purges free Zack runs while the cycle is not live, and runs nothing else but the other tasks that always run", async () => {
    await oldFreeRun();
    const d = { gw: {} as BillingGateway, settings: mergeV3([{ key: "v3.cycleLive", value: false }]), now: new Date(), query, transport };
    expect(await runHourly(query, d)).toEqual({ skipped: "The cycle is not live.", expired_cleanup: nothingExpired, free_run_purge: purged, unknown_authors: noOrphans });
    expect(await query("select 1 from free_runs")).toEqual([]);
  });

  it("purges free Zack runs when Stripe is not set up, and runs nothing else but the other tasks that always run", async () => {
    await oldFreeRun();
    const d = { gw: null, settings, now: new Date(), query, transport };
    expect(await runHourly(query, d)).toEqual({ skipped: "Stripe is not configured.", expired_cleanup: nothingExpired, free_run_purge: purged, unknown_authors: noOrphans });
    expect(await query("select 1 from free_runs")).toEqual([]);
    // With neither, the cycle is the reason given, and the purge still runs.
    await oldFreeRun();
    expect(await runHourly(query, { ...d, settings: mergeV3([]) })).toEqual({ skipped: "The cycle is not live.", expired_cleanup: nothingExpired, free_run_purge: purged, unknown_authors: noOrphans });
  });

  it("relabels a deleted account's contributor rows while the cycle is not live and Stripe is not set up", async () => {
    const [{ id: play }] = await query<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('One', 'Marketing', 'd', 'p', 'i', '2026-11-30', '2026-12-07') returning id",
    );
    await query("insert into pool_play_contributors (pool_play_id, contributor) values ($1, '3f1c2a9e-5b7d-4c1a-9e2f-0a1b2c3d4e5f')", [play]);
    const d = { gw: null, settings: mergeV3([{ key: "v3.cycleLive", value: false }]), now: new Date(), query, transport };
    expect((await runHourly(query, d)).unknown_authors).toEqual({ relabelled: 1, dropped: 0 });
    expect(await query("select contributor from pool_play_contributors")).toEqual([{ contributor: "unknown author" }]);
    expect((await runHourly(query, d)).unknown_authors).toEqual(noOrphans);
  });

  it("removes the free Zack run's expired per-IP counters while the cycle is not live and Stripe is not set up", async () => {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const hourAhead = new Date(Date.now() + 3_600_000).toISOString();
    await query(
      "insert into rate_events (key, window_start, count, expires_at) values ('zack:run:ip:203.0.113.7', 1, 3, $1), ('zack:report:ip:203.0.113.7', 1, 1, $1), ('zack:run:ip:203.0.113.8', 2, 1, $2)",
      [hourAgo, hourAhead],
    );
    const d = { gw: null, settings: mergeV3([{ key: "v3.cycleLive", value: false }]), now: new Date(), query, transport };
    const out = await runHourly(query, d);
    expect(out.expired_cleanup).toEqual({ ...nothingExpired, counters: 2 });
    // A counter still inside its hour is kept, so the limit it enforces still holds.
    expect(await query("select key from rate_events")).toEqual([{ key: "zack:run:ip:203.0.113.8" }]);
  });

  it("marks only the expired clean-up, the free-run purge and the unknown-author relabel to run always, and keeps their places in the list", () => {
    expect(HOURLY_TASKS.filter((t) => t.always).map((t) => t.name)).toEqual(["expired_cleanup", "free_run_purge", "unknown_authors"]);
    expect(HOURLY_TASKS.slice(0, 5).map((t) => t.name)).toEqual(["expired_cleanup", "retention", "free_run_purge", "unknown_authors", "charge_takeover"]);
  });

  it("a failing free-run purge does not stop the tasks after it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // The real list, in its order, with the real purge. Every other task's work is replaced by a marker, so no task reaches Stripe.
    const tasks: HourlyTask[] = HOURLY_TASKS.map((t) => (t.name === "free_run_purge" ? t : { name: t.name, always: t.always, run: async () => "ran" } as HourlyTask));
    const failing: Query = <T>(text: string, params?: unknown[]) => (/free_runs/.test(text) ? Promise.reject(new Error("db blip")) : query<T>(text, params));
    const d = { gw: {} as BillingGateway, settings, now: new Date(), query, transport };
    const out = await runHourly(failing, d, tasks);
    expect(out.free_run_purge).toEqual({ error: "db blip" });
    const names = HOURLY_TASKS.map((t) => t.name);
    const after = names.slice(names.indexOf("free_run_purge") + 1);
    expect(after.length).toBeGreaterThan(10);
    for (const name of after) expect(out[name], name).toBe("ran");
    expect(Object.keys(out)).toEqual(names);
    // The same when only the tasks that always run do.
    expect(await runHourly(failing, { ...d, gw: null }, tasks)).toEqual({ skipped: "Stripe is not configured.", expired_cleanup: "ran", free_run_purge: { error: "db blip" }, unknown_authors: "ran" });
    logged.mockRestore();
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
