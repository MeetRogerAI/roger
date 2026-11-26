import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { bricks, markSetUp, weekIdeas } from "@/lib/app/week";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import { runHourly } from "@/lib/housekeeping/job";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { runSendJob } from "./send-job";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
let failing = false;
const transport: Transport = async (m) => {
  if (failing && !m.subject.startsWith("[Roger]")) return { ok: false, error: "resend down", retryable: false };
  sent.push(m);
  return { ok: true };
};
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
let plays: string[];

async function member(email: string, o: Record<string, unknown> = {}) {
  const v = { status: "trial", plan: "monthly", sharing: "share", free_lists_used: 0, stripe_customer: `cus_${email}`, email_prefs: {}, ...o };
  const [u] = await query<{ id: string }>(
    "insert into users (email, status, plan, sharing, free_lists_used, stripe_customer, email_prefs, currency, trial_started_at) values ($1, $2, $3, $4, $5, $6, $7, 'USD', $8) returning id",
    [email, v.status, v.plan, v.sharing, v.free_lists_used, v.stripe_customer, JSON.stringify(v.email_prefs), "trial_started_at" in o ? o.trial_started_at : "2026-11-16T15:00:00Z"],
  );
  return u.id;
}
async function picked(userId: string, n = 3, outcome = "picked") {
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, $3, $4)", [userId, WEEK, outcome, n]);
  for (let i = 0; i < n; i++) {
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, 'Fits the sales work your week shows.')", [
      userId,
      WEEK,
      i + 1,
      plays[i],
    ]);
  }
}
const user = async (id: string) => (await query<{ free_lists_used: number }>("select free_lists_used from users where id = $1", [id]))[0];
const delivered = async (id: string) => (await query("select 1 from picks where user_id = $1 and delivered_at is not null", [id])).length;
const to = (email: string) => sent.filter((m) => m.to[0] === email);

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  failing = false;
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  plays = [];
  for (const t of ["Inbox triage", "Listing post", "Calendar prep"]) {
    const [p] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
       values ($1, 'Sales', 'Does it.', '1. Step.', 'Save it.', $2, $2, $3, 70, 7, 7, 7, 7, 7) returning id`,
      [t, WEEK, JSON.stringify({ current_hours_week: 2, runners: 3, confidence: "High" })],
    );
    plays.push(p.id);
  }
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
});

describe("the Monday send", () => {
  it("delivers each eligible user's list once, with one email showing the same ideas as /app (spec check 12)", async () => {
    const a = await member("a@example.com");
    await picked(a);
    expect(await runSendJob(query, deps(), { week: WEEK })).toMatchObject({ status: "done", delivered: 1 });
    expect(to("a@example.com").map((m) => m.subject)).toEqual(["Your three ideas for the week of Monday, December 14"]);
    const email = to("a@example.com")[0].text;
    const ideas = await weekIdeas(query, a, WEEK, settings.playbookPreface);
    for (const i of ideas) expect(email).toContain(i.title);
    expect(email).toContain("Free list 1 of 2.");
    expect(await user(a)).toEqual({ free_lists_used: 1 });
  });

  it("sends nothing the second time and counts no second free list", async () => {
    const a = await member("a@example.com");
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")).toHaveLength(1);
    expect(await user(a)).toEqual({ free_lists_used: 1 });
  });

  it("does nothing before the send time, or for a week Cora has not finished", async () => {
    const a = await member("a@example.com");
    await picked(a);
    expect(await runSendJob(query, deps(new Date("2026-12-14T11:55:00Z")), { week: WEEK })).toMatchObject({ status: "skipped" });
    await query("update cora_weeks set status = 'running'");
    expect(await runSendJob(query, deps(), { week: WEEK })).toMatchObject({ status: "skipped" });
    expect(sent).toEqual([]);
  });

  it("holds a third-list user until the charge succeeds, then delivers once in the hourly pass", async () => {
    const a = await member("a@example.com", { free_lists_used: 2 });
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    expect(await delivered(a)).toBe(0);
    // The retry on Wednesday succeeds: the user is active.
    await query("update users set status = 'active', first_charge_at = '2026-12-16T11:05:00Z'");
    await runHourly(query, { gw, settings, now: new Date("2026-12-16T12:00:00Z"), query, transport, sleep: async () => {} });
    await runHourly(query, { gw, settings, now: new Date("2026-12-16T13:00:00Z"), query, transport, sleep: async () => {} });
    expect(await delivered(a)).toBe(3);
    expect(to("a@example.com")).toHaveLength(1);
    expect(await user(a)).toEqual({ free_lists_used: 2 }); // a paid list, not a free one
  });

  it("still delivers and counts the list when the Monday email cannot be sent, and admins hear of it", async () => {
    const a = await member("a@example.com");
    await picked(a);
    failing = true;
    await runSendJob(query, deps(), { week: WEEK });
    expect(await delivered(a)).toBe(3);
    expect(await user(a)).toEqual({ free_lists_used: 1 });
    expect(sent.map((m) => m.subject)).toEqual(["[Roger] Emails are failing: monday_list"]);
  });

  it("delivers to a user who switched the Monday email off, and sends them nothing", async () => {
    const a = await member("a@example.com", { email_prefs: { monday: false } });
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    expect(await delivered(a)).toBe(3);
    expect(await user(a)).toEqual({ free_lists_used: 1 });
    expect(to("a@example.com")).toEqual([]);
  });

  it("says plainly when a list is short, and a short list uses a free list (R13, R14)", async () => {
    const a = await member("a@example.com");
    await picked(a, 2, "short");
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")[0].text).toContain("there are 2 ideas that fit you, not three");
    expect(await user(a)).toEqual({ free_lists_used: 1 });
  });

  it("sends a charged order one 'Your list, and your receipt' email", async () => {
    const a = await member("a@example.com", { status: "active", plan: "per_run", free_lists_used: 2 });
    await picked(a);
    await query("insert into orders (user_id, week_of, status, amount_cents, currency) values ($1, $2, 'charged', 5650, 'USD')", [a, WEEK]);
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com").map((m) => m.subject)).toEqual(["Your list, and your receipt"]);
    expect(to("a@example.com")[0].text).toContain("This list: US$56.50 with tax.");
    expect((await query<{ status: string }>("select status from orders"))[0].status).toBe("sent");
  });

  it("tells a trial user with Zack on and no report that no free list was used (spec check 20)", async () => {
    const a = await member("a@example.com");
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, $2, 'not_eligible')", [a, WEEK]);
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")[0].text).toContain("no free list was used");
    expect(await user(a)).toEqual({ free_lists_used: 0 });
  });

  it("tells a paying monthly user with no eligible ideas, without mentioning charges, and alerts admins (R15)", async () => {
    const a = await member("a@example.com", { status: "active", first_charge_at: null });
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, $2, 'none')", [a, WEEK]);
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")[0].subject).toBe("No new ideas for you this week");
    expect(to("a@example.com")[0].text).not.toMatch(/not charged|nothing was charged/i);
    expect(to("a@example.com")[0].text).toContain("missing because of Roger, not you, and this week never counts as a missed week");
    expect(sent.map((m) => m.subject)).toContain("[Roger] A member had no eligible ideas");
  });

  it("alerts admins for any member with no eligible ideas, and tells a trial member nothing was charged (R15)", async () => {
    const a = await member("a@example.com");
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, $2, 'none')", [a, WEEK]);
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")[0].text).toContain("Nothing was charged, and this week doesn’t use one of your free lists.");
    expect(sent.map((m) => m.subject)).toContain("[Roger] A member had no eligible ideas");
  });

  it("after the second free list, sends the first-paid-next email with the date and amount", async () => {
    const a = await member("a@example.com", { free_lists_used: 1 });
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    const subjects = to("a@example.com").map((m) => m.subject);
    expect(subjects).toEqual(["Your next list is your first paid one", "Your three ideas for the week of Monday, December 14"]);
    // Both emails state the same date and the same told amount.
    expect(to("a@example.com")[1].text).toContain("Free list 2 of 2. Your next list is your first paid one: Monday, December 21, US$226 with tax.");
    expect(to("a@example.com")[0].text).toContain("US$226");
  });

  it("sends the first-paid-next email on a later pass when the first try failed", async () => {
    const a = await member("a@example.com", { free_lists_used: 1 });
    await picked(a);
    failing = true;
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")).toEqual([]);
    failing = false;
    await runSendJob(query, deps(new Date("2026-12-14T12:15:00Z")), { week: WEEK });
    expect(to("a@example.com").map((m) => m.subject)).toEqual(["Your next list is your first paid one", "Your three ideas for the week of Monday, December 14"]);
    expect(await user(a)).toEqual({ free_lists_used: 2 });
  });

  it("emails a list delivered mid-week whose first email failed, on the next hourly pass", async () => {
    const a = await member("a@example.com", { free_lists_used: 2 });
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    await query("update users set status = 'active', first_charge_at = '2026-12-16T11:05:00Z'");
    failing = true;
    await runHourly(query, { gw, settings, now: new Date("2026-12-16T12:00:00Z"), query, transport, sleep: async () => {} });
    expect(await delivered(a)).toBe(3);
    failing = false;
    await runHourly(query, { gw, settings, now: new Date("2026-12-16T13:00:00Z"), query, transport, sleep: async () => {} });
    expect(to("a@example.com").map((m) => m.subject)).toEqual(["Your three ideas for the week of Monday, December 14"]);
  });

  it("never delivers to a cancelled member whose paid month has ended, or a held member", async () => {
    const a = await member("a@example.com", { status: "cancelled" });
    await query("update users set access_ends_at = '2026-12-14T10:00:00Z' where id = $1", [a]);
    const b = await member("b@example.com", { status: "held", free_lists_used: 2 });
    await picked(a);
    await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 1)", [b, WEEK]);
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, 1, $3, 70, 3, 'Fits.')", [b, WEEK, plays[0]]);
    await runSendJob(query, deps(), { week: WEEK });
    expect(await delivered(a)).toBe(0);
    expect(await delivered(b)).toBe(0);
    expect(sent).toEqual([]);
  });

  it("never counts a third free list, even when two weeks are delivered at once", async () => {
    const a = await member("a@example.com", { free_lists_used: 2 });
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    expect(await delivered(a)).toBe(0);
    expect(await user(a)).toEqual({ free_lists_used: 2 });
  });

  it("sends a one-at-a-time member with an order and no eligible ideas no second note (the order's own note covers it)", async () => {
    const a = await member("a@example.com", { status: "active", plan: "per_run", free_lists_used: 2 });
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, $2, 'none')", [a, WEEK]);
    await query("insert into orders (user_id, week_of, status) values ($1, $2, 'cancelled')", [a, WEEK]);
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")).toEqual([]);
  });

  it("names the count in a short list's subject", async () => {
    const a = await member("a@example.com");
    await picked(a, 2, "short");
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")[0].subject).toBe("Your two ideas for the week of Monday, December 14");
  });

  it("never says where a play came from (spec check 14)", async () => {
    const a = await member("a@example.com");
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    expect(to("a@example.com")[0].text).not.toMatch(/@example|run by|contributed by/i);
  });
});

describe("I set this up, and the week pages", () => {
  it("marks a pick once and the brick count rises by one; another user's week is never shown", async () => {
    const a = await member("a@example.com");
    const b = await member("b@example.com");
    await picked(a);
    await runSendJob(query, deps(), { week: WEEK });
    expect(await markSetUp(query, a, WEEK, 1)).toBe(true);
    expect(await markSetUp(query, a, WEEK, 1)).toBe(false);
    expect(await bricks(query, a)).toEqual({ marked: 1, confirmed: 0 });
    expect(await weekIdeas(query, b, WEEK, "")).toEqual([]);
    expect(await markSetUp(query, b, WEEK, 1)).toBe(false);
    expect(await weekIdeas(query, a, "2026-12-07", "")).toEqual([]);
    expect(await weekIdeas(query, a, "2026-13-45", "")).toEqual([]);
    expect(await markSetUp(query, a, "2026-02-30", 1)).toBe(false);
  });
});
