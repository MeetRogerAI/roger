import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { testDb } from "@/test-helpers/pglite-db";
import { checkReport, claimFreeRun, kindOf, MAX_REPORT_CHARS, reportText, sendConnected, storeReport, zackVersion, type Sender } from "./receive";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
let user: Sender;
const run = (title = "Inbox triage") => `# Zack The Collector (for Claude) v2.0\n\n## ${title}\n\n\`\`\`roger-run\n{ "zack_version": "2.0", "plays": [] }\n\`\`\`\n`;
const profile = `# Zack Profile - 2026-11-29\n\n\`\`\`roger-profile\n{ "zack_version": "2.0", "matching_only": true }\n\`\`\`\n`;
// Sunday 2026-11-29, 9:00 PM Toronto (EST, UTC-5) = 02:00 UTC Monday.
const sundayEvening = new Date("2026-11-30T02:00:00Z");
// Monday 2026-11-30, 12:05 AM Toronto.
const justAfterCutoff = new Date("2026-11-30T05:05:00Z");

type Opts = { test?: boolean; kind?: string | null; cutoff?: string; now?: Date; sender?: Sender };
/** What the send route does, minus the HTTP. */
async function receive(text: string, o: Opts = {}) {
  const c = checkReport(text, o.kind);
  if (!c.ok) return c;
  const s = await storeReport(query, o.sender ?? user, c, { route: "connector", test: o.test ?? false, cutoff: o.cutoff ?? "23:59", now: o.now ?? sundayEvening });
  await sendConnected(o.sender ?? user, s, o.test ?? false, { query, transport, sleep: async () => {} });
  return { ok: true as const, ...s };
}

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  vi.stubEnv("ADMIN_EMAILS", "");
  const [u] = await query<{ id: string }>("insert into users (email, name, status, agent, sharing) values ('ana@example.com', 'Ana', 'trial', 'claude', 'share') returning id");
  user = { id: u.id, email: "ana@example.com", sharing: "share", agent: "claude" };
});
afterEach(() => vi.unstubAllEnvs());

describe("storing a run", () => {
  it("stores a Sunday-evening run for the coming Monday, and a second before the cutoff replaces it (spec check 7)", async () => {
    expect(await receive(run("first"))).toEqual({ ok: true, week_of: "2026-11-30", replaced: false, kind: "run" });
    expect(await receive(run("second"))).toEqual({ ok: true, week_of: "2026-11-30", replaced: true, kind: "run" });
    const rows = await query<{ raw_text: string; zack_version: string; revision: number }>("select raw_text, zack_version, revision from runs");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ zack_version: "2.0", revision: 1 });
    expect(rows[0].raw_text).toContain("second");
  });

  it("counts a run sent just after the cutoff for the following week", async () => {
    expect(await receive(run(), { now: justAfterCutoff })).toMatchObject({ week_of: "2026-12-07" });
  });

  it("uses the cutoff setting: with an 18:00 cutoff, 9 PM Sunday is next week and 5 PM is this week", async () => {
    expect(await receive(run(), { cutoff: "18:00" })).toMatchObject({ week_of: "2026-12-07" });
    expect(await receive(run(), { cutoff: "18:00", now: new Date("2026-11-29T22:00:00Z") })).toMatchObject({ week_of: "2026-11-30" });
  });

  it("a replacement puts the run back to 'received' and drops plays made from the old text", async () => {
    await receive(run());
    const [r] = await query<{ id: string }>("update runs set status = 'accepted', parsed = '{}', parsed_by = 'block', attempts = 2 returning id");
    await query("insert into plays (run_id, user_id, week_of, set_, position, title, category, body, shareable) values ($1, $2, '2026-11-30', 'A', 1, 'Old', 'Sales', '{}', true)", [r.id, user.id]);
    await receive(run("again"));
    const [after] = await query<{ status: string; parsed: unknown; attempts: number }>("select status, parsed, attempts from runs");
    expect(after).toEqual({ status: "received", parsed: null, attempts: 0 });
    expect(await query("select 1 from plays")).toHaveLength(0);
  });

  it("keeps the sharing mode the run arrived with (spec check 8)", async () => {
    await receive(run(), { sender: { ...user, sharing: "match_only" } });
    const [r] = await query<{ sharing: string }>("select sharing from runs");
    expect(r.sharing).toBe("match_only");
  });

  it("marks a test run as a test, keeps it apart from the real run, and emails 'Connected: test received' once", async () => {
    await receive(run(), { test: true });
    await receive(run(), { test: true });
    await receive(run());
    const rows = await query<{ is_test: boolean }>("select is_test from runs order by is_test");
    expect(rows.map((r) => r.is_test)).toEqual([false, true]);
    expect(sent.map((m) => m.subject)).toEqual(["Connected: test received", "Zack’s first report arrived"]);
  });

  it("refuses an empty report and one over 80,000 characters, and takes exactly 80,000", async () => {
    expect(await receive("  \n")).toMatchObject({ ok: false, status: 400 });
    expect(await receive("x".repeat(MAX_REPORT_CHARS + 1))).toMatchObject({ ok: false, status: 413 });
    expect(await query("select 1 from runs")).toHaveLength(0);
    expect(await receive("x".repeat(MAX_REPORT_CHARS))).toMatchObject({ ok: true });
  });

  it("does not fail the send when the connected email cannot go out", async () => {
    const c = checkReport(run());
    if (!c.ok) throw new Error();
    const s = await storeReport(query, user, c, { route: "connector", test: false, cutoff: "23:59", now: sundayEvening });
    const failing: Transport = async () => ({ ok: false, error: "down", retryable: false });
    await expect(sendConnected(user, s, false, { query, transport: failing, sleep: async () => {} })).resolves.toBeUndefined();
  });
});

describe("the private profile", () => {
  it("is stored apart from the run, never as a run, and sends no email", async () => {
    expect(await receive(profile, { kind: "profile" })).toMatchObject({ ok: true, kind: "profile", replaced: false });
    expect(await query("select 1 from runs")).toHaveLength(0);
    expect(await query("select 1 from zack_profiles where week_of = '2026-11-30'")).toHaveLength(1);
    expect(await receive(profile, { kind: "profile" })).toMatchObject({ replaced: true });
    expect(sent).toEqual([]);
  });

  it("sent to the run address by mistake is refused, not stored over the week's run", async () => {
    await receive(run(), { kind: "run" });
    expect(await receive(profile, { kind: "run" })).toMatchObject({ ok: false, status: 400 });
    const unfenced = "# Zack Profile - 2026-11-29\n\n```json\n{ \"matching_only\": true }\n```\n";
    expect(await receive(unfenced, { kind: "run" })).toMatchObject({ ok: false, status: 400 });
    const [r] = await query<{ raw_text: string }>("select raw_text from runs");
    expect(r.raw_text).toContain("roger-run");
  });

  it("that lands just after the cutoff still belongs to the week of the run sent a minute before", async () => {
    await receive(run(), { now: new Date("2026-11-30T04:59:00Z") }); // 11:59 PM Sunday
    expect(await receive(profile, { kind: "profile", now: new Date("2026-11-30T05:01:00Z") })).toMatchObject({ week_of: "2026-11-30" });
  });
});

describe("kindOf", () => {
  it("trusts the address when the body agrees", () => {
    expect(kindOf(run(), "run")).toBe("run");
    expect(kindOf(profile, "profile")).toBe("profile");
    expect(kindOf("an old 1.9 report with no block", "run")).toBe("run");
  });

  it("refuses a body holding both files, or a profile at the run address, or a run at the profile address", () => {
    expect(kindOf(run() + profile)).toBe("ambiguous");
    expect(kindOf(profile, "run")).toBe("ambiguous");
    expect(kindOf(run(), "profile")).toBe("ambiguous");
  });

  it("without an address, treats anything profile-like with no run block as a profile", () => {
    expect(kindOf(profile)).toBe("profile");
    expect(kindOf("``` roger-profile\n{}\n```")).toBe("profile");
    expect(kindOf('{"matching_only": true}')).toBe("profile");
    expect(kindOf(run())).toBe("run");
    expect(kindOf("an old 1.9 report")).toBe("run");
  });
});

describe("reading what was sent", () => {
  it("reads the Zack version from the block or the header", () => {
    expect(zackVersion(run())).toBe("2.0");
    expect(zackVersion("# Zack The Collector (for Hark) v1.9\n")).toBe("1.9");
    expect(zackVersion("no version")).toBe("");
  });

  it("accepts plain Markdown or JSON with the text in a known field", () => {
    expect(reportText("# Report")).toBe("# Report");
    expect(reportText(JSON.stringify({ report: "# R" }))).toBe("# R");
    expect(reportText(JSON.stringify({ markdown: "# M" }))).toBe("# M");
    expect(reportText("{ not json")).toBe("{ not json");
  });
});

describe("claimFreeRun", () => {
  const free = (token: string, email = "ana@example.com", report: string | null = "# Zack The Collector (for Hark) v1.9\nfree report", agent = "hark") =>
    query("insert into free_runs (token, email, agent, report, report_at) values ($1, $2, $4, $3, now())", [token, email, report, agent]);

  it("turns a free-tool report into this week's run once; the token cannot be claimed twice", async () => {
    await free("tok1");
    await query("update users set pending_zack_token = 'tok1'");
    expect(await claimFreeRun(query, user.id, "23:59", sundayEvening)).toBe(true);
    expect(await claimFreeRun(query, user.id, "23:59", sundayEvening)).toBe(false);
    const rows = await query<{ route: string; agent: string; week_of: string; zack_version: string }>(
      "select route, agent, zack_version, to_char(week_of, 'YYYY-MM-DD') as week_of from runs",
    );
    expect(rows).toEqual([{ route: "free_tool", agent: "hark", zack_version: "1.9", week_of: "2026-11-30" }]);
  });

  it("will not hand one person's report to another account that has the token", async () => {
    await free("tok1");
    const [other] = await query<{ id: string }>("insert into users (email, status, pending_zack_token) values ('bo@example.com', 'trial', 'tok1') returning id");
    expect(await claimFreeRun(query, other.id, "23:59", sundayEvening)).toBe(false);
    const [f] = await query<{ claimed_by: string | null }>("select claimed_by from free_runs");
    expect(f.claimed_by).toBeNull();
  });

  it("leaves the token unspent when the user already has a run for the week", async () => {
    await free("tok1");
    await query("update users set pending_zack_token = 'tok1'");
    await receive(run());
    expect(await claimFreeRun(query, user.id, "23:59", sundayEvening)).toBe(false);
    const [f] = await query<{ claimed_by: string | null }>("select claimed_by from free_runs");
    expect(f.claimed_by).toBeNull();
    expect(await query("select 1 from runs")).toHaveLength(1);
  });

  it("does nothing without a token, without a report, or with a report over the limit", async () => {
    expect(await claimFreeRun(query, user.id, "23:59")).toBe(false);
    await free("tok2", "ana@example.com", null);
    await query("update users set pending_zack_token = 'tok2'");
    expect(await claimFreeRun(query, user.id, "23:59")).toBe(false);
    await free("tok3", "ana@example.com", "x".repeat(MAX_REPORT_CHARS + 1), "duet");
    await query("update users set pending_zack_token = 'tok3'");
    expect(await claimFreeRun(query, user.id, "23:59")).toBe(false);
  });
});
