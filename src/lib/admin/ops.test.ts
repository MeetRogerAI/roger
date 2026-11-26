import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { linkContributor } from "./users";
import { attentionFor, eligibleCounts, excuseDefaultWeek, filterOps, loadOps, opsWeek, STATUS_KEYS, statusKey } from "./ops";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const WEEK = "2026-12-14";
/** Sunday 2026-12-13, 8:30 PM Toronto (EST). */
const SUNDAY_EVENING = new Date("2026-12-14T01:30:00Z");

async function user(email: string, cols: Record<string, unknown> = {}): Promise<string> {
  const c = { status: "trial", plan: "monthly", sharing: "share", currency: "USD", ...cols };
  const keys = Object.keys(c);
  const [{ id }] = await query<{ id: string }>(
    `insert into users (email, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [email, ...Object.values(c)],
  );
  return id;
}
const run = (userId: string, status: string) =>
  query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, $2, 'connector', 'hark', 'share', 'x', $3)", [userId, WEEK, status]);
async function poolPlay(title: string): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ($1, 'Marketing', 'd', 'p', 'i', '2026-11-30', '2026-12-07') returning id",
    [title],
  );
  return id;
}

let contributor: string;
beforeEach(async () => {
  ({ query } = await testDb());
  const plays = [await poolPlay("One"), await poolPlay("Two"), await poolPlay("Three")];
  [{ id: contributor }] = await query<{ id: string }>("insert into seed_contributors (label) values ('Rob') returning id");
  await query("insert into pool_play_contributors (pool_play_id, contributor) values ($1, $2)", [plays[0], `seed:${contributor}`]);
});

describe("the week the screen shows", () => {
  it("is the list being collected for, and on a Monday the week being worked on", () => {
    expect(opsWeek(SUNDAY_EVENING)).toBe(WEEK);
    expect(opsWeek(new Date("2026-12-14T15:00:00Z"))).toBe(WEEK);
    expect(opsWeek(new Date("2026-12-16T15:00:00Z"))).toBe("2026-12-21");
  });

  it("is the coming Monday all of Sunday, even after an early cutoff", () => {
    // Sunday 11:50 PM Toronto: past an 18:00 cutoff, still tomorrow's week.
    expect(opsWeek(new Date("2026-12-14T04:50:00Z"))).toBe(WEEK);
    expect(opsWeek(new Date("2026-12-13T06:00:00Z"))).toBe(WEEK);
  });

  it("starts the excuse forms on the most recent recorded week", () => {
    expect(excuseDefaultWeek(new Date("2026-12-14T15:00:00Z"))).toBe(WEEK);
    expect(excuseDefaultWeek(new Date("2026-12-16T15:00:00Z"))).toBe(WEEK);
    expect(excuseDefaultWeek(SUNDAY_EVENING)).toBe("2026-12-07");
  });
});

describe("needs attention (spec check 30)", () => {
  it("catches each listed case, and leaves a member with nothing wrong out", async () => {
    const noRun = await user("norun@example.com");
    const flagged = await user("flagged@example.com");
    await run(flagged, "flagged");
    const rejected = await user("rejected@example.com");
    await run(rejected, "rejected");
    const held = await user("held@example.com", { status: "held", hold_reason: "first_charge_failed" });
    await run(held, "accepted");
    // A trial with no list yet, started 18 days ago: it closes in 3 days. (No run: a run for the coming week would hold the close.)
    const closing = await user("closing@example.com", { trial_started_at: "2026-11-25T12:00:00Z" });
    const few = await user("few@example.com", { status: "active", first_charge_at: "2026-12-03T11:05:00Z", stripe_subscription: "sub_1" });
    await run(few, "accepted");
    await linkContributor(query, "admin@example.com", contributor, few);
    const fine = await user("fine@example.com", { status: "active", first_charge_at: "2026-12-03T11:05:00Z", stripe_subscription: "sub_2" });
    await run(fine, "accepted");

    const { week, rows } = await loadOps(query, { now: SUNDAY_EVENING, settings });
    expect(week).toBe(WEEK);
    const of = (id: string) => rows.find((r) => r.id === id)!.attention;
    expect(of(noRun)).toContain("no_run");
    expect(of(flagged)).toContain("flagged_run");
    expect(of(rejected)).toContain("rejected_run");
    expect(of(held)).toContain("held");
    expect(of(closing)).toContain("trial_closing");
    expect(of(few)).toEqual(["few_eligible"]);
    expect(of(fine)).toEqual([]);
    expect(filterOps(rows, { attention: true }).map((r) => r.id)).not.toContain(fine);
    expect(filterOps(rows, { attention: true })).toHaveLength(6);
  });

  it("asks for a run only from Sunday 8:00 PM, and not from someone with Zack off", () => {
    const f = { status: "trial", holdReason: null, plan: "monthly" as const, sharing: "share" as const, order: null, run: null, eligible: 5, closesAt: null, freeListsUsed: 0 };
    const at = (now: Date) => ({ now, week: WEEK, freeRuns: 2 });
    expect(attentionFor(f, at(new Date("2026-12-14T00:55:00Z")))).toEqual([]);
    expect(attentionFor(f, at(SUNDAY_EVENING))).toEqual(["no_run"]);
    expect(attentionFor({ ...f, sharing: "off" }, at(SUNDAY_EVENING))).toEqual([]);
    // One at a time without an order expects nothing.
    expect(attentionFor({ ...f, status: "active", plan: "per_run" }, at(SUNDAY_EVENING))).toEqual([]);
  });

  it("expects a run from one at a time only with an order, unless still on free lists", () => {
    const f = { status: "trial", holdReason: null, plan: "per_run" as const, sharing: "share" as const, order: null, run: null, eligible: 5, closesAt: null, freeListsUsed: 1 };
    const at = { now: SUNDAY_EVENING, week: WEEK, freeRuns: 2 };
    expect(attentionFor(f, at)).toEqual(["no_run"]);
    expect(attentionFor({ ...f, freeListsUsed: 2 }, at)).toEqual([]);
    expect(attentionFor({ ...f, freeListsUsed: 2, order: "ordered" }, at)).toEqual(["no_run"]);
    expect(attentionFor({ ...f, status: "active", freeListsUsed: 2, order: "ordered" }, at)).toEqual(["no_run"]);
  });

  it("names a trial whose first charge failed and closes on day 7", async () => {
    const held = await user("held@example.com", { status: "held", hold_reason: "first_charge_failed" });
    await query("insert into charge_attempts (user_id, purpose, week_of, outcome) values ($1, 'first_charge', '2026-12-07', 'declined')", [held]);
    const { rows } = await loadOps(query, { now: SUNDAY_EVENING, settings });
    expect(rows[0].closesAt).toBe("2026-12-14T11:00:00.000Z");
    expect(rows[0].attention).toEqual(expect.arrayContaining(["held", "trial_closing"]));
  });

  it("uses the real 21-day close: a Roger week moves it, and a member mid-switch or past a list is not closing", async () => {
    const pushed = await user("pushed@example.com", { trial_started_at: "2026-11-25T12:00:00Z" });
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2026-11-30', 'none')", [pushed]);
    const switching = await user("switching@example.com", { trial_started_at: "2026-11-25T12:00:00Z", switched_from_per_run_at: "2026-11-20T12:00:00Z" });
    const listed = await user("listed@example.com", { trial_started_at: "2026-11-25T12:00:00Z", free_lists_used: 1 });
    const { rows } = await loadOps(query, { now: SUNDAY_EVENING, settings });
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row(pushed).closesAt).toBe("2026-12-23T12:00:00.000Z");
    expect(row(pushed).attention).not.toContain("trial_closing");
    expect(row(switching).closesAt).toBeNull();
    expect(row(listed).closesAt).toBeNull();
  });

  it("shows the no-card clocks (plan 2026-11-26-001, Unit 7): teaser + 14 days, consent + 21 days; a held list never moves them", async () => {
    // First teaser Monday 2026-11-30, 7:05 AM Toronto; a newer held week since does not extend.
    const teasered = await user("teasered@example.com", { consent_at: "2026-11-20T12:00:00Z", first_teaser_at: "2026-11-30T12:05:00Z" });
    await query("insert into cora_weeks (week_of, status) values ('2026-12-07', 'sent')");
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2026-12-07', 'picked')", [teasered]);
    const fresh = await user("fresh@example.com", { consent_at: "2026-12-10T12:00:00Z" });
    const sponsored = await user("sponsored@example.com", { consent_at: "2026-11-01T12:00:00Z", sponsor_id: "00000000-0000-4000-8000-000000000001" });
    const { rows } = await loadOps(query, { now: SUNDAY_EVENING, settings });
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row(teasered).closesAt).toBe("2026-12-14T12:05:00.000Z");
    expect(row(teasered).attention).toContain("trial_closing");
    expect(row(fresh).closesAt).toBe("2026-12-31T12:00:00.000Z");
    expect(row(fresh).attention).not.toContain("trial_closing");
    expect(row(sponsored).closesAt).toBeNull();
  });

  it("does not flag a never-teasered no-card close while its run waits on Cora, even a run for a later week (review fixes Unit 7, F5)", async () => {
    // Consent + 21 days = Thursday 2026-12-17: within 5 days of Sunday evening.
    const waiting = await user("waiting-nocard@example.com", { consent_at: "2026-11-26T12:00:00Z" });
    // An admin-added run for a week after the coming one, Cora not started.
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, '2026-12-21', 'connector', 'hark', 'share', 'x', 'accepted')", [waiting]);
    const plain = await user("plain-nocard@example.com", { consent_at: "2026-11-26T12:00:00Z" });
    const { rows } = await loadOps(query, { now: SUNDAY_EVENING, settings });
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row(waiting).closesAt).toBe("2026-12-17T12:00:00.000Z");
    expect(row(waiting).attention).not.toContain("trial_closing");
    expect(row(plain).attention).toContain("trial_closing");
  });

  it("does not show a trial as closing while its run for the coming week waits on Cora", async () => {
    const waiting = await user("waiting@example.com", { trial_started_at: "2026-11-25T12:00:00Z" });
    await run(waiting, "accepted");
    const { rows } = await loadOps(query, { now: SUNDAY_EVENING, settings });
    expect(rows.find((r) => r.id === waiting)!.closesAt).toBeNull();
  });
});

describe("eligible plays (R16, R25)", () => {
  it("drops a linked seed contributor's plays from the user's count", async () => {
    const pilot = await user("pilot@example.com");
    expect((await eligibleCounts(query, WEEK)).get(pilot)).toBe(3);
    await linkContributor(query, "admin@example.com", contributor, pilot);
    expect((await eligibleCounts(query, WEEK)).get(pilot)).toBe(2);
    expect(await query("select admin_email, action from admin_actions")).toEqual([{ admin_email: "admin@example.com", action: "link_contributor" }]);
  });

  it("logs an unlink against the user it was linked to, and a move against both", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    await linkContributor(query, "admin@example.com", contributor, a);
    await linkContributor(query, "admin@example.com", contributor, b);
    await linkContributor(query, "admin@example.com", contributor, null);
    expect(await query("select user_id, action from admin_actions order by id")).toEqual([
      { user_id: a, action: "link_contributor" },
      { user_id: a, action: "unlink_contributor" },
      { user_id: b, action: "link_contributor" },
      { user_id: b, action: "unlink_contributor" },
    ]);
  });

  it("refuses linking one contributor to a second user", async () => {
    const a = await user("a@example.com");
    const [{ id: other }] = await query<{ id: string }>("insert into seed_contributors (label) values ('Kim') returning id");
    await linkContributor(query, "admin@example.com", contributor, a);
    expect(await linkContributor(query, "admin@example.com", other, a)).toMatchObject({ ok: false });
  });
});

describe("a trial with no card yet (plan 2026-11-26-001, Unit 1)", () => {
  it("has its own status kind and filter, and no money words beyond 'No card yet'", async () => {
    const noCard = await user("nocard@example.com", { stripe_customer: "cus_n" });
    const carded = await user("card@example.com", { trial_started_at: "2026-11-30T15:00:00Z" });
    const sponsored = await user("sponsored@example.com", { sponsor_id: "00000000-0000-4000-8000-000000000001" });
    const { rows } = await loadOps(query, { now: SUNDAY_EVENING, settings });
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by(noCard)).toMatchObject({ hasCard: false, money: "No card yet" });
    expect(statusKey(by(noCard))).toBe("trial_no_card");
    expect(statusKey(by(carded))).toBe("trial");
    expect(statusKey(by(sponsored))).toBe("sponsored");
    expect(filterOps(rows, { status: "trial_no_card" }).map((r) => r.id)).toEqual([noCard]);
    expect(STATUS_KEYS).toContain("trial_no_card");
  });

  it("statusKey: active, held and cancelled accounts are never 'no card'", () => {
    const r = { plan: "monthly" as const, sponsored: false, cancelRequested: false, hasCard: false };
    expect(statusKey({ ...r, status: "active" })).toBe("monthly");
    expect(statusKey({ ...r, status: "held" })).toBe("held");
    expect(statusKey({ ...r, status: "cancelled" })).toBe("cancelled");
    expect(statusKey({ ...r, status: "trial", switched: true })).toBe("monthly");
  });
});
