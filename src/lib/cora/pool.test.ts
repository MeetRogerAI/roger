import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeFromPool } from "@/lib/admin/flags";
import type { Query } from "@/lib/db-query";
import type { IntakeModel } from "@/lib/intake/model";
import { testDb } from "@/test-helpers/pglite-db";
import { gatewayMergeModel, mergePending, type MergeModel, type MergePlay, type PoolCandidate } from "./merge";
import { dateFromFileName, importSeedRun } from "./seed-import";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
/** The gateway merge model's one call, stubbed: what it was asked, and what it answers. */
const gen = vi.hoisted(() => ({ calls: [] as { system: string; prompt: string }[], output: { match: "none", sure: false } }));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  generateText: async (a: { system: string; prompt: string }) => {
    gen.calls.push(a);
    return { output: gen.output };
  },
}));

let query: Query;
const cleanReview: IntakeModel = { readRun: async () => Promise.reject(new Error("unused")), review: async () => [], draftPlaybook: async () => "" };

/** A merge stand-in: plays whose job contains the same key word are the same. */
function keyModel(fail = new Set<string>()) {
  const asked: string[] = [];
  const m: MergeModel = {
    async sameJob(p: MergePlay, cands: PoolCandidate[]) {
      asked.push(p.title);
      if (fail.has(p.title)) throw new Error("model down");
      const key = p.job.split(" ")[0];
      return cands.find((c) => c.job.split(" ")[0] === key)?.id ?? null;
    },
  };
  return { m, asked };
}

const play = (title: string, job: string, o: Record<string, unknown> = {}) => ({
  set: "A",
  title,
  category: "Email and calendar",
  job,
  description: `${title} does things.`,
  minutes_saved_each: 10,
  playbook_md: "1. Step one.\n2. Step two.",
  install_notes: "Save as a skill.",
  ...o,
});
const report = (plays: unknown[]) => `# Zack The Collector (for Hark) v2.0\n\n\`\`\`roger-run\n${JSON.stringify({ zack_version: "2.0", plays })}\n\`\`\`\n`;

async function user(email: string, sharing = "share") {
  const [u] = await query<{ id: string }>("insert into users (email, status, sharing) values ($1, 'active', $2) returning id", [email, sharing]);
  return u.id;
}
async function runWith(userId: string, plays: unknown[], o: { sharing?: string; week?: string; test?: boolean } = {}) {
  const { processRun } = await import("@/lib/intake/process");
  const [r] = await query<{ id: string }>(
    "insert into runs (user_id, week_of, route, agent, sharing, raw_text, is_test) values ($1, $2, 'connector', 'hark', $3, $4, $5) returning id",
    [userId, o.week ?? "2026-11-30", o.sharing ?? "share", report(plays), o.test ?? false],
  );
  await processRun(query, r.id, { model: cleanReview, query });
  return r.id;
}
const pool = () => query<{ title: string; job: string; first_seen: string; last_seen: string }>("select title, job, to_char(first_seen, 'YYYY-MM-DD') as first_seen, to_char(last_seen, 'YYYY-MM-DD') as last_seen from pool_plays order by title");

beforeEach(async () => {
  ({ query } = await testDb());
  vi.stubEnv("ADMIN_EMAILS", "");
});

describe("mergePending", () => {
  it("creates pool plays for new jobs and joins the same job to the existing one", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    await runWith(a, [play("Inbox triage", "inbox sort and draft")], { week: "2026-11-23" });
    await runWith(b, [play("Morning email sort", "inbox triage each morning"), play("Calendar prep", "calendar briefs", { set: "B" })]);
    const t = await mergePending(query, keyModel().m);
    expect(t).toMatchObject({ created: 2, joined: 1, failed: 0 });
    expect(await pool()).toEqual([
      { title: "Calendar prep", job: "calendar briefs", first_seen: "2026-11-30", last_seen: "2026-11-30" },
      { title: "Inbox triage", job: "inbox sort and draft", first_seen: "2026-11-23", last_seen: "2026-11-30" },
    ]);
    expect(await query("select 1 from plays where pool_play_id is null")).toHaveLength(0);
  });

  it("keeps plays separate when the model fails, and carries on", async () => {
    const a = await user("a@example.com");
    await runWith(a, [play("Inbox triage", "inbox sort")], { week: "2026-11-23" });
    await mergePending(query, keyModel().m);
    const b = await user("b@example.com");
    await runWith(b, [play("Inbox sorter", "inbox again"), play("Calendar prep", "calendar briefs", { set: "B" })]);
    const failing = keyModel(new Set(["Inbox sorter"])).m;
    expect(await mergePending(query, failing)).toMatchObject({ failed: 1, created: 1 });
    await mergePending(query, failing);
    // The third failure keeps it separate, so one play never holds up the week.
    expect(await mergePending(query, failing)).toMatchObject({ failed: 1, created: 1 });
    expect((await pool()).map((p) => p.title)).toEqual(["Calendar prep", "Inbox sorter", "Inbox triage"]);
  });

  it("never asks again about plays already placed, so a stopped run resumes cleanly", async () => {
    const a = await user("a@example.com");
    await runWith(a, [play("One", "one job"), play("Two", "two job")]);
    const first = keyModel();
    await mergePending(query, first.m, { limit: 1 });
    const second = keyModel();
    await mergePending(query, second.m);
    await mergePending(query, second.m);
    expect(first.asked).toEqual(["One"]);
    expect(second.asked).toEqual(["Two"]);
    expect(await query("select 1 from pool_plays")).toHaveLength(2);
  });

  it("lets a 'matching only' play attach to a pool play but never create or change one", async () => {
    const a = await user("a@example.com");
    await runWith(a, [play("Inbox triage", "inbox sort")], { week: "2026-11-23" });
    await mergePending(query, keyModel().m);
    const b = await user("b@example.com", "match_only");
    await runWith(b, [play("Inbox", "inbox mine"), play("Secret job", "unique thing", { set: "B" })], { sharing: "match_only" });
    const t = await mergePending(query, keyModel().m);
    expect(t).toMatchObject({ matchOnly: 1, kept: 1, created: 0 });
    expect(await pool()).toEqual([{ title: "Inbox triage", job: "inbox sort", first_seen: "2026-11-23", last_seen: "2026-11-23" }]);
  });

  it("ignores test runs, and two merges at once place each play once", async () => {
    const a = await user("a@example.com");
    await runWith(a, [play("Test play", "test job")], { test: true });
    await runWith(a, [play("Real play", "real job")]);
    await Promise.all([mergePending(query, keyModel().m), mergePending(query, keyModel().m)]);
    expect((await pool()).map((p) => p.title)).toEqual(["Real play"]);
  });
});

describe("mergePending, review follow-ups", () => {
  it("does not pool a play whose user switched sharing off after intake", async () => {
    const a = await user("a@example.com");
    await runWith(a, [play("Inbox triage", "inbox sort")]);
    await query("update users set sharing = 'match_only'");
    const t = await mergePending(query, keyModel().m);
    expect(t).toMatchObject({ created: 0, kept: 1 });
    expect(await query("select 1 from pool_plays")).toHaveLength(0);
  });

  it("leaves flagged plays unplaced until an admin clears them", async () => {
    const a = await user("a@example.com");
    const run = await runWith(a, [play("Has a link", "linky job", { playbook_md: "1. Open https://example.com" })]);
    expect(await mergePending(query, keyModel().m)).toMatchObject({ created: 0, kept: 0 });
    // Clearing (Unit 17) makes it shareable and unflagged; the next merge places it.
    await query("update plays set flag = null, shareable = true where run_id = $1", [run]);
    expect(await mergePending(query, keyModel().m)).toMatchObject({ created: 1 });
  });

  it("returns at once when another process holds the merge lease", async () => {
    const { takeLease } = await import("./merge");
    expect(await takeLease(query, "cora-merge", "someone-else", 60)).toBe(true);
    const a = await user("a@example.com");
    await runWith(a, [play("Inbox triage", "inbox sort")]);
    expect(await mergePending(query, keyModel().m)).toMatchObject({ busy: true, created: 0 });
  });

  it("revives a retired pool play when the same job comes back", async () => {
    const a = await user("a@example.com");
    await runWith(a, [play("Inbox triage", "inbox sort")], { week: "2026-11-23" });
    await mergePending(query, keyModel().m);
    await query("update pool_plays set active = false");
    const b = await user("b@example.com");
    await runWith(b, [play("Inbox again", "inbox triage")]);
    expect(await mergePending(query, keyModel().m)).toMatchObject({ joined: 1, created: 0 });
    expect(await query("select 1 from pool_plays where active")).toHaveLength(1);
  });

  it("never revives a pool play an admin removed: the same job joins it and stays out (2026-11-28)", async () => {
    const a = await user("a@example.com");
    await runWith(a, [play("Inbox triage", "inbox sort")], { week: "2026-11-23" });
    await mergePending(query, keyModel().m);
    const [{ id }] = await query<{ id: string }>("select id from pool_plays");
    expect(await removeFromPool(query, "admin@example.com", id)).toMatchObject({ ok: true });
    const b = await user("b@example.com");
    await runWith(b, [play("Inbox again", "inbox triage")]);
    expect(await mergePending(query, keyModel().m)).toMatchObject({ joined: 1, created: 0 });
    expect(await query("select active, removed_at is not null as removed, to_char(last_seen, 'YYYY-MM-DD') as last_seen from pool_plays")).toEqual([
      { active: false, removed: true, last_seen: "2026-11-30" },
    ]);
    expect(await query("select 1 from plays where pool_play_id = $1", [id])).toHaveLength(2);
  });
});

describe("a removed pool play never comes back under a new id (2026-11-28 review F3, re-review G5)", () => {
  async function removedPlay(title = "Inbox triage", job = "inbox sort and draft morning mail", category = "Email and calendar") {
    const a = await user("a@example.com");
    await runWith(a, [play(title, job, { category })], { week: "2026-11-23" });
    await mergePending(query, keyModel().m);
    const [{ id }] = await query<{ id: string }>("select id from pool_plays where title = $1", [title]);
    await removeFromPool(query, "admin@example.com", id);
    return { a, id };
  }
  const placedIn = async (title: string) => (await query<{ pool_play_id: string | null }>("select pool_play_id from plays where title = $1", [title]))[0]?.pool_play_id;
  const asking = () => {
    const asked: string[] = [];
    return { asked, m: { sameJob: async (p: MergePlay) => (asked.push(p.title), null) } as MergeModel };
  };

  it("places, without asking the model, its title from its member or in its category, its member's same job, or its member's reworded play in its category", async () => {
    const { a, id } = await removedPlay();
    const b = await user("b@example.com");
    await runWith(b, [play("INBOX: Triage!", "something else entirely")]);
    await runWith(a, [play("Inbox triage", "a different job", { category: "Operations" }), play("Morning mail", "Inbox sort, and draft morning mail.", { set: "B" })], { week: "2026-12-07" });
    await runWith(a, [play("Morning inbox drafts", "draft the morning mail from the inbox each weekday")], { week: "2026-12-14" });
    const { asked, m } = asking();
    expect(await mergePending(query, m)).toMatchObject({ joined: 4, created: 0 });
    expect(asked).toEqual([]);
    for (const t of ["INBOX: Triage!", "Inbox triage", "Morning mail", "Morning inbox drafts"]) expect(await placedIn(t)).toBe(id);
    expect(await query("select active from pool_plays")).toEqual([{ active: false }]);
  });

  it("never swallows another member's play for a shared title in another category, or a same-job play by someone else: the model decides", async () => {
    const { a, id } = await removedPlay("Weekly report", "monday numbers into a summary for the team", "Marketing");
    const b = await user("b@example.com");
    await runWith(b, [play("Weekly report", "friday client billing totals", { category: "Operations" }), play("Team summary", "monday numbers into a summary for the team", { set: "B", category: "Marketing" })]);
    // Same member, other category, reworded: not enough on its own either.
    await runWith(a, [play("Numbers digest", "monday numbers into a summary", { category: "Sales" })], { week: "2026-12-07" });
    const { asked, m } = asking();
    expect(await mergePending(query, m)).toMatchObject({ created: 3, joined: 0 });
    expect(asked.sort()).toEqual(["Numbers digest", "Team summary", "Weekly report"]);
    for (const t of ["Team summary", "Numbers digest"]) expect(await placedIn(t)).not.toBe(id);
    expect(await query("select 1 from plays where pool_play_id = $1", [id])).toHaveLength(1);
  });

  it("offers the ten closest removed plays to the model, of any category and past the candidate cut, marked removed", async () => {
    const { id } = await removedPlay();
    await query("update pool_plays set category = 'Operations' where id = $1", [id]);
    for (let i = 0; i < 45; i++) {
      await query(
        "insert into pool_plays (title, category, description, playbook_md, paste_to_install, job, first_seen, last_seen) values ($1, 'Email and calendar', 'd', 'p', 'i', $2, '2026-11-23', '2026-11-23')",
        [`Filler ${i}`, `filler job number ${i} with many shared words inbox triage`],
      );
    }
    for (let i = 0; i < 12; i++) {
      await query(
        "insert into pool_plays (title, category, description, playbook_md, paste_to_install, job, first_seen, last_seen, removed_at) values ($1, 'Sales', 'd', 'p', 'i', $2, '2026-11-23', '2026-11-23', now())",
        [`Gone ${i}`, `unrelated removed job ${i}`],
      );
    }
    const b = await user("b@example.com");
    await runWith(b, [play("Mail sorter", "inbox sort again")]);
    let offered: PoolCandidate[] = [];
    const m: MergeModel = { sameJob: async (_p, cands) => ((offered = cands), cands.find((c) => c.id === id)?.id ?? null) };
    expect(await mergePending(query, m)).toMatchObject({ joined: 1, created: 0 });
    expect(offered).toHaveLength(40 + 10);
    expect(offered.filter((c) => c.removed)).toHaveLength(10);
    expect(offered.find((c) => c.id === id)).toMatchObject({ removed: true });
    expect(offered.filter((c) => c.title.startsWith("Filler")).every((c) => !c.removed)).toBe(true);
    expect(await placedIn("Mail sorter")).toBe(id);
  });

  it("tells the model which candidates were removed, and takes a match to one even when it is not sure", async () => {
    const cands: PoolCandidate[] = [
      { id: "live-1", title: "Inbox", job: "inbox sort", description: "d" },
      { id: "gone-1", title: "Inbox triage", job: "inbox sort", description: "d", removed: true },
    ];
    const p = { id: "p", title: "Mail sorter", category: "Email and calendar", job: "inbox sort", description: "d" };
    gen.output = { match: "gone-1", sure: false };
    expect(await gatewayMergeModel.sameJob(p, cands)).toBe("gone-1");
    expect(gen.calls[0].prompt).toMatch(/id="gone-1" status="removed by an admin"/);
    expect(gen.calls[0].prompt).not.toMatch(/id="live-1" status/);
    expect(gen.calls[0].system).toContain('status="removed by an admin"');
    // When in doubt, none, for a play still in the pool.
    gen.output = { match: "live-1", sure: false };
    expect(await gatewayMergeModel.sameJob(p, cands)).toBeNull();
    gen.output = { match: "live-1", sure: true };
    expect(await gatewayMergeModel.sameJob(p, cands)).toBe("live-1");
  });

  it("when the merge decision keeps failing, places a play plainly the same as a removed one of its category into it; anything else is kept separate as before", async () => {
    const { id } = await removedPlay();
    const b = await user("b@example.com");
    await runWith(b, [
      play("Inbox sorter", "inbox sorting of morning mail"),
      play("Calendar prep", "calendar briefs", { set: "B" }),
      play("Inbox sorter too", "inbox sorting of morning mail", { set: "B", category: "Operations" }),
    ]);
    const failing = keyModel(new Set(["Inbox sorter", "Calendar prep", "Inbox sorter too"])).m;
    for (let i = 0; i < 2; i++) expect(await mergePending(query, failing)).toMatchObject({ failed: 3, created: 0, joined: 0 });
    expect(await mergePending(query, failing)).toMatchObject({ failed: 3, created: 2, joined: 1 });
    expect(await placedIn("Inbox sorter")).toBe(id);
    expect((await pool()).map((p) => p.title)).toEqual(["Calendar prep", "Inbox sorter too", "Inbox triage"]);
  });

  it("a play with only a word or two in common with a removed one is not placed on a failed decision", async () => {
    const { id } = await removedPlay();
    const b = await user("b@example.com");
    await runWith(b, [play("Inbox zero coaching", "weekly coaching notes about inbox habits and focus time")]);
    const failing = keyModel(new Set(["Inbox zero coaching"])).m;
    for (let i = 0; i < 3; i++) await mergePending(query, failing);
    expect(await placedIn("Inbox zero coaching")).not.toBe(id);
    expect(await placedIn("Inbox zero coaching")).not.toBeNull();
  });
});

describe("importSeedRun", () => {
  it("stores a seed run under a hidden contributor, runs intake, and merges it into the pool at once", async () => {
    const r = await importSeedRun(query, { label: "Rob", agent: "Hark", text: report([play("Listing post", "listing post weekly")]), ranOn: "2026-11-12" }, { model: cleanReview, merge: keyModel().m, query });
    expect(r).toMatchObject({ weekOf: "2026-11-16", intake: "accepted", merge: { created: 1 } });
    const [p] = await query<{ contributor_id: string; user_id: string | null; shareable: boolean }>("select contributor_id, user_id, shareable from plays");
    expect(p).toEqual({ contributor_id: r.contributorId, user_id: null, shareable: true });
  });

  it("keeps one contributor for one person across agents, and re-importing the same file replaces it", async () => {
    const deps = { model: cleanReview, merge: keyModel().m, query };
    const a = await importSeedRun(query, { label: "Peter", agent: "hark", text: report([play("A", "alpha job")]), ranOn: "2026-11-12" }, deps);
    const b = await importSeedRun(query, { label: "Peter", agent: "claude", text: report([play("A2", "alpha again")]), ranOn: "2026-11-12" }, deps);
    expect(b.contributorId).toBe(a.contributorId);
    const c2 = await importSeedRun(query, { label: "peter", agent: "duet", text: report([play("A3", "alpha third")]), ranOn: "2026-11-12" }, deps);
    expect(c2.contributorId).toBe(a.contributorId);
    await expect(importSeedRun(query, { label: "Peter", agent: "hark", text: report([play("A", "alpha job")]), ranOn: "2026-11-12" }, deps)).rejects.toThrow(/already has a hark run/);
    expect(await query("select 1 from runs")).toHaveLength(3);
    expect(await query("select 1 from seed_contributors")).toHaveLength(1);
  });

  it("replacing a seed run with different text leaves no pool play pointing at the old text", async () => {
    const deps = { model: cleanReview, merge: keyModel().m, query };
    await importSeedRun(query, { label: "Rob", agent: "hark", text: report([play("Inbox triage", "inbox sort"), play("Listing post", "listing weekly", { set: "B" })]), ranOn: "2026-11-12" }, deps);
    const r = await importSeedRun(query, { label: "Rob", agent: "hark", text: report([play("Calendar prep", "calendar briefs")]), ranOn: "2026-11-12", replace: true }, deps);
    expect(r.replaced).toBe(true);
    const active = await query<{ title: string }>("select title from pool_plays where active order by title");
    expect(active.map((x) => x.title)).toEqual(["Calendar prep"]);
    const linked = await query<{ title: string; pool_title: string }>("select p.title, pp.title as pool_title from plays p join pool_plays pp on pp.id = p.pool_play_id");
    expect(linked).toEqual([{ title: "Calendar prep", pool_title: "Calendar prep" }]);
  });

  it("reads the date from a seed file's name", () => {
    expect(dateFromFileName("Zack Run - Rob - 2026-11-12.md")).toBe("2026-11-12");
    expect(dateFromFileName("Zack Run - Rob - RISE8_111326.md")).toBeNull();
  });
});
