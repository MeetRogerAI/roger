import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { READ_NOT_LOGGED } from "@/lib/admin/read-log";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { member, note, run, WEEK } from "@/test-helpers/review-fixtures";

/**
 * B3 Unit 10: /admin/review. Proposals by status with the diff as text, the
 * labels and warnings, PR links, rejected history and before/after for
 * merged Zack proposals; the evidence read live and logged first
 * (fail-closed); the mode banner; admins only.
 */

const db: { query: Query | null; admin: boolean; failLog: boolean } = { query: null, admin: true, failLog: false };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/admin-auth", () => ({
  PASSWORD_ADMIN: "admin (password)",
  adminIdentity: async () => (db.admin ? "peter@example.com" : null),
  isAdmin: async () => db.admin,
  requireAdmin: async () => "peter@example.com",
}));
vi.mock("@/lib/db-query", () => ({
  query: (t: string, p?: unknown[]) => {
    if (db.failLog && /insert into admin_actions/.test(t)) return Promise.reject(new Error("log down"));
    return db.query!(t, p);
  },
}));
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => mergeV3([{ key: "v3.reviewBotOn", value: true }]) }));

const { default: Page } = await import("./page");

async function render(sp: Record<string, string> = {}): Promise<string> {
  const { prelude } = await prerender((await Page({ searchParams: Promise.resolve(sp), params: Promise.resolve({}) } as Parameters<typeof Page>[0]))!);
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}

const CLAUDE = "content/zack/claude.md";
const DUET = "content/zack/duet.md";
const CORA = "content/cora/cora.md";
const BASE = "b".repeat(40);
const RESULT = "c".repeat(40);
let seq = 0;
const L = "abcdefghijklmnopqrstuvwxyz";
/** A public id: 10 characters of [a-z2-7]. */
const pid = () => `review${L[Math.floor(seq / 26)]}${L[seq++ % 26]}zz`;

type P = {
  status?: string;
  paths?: string[];
  diff?: string;
  rationale?: string;
  evidence?: { kind: string; ref: string; why: string }[];
  guardrail?: string[];
  blocked?: string;
  pr?: number;
  extra?: Record<string, unknown>;
};
async function proposal(o: P = {}): Promise<string> {
  const id = pid();
  const paths = o.paths ?? [CLAUDE];
  const cols: Record<string, unknown> = {
    public_id: id,
    review_week: WEEK,
    paths: `{${paths.join(",")}}`,
    base_versions: JSON.stringify(Object.fromEntries(paths.map((p) => [p, BASE]))),
    diff_text: o.diff ?? `--- a/${paths[0]}\n+++ b/${paths[0]}\n@@ -1 +1 @@\n-old line\n+new line`,
    rationale: o.rationale ?? "Members found the set-up step unclear.",
    evidence: JSON.stringify(o.evidence ?? []),
    guardrail: Boolean(o.guardrail?.length),
    guardrail_reasons: JSON.stringify(o.guardrail ?? []),
    blocked_reason: o.blocked ?? null,
    status: o.status ?? "pending",
    document_only: paths.includes(CORA),
    pr_number: o.pr ?? null,
    pr_url: o.pr ? `https://github.com/MeetRogerAI/roger/pull/${o.pr}` : null,
    ...o.extra,
  };
  const keys = Object.keys(cols);
  await db.query!(`insert into review_proposals (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => cols[k]));
  return id;
}

const reads = () => db.query!<{ action: string; detail: { page: string; user_ids: string[] } }>(`select action, detail from admin_actions where action like 'read%' order by id`);
const section = (html: string, heading: string) => {
  const start = html.indexOf(`>${heading}</h2>`);
  if (start < 0) throw new Error(`no section ${heading}`);
  const next = html.indexOf("<h2", start + 1);
  return html.slice(start, next < 0 ? undefined : next);
};

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  db.admin = true;
  db.failLog = false;
  seq = 0;
  delete process.env.VERCEL_ENV;
  delete process.env.GITHUB_REVIEW_TOKEN;
  process.env.ADMIN_EMAILS = "peter@example.com";
});
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

describe("/admin/review", () => {
  it("shows nothing to someone who is not an admin", async () => {
    db.admin = false;
    expect(await Page({ searchParams: Promise.resolve({}), params: Promise.resolve({}) } as Parameters<typeof Page>[0])).toBeNull();
  });

  it("shows a waiting proposal's files, diff as text, rationale, guardrail badge and buttons; evidence stays closed and unread", async () => {
    const a = await member(db.query!, "a@example.com");
    const f = await note(db.query!, a, "Hard to follow");
    const id = await proposal({ diff: "--- a/x\n+++ b/x\n+<script>alert(1)</script>", guardrail: ["changes ## Security rules"], evidence: [{ kind: "feedback", ref: f, why: "unclear" }] });
    const html = await render();
    const waiting = section(html, "Waiting for review (1)");
    expect(waiting).toContain(id);
    expect(waiting).toContain(CLAUDE);
    expect(waiting).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)");
    expect(waiting).toContain("Members found the set-up step unclear.");
    expect(waiting).toContain("Needs a second read by a different admin");
    expect(waiting).toContain("changes ## Security rules");
    expect(waiting).toContain("Give the first read");
    expect(waiting).toContain("Reject");
    expect(waiting).toContain(`href="/admin/review?evidence=${id}#evidence-${id}"`);
    expect(waiting).toContain("Show the evidence (1 item)");
    expect(html).not.toContain("Hard to follow");
    expect(await reads()).toEqual([]);
  });

  it("opening the evidence renders each source live, as text, after logging the read", async () => {
    const a = await member(db.query!, "a@example.com");
    const f = await note(db.query!, a, "<b>Hard</b> to follow");
    const r = await run(db.query!, a, { status: "flagged", reason: "the play has a link" });
    const id = await proposal({ evidence: [{ kind: "feedback", ref: f, why: "unclear" }, { kind: "run", ref: r, why: "flagged run" }] });
    const html = await render({ evidence: id });
    expect(html).toContain(`id="evidence-${id}"`);
    expect(html).toContain("&lt;b&gt;Hard&lt;/b&gt; to follow");
    expect(html).not.toContain("<b>Hard</b>");
    expect(html).toContain(`Flagged run for the list of ${WEEK} from claude: the play has a link`);
    expect(html).toContain("flagged run");
    expect(html).toContain("Hide the evidence");
    expect(await reads()).toEqual([
      { action: "read_feedback", detail: expect.objectContaining({ page: "/admin/review", user_ids: [a] }) },
      { action: "read_runs", detail: expect.objectContaining({ page: "/admin/review", user_ids: [a] }) },
    ]);
  });

  it("evidence whose member was deleted shows as deleted with the account", async () => {
    const a = await member(db.query!, "a@example.com");
    const f = await note(db.query!, a, "Hard to follow");
    const id = await proposal({ evidence: [{ kind: "feedback", ref: f, why: "unclear" }] });
    await db.query!("delete from users where id = $1", [a]);
    const html = await render({ evidence: id });
    expect(html).toContain("Deleted with the member&#x27;s account");
    expect(await reads()).toEqual([]);
  });

  it("fail-closed: when the read can't be logged, no evidence is shown", async () => {
    const a = await member(db.query!, "a@example.com");
    const f = await note(db.query!, a, "Hard to follow");
    const id = await proposal({ evidence: [{ kind: "feedback", ref: f, why: "unclear" }] });
    db.failLog = true;
    const html = await render({ evidence: id });
    expect(html).toContain(READ_NOT_LOGGED);
    expect(html).not.toContain("Hard to follow");
    // The rest of the page (no member text) still shows.
    expect(html).toContain(id);
  });

  it("puts each status in its section, with the blocked reason, overlap warning, PR links, superseded marks and who rejected", async () => {
    const pending = await proposal({ paths: [CLAUDE] });
    const first = await proposal({ status: "first_read", guardrail: ["mentions keys"], extra: { first_read_by: "tim@example.com", first_read_at: "2026-11-27T16:00:00Z" } });
    const blocked = await proposal({ status: "blocked", blocked: "The added text contains a link." });
    const open = await proposal({ status: "pr_open", paths: [CLAUDE, DUET], pr: 41 });
    const newer = await proposal({ status: "pr_open", paths: [CLAUDE, DUET], pr: 44 });
    const superseded = await proposal({ status: "superseded", pr: 40 });
    await db.query!(`update review_proposals set superseded_by = (select id from review_proposals where public_id = $1) where public_id = $2`, [newer, superseded]);
    const closed = await proposal({ status: "closed", pr: 39, extra: { closed_at: "2026-11-28T10:00:00Z" } });
    const stale = await proposal({ status: "stale", extra: { error: "main changed the lines this edits" } });
    const rejected = await proposal({ status: "rejected", extra: { rejected_by: "tim@example.com", rejected_at: "2026-11-27T17:00:00Z", reject_note: "Too <i>vague</i>" } });
    const dry = await proposal({
      status: "dry_run",
      extra: {
        dry_run_payload: JSON.stringify({
          mode: "dry_run",
          why: "this is not the production deployment",
          main_commit: "1234567890abcdef",
          branch: "review-bot/xyz",
          title: "Review bot: content/zack/claude.md (xyz)",
          writes: [
            { method: "POST", path: "git/trees", body: {} },
            { method: "POST", path: "pulls", body: {} },
          ],
          supersedes: [],
          overlap: [],
        }),
      },
    });
    const skipped = await proposal({ extra: { check_note: "Stale check skipped: GitHub couldn't be read (rate-limited, 403)" } });
    const cora = await proposal({ paths: [CORA] });

    const html = await render();
    const waiting = section(html, "Waiting for review (4)");
    for (const id of [pending, first, skipped, cora]) expect(waiting).toContain(id);
    expect(waiting).toContain("First read given by tim@example.com");
    expect(waiting).toContain("Give the second read");
    expect(waiting).toContain("Stale check skipped: GitHub couldn&#x27;t be read (rate-limited, 403)");
    expect(waiting).toContain("Document only — needs a matching code change");
    // The pending claude.md proposal doesn't cover the open PRs' duet.md.
    expect(waiting).toContain(`${open} (#41) also changes ${DUET}`);

    const b = section(html, "Blocked (1)");
    expect(b).toContain(blocked);
    expect(b).toContain("The added text contains a link.");
    expect(b).not.toContain("Approve");
    expect(b).toContain("Reject");

    const prs = section(html, "Open pull requests (2)");
    expect(prs).toContain('href="https://github.com/MeetRogerAI/roger/pull/41"');
    expect(prs).toContain("Pull request #41");
    expect(prs).not.toContain(">Reject<");

    const rest = section(html, "Rejected, stale, dry runs and closed (5)");
    for (const id of [superseded, closed, stale, rejected, dry]) expect(rest).toContain(id);
    expect(rest).toContain(`Superseded by ${newer}`);
    expect(rest).toContain("Closed on GitHub without merging");
    expect(rest).toContain("main changed the lines this edits");
    expect(rest).toContain("Rejected by tim@example.com");
    expect(rest).toContain("Too &lt;i&gt;vague&lt;/i&gt;");
    expect(rest).toContain("review-bot/xyz");
    expect(rest).toContain("POST git/trees");
    expect(rest).toContain("1234567");
    // A dry run can be approved again, and rejected.
    expect(rest).toContain("Approve");
    expect(section(html, "Merged (0)")).toContain("None.");
  });

  it("shows before and after for a merged Zack proposal, with n, and only the label for a merged Cora one", async () => {
    let k = 0;
    const stamp = async (version: string, week: string, at: string, status = "accepted") => {
      const u = await member(db.query!, `r${++k}@example.com`);
      await db.query!(
        `insert into runs (user_id, week_of, route, agent, sharing, raw_text, status, parsed_by, instructions_version, instructions_version_source, received_at) values ($1, $2::date, 'connector', 'claude', 'share', 'raw', $3, 'block', $4, 'fetch', $5::timestamptz)`,
        [u, week, status, version, at],
      );
    };
    for (let i = 0; i < 10; i++) await stamp(BASE, "2026-11-23", "2026-11-25T15:00:00Z", i < 2 ? "flagged" : "accepted");
    for (let i = 0; i < 6; i++) await stamp(RESULT, "2026-12-07", "2026-12-08T15:00:00Z");
    const zack = await proposal({ status: "merged", pr: 50, extra: { merged_at: "2026-12-02T15:00:00Z", result_versions: JSON.stringify({ [CLAUDE]: RESULT }) } });
    const edited = await proposal({ status: "merged", pr: 51, extra: { merged_at: "2026-12-02T15:00:00Z", result_versions: JSON.stringify({ [CLAUDE]: "f".repeat(40) }), edited_before_merge: true } });
    const thin = await proposal({ status: "merged", pr: 52, paths: [DUET], extra: { merged_at: "2026-12-02T15:00:00Z", result_versions: JSON.stringify({ [DUET]: RESULT }) } });
    const cora = await proposal({ status: "merged", pr: 53, paths: [CORA], extra: { merged_at: "2026-12-02T15:00:00Z", result_versions: JSON.stringify({ [CORA]: RESULT }) } });

    const html = await render();
    const m = section(html, "Merged (4)");
    const card = (id: string) => m.slice(m.indexOf(`id="p-${id}"`), m.indexOf("</article>", m.indexOf(`id="p-${id}"`)));
    const z = card(zack);
    expect(z).toMatch(/<caption[^>]*>Before and after: content\/zack\/claude\.md<\/caption>/);
    expect(z).toContain('scope="col"');
    expect(z).toContain("20% (2 of 10)");
    expect(z).toContain("0% (0 of 6)");
    expect(z).not.toContain("Too few to compare");
    // Edited on GitHub: the first version after the merge (the result-stamped runs here), labelled.
    expect(card(edited)).toContain("Edited on GitHub before merging");
    // No runs for duet.md at all.
    expect(card(thin)).toContain("Too few to compare");
    const c = card(cora);
    expect(c).toContain("Document only — needs a matching code change");
    expect(c).not.toContain("<caption");
    expect(c).toContain("No before and after");
  });

  it("shows the dry-run banner off production, and Run now and Refresh from GitHub", async () => {
    const html = await render();
    expect(html).toContain("Dry run: no pull requests are opened here (this is not the production deployment).");
    expect(html).toContain("Run now");
    expect(html).toContain("Refresh from GitHub");
    expect(html).toMatch(/<h1[^>]*>Review bot<\/h1>/);
  });

  it("says approving opens a real pull request on production with the token and the switch on", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.GITHUB_REVIEW_TOKEN = "ghp_test";
    const html = await render();
    expect(html).toContain("Live: approving opens a real pull request on MeetRogerAI/roger.");
    expect(html).not.toContain("ghp_test");
    delete process.env.VERCEL_ENV;
    delete process.env.GITHUB_REVIEW_TOKEN;
  });
});
