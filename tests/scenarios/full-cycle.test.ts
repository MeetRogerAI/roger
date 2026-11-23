import { beforeEach, describe, expect, it, vi } from "vitest";
import { delivered, newWorld, order, seedPool, sendRun, signUp, toronto, userRow, vercelCron, weeksWithRuns, type CronCall, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * One complete unattended cycle (plan Unit 19; spec B.1 rule 4, B.8, check
 * 12): Zack's runs arrive on Sunday evening, then nothing but Vercel Cron acts.
 * Intake and Cora from 1:00 AM, the charge at 6:00 (a third-list first charge
 * and an order), the send at 7:00, and the hourly pass throughout, each route
 * called at the UTC minutes vercel.json schedules it and gated as the route
 * gates it. Nobody signs in and nobody presses anything.
 */
let w: World;
let trial: Member; // first free list this Monday
let third: Member; // third list: the first charge
let paying: Member; // monthly subscriber
let single: Member; // one at a time, with an order
const WEEK = "2026-12-28";

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 10, playsEach: 4, ranOn: "2026-11-26" });
  await w.at("2026-12-02T16:00:00Z");
  paying = await signUp(w, { email: "pia@example.ca", currency: "CAD", country: "CA" });
  await weeksWithRuns(w, [paying], ["2026-12-07"]);
  await w.at("2026-12-09T16:00:00Z");
  third = await signUp(w, { email: "tess@example.com", currency: "USD", country: "US" });
  single = await signUp(w, { email: "sid@example.ca", currency: "CAD", country: "CA", plan: "per_run" });
  await weeksWithRuns(w, [paying, third, single], ["2026-12-14", "2026-12-21"]);
  await w.at("2026-12-23T16:00:00Z");
  trial = await signUp(w, { email: "tim@example.com", currency: "USD", country: "US" });
  await w.at(toronto("2026-12-26", "11:00"));
  expect(await order(w, single, WEEK)).toEqual({ ok: true });
});

const first = (log: CronCall[], route: CronCall["route"], status: string) => log.find((c) => c.route === route && c.status === status)?.at;

describe("one unattended cycle, Sunday runs to Monday emails", () => {
  it("runs intake, Cora, the charges, the send and the hourly pass on the job clock alone, once each", async () => {
    // Sunday 6:00 PM, each member's own time: Zack sends the week's run.
    await w.at(toronto("2026-12-27", "18:00"));
    for (const m of [trial, third, paying, single]) await sendRun(w, m);
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
    // The send from 7:00 AM: every member delivered and emailed exactly once.
    expect(first(log, "send", "done")).toBe("2026-12-28T12:00:00.000Z");
    for (const m of [trial, third, paying, single]) {
      expect(await delivered(w, m.id, WEEK)).toHaveLength(3);
      const monday = w.mail(m.email).filter((x) => x.subject === "Your list, and your receipt" || x.subject.includes("December 28"));
      expect(monday).toHaveLength(1);
    }
    expect(await w.query(`select status from cora_weeks where week_of = $1`, [WEEK])).toEqual([{ status: "sent" }]);

    // State after the cycle.
    expect(await userRow(w, trial.id)).toMatchObject({ status: "trial", free_lists_used: 1 });
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
    for (const m of [trial, third, paying, single]) expect(w.mail(m.email).filter((x) => x.subject === "Your list, and your receipt" || x.subject.includes("December 28"))).toHaveLength(1);
  });
});

describe("the same cycle in summer time", () => {
  it("starts Cora at 05:00 UTC and sends at 11:00 UTC, the first slots of the wider schedule", async () => {
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
    expect(await delivered(s, m.id, "2027-07-05")).toHaveLength(3);
  });

  // The plan made the job times editable "between 1:00 AM and 11:00 AM" because the routes would run all morning
  // (Key Technical Decisions, "The weekly jobs"), and the settings accept any time in that range
  // (src/lib/v3-settings.ts:28). As built, vercel.json schedules charge only from 10:00 UTC and send from 11:00 UTC,
  // so in summer time a charge time before 6:00 AM or a send time before 7:00 AM is not honoured: the jobs run late,
  // at the first scheduled slot. Nothing is charged twice or early; the setting just does not mean what it says.
  it.fails("honours a 4:00 AM charge time and a 5:00 AM send time in summer", async () => {
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
