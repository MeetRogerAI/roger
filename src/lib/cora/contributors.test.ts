import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/admin/users";
import type { Query } from "@/lib/db-query";
import type { IntakeModel } from "@/lib/intake/model";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { loadPool, loadUsers } from "./context";
import { relabelOrphanContributors, UNKNOWN_AUTHOR } from "./contributors";
import { eligiblePlays } from "./eligible";
import type { FitModel } from "./fit";
import { runCoraJob, type CoraDeps } from "./job";
import type { MergeModel } from "./merge";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * Peter's decision of November 26, 2026: when a shared play comes from a
 * deleted account, the record of who contributed it says "unknown author".
 * Real SQL on PGlite, through the real functions: the Cora job writes the
 * rows, deleteAccount relabels them, the hourly task backfills.
 */
let query: Query;
const transport: Transport = async () => ({ ok: true });
const ADMIN = "admin@example.com";
const WEEK = "2026-11-30";
const ONE_AM = new Date("2026-11-30T06:05:00Z");
const live = mergeV3([{ key: "v3.cycleLive", value: true }]);
/** The pool play two accounts contributed. */
const INBOX = "Inbox sorter";

const intake: IntakeModel = { readRun: async () => Promise.reject(new Error("unused")), review: async () => [] };
// Two plays are the same job when their job lines start with the same word.
const merge: MergeModel = { sameJob: async (p, cands) => cands.find((c) => c.job.split(" ")[0] === p.job.split(" ")[0])?.id ?? null };
const fit: FitModel = { fit: async (_u, cands) => cands.map((c) => ({ id: c.id, fit: 3 as const, frictionMatch: false, why: "category" as const })) };
const deps = (): CoraDeps => ({ intake, merge, fit, query, transport, sleep: async () => {} });

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

async function member(email: string) {
  const [u] = await query<{ id: string }>("insert into users (email, status, plan, sharing) values ($1, 'active', 'monthly', 'share') returning id", [email]);
  return u.id;
}
const run = (userId: string, plays: unknown[]) =>
  query("insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, $2, 'connector', 'hark', 'share', $3)", [userId, WEEK, report(plays)]);

type Row = { title: string; contributor: string };
const rows = () =>
  query<Row>("select pp.title, c.contributor from pool_play_contributors c join pool_plays pp on pp.id = c.pool_play_id order by pp.title, c.contributor");
const poolId = async (title: string) => (await query<{ id: string }>("select id from pool_plays where title = $1", [title]))[0].id;

/** Closes the account, as an admin must before deleting it, then deletes it. */
async function remove(userId: string, email: string) {
  await query("update users set status = 'closed' where id = $1", [userId]);
  return deleteAccount(query, ADMIN, userId, email);
}

/** What Cora knows about a user, in a form that compares. */
async function contextOf(userId: string) {
  const [u] = await loadUsers(query, WEEK, { onlyIds: [userId] });
  const pool = (await query<{ id: string; retired: boolean }>("select id, not active as retired from pool_plays order by id")).map((p) => ({ id: p.id, retired: p.retired }));
  return {
    own: [...u.ctx.ownContributions].sort(),
    runs: [...u.ctx.alreadyRuns].sort(),
    sent: [...u.ctx.sent].sort(),
    eligible: eligiblePlays(pool, u.ctx)
      .map((p) => p.id)
      .sort(),
  };
}

let a: string, b: string, c: string;
beforeEach(async () => {
  ({ query } = await testDb());
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  a = await member("a@example.com");
  b = await member("b@example.com");
  c = await member("c@example.com");
  // a and c both contribute the inbox job, so one pool play (titled by the first of the two placed) has two contributors.
  await run(a, [play("Inbox triage", "inbox sort"), play("Listing post", "listing weekly", "Listings", "B")]);
  await run(b, [play("Calendar prep", "calendar briefs"), play("Follow-up drafts", "followup drafts", "Client follow-up", "B")]);
  await run(c, [play("Expense log", "expense capture", "Operations"), play("Inbox sorter", "inbox triage")]);
  expect(await runCoraJob(query, deps(), { now: ONE_AM, settings: live })).toMatchObject({ status: "ready" });
});

describe("deleting an account relabels its contributor rows", () => {
  it("starts from one row per person per play, holding the account's id", async () => {
    expect(await rows()).toEqual([
      { title: "Calendar prep", contributor: b },
      { title: "Expense log", contributor: c },
      { title: "Follow-up drafts", contributor: b },
      ...[a, c].sort().map((contributor) => ({ title: INBOX, contributor })),
      { title: "Listing post", contributor: a },
    ]);
  });

  it("changes the deleted account's rows to 'unknown author' and leaves every other account's rows as they were", async () => {
    expect(await remove(a, "a@example.com")).toEqual({ ok: true, message: "Account deleted." });
    expect(await query("select 1 from users where id = $1", [a])).toEqual([]);
    expect(await rows()).toEqual([
      { title: "Calendar prep", contributor: b },
      { title: "Expense log", contributor: c },
      { title: "Follow-up drafts", contributor: b },
      ...[c, UNKNOWN_AUTHOR].sort().map((contributor) => ({ title: INBOX, contributor })),
      { title: "Listing post", contributor: UNKNOWN_AUTHOR },
    ]);
    // The deleted account's id is in no row any more, so the id the admin log keeps beside the address ties to no play.
    expect(await query("select 1 from pool_play_contributors where contributor = $1", [a])).toEqual([]);
    expect(await query("select action, user_id from admin_actions")).toEqual([{ action: "delete_account", user_id: a }]);
  });

  it("ends two deleted contributors of one play as exactly one 'unknown author' row", async () => {
    expect(await remove(a, "a@example.com")).toMatchObject({ ok: true });
    expect(await remove(c, "c@example.com")).toMatchObject({ ok: true });
    expect(await rows()).toEqual([
      { title: "Calendar prep", contributor: b },
      { title: "Expense log", contributor: UNKNOWN_AUTHOR },
      { title: "Follow-up drafts", contributor: b },
      { title: INBOX, contributor: UNKNOWN_AUTHOR },
      { title: "Listing post", contributor: UNKNOWN_AUTHOR },
    ]);
    // The hourly pass finds nothing left to do.
    expect(await relabelOrphanContributors(query)).toEqual({ relabelled: 0, dropped: 0 });
  });

  it("changes nothing when the delete is refused", async () => {
    const before = await rows();
    // Not closed, then closed with the wrong address typed.
    expect(await deleteAccount(query, ADMIN, a, "a@example.com")).toMatchObject({ ok: false });
    await query("update users set status = 'closed' where id = $1", [a]);
    expect(await deleteAccount(query, ADMIN, a, "someone@example.com")).toMatchObject({ ok: false });
    expect(await rows()).toEqual(before);
    expect(await query("select 1 from users where id = $1", [a])).toHaveLength(1);
  });

  it("changes nothing when the statement finds the account no longer deletable", async () => {
    const before = await rows();
    await query("update users set status = 'closed' where id = $1", [a]);
    // The first read sees a closed account; by the time the delete runs it has been reopened.
    let reads = 0;
    const racing: Query = async <T,>(text: string, params?: unknown[]) => {
      if (/^select email, status/.test(text) && reads++ === 0) {
        const seen = await query<T>(text, params);
        await query("update users set status = 'active' where id = $1", [a]);
        return seen;
      }
      return query<T>(text, params);
    };
    expect(await deleteAccount(racing, ADMIN, a, "a@example.com")).toEqual({ ok: false, message: "The account changed meanwhile. Reload and try again." });
    expect(await rows()).toEqual(before);
  });

  it("tries once more when another delete took the play's one 'unknown author' row in the same moment", async () => {
    await query("update users set status = 'closed' where id = $1", [c]);
    await remove(a, "a@example.com");
    let failed = false;
    const colliding: Query = <T,>(text: string, params?: unknown[]) => {
      if (/^with gone as/.test(text) && !failed) {
        failed = true;
        return Promise.reject(new Error('duplicate key value violates unique constraint "pool_play_contributors_pkey"'));
      }
      return query<T>(text, params);
    };
    expect(await deleteAccount(colliding, ADMIN, c, "c@example.com")).toMatchObject({ ok: true });
    expect(failed).toBe(true);
    expect((await rows()).filter((r) => r.title === INBOX)).toEqual([{ title: INBOX, contributor: UNKNOWN_AUTHOR }]);
    // Any other error is not swallowed.
    const broken: Query = <T,>(text: string, params?: unknown[]) => (/^with gone as/.test(text) ? Promise.reject(new Error("db blip")) : query<T>(text, params));
    await query("update users set status = 'closed' where id = $1", [b]);
    await expect(deleteAccount(broken, ADMIN, b, "b@example.com")).rejects.toThrow("db blip");
  });
});

describe("Cora and an 'unknown author' row", () => {
  it("leaves another user's context exactly as it was: nothing is excluded or included because of it", async () => {
    const before = await contextOf(b);
    await remove(a, "a@example.com");
    await remove(c, "c@example.com");
    expect(await contextOf(b)).toEqual(before);
    // b never contributed the plays that now say "unknown author", so they stay eligible for b.
    const unknown = (await query<{ pool_play_id: string }>("select pool_play_id from pool_play_contributors where contributor = $1", [UNKNOWN_AUTHOR])).map((r) => r.pool_play_id);
    expect(unknown).toHaveLength(3);
    const after = await contextOf(b);
    for (const id of unknown) expect(after.own).not.toContain(id);
  });

  it("still keeps a remaining contributor from being sent their own play when the other contributor is unknown", async () => {
    await remove(a, "a@example.com");
    const inbox = await poolId(INBOX);
    expect((await contextOf(c)).own).toContain(inbox);
    expect((await contextOf(c)).eligible).not.toContain(inbox);
  });

  it("never throws on a contributor that is not a user id, and treats no user as its author", async () => {
    const inbox = await poolId(INBOX);
    await query("insert into pool_play_contributors (pool_play_id, contributor) values ($1, $2), ($1, 'not-a-uuid')", [inbox, UNKNOWN_AUTHOR]);
    const users = await loadUsers(query, WEEK);
    expect(users.map((u) => u.id).sort()).toEqual([a, b, c].sort());
    expect(users.find((u) => u.id === b)!.ctx.ownContributions.has(inbox)).toBe(false);
  });

  it("does not count an unknown author in a play's evidence, so 'run by N users' counts only people still sharing", async () => {
    const inbox = await poolId(INBOX);
    const people = async () => [...new Set(((await loadPool(query, WEEK)).evidence.get(inbox) ?? []).map((e) => e.contributor))].sort();
    expect(await people()).toEqual([a, c].sort());
    await remove(a, "a@example.com");
    // The count is taken from the plays themselves, and a deleted account's plays go with it.
    expect(await people()).toEqual([c]);
  });
});

describe("the backfill for accounts deleted before the relabel existed", () => {
  const GONE_1 = "3f1c2a9e-5b7d-4c1a-9e2f-0a1b2c3d4e5f";
  const GONE_2 = "7a2b3c4d-1e2f-4a5b-8c9d-0e1f2a3b4c5d";

  it("relabels orphans, keeps one row a play, leaves live accounts and seed rows alone, and is safe to run twice", async () => {
    const [inbox, listing, calendar, expense] = await Promise.all([INBOX, "Listing post", "Calendar prep", "Expense log"].map(poolId));
    const [{ id: seed }] = await query<{ id: string }>("insert into seed_contributors (label) values ('Rob') returning id");
    await query(
      `insert into pool_play_contributors (pool_play_id, contributor) values
         ($1, $5), ($1, $6),            -- two deleted accounts on a play that also has live ones
         ($2, $5),                      -- one deleted account beside a live one
         ($3, $6), ($3, 'unknown author'), -- a play that already says unknown author
         ($4, 'not-a-uuid'),            -- a value that is no uuid at all
         ($4, $7)                       -- a seed row`,
      [inbox, listing, calendar, expense, GONE_1, GONE_2, `seed:${seed}`],
    );
    expect(await relabelOrphanContributors(query)).toEqual({ relabelled: 3, dropped: 2 });
    expect(await rows()).toEqual([
      ...[b, UNKNOWN_AUTHOR].sort().map((contributor) => ({ title: "Calendar prep", contributor })),
      ...[c, `seed:${seed}`, UNKNOWN_AUTHOR].sort().map((contributor) => ({ title: "Expense log", contributor })),
      { title: "Follow-up drafts", contributor: b },
      ...[a, c, UNKNOWN_AUTHOR].sort().map((contributor) => ({ title: INBOX, contributor })),
      ...[a, UNKNOWN_AUTHOR].sort().map((contributor) => ({ title: "Listing post", contributor })),
    ]);
    const settled = await rows();
    expect(await relabelOrphanContributors(query)).toEqual({ relabelled: 0, dropped: 0 });
    expect(await rows()).toEqual(settled);
  });

  it("relabels the rows of an account deleted the old way, with no relabel of its own", async () => {
    // What the code did before: the user row deleted and nothing else.
    await query("delete from users where id = $1", [a]);
    expect((await rows()).filter((r) => r.contributor === a)).toHaveLength(2);
    expect(await relabelOrphanContributors(query)).toEqual({ relabelled: 2, dropped: 0 });
    expect((await rows()).filter((r) => r.contributor === UNKNOWN_AUTHOR).map((r) => r.title)).toEqual([INBOX, "Listing post"]);
    expect((await rows()).filter((r) => r.contributor === a)).toEqual([]);
  });

  it("does nothing on a database with no orphans", async () => {
    const before = await rows();
    expect(await relabelOrphanContributors(query)).toEqual({ relabelled: 0, dropped: 0 });
    expect(await rows()).toEqual(before);
  });
});
