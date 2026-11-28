import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { heldTeaser } from "@/lib/app/held";
import { loadHome } from "@/lib/app/home";
import { weekIdeas } from "@/lib/app/week";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import { runHourly } from "@/lib/housekeeping/job";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { deliverWeek } from "./deliver";
import { RECORD_PICKS_SQL, SUPERSEDE_AT_READY_SQL } from "./job";
import { deliverLate, runSendJob, sendHeldTeaser, sendUnsentTeasers } from "./send-job";

/**
 * Held lists in the weekly cycle (plan 2026-11-26-001, Unit 3): a trial with
 * no card is picked for, but gets a titles-only teaser instead of its list.
 */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
let failing = false;
const transport: Transport = async (m) => {
  if (failing && !m.subject.startsWith("[Roger]")) return { ok: false, error: "resend down", retryable: true };
  sent.push(m);
  return { ok: true };
};
const PREV = "2026-12-07";
const WEEK = "2026-12-14";
// Monday 2026-12-14, 7:05 AM Toronto (EST) = 12:05 UTC.
const SEVEN_AM = new Date("2026-12-14T12:05:00Z");
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const gw: BillingGateway = {
  preview: async () => ({ totalCents: 22600, currency: "USD" }),
  subscriptions: async () => [],
  createSubscription: async () => ({ kind: "error", error: "unused" }),
};
const deps = (now = SEVEN_AM) => ({ settings, now, gw, query, transport, sleep: async () => {} });
const hourly = (now: Date) => runHourly(query, { gw, settings, now, query, transport, sleep: async () => {} });
let plays: string[];
const TITLES = ["Inbox triage", "Listing post", "Calendar prep", "Expense log", "Follow-up drafts", "Open house notes"];
const REASON = "Fits the sales work your week shows.";

/** A trial with no card by default (sign-up ends without one). */
async function member(email: string, o: { card?: boolean; sponsored?: boolean } = {}) {
  // users.sponsor_id has no foreign key; only whether it is set matters.
  const [u] = await query<{ id: string }>(
    `insert into users (email, status, plan, sharing, free_lists_used, email_prefs, currency, trial_started_at, sponsor_id)
     values ($1, 'trial', 'monthly', 'share', 0, '{}', 'USD', $2, case when $3 then gen_random_uuid() end) returning id`,
    [email, o.card ? "2026-11-16T15:00:00Z" : null, Boolean(o.sponsored)],
  );
  return u.id;
}
async function week(w: string, o: { dry?: boolean } = {}) {
  await query("insert into cora_weeks (week_of, status, phase, dry_run) values ($1, 'ready', 'ready', $2) on conflict (week_of) do nothing", [w, Boolean(o.dry)]);
}
async function picked(userId: string, w = WEEK, n = 3, o: { offset?: number; dry?: boolean; superseded?: string } = {}) {
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count, dry_run, superseded_at) values ($1, $2, $3, $4, $5, $6)", [
    userId,
    w,
    n === 3 ? "picked" : "short",
    n,
    Boolean(o.dry),
    o.superseded ?? null,
  ]);
  for (let i = 0; i < n; i++) {
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run) values ($1, $2, $3, $4, 70, 3, $5, $6)", [
      userId,
      w,
      i + 1,
      plays[i + (o.offset ?? 0)],
      REASON,
      Boolean(o.dry),
    ]);
  }
}
const userRow = async (id: string) =>
  (await query<{ free_lists_used: number; first_teaser_at: string | null }>("select free_lists_used, first_teaser_at::text from users where id = $1", [id]))[0];
const deliveredIn = async (id: string, w: string) => (await query("select 1 from picks where user_id = $1 and week_of = $2 and delivered_at is not null", [id, w])).length;
const to = (email: string) => sent.filter((m) => m.to[0] === email);
const teasers = (email: string) => to(email).filter((m) => /ideas are ready/.test(m.subject));

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  failing = false;
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  plays = [];
  for (const t of TITLES) {
    const [p] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
       values ($1, 'Sales', 'Secret description.', '1. Secret step.', 'Secret install.', $2, $2, $3, 70, 7, 7, 7, 7, 7) returning id`,
      [t, WEEK, JSON.stringify({ current_hours_week: 2, runners: 3, confidence: "High" })],
    );
    plays.push(p.id);
  }
  await week(WEEK);
});

describe("the Monday send for a trial with no card", () => {
  it("sends the titles-only teaser instead of the list: nothing delivered, no free list used, first_teaser_at at the job clock", async () => {
    const a = await member("a@example.com");
    await picked(a);
    expect(await runSendJob(query, deps(), { week: WEEK })).toMatchObject({ status: "done", delivered: 0 });
    const [m] = teasers("a@example.com");
    expect(to("a@example.com")).toHaveLength(1);
    expect(m.subject).toBe("Your first 3 ideas are ready");
    for (const t of TITLES.slice(0, 3)) expect(m.text).toContain(t);
    for (const secret of [REASON, "Secret description", "Secret step", "Secret install", "Open and install", "/app/week/"]) {
      expect(m.text).not.toContain(secret);
      expect(m.html).not.toContain(secret);
    }
    expect(m.text).toContain("Add your card to see them: http://localhost:3000/start/payment");
    expect(await deliveredIn(a, WEEK)).toBe(0);
    expect(await userRow(a)).toEqual({ free_lists_used: 0, first_teaser_at: "2026-12-14 12:05:00+00" });
    expect(await query("select kind, ref, status from notifications where recipient = $1", [a])).toEqual([{ kind: "first_list_held", ref: WEEK, status: "sent" }]);
    // /app has no details either: weekIdeas reads delivered picks only.
    expect(await weekIdeas(query, a, WEEK, "")).toEqual([]);
  });

  it("a second pass sends nothing more and keeps the stamp", async () => {
    const a = await member("a@example.com");
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    await runSendJob(query, deps(new Date("2026-12-14T12:15:00Z")), { week: WEEK });
    expect(to("a@example.com")).toHaveLength(1);
    expect((await userRow(a)).first_teaser_at).toBe("2026-12-14 12:05:00+00");
  });

  it("a short week sends a teaser with that many titles", async () => {
    const a = await member("a@example.com");
    await picked(a, WEEK, 2);
    await runSendJob(query, deps(), { week: WEEK });
    const [m] = teasers("a@example.com");
    expect(m.subject).toBe("Your first ideas are ready");
    expect(m.text).toContain("1. Inbox triage");
    expect(m.text).toContain("2. Listing post");
    expect(m.text).not.toContain("Calendar prep");
  });

  it("the next held week gets its own teaser and leaves first_teaser_at alone; the replaced week's ideas can come again", async () => {
    const a = await member("a@example.com");
    await week(PREV);
    await picked(a, PREV);
    await runSendJob(query, deps(new Date("2026-12-07T12:05:00Z")), { week: PREV });
    // Cora's pick on the 14th replaced the 7th (job.test.ts covers the stamp); the same ideas were eligible again.
    await query("update cora_user_weeks set superseded_at = '2026-12-14T06:05:00Z' where user_id = $1 and week_of = $2", [a, PREV]);
    await picked(a, WEEK, 3, { offset: 1 });
    await runSendJob(query, deps(), { week: WEEK });
    expect(teasers("a@example.com").map((m) => m.subject)).toEqual(["Your first 3 ideas are ready", "Your first 3 ideas are ready"]);
    expect(teasers("a@example.com")[1].text).toContain("Listing post"); // in both lists
    expect((await userRow(a)).first_teaser_at).toBe("2026-12-07 12:05:00+00");
    expect(await heldTeaser(query, a)).toEqual({ week: WEEK, titles: ["Listing post", "Calendar prep", "Expense log"], count: 3 });
  });

  it("delivers a sponsored trial with no card in full, with no teaser (R29)", async () => {
    const s = await member("s@example.com", { sponsored: true });
    await picked(s);
    await runSendJob(query, deps(), { week: WEEK });
    expect(await deliveredIn(s, WEEK)).toBe(3);
    expect(teasers("s@example.com")).toHaveLength(0);
    expect(to("s@example.com")[0].subject).toBe("Your three ideas for the week of Monday, December 14");
  });

  it("a card saved between Cora's pick and the 7:00 send gets this week's list as free list 1, and no teaser", async () => {
    const a = await member("a@example.com");
    await picked(a);
    await query("update users set trial_started_at = '2026-12-14T09:00:00Z' where id = $1", [a]);
    await runSendJob(query, deps(), { week: WEEK });
    expect(await deliveredIn(a, WEEK)).toBe(3);
    expect(to("a@example.com").map((m) => m.subject)).toEqual(["Your three ideas for the week of Monday, December 14"]);
    expect((await userRow(a)).free_lists_used).toBe(1);
  });

  it("two send passes at once on the same user and week: one teaser, one stamp", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const r = await Promise.all([sendHeldTeaser(query, deps(), a, WEEK), sendHeldTeaser(query, deps(), a, WEEK)]);
    expect(r.filter((x) => x === "sent")).toHaveLength(1);
    expect(teasers("a@example.com")).toHaveLength(1);
    expect((await userRow(a)).first_teaser_at).toBe("2026-12-14 12:05:00+00");
    // A later pass, after the first one stamped: the stamp stays at the first clock, and no second teaser goes.
    expect(await sendHeldTeaser(query, deps(new Date("2026-12-14T12:06:00Z")), a, WEEK)).toBe("already");
    expect((await userRow(a)).first_teaser_at).toBe("2026-12-14 12:05:00+00");
    expect(teasers("a@example.com")).toHaveLength(1);
    expect(await deliveredIn(a, WEEK)).toBe(0);
  });

  it("logs a teaser send that throws, and reports it failed", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwing: Transport = async () => {
      throw new Error("socket closed");
    };
    try {
      const r = await sendHeldTeaser(query, { ...deps(), transport: throwing }, a, WEEK);
      expect(r).toBe("failed");
      expect(errors.mock.calls.some((c) => String(c[0]).includes("teaser") && c.some((x) => String(x).includes("socket closed")))).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it("never sends a teaser or stamps anything for a dry-run week, a superseded week, or a user with a card", async () => {
    const a = await member("a@example.com");
    await week("2026-12-21", { dry: true });
    await picked(a, "2026-12-21", 3, { dry: true });
    expect(await sendHeldTeaser(query, deps(), a, "2026-12-21")).toBe("not_held");
    await week(PREV);
    await picked(a, PREV, 3, { superseded: "2026-12-14T06:05:00Z" });
    expect(await sendHeldTeaser(query, deps(), a, PREV)).toBe("not_held");
    const c = await member("c@example.com", { card: true });
    await picked(c);
    expect(await sendHeldTeaser(query, deps(), c, WEEK)).toBe("not_held");
    expect(sent).toEqual([]);
    expect((await userRow(a)).first_teaser_at).toBeNull();
    expect((await userRow(c)).first_teaser_at).toBeNull();
  });
});

describe("delivery rules for held lists", () => {
  it("deliverWeek never delivers to a trial with no card, and never a superseded week", async () => {
    const a = await member("a@example.com");
    await picked(a);
    expect(await deliverWeek(query, a, WEEK, 2, SEVEN_AM)).toEqual({ delivered: 0, freeListNumber: null });
    await week(PREV);
    await picked(a, PREV, 3, { superseded: "2026-12-14T06:05:00Z" });
    await query("update users set trial_started_at = '2026-12-15T15:00:00Z' where id = $1", [a]);
    expect(await deliverWeek(query, a, PREV, 2, SEVEN_AM)).toEqual({ delivered: 0, freeListNumber: null });
    expect(await deliverWeek(query, a, WEEK, 2, SEVEN_AM)).toEqual({ delivered: 3, freeListNumber: 1 });
  });

  it("a sponsored trial with no card stays deliverable, and uses no free list (R29)", async () => {
    const a = await member("a@example.com", { sponsored: true });
    await picked(a);
    expect(await deliverWeek(query, a, WEEK, 2, SEVEN_AM)).toEqual({ delivered: 3, freeListNumber: null });
  });

  it("deliverLate, after a card is saved past a supersede, delivers only the newest held week and sends no teaser", async () => {
    const a = await member("a@example.com");
    await week(PREV);
    await picked(a, PREV, 3, { superseded: "2026-12-14T06:05:00Z" });
    await picked(a, WEEK, 3, { offset: 3 });
    await query("update users set trial_started_at = '2026-12-15T15:00:00Z' where id = $1", [a]);
    await deliverLate(query, deps(new Date("2026-12-15T16:00:00Z")));
    expect(await deliveredIn(a, PREV)).toBe(0);
    expect(await deliveredIn(a, WEEK)).toBe(3);
    expect((await userRow(a)).free_lists_used).toBe(1);
    expect(to("a@example.com").map((m) => m.subject)).toEqual(["Your three ideas for the week of Monday, December 14"]);
  });

  it("deliverLate leaves a trial with no card alone", async () => {
    const a = await member("a@example.com");
    await picked(a);
    expect(await deliverLate(query, deps(new Date("2026-12-15T16:00:00Z")))).toBe(0);
    expect(await deliveredIn(a, WEEK)).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("the hourly teaser_unsent task", () => {
  it("sends a teaser that failed all Monday, once in the end", async () => {
    const a = await member("a@example.com");
    await picked(a);
    failing = true;
    await runSendJob(query, deps(), { week: WEEK });
    expect(teasers("a@example.com")).toHaveLength(0);
    expect((await userRow(a)).first_teaser_at).toBe("2026-12-14 12:05:00+00");
    failing = false;
    const out = await hourly(new Date("2026-12-14T19:00:00Z"));
    expect(out.teaser_unsent).toBe(1);
    await hourly(new Date("2026-12-14T20:00:00Z"));
    await runSendJob(query, deps(new Date("2026-12-14T20:10:00Z")), { week: WEEK });
    expect(teasers("a@example.com")).toHaveLength(1);
    expect(await deliveredIn(a, WEEK)).toBe(0);
  });

  it("waits for the Monday send time, sends only the newest held week, and skips users with a card", async () => {
    const a = await member("a@example.com");
    await week(PREV);
    await picked(a, PREV, 3, { superseded: "2026-12-14T06:05:00Z" });
    await picked(a, WEEK, 3, { offset: 3 });
    const c = await member("c@example.com", { card: true });
    await picked(c);
    expect(await sendUnsentTeasers(query, deps(new Date("2026-12-14T08:00:00Z")))).toBe(0); // 3:00 AM
    expect(await sendUnsentTeasers(query, deps())).toBe(1);
    expect(sent.map((m) => [m.to[0], m.subject])).toEqual([["a@example.com", "Your first 3 ideas are ready"]]);
    expect(sent[0].text).toContain("Expense log");
    expect(await query("select ref from notifications where recipient = $1", [a])).toEqual([{ ref: WEEK }]);
  });

  it("leaves a held week older than 8 days alone, and never teases a sponsored member with no card", async () => {
    const a = await member("a@example.com");
    await week(PREV);
    await picked(a, PREV);
    const s = await member("s@example.com", { sponsored: true });
    await picked(s);
    // Wednesday 2026-12-16: PREV (2026-12-07) is 9 days old.
    expect(await sendUnsentTeasers(query, deps(new Date("2026-12-16T15:00:00Z")))).toBe(0);
    expect(await sendUnsentTeasers(query, deps())).toBe(1); // a's PREV, 7 days old on the 14th; never s
    expect(sent.map((m) => m.to[0])).toEqual(["a@example.com"]);
  });

  it("gives up after the last attempt", async () => {
    const a = await member("a@example.com");
    await picked(a);
    failing = true;
    for (let i = 0; i < 5; i++) await sendUnsentTeasers(query, deps(new Date(SEVEN_AM.getTime() + i * 3_600_000)));
    expect(await query("select attempts, status from notifications where recipient = $1", [a])).toEqual([{ attempts: 3, status: "failed" }]);
  });
});

describe("superseding at ready (review fixes F1, F2)", () => {
  const H = "worker-1";
  const picksJson = (offset: number) => JSON.stringify([0, 1, 2].map((i) => ({ position: i + 1, id: plays[i + offset], personal: 70, fit: 3, reason: REASON })));
  /** Cora is picking `w` (running, this worker's lease) and records the member's picks there. */
  async function coraPicks(userId: string, w: string, offset: number) {
    await query(
      `insert into cora_weeks (week_of, status, phase, holder, lease_until) values ($1, 'running', 'picked', $2, now() + interval '5 minutes')
       on conflict (week_of) do update set status = 'running', phase = 'picked', holder = $2, lease_until = now() + interval '5 minutes'`,
      [w, H],
    );
    await query(RECORD_PICKS_SQL, [userId, w, "picked", 6, 3, "", false, picksJson(offset), H]);
  }
  const ready = (w: string, now: Date) => query(SUPERSEDE_AT_READY_SQL, [w, H, now.toISOString()]);
  const supersededAt = async (id: string, w: string) =>
    (await query<{ s: string | null }>("select superseded_at::text as s from cora_user_weeks where user_id = $1 and week_of = $2", [id, w]))[0]?.s ?? null;

  it("a newer week that fails after its picks leaves the older held list teaser-able and unlockable", async () => {
    const a = await member("a@example.com");
    await week(PREV);
    await picked(a, PREV);
    await query("delete from cora_weeks where week_of = $1", [WEEK]);
    await coraPicks(a, WEEK, 3);
    expect(await supersededAt(a, PREV)).toBeNull();
    await query("update cora_weeks set status = 'failed' where week_of = $1", [WEEK]);
    expect(await heldTeaser(query, a)).toEqual({ week: PREV, titles: TITLES.slice(0, 3), count: 3 });
    expect(await sendUnsentTeasers(query, deps(new Date("2026-12-14T19:00:00Z")))).toBe(1);
    expect(teasers("a@example.com")[0].text).toContain("Inbox triage");
    // The card is saved: the older list is the one unlocked.
    await query("update users set trial_started_at = '2026-12-14T20:00:00Z' where id = $1", [a]);
    expect(await deliverWeek(query, a, PREV, 2, new Date("2026-12-14T20:00:00Z"))).toEqual({ delivered: 3, freeListNumber: 1 });
  });

  it("a newer week that becomes ready supersedes the older held list at the job clock; the new one is the held list", async () => {
    const a = await member("a@example.com");
    await week(PREV);
    await picked(a, PREV);
    await query("delete from cora_weeks where week_of = $1", [WEEK]);
    await coraPicks(a, WEEK, 3);
    expect(await ready(WEEK, new Date("2026-12-14T06:05:00Z"))).toHaveLength(1);
    expect(await supersededAt(a, PREV)).toBe("2026-12-14 06:05:00+00");
    expect(await supersededAt(a, WEEK)).toBeNull();
    expect(await heldTeaser(query, a)).toMatchObject({ week: WEEK, titles: TITLES.slice(3, 6) });
  });

  it("an older week re-run after a newer held week is itself superseded: only the newest list is live", async () => {
    const a = await member("a@example.com");
    await picked(a); // WEEK, ready, held
    await coraPicks(a, PREV, 3);
    expect(await ready(PREV, new Date("2026-12-14T15:00:00Z"))).toHaveLength(1);
    expect(await supersededAt(a, PREV)).toBe("2026-12-14 15:00:00+00");
    expect(await supersededAt(a, WEEK)).toBeNull();
    expect(await heldTeaser(query, a)).toMatchObject({ week: WEEK });
    expect(await sendHeldTeaser(query, deps(), a, PREV)).toBe("not_held");
    expect(await sendHeldTeaser(query, deps(), a, WEEK)).toBe("sent");
  });

  it("a card saved while Cora is still picking a newer week waits for it; once ready, the newer list is the one delivered", async () => {
    const a = await member("a@example.com");
    await week(PREV);
    await picked(a, PREV);
    await query("delete from cora_weeks where week_of = $1", [WEEK]);
    await coraPicks(a, WEEK, 0); // the same ideas again: undelivered picks are not "sent"
    await query("update users set trial_started_at = '2026-12-14T05:30:00Z' where id = $1", [a]);
    expect(await deliverWeek(query, a, PREV, 2, new Date("2026-12-14T05:30:00Z"))).toEqual({ delivered: 0, freeListNumber: null });
    expect(await deliverLate(query, deps(new Date("2026-12-14T05:45:00Z")))).toBe(0);
    await ready(WEEK, new Date("2026-12-14T06:05:00Z"));
    expect(await supersededAt(a, PREV)).toBe("2026-12-14 06:05:00+00");
    await runSendJob(query, deps(), { week: WEEK });
    expect(await deliveredIn(a, PREV)).toBe(0);
    expect(await deliveredIn(a, WEEK)).toBe(3);
    expect(await userRow(a)).toMatchObject({ free_lists_used: 1 });
    expect(to("a@example.com").map((m) => m.subject)).toEqual(["Your three ideas for the week of Monday, December 14"]);
  });

  it("the ready step supersedes nothing for a dry week", async () => {
    const a = await member("a@example.com");
    await week(PREV);
    await picked(a, PREV);
    await query("delete from cora_weeks where week_of = $1", [WEEK]);
    await query("insert into cora_weeks (week_of, status, phase, holder, dry_run) values ($1, 'running', 'picked', $2, true)", [WEEK, H]);
    await query(RECORD_PICKS_SQL, [a, WEEK, "picked", 6, 3, "", true, picksJson(3), H]);
    expect(await ready(WEEK, SEVEN_AM)).toHaveLength(1);
    expect(await supersededAt(a, PREV)).toBeNull();
  });
});

describe("/app for a trial with no card", () => {
  it("loadHome carries the held titles only, and no ideas", async () => {
    const a = await member("a@example.com");
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    const home = await loadHome(query, a, settings, SEVEN_AM);
    expect(home).toMatchObject({ ideas: [], week: null, held: { week: WEEK, titles: TITLES.slice(0, 3), count: 3 } });
    expect(JSON.stringify(home)).not.toMatch(/Secret|Fits the sales work/);
    // One call to action (Unit 9): the held block's button, not a second link on the status line.
    expect(home?.statusLink).toBeNull();
    expect(home?.statusLine).toBe("Your first ideas are ready — add a card to see them.");
  });

  it("shows no held list to a member with a card", async () => {
    const c = await member("c@example.com", { card: true });
    await picked(c);
    expect(await heldTeaser(query, c)).toBeNull();
    expect((await loadHome(query, c, settings, SEVEN_AM))?.held).toBeNull();
  });
});
