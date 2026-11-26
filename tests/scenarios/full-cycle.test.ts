import { beforeEach, describe, expect, it, vi } from "vitest";
import { delivered, firstList, leftoverPerRun, newWorld, order, saveCard, seedPool, sendRun, signUp, toronto, userRow, vercelCron, weeksWithRuns, type CronCall, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * One complete unattended cycle (plan Unit 19; spec B.1 rule 4, B.8, check
 * 12): Zack's runs arrive on Sunday evening, then nothing but Vercel Cron acts.
 * Intake and Cora from 1:00 AM, the charge at 6:00 (a third-list first charge
 * and an order), the send at 7:00, and the hourly pass throughout, each route
 * called at the UTC minutes vercel.json schedules it and gated as the route
 * gates it. Nobody signs in and nobody presses anything.
 *
 * Since plan 2026-11-26-001 the card is asked for at the first list: the new
 * member's first list that Monday is held (a titles-only teaser), and only the
 * card saved afterwards delivers it.
 */
let w: World;
let fresh: Member; // signed up last week, no card: this Monday's first list is held
let third: Member; // third list: the first charge
let paying: Member; // monthly subscriber
let single: Member; // a leftover one-at-a-time account (dormant per-run code), with an order
const WEEK = "2026-12-28";

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 10, playsEach: 4, ranOn: "2026-11-26" });
  await w.at("2026-12-02T16:00:00Z");
  paying = await signUp(w, { email: "pia@example.ca", currency: "CAD", country: "CA" });
  await firstList(w, [paying], "2026-12-07");
  await w.at("2026-12-09T18:00:00Z");
  third = await signUp(w, { email: "tess@example.com", currency: "USD", country: "US" });
  single = await leftoverPerRun(w, { email: "sid@example.ca", currency: "CAD", country: "CA" });
  // December 14: paying's second free list and single's first; third's first list is held until the card on the 16th.
  await weeksWithRuns(w, [paying, third, single], ["2026-12-14"]);
  await w.at(toronto("2026-12-16", "12:00"));
  await saveCard(w, third);
  await weeksWithRuns(w, [paying, third, single], ["2026-12-21"]);
  await w.at("2026-12-23T16:00:00Z");
  fresh = await signUp(w, { email: "tim@example.com", currency: "USD", country: "US" });
  await w.at(toronto("2026-12-26", "11:00"));
  expect(await order(w, single, WEEK)).toEqual({ ok: true });
});

const first = (log: CronCall[], route: CronCall["route"], status: string) => log.find((c) => c.route === route && c.status === status)?.at;

describe("one unattended cycle, Sunday runs to Monday emails", () => {
  it("runs intake, Cora, the charges, the send and the hourly pass on the job clock alone, once each", async () => {
    // Sunday 6:00 PM, each member's own time: Zack sends the week's run.
    await w.at(toronto("2026-12-27", "18:00"));
    for (const m of [fresh, third, paying, single]) await sendRun(w, m);
    const sentBefore = w.sent.length;

    const log = await vercelCron(w, toronto(WEEK, "12:30"));

    // Cora starts at 1:00 AM Toronto (06:00 UTC in winter) and is ready in that run, well before the charge.
    expect(log.filter((c) => c.route === "cora")[0]).toMatchObject({ at: "2026-12-28T06:00:00.000Z" });
    expect(first(log, "cora", "ready")).toBe("2026-12-28T06:00:00.000Z");
    const picks = await w.query<{ user_id: string; n: number }>(`select user_id, count(*)::int as n from picks where week_of = $1 group by user_id`, [WEEK]);
    expect(picks.map((p) => p.n)).toEqual([3, 3, 3, 3]);
    // Before 6:00 AM the charge route either is not scheduled or skips; from 6:00 it charges, once.
    expect(log.filter((c) => c.route === "charge" && c.at < "2026-12-28T11:00:00.000Z").every((c) => c.status === "skipped")).toBe(true);
    expect(first(log, "charge", "done")).toBe("2026-12-28T11:00:00.000Z");
    const charged = log.filter((c) => c.route === "charge" && c.status === "done").map((c) => c.result as { first?: { charged: number }; orders?: { charged: number } });
    expect(charged.reduce((n, r) => n + (r.first?.charged ?? 0), 0)).toBe(1);
    expect(charged.reduce((n, r) => n + (r.orders?.charged ?? 0), 0)).toBe(1);
    expect(w.stripe.callsTo("subscriptions.create").filter((c) => c.args.customer === third.customer)).toHaveLength(1);
    // The send from 7:00 AM: every member with a card delivered and emailed exactly once; the new member's list is
    // held, with one titles-only teaser and nothing delivered.
    expect(first(log, "send", "done")).toBe("2026-12-28T12:00:00.000Z");
    // This Monday's list email (or the teaser, which names no week), counted from the Sunday runs on.
    const mondayMail = (m: Member) =>
      w.sent.slice(sentBefore).filter((x) => x.to === m.email && (x.subject === "Your list, and your receipt" || x.subject.includes("December 28") || x.subject === "Your first 3 ideas are ready"));
    for (const m of [third, paying, single]) {
      expect(await delivered(w, m.id, WEEK)).toHaveLength(3);
      expect(mondayMail(m)).toHaveLength(1);
    }
    expect(await delivered(w, fresh.id, WEEK)).toEqual([]);
    expect(mondayMail(fresh).map((x) => x.subject)).toEqual(["Your first 3 ideas are ready"]);
    expect(await w.query(`select status from cora_weeks where week_of = $1`, [WEEK])).toEqual([{ status: "sent" }]);

    // State after the cycle.
    expect(await userRow(w, fresh.id)).toMatchObject({ status: "trial", free_lists_used: 0 });
    expect(await userRow(w, third.id)).toMatchObject({ status: "active", free_lists_used: 2 });
    expect(await userRow(w, single.id)).toMatchObject({ status: "active", plan: "per_run" });
    expect(await w.query(`select status from orders where user_id = $1 and week_of = $2`, [single.id, WEEK])).toEqual([{ status: "sent" }]);

    // No hourly task failed, and no admin was alerted.
    const errors = log.filter((c) => c.route === "housekeeping").flatMap((c) => Object.entries(c.result as Record<string, unknown>).filter(([, v]) => typeof (v as { error?: unknown } | null)?.error === "string"));
    expect(errors).toEqual([]);
    expect(w.sent.slice(sentBefore).filter((x) => x.subject.startsWith("[Roger]"))).toEqual([]);
    // Running the morning again changes nothing (spec check 16 for the whole chain).
    const again = await vercelCron(w, toronto(WEEK, "13:30"));
    expect(again.filter((c) => c.route === "cora").every((c) => c.status === "sent")).toBe(true);
    expect(w.stripe.callsTo("subscriptions.create")).toHaveLength(2);
    for (const m of [fresh, third, paying, single]) expect(mondayMail(m)).toHaveLength(1);

    // Wednesday: the new member adds a card; the held list is delivered then, as free list 1 of 2, with its list email.
    await w.at(toronto("2026-12-30", "12:00"));
    await saveCard(w, fresh);
    expect(await delivered(w, fresh.id, WEEK)).toHaveLength(3);
    expect(await userRow(w, fresh.id)).toMatchObject({ status: "trial", free_lists_used: 1 });
    expect(w.mail(fresh.email).find((x) => x.subject.includes("December 28"))!.text).toContain("Free list 1 of 2.");
  });
});

describe("the same cycle in summer time", () => {
  it("starts Cora at 05:00 UTC (1:00 AM EDT), charges at 10:00 and sends at 11:00 UTC, each at its own time", async () => {
    const s = await newWorld({ start: "2027-06-28T15:00:00Z" });
    await seedPool(s, { contributors: 3, playsEach: 3, ranOn: "2027-06-24" });
    await s.at("2027-06-30T16:00:00Z");
    const m = await signUp(s, { email: "suri@example.com", currency: "USD", country: "US" });
    await s.at(toronto("2027-07-04", "18:00"));
    await sendRun(s, m);
    const log = await vercelCron(s, toronto("2027-07-05", "12:30"));
    expect(first(log, "cora", "ready")).toBe("2027-07-05T05:00:00.000Z");
    expect(first(log, "charge", "done")).toBe("2027-07-05T10:00:00.000Z");
    expect(first(log, "send", "done")).toBe("2027-07-05T11:00:00.000Z");
    // A new member with no card: the first list is held at the send (the teaser), not delivered.
    expect(await delivered(s, m.id, "2027-07-05")).toEqual([]);
    expect(s.subjects(m.email)).toContain("Your first 3 ideas are ready");
    expect((await s.query<{ at: string }>(`select first_teaser_at::text as at from users where id = $1`, [m.id]))[0].at).not.toBeNull();
  });

  // The settings accept job times from 1:00 AM (src/lib/v3-settings.ts), so every route runs all Monday morning: since
  // PR #42 charge and send run from 05:00 UTC like Cora (a known failure in the first pass, when they began at 10:00 and
  // 11:00). The schedules are read from vercel.json, so this test follows the file as shipped.
  it("honours a 4:00 AM charge time and a 5:00 AM send time in summer", async () => {
    const s = await newWorld({ start: "2027-06-28T15:00:00Z", settings: [{ key: "v3.chargeAt", value: "04:00" }, { key: "v3.sendAt", value: "05:00" }] });
    await seedPool(s, { contributors: 3, playsEach: 3, ranOn: "2027-06-24" });
    await s.at("2027-06-30T16:00:00Z");
    const m = await signUp(s, { email: "suri@example.com", currency: "USD", country: "US" });
    await s.at(toronto("2027-07-04", "18:00"));
    await sendRun(s, m);
    const log = await vercelCron(s, toronto("2027-07-05", "12:30"));
    expect(first(log, "charge", "done")).toBe("2027-07-05T08:00:00.000Z");
    expect(first(log, "send", "done")).toBe("2027-07-05T09:00:00.000Z");
  });
});
