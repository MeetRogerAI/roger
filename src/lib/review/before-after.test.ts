import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { member } from "@/test-helpers/review-fixtures";
import { beforeAfter, type MergedProposal, TOO_FEW } from "./before-after";

/** B3 Unit 10: the Zack measures before and after a merged proposal, by the instruction version each run was stamped with. */

const ADMIN = "boss@example.com";
const CLAUDE = "content/zack/claude.md";
const BASE = "b".repeat(40);
const RESULT = "c".repeat(40);
const THIRD = "d".repeat(40);
const EDITED = "e".repeat(40);
/** Merged Wednesday of the list week of 2026-11-30. */
const MERGED_AT = "2026-12-02T15:00:00Z";

let q: Query;
let n = 0;
beforeEach(async () => {
  ({ query: q } = await testDb());
  n = 0;
});

/** One run on its own member (runs are one per member and week). */
async function stamped(version: string | null, o: { week: string; at: string; status?: string; agent?: string; source?: "fetch" | "deployed"; parsedBy?: string | null; plays?: number; test?: boolean; email?: string }) {
  const u = await member(q, o.email ?? `m${++n}@example.com`);
  const [r] = await q<{ id: string }>(
    `insert into runs (user_id, week_of, route, agent, sharing, raw_text, status, parsed_by, is_test, instructions_version, instructions_version_source, received_at)
     values ($1, $2::date, 'connector', $3, 'share', 'raw', $4, $5, $6, $7, $8, $9::timestamptz) returning id`,
    [u, o.week, o.agent ?? "claude", o.status ?? "accepted", o.parsedBy === undefined ? "block" : o.parsedBy, o.test ?? false, version, o.source ?? "fetch", o.at],
  );
  for (let i = 1; i <= (o.plays ?? 0); i++) {
    await q(`insert into plays (run_id, user_id, week_of, set_, position, title, category, body) values ($1, $2, $3::date, 'A', $4, 't', 'Email', '{}'::jsonb)`, [r.id, u, o.week, i]);
  }
}

const merged = (o: Partial<MergedProposal> = {}): MergedProposal => ({
  paths: [CLAUDE],
  base_versions: { [CLAUDE]: BASE },
  result_versions: { [CLAUDE]: RESULT },
  edited_before_merge: false,
  merged_at: MERGED_AT,
  document_only: false,
  ...o,
});

const load = (p: MergedProposal) => beforeAfter(q, p, { admins: [ADMIN] });

describe("beforeAfter", () => {
  it("compares runs stamped with the base version and with result_versions, with n on each side", async () => {
    for (let i = 0; i < 10; i++) await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z", status: i < 2 ? "flagged" : "accepted", plays: i < 2 ? 0 : 3 });
    for (let i = 0; i < 6; i++) await stamped(RESULT, { week: "2026-12-07", at: "2026-12-08T15:00:00Z", plays: 2, parsedBy: i === 0 ? "model" : "block" });

    const r = await load(merged());
    expect(r.kind).toBe("zack");
    if (r.kind !== "zack") return;
    expect(r.mergedWeek).toBe("2026-11-30");
    const [f] = r.files;
    expect(f).toMatchObject({ path: CLAUDE, afterFrom: "result", tooFew: false });
    expect(f.before).toMatchObject({ version: BASE, n: 10, accepted: 8, flagged: 2, rejected: 0, parsed: 10, fromBlock: 10, plays: 24, deployed: 0 });
    expect(f.after).toMatchObject({ version: RESULT, n: 6, accepted: 6, flagged: 0, parsed: 6, fromBlock: 5, plays: 12 });
  });

  it("says too few to compare when either side has fewer than 3 runs", async () => {
    for (let i = 0; i < 5; i++) await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z" });
    for (let i = 0; i < 2; i++) await stamped(RESULT, { week: "2026-12-07", at: "2026-12-08T15:00:00Z" });
    const r = await load(merged());
    if (r.kind !== "zack") throw new Error(r.kind);
    expect(TOO_FEW).toBe(3);
    expect(r.files[0].tooFew).toBe(true);
    expect(r.files[0].after.n).toBe(2);
  });

  it("counts only runs stamped with result_versions after: a third version (a later, unrelated merge) is on neither side", async () => {
    for (let i = 0; i < 3; i++) await stamped(BASE, { week: "2026-11-30", at: "2026-12-01T15:00:00Z" });
    for (let i = 0; i < 3; i++) await stamped(RESULT, { week: "2026-12-07", at: "2026-12-08T15:00:00Z" });
    for (let i = 0; i < 4; i++) await stamped(THIRD, { week: "2026-12-14", at: "2026-12-15T15:00:00Z" });
    const r = await load(merged());
    if (r.kind !== "zack") throw new Error(r.kind);
    expect(r.files[0].before.n).toBe(3);
    expect(r.files[0].after.n).toBe(3);
  });

  it("leaves out test runs, deleted runs, admins' runs, other agents' files and runs over 4 list weeks away; counts deployed-stamped runs separately", async () => {
    await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z" });
    await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z", test: true });
    await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z", status: "deleted" });
    await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z", email: ADMIN });
    await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z", agent: "duet" });
    await stamped(BASE, { week: "2026-11-02", at: "2026-11-03T15:00:00Z" }); // 4 weeks before the merge week: outside
    await stamped(BASE, { week: "2026-11-09", at: "2026-11-10T15:00:00Z" }); // 3 weeks before: inside
    await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z", source: "deployed" });
    await stamped(RESULT, { week: "2026-12-28", at: "2026-12-29T15:00:00Z" }); // 4 weeks after: outside
    await stamped(RESULT, { week: "2026-12-21", at: "2026-12-22T15:00:00Z" }); // 3 weeks after: inside
    const r = await load(merged());
    if (r.kind !== "zack") throw new Error(r.kind);
    expect(r.files[0].before).toMatchObject({ n: 2, deployed: 1 });
    expect(r.files[0].after).toMatchObject({ n: 1, deployed: 0 });
  });

  it("an agent with no file of its own counts on the Grok Bot file", async () => {
    const grok = "content/zack/grok-bot.md";
    for (let i = 0; i < 3; i++) await stamped(BASE, { week: "2026-11-23", at: "2026-11-25T15:00:00Z", agent: "chatgpt" });
    const r = await load(merged({ paths: [grok], base_versions: { [grok]: BASE }, result_versions: { [grok]: RESULT } }));
    if (r.kind !== "zack") throw new Error(r.kind);
    expect(r.files[0].before.n).toBe(3);
  });

  it("edited before merging: after is the first version stamped after merged_at that differs from the base, labelled", async () => {
    await stamped(BASE, { week: "2026-11-30", at: "2026-12-02T18:00:00Z" }); // the base, after the merge (an old fetch): not the fallback
    await stamped(EDITED, { week: "2026-12-07", at: "2026-12-08T15:00:00Z" });
    await stamped(EDITED, { week: "2026-12-07", at: "2026-12-09T15:00:00Z" });
    await stamped(THIRD, { week: "2026-12-14", at: "2026-12-15T15:00:00Z" });
    await stamped(RESULT, { week: "2026-12-07", at: "2026-12-10T15:00:00Z" }); // the bot's version never ran: ignored
    const r = await load(merged({ edited_before_merge: true }));
    if (r.kind !== "zack") throw new Error(r.kind);
    expect(r.files[0].afterFrom).toBe("edited_fallback");
    expect(r.files[0].after).toMatchObject({ version: EDITED, n: 2 });
  });

  it("edited before merging with nothing stamped since: no after version", async () => {
    const r = await load(merged({ edited_before_merge: true }));
    if (r.kind !== "zack") throw new Error(r.kind);
    expect(r.files[0].afterFrom).toBe("none");
    expect(r.files[0].after).toMatchObject({ version: null, n: 0 });
    expect(r.files[0].tooFew).toBe(true);
  });

  it("a Cora proposal is document only: no before or after at all", async () => {
    const cora = "content/cora/cora.md";
    expect(await load(merged({ paths: [cora], base_versions: { [cora]: BASE }, result_versions: { [cora]: RESULT }, document_only: true }))).toEqual({ kind: "document_only" });
  });

  it("a merged proposal with no merge date has nothing to split on", async () => {
    expect(await load(merged({ merged_at: null }))).toEqual({ kind: "no_merge_date" });
  });
});
