import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallToInstant } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { closeMoment, closeTrialsWithNoList, sendTrialNudges, sendUploadReminders, trialClocks } from "./trial";

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
/** Every hourly pass from one moment to another, nudges then the close (as the hourly pass orders them). */
async function passes(from: Date, to: Date) {
  for (let t = from.getTime(); t <= to.getTime(); t += 3_600_000) {
    await sendTrialNudges(query, deps(new Date(t)));
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

describe("closeMoment", () => {
  it("adds a week for each Roger week before the close, including one the first week pushed into range", () => {
    const start = new Date("2026-12-01T15:00:00Z");
    // 2026-12-21 is inside the first 21 days; then 2026-12-28 falls inside the extended range.
    expect(closeMoment(start, 21, ["2026-12-21", "2026-12-28"], "07:00").toISOString()).toBe("2027-01-05T15:00:00.000Z");
    expect(closeMoment(start, 21, ["2027-01-04"], "07:00").toISOString()).toBe("2026-12-22T15:00:00.000Z");
  });
});

describe("the Sunday reminder on the upload route (spec B.5)", () => {
  // Worked out from the clock, not typed as UTC: British Columbia stopped
  // changing its clocks in 2026, so Vancouver's winter offset depends on how
  // new the runtime's time zone data is.
  const SIX_PM = wallToInstant("2026-12-13", "18:00", "America/Vancouver").getTime();
  const minutesAfterSix = (m: number) => new Date(SIX_PM + m * 60_000);
  /** Sunday 2026-12-13, 6:05 PM in Vancouver. */
  const SUNDAY_6PM_VANCOUVER = minutesAfterSix(5);

  async function uploader(email: string, cols: Record<string, unknown> = {}) {
    const id = await user(email, { status: "active", timezone: "America/Vancouver", free_lists_used: 2, ...cols });
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-12-07', 'upload', 'other', 'share', 'x')", [id]);
    return id;
  }

  it("reminds at 6:00 PM their time on Sunday when no run has arrived, once", async () => {
    await uploader("van@example.com");
    expect(await sendUploadReminders(query, deps(minutesAfterSix(-30)))).toBe(0);
    expect(await sendUploadReminders(query, deps(SUNDAY_6PM_VANCOUVER))).toBe(1);
    expect(await sendUploadReminders(query, deps(minutesAfterSix(65)))).toBe(0);
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
