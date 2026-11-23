import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { IntakeModel } from "@/lib/intake/model";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import type { FitModel } from "./fit";
import { clearDryRun, runCoraJob, type CoraDeps } from "./job";
import type { MergeModel } from "./merge";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const WEEK = "2026-11-30";
// Monday 2026-11-30, 1:05 AM Toronto (EST) = 06:05 UTC.
const ONE_AM = new Date("2026-11-30T06:05:00Z");
const live = mergeV3([{ key: "v3.cycleLive", value: true }]);
const off = mergeV3([]);

const intake: IntakeModel = { readRun: async () => Promise.reject(new Error("unused")), review: async () => [] };
const merge: MergeModel = { sameJob: async (p, cands) => cands.find((c) => c.job.split(" ")[0] === p.job.split(" ")[0])?.id ?? null };
const fit: FitModel = {
  fit: async (_u, cands) => cands.map((c) => ({ id: c.id, fit: 3 as const, frictionMatch: false, why: "category" as const })),
};
const deps = (o: Partial<CoraDeps> = {}): CoraDeps => ({ intake, merge, fit, query, transport, sleep: async () => {}, ...o });

const play = (title: string, job: string, category = "Email and calendar", set = "A") => ({
  set,
  title,
  category,
  job,
  description: `${title}.`,
  minutes_saved_each: 10,
  current_hours_week: 1,
  confidence: "Medium",
  basis: "Implied",
  playbook_md: "1. Do the thing.\n2. Check it.",
  install_notes: "Save as a skill.",
});
const report = (plays: unknown[]) => `# Zack v2.0\n\n\`\`\`roger-run\n${JSON.stringify({ zack_version: "2.0", plays })}\n\`\`\`\n`;

async function member(email: string, o: { status?: string; plan?: string; sharing?: string } = {}) {
  const [u] = await query<{ id: string }>("insert into users (email, status, plan, sharing) values ($1, $2, $3, $4) returning id", [
    email,
    o.status ?? "active",
    o.plan ?? "monthly",
    o.sharing ?? "share",
  ]);
  return u.id;
}
const run = (userId: string, plays: unknown[]) =>
  query("insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, $2, 'connector', 'hark', 'share', $3)", [userId, WEEK, report(plays)]);
const picksOf = async (userId: string) =>
  (await query<{ title: string }>("select pp.title from picks k join pool_plays pp on pp.id = k.pool_play_id where k.user_id = $1 order by k.position", [userId])).map((r) => r.title);
const week = async () => (await query<{ status: string; phase: string; error: string | null }>("select status, phase, error from cora_weeks where week_of = $1", [WEEK]))[0];

let a: string, b: string, c: string;
beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  a = await member("a@example.com");
  b = await member("b@example.com");
  c = await member("c@example.com");
  await run(a, [play("Inbox triage", "inbox sort"), play("Listing post", "listing weekly", "Listings", "B")]);
  await run(b, [play("Calendar prep", "calendar briefs"), play("Follow-up drafts", "followup drafts", "Client follow-up", "B")]);
  await run(c, [play("Expense log", "expense capture", "Operations"), play("Inbox sorter", "inbox triage")]);
});

describe("runCoraJob", () => {
  it("works through every phase to ready, and never picks a user's own plays (spec check 13)", async () => {
    expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: live })).toMatchObject({ status: "ready" });
    expect(await week()).toMatchObject({ status: "ready", phase: "ready" });
    const mineA = ["Inbox triage", "Listing post"];
    const pa = await picksOf(a);
    expect(pa).toHaveLength(3);
    expect(pa.some((t) => mineA.includes(t))).toBe(false);
    // C's "Inbox sorter" merged into A's "Inbox triage": the same job is C's own play too.
    expect((await picksOf(c)).includes("Inbox triage")).toBe(false);
    expect(await query("select 1 from contribution_weeks where result = 'contributed'")).toHaveLength(3);
  });

  it("changes no row when run again for a finished week (spec check 16)", async () => {
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    const snapshot = async () => JSON.stringify(await query("select user_id, position, pool_play_id, reason from picks order by user_id, position"));
    const before = await snapshot();
    expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: live })).toMatchObject({ status: "ready" });
    expect(await snapshot()).toBe(before);
  });

  it("resumes after picking for some users and picks only for the rest", async () => {
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    const keep = await query<{ decided_at: string }>("select decided_at::text from cora_user_weeks where user_id = $1", [a]);
    await query("delete from picks where user_id <> $1", [a]);
    await query("delete from cora_user_weeks where user_id <> $1", [a]);
    await query("update cora_weeks set status = 'running', phase = 'scored'");
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    expect(await query<{ decided_at: string }>("select decided_at::text from cora_user_weeks where user_id = $1", [a])).toEqual(keep);
    expect(await picksOf(b)).toHaveLength(3);
  });

  it("keeps plays separate when merge decisions keep failing, after a few tries, and carries on", async () => {
    const flaky: MergeModel = { sameJob: async () => Promise.reject(new Error("model down")) };
    for (let i = 0; i < 2; i++) expect(await runCoraJob(query, deps({ merge: flaky }), { now: ONE_AM, settings: live })).toMatchObject({ status: "running", phase: "intake_closed" });
    expect(await runCoraJob(query, deps({ merge: flaky }), { now: ONE_AM, settings: live })).toMatchObject({ status: "ready" });
    expect(await query("select 1 from pool_plays")).toHaveLength(6);
  });

  it("fails the week on a real error: nothing picked, both admins alerted, and it cannot become ready later (spec check 17)", async () => {
    const broken: Query = async (t, p) => {
      if (/from pool_plays order by id/.test(t)) throw new Error("database went away");
      return query(t, p);
    };
    // A passing error is retried by the next run; the third in a row fails the week.
    expect(await runCoraJob(broken, deps({ query: broken }), { now: ONE_AM, settings: live })).toMatchObject({ status: "running" });
    expect(await runCoraJob(broken, deps({ query: broken }), { now: ONE_AM, settings: live })).toMatchObject({ status: "running" });
    expect(sent).toEqual([]);
    expect(await runCoraJob(broken, deps({ query: broken }), { now: ONE_AM, settings: live })).toMatchObject({ status: "failed" });
    expect(await week()).toMatchObject({ status: "failed", error: "database went away" });
    expect(await query("select 1 from picks")).toHaveLength(0);
    expect(sent.map((m) => m.subject)).toEqual(["[Roger] Cora failed for 2026-11-30"]);
    expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: live })).toMatchObject({ status: "failed" });
    expect(await query("select 1 from picks")).toHaveLength(0);
  });

  it("fails at once, by name, when the model has no credits, and keeps no play separate for it", async () => {
    const broke: MergeModel = { sameJob: async () => Promise.reject(Object.assign(new Error("Insufficient credits"), { statusCode: 402 })) };
    await runCoraJob(query, deps({ merge: broke }), { now: ONE_AM, settings: live });
    expect(await week()).toMatchObject({ status: "failed", error: expect.stringMatching(/^AI Gateway credits ran out/) });
    expect(await query("select 1 from pool_plays")).toHaveLength(0);
    expect(sent.map((m) => m.subject)).toEqual(["[Roger] Cora failed for 2026-11-30"]);
  });

  it("fails a week still not ready at noon, but a week ready at 6:20 is fine", async () => {
    expect(await runCoraJob(query, deps(), { now: new Date("2026-11-30T11:20:00Z"), settings: live })).toMatchObject({ status: "ready" }); // 6:20 AM
    const later = await runCoraJob(query, deps(), { now: new Date("2026-11-30T17:30:00Z"), settings: live }); // 12:30 PM
    expect(later.status).toBe("ready");
    await query("delete from cora_weeks");
    expect(await runCoraJob(query, deps(), { now: new Date("2026-11-30T17:30:00Z"), settings: live })).toMatchObject({ status: "failed", note: "noon" });
  });

  it("lets only one of two runs started together do the work", async () => {
    const [x, y] = await Promise.all([runCoraJob(query, deps(), { now: ONE_AM, settings: live }), runCoraJob(query, deps(), { now: ONE_AM, settings: live })]);
    expect([x.status, y.status].sort()).toEqual(["busy", "ready"]);
    expect(await query("select 1 from pool_plays")).toHaveLength(5);
  });

  it("does nothing while the cycle is off, unless it is a dry run; going live clears the dry run", async () => {
    expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: off })).toMatchObject({ status: "skipped" });
    expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: off, dryRun: true })).toMatchObject({ status: "ready" });
    expect(await query("select 1 from picks where dry_run")).toHaveLength(9);
    await clearDryRun(query);
    expect(await query("select 1 from picks")).toHaveLength(0);
    expect(await query("select 1 from cora_weeks")).toHaveLength(0);
  });

  it("a real run replaces a dry run for the same week", async () => {
    await runCoraJob(query, deps(), { now: ONE_AM, settings: off, dryRun: true });
    expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: live })).toMatchObject({ status: "ready" });
    expect(await query("select 1 from picks where dry_run")).toHaveLength(0);
    expect(await query("select 1 from picks where not dry_run")).toHaveLength(9);
  });

  it("never picks a linked seed contributor's own seed plays for that user (R25), and gives a trial user with no run no list", async () => {
    const [sc] = await query<{ id: string }>("insert into seed_contributors (label, user_id) values ('A as seed', $1) returning id", [a]);
    await query("insert into runs (contributor_id, week_of, route, agent, sharing, raw_text) values ($1, $2, 'seed', 'claude', 'share', $3)", [
      sc.id,
      WEEK,
      report([play("Seed only play", "seedonly thing", "Research")]),
    ]);
    const t = await member("t@example.com", { status: "trial" });
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    expect(await picksOf(a)).not.toContain("Seed only play");
    expect(await picksOf(b)).toContain("Seed only play");
    expect(await query("select outcome from cora_user_weeks where user_id = $1", [t])).toEqual([{ outcome: "not_eligible" }]);
  });

  it("writes a reason line that names no person and none of the user's own plays (spec check 14)", async () => {
    const leaky: FitModel = { fit: async (_u, cands) => cands.map((x) => ({ id: x.id, fit: 5 as const, frictionMatch: true, why: "friction" as const })) };
    await runCoraJob(query, deps({ fit: leaky }), { now: ONE_AM, settings: live });
    const reasons = (await query<{ reason: string }>("select reason from picks where user_id = $1", [a])).map((r) => r.reason);
    for (const r of reasons) {
      expect(r).not.toMatch(/Inbox triage|Dana/);
    }
  });
});

describe("review follow-ups (11c)", () => {
  it("a real run waits while a dry run still holds the week, and never lets the dry worker finish the real week", async () => {
    await query("insert into cora_weeks (week_of, dry_run, lease_until, holder) values ($1, true, now() + interval '5 minutes', 'dry-worker')", [WEEK]);
    expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: live })).toMatchObject({ status: "busy" });
    expect(await query("select dry_run from cora_weeks")).toEqual([{ dry_run: true }]);
    await query("update cora_weeks set lease_until = now() - interval '1 minute'");
    expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: live })).toMatchObject({ status: "ready" });
    expect(await query("select dry_run from cora_weeks")).toEqual([{ dry_run: false }]);
  });

  it("a dry run's failure alert never uses up the real week's alert", async () => {
    const broke: MergeModel = { sameJob: async () => Promise.reject(Object.assign(new Error("no credits"), { statusCode: 402 })) };
    await runCoraJob(query, deps({ merge: broke }), { now: ONE_AM, settings: off, dryRun: true });
    await runCoraJob(query, deps({ merge: broke }), { now: ONE_AM, settings: live });
    expect(sent.map((m) => m.subject)).toEqual(["[Roger] Cora's dry run failed for 2026-11-30", "[Roger] Cora failed for 2026-11-30"]);
  });

  it("finishes a week whose picks are all made, even at noon", async () => {
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    await query("update cora_weeks set status = 'running', phase = 'picked'");
    expect(await runCoraJob(query, deps(), { now: new Date("2026-11-30T17:30:00Z"), settings: live })).toMatchObject({ status: "ready" });
  });

  it("reports a week that never started by noon", async () => {
    expect(await runCoraJob(query, deps(), { now: new Date("2026-11-30T17:30:00Z"), settings: live })).toMatchObject({ status: "failed" });
    expect(sent).toHaveLength(1);
  });

  it("never rewrites the public sample play an admin read", async () => {
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    await query("update pool_plays set is_public_sample = true, title = 'Checked by an admin' where title = 'Calendar prep'");
    await query("delete from cora_weeks");
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    expect(await query("select title from pool_plays where is_public_sample")).toEqual([{ title: "Checked by an admin" }]);
  });

  it("records 'by choice' for a monthly member who doesn't share", async () => {
    await query("update users set sharing = 'match_only' where id = $1", [a]);
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    expect(await query("select result from contribution_weeks where user_id = $1", [a])).toEqual([{ result: "by_choice" }]);
  });

  it("counts only delivered picks as already sent", async () => {
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    const { loadUsers } = await import("./context");
    const sentNextWeek = async () => (await loadUsers(query, "2026-12-07", { onlyIds: [a] }))[0].ctx.sent.size;
    expect(await sentNextWeek()).toBe(0);
    await query("update picks set delivered_at = now() where user_id = $1", [a]);
    expect(await sentNextWeek()).toBe(3);
  });

  it("stops counting a member's plays as evidence once they stop sharing", async () => {
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    const { loadPool } = await import("./context");
    const count = async () => [...(await loadPool(query, WEEK)).evidence.values()].flat().length;
    const before = await count();
    await query("update users set sharing = 'off' where id = $1", [b]);
    expect(await count()).toBe(before - 2);
  });

  it("remembers a member's contribution after their play is replaced, so they are never picked it", async () => {
    await runCoraJob(query, deps(), { now: ONE_AM, settings: live });
    await query("update plays set pool_play_id = null where user_id = $1", [a]);
    const { loadUsers } = await import("./context");
    const [ua] = await loadUsers(query, WEEK, { onlyIds: [a] });
    const [{ id }] = await query<{ id: string }>("select id from pool_plays where title = 'Listing post'");
    expect(ua.ctx.ownContributions.has(id)).toBe(true);
  });
});
