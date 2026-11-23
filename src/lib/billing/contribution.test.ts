import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeAdjustments } from "@/test-helpers/fake-adjustments";
import { testDb } from "@/test-helpers/pglite-db";
import type { AdjustDeps } from "./adjustment";
import { contributionStatus, excuseWeek, processContributions, recordWeek } from "./contribution";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
let stripe: ReturnType<typeof fakeAdjustments>;
const deps = (now: Date, o: Partial<AdjustDeps> = {}): AdjustDeps => ({ settings, now, adjust: stripe, query, transport, sleep: async () => {}, ...o });
const subjects = () => sent.filter((m) => !m.subject.startsWith("[Roger]")).map((m) => m.subject);
/** 7:05 AM Toronto (EST) on a Monday: after the send. */
const mondayMorning = (week: string) => new Date(`${week}T12:05:00Z`);

// First charged Thursday 2026-12-03, 6:05 AM Toronto: months run Dec 3 to Jan 3, Jan 3 to Feb 3 (a Wednesday), ...
const FIRST = "2026-12-03T11:05:00Z";
let uid: string;

async function week(w: string, o: { run?: "accepted" | "flagged" | "rejected"; userId?: string; status?: "sent" | "failed" | "running" | "ready"; outcome?: string } = {}) {
  await query("insert into cora_weeks (week_of, status, phase) values ($1, $2, 'ready') on conflict (week_of) do nothing", [w, o.status ?? "sent"]);
  if (o.run) {
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, $2, 'connector', 'hark', 'share', 'x', $3)", [o.userId ?? uid, w, o.run]);
  }
  if (o.outcome) await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, $2, $3)", [o.userId ?? uid, w, o.outcome]);
  await recordWeek(query, w, settings);
}
const results = async (userId = uid) =>
  (await query<{ week_of: string; result: string; period_start: string | null }>(
    "select to_char(week_of, 'YYYY-MM-DD') as week_of, result, to_char(period_start, 'YYYY-MM-DD') as period_start from contribution_weeks where user_id = $1 order by week_of",
    [userId],
  ));
const adjustments = () =>
  query<{ status: string; amount_cents: number; currency: string; stripe_item: string | null; period_start: string; invoice_at: string; deleted_reason: string | null; reason: string }>(
    "select status, amount_cents, currency, stripe_item, to_char(period_start, 'YYYY-MM-DD') as period_start, invoice_at::text, deleted_reason, reason from pending_adjustments order by created_at",
  );

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  stripe = fakeAdjustments();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  [{ id: uid }] = await query<{ id: string }>(
    "insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, first_charge_at) values ('ana@example.com', 'active', 'monthly', 'USD', 'share', 'cus_1', 'sub_1', $1) returning id",
    [FIRST],
  );
});

describe("recording the week at the cutoff", () => {
  it("records contributed, missed and by choice in the period that contains the cutoff", async () => {
    await week("2026-12-07", { run: "accepted" });
    await week("2026-12-14");
    await week("2027-01-04");
    expect(await results()).toEqual([
      { week_of: "2026-12-07", result: "contributed", period_start: "2026-12-03" },
      { week_of: "2026-12-14", result: "missed", period_start: "2026-12-03" },
      { week_of: "2027-01-04", result: "missed", period_start: "2027-01-03" },
    ]);
  });

  it("counts a flagged run as contributed (launch list D1), and a rejected one as a miss", async () => {
    await week("2026-12-07", { run: "flagged" });
    await week("2026-12-14", { run: "rejected" });
    expect((await results()).map((r) => r.result)).toEqual(["contributed", "missed"]);
  });

  it("records 'matching only' at the cutoff as by choice, even when sharing is back on by Monday", async () => {
    await query("insert into zack_settings_history (user_id, sharing, plays_per_week, changed_at) values ($1, 'match_only', 4, '2026-12-10T12:00:00Z')", [uid]);
    await query("insert into zack_settings_history (user_id, sharing, plays_per_week, changed_at) values ($1, 'share', 4, '2026-12-14T06:00:00Z')", [uid]);
    await week("2026-12-14");
    expect((await results()).map((r) => r.result)).toEqual(["by_choice"]);
  });

  it("counts nothing during the trial or for one-at-a-time users", async () => {
    await query("insert into users (email, status, plan) values ('t@example.com', 'trial', 'monthly'), ('p@example.com', 'active', 'per_run')");
    await week("2026-12-07");
    expect(await query("select 1 from contribution_weeks")).toHaveLength(1);
  });

  it("puts the Sunday cutoff before a 6:00 AM Monday renewal in the period that is ending", async () => {
    // First charged Monday 2026-06-01 at 6:05 AM Toronto; it renews Monday 2027-02-01 at 5:05 AM Toronto (10:05 UTC).
    const [{ id }] = await query<{ id: string }>(
      "insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, first_charge_at) values ('mo@example.com', 'active', 'monthly', 'USD', 'share', 'cus_2', 'sub_2', '2026-06-01T10:05:00Z') returning id",
    );
    await week("2027-02-01");
    expect((await results(id))[0]).toEqual({ week_of: "2027-02-01", result: "missed", period_start: "2027-01-01" });
  });
});

describe("misses in a period (spec B.9)", () => {
  it("forgives the first miss: one email, nothing on the invoice", async () => {
    await week("2026-12-07");
    await processContributions(query, deps(mondayMorning("2026-12-07")));
    await processContributions(query, deps(mondayMorning("2026-12-07")));
    expect(subjects()).toEqual(["Zack didn’t send a report this week"]);
    expect(sent[0].text).toContain("A second miss before Sunday, January 3 makes this month US$400.");
    expect(await adjustments()).toEqual([]);
    expect(stripe.pending()).toEqual([]);
  });

  it("adds one labelled item for the difference at the second miss, in the user's currency, and sends the second notice (spec check 24)", async () => {
    await query("update users set currency = 'CAD'");
    await week("2026-12-07");
    await processContributions(query, deps(mondayMorning("2026-12-07")));
    await week("2026-12-14");
    await processContributions(query, deps(mondayMorning("2026-12-14")));
    await processContributions(query, deps(mondayMorning("2026-12-14")));
    const [item] = stripe.pending();
    expect(stripe.pending()).toHaveLength(1);
    expect(item).toMatchObject({ customer: "cus_1", subscription: "sub_1", amountCents: 28000, currency: "CAD", description: "Higher-rate adjustment for December 3 to January 3, 2027: two missed weeks" });
    expect(await adjustments()).toMatchObject([{ status: "pending", amount_cents: 28000, currency: "CAD", stripe_item: item.id, period_start: "2026-12-03" }]);
    expect(subjects()).toEqual(["Zack didn’t send a report this week", "Your second missed week this month"]);
    expect(sent[1].text).toContain("This is your second missed week this month, so this month is billed at CA$560. The difference of CA$280 will be on your invoice of Sunday, January 3.");
  });

  it("adds nothing more for a third miss in the same period", async () => {
    for (const w of ["2026-12-07", "2026-12-14", "2026-12-21"]) {
      await week(w);
      await processContributions(query, deps(mondayMorning(w)));
    }
    expect(stripe.pending()).toHaveLength(1);
    expect(await adjustments()).toHaveLength(1);
    expect(subjects()).toEqual(["Zack didn’t send a report this week", "Your second missed week this month"]);
  });

  it("treats a miss in the last week of one period and the first of the next as two first misses", async () => {
    await week("2026-12-28");
    await processContributions(query, deps(mondayMorning("2026-12-28")));
    await week("2027-01-04");
    await processContributions(query, deps(mondayMorning("2027-01-04")));
    expect(subjects()).toEqual(["Zack didn’t send a report this week", "Zack didn’t send a report this week"]);
    expect(await adjustments()).toEqual([]);
  });

  it("never counts a week Roger caused: a failed Cora week, or no list because nothing in the pool fit (spec check 25)", async () => {
    await week("2026-12-07", { status: "failed" });
    await week("2026-12-14", { outcome: "none" });
    await processContributions(query, deps(mondayMorning("2026-12-14")));
    expect((await results()).map((r) => r.result)).toEqual(["excused", "excused"]);
    expect(subjects()).toEqual([]);
  });

  it("never counts a week an admin excused, for one user in advance or for everyone (spec check 25)", async () => {
    await excuseWeek(query, deps(mondayMorning("2026-12-07")), { week: "2026-12-07", userId: uid, by: "admin@example.com" });
    await week("2026-12-07");
    await week("2026-12-14");
    await excuseWeek(query, deps(mondayMorning("2026-12-14")), { week: "2026-12-14", userId: null, by: "admin@example.com" });
    await processContributions(query, deps(mondayMorning("2026-12-14")));
    expect((await results()).map((r) => r.result)).toEqual(["excused", "excused"]);
    expect(await adjustments()).toEqual([]);
    expect(await query("select action from admin_actions")).toHaveLength(2);
  });

  it("deletes the item when an admin excuses the second-miss week afterwards", async () => {
    for (const w of ["2026-12-07", "2026-12-14"]) {
      await week(w);
      await processContributions(query, deps(mondayMorning(w)));
    }
    expect(stripe.pending()).toHaveLength(1);
    await excuseWeek(query, deps(new Date("2026-12-15T15:00:00Z")), { week: "2026-12-14", userId: uid, by: "admin@example.com" });
    expect(stripe.pending()).toEqual([]);
    expect(await adjustments()).toMatchObject([{ status: "deleted", deleted_reason: "excused" }]);
    // The excuse sends nothing new: the forgiven email for that month already went.
    expect(subjects()).toEqual(["Zack didn’t send a report this week", "Your second missed week this month"]);
    // A later miss in the same month raises it again, with its own notice.
    await week("2026-12-21");
    await processContributions(query, deps(mondayMorning("2026-12-21")));
    expect(stripe.pending()).toHaveLength(1);
    expect(subjects()).toEqual(["Zack didn’t send a report this week", "Your second missed week this month", "Your second missed week this month"]);
  });

  it("drops a pending adjustment on the next pass when a week was excused without settling it", async () => {
    for (const w of ["2026-12-07", "2026-12-14"]) {
      await week(w);
      await processContributions(query, deps(mondayMorning(w)));
    }
    // A direct excuse (say, a settle that failed half-way) leaves the adjustment pending.
    await query("update contribution_weeks set result = 'excused', excused_by = 'admin@example.com' where week_of = '2026-12-14'");
    await processContributions(query, deps(new Date("2026-12-15T15:00:00Z")));
    expect(stripe.pending()).toEqual([]);
    expect(await adjustments()).toMatchObject([{ status: "deleted", deleted_reason: "excused" }]);
  });

  it("goes on to the next member when one member's settle fails during an excuse for everyone", async () => {
    const [{ id: other }] = await query<{ id: string }>(
      "insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, first_charge_at) values ('bo@example.com', 'active', 'monthly', 'USD', 'share', 'cus_2', 'sub_2', $1) returning id",
      [FIRST],
    );
    await week("2026-12-07");
    let calls = 0;
    const flaky: Query = async (text, params) => {
      if (text.includes("from contribution_weeks where user_id = $1 and period_start") && calls++ === 0) throw new Error("blip");
      return query(text, params);
    };
    expect(await excuseWeek(flaky, deps(mondayMorning("2026-12-07")), { week: "2026-12-07", userId: null, by: "admin@example.com" })).toBe(2);
    expect((await results(other)).map((r) => r.result)).toEqual(["excused"]);
  });

  const setSharingAt = (sharing: string, at: string) =>
    query("insert into zack_settings_history (user_id, sharing, plays_per_week, changed_at) values ($1, $2, 4, $3)", [uid, sharing, at]);

  it("bills a month with sharing off at a cutoff the difference once, labelled, with one notice", async () => {
    await query("update users set sharing = 'match_only'");
    for (const w of ["2026-12-07", "2026-12-14"]) {
      await week(w);
      await processContributions(query, deps(mondayMorning(w)));
    }
    expect((await results()).map((r) => r.result)).toEqual(["by_choice", "by_choice"]);
    expect(await adjustments()).toMatchObject([{ status: "pending", reason: "not_sharing", amount_cents: 20000 }]);
    expect(stripe.pending().map((i) => i.description)).toEqual(["Higher-rate adjustment for December 3 to January 3, 2027: Zack not sharing"]);
    expect(subjects()).toEqual(["This month is billed at the higher rate"]);
  });

  it("bills a week by choice and two misses in the same month exactly one difference", async () => {
    await week("2026-12-07");
    await week("2026-12-14");
    await setSharingAt("off", "2026-12-17T12:00:00Z");
    await week("2026-12-21");
    await processContributions(query, deps(mondayMorning("2026-12-21")));
    expect((await results()).map((r) => r.result)).toEqual(["missed", "missed", "by_choice"]);
    expect(await adjustments()).toMatchObject([{ status: "pending", reason: "not_sharing" }]);
    expect(stripe.pending()).toHaveLength(1);
    expect(stripe.renew("cus_1", "sub_1").lines.map((l) => l.amountCents)).toEqual([20000, 20000]);
  });

  it("owes nothing for sharing switched off and back on between two cutoffs", async () => {
    await setSharingAt("off", "2026-12-08T12:00:00Z");
    await setSharingAt("share", "2026-12-10T12:00:00Z");
    await week("2026-12-14", { run: "accepted" });
    await processContributions(query, deps(mondayMorning("2026-12-14")));
    expect((await results()).map((r) => r.result)).toEqual(["contributed"]);
    expect(await adjustments()).toEqual([]);
  });

  it("owes the month's difference for sharing off at a cutoff, even when sharing is back on afterwards", async () => {
    await setSharingAt("off", "2026-12-12T12:00:00Z");
    await week("2026-12-14");
    await setSharingAt("share", "2026-12-14T15:00:00Z");
    await query("update users set sharing = 'share'");
    for (const w of ["2026-12-21", "2026-12-28"]) await week(w, { run: "accepted" });
    await processContributions(query, deps(mondayMorning("2026-12-28")));
    expect(await adjustments()).toMatchObject([{ status: "pending", reason: "not_sharing" }]);
  });

  it("an excuse that removes the second miss drops a misses-only difference but not one owed for not sharing", async () => {
    for (const w of ["2026-12-07", "2026-12-14"]) {
      await week(w);
      await processContributions(query, deps(mondayMorning(w)));
    }
    await excuseWeek(query, deps(new Date("2026-12-15T15:00:00Z")), { week: "2026-12-14", userId: uid, by: "admin@example.com" });
    expect(await adjustments()).toMatchObject([{ status: "deleted", reason: "two_misses" }]);
    // The same month, but with a cutoff that found sharing off: the excuse leaves it owed.
    await setSharingAt("off", "2026-12-17T12:00:00Z");
    await week("2026-12-21");
    await week("2026-12-28");
    await processContributions(query, deps(mondayMorning("2026-12-28")));
    await excuseWeek(query, deps(new Date("2026-12-29T15:00:00Z")), { week: "2026-12-07", userId: uid, by: "admin@example.com" });
    expect((await adjustments()).map((a) => [a.status, a.reason])).toEqual([
      ["deleted", "two_misses"],
      ["pending", "not_sharing"],
    ]);
  });

  it("adds nothing to a first month already charged at the higher rate up front", async () => {
    await query(
      "insert into pending_adjustments (user_id, period_start, amount_cents, currency, status, reason, invoice_at, create_after) values ($1, '2026-12-03', 20000, 'USD', 'invoiced', 'not_sharing', $2, $2)",
      [uid, FIRST],
    );
    await query("update users set sharing = 'off'");
    for (const w of ["2026-12-07", "2026-12-14", "2026-12-21"]) {
      await week(w);
      await processContributions(query, deps(mondayMorning(w)));
    }
    expect(await adjustments()).toHaveLength(1);
    expect(stripe.items.size).toBe(0);
    expect(subjects()).toEqual([]);
  });

  it("raises the adjustment once when two passes race", async () => {
    await week("2026-12-07");
    await week("2026-12-14");
    await Promise.all([processContributions(query, deps(mondayMorning("2026-12-14"))), processContributions(query, deps(mondayMorning("2026-12-14")))]);
    expect(await adjustments()).toHaveLength(1);
    expect(stripe.items.size).toBe(1);
  });

  it("tries a Stripe item that failed again on the next pass", async () => {
    await week("2026-12-07");
    await week("2026-12-14");
    stripe.failNextCreates(1);
    await processContributions(query, deps(mondayMorning("2026-12-14")));
    expect((await adjustments())[0].stripe_item).toBeNull();
    await processContributions(query, deps(new Date("2026-12-14T13:05:00Z")));
    expect((await adjustments())[0].stripe_item).toBe(stripe.pending()[0].id);
  });
});

describe("final review", () => {
  it("counts only weeks Cora has settled: an unsettled miss beside a settled one raises nothing and sends nothing", async () => {
    await week("2026-12-07");
    await processContributions(query, deps(mondayMorning("2026-12-07")));
    sent = [];
    await week("2026-12-14", { status: "running" });
    await processContributions(query, deps(mondayMorning("2026-12-14")));
    expect(await adjustments()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("sends no forgiven email for a month already billed at the higher rate, and the strip says so", async () => {
    await query(
      "insert into pending_adjustments (user_id, period_start, amount_cents, currency, status, reason, invoice_at, create_after) values ($1, '2026-12-03', 20000, 'USD', 'invoiced', 'not_sharing', $2, $2)",
      [uid, FIRST],
    );
    await week("2026-12-07");
    await processContributions(query, deps(mondayMorning("2026-12-07")));
    expect(subjects()).toEqual([]);
    expect(await contributionStatus(query, uid, settings, mondayMorning("2026-12-07"))).toMatchObject({ alreadyBilled: true });
  });

  it("bills the difference Stripe's prices make (higher minus standard unit amount)", async () => {
    vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
    vi.stubEnv("STRIPE_PRICE_MONTHLY_HIGHER_USD", "price_monthly_higher_usd");
    stripe = fakeAdjustments({ prices: { price_monthly_higher_usd: 39900 } });
    await week("2026-12-07");
    await week("2026-12-14");
    await processContributions(query, deps(mondayMorning("2026-12-14")));
    expect(await adjustments()).toMatchObject([{ amount_cents: 19900 }]);
  });

  it("the send job settles the week only on the run that finds it ready", async () => {
    const { runSendJob } = await import("@/lib/cora/send-job");
    const live = mergeV3([{ key: "v3.cycleLive", value: true }]);
    // A week already marked sent: the send job leaves settling to the hourly pass.
    await week("2026-12-07");
    await runSendJob(query, { settings: live, now: mondayMorning("2026-12-07"), adjust: stripe, query, transport, sleep: async () => {} }, { week: "2026-12-07" });
    expect(subjects()).toEqual([]);
    // A week found ready is settled, then marked sent.
    await week("2026-12-14", { status: "ready" });
    await runSendJob(query, { settings: live, now: mondayMorning("2026-12-14"), adjust: stripe, query, transport, sleep: async () => {} }, { week: "2026-12-14" });
    expect(subjects()).toEqual(["Your second missed week this month"]);
    expect(await query("select status from cora_weeks where week_of = '2026-12-14'")).toEqual([{ status: "sent" }]);
  });
});

describe("the status strip (spec B.9 notices 2 to 4)", () => {
  it("reads this Monday's week whatever month it fell in, words a carried adjustment from its own month, and notes a scheduled cancel", async () => {
    // A member renewing Monday 2027-02-01 at 5:05 AM Toronto: the week missed at Sunday's cutoff is in the month that just ended.
    const [{ id }] = await query<{ id: string }>(
      "insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, first_charge_at, billing_anchor) values ('mo@example.com', 'active', 'monthly', 'USD', 'share', 'cus_2', 'sub_2', '2026-06-01T10:05:00Z', '2026-06-01T10:05:00Z') returning id",
    );
    await week("2027-01-25", { userId: id });
    await week("2027-02-01", { userId: id });
    await processContributions(query, deps(mondayMorning("2027-02-01")));
    const s = await contributionStatus(query, id, settings, mondayMorning("2027-02-01"));
    expect(s).toMatchObject({ missedThisWeek: true, used: 0, missed: 0, periodEnd: "2027-03-01", adjustment: { current: false, periodEnd: "2027-02-01", invoiceDate: "2027-03-01" } });
    // Found after the Monday renewal was drafted: carried to the next invoice, and the notice says so.
    // The month it is owed for has ended: the email names it, as the invoice line does.
    const mail = sent.filter((m) => m.to.includes("mo@example.com")).at(-1)!;
    expect(mail.subject).toBe("Two missed weeks in your last billing month");
    expect(mail.text).toContain("Your billing month to Monday, February 1 had two missed weeks, so it is billed at US$400. The difference of US$200 will be on your invoice of Monday, March 1.");
    expect(stripe.pending("cus_2").map((i) => i.description)).toEqual(["Higher-rate adjustment for January 1 to February 1, 2027: two missed weeks"]);
    await query("update users set cancel_requested_at = now() where id = $1", [id]);
    expect(await contributionStatus(query, id, settings, mondayMorning("2027-02-01"))).toMatchObject({ cancelling: true });
  });

  it("counts the month's forgiven misses and shows an adjustment still to come", async () => {
    expect(await contributionStatus(query, uid, settings, mondayMorning("2026-12-07"))).toMatchObject({ used: 0, allowed: 1, periodEnd: "2027-01-03", adjustment: null });
    await week("2026-12-07");
    await processContributions(query, deps(mondayMorning("2026-12-07")));
    expect(await contributionStatus(query, uid, settings, mondayMorning("2026-12-07"))).toMatchObject({ used: 1, missedThisWeek: true });
    await week("2026-12-14", { run: "accepted" });
    expect(await contributionStatus(query, uid, settings, mondayMorning("2026-12-14"))).toMatchObject({ used: 1, missedThisWeek: false });
    await week("2026-12-21");
    await processContributions(query, deps(mondayMorning("2026-12-21")));
    expect(await contributionStatus(query, uid, settings, mondayMorning("2026-12-21"))).toMatchObject({
      adjustment: { invoiceDate: "2027-01-03", amountCents: 20000, currency: "USD" },
    });
  });
});
