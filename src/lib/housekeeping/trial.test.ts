import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { sendHeldTeaser, sendUnsentTeasers } from "@/lib/cora/send-job";
import { completeCardSetup } from "@/lib/billing/card-setup";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import { torontoDate } from "@/lib/clock";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { HOURLY_TASKS, runHourly } from "./job";
import { closeMoment, closeNoCardTrials, closeTrialsWithNoList, MAX_SENDS, noCardClocks, sendHeldReminders, sendTrialNudges, sendUploadReminders, trialClocks } from "./trial";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
let failNext = 0;
const transport: Transport = async (m) => {
  if (failNext > 0) {
    failNext--;
    return { ok: false, error: "down", retryable: false };
  }
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
/** Tuesday 2026-12-01, 10:00 AM Toronto. */
const START = Date.parse("2026-12-01T15:00:00Z");
const day = (n: number, hours = 0) => new Date(START + n * 86_400_000 + hours * 3_600_000);
const deps = (now: Date) => ({ settings, now, query, transport, sleep: async () => {} });
/**
 * Every hourly pass from one moment to another, nudges then the close (as the hourly pass orders them). These
 * tests have no trial waiting for a card, so the nudges are handed an empty no-card clock list (as the hourly
 * pass hands them its shared read) instead of reading it on each of hundreds of passes.
 */
async function passes(from: Date, to: Date) {
  for (let t = from.getTime(); t <= to.getTime(); t += 3_600_000) {
    await sendTrialNudges(query, { ...deps(new Date(t)), noCard: async () => [] });
    await closeTrialsWithNoList(query, deps(new Date(t)));
  }
}

async function user(email: string, cols: Record<string, unknown> = {}): Promise<string> {
  const c = { status: "trial", plan: "monthly", currency: "USD", trial_started_at: new Date(START).toISOString(), stripe_customer: `cus_${email}`, ...cols };
  const keys = Object.keys(c);
  const [{ id }] = await query<{ id: string }>(
    `insert into users (email, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [email, ...Object.values(c)],
  );
  return id;
}
async function pick(userId: string, week: string, delivered: boolean) {
  const [{ id }] = await query<{ id: string }>(
    "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('P', 'Marketing', 'd', 'p', 'i', '2026-11-30', '2026-11-30') returning id",
  );
  await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, delivered_at) values ($1, $2, 1, $3, 50, 50, 'r', $4)", [
    userId,
    week,
    id,
    delivered ? day(20).toISOString() : null,
  ]);
}
const subjects = () => sent.map((m) => m.subject);
/** For tests that walk every hourly pass over weeks (slow on PGlite when the whole suite runs at once). */
const LONG = 90_000;
const status = async (id: string) => (await query<{ status: string }>("select status from users where id = $1", [id]))[0].status;

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  failNext = 0;
});

describe("the trial with no first list (spec check 23)", () => {
  it("nudges on days 3, 10 and 17, once each, and closes on day 21 with no charge and one email", async () => {
    const id = await user("ana@example.com");
    await passes(day(0), day(2, 23));
    expect(sent).toEqual([]);
    await passes(day(3), day(9, 23));
    expect(subjects()).toEqual(["Zack hasn’t sent a report yet"]);
    await passes(day(10), day(16, 23));
    await passes(day(17), day(20, 23));
    expect(subjects()).toEqual(["Zack hasn’t sent a report yet", "Zack hasn’t sent a report yet", "Your Roger trial closes soon"]);
    expect(await status(id)).toBe("trial");
    await passes(day(21), day(23));
    expect(await status(id)).toBe("closed");
    expect(subjects().slice(3)).toEqual(["Your Roger trial has closed"]);
    expect(sent.at(-1)!.text).toContain("Nothing was charged");
    expect(await query("select 1 from charge_attempts")).toEqual([]);
    const [u] = await query<{ closed_reason: string; ended: boolean }>("select closed_reason, access_ends_at is not null as ended from users");
    expect(u).toEqual({ closed_reason: "no_first_list", ended: true });
  });

  it("sends only the latest nudge reached when a pass comes late", async () => {
    await user("ana@example.com");
    await sendTrialNudges(query, deps(day(11)));
    expect(sent.map((m) => m.text.includes("December 22"))).toEqual([true]);
    expect(await query("select ref from notifications where kind = 'zack_not_yet'")).toEqual([{ ref: `${new Date(START).toISOString()}:10` }]);
  });

  it("does not nudge a member whose Zack has sent a run", async () => {
    const id = await user("ana@example.com");
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-12-07', 'connector', 'hark', 'share', 'x')", [id]);
    await passes(day(3), day(3, 2));
    expect(sent).toEqual([]);
  });

  it("stops the close when the first list is delivered on day 20", async () => {
    const id = await user("ana@example.com");
    await pick(id, "2026-12-21", true);
    await query("update users set free_lists_used = 1 where id = $1", [id]);
    await passes(day(21), day(22));
    expect(await status(id)).toBe("trial");
    expect(subjects()).not.toContain("Your Roger trial has closed");
  });

  it("does not close while a picked list is on its way", async () => {
    const id = await user("ana@example.com");
    await pick(id, "2026-12-21", false);
    // Day 21 is Tuesday 2026-12-22; the list for Monday 2026-12-21 waits for a held send.
    await closeTrialsWithNoList(query, deps(day(21, 1)));
    expect(await status(id)).toBe("trial");
  });

  it("does not count a week with no eligible plays for the member", async () => {
    const id = await user("ana@example.com");
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2026-12-14', 'none')", [id]);
    await closeTrialsWithNoList(query, deps(day(21, 1)));
    expect(await status(id)).toBe("trial");
    await closeTrialsWithNoList(query, deps(day(28, 1)));
    expect(await status(id)).toBe("closed");
  });

  it("does not count a week Cora failed, and ignores a dry run's failure", async () => {
    const id = await user("ana@example.com");
    await query("insert into cora_weeks (week_of, status) values ('2026-12-07', 'failed')");
    const [t] = await trialClocks(query, settings, day(21));
    expect(t.closesAt).toEqual(day(28));
    await query("update cora_weeks set dry_run = true");
    const [again] = await trialClocks(query, settings, day(21));
    expect(again.closesAt).toEqual(day(21));
    expect(again.id).toBe(id);
  });

  it("leaves out members mid-switch from one at a time, and trials past their free lists", async () => {
    await user("switching@example.com", { switched_from_per_run_at: day(-30).toISOString(), free_lists_used: 2 });
    await user("switching2@example.com", { switched_from_per_run_at: day(-30).toISOString() });
    await user("paid-up@example.com", { free_lists_used: 2 });
    await passes(day(3), day(3));
    await passes(day(21), day(21));
    expect(sent).toEqual([]);
    expect(await query("select status from users where status <> 'trial'")).toEqual([]);
  });

  it("starts the clock when the cycle went live, if that was after the card", async () => {
    await user("ana@example.com");
    await query("insert into settings (key, value, updated_at) values ('v3.cycleLive', 'true'::jsonb, $1)", [day(5).toISOString()]);
    const [t] = await trialClocks(query, settings, day(10));
    expect(t.start).toEqual(day(5));
    expect(t.closesAt).toEqual(day(26));
  });

  it("tries the closing email again on the next pass when it failed", async () => {
    await user("ana@example.com", { trial_started_at: day(-30).toISOString() });
    failNext = 1;
    await closeTrialsWithNoList(query, deps(day(0)));
    expect(sent).toEqual([]);
    await closeTrialsWithNoList(query, deps(day(0, 1)));
    await closeTrialsWithNoList(query, deps(day(0, 2)));
    expect(subjects()).toEqual(["Your Roger trial has closed"]);
  });

  it("never closes while a charge is in flight, and cancels an open order when it closes", async () => {
    const id = await user("ana@example.com", { plan: "per_run" });
    await query("insert into orders (user_id, week_of) values ($1, '2026-12-28')", [id]);
    await query("insert into charge_attempts (user_id, purpose, week_of, outcome) values ($1, 'order', '2026-12-28', 'claimed')", [id]);
    await closeTrialsWithNoList(query, deps(day(21, 1)));
    expect(await status(id)).toBe("trial");
    await query("update charge_attempts set outcome = 'error'");
    await closeTrialsWithNoList(query, deps(day(21, 2)));
    expect(await status(id)).toBe("closed");
    expect(await query("select status from orders")).toEqual([{ status: "cancelled" }]);
  });
});

describe("the review's cases", () => {
  it("does not close on Sunday evening when the run for Monday has arrived, and the list then goes out", async () => {
    // Day 21 falls at 10:00 PM Sunday 2026-12-13 (Toronto); the run arrived at 8:00 PM.
    const id = await user("ana@example.com", { trial_started_at: "2026-11-23T03:00:00Z" });
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, '2026-12-14', 'connector', 'hark', 'share', 'x', 'accepted')", [id]);
    await closeTrialsWithNoList(query, deps(new Date("2026-12-14T03:30:00Z")));
    expect(await status(id)).toBe("trial");
    // Monday early, Cora is working on the week: still waiting.
    await query("insert into cora_weeks (week_of, status) values ('2026-12-14', 'ready')");
    await closeTrialsWithNoList(query, deps(new Date("2026-12-14T10:00:00Z")));
    expect(await status(id)).toBe("trial");
    // Monday 7:00 AM: the list is delivered and counted.
    await pick(id, "2026-12-14", true);
    await query("update users set free_lists_used = 1");
    await query("update cora_weeks set status = 'sent'");
    await query("insert into cora_user_weeks (user_id, week_of, outcome, delivered_at) values ($1, '2026-12-14', 'picked', now())", [id]);
    await closeTrialsWithNoList(query, deps(new Date("2026-12-14T13:00:00Z")));
    expect(await status(id)).toBe("trial");
  });

  it("closes once the week with the run is finished and gave no list for the member's own reasons", async () => {
    const id = await user("ana@example.com", { trial_started_at: "2026-11-23T03:00:00Z" });
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, '2026-12-14', 'connector', 'hark', 'share', 'x', 'rejected')", [id]);
    await query("insert into cora_weeks (week_of, status) values ('2026-12-14', 'sent')");
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2026-12-14', 'not_eligible')", [id]);
    await closeTrialsWithNoList(query, deps(new Date("2026-12-14T15:00:00Z")));
    expect(await status(id)).toBe("closed");
  });

  it("counts a week picked but never delivered after its send as Roger's, and leaves sponsored members out", async () => {
    const id = await user("ana@example.com");
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2026-12-14', 'picked')", [id]);
    const [t] = await trialClocks(query, settings, day(21));
    expect(t.closesAt).toEqual(day(28));
    await query("update users set sponsor_id = gen_random_uuid()");
    expect(await trialClocks(query, settings, day(21))).toEqual([]);
  });

  it("keeps the close and the nudge keys where they were when the cycle is switched off and on again", async () => {
    await user("ana@example.com");
    await query("insert into settings (key, value) values ('v3.cycleLiveSince', to_jsonb($1::timestamptz))", [day(5).toISOString()]);
    await query("insert into settings (key, value, updated_at) values ('v3.cycleLive', 'true'::jsonb, $1)", [day(5).toISOString()]);
    const [before] = await trialClocks(query, settings, day(10));
    // Off and on again on day 9: the setting's save time moves, the first go-live does not.
    await query("update settings set updated_at = $1 where key = 'v3.cycleLive'", [day(9).toISOString()]);
    const [after] = await trialClocks(query, settings, day(10));
    expect(after.closesAt).toEqual(before.closesAt);
    expect(after.closesAt).toEqual(day(26));
    await sendTrialNudges(query, deps(day(8, 1)));
    expect(await query("select ref from notifications where kind = 'zack_not_yet'")).toEqual([{ ref: `${new Date(START).toISOString()}:3` }]);
  });

  it("sends at most 50 nudges a pass and the rest on the next", async () => {
    for (let i = 0; i < 51; i++) await user(`m${i}@example.com`);
    expect(await sendTrialNudges(query, deps(day(3)))).toBe(50);
    expect(await sendTrialNudges(query, deps(day(3, 1)))).toBe(1);
    expect(sent).toHaveLength(51);
  });

  it("stops at the pass's deadline", async () => {
    await user("ana@example.com");
    expect(await sendTrialNudges(query, { ...deps(day(3)), deadline: Date.now() - 1 })).toBe(0);
  });

  it("tries the closing email again the next day after three failed attempts", async () => {
    await user("ana@example.com", { trial_started_at: day(-30).toISOString() });
    failNext = 3;
    for (let h = 0; h < 4; h++) await closeTrialsWithNoList(query, deps(day(0, h)));
    expect(sent).toEqual([]);
    await closeTrialsWithNoList(query, deps(day(1)));
    await closeTrialsWithNoList(query, deps(day(2)));
    expect(subjects()).toEqual(["Your Roger trial has closed"]);
  });
});

describe("no-card trials (plan 2026-11-26-001, Unit 7; origin R11)", () => {
  /** The first teaser: Monday 2026-12-07, 7:05 AM Toronto. */
  const T = Date.parse("2026-12-07T12:05:00Z");
  const at = (days: number, hours = 0) => new Date(T + days * 86_400_000 + hours * 3_600_000);
  const TITLES = ["Inbox triage", "Listing post", "Calendar prep"];
  const REASON = "Secret reason for the member.";

  /** A trial with no card (sign-up ends without one), consented a week before the first teaser. */
  async function noCard(email: string, cols: Record<string, unknown> = {}) {
    return user(email, { trial_started_at: null, stripe_customer: null, consent_at: at(-7).toISOString(), first_teaser_at: new Date(T).toISOString(), ...cols });
  }
  /** A held week: Cora's week sent, the member's week picked and not delivered. */
  async function heldWeek(userId: string, week: string, o: { superseded?: Date; titles?: string[] } = {}) {
    await query("insert into cora_weeks (week_of, status) values ($1, 'sent') on conflict (week_of) do nothing", [week]);
    await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count, superseded_at) values ($1, $2, 'picked', 3, $3)", [userId, week, o.superseded?.toISOString() ?? null]);
    const titles = o.titles ?? TITLES;
    for (let i = 0; i < titles.length; i++) {
      const [{ id }] = await query<{ id: string }>(
        "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ($1, 'Sales', 'Secret description.', '1. Secret step.', 'Secret install.', $2, $2) returning id",
        [titles[i], week],
      );
      await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, $5)", [userId, week, i + 1, id, REASON]);
    }
  }
  /** Every hourly pass from one moment to another, in the hourly job's order. */
  async function noCardPasses(from: Date, to: Date, stepHours = 1) {
    for (let t = from.getTime(); t <= to.getTime(); t += stepHours * 3_600_000) await pass(new Date(t));
  }
  async function pass(now: Date) {
    await sendTrialNudges(query, deps(now));
    await closeTrialsWithNoList(query, deps(now));
    await sendHeldReminders(query, deps(now));
    await closeNoCardTrials(query, deps(now));
  }
  const userRow = async (id: string) =>
    (await query<{ status: string; closed_reason: string | null; access_ends_at: Date | null }>("select status, closed_reason, access_ends_at from users where id = $1", [id]))[0];
  const waiting = () => sent.filter((m) => m.subject === "Your ideas are waiting");
  const closings = () => sent.filter((m) => m.subject === "Your Roger trial has closed");

  it("reminds on days 2 and 7 after the first teaser, once each, titles only, and closes on day 14 with one email", async () => {
    const id = await noCard("ana@example.com");
    await heldWeek(id, "2026-12-07");
    await noCardPasses(at(0), at(1, 23));
    expect(sent).toEqual([]);
    await noCardPasses(at(2), at(6, 23));
    expect(subjects()).toEqual(["Your ideas are waiting"]);
    await noCardPasses(at(7), at(13, 23));
    expect(subjects()).toEqual(["Your ideas are waiting", "Your ideas are waiting"]);
    expect((await userRow(id)).status).toBe("trial");
    const [m] = waiting();
    expect(m.text).toContain("1. Inbox triage");
    expect(m.text).toContain("/start/payment");
    expect(m.text).toContain("Monday, December 21");
    expect(m.text).not.toContain(REASON);
    expect(m.text).not.toMatch(/Secret/);
    expect(await query("select ref from notifications where kind = 'held_reminder' order by ref")).toEqual([
      { ref: `${new Date(T).toISOString()}:2` },
      { ref: `${new Date(T).toISOString()}:7` },
    ]);
    await noCardPasses(at(14), at(16));
    expect(await userRow(id)).toEqual({ status: "closed", closed_reason: "no_card", access_ends_at: at(14) });
    expect(subjects().slice(2)).toEqual(["Your Roger trial has closed"]);
    expect(closings()[0].text).toContain("no card was added");
    expect(closings()[0].text).toContain("Want to come back? Write to us");
    expect(await query("select 1 from charge_attempts")).toEqual([]);
  }, LONG);

  it("sends only the latest reminder reached when a pass comes late", async () => {
    const id = await noCard("ana@example.com");
    await heldWeek(id, "2026-12-07");
    expect(await sendHeldReminders(query, deps(at(8)))).toBe(1);
    expect(await query("select ref from notifications where kind = 'held_reminder'")).toEqual([{ ref: `${new Date(T).toISOString()}:7` }]);
  });

  it("moves the close a week for a Monday Cora failed or with no eligible plays, not a dry run's failure", async () => {
    const id = await noCard("ana@example.com");
    await heldWeek(id, "2026-12-07");
    await query("insert into cora_weeks (week_of, status) values ('2026-12-14', 'failed')");
    expect((await noCardClocks(query, settings, at(15)))[0].closesAt).toEqual(at(21));
    await closeNoCardTrials(query, deps(at(20, 23)));
    expect((await userRow(id)).status).toBe("trial");
    // A member week with no eligible plays inside the moved window moves it again.
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2026-12-21', 'none')", [id]);
    expect((await noCardClocks(query, settings, at(15)))[0].closesAt).toEqual(at(28));
    await query("update cora_weeks set dry_run = true where week_of = '2026-12-14'");
    await query("update cora_user_weeks set outcome = 'not_eligible' where week_of = '2026-12-21'");
    expect((await noCardClocks(query, settings, at(15)))[0].closesAt).toEqual(at(14));
    await closeNoCardTrials(query, deps(at(15)));
    expect(await userRow(id)).toEqual({ status: "closed", closed_reason: "no_card", access_ends_at: at(15) });
  });

  it("three teasered Mondays with no card still close at the first teaser + 14 days: held lists never extend it", async () => {
    const id = await noCard("ana@example.com");
    await heldWeek(id, "2026-12-07", { superseded: at(6, 18) });
    await heldWeek(id, "2026-12-14", { superseded: at(13, 18), titles: ["Expense log", "Follow-up drafts", "Open house notes"] });
    await heldWeek(id, "2026-12-21", { titles: ["Week three A", "Week three B", "Week three C"] });
    const [c] = await noCardClocks(query, settings, at(14));
    expect(c.closesAt).toEqual(at(14));
    // The card-saved rule would count both undelivered weeks as Roger's: this clock must not.
    await closeNoCardTrials(query, deps(at(13, 23)));
    expect((await userRow(id)).status).toBe("trial");
    await closeNoCardTrials(query, deps(at(14)));
    expect((await userRow(id)).status).toBe("closed");
  });

  it("a second teaser (the held list replaced) does not restart the clock, and the day-7 reminder shows the newest titles", async () => {
    const id = await noCard("ana@example.com");
    await heldWeek(id, "2026-12-07");
    await noCardPasses(at(2), at(2));
    // Monday 2026-12-14: the newer week becomes ready (the older one superseded), and its teaser is sent.
    await heldWeek(id, "2026-12-14", { titles: ["Expense log", "Follow-up drafts", "Open house notes"] });
    await query("update cora_user_weeks set superseded_at = $1 where week_of = '2026-12-07'", [at(6, 18).toISOString()]);
    expect(await sendHeldTeaser(query, deps(at(7)), id, "2026-12-14")).toBe("sent");
    expect((await query<{ t: Date }>("select first_teaser_at as t from users where id = $1", [id]))[0].t).toEqual(new Date(T));
    await noCardPasses(at(7, 1), at(7, 1));
    expect(waiting()).toHaveLength(2);
    expect(waiting()[1].text).toContain("1. Expense log");
    expect(waiting()[1].text).not.toContain("Inbox triage");
    expect((await noCardClocks(query, settings, at(8)))[0].closesAt).toEqual(at(14));
  });

  it("a card saved on day 10 stops the reminders and the close", async () => {
    const id = await noCard("ana@example.com");
    await heldWeek(id, "2026-12-07");
    await noCardPasses(at(0), at(10), 3);
    expect(waiting()).toHaveLength(2);
    // The card is saved and the held list unlocked (Unit 5).
    await query("update users set trial_started_at = $2, stripe_customer = 'cus_ana', free_lists_used = 1 where id = $1", [id, at(10).toISOString()]);
    await query("update picks set delivered_at = $1", [at(10).toISOString()]);
    await query("update cora_user_weeks set delivered_at = $1", [at(10).toISOString()]);
    const before = sent.length;
    await noCardPasses(at(10, 1), at(25), 3);
    expect(sent.length).toBe(before);
    expect(await userRow(id)).toEqual({ status: "trial", closed_reason: null, access_ends_at: null });
    expect(await noCardClocks(query, settings, at(20))).toEqual([]);
  }, LONG);

  it("never connected Zack: nudges at consent + 3, 10 and 17 days and a close at consent + 21, no held reminders", async () => {
    const id = await noCard("ana@example.com", { consent_at: new Date(START).toISOString(), first_teaser_at: null });
    await noCardPasses(day(0), day(23), 3);
    expect(subjects()).toEqual(["Zack hasn’t sent a report yet", "Zack hasn’t sent a report yet", "Your Roger trial closes soon", "Your Roger trial has closed"]);
    expect(await query("select ref from notifications where kind = 'zack_not_yet' order by ref")).toEqual(
      [10, 17, 3].map((n) => ({ ref: `${new Date(START).toISOString()}:${n}` })),
    );
    expect(await userRow(id)).toEqual({ status: "closed", closed_reason: "no_first_list", access_ends_at: day(21) });
    expect(closings()[0].text).toContain("21 days");
    expect(waiting()).toEqual([]);
  }, LONG);

  it("never teasered: a run waiting on Cora holds the close; a member with a run gets no Zack nudges", async () => {
    // Day 21 from consent is Monday 2026-12-14, 10:00 AM Toronto; the run for that Monday has arrived and Cora is working on it.
    const consent = new Date("2026-11-23T15:00:00Z");
    const id = await noCard("ana@example.com", { consent_at: consent.toISOString(), first_teaser_at: null });
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, '2026-12-14', 'connector', 'hark', 'share', 'x', 'accepted')", [id]);
    await sendTrialNudges(query, deps(new Date(consent.getTime() + 3 * 86_400_000)));
    expect(sent).toEqual([]);
    const monday = new Date("2026-12-14T15:00:00Z");
    await query("insert into cora_weeks (week_of, status) values ('2026-12-14', 'running')");
    await closeNoCardTrials(query, deps(monday));
    expect((await userRow(id)).status).toBe("trial");
    // The week finished with nothing for the member: the close goes ahead.
    await query("update cora_weeks set status = 'sent'");
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2026-12-14', 'not_eligible')", [id]);
    await closeNoCardTrials(query, deps(new Date(monday.getTime() + 3_600_000)));
    expect((await userRow(id)).closed_reason).toBe("no_first_list");
  });

  it("tries the closing email again when it failed; the account stays closed and one email goes in the end", async () => {
    const id = await noCard("ana@example.com");
    await heldWeek(id, "2026-12-07");
    await sendHeldReminders(query, deps(at(7)));
    sent = [];
    failNext = 1;
    await closeNoCardTrials(query, deps(at(14)));
    expect(sent).toEqual([]);
    expect((await userRow(id)).status).toBe("closed");
    await closeNoCardTrials(query, deps(at(14, 1)));
    // The card-saved close's pass runs the same email sweep: nothing more.
    await closeTrialsWithNoList(query, deps(at(14, 2)));
    await closeNoCardTrials(query, deps(at(15)));
    expect(subjects()).toEqual(["Your Roger trial has closed"]);
    expect((await userRow(id)).access_ends_at).toEqual(at(14));
  });

  it("two hourly passes at once: one reminder, one close and one closing email", async () => {
    const id = await noCard("ana@example.com");
    await heldWeek(id, "2026-12-07");
    await Promise.all([pass(at(2)), pass(at(2))]);
    expect(waiting()).toHaveLength(1);
    const closes = await Promise.all([closeNoCardTrials(query, deps(at(14))), closeNoCardTrials(query, deps(at(14)))]);
    expect(closes.reduce((a, b) => a + b, 0)).toBe(1);
    await Promise.all([pass(at(14, 1)), pass(at(14, 1))]);
    expect(closings()).toHaveLength(1);
    expect((await userRow(id)).status).toBe("closed");
  });

  it("never reminds or closes a sponsored member with no card", async () => {
    const id = await noCard("ana@example.com", { sponsor_id: "00000000-0000-4000-8000-000000000001" });
    await heldWeek(id, "2026-12-07");
    await noCardPasses(at(0), at(30), 6);
    expect(sent).toEqual([]);
    expect((await userRow(id)).status).toBe("trial");
    expect(await noCardClocks(query, settings, at(30))).toEqual([]);
  }, LONG);

  it("leaves the card-saved clocks as they were: a carded trial is on ON_CLOCK only, a no-card trial only on its own", async () => {
    const carded = await user("carded@example.com", { consent_at: day(-1).toISOString(), first_teaser_at: day(-1).toISOString() });
    const waitingForCard = await noCard("nocard@example.com");
    const clocks = await trialClocks(query, settings, day(10));
    expect(clocks.map((c) => [c.id, c.start, c.closesAt])).toEqual([[carded, day(0), day(21)]]);
    expect((await noCardClocks(query, settings, day(10))).map((c) => c.id)).toEqual([waitingForCard]);
  });

  it("is registered in the hourly pass after the card-saved closes", () => {
    const names = HOURLY_TASKS.map((t) => t.name);
    expect(names.indexOf("held_reminders")).toBeGreaterThan(names.indexOf("trial_no_list_close"));
    expect(names.indexOf("no_card_close")).toBeGreaterThan(names.indexOf("held_reminders"));
  });

  describe("review fixes (Unit 7)", () => {
    const tick = (d: Date, ms = -1) => new Date(d.getTime() + ms);
    const notes = (kind: string) => query<{ ref: string; status: string }>("select ref, status from notifications where kind = $1 order by ref", [kind]);
    const row = async (id: string) =>
      (
        await query<{ status: string; closed_reason: string | null; access_ends_at: Date | null; trial_started_at: Date | null; setup_session: string | null }>(
          "select status, closed_reason, access_ends_at, trial_started_at, setup_session from users where id = $1",
          [id],
        )
      )[0];
    const deliveredCount = async (id: string) => (await query("select 1 from picks where user_id = $1 and delivered_at is not null", [id])).length;
    /** The Payment page's stored embedded session (Unit 4), on the member's own customer. */
    async function storedSession(gw: ReturnType<typeof fakeGateway>, id: string) {
      const s = await gw.createEmbeddedSetupSession({ userId: id, customer: "cus_ana", currency: "USD", returnUrl: "https://roger.test/start/payment/done" });
      await query("update users set setup_session = $2 where id = $1", [id, s.id]);
      return s.id;
    }
    const completeOpts = (now: Date) => ({ getSettings: async () => settings, now, query, transport, sleep: async () => {} });

    describe("F1: a card confirmed in Stripe around the close", () => {
      it("a stored session already confirmed is completed instead of closed: card saved, list unlocked, no closing email", async () => {
        const gw = fakeGateway();
        const id = await noCard("ana@example.com", { stripe_customer: "cus_ana" });
        await heldWeek(id, "2026-12-07");
        gw.complete(await storedSession(gw, id));
        expect(await closeNoCardTrials(query, { ...deps(at(14)), card: gw })).toBe(0);
        expect(await row(id)).toMatchObject({ status: "trial", closed_reason: null, trial_started_at: at(14) });
        expect(await deliveredCount(id)).toBe(3);
        expect(closings()).toEqual([]);
        expect(await noCardClocks(query, settings, at(15))).toEqual([]);
      });

      it("an open stored session is expired in Stripe and cleared after the close", async () => {
        const gw = fakeGateway();
        const id = await noCard("ana@example.com", { stripe_customer: "cus_ana" });
        await heldWeek(id, "2026-12-07");
        const sid = await storedSession(gw, id);
        expect(await closeNoCardTrials(query, { ...deps(at(14)), card: gw })).toBe(1);
        expect(await row(id)).toMatchObject({ status: "closed", closed_reason: "no_card", setup_session: null });
        expect(gw.expired).toEqual([sid]);
        expect(closings()).toHaveLength(1);
      });

      it("a card confirmed while the close runs (before the expiry lands) reopens the trial and saves it", async () => {
        const gw = fakeGateway();
        const id = await noCard("ana@example.com", { stripe_customer: "cus_ana" });
        await heldWeek(id, "2026-12-07");
        await storedSession(gw, id);
        // Stripe.js confirmed the card just before our expiry reached Stripe.
        gw.expireSetupSession = async (sid) => gw.complete(sid);
        expect(await closeNoCardTrials(query, { ...deps(at(14)), card: gw })).toBe(1);
        expect(await row(id)).toMatchObject({ status: "trial", closed_reason: null, access_ends_at: null, trial_started_at: at(14) });
        expect(await deliveredCount(id)).toBe(3);
        // Reopened before the email sweep: no closing email.
        expect(closings()).toEqual([]);
      });

      it("the webhook for a card confirmed after the close reopens within 7 days; later the account stays closed", async () => {
        const gw = fakeGateway();
        const id = await noCard("ana@example.com", { stripe_customer: "cus_ana" });
        await heldWeek(id, "2026-12-07");
        const sid = await storedSession(gw, id);
        // The expiry fails: the open session stays stored, and the member confirms it two days later.
        gw.expireSetupSession = async () => {
          throw new Error("stripe down");
        };
        await closeNoCardTrials(query, { ...deps(at(14)), card: gw });
        expect(await row(id)).toMatchObject({ status: "closed", setup_session: sid });
        gw.complete(sid);
        expect(await completeCardSetup(query, gw, sid, completeOpts(at(16)))).toBe("done");
        expect(await row(id)).toMatchObject({ status: "trial", closed_reason: null, access_ends_at: null, trial_started_at: at(16) });
        expect(await deliveredCount(id)).toBe(3);
        await closeNoCardTrials(query, { ...deps(at(16, 1)), card: gw });
        expect((await row(id)).status).toBe("trial");

        const late = await noCard("ben@example.com", { stripe_customer: "cus_ben" });
        const s = await gw.createEmbeddedSetupSession({ userId: late, customer: "cus_ben", currency: "USD", returnUrl: "x" });
        await query("update users set setup_session = $2 where id = $1", [late, s.id]);
        await closeNoCardTrials(query, { ...deps(at(14)), card: gw });
        gw.complete(s.id);
        expect(await completeCardSetup(query, gw, s.id, completeOpts(at(21, 1)))).toBe("closed");
        expect(await row(late)).toMatchObject({ status: "closed", closed_reason: "no_card", trial_started_at: null });
      });

      it("a Stripe read that fails before the close leaves it to the next pass", async () => {
        const gw = fakeGateway();
        const id = await noCard("ana@example.com", { stripe_customer: "cus_ana" });
        await heldWeek(id, "2026-12-07");
        await storedSession(gw, id);
        const read = gw.getSetupSession;
        gw.getSetupSession = async () => {
          throw new Error("timeout");
        };
        expect(await closeNoCardTrials(query, { ...deps(at(14)), card: gw })).toBe(0);
        expect((await row(id)).status).toBe("trial");
        gw.getSetupSession = read;
        expect(await closeNoCardTrials(query, { ...deps(at(14, 1)), card: gw })).toBe(1);
      });
    });

    describe("F2: the teaser before the close, and Toronto wall-time days", () => {
      it("skips a teaser (nothing stamped or sent) once a teasered member's close is within a day; a week earlier it goes", async () => {
        const id = await noCard("ana@example.com");
        await heldWeek(id, "2026-12-07", { superseded: at(6, 18) });
        await heldWeek(id, "2026-12-14", { titles: ["B1", "B2", "B3"] });
        await heldWeek(id, "2026-12-21", { titles: ["C1", "C2", "C3"] });
        // Monday 2026-12-14, 7:00: the close (12-21 7:05) is a week away.
        expect(await sendHeldTeaser(query, deps(tick(at(7), -5 * 60_000)), id, "2026-12-14")).toBe("sent");
        await query("update cora_user_weeks set superseded_at = $1 where week_of = '2026-12-14'", [at(13, 18).toISOString()]);
        // Monday 2026-12-21, 7:00 and 7:01: the Monday send and the hourly sweep both skip it.
        expect(await sendHeldTeaser(query, deps(tick(at(14), -5 * 60_000)), id, "2026-12-21")).toBe("skipped");
        expect(await sendUnsentTeasers(query, deps(tick(at(14), -4 * 60_000)))).toBe(0);
        expect((await notes("first_list_held")).map((n) => n.ref)).toEqual(["2026-12-14"]);
        expect((await row(id)).status).toBe("trial");
      });

      it("never skips a never-teasered member's first teaser, even near its 21-day close", async () => {
        const id = await noCard("ana@example.com", { first_teaser_at: null, consent_at: at(-21, 2).toISOString() });
        await heldWeek(id, "2026-12-07");
        expect(await sendHeldTeaser(query, deps(at(0)), id, "2026-12-07")).toBe("sent");
      });

      it("spring change (2027-03-14): the day-7 reminder and the 14-day close keep 7:05 AM Toronto", async () => {
        const teaser = new Date("2027-03-08T12:05:00Z"); // Monday 7:05 AM EST
        const id = await noCard("ana@example.com", { consent_at: "2027-03-01T15:00:00Z", first_teaser_at: teaser.toISOString() });
        await heldWeek(id, "2027-03-08");
        const close = new Date("2027-03-22T11:05:00Z"); // Monday 7:05 AM EDT, not 8:05
        expect((await noCardClocks(query, settings, new Date("2027-03-10T00:00:00Z")))[0].closesAt).toEqual(close);
        const day7 = new Date("2027-03-15T11:05:00Z");
        await sendHeldReminders(query, deps(tick(day7)));
        expect((await notes("held_reminder")).map((n) => n.ref)).toEqual([`${teaser.toISOString()}:2`]);
        await sendHeldReminders(query, deps(day7));
        expect((await notes("held_reminder")).map((n) => n.ref)).toEqual([`${teaser.toISOString()}:2`, `${teaser.toISOString()}:7`]);
        expect(await closeNoCardTrials(query, deps(tick(close)))).toBe(0);
        expect(await closeNoCardTrials(query, deps(close))).toBe(1);
      });

      it("autumn change (2027-11-07): the 14-day and 21-day closes keep their Toronto wall time", async () => {
        const teasered = await noCard("ana@example.com", { consent_at: "2027-10-18T14:00:00Z", first_teaser_at: "2027-10-25T11:05:00Z" });
        const fresh = await noCard("ben@example.com", { consent_at: "2027-10-20T14:00:00Z", first_teaser_at: null });
        const clocks = await noCardClocks(query, settings, new Date("2027-10-30T00:00:00Z"));
        const closeOf = (id: string) => clocks.find((c) => c.id === id)!.closesAt;
        expect(closeOf(teasered)).toEqual(new Date("2027-11-08T12:05:00Z")); // 7:05 AM EST
        expect(closeOf(fresh)).toEqual(new Date("2027-11-10T15:00:00Z")); // 10:00 AM EST
        expect(await closeNoCardTrials(query, deps(new Date("2027-11-08T12:04:59.999Z")))).toBe(0);
        expect(await closeNoCardTrials(query, deps(new Date("2027-11-08T12:05:00Z")))).toBe(1);
        expect(await closeNoCardTrials(query, deps(new Date("2027-11-10T14:59:59.999Z")))).toBe(0);
        expect(await closeNoCardTrials(query, deps(new Date("2027-11-10T15:00:00Z")))).toBe(1);
      });
    });

    it("F3: one hourly pass reads the no-card clocks once for the nudges, the reminders and the close", async () => {
      const id = await noCard("ana@example.com");
      await heldWeek(id, "2026-12-07");
      let reads = 0;
      const counting: Query = <T,>(text: string, params?: unknown[]) => {
        if (text.includes("as reminded")) reads++;
        return query<T>(text, params);
      };
      const tasks = HOURLY_TASKS.filter((t) => ["trial_nudges", "trial_no_list_close", "held_reminders", "no_card_close"].includes(t.name));
      await runHourly(counting, { ...deps(at(2)), gw: {} as BillingGateway }, tasks);
      expect(reads).toBe(1);
      expect(waiting()).toHaveLength(1);
      await runHourly(counting, { ...deps(at(14)), gw: {} as BillingGateway }, tasks);
      expect(reads).toBe(2);
      expect((await row(id)).status).toBe("closed");
    });

    describe("F4: the closing-email sweep", () => {
      const closedAt = (i: number) => new Date(at(14).getTime() + i * 60_000);
      async function closedMembers(n: number) {
        const ids: string[] = [];
        for (let i = 0; i < n; i++) ids.push(await user(`c${i}@example.com`, { trial_started_at: null, status: "closed", closed_reason: "no_card", access_ends_at: closedAt(i).toISOString() }));
        return ids;
      }
      const recipients = () => new Set(closings().map((m) => m.to[0]));

      it("sends the newest closes first", async () => {
        await closedMembers(MAX_SENDS + 1);
        await closeNoCardTrials(query, deps(at(15)));
        expect(closings()).toHaveLength(MAX_SENDS);
        expect(recipients().has("c0@example.com")).toBe(false);
        expect(recipients().has(`c${MAX_SENDS}@example.com`)).toBe(true);
      });

      it("skips an email whose attempts for today are used up, so it never takes a newer close's place", async () => {
        const ids = await closedMembers(MAX_SENDS + 1);
        const newest = ids[MAX_SENDS];
        const ended = closedAt(MAX_SENDS).toISOString().replace(/\.\d{3}Z$/, "Z");
        await query("insert into notifications (recipient, kind, ref, status, attempts) values ($1, 'trial_closed', $2, 'failed', 3)", [newest, `no_card:${ended}:${torontoDate(at(15))}`]);
        await closeNoCardTrials(query, deps(at(15)));
        expect(closings()).toHaveLength(MAX_SENDS);
        expect(recipients().has(`c${MAX_SENDS}@example.com`)).toBe(false);
        expect(recipients().has("c0@example.com")).toBe(true);
        // The next day brings fresh attempts.
        await closeNoCardTrials(query, deps(at(16)));
        expect(recipients().has(`c${MAX_SENDS}@example.com`)).toBe(true);
      });
    });

    describe("F6: the clocks' edges", () => {
      it("go-live after consent: a never-teasered clock and its nudges count from go-live, the nudge still keyed by consent", async () => {
        await query("insert into settings (key, value) values ('v3.cycleLiveSince', to_jsonb($1::timestamptz))", [day(5).toISOString()]);
        const id = await noCard("ana@example.com", { consent_at: day(0).toISOString(), first_teaser_at: null });
        const [c] = await noCardClocks(query, settings, day(6));
        expect(c.start).toEqual(day(5));
        expect(c.closesAt).toEqual(day(26));
        expect(await sendTrialNudges(query, deps(tick(day(8))))).toBe(0);
        expect(await sendTrialNudges(query, deps(day(8)))).toBe(1);
        expect((await notes("zack_not_yet")).map((n) => n.ref)).toEqual([`${day(0).toISOString()}:3`]);
        expect(await closeNoCardTrials(query, deps(tick(day(26))))).toBe(0);
        expect(await closeNoCardTrials(query, deps(day(26)))).toBe(1);
        expect(await row(id)).toMatchObject({ status: "closed", closed_reason: "no_first_list" });
      });

      it("a card saved, or a first teaser stamped, between the clock read and the close statement stops the close", async () => {
        const ana = await noCard("ana@example.com");
        const ben = await noCard("ben@example.com", { first_teaser_at: null, consent_at: at(-7).toISOString() });
        // Ana's close is at(14); Ben's (consent + 21) at(14) too.
        const racing: Query = async <T,>(text: string, params?: unknown[]) => {
          if (text.includes("set status = 'closed'")) {
            await query("update users set trial_started_at = $2 where id = $1 and trial_started_at is null", [ana, at(14).toISOString()]);
            await query("update users set first_teaser_at = $2 where id = $1 and first_teaser_at is null", [ben, at(14).toISOString()]);
          }
          return query<T>(text, params);
        };
        expect(await closeNoCardTrials(racing, deps(at(14)))).toBe(0);
        expect((await row(ana)).status).toBe("trial");
        expect((await row(ben)).status).toBe("trial");
        expect(closings()).toEqual([]);
      });

      it("a reminder whose send failed goes on the next pass, one notification in the end", async () => {
        const id = await noCard("ana@example.com");
        await heldWeek(id, "2026-12-07");
        failNext = 1;
        await sendHeldReminders(query, deps(at(2)));
        expect(waiting()).toEqual([]);
        await sendHeldReminders(query, deps(at(2, 1)));
        await sendHeldReminders(query, deps(at(2, 2)));
        expect(waiting()).toHaveLength(1);
        expect(await notes("held_reminder")).toEqual([{ ref: `${new Date(T).toISOString()}:2`, status: "sent" }]);
      });

      it("no held list (heldTeaser null): no reminder", async () => {
        await noCard("ana@example.com");
        expect(await sendHeldReminders(query, deps(at(7)))).toBe(0);
        expect(await notes("held_reminder")).toEqual([]);
      });

      it("nothing one tick before T+2d, T+7d and T+14d", async () => {
        const id = await noCard("ana@example.com");
        await heldWeek(id, "2026-12-07");
        expect(await sendHeldReminders(query, deps(tick(at(2))))).toBe(0);
        expect(await sendHeldReminders(query, deps(at(2)))).toBe(1);
        expect(await sendHeldReminders(query, deps(tick(at(7))))).toBe(0);
        expect(await sendHeldReminders(query, deps(at(7)))).toBe(1);
        expect(await closeNoCardTrials(query, deps(tick(at(14))))).toBe(0);
        expect(await closeNoCardTrials(query, deps(at(14)))).toBe(1);
      });

      it("never teasered: a failed Cora week moves the 21-day close a week", async () => {
        const id = await noCard("ana@example.com", { consent_at: day(0).toISOString(), first_teaser_at: null });
        await query("insert into cora_weeks (week_of, status) values ('2026-12-14', 'failed')");
        expect((await noCardClocks(query, settings, day(15)))[0].closesAt).toEqual(day(28));
        expect(await closeNoCardTrials(query, deps(day(21)))).toBe(0);
        expect(await closeNoCardTrials(query, deps(tick(day(28))))).toBe(0);
        expect(await closeNoCardTrials(query, deps(day(28)))).toBe(1);
        expect((await row(id)).closed_reason).toBe("no_first_list");
      });

      it("never teasered: a run an admin added for a later week (not the coming one) holds the close until that week is done", async () => {
        const id = await noCard("ana@example.com", { consent_at: day(0).toISOString(), first_teaser_at: null });
        // Close: Tuesday 2026-12-22; the coming Monday is 12-28, the run is for 2027-01-04.
        await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, '2027-01-04', 'upload', 'hark', 'share', 'x', 'accepted')", [id]);
        expect(await closeNoCardTrials(query, deps(day(21)))).toBe(0);
        expect((await noCardClocks(query, settings, day(21)))[0].runWaiting).toBe(true);
        await query("insert into cora_weeks (week_of, status) values ('2027-01-04', 'sent')");
        await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, '2027-01-04', 'not_eligible')", [id]);
        expect(await closeNoCardTrials(query, deps(day(34)))).toBe(1);
        expect((await row(id)).closed_reason).toBe("no_first_list");
      });
    });
  });
});

describe("closeMoment", () => {
  it("adds a week for each Roger week before the close, including one the first week pushed into range", () => {
    const start = new Date("2026-12-01T15:00:00Z");
    // 2026-12-21 is inside the first 21 days; then 2026-12-28 falls inside the extended range.
    expect(closeMoment(start, 21, ["2026-12-21", "2026-12-28"], "07:00").toISOString()).toBe("2027-01-05T15:00:00.000Z");
    expect(closeMoment(start, 21, ["2027-01-04"], "07:00").toISOString()).toBe("2026-12-22T15:00:00.000Z");
  });
});

describe("the Sunday reminder on the upload route (spec B.5)", () => {
  /** Sunday 2026-12-13, 6:05 PM in Vancouver (02:05 UTC Monday). */
  const SUNDAY_6PM_VANCOUVER = new Date("2026-12-14T02:05:00Z");

  async function uploader(email: string, cols: Record<string, unknown> = {}) {
    const id = await user(email, { status: "active", timezone: "America/Vancouver", free_lists_used: 2, ...cols });
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-12-07', 'upload', 'other', 'share', 'x')", [id]);
    return id;
  }

  it("reminds at 6:00 PM their time on Sunday when no run has arrived, once", async () => {
    await uploader("van@example.com");
    expect(await sendUploadReminders(query, deps(new Date("2026-12-14T01:30:00Z")))).toBe(0);
    expect(await sendUploadReminders(query, deps(SUNDAY_6PM_VANCOUVER))).toBe(1);
    expect(await sendUploadReminders(query, deps(new Date("2026-12-14T03:05:00Z")))).toBe(0);
    expect(subjects()).toEqual(["Zack’s report for Monday hasn’t arrived"]);
  });

  it("leaves out connector members, members whose run arrived, and one at a time without an order", async () => {
    const arrived = await uploader("arrived@example.com");
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-12-14', 'upload', 'other', 'share', 'x')", [arrived]);
    const conn = await user("conn@example.com", { status: "active", timezone: "America/Vancouver" });
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-12-07', 'connector', 'hark', 'share', 'x')", [conn]);
    await uploader("perrun@example.com", { plan: "per_run" });
    await uploader("off@example.com", { sharing: "off" });
    // Cancelling, with access ending before Monday's charge.
    await uploader("leaving@example.com", { cancel_requested_at: "2026-12-01T12:00:00Z", access_ends_at: "2026-12-14T05:00:00Z" });
    expect(await sendUploadReminders(query, deps(SUNDAY_6PM_VANCOUVER))).toBe(0);
  });

  it("sends at the last pass before the cutoff when 6:00 PM their time is after it", async () => {
    await uploader("van@example.com");
    // A 6:00 PM Toronto cutoff is 3:00 PM in Vancouver.
    const early = { ...deps(new Date("2026-12-13T21:30:00Z")), settings: mergeV3([{ key: "v3.cycleLive", value: true }, { key: "v3.runCutoff", value: "18:00" }]) };
    expect(await sendUploadReminders(query, early)).toBe(0);
    expect(await sendUploadReminders(query, { ...early, now: new Date("2026-12-13T22:05:00Z") })).toBe(1);
    expect(await sendUploadReminders(query, { ...early, now: new Date("2026-12-13T23:05:00Z") })).toBe(0);
  });
});
