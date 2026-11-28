import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { stripeGateway } from "@/lib/billing/gateway";
import { HOURLY_TASKS, reconcileStripe, runHourly, type HourlyTask } from "./job";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
// Stripe's real card gateway, observable: each test may make the next call answer a fake.
vi.mock("@/lib/billing/gateway", async (orig) => {
  const real = await orig<typeof import("@/lib/billing/gateway")>();
  return { ...real, stripeGateway: vi.fn(real.stripeGateway) };
});

let query: Query;
const transport: Transport = async () => ({ ok: true });
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const NOW = new Date("2026-12-15T15:00:00Z");

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("the hourly pass", () => {
  it("runs the cheap database tasks first", () => {
    expect(HOURLY_TASKS.slice(0, 6).map((t) => t.name)).toEqual(["expired_cleanup", "retention", "free_run_purge", "unknown_authors", "idle_retention", "old_records"]);
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
    // With no user at all the task changes nothing: that is a partly restored database, not one deleted account.
    expect((await runHourly(query, d)).unknown_authors).toEqual(noOrphans);
    expect(await query("select contributor from pool_play_contributors")).toEqual([{ contributor: "3f1c2a9e-5b7d-4c1a-9e2f-0a1b2c3d4e5f" }]);
    // Another account exists, as on any real database: the row whose account is gone is relabelled.
    await query("insert into users (email, status) values ('someone@example.com', 'active')");
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
    expect(HOURLY_TASKS.slice(0, 7).map((t) => t.name)).toEqual(["expired_cleanup", "retention", "free_run_purge", "unknown_authors", "idle_retention", "old_records", "charge_takeover"]);
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

describe("welcome_unsent (plan 2026-11-26-001, Unit 2)", () => {
  let sent: Parameters<Transport>[0][];
  const recording: Transport = async (m) => {
    sent.push(m);
    return { ok: true };
  };
  const task = HOURLY_TASKS.find((t) => t.name === "welcome_unsent")!;
  const pass = (now = NOW) => runHourly(query, { gw: {} as BillingGateway, settings, now, query, transport: recording, sleep: async () => {} }, [task], { deadline: Date.now() + 60_000 });
  /** A trial that finished Step 3 in this flow at `consentAt` (finishSignup stamps signup_finished_at); `extra`: its card's time. */
  const trial = (email: string, consentAt = "2026-12-01T10:00:00Z", extra = "") =>
    query<{ id: string }>(
      `insert into users (email, name, path, currency, status, plan, signup_step, consent_at, signup_finished_at${extra ? ", trial_started_at" : ""})
       values ($1, 'Ana', 'running', 'CAD', 'trial', 'monthly', 'done', $2, $2${extra ? `, '${extra}'` : ""}) returning id`,
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
    expect(sent[0].text).toContain("Your first two Cora Curations are free.");
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

  it("never welcomes an old-flow trial, even one that consented after the cutoff (no signup_finished_at; whole-branch review W5)", async () => {
    // The old card step moved signup → trial itself; finishSignup never ran, so the stamp is missing.
    await query(
      `insert into users (email, name, path, currency, status, plan, signup_step, consent_at, trial_started_at)
       values ('oldflow@example.com', 'O', 'running', 'CAD', 'trial', 'monthly', 'done', '2026-12-01T10:00:00Z', '2026-12-01T10:05:00Z'),
              ('oldflow2@example.com', 'O', 'running', 'CAD', 'trial', 'monthly', 'done', '2026-12-01T10:00:00Z', null)`,
    );
    expect(await pass()).toEqual({ welcome_unsent: 0 });
    expect(sent).toHaveLength(0);
  });

  it("welcomes a legacy sign-up resumed at Step 3 (old consent, stamped by finishSignup now) once", async () => {
    const [{ id }] = await query<{ id: string }>(
      "insert into users (email, name, path, currency, status, plan, signup_step, consent_at) values ('resumed@example.com', 'R', 'running', 'CAD', 'signup', 'monthly', 'card', '2026-11-01T10:00:00Z') returning id",
    );
    const { finishSignup } = await import("@/lib/signup/finish");
    expect(await finishSignup(query, id, new Date("2026-12-14T15:00:00Z"))).toBe(true);
    expect(await pass()).toEqual({ welcome_unsent: 1 });
    expect(await pass()).toEqual({ welcome_unsent: 0 });
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

describe("no_card_close's card gateway (review fixes Unit 10, T1)", () => {
  const task = HOURLY_TASKS.find((t) => t.name === "no_card_close")!;
  /** A no-card trial 15 days past its first teaser (due to close), with a stored Payment session on `gw`. */
  async function dueWithSession(gw: ReturnType<typeof fakeGateway>) {
    const [{ id }] = await query<{ id: string }>(
      `insert into users (email, status, plan, currency, signup_step, consent_at, first_teaser_at, stripe_customer)
       values ('ana@example.com', 'trial', 'monthly', 'USD', 'done', $1, $2, 'cus_ana') returning id`,
      [new Date(NOW.getTime() - 20 * 86_400_000).toISOString(), new Date(NOW.getTime() - 15 * 86_400_000).toISOString()],
    );
    const s = await gw.createEmbeddedSetupSession({ userId: id, customer: "cus_ana", currency: "USD", returnUrl: "https://roger.test/start/payment/done" });
    await query("update users set setup_session = $2 where id = $1", [id, s.id]);
    return { id, sid: s.id };
  }
  const pass = (extra: Record<string, unknown> = {}) =>
    runHourly(query, { gw: {} as BillingGateway, settings, now: NOW, query, transport, sleep: async () => {}, ...extra }, [task], { deadline: Date.now() + 60_000 });
  const status = async (id: string) => (await query<{ status: string }>("select status from users where id = $1", [id]))[0].status;

  beforeEach(() => vi.mocked(stripeGateway).mockClear());

  it("the real task uses the gateway the pass is given (a card confirmed there is saved, not closed)", async () => {
    const gw = fakeGateway();
    const { id, sid } = await dueWithSession(gw);
    gw.complete(sid);
    expect(await pass({ card: gw })).toEqual({ no_card_close: 0 });
    expect(await status(id)).toBe("trial");
    expect(stripeGateway).not.toHaveBeenCalled();
  });

  it("falls back to stripeGateway() when the pass is given none", async () => {
    const gw = fakeGateway();
    const { id, sid } = await dueWithSession(gw);
    vi.mocked(stripeGateway).mockReturnValueOnce(gw);
    expect(await pass()).toEqual({ no_card_close: 1 });
    expect(stripeGateway).toHaveBeenCalledTimes(1);
    expect(await status(id)).toBe("closed");
    // The close retired the stored session through the fallback gateway.
    expect(gw.expired).toEqual([sid]);
  });

  it("null (Stripe not set up): closes without asking Stripe", async () => {
    const gw = fakeGateway();
    const { id } = await dueWithSession(gw);
    expect(await pass({ card: null })).toEqual({ no_card_close: 1 });
    expect(await status(id)).toBe("closed");
    expect(stripeGateway).not.toHaveBeenCalled();
    expect(gw.expired).toEqual([]);
  });
});
