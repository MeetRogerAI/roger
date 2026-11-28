import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { blobSha, INSTRUCTION_FILES } from "@/lib/instructions/version";
import { fakeGitHub, type FakeGitHub } from "@/test-helpers/fake-github";
import { testDb } from "@/test-helpers/pglite-db";
import { member, note, run, WEEK } from "@/test-helpers/review-fixtures";
import { approveProposal, type ApprovingAdmin, commitMessage, outgoingCheck, overlapWarning, prBody, prTitle, rejectProposal, retrySupersedeCloses, syncPullRequests } from "./approve";
import type { ReviewGitHub } from "./github";
import { applyHunks, type Hunk, rebaseHunks, resolveHunks, spliceHunks, unifiedDiff } from "./hunks";
import { checkContext, publicId, readInstructionFiles } from "./propose";

const CLAUDE = "content/zack/claude.md";
const DUET = "content/zack/duet.md";
const CORA = "content/cora/cora.md";
const files = readInstructionFiles();
const TOKEN = "ghp_WRITEtoken0123456789abcdefghijklmnop";
const READ_TOKEN = "github_pat_READonly_0123456789abcdefghij";
const PETER: ApprovingAdmin = { by: "peter@roger.test", email: true };
const CK: ApprovingAdmin = { by: "ck@roger.test", email: true };
const PASSWORD: ApprovingAdmin = { by: "admin (password)", email: false };
const NOTE = "Zack keeps picking my weekly expense spreadsheet cleanup play even though I barely use it anymore";
const RATIONALE = "Priya says the spreadsheet cleanup play is stale for her";
const AT = new Date("2026-11-28T12:00:00Z");
const clock = () => AT;

const lines = (p: string) => (files[p as keyof typeof files] as string).split("\n");
const lineOf = (p: string, starts: string) => lines(p).findIndex((l) => l.startsWith(starts)) + 1;

/** A hunk that keeps a heading and its first line and adds a line after them. */
function hunkAfter(p: string, heading: string, add: string): Hunk[] {
  const s = lineOf(p, heading);
  const ls = lines(p);
  const r = resolveHunks(files[p as keyof typeof files] as string, [{ path: p, start_line: s, end_line: s + 1, new_text: `${ls[s - 1]}\n${ls[s]}\n${add}` }]);
  if (!r.ok) throw new Error(`fixture hunk: ${r.reason}`);
  return r.hunks;
}
const claudeHunk = (add = "Prefer plays the member used this week.") => hunkAfter(CLAUDE, "## What Zack does", add);
const duetHunk = () => hunkAfter(DUET, "## What Zack does", "Prefer plays the member used this week.");

let q: Query;
let gh: FakeGitHub;
let feedbackId: string;

beforeEach(async () => {
  ({ query: q } = await testDb());
  const a = await member(q, "priya@example.com", { name: "Priya Raman", displayName: "PriyaR" });
  await run(q, a);
  feedbackId = await note(q, a, NOTE);
  gh = fakeGitHub({ "README.md": "# Roger\n", ...Object.fromEntries(INSTRUCTION_FILES.map((f) => [f, files[f] as string])) });
});

const live = (): ReviewGitHub => ({ live: true, gw: gh.gateway({ token: TOKEN, canWrite: true }) });
const dry = (token: string | null = null): ReviewGitHub => ({ live: false, why: "this is not the production deployment", gw: gh.gateway({ token, canWrite: false }) });

async function insert(hunks: Hunk[], o: { guardrail?: boolean; status?: string; blocked?: string | null; documentOnly?: boolean; firstReadBy?: string | null } = {}): Promise<string> {
  const id = publicId();
  const paths = INSTRUCTION_FILES.filter((f) => hunks.some((h) => h.path === f));
  await q(
    `insert into review_proposals (public_id, review_week, paths, base_versions, hunks, diff_text, rationale, evidence, guardrail, guardrail_reasons, blocked_reason, status, document_only, first_read_by, created_at)
     values ($1, $2::date, $3::text[], '{}'::jsonb, $4::jsonb, 'stored diff', $5, $6::jsonb, $7, '[]'::jsonb, $8, $9, $10, $11, '2026-11-27T15:00:00Z')`,
    [
      id,
      WEEK,
      paths,
      JSON.stringify(hunks),
      RATIONALE,
      JSON.stringify([{ kind: "feedback", ref: feedbackId, why: "the note about the spreadsheet play" }]),
      o.guardrail ?? false,
      o.blocked ?? null,
      o.status ?? (o.blocked ? "blocked" : "pending"),
      o.documentOnly ?? paths.includes(CORA),
      o.firstReadBy ?? null,
    ],
  );
  return id;
}

const row = async (id: string) => (await q<Record<string, unknown>>(`select * from review_proposals where public_id = $1`, [id]))[0];
const approve = (id: string, admin: ApprovingAdmin = PETER, g: ReviewGitHub = live()) => approveProposal(q, id, admin, { gh: g, clock, files });
const writes = () => gh.writes.map((w) => `${w.method} ${w.path}`);
const expected = (base: string, hunks: Hunk[]) => {
  const r = applyHunks(base, hunks);
  if (!r.ok) throw new Error("fixture");
  return r.text;
};

describe("approve (live)", () => {
  it("opens one branch, one commit with exactly the hunks, and one PR whose body is the id and the diff", async () => {
    const hunks = claudeHunk();
    const id = await insert(hunks);
    const r = await approve(id);
    expect(r).toMatchObject({ status: "pr_open", pr_number: 101 });

    const branch = `review-bot/${id}`;
    expect(writes()).toEqual(["POST git/trees", "POST git/commits", "POST git/refs", "POST pulls"]);
    const after = expected(files[CLAUDE] as string, hunks);
    expect(gh.changedFiles(branch)).toEqual({ [CLAUDE]: after });
    expect(gh.commit(branch)?.parents).toEqual([gh.refs.get("main")]);
    expect(gh.commit(branch)?.message).toBe(`Review bot proposal ${id}`);

    const [pr] = gh.pulls;
    expect(pr).toMatchObject({ head: branch, base: "main", title: `Review bot: ${CLAUDE} (${id})`, state: "open" });
    expect(pr.body).toBe(prBody(id, unifiedDiff(CLAUDE, files[CLAUDE] as string, after)));
    expect(pr.body).toContain("+Prefer plays the member used this week.");

    expect(await row(id)).toMatchObject({
      status: "pr_open",
      pr_number: 101,
      pr_url: "https://github.com/MeetRogerAI/roger/pull/101",
      branch,
      main_commit: gh.refs.get("main"),
      result_versions: { [CLAUDE]: blobSha(after) },
      claim_token: null,
      claimed_at: null,
      approved_by: "peter@roger.test",
      error: null,
    });
  });

  it("builds on a main that moved (an unrelated line changed), still changing only the hunk", async () => {
    const hunks = claudeHunk();
    const id = await insert(hunks);
    const ls = lines(CLAUDE);
    const t = lineOf(CLAUDE, "## Time-saved method");
    const moved = [...ls.slice(0, t), "A line a person added on main.", ...ls.slice(t)].join("\n");
    gh.pushMain({ [CLAUDE]: moved });

    expect(await approve(id)).toMatchObject({ status: "pr_open" });
    expect(gh.changedFiles(`review-bot/${id}`)).toEqual({ [CLAUDE]: expected(moved, hunks) });
    expect(gh.file(`review-bot/${id}`, CLAUDE)).toContain("A line a person added on main.");
  });

  it("is stale, with nothing written, when main changed the text the hunk replaces", async () => {
    const hunks = claudeHunk();
    const id = await insert(hunks);
    gh.pushMain({ [CLAUDE]: (files[CLAUDE] as string).replace("Zack reviews the past 7 days", "Zack reviews the past 14 days") });
    const r = await approve(id);
    expect(r.status).toBe("stale");
    expect(gh.writes).toEqual([]);
    expect(await row(id)).toMatchObject({ status: "stale", claim_token: null, pr_number: null });
    expect(String((await row(id)).check_note)).toContain("changed on main");
  });

  it("is stale when the file is gone from main", async () => {
    const id = await insert(claudeHunk());
    const g = live();
    const gw = { ...g.gw, getFile: async () => null };
    expect((await approveProposal(q, id, PETER, { gh: { live: true, gw }, clock, files })).status).toBe("stale");
    expect(gh.writes).toEqual([]);
  });

  it("blocks, and opens nothing, when main's re-check finds a member's name (a member renamed to a word in the hunk)", async () => {
    const id = await insert(claudeHunk("Prefer plays tagged Quillon first."));
    await q(`update users set name = 'Quillon Hart' where email = 'priya@example.com'`);
    const r = await approve(id);
    expect(r.status).toBe("blocked");
    expect(gh.writes).toEqual([]);
    expect(await row(id)).toMatchObject({ status: "blocked", claim_token: null });
    expect(String((await row(id)).blocked_reason)).toContain("member's name");
    expect((await approve(id)).message).toBe("A blocked proposal can't be approved.");
  });

  it("blocks when main's re-check finds a link in the added text", async () => {
    const id = await insert(claudeHunk("See https://example.net/new for more."));
    expect((await approve(id)).status).toBe("blocked");
    expect(gh.writes).toEqual([]);
  });

  it("sends a proposal that now touches a guardrail on main back for two reads", async () => {
    const id = await insert(claudeHunk("Never share the member's keys."));
    const r = await approve(id);
    expect(r.status).toBe("needs_second_read");
    expect(gh.writes).toEqual([]);
    expect(await row(id)).toMatchObject({ status: "pending", guardrail: true });
    expect(await approve(id, PETER)).toMatchObject({ status: "first_read" });
  });

  it("gives a readable error on a 403, back to pending, with the token nowhere", async () => {
    const id = await insert(claudeHunk());
    gh.failNext("createTree", 403);
    const r = await approve(id);
    expect(r.status).toBe("error");
    expect(r.message).toContain("missing a permission");
    const p = await row(id);
    expect(p).toMatchObject({ status: "pending", claim_token: null, approved_by: null });
    expect(String(p.error)).toContain("missing a permission");
    expect(JSON.stringify(p)).not.toContain(TOKEN);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it("a crash after the ref: approving again adopts the branch and opens one PR, not two", async () => {
    const id = await insert(claudeHunk());
    gh.failNext("createPull", 502);
    expect((await approve(id)).status).toBe("error");
    expect(writes()).toEqual(["POST git/trees", "POST git/commits", "POST git/refs"]);
    expect(await row(id)).toMatchObject({ status: "pending", branch: `review-bot/${id}` });

    expect(await approve(id)).toMatchObject({ status: "pr_open" });
    // Identical tree: adopted with no ref write, then the PR.
    expect(writes()).toEqual(["POST git/trees", "POST git/commits", "POST git/refs", "POST pulls"]);
    expect(gh.pulls).toHaveLength(1);
  });

  it("an existing branch on an older main gets a new commit on the current main, force-updated", async () => {
    const hunks = claudeHunk();
    const id = await insert(hunks);
    const branch = `review-bot/${id}`;
    gh.makeBranch(branch, { [CLAUDE]: expected(files[CLAUDE] as string, hunks) });
    const t = lineOf(CLAUDE, "## Time-saved method");
    const ls = lines(CLAUDE);
    const moved = [...ls.slice(0, t), "Main moved on.", ...ls.slice(t)].join("\n");
    gh.pushMain({ [CLAUDE]: moved });

    expect(await approve(id)).toMatchObject({ status: "pr_open" });
    expect(writes()).toEqual(["POST git/trees", "POST git/commits", `PATCH git/refs/heads/${branch}`, "POST pulls"]);
    expect(gh.writes[2].body).toMatchObject({ force: true });
    expect(gh.commit(branch)?.parents).toEqual([gh.refs.get("main")]);
    expect(gh.changedFiles(branch)).toEqual({ [CLAUDE]: expected(moved, hunks) });
  });

  it("a branch someone pushed other files to is not trusted: it is replaced", async () => {
    const hunks = claudeHunk();
    const id = await insert(hunks);
    gh.makeBranch(`review-bot/${id}`, { [CLAUDE]: expected(files[CLAUDE] as string, hunks), "README.md": "# Something else\n" });
    expect(await approve(id)).toMatchObject({ status: "pr_open" });
    expect(writes()).toContain(`PATCH git/refs/heads/review-bot/${id}`);
    expect(gh.file(`review-bot/${id}`, "README.md")).toBe("# Roger\n");
  });

  it("a ref created meanwhile (422 on create) is moved to the fresh commit", async () => {
    const id = await insert(claudeHunk());
    gh.failNext("createRef", 422, undefined, "Reference already exists");
    gh.makeBranch(`review-bot/${id}`, { "README.md": "# Race\n" });
    // The branch appears after the lookup: hide it from the first getRef.
    const g = live();
    let first = true;
    const gw = { ...g.gw, getRef: async (b: string) => (b !== "main" && first ? ((first = false), null) : g.gw.getRef(b)) };
    expect(await approveProposal(q, id, PETER, { gh: { live: true, gw }, clock, files })).toMatchObject({ status: "pr_open" });
    expect(writes()).toContain(`PATCH git/refs/heads/review-bot/${id}`);
    expect(gh.file(`review-bot/${id}`, "README.md")).toBe("# Roger\n");
  });

  it("adopts an open PR for the branch, and reopens a closed unmerged one", async () => {
    const id = await insert(claudeHunk());
    expect((await approve(id)).status).toBe("pr_open");
    gh.closePull(101);
    await q(`update review_proposals set status = 'pending', pr_number = null where public_id = $1`, [id]);
    expect(await approve(id)).toMatchObject({ status: "pr_open", pr_number: 101 });
    expect(gh.pulls).toHaveLength(1);
    expect(gh.pulls[0].state).toBe("open");
    expect(writes().slice(-1)).toEqual(["PATCH pulls/101"]);
  });

  it("an adopted open PR whose branch is force-updated gets the fresh title and body, matching the new commit", async () => {
    const hunks = claudeHunk();
    const id = await insert(hunks);
    expect((await approve(id)).status).toBe("pr_open");
    const oldBody = gh.pulls[0].body;
    // A line added above the hunk: the diff's line numbers move, so the old body no longer matches.
    const t = lineOf(CLAUDE, "## What Zack does") - 1;
    const ls = lines(CLAUDE);
    const moved = [...ls.slice(0, t), "Main moved on.", "", ...ls.slice(t)].join("\n");
    gh.pushMain({ [CLAUDE]: moved });
    await q(`update review_proposals set status = 'pending', pr_number = null where public_id = $1`, [id]);

    expect(await approve(id)).toMatchObject({ status: "pr_open", pr_number: 101 });
    expect(writes().slice(-2)).toEqual([`PATCH git/refs/heads/review-bot/${id}`, "PATCH pulls/101"]);
    const body = prBody(id, unifiedDiff(CLAUDE, moved, expected(moved, hunks)));
    expect(gh.pulls[0].body).toBe(body);
    expect(gh.pulls[0].body).not.toBe(oldBody);
    expect(gh.pulls[0].title).toBe(prTitle([CLAUDE], id));
    expect(gh.writes[gh.writes.length - 1].body).toEqual({ title: prTitle([CLAUDE], id), body });
    expect(gh.pulls).toHaveLength(1);
  });

  it("an adopted PR whose title and body already match is not edited", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    await q(`update review_proposals set status = 'pending', pr_number = null where public_id = $1`, [id]);
    const n = gh.writes.length;
    expect((await approve(id)).status).toBe("pr_open");
    expect(gh.writes.length).toBe(n);
  });

  it("a PR already merged at approval is recorded merged, with result_versions and edited_before_merge, and nothing else is written", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    const committed = gh.file(`review-bot/${id}`, CLAUDE) as string;
    // The pr_open write was lost; a person merged the PR meanwhile.
    await q(`update review_proposals set status = 'pending', pr_number = null, pr_url = null, result_versions = null where public_id = $1`, [id]);
    gh.merge(101);
    const n = gh.writes.length;
    expect(await approve(id)).toMatchObject({ status: "merged", pr_number: 101 });
    expect(gh.writes.slice(n).map((w) => `${w.method} ${w.path}`)).toEqual([`DELETE git/refs/heads/review-bot/${id}`]);
    expect(await row(id)).toMatchObject({
      status: "merged",
      pr_number: 101,
      result_versions: { [CLAUDE]: blobSha(committed) },
      edited_before_merge: false,
      merged_at: expect.anything(),
      claim_token: null,
      branch_deleted_at: expect.anything(),
    });
  });

  it("a PR merged after a person's edit, found at approval: edited_before_merge, result_versions what the bot committed", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    const committed = gh.file(`review-bot/${id}`, CLAUDE) as string;
    await q(`update review_proposals set status = 'pending', pr_number = null, result_versions = null where public_id = $1`, [id]);
    gh.merge(101, { [CLAUDE]: `${committed}\nA person's edit on GitHub.\n` });
    expect((await approve(id)).status).toBe("merged");
    expect(await row(id)).toMatchObject({ status: "merged", result_versions: { [CLAUDE]: blobSha(committed) }, edited_before_merge: true });
  });

  it("adopts the PR when GitHub says one already exists for the head (422)", async () => {
    const id = await insert(claudeHunk());
    const g = live();
    let calls = 0;
    // The lookup misses a PR that is there (GitHub's list lagging), then create gets 422.
    const gw = { ...g.gw, findPulls: async (b: string) => (calls++ === 0 ? [] : g.gw.findPulls(b)) };
    await g.gw.createRef(`review-bot/${id}`, gh.refs.get("main") as string);
    await g.gw.createPull({ title: "t", body: "b", head: `review-bot/${id}`, base: "main" });
    expect(await approveProposal(q, id, PETER, { gh: { live: true, gw }, clock, files })).toMatchObject({ status: "pr_open", pr_number: 101 });
    expect(gh.pulls).toHaveLength(1);
  });

  it("two admins approving at once: one claim wins, the other is told it is already being approved", async () => {
    const id = await insert(claudeHunk());
    const [a, b] = await Promise.all([approve(id, PETER), approve(id, CK)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["busy", "pr_open"]);
    expect([a, b].find((x) => x.status === "busy")?.message).toContain("already being approved");
    expect(gh.pulls).toHaveLength(1);
  });

  it("takes over an abandoned approval, but not a live one", async () => {
    const id = await insert(claudeHunk());
    await q(`update review_proposals set status = 'approving', claim_token = 'old', claimed_at = $2 where public_id = $1`, [id, new Date(AT.getTime() - 60_000).toISOString()]);
    expect((await approve(id)).status).toBe("busy");
    await q(`update review_proposals set claimed_at = $2 where public_id = $1`, [id, new Date(AT.getTime() - 400_000).toISOString()]);
    expect((await approve(id)).status).toBe("pr_open");
  });

  it("refuses a proposal that edits cora.md without its Document only label, and opens a labelled one", async () => {
    const hunks = hunkAfter(CORA, "## What Cora writes", "Keep each idea to one short paragraph.");
    const unlabelled = await insert(hunks, { documentOnly: false });
    expect(await approve(unlabelled)).toMatchObject({ status: "refused", message: expect.stringContaining("Document only") });
    expect(gh.writes).toEqual([]);
    const labelled = await insert(hunks, { documentOnly: true });
    expect((await approve(labelled)).status).toBe("pr_open");
  });

  it("refuses statuses that can't be approved", async () => {
    for (const status of ["rejected", "stale", "merged"]) {
      const id = await insert(claudeHunk(), { status: status === "merged" ? "pending" : status });
      if (status === "merged") await q(`update review_proposals set status = 'merged', pr_number = 999 where public_id = $1`, [id]);
      expect((await approve(id)).status).toBe("refused");
    }
    expect((await approve("nosuchidxx")).status).toBe("refused");
    expect(gh.writes).toEqual([]);
  });
});

describe("guardrail proposals: two reads", () => {
  const banHunk = () => hunkAfter(CLAUDE, "## Ban list", "Ban the person, never the method.");

  it("the first approval is a first read with no PR; the same admin again is refused; a different email admin opens the PR", async () => {
    const id = await insert(banHunk(), { guardrail: true });
    expect(await approve(id, PETER)).toMatchObject({ status: "first_read" });
    expect(await row(id)).toMatchObject({ status: "first_read", first_read_by: "peter@roger.test" });
    expect(gh.writes).toEqual([]);

    expect(await approve(id, { by: "PETER@roger.test", email: true })).toMatchObject({ status: "refused", message: expect.stringContaining("different admin") });
    expect(gh.writes).toEqual([]);

    expect(await approve(id, CK)).toMatchObject({ status: "pr_open" });
    expect(await row(id)).toMatchObject({ status: "pr_open", first_read_by: "peter@roger.test", approved_by: "ck@roger.test" });
  });

  it("the password admin can give neither read", async () => {
    const id = await insert(banHunk(), { guardrail: true });
    expect((await approve(id, PASSWORD)).status).toBe("refused");
    expect(await row(id)).toMatchObject({ status: "pending", first_read_by: null });
    await approve(id, PETER);
    expect((await approve(id, PASSWORD)).status).toBe("refused");
    expect(await row(id)).toMatchObject({ status: "first_read" });
    expect(gh.writes).toEqual([]);
  });

  it("the password admin may approve a proposal that touches no guardrail", async () => {
    const id = await insert(claudeHunk());
    expect((await approve(id, PASSWORD)).status).toBe("pr_open");
  });

  it("a failed second read goes back to first_read, keeping the first read", async () => {
    const id = await insert(banHunk(), { guardrail: true });
    await approve(id, PETER);
    gh.failNext("createPull", 500);
    expect((await approve(id, CK)).status).toBe("error");
    expect(await row(id)).toMatchObject({ status: "first_read", first_read_by: "peter@roger.test" });
  });
});

describe("superseding", () => {
  it("B on claude.md, covering every line A changed, closes A's open PR and deletes A's branch; A is superseded by B", async () => {
    const a = await insert(claudeHunk());
    expect((await approve(a)).status).toBe("pr_open");
    const b = await insert(claudeHunk("Prefer plays the member used most this week."));
    const r = await approve(b);
    expect(r).toMatchObject({ status: "pr_open", pr_number: 102, superseded: [a] });

    // B opened before A closed.
    const w = writes();
    expect(w.indexOf("POST pulls", 4)).toBeLessThan(w.indexOf("PATCH pulls/101"));
    expect(w).toContain(`DELETE git/refs/heads/review-bot/${a}`);
    expect(gh.pulls[0].state).toBe("closed");
    expect(gh.refs.has(`review-bot/${a}`)).toBe(false);
    const rowB = await row(b);
    expect(await row(a)).toMatchObject({ status: "superseded", superseded_by: rowB.id, close_pending: false, branch_deleted_at: expect.anything() });
  });

  it("a close that fails leaves close_pending, and the next sync closes it", async () => {
    const a = await insert(claudeHunk());
    await approve(a);
    gh.failNext("updatePull", 502);
    const b = await insert(claudeHunk("Prefer plays the member used most this week."));
    expect((await approve(b)).status).toBe("pr_open");
    expect(await row(a)).toMatchObject({ status: "pr_open", close_pending: true, superseded_by: (await row(b)).id });
    expect(gh.pulls[0].state).toBe("open");

    expect(await retrySupersedeCloses(q, live(), { clock })).toMatchObject({ superseded: 1, errors: 0 });
    expect(await row(a)).toMatchObject({ status: "superseded", close_pending: false });
    expect(gh.pulls[0].state).toBe("closed");
  });

  it("a proposal on duet.md doesn't supersede one on claude.md", async () => {
    const a = await insert(claudeHunk());
    await approve(a);
    const b = await insert(duetHunk());
    expect(await approve(b)).toMatchObject({ status: "pr_open", superseded: [], overlap: [] });
    expect((await row(a)).status).toBe("pr_open");
  });

  it("A covers claude.md and duet.md, B only claude.md: the overlap is shown, and A stays open", async () => {
    const a = await insert([...claudeHunk(), ...duetHunk()]);
    await approve(a);
    const b = await insert(hunkAfter(CLAUDE, "## What Zack reads", "Read the newest activity first."));
    expect(await overlapWarning(q, b)).toEqual([{ public_id: a, pr_number: 101, only_in_other: [DUET], lines_only_in_other: [CLAUDE] }]);
    const r = await approve(b);
    expect(r).toMatchObject({ status: "pr_open", superseded: [], overlap: [{ public_id: a, only_in_other: [DUET] }] });
    expect(r.message).toContain("both pull requests stay open");
    expect(await row(a)).toMatchObject({ status: "pr_open", superseded_by: null, close_pending: false });
    expect(gh.pulls[0].state).toBe("open");
  });

  it("A covers claude.md, B covers A's lines of claude.md and duet.md: A is superseded", async () => {
    const a = await insert(claudeHunk());
    await approve(a);
    const b = await insert([...claudeHunk("Prefer plays the member used most this week."), ...duetHunk()]);
    expect(await approve(b)).toMatchObject({ status: "pr_open", superseded: [a] });
    expect((await row(a)).status).toBe("superseded");
  });

  it("A merged on GitHub just before B's approval: A is merged, nothing is closed, and A is never superseded", async () => {
    const a = await insert(claudeHunk());
    await approve(a);
    gh.merge(101);
    const b = await insert(hunkAfter(CLAUDE, "## What Zack reads", "Read the newest activity first."));
    expect(await approve(b)).toMatchObject({ status: "pr_open", superseded: [] });
    expect(writes()).not.toContain("PATCH pulls/101");
    expect(await row(a)).toMatchObject({ status: "merged", superseded_by: null, edited_before_merge: false, merged_at: expect.anything() });
  });

  it("A and B change different sections of the same file: both stay open, with the overlap warning", async () => {
    const a = await insert(claudeHunk());
    await approve(a);
    const b = await insert(hunkAfter(CLAUDE, "## What Zack reads", "Read the newest activity first."));
    expect(await overlapWarning(q, b)).toEqual([{ public_id: a, pr_number: 101, only_in_other: [], lines_only_in_other: [CLAUDE] }]);
    const r = await approve(b);
    expect(r).toMatchObject({ status: "pr_open", pr_number: 102, superseded: [], overlap: [{ public_id: a, pr_number: 101, only_in_other: [], lines_only_in_other: [CLAUDE] }] });
    expect(r.message).toContain("both pull requests stay open");
    expect(writes()).not.toContain("PATCH pulls/101");
    expect(await row(a)).toMatchObject({ status: "pr_open", superseded_by: null, close_pending: false });
    expect(gh.pulls.map((p) => p.state)).toEqual(["open", "open"]);
  });

  it("B covers only part of A's lines in the file: both stay open", async () => {
    // A replaces the heading, its first line and the next; B only the heading and its first line.
    const s = lineOf(CLAUDE, "## What Zack does");
    const ls = lines(CLAUDE);
    const r = resolveHunks(files[CLAUDE] as string, [{ path: CLAUDE, start_line: s, end_line: s + 2, new_text: `${ls[s - 1]}\n${ls[s]}\n${ls[s + 1]}\nPrefer plays the member used this week.` }]);
    if (!r.ok) throw new Error("fixture");
    const a = await insert(r.hunks);
    await approve(a);
    const b = await insert(claudeHunk("Prefer plays the member used most this week."));
    expect(await approve(b)).toMatchObject({ status: "pr_open", superseded: [], overlap: [{ public_id: a, lines_only_in_other: [CLAUDE] }] });
    expect((await row(a)).status).toBe("pr_open");
  });

  it("a close_pending retry that finds A merged marks it merged and stops", async () => {
    const a = await insert(claudeHunk());
    await approve(a);
    gh.failNext("updatePull", 502);
    const b = await insert(claudeHunk("Prefer plays the member used most this week."));
    await approve(b);
    gh.merge(101);
    await retrySupersedeCloses(q, live(), { clock });
    expect(await row(a)).toMatchObject({ status: "merged", close_pending: false });
    expect(writes().filter((w) => w === "PATCH pulls/101")).toEqual([]);
  });
});

describe("syncPullRequests", () => {
  it("records a merge, deletes the head branch and sets branch_deleted_at; merged stays final", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    gh.merge(101);
    expect(await syncPullRequests(q, live(), { clock })).toMatchObject({ merged: 1, errors: 0 });
    expect(await row(id)).toMatchObject({ status: "merged", edited_before_merge: false, branch_deleted_at: expect.anything(), merged_at: expect.anything() });
    expect(gh.refs.has(`review-bot/${id}`)).toBe(false);
    const n = gh.writes.length;
    await syncPullRequests(q, live(), { clock });
    expect(gh.writes.length).toBe(n);
    expect((await row(id)).status).toBe("merged");
  });

  it("sets edited_before_merge when the merged head differs from what the bot committed", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    gh.merge(101, { [CLAUDE]: `${gh.file(`review-bot/${id}`, CLAUDE)}\nA person's edit on GitHub.\n` });
    await syncPullRequests(q, live(), { clock });
    expect(await row(id)).toMatchObject({ status: "merged", edited_before_merge: true });
  });

  it("records a PR closed without merging as closed, and deletes its branch; an already-gone branch counts as deleted", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    gh.closePull(101);
    gh.refs.delete(`review-bot/${id}`);
    await syncPullRequests(q, live(), { clock });
    expect(await row(id)).toMatchObject({ status: "closed", closed_at: expect.anything(), branch_deleted_at: expect.anything() });
  });

  it("retries a failed branch delete on the next sync", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    gh.merge(101);
    gh.failNext("deleteRef", 502);
    await syncPullRequests(q, live(), { clock });
    expect(await row(id)).toMatchObject({ status: "merged", branch_deleted_at: null });
    await syncPullRequests(q, live(), { clock });
    expect((await row(id)).branch_deleted_at).not.toBeNull();
    expect(gh.refs.has(`review-bot/${id}`)).toBe(false);
  });

  it("a rate-limited read is counted as an error and the row is left for next time", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    gh.failNext("getPull", 429);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await syncPullRequests(q, live(), { clock })).toMatchObject({ errors: 1 });
    } finally {
      err.mockRestore();
    }
    expect((await row(id)).status).toBe("pr_open");
  });

  it("never deletes a branch that is not the proposal's own review-bot/{public_id}", async () => {
    const id = await insert(claudeHunk());
    await approve(id);
    gh.makeBranch("review-bot/aaaaaaaaaa", { "README.md": "# Another\n" });
    await q(`update review_proposals set branch = 'review-bot/aaaaaaaaaa' where public_id = $1`, [id]);
    gh.merge(101);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await syncPullRequests(q, live(), { clock });
      await q(`update review_proposals set branch = 'main' where public_id = $1`, [id]);
      await syncPullRequests(q, live(), { clock });
    } finally {
      err.mockRestore();
    }
    expect(await row(id)).toMatchObject({ status: "merged", branch_deleted_at: null });
    expect(gh.refs.has("review-bot/aaaaaaaaaa")).toBe(true);
    expect(gh.refs.has("main")).toBe(true);
    expect(gh.calls.filter((c) => c.op === "deleteRef")).toEqual([]);
  });

  it("does nothing in a dry run", async () => {
    expect(await syncPullRequests(q, dry(), { clock })).toMatchObject({ status: "skipped" });
    expect(gh.calls).toEqual([]);
  });
});

describe("approve (dry run)", () => {
  it("records the tree, commit, ref and PR (and the supersede close), sends no write, and is dry_run", async () => {
    // An open PR A from production, covered by B.
    const a = await insert(claudeHunk());
    await approve(a);
    const before = gh.writes.length;
    const b = await insert(claudeHunk("Prefer plays the member used most this week."));
    const r = await approve(b, PETER, dry());
    expect(r.status).toBe("dry_run");
    expect(gh.writes.length).toBe(before);
    const p = await row(b);
    expect(p).toMatchObject({ status: "dry_run", pr_number: null, claim_token: null, main_commit: gh.refs.get("main"), check_note: null });
    const payload = p.dry_run_payload as { writes: { method: string; path: string; body?: Record<string, unknown> }[]; title: string; body: string; commit_message: string; branch: string };
    expect(payload.writes.map((w) => `${w.method} ${w.path}`)).toEqual(["POST git/trees", "POST git/commits", "POST git/refs", "POST pulls", "PATCH pulls/101", `DELETE git/refs/heads/review-bot/${a}`]);
    expect(payload.branch).toBe(`review-bot/${b}`);
    expect(payload.commit_message).toBe(`Review bot proposal ${b}`);
    expect(await row(a)).toMatchObject({ status: "pr_open" });
  });

  it("an existing branch with an older tree is recorded as a forced update", async () => {
    const id = await insert(claudeHunk());
    gh.makeBranch(`review-bot/${id}`, { "README.md": "# old\n" });
    await approve(id, PETER, dry());
    const payload = (await row(id)).dry_run_payload as { writes: { method: string; path: string; body?: Record<string, unknown> }[] };
    expect(payload.writes.map((w) => `${w.method} ${w.path}`)).toEqual(["POST git/trees", "POST git/commits", `PATCH git/refs/heads/review-bot/${id}`, "POST pulls"]);
    expect(payload.writes[2].body).toMatchObject({ force: true });
    expect(gh.writes).toEqual([]);
  });

  it("reads carry GITHUB_READ_TOKEN when set and nothing otherwise; no token is in the payload", async () => {
    const id = await insert(claudeHunk());
    await approve(id, PETER, dry(READ_TOKEN));
    expect(gh.calls.length).toBeGreaterThan(0);
    expect(gh.calls.every((c) => c.token === READ_TOKEN)).toBe(true);
    const id2 = await insert(duetHunk());
    gh.calls.length = 0;
    await approve(id2, PETER, dry(null));
    expect(gh.calls.every((c) => c.token === null)).toBe(true);
    const all = JSON.stringify(await q(`select * from review_proposals`));
    expect(all).not.toContain(READ_TOKEN);
    expect(all).not.toContain(TOKEN);
  });

  it("a rate-limited read of main skips the stale check: pending, 'Stale check skipped', no payload, not dry_run", async () => {
    const id = await insert(claudeHunk());
    gh.setUnauthenticatedLimit(0);
    const r = await approve(id, PETER, dry());
    expect(r.status).toBe("check_skipped");
    const p = await row(id);
    expect(p).toMatchObject({ status: "pending", dry_run_payload: null, claim_token: null });
    expect(String(p.check_note)).toMatch(/^Stale check skipped: GitHub couldn't be read \(rate-limited, 403\)/);
  });

  it("a 429 or a failed file read also skips it, and a guardrail proposal keeps its first read", async () => {
    const id = await insert(hunkAfter(CLAUDE, "## Ban list", "Ban the person, never the method."), { guardrail: true });
    await approve(id, PETER, dry());
    gh.failNext("getFile", 429);
    expect((await approve(id, CK, dry())).status).toBe("check_skipped");
    expect(await row(id)).toMatchObject({ status: "first_read", first_read_by: "peter@roger.test", dry_run_payload: null });
    gh.failNext("getRef", 500);
    expect((await approve(id, CK, dry())).status).toBe("check_skipped");
    expect((await approve(id, CK, dry())).status).toBe("dry_run");
  });

  it("a dry run is stale just as live is", async () => {
    const id = await insert(claudeHunk());
    gh.pushMain({ [CLAUDE]: (files[CLAUDE] as string).replace("Zack reviews the past 7 days", "Zack reviews the past 14 days") });
    expect((await approve(id, PETER, dry())).status).toBe("stale");
  });

  it("success criterion: the recorded title, body, commit message and committed content hold no member names, emails, feedback words or evidence text", async () => {
    const id = await insert(claudeHunk());
    await approve(id, PETER, dry());
    const p = await row(id);
    const payload = JSON.stringify(p.dry_run_payload);
    for (const s of ["Priya", "Raman", "PriyaR", "priya@example.com", "priya", "spreadsheet", "expense", "anymore", "RAW RUN TEXT", RATIONALE, "the note about", feedbackId]) {
      expect(payload.toLowerCase()).not.toContain(s.toLowerCase());
    }
    const parsed = p.dry_run_payload as { body: string; title: string; commit_message: string };
    expect(parsed.title).toBe(prTitle([CLAUDE], id));
    expect(parsed.commit_message).toBe(commitMessage(id));
    expect(parsed.body.split("\n")[0]).toBe(`Review bot proposal ${id}`);
  });

  it("a dry_run proposal can be approved again later (for real, once production is live)", async () => {
    const id = await insert(claudeHunk());
    expect((await approve(id, PETER, dry())).status).toBe("dry_run");
    expect((await approve(id, PETER, live())).status).toBe("pr_open");
    expect(await row(id)).toMatchObject({ status: "pr_open", dry_run_payload: null });
  });
});

describe("the outgoing text", () => {
  it("prBody is the id line and one fenced diff, the fence longer than any backtick run in the diff", () => {
    expect(prBody("abcdefghij", "--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b")).toBe("Review bot proposal abcdefghij\n\n```diff\n--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n```\n");
    expect(prBody("abcdefghij", " ```roger-run")).toBe("Review bot proposal abcdefghij\n\n````diff\n ```roger-run\n````\n");
  });

  const setup = async () => {
    const ctx = checkContext({
      evidence: [{ id: "e1", kind: "feedback", ref: { kind: "feedback", id: "f" }, text: NOTE, member: true }],
      files,
      names: [{ term: "Priya", caseSensitive: true }],
    });
    const main = { [CLAUDE]: files[CLAUDE] as string };
    const hunks = claudeHunk();
    const r = rebaseHunks(main[CLAUDE], hunks);
    if (!r.ok) throw new Error("fixture");
    const diff = unifiedDiff(CLAUDE, main[CLAUDE], spliceHunks(main[CLAUDE], r.hunks));
    const id = "abcdefghij";
    const next = { [CLAUDE]: spliceHunks(main[CLAUDE], r.hunks) };
    return { ctx, main, next, diff, id, ok: { publicId: id, paths: [CLAUDE], title: prTitle([CLAUDE], id), body: prBody(id, diff), message: commitMessage(id) } };
  };

  it("passes the real thing", async () => {
    const { ctx, main, next, ok } = await setup();
    expect(outgoingCheck(ok, main, next, ctx)).toBeNull();
  });

  it("checks the full content going into the tree, not only the body's diff", async () => {
    const { ctx, main, next, ok } = await setup();
    const withLine = (line: string) => ({ [CLAUDE]: `${next[CLAUDE]}\n${line}\n` });
    expect(outgoingCheck(ok, main, withLine("Ask Priya first."), ctx)).toContain("name");
    expect(outgoingCheck(ok, main, withLine("ghp_abcdefghijklmnopqrstuvwxyz0123456789"), ctx)).toContain("secret");
    expect(outgoingCheck(ok, main, withLine("See https://example.net/x"), ctx)).toContain("link");
    expect(outgoingCheck(ok, main, withLine(`Hidden${String.fromCharCode(0x200b)}text.`), ctx)).toContain("hidden");
    expect(outgoingCheck(ok, main, withLine("keeps picking my weekly expense spreadsheet cleanup play even though"), ctx)).toContain("words");
    expect(outgoingCheck(ok, main, {}, ctx)).toBe(`${CLAUDE}: the new content`);
    // Clean extra content the body doesn't show: the body must be the diff of what is committed.
    expect(outgoingCheck(ok, main, withLine("Keep each answer short."), ctx)).toBe("the diff (it does not match the new content)");
  });

  it("refuses a diff with a repeated header for the same path", async () => {
    const { ctx, main, next, diff, id, ok } = await setup();
    expect(outgoingCheck({ ...ok, body: prBody(id, `${diff}\n${diff}`) }, main, next, ctx)).toBe("a path in the diff");
  });

  it("refuses a name, a quote, a link or a secret on an added line, an extra line in the body, or another title", async () => {
    const { ctx, main, next, diff, id, ok } = await setup();
    const withAdded = (line: string) => ({ ...ok, body: prBody(id, `${diff}\n+${line}`) });
    expect(outgoingCheck(withAdded("Ask Priya first."), main, next, ctx)).toContain("name");
    expect(outgoingCheck(withAdded("keeps picking my weekly expense spreadsheet cleanup play even though"), main, next, ctx)).toContain("words");
    expect(outgoingCheck(withAdded("See https://example.net/x"), main, next, ctx)).toContain("link");
    expect(outgoingCheck(withAdded("ghp_abcdefghijklmnopqrstuvwxyz0123456789"), main, next, ctx)).toContain("secret");
    expect(outgoingCheck({ ...ok, body: `${ok.body}Rationale: members said so\n` }, main, next, ctx)).toBe("the body");
    expect(outgoingCheck({ ...ok, body: `Members said so\n${ok.body}` }, main, next, ctx)).toBe("the body");
    expect(outgoingCheck({ ...ok, title: `${ok.title} for Priya` }, main, next, ctx)).toBe("the title");
    expect(outgoingCheck({ ...ok, message: `${ok.message}\n\nBecause Priya said` }, main, next, ctx)).toBe("the commit message");
    expect(outgoingCheck({ ...ok, body: prBody(id, diff.replace(`--- a/${CLAUDE}\n+++ b/${CLAUDE}`, "--- a/src/lib/x.ts\n+++ b/src/lib/x.ts")) }, main, next, ctx)).toBe("a path in the diff");
  });
});

describe("reject", () => {
  it("records who and when, keeps the row, and is allowed from pending, first_read and blocked", async () => {
    const id = await insert(claudeHunk());
    expect((await rejectProposal(q, id, PETER, "Not now", clock)).message).toContain("Rejected");
    expect(await row(id)).toMatchObject({ status: "rejected", rejected_by: "peter@roger.test", reject_note: "Not now" });
    expect(new Date((await row(id)).rejected_at as string).toISOString()).toBe(AT.toISOString());
    const blocked = await insert(claudeHunk(), { blocked: "The added text contains a link." });
    await rejectProposal(q, blocked, CK, "", clock);
    expect(await row(blocked)).toMatchObject({ status: "rejected", rejected_by: "ck@roger.test", reject_note: null });
    expect((await rejectProposal(q, id, PETER, "again", clock)).message).toContain("can't be rejected");
    expect(gh.calls).toEqual([]);
  });
});
