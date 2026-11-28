import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb, testSponsor } from "@/test-helpers/pglite-db";
import { GENERATION_SQL, loadMeasures, MEASURE_WEEKS, snapshotCheckpoint, type Measures } from "./measures";

/**
 * B3 Unit 3: the loop measures, checked against arithmetic done by hand. The
 * contract is the plan's "Measure Definitions (SQL level)" table
 * (docs/plans/2026-11-27-003-feat-roger-v3-b3-measurement-plan.md).
 *
 * Toronto is on EST (UTC-5) from November 1, so in the checkpoint weeks a
 * Toronto Monday 00:00 is 05:00 UTC:
 *   W1 = 2026-11-23, starts 2026-11-23T05:00Z
 *   W2 = 2026-11-30, starts 2026-11-30T05:00Z
 *   W3 = 2026-12-07, starts 2026-12-07T05:00Z, ends 2026-12-14T05:00Z
 */

let query: Query;
beforeEach(async () => {
  ({ query } = await testDb());
});

async function user(email: string, cols: Record<string, unknown> = {}): Promise<string> {
  if (typeof cols.sponsor_id === "string") await testSponsor(query, cols.sponsor_id);
  const c = { status: "active", plan: "monthly", ...cols };
  const keys = Object.keys(c);
  const [{ id }] = await query<{ id: string }>(
    `insert into users (email, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [email, ...Object.values(c)],
  );
  return id;
}

async function referral(referrer: string | null, referred: string, at: string, o: { source?: "link" | "guest"; stage?: string; paying_at?: string } = {}) {
  await query(`insert into referrals (referrer_id, referred_user_id, source, stage, created_at, paying_at) values ($1, $2, $3, $4, $5, $6)`, [
    referrer,
    referred,
    o.source ?? "link",
    o.stage ?? (o.paying_at ? "paying" : "trial"),
    at,
    o.paying_at ?? null,
  ]);
}

const firstList = (userId: string, at: string, dryRun = false) =>
  query(`insert into cora_user_weeks (user_id, week_of, outcome, dry_run, delivered_at) values ($1, ($2::timestamptz at time zone 'America/Toronto')::date, 'picked', $3, $2)`, [userId, at, dryRun]);

const week = (m: Measures, w: string) => {
  const r = m.weeks.find((x) => x.week === w);
  if (!r) throw new Error(`no row for ${w}`);
  return r;
};

/**
 * The hand-calculation fixture (plan Unit 3, "Test scenarios").
 *
 * Before W1: champions c1..c8 (nobody referred them: generation 0), signed up
 * 2026-11-01. c1..c3 paid their first charge on 2026-11-02. c8's access ends
 * 2026-11-25, in the middle of W1.
 *
 * W1: R1 (referred by c1, link) signs up 11-24, R2 (referred by c2) 11-25,
 *     D1 (direct) 11-26. G1 is invited as a guest by c1 on 11-26 15:00Z.
 *     Active at W1 start: c1..c8 = 8. Referred sign-ups: R1, R2 = 2.
 *     k(W1) = 2 / 8 = 0.25.
 * W2: G1 signs up 12-01 15:00Z and gets a first list the same instant:
 *     cycle time 12-01 15:00 - 11-26 15:00 = 5.0 days.
 *     Active at W2 start: c1..c7 (c8 ended), R1, R2, D1 = 10. Referred: G1.
 *     k(W2) = 1 / 10 = 0.10.
 * W3: nobody signs up. Active at W3 start: the 10 plus G1 = 11.
 *     k(W3) = 0 / 11 = 0.00.
 *     R1's first list is 12-07 15:00Z, 13.0 days after being named on
 *     11-24 15:00Z. R1 pays on 12-08.
 * Checkpoint (pooled): (2 + 1 + 0) / (8 + 10 + 11) = 3 / 29 = 0.1034, below 0.25.
 *
 * By generation (k_g counts against the referrer's generation g):
 *   W1: g0 = 2 / 8 (R1 and R2's referrers are champions; 8 gen-0 active).
 *   W2: g0 = 1 / 8 (c1..c7 and D1), g1 = 0 / 2 (R1, R2).
 *   W3: g0 = 0 / 8, g1 = 0 / 3 (R1, R2, G1).
 * Waiting: R2 has no first list (a dry-run list doesn't count). Named
 *   11-25 15:00Z; at NOW (12-13 12:00Z) that is 17 days 21 hours = 17.9.
 * Paid referral rate at the end of each week:
 *   paying members at end(W1) and end(W2) = c1..c3 = 3, numerator 0: 0.00.
 *   end(W3) = c1..c3 and R1 = 4, numerator R1 = 1: 0.25.
 */
const NOW = new Date("2026-12-13T12:00:00Z");
async function handFixture() {
  const before = "2026-11-01T15:00:00Z";
  const c: string[] = [];
  for (let i = 1; i <= 8; i++)
    c.push(
      await user(`c${i}@example.com`, {
        signup_finished_at: before,
        first_charge_at: i <= 3 ? "2026-11-02T15:00:00Z" : null,
        access_ends_at: i === 8 ? "2026-11-25T15:00:00Z" : null,
        status: i === 8 ? "cancelled" : "active",
      }),
    );
  const r1 = await user("r1@example.com", { signup_finished_at: "2026-11-24T15:00:00Z", first_charge_at: "2026-12-08T15:00:00Z" });
  await referral(c[0], r1, "2026-11-24T15:00:00Z", { paying_at: "2026-12-08T15:00:00Z" });
  await firstList(r1, "2026-12-07T15:00:00Z");
  const r2 = await user("r2@example.com", { signup_finished_at: "2026-11-25T15:00:00Z", status: "trial" });
  await referral(c[1], r2, "2026-11-25T15:00:00Z");
  await firstList(r2, "2026-11-30T15:00:00Z", true);
  await user("d1@example.com", { signup_finished_at: "2026-11-26T15:00:00Z", status: "trial" });
  const g1 = await user("g1@example.com", { signup_finished_at: "2026-12-01T15:00:00Z", status: "trial" });
  await referral(c[0], g1, "2026-11-26T15:00:00Z", { source: "guest" });
  await firstList(g1, "2026-12-01T15:00:00Z");
  return { c, r1, r2, g1 };
}

describe("the hand calculation (plan Unit 3)", () => {
  it("k, k by generation, cycle time, waiting and the paid referral rate match the arithmetic", async () => {
    await handFixture();
    const m = await loadMeasures(query, { now: NOW, adminEmails: [] });
    expect(m.weeks).toHaveLength(MEASURE_WEEKS);
    expect(m.weeks[0].week).toBe("2026-12-07");

    const w1 = week(m, "2026-11-23");
    const w2 = week(m, "2026-11-30");
    const w3 = week(m, "2026-12-07");
    expect(w1.k).toEqual({ num: 2, den: 8, value: 0.25 });
    expect(w2.k).toEqual({ num: 1, den: 10, value: 0.1 });
    expect(w3.k).toEqual({ num: 0, den: 11, value: 0 });

    expect(w1.kByGen).toEqual([
      { num: 2, den: 8, value: 0.25 },
      { num: 0, den: 0, value: null },
      { num: 0, den: 0, value: null },
      { num: 0, den: 0, value: null },
    ]);
    expect(w2.kByGen.slice(0, 2)).toEqual([
      { num: 1, den: 8, value: 0.125 },
      { num: 0, den: 2, value: 0 },
    ]);
    expect(w3.kByGen.slice(0, 2)).toEqual([
      { num: 0, den: 8, value: 0 },
      { num: 0, den: 3, value: 0 },
    ]);

    expect(w2.cycle.all).toEqual({ n: 1, median: 5, mean: 5 });
    expect(w2.cycle.byGen[0]).toEqual({ n: 1, median: 5, mean: 5 });
    expect(w3.cycle.all).toEqual({ n: 1, median: 13, mean: 13 });
    expect(w1.cycle.all).toEqual({ n: 0, median: null, mean: null });
    expect(m.waiting).toEqual({ n: 1, oldestDays: 17.9 });

    expect(w1.paid).toEqual({ num: 0, den: 3, value: 0 });
    expect(w2.paid).toEqual({ num: 0, den: 3, value: 0 });
    expect(w3.paid).toEqual({ num: 1, den: 4, value: 0.25 });
  });

  it("the checkpoint pools the three weeks: 3 / 29, below the floor, in progress", async () => {
    await handFixture();
    const { checkpoint } = await loadMeasures(query, { now: NOW, adminEmails: [] });
    expect(checkpoint).toMatchObject({ state: "in_progress", weeksCounted: 3, num: 3, den: 29, status: "below", floor: 0.25, frozenAt: null });
    expect(checkpoint.value).toBeCloseTo(3 / 29, 10);
    expect(checkpoint.weeks).toEqual([
      { week: "2026-11-23", num: 2, den: 8 },
      { week: "2026-11-30", num: 1, den: 10 },
      { week: "2026-12-07", num: 0, den: 11 },
    ]);
  });

  it("cycle time takes the median and mean over a week's referred members", async () => {
    // Three referred members whose first list is in W2, named 2, 3 and 10 days before it: median 3.0, mean 5.0.
    const c = await user("c@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    for (const [i, days] of [2, 3, 10].entries()) {
      const at = new Date(Date.parse("2026-12-02T15:00:00Z") - days * 86_400_000).toISOString();
      const id = await user(`m${i}@example.com`, { signup_finished_at: at });
      await referral(c, id, at);
      await firstList(id, "2026-12-02T15:00:00Z");
    }
    const m = await loadMeasures(query, { now: NOW, adminEmails: [] });
    expect(week(m, "2026-11-30").cycle.all).toEqual({ n: 3, median: 3, mean: 5 });
  });
});

describe("generation (derived, never read from referrals.generation)", () => {
  it("a champion is 0, the person they refer 1, and theirs 2; a deleted referrer's referral is 1", async () => {
    const c = await user("champ@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    const a = await user("a@example.com", { signup_finished_at: "2026-11-24T15:00:00Z" });
    await referral(c, a, "2026-11-24T15:00:00Z");
    const b = await user("b@example.com", { signup_finished_at: "2026-12-01T15:00:00Z" });
    await referral(a, b, "2026-12-01T15:00:00Z");
    const z = await user("z@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    const x = await user("x@example.com", { signup_finished_at: "2026-11-02T15:00:00Z" });
    await referral(z, x, "2026-11-02T15:00:00Z");
    await query("delete from users where id = $1", [z]);

    const gens = await query<{ id: string; g: number }>(`with recursive ${GENERATION_SQL} select id, g from gen`);
    const g = Object.fromEntries(gens.map((r) => [r.id, r.g]));
    expect(g).toEqual({ [c]: 0, [a]: 1, [b]: 2, [x]: 1 });

    const m = await loadMeasures(query, { now: NOW, adminEmails: [] });
    // W1: A (referrer C, gen 0) against the gen-0 active members: C (Z is deleted; X is generation 1).
    expect(week(m, "2026-11-23").kByGen[0]).toEqual({ num: 1, den: 1, value: 1 });
    expect(week(m, "2026-11-23").kByGen[1]).toEqual({ num: 0, den: 1, value: 0 });
    // W2: B (referrer A, gen 1) against the gen-1 active members: A and X.
    expect(week(m, "2026-11-30").kByGen[1]).toEqual({ num: 1, den: 2, value: 0.5 });
    expect(week(m, "2026-11-30").kByGen[0]).toEqual({ num: 0, den: 1, value: 0 });
  });

  it("a stored referrals.generation is ignored", async () => {
    const c = await user("champ@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    const a = await user("a@example.com", { signup_finished_at: "2026-11-24T15:00:00Z" });
    await query(`insert into referrals (referrer_id, referred_user_id, source, stage, created_at, generation) values ($1, $2, 'link', 'trial', '2026-11-24T15:00:00Z', 7)`, [c, a]);
    const gens = await query<{ id: string; g: number }>(`with recursive ${GENERATION_SQL} select id, g from gen where id = $1`, [a]);
    expect(gens[0].g).toBe(1);
  });
});

describe("adoption against 2 of 3", () => {
  async function play(): Promise<string> {
    const [{ id }] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('P', 'solo', 'd', 'p', 'i', '2026-11-01', '2026-11-01') returning id`,
    );
    return id;
  }
  async function pick(
    userId: string,
    playId: string,
    position: number,
    o: { marked?: boolean; confirmed?: boolean; dryRun?: boolean; delivered?: boolean; installed?: boolean; used?: boolean; upgrade?: boolean } = {},
  ) {
    await query(
      `insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at, setup_marked_at, setup_confirmed_at, installed_at, used_at, kind)
       values ($1, '2026-12-07', $2, $3, 1, 1, 'r', $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        position,
        playId,
        Boolean(o.dryRun),
        o.delivered === false ? null : "2026-12-07T12:05:00Z",
        o.marked ? "2026-12-08T12:00:00Z" : null,
        o.confirmed ? "2026-12-09T12:00:00Z" : null,
        o.installed || o.used ? "2026-12-12T20:00:00Z" : null,
        o.used ? "2026-12-12T20:00:00Z" : null,
        o.upgrade ? "upgrade" : "new",
      ],
    );
  }

  it("9 ideas to 3 members adopted 3, 2 and 0: 5/9, and 2 of 3 members at the target; 3 installed and 2 used from the next profile", async () => {
    const p = await play();
    const m1 = await user("m1@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    const m2 = await user("m2@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    const m3 = await user("m3@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    // m1: marked (and used, from the next profile), marked (installed only), and confirmed with no mark (still adopted).
    await pick(m1, p, 1, { marked: true, used: true });
    await pick(m1, p, 2, { marked: true, installed: true });
    await pick(m1, p, 3, { confirmed: true });
    // m2: marked, marked and confirmed, nothing.
    await pick(m2, p, 1, { marked: true });
    await pick(m2, p, 2, { marked: true, confirmed: true });
    await pick(m2, p, 3);
    // m3: nothing adopted. One idea used per the next profile, never marked: counted as used and installed, not adopted.
    await pick(m3, p, 1, { used: true });
    for (const pos of [2, 3]) await pick(m3, p, pos);
    // Left out: a dry-run pick, an undelivered pick and an admin's pick, all marked.
    const m4 = await user("m4@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    await pick(m4, p, 1, { marked: true, used: true, dryRun: true });
    await pick(m4, p, 2, { marked: true, used: true, delivered: false });
    const admin = await user("Boss@Example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    await pick(admin, p, 1, { marked: true, used: true });

    const m = await loadMeasures(query, { now: NOW, adminEmails: ["boss@example.com"] });
    // Installed: m1 1 and 2, m3 1 (used implies installed) = 3. Used: m1 1, m3 1 = 2.
    expect(week(m, "2026-12-07").adoption).toEqual({ sent: 9, marked: 4, confirmed: 2, adopted: 5, installed: 3, used: 2, members: 3, membersAtTarget: 2 });
    expect(week(m, "2026-11-30").adoption).toEqual({ sent: 0, marked: 0, confirmed: 0, adopted: 0, installed: 0, used: 0, members: 0, membersAtTarget: 0 });
  });

  it("leaves upgrades out: an upgrade pick, marked, confirmed, installed and used, is in no count, and a member with only an upgrade isn't a member here", async () => {
    const p = await play();
    const m1 = await user("m1@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    await pick(m1, p, 1, { marked: true });
    await pick(m1, p, 2);
    await pick(m1, p, 3, { marked: true, confirmed: true, used: true, upgrade: true });
    const m2 = await user("m2@example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    await pick(m2, p, 1, { marked: true, used: true, upgrade: true });

    const m = await loadMeasures(query, { now: NOW });
    // m1's two new ideas: 1 adopted of 2 sent, below 2 of 3. m2 sent no new idea.
    expect(week(m, "2026-12-07").adoption).toEqual({ sent: 2, marked: 1, confirmed: 0, adopted: 1, installed: 0, used: 0, members: 1, membersAtTarget: 0 });
  });
});

describe("who is counted", () => {
  it("a void referral is not referred, and a sponsored referred member is left out of the paid numerator", async () => {
    const c = await user("c@example.com", { signup_finished_at: "2026-11-01T15:00:00Z", first_charge_at: "2026-11-02T15:00:00Z" });
    const v = await user("v@example.com", { signup_finished_at: "2026-11-24T15:00:00Z" });
    await referral(c, v, "2026-11-24T15:00:00Z", { stage: "void" });
    const s = await user("s@example.com", { signup_finished_at: "2026-11-24T15:00:00Z", sponsor_id: "00000000-0000-4000-8000-000000000001" });
    await referral(c, s, "2026-11-24T15:00:00Z", { paying_at: "2026-11-25T15:00:00Z" });
    const m = await loadMeasures(query, { now: NOW, adminEmails: [] });
    // W1: only S is referred (V's referral is void). One active member at the start (C).
    expect(week(m, "2026-11-23").k).toEqual({ num: 1, den: 1, value: 1 });
    // V counts as a champion from W2 on: generation 0 with C.
    expect(week(m, "2026-11-30").kByGen[0].den).toBe(2);
    // Paid: S pays but is sponsored. Paying members at end(W1): C.
    expect(week(m, "2026-11-23").paid).toEqual({ num: 0, den: 1, value: 0 });
  });

  it("access ended before the week started is out of the denominator; ending mid-week is in", async () => {
    await user("p@example.com", { signup_finished_at: "2026-11-01T15:00:00Z", access_ends_at: "2026-12-06T15:00:00Z", status: "cancelled" });
    await user("q@example.com", { signup_finished_at: "2026-11-01T15:00:00Z", access_ends_at: "2026-12-09T15:00:00Z", status: "cancelled" });
    const m = await loadMeasures(query, { now: NOW, adminEmails: [] });
    expect(week(m, "2026-12-07").k.den).toBe(1);
    expect(week(m, "2026-11-30").k.den).toBe(2);
  });

  it("admins and unfinished sign-ups are not members; older accounts fall back to created_at", async () => {
    const admin = await user("Boss@Example.com", { signup_finished_at: "2026-11-01T15:00:00Z" });
    const a = await user("a@example.com", { signup_finished_at: "2026-11-24T15:00:00Z" });
    await referral(admin, a, "2026-11-24T15:00:00Z");
    const adminReferred = await user("boss2@example.com", { signup_finished_at: "2026-11-24T15:00:00Z" });
    await referral(a, adminReferred, "2026-11-24T15:00:00Z");
    // Unfinished: status signup and no finish stamp. Old account: no finish stamp, status active, created 11-01.
    await user("half@example.com", { status: "signup", created_at: "2026-11-01T15:00:00Z" });
    await user("old@example.com", { status: "active", created_at: "2026-11-01T15:00:00Z" });
    const m = await loadMeasures(query, { now: NOW, adminEmails: ["boss@example.com", "boss2@example.com"] });
    // W1: A is referred (by an admin, who is still A's referrer). Active at the start: "old" only.
    expect(week(m, "2026-11-23").k).toEqual({ num: 1, den: 1, value: 1 });
  });

  it("every denominator 0 is no data, not 0.00", async () => {
    const m = await loadMeasures(query, { now: NOW, adminEmails: [] });
    expect(m.weeks.every((w) => w.k.value === null && w.paid.value === null && w.kByGen.every((g) => g.value === null))).toBe(true);
    expect(m.checkpoint).toMatchObject({ state: "in_progress", weeksCounted: 3, value: null, status: null });
    expect(m.waiting).toEqual({ n: 0, oldestDays: null });
  });
});

describe("Toronto weeks at Sunday 23:59 and Monday 00:00", () => {
  async function pair(sunday: string, monday: string) {
    const c = await user("c@example.com", { signup_finished_at: "2026-01-01T15:00:00Z" });
    const s = await user("sun@example.com", { signup_finished_at: sunday });
    await referral(c, s, sunday);
    const mo = await user("mon@example.com", { signup_finished_at: monday });
    await referral(c, mo, monday);
  }

  it("when daylight saving ends (Sunday 2026-11-01)", async () => {
    // Sunday 11-01 23:59 EST = 11-02 04:59Z; Monday 11-02 00:00 EST = 05:00Z.
    await pair("2026-11-02T04:59:00Z", "2026-11-02T05:00:00Z");
    const m = await loadMeasures(query, { now: new Date("2026-11-10T15:00:00Z"), adminEmails: [] });
    expect(week(m, "2026-10-26").k.num).toBe(1);
    expect(week(m, "2026-11-02").k.num).toBe(1);
    expect(week(m, "2026-11-02").k.den).toBe(2);
  });

  it("when daylight saving starts (Sunday 2026-03-08)", async () => {
    // Sunday 03-08 23:59 EDT = 03-09 03:59Z; Monday 03-09 00:00 EDT = 04:00Z.
    await pair("2026-03-09T03:59:00Z", "2026-03-09T04:00:00Z");
    const m = await loadMeasures(query, { now: new Date("2026-03-20T15:00:00Z"), adminEmails: [] });
    expect(week(m, "2026-03-02").k.num).toBe(1);
    expect(week(m, "2026-03-09").k.num).toBe(1);
  });
});

describe("the December 14 checkpoint snapshot", () => {
  const DEC14 = new Date("2026-12-14T05:00:00Z"); // 00:00 Toronto

  it("before December 14 it is in progress over the weeks begun so far, and nothing is stored", async () => {
    await handFixture();
    const now = new Date("2026-12-05T15:00:00Z");
    const { checkpoint } = await loadMeasures(query, { now, realNow: now, adminEmails: [] });
    expect(checkpoint).toMatchObject({ state: "in_progress", weeksCounted: 2, num: 3, den: 18, status: "below" });
    expect(await snapshotCheckpoint(query, { now, realNow: now, adminEmails: [] })).toBeNull();
    expect(await query("select * from measure_snapshots")).toHaveLength(0);
  });

  it("in production it never freezes while the admin list is empty (B3 Unit 3 review)", async () => {
    await handFixture();
    vi.stubEnv("VERCEL_ENV", "production");
    try {
      expect(await snapshotCheckpoint(query, { now: DEC14, realNow: DEC14, adminEmails: [] })).toBeNull();
      expect(await query("select * from measure_snapshots")).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("before November 23 no week has begun", async () => {
    const now = new Date("2026-11-20T15:00:00Z");
    const { checkpoint } = await loadMeasures(query, { now, realNow: now, adminEmails: [] });
    expect(checkpoint).toMatchObject({ state: "not_started", weeksCounted: 0, value: null, status: null });
  });

  it("the first load at 00:00 Toronto stores it once; a later deletion moves live k but not the checkpoint", async () => {
    const { r1 } = await handFixture();
    const first = await loadMeasures(query, { now: DEC14, realNow: DEC14, adminEmails: [] });
    expect(first.checkpoint).toMatchObject({ state: "frozen", num: 3, den: 29, status: "below", frozenAt: DEC14.toISOString() });
    const [row] = await query<{ value: string; detail: { floor: number; weeks: { week: string; num: number; den: number }[] }; computed_at: Date }>(
      "select value::text, detail, computed_at from measure_snapshots where key = 'checkpoint-2026-12-14'",
    );
    expect(Number(row.value)).toBeCloseTo(3 / 29, 10);
    expect(row.detail).toEqual({
      floor: 0.25,
      weeks: [
        { week: "2026-11-23", num: 2, den: 8 },
        { week: "2026-11-30", num: 1, den: 10 },
        { week: "2026-12-07", num: 0, den: 11 },
      ],
    });
    expect(new Date(row.computed_at).toISOString()).toBe(DEC14.toISOString());

    await query("delete from users where id = $1", [r1]);
    const later = new Date("2026-12-15T15:00:00Z");
    const after = await loadMeasures(query, { now: later, realNow: later, adminEmails: [] });
    expect(week(after, "2026-11-23").k).toEqual({ num: 1, den: 8, value: 0.125 });
    expect(after.checkpoint).toMatchObject({ state: "frozen", num: 3, den: 29, weeks: first.checkpoint.weeks, frozenAt: DEC14.toISOString() });
    expect(await query("select * from measure_snapshots")).toHaveLength(1);
  });

  it("two concurrent first loads store one row", async () => {
    await handFixture();
    const [a, b] = await Promise.all([
      loadMeasures(query, { now: DEC14, realNow: DEC14, adminEmails: [] }),
      loadMeasures(query, { now: DEC14, realNow: DEC14, adminEmails: [] }),
    ]);
    expect(await query("select * from measure_snapshots")).toHaveLength(1);
    expect(a.checkpoint).toEqual(b.checkpoint);
  });

  it("is never taken ahead of the real clock (a preview ?asOf in the future)", async () => {
    await handFixture();
    const realNow = new Date("2026-12-10T15:00:00Z");
    const m = await loadMeasures(query, { now: DEC14, realNow, adminEmails: [] });
    expect(m.checkpoint.state).toBe("in_progress");
    expect(await query("select * from measure_snapshots")).toHaveLength(0);
  });

  it("with no data, the snapshot stores a null value and reads no data", async () => {
    const m = await loadMeasures(query, { now: DEC14, realNow: DEC14, adminEmails: [] });
    expect(m.checkpoint).toMatchObject({ state: "frozen", value: null, status: null, num: 0, den: 0 });
    const [row] = await query<{ value: string | null }>("select value from measure_snapshots");
    expect(row.value).toBeNull();
  });
});
