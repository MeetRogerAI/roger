import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_CARD_TRIAL_SQL } from "@/lib/billing/has-card";
import { NO_CARD_FLOW_FROM } from "@/lib/billing/no-card";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import { addWallDays } from "@/lib/clock";
import { sendPendingUnlocks } from "@/lib/cora/unlock";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { finishSignup, sendUnsentWelcomes, WELCOME_SWEEP_FROM } from "@/lib/signup/finish";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { splitSchema } from "../../../db/schema-split.mjs";
import { noCardClocks } from "./clocks";
import { HOURLY_TASKS, runHourly } from "./job";

/**
 * Whole-branch review of plan 2026-11-26-001 (W1, W5, W10): accounts from the
 * old card-at-sign-up flow, and sign-ups left half-way through it, meet the new
 * hourly tasks after the deploy. None of them may be closed, nudged, welcomed
 * again or sent an old list because of a stamp from the old flow.
 */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
/** Wednesday 2026-12-16, 10:00 AM Toronto: the deploy has happened. */
const NOW = new Date("2026-12-16T15:00:00Z");
const WEEK = "2026-12-14";
const hours = (t: Date, n: number) => new Date(t.getTime() + n * 3_600_000);
const TRIAL_TASKS = HOURLY_TASKS.filter((t) => ["trial_nudges", "held_reminders", "no_card_close"].includes(t.name));
const pass = (now: Date) => runHourly(query, { gw: {} as BillingGateway, settings, now, query, transport, sleep: async () => {}, card: null }, TRIAL_TASKS, { deadline: Date.now() + 60_000 });
const row = async (id: string) =>
  (await query<{ status: string; closed_reason: string | null }>("select status, closed_reason from users where id = $1", [id]))[0];
const notes = (kind: string) => query<{ ref: string }>("select ref from notifications where kind = $1 order by ref", [kind]);

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
});

describe("W1: a legacy sign-up resumed at Step 3 is clocked from when it finished, not from its old consent", () => {
  /** Left at the old card step 25 days ago: status signup, consent recorded then (the first consent stays on record). */
  async function resumed() {
    const [{ id }] = await query<{ id: string }>(
      `insert into users (email, name, status, plan, currency, signup_step, consent_at, email_verified_at)
       values ('late@example.com', 'Lee', 'signup', 'monthly', 'CAD', 'card', $1, $1) returning id`,
      [new Date(NOW.getTime() - 25 * 86_400_000).toISOString()],
    );
    expect(await finishSignup(query, id, NOW)).toBe(true);
    return id;
  }

  it("finishSignup stamps signup_finished_at at the job clock and keeps the old consent", async () => {
    const id = await resumed();
    const [u] = await query<{ consent_at: string; signup_finished_at: string; status: string }>(
      "select consent_at::text, signup_finished_at::text, status from users where id = $1",
      [id],
    );
    expect(u.status).toBe("trial");
    expect(new Date(u.signup_finished_at).toISOString()).toBe(NOW.toISOString());
    expect(new Date(u.consent_at).getTime()).toBeLessThan(NOW.getTime() - 24 * 86_400_000);
    // A second call (a double submit) moves nothing and keeps the stamp.
    expect(await finishSignup(query, id, hours(NOW, 1))).toBe(false);
    const [again] = await query<{ signup_finished_at: string }>("select signup_finished_at::text from users where id = $1", [id]);
    expect(new Date(again.signup_finished_at).toISOString()).toBe(NOW.toISOString());
  });

  it("the hourly passes right after Step 3 close nothing and send no nudge; the clock starts at the finish", async () => {
    const id = await resumed();
    for (let h = 0; h <= 3; h++) await pass(hours(NOW, h));
    expect(await row(id)).toEqual({ status: "trial", closed_reason: null });
    expect(await notes("zack_not_yet")).toEqual([]);
    expect(sent).toEqual([]);
    const [c] = await noCardClocks(query, settings, NOW);
    expect(c.start.toISOString()).toBe(NOW.toISOString());
    expect(c.finishedAt.toISOString()).toBe(NOW.toISOString());
    expect(c.closesAt.toISOString()).toBe(addWallDays(NOW, 21).toISOString());
  });

  it("nudges on day 3 after the finish, keyed by it, and closes 21 days after it", async () => {
    const id = await resumed();
    await pass(hours(addWallDays(NOW, 3), 1));
    expect(await notes("zack_not_yet")).toEqual([{ ref: `${NOW.toISOString()}:3` }]);
    await pass(hours(addWallDays(NOW, 21), -1));
    expect((await row(id)).status).toBe("trial");
    await pass(hours(addWallDays(NOW, 21), 1));
    expect(await row(id)).toEqual({ status: "closed", closed_reason: "no_first_list" });
  });

  it("a row from before the column (no signup_finished_at) still counts from consent, as before", async () => {
    const consent = new Date("2026-12-01T15:00:00Z");
    await query(
      "insert into users (email, name, status, plan, currency, signup_step, consent_at) values ('older@example.com', 'O', 'trial', 'monthly', 'CAD', 'done', $1)",
      [consent.toISOString()],
    );
    const [c] = await noCardClocks(query, settings, NOW);
    expect(c.start.toISOString()).toBe(consent.toISOString());
    expect(c.finishedAt.toISOString()).toBe(consent.toISOString());
  });
});

/** The pool, a finished Cora week and a picked list for `userId` (undelivered). */
async function heldList(q: Query, userId: string) {
  await q("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready') on conflict (week_of) do nothing", [WEEK]);
  await q("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [userId, WEEK]);
  for (let i = 0; i < 3; i++) {
    const [p] = await q<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
       values ($1, 'Sales', 'A description.', '1. A step.', 'Install it.', $2, $2, $3, 70, 7, 7, 7, 7, 7) returning id`,
      [`Play ${userId.slice(0, 4)} ${i}`, WEEK, JSON.stringify({ current_hours_week: 2, runners: 3, confidence: "High" })],
    );
    await q("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, 'Fits.')", [userId, WEEK, i + 1, p.id]);
  }
}
const deliveredTo = async (q: Query, id: string) => (await q("select 1 from picks where user_id = $1 and delivered_at is not null", [id])).length;
const sendDeps = (q: Query) => ({ settings, now: NOW, query: q, transport, sleep: async () => {} });

describe("W5: the first hourly pass after the deploy leaves old-flow accounts alone", () => {
  async function trial(email: string, cols: Record<string, unknown>) {
    const c = { status: "trial", plan: "monthly", currency: "CAD", sharing: "share", email_prefs: "{}", consent_at: "2026-11-10T15:00:00Z", signup_step: "done", ...cols };
    const keys = Object.keys(c);
    const [{ id }] = await query<{ id: string }>(
      `insert into users (email, name, ${keys.join(", ")}) values ($1, 'N', ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
      [email, ...Object.values(c)],
    );
    return id;
  }

  it("unlock_pending: an old-flow carded trial's undelivered list is not sent; a new-flow card's is", async () => {
    const old = await trial("old@example.com", { trial_started_at: "2026-11-10T15:05:00Z" });
    const oldPerRun = await trial("perrun@example.com", { plan: "per_run", trial_started_at: "2026-11-12T15:05:00Z" });
    const teasered = await trial("teased@example.com", { trial_started_at: "2026-11-20T15:05:00Z", first_teaser_at: "2026-11-16T12:05:00Z" });
    const fresh = await trial("fresh@example.com", { trial_started_at: NO_CARD_FLOW_FROM, consent_at: "2026-11-26T10:00:00Z" });
    for (const id of [old, oldPerRun, teasered, fresh]) await heldList(query, id);
    expect(await sendPendingUnlocks(query, sendDeps(query))).toBe(2);
    expect(await deliveredTo(query, old)).toBe(0);
    expect(await deliveredTo(query, oldPerRun)).toBe(0);
    expect(await deliveredTo(query, teasered)).toBe(3);
    expect(await deliveredTo(query, fresh)).toBe(3);
    expect(sent.map((m) => m.to[0]).sort()).toEqual(["fresh@example.com", "teased@example.com"]);
    // Never even tried: the old-flow rows are not stamped by the sweep.
    const tried = await query<{ email: string }>("select email from users where unlock_attempted_at is not null order by email");
    expect(tried.map((r) => r.email)).toEqual(["fresh@example.com", "teased@example.com"]);
  });

  it("welcome_unsent: only accounts finishing Step 3 in this flow are welcomed", async () => {
    await trial("oldcard@example.com", { trial_started_at: "2026-11-27T15:05:00Z", consent_at: "2026-11-27T15:00:00Z" });
    await trial("oldnocard@example.com", { consent_at: "2026-11-28T15:00:00Z" });
    await trial("new@example.com", { consent_at: "2026-12-01T15:00:00Z", signup_finished_at: "2026-12-01T15:00:00Z" });
    await trial("before@example.com", { consent_at: "2026-11-20T15:00:00Z", signup_finished_at: "2026-11-20T15:00:00Z" });
    expect(await sendUnsentWelcomes(query, { settings, now: NOW, query, transport, sleep: async () => {} })).toBe(1);
    expect(sent.map((m) => m.to[0])).toEqual(["new@example.com"]);
    expect(WELCOME_SWEEP_FROM).toBe(NO_CARD_FLOW_FROM);
  });
});

describe("W10: db/schema.sql on a fresh database, applied twice, classifies legacy rows", () => {
  it("applies twice without error; NO_CARD_TRIAL_SQL, the unlock sweep and the welcome sweep classify each legacy row", async () => {
    const db = new PGlite();
    const statements: string[] = splitSchema(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf8"));
    for (let i = 0; i < 2; i++) for (const s of statements) await db.query(s);
    const q: Query = async <T,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;

    const insert = async (email: string, sql: string, params: unknown[] = []) =>
      (await q<{ id: string }>(`insert into users (email, name, currency, sharing, email_prefs, ${sql}) returning id`, [email, ...params]))[0].id;
    // Old flow: card at sign-up (trial_started_at set at the card step), monthly and per-run.
    const carded = await insert("carded@example.com", "status, plan, consent_at, trial_started_at, signup_step) values ($1, 'N', 'CAD', 'share', '{}', 'trial', 'monthly', '2026-11-10T15:00:00Z', '2026-11-10T15:05:00Z', 'done'");
    const perRun = await insert("perrun@example.com", "status, plan, consent_at, trial_started_at, signup_step) values ($1, 'N', 'CAD', 'share', '{}', 'trial', 'per_run', '2026-11-10T15:00:00Z', '2026-11-10T15:05:00Z', 'done'");
    // Left at the old card step: consented, never finished.
    const atCard = await insert("atcard@example.com", "status, plan, consent_at, signup_step) values ($1, 'N', 'CAD', 'share', '{}', 'signup', 'monthly', '2026-11-01T15:00:00Z', 'card'");
    for (const id of [carded, perRun]) await heldList(q, id);

    const noCard = async () =>
      (await q<{ email: string }>(`select email from users u where ${NO_CARD_TRIAL_SQL("u")} order by email`)).map((r) => r.email);
    expect(await noCard()).toEqual([]);
    expect(await noCardClocks(q, settings, NOW)).toEqual([]);
    expect(await sendPendingUnlocks(q, sendDeps(q))).toBe(0);
    expect(await sendUnsentWelcomes(q, { settings, now: NOW, query: q, transport, sleep: async () => {} })).toBe(0);
    expect(sent).toEqual([]);

    // The sign-up left at the card step finishes Step 3 now: a no-card trial clocked from now, welcomed by the sweep.
    expect(await finishSignup(q, atCard, NOW)).toBe(true);
    expect(await noCard()).toEqual(["atcard@example.com"]);
    const [c] = await noCardClocks(q, settings, NOW);
    expect(c).toMatchObject({ id: atCard, firstTeaserAt: null });
    expect(c.start.toISOString()).toBe(NOW.toISOString());
    expect(await sendUnsentWelcomes(q, { settings, now: NOW, query: q, transport, sleep: async () => {} })).toBe(1);
    expect(sent.map((m) => m.to[0])).toEqual(["atcard@example.com"]);
    // The old-flow carded trials still are not unlocked by the sweep (their lists go out with the Monday send).
    expect(await sendPendingUnlocks(q, sendDeps(q))).toBe(0);
    expect(await deliveredTo(q, carded)).toBe(0);
    await db.close();
  }, 60_000);
});
