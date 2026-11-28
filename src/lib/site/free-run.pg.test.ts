import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { parseStartParams } from "@/lib/signup/params";
import { claimFreeRun, MAX_REPORT_CHARS, retryPendingClaim } from "@/lib/zack/receive";
import { testDb } from "@/test-helpers/pglite-db";
import { FREE_RUN_REPORT_CHARS, isRunToken, newRunToken, purgeFreeRuns, readRun, saveReport, startRun } from "./free-run";

// The real statements, on a real Postgres (docs/solutions/best-practices/test-claim-sql-on-pglite-2026-11-22.md).
let query: Query;
const NOW = new Date("2026-11-29T23:00:00Z"); // a Sunday evening
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const REPORT = "# Zack Run\n\n## 1. Client email in two tones\n\nA play.";

type Row = { token: string; email: string; agent: string; report: string | null; report_at: string | null; claimed_by: string | null };
const rows = () => query<Row>("select token, email, agent, report, report_at, claimed_by from free_runs order by email, agent");

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("a run token", () => {
  it("has the shape sign-up accepts, and is different every time", () => {
    const a = newRunToken();
    const b = newRunToken();
    expect(a).not.toBe(b);
    expect(parseStartParams({ zack: a }).zack).toBe(a);
    expect(isRunToken(a)).toBe(true);
    for (const bad of ["", "short", "has space in the middle!", "x".repeat(129), null, 7]) expect(isRunToken(bad)).toBe(false);
  });

  it("caps a report at 40,000 characters, above the longest real report and inside what the claim accepts", () => {
    expect(FREE_RUN_REPORT_CHARS).toBe(40_000);
    expect(FREE_RUN_REPORT_CHARS).toBeLessThanOrEqual(MAX_REPORT_CHARS);
  });
});

describe("starting a run", () => {
  it("creates one row with a token of the accepted shape", async () => {
    const { token } = await startRun(query, { email: "Ana@Example.com", agent: "claude", now: NOW });
    expect(parseStartParams({ zack: token }).zack).toBe(token);
    expect(await rows()).toEqual([{ token, email: "ana@example.com", agent: "claude", report: null, report_at: null, claimed_by: null }]);
    const [{ created_at }] = await query<{ created_at: Date }>("select created_at from free_runs");
    expect(new Date(created_at).toISOString()).toBe(NOW.toISOString());
  });

  it("on an unclaimed row keeps one row, issues a different token and empties the report; the old token finds nothing", async () => {
    const first = await startRun(query, { email: "ana@example.com", agent: "claude", now: NOW });
    expect(await saveReport(query, { token: first.token, report: REPORT, now: later(5) })).toBe("saved");
    const second = await startRun(query, { email: "ANA@example.com", agent: "claude", now: later(10) });
    expect(second.token).not.toBe(first.token);
    expect(await rows()).toEqual([{ token: second.token, email: "ana@example.com", agent: "claude", report: null, report_at: null, claimed_by: null }]);
    expect(await readRun(query, first.token)).toBeNull();
    expect(await saveReport(query, { token: first.token, report: REPORT, now: later(11) })).toBe("not_found");
    expect(await readRun(query, second.token)).toEqual({ agent: "claude", hasReport: false });
  });

  it("keeps a run per agent for the same email", async () => {
    await startRun(query, { email: "ana@example.com", agent: "claude", now: NOW });
    await startRun(query, { email: "ana@example.com", agent: "hark", now: NOW });
    expect((await rows()).map((r) => r.agent)).toEqual(["claude", "hark"]);
  });

  /** Three emails: one never seen, one with a run waiting, one whose run a real claim attached to an account. */
  async function threeEmails() {
    const waiting = await startRun(query, { email: "bo@example.com", agent: "claude", now: NOW });
    await saveReport(query, { token: waiting.token, report: REPORT, now: later(1) });
    const taken = await startRun(query, { email: "cy@example.com", agent: "claude", now: NOW });
    await saveReport(query, { token: taken.token, report: REPORT, now: later(1) });
    const [user] = await query<{ id: string }>("insert into users (email, status, sharing, pending_zack_token) values ('cy@example.com', 'trial', 'share', $1) returning id", [taken.token]);
    expect(await claimFreeRun(query, user.id, "23:59", later(2))).toBe(true);
    return { waiting, taken, user };
  }

  it("answers a new email, an unclaimed repeat and a claimed email alike: a token that opens the same empty run", async () => {
    const { waiting, taken } = await threeEmails();
    const fresh = await startRun(query, { email: "ana@example.com", agent: "claude", now: later(30) });
    const repeat = await startRun(query, { email: "bo@example.com", agent: "claude", now: later(30) });
    const claimed = await startRun(query, { email: "cy@example.com", agent: "claude", now: later(30) });
    for (const answer of [fresh, repeat, claimed]) {
      expect(Object.keys(answer)).toEqual(["token"]);
      expect(isRunToken(answer.token)).toBe(true);
      expect(await readRun(query, answer.token, "claude")).toEqual({ agent: "claude", hasReport: false });
    }
    // Each row holds its new token and nothing else: no report, and no claim.
    expect(await rows()).toEqual(
      [
        ["ana@example.com", fresh.token],
        ["bo@example.com", repeat.token],
        ["cy@example.com", claimed.token],
      ].map(([email, token]) => ({ token, email, agent: "claude", report: null, report_at: null, claimed_by: null })),
    );
    // The earlier tokens open nothing, and store nothing.
    for (const old of [waiting.token, taken.token]) {
      expect(await readRun(query, old)).toBeNull();
      expect(await saveReport(query, { token: old, report: "someone else's text", now: later(31) })).toBe("not_found");
    }
    // Each new token takes a report like any other.
    for (const answer of [fresh, repeat, claimed]) expect(await saveReport(query, { token: answer.token, report: REPORT, now: later(32) })).toBe("saved");
  });

  it("on a claimed row leaves the run already attached to the account as it was, and the new run is not attached again", async () => {
    const { taken, user } = await threeEmails();
    const attached = await query("select * from runs");
    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatchObject({ user_id: user.id, route: "free_tool", agent: "claude", raw_text: REPORT });

    const again = await startRun(query, { email: "cy@example.com", agent: "claude", now: later(30) });
    expect(again.token).not.toBe(taken.token);
    expect(await query("select * from runs")).toEqual(attached);
    // With a new report in, a second claim for the same user and week attaches nothing: the account holds the old token, and has its run.
    expect(await saveReport(query, { token: again.token, report: "a different report", now: later(31) })).toBe("saved");
    expect(await claimFreeRun(query, user.id, "23:59", later(60))).toBe(false);
    expect(await retryPendingClaim(query, user.id, async () => "23:59")).toBe(false);
    expect(await query("select * from runs")).toEqual(attached);
    expect((await rows()).find((r) => r.email === "cy@example.com")).toMatchObject({ token: again.token, report: "a different report", claimed_by: null });
  });

  it("is one statement each time: an insert that becomes the update on a conflict, never a read and then a write", async () => {
    await threeEmails();
    const seen: string[] = [];
    const counting: Query = <T>(text: string, params?: unknown[]) => {
      seen.push(text);
      return query<T>(text, params);
    };
    // A new email, an unclaimed repeat and a claimed email.
    for (const email of ["ana@example.com", "bo@example.com", "cy@example.com"]) {
      seen.length = 0;
      await startRun(counting, { email, agent: "claude", now: later(30) });
      expect(seen, email).toHaveLength(1);
      expect(seen[0], email).toMatch(/^\s*insert into free_runs\b[\s\S]*\bon conflict \(email, agent\) do update\b/);
    }
  });

  // PGlite runs one statement at a time, so these do not race. What makes two real starts at once safe is that
  // each is the single statement above and (email, agent) is unique; these show overlapping calls end the same way.
  it("two started together for the same email and agent leave exactly one row, which one of the two tokens opens", async () => {
    const [a, b] = await Promise.all([
      startRun(query, { email: "ana@example.com", agent: "claude", now: NOW }),
      startRun(query, { email: "ana@example.com", agent: "claude", now: NOW }),
    ]);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect([a.token, b.token]).toContain(all[0].token);
    expect(a.token).not.toBe(b.token);
    expect(all[0].report).toBeNull();
  });

  it("eight started together still leave one row", async () => {
    await Promise.all(Array.from({ length: 8 }, () => startRun(query, { email: "ana@example.com", agent: "claude", now: NOW })));
    expect(await rows()).toHaveLength(1);
  });
});

describe("saving a report", () => {
  it("stores the report and its time on the row with that token", async () => {
    const { token } = await startRun(query, { email: "ana@example.com", agent: "claude", now: NOW });
    expect(await saveReport(query, { token, report: REPORT, now: later(7) })).toBe("saved");
    const [row] = await query<{ report: string; report_at: Date }>("select report, report_at from free_runs");
    expect(row.report).toBe(REPORT);
    expect(new Date(row.report_at).toISOString()).toBe(later(7).toISOString());
    expect(await readRun(query, token)).toEqual({ agent: "claude", hasReport: true });
  });

  it("stores nothing for an unknown token, or one of the wrong shape", async () => {
    await startRun(query, { email: "ana@example.com", agent: "claude", now: NOW });
    expect(await saveReport(query, { token: newRunToken(), report: REPORT, now: NOW })).toBe("not_found");
    expect(await saveReport(query, { token: "'; drop table free_runs; --", report: REPORT, now: NOW })).toBe("not_found");
    expect((await rows())[0].report).toBeNull();
  });

  it("refuses an empty report and one over the cap, and takes one exactly at the cap", async () => {
    const { token } = await startRun(query, { email: "ana@example.com", agent: "claude", now: NOW });
    expect(await saveReport(query, { token, report: "  \n ", now: NOW })).toBe("empty");
    expect(await saveReport(query, { token, report: "x".repeat(FREE_RUN_REPORT_CHARS + 1), now: NOW })).toBe("too_long");
    expect((await rows())[0].report).toBeNull();
    expect(await saveReport(query, { token, report: "x".repeat(FREE_RUN_REPORT_CHARS), now: NOW })).toBe("saved");
  });

  it("a second paste replaces the first", async () => {
    const { token } = await startRun(query, { email: "ana@example.com", agent: "claude", now: NOW });
    await saveReport(query, { token, report: "first", now: NOW });
    await saveReport(query, { token, report: "second", now: later(1) });
    expect((await rows())[0].report).toBe("second");
  });
});

describe("reading a run for the page", () => {
  it("gives the agent and whether a report is there, and never the email or the report", async () => {
    const { token } = await startRun(query, { email: "ana@example.com", agent: "hark", now: NOW });
    await saveReport(query, { token, report: REPORT, now: NOW });
    const run = await readRun(query, token);
    expect(run).toEqual({ agent: "hark", hasReport: true });
    expect(JSON.stringify(run)).not.toContain("ana@");
    expect(await readRun(query, "not a token")).toBeNull();
    expect(await readRun(query, newRunToken())).toBeNull();
  });

  it("finds a run only on its own agent's page", async () => {
    const { token } = await startRun(query, { email: "ana@example.com", agent: "hark", now: NOW });
    expect(await readRun(query, token, "hark")).toEqual({ agent: "hark", hasReport: false });
    expect(await readRun(query, token, "claude")).toBeNull();
  });
});

describe("the claim at sign-up (the real claimFreeRun)", () => {
  it("takes a row written here, for a user with the same email and that pending token", async () => {
    const { token } = await startRun(query, { email: "Ana@Example.com", agent: "claude", now: NOW });
    expect(await saveReport(query, { token, report: REPORT, now: later(3) })).toBe("saved");
    const [u] = await query<{ id: string }>("insert into users (email, status, sharing, pending_zack_token) values ('ana@example.com', 'trial', 'share', $1) returning id", [token]);
    expect(await claimFreeRun(query, u.id, "23:59", later(60))).toBe(true);
    expect(await query("select route, agent, raw_text from runs")).toEqual([{ route: "free_tool", agent: "claude", raw_text: REPORT }]);
    expect((await rows())[0].claimed_by).toBe(u.id);
    // Once claimed, the token is spent here too.
    expect(await readRun(query, token)).toBeNull();
  });

  it("does not take a run for a user with another email, or one with no report yet", async () => {
    const { token } = await startRun(query, { email: "ana@example.com", agent: "claude", now: NOW });
    const [same] = await query<{ id: string }>("insert into users (email, status, sharing, pending_zack_token) values ('ana@example.com', 'trial', 'share', $1) returning id", [token]);
    expect(await claimFreeRun(query, same.id, "23:59", later(60))).toBe(false);
    await saveReport(query, { token, report: REPORT, now: later(3) });
    const [other] = await query<{ id: string }>("insert into users (email, status, sharing, pending_zack_token) values ('bo@example.com', 'trial', 'share', $1) returning id", [token]);
    expect(await claimFreeRun(query, other.id, "23:59", later(60))).toBe(false);
    expect((await rows())[0].claimed_by).toBeNull();
  });
});

describe("the retention purge", () => {
  it("deletes an old unclaimed row, clears the report on an old claimed row, and leaves newer rows alone", async () => {
    const [u] = await query<{ id: string }>("insert into users (email, status) values ('u@example.com', 'trial') returning id");
    const oldOpen = await startRun(query, { email: "old-open@example.com", agent: "claude", now: daysAgo(91) });
    await saveReport(query, { token: oldOpen.token, report: REPORT, now: daysAgo(91) });
    const oldClaimed = await startRun(query, { email: "old-claimed@example.com", agent: "claude", now: daysAgo(91) });
    await saveReport(query, { token: oldClaimed.token, report: REPORT, now: daysAgo(91) });
    const newOpen = await startRun(query, { email: "new-open@example.com", agent: "claude", now: daysAgo(89) });
    await saveReport(query, { token: newOpen.token, report: REPORT, now: daysAgo(89) });
    const newClaimed = await startRun(query, { email: "new-claimed@example.com", agent: "claude", now: daysAgo(89) });
    await saveReport(query, { token: newClaimed.token, report: REPORT, now: daysAgo(89) });
    await query("update free_runs set claimed_by = $1 where token = any($2)", [u.id, [oldClaimed.token, newClaimed.token]]);

    expect(await purgeFreeRuns(query, { now: NOW, retentionDays: 90 })).toEqual({ deleted: 1, cleared: 1, orphaned: 0 });
    expect((await rows()).map((r) => [r.email, r.report === null, r.report_at === null, r.claimed_by !== null])).toEqual([
      ["new-claimed@example.com", false, false, true],
      ["new-open@example.com", false, false, false],
      ["old-claimed@example.com", true, true, true],
    ]);
    // Safe to run twice: nothing is left that is due.
    expect(await purgeFreeRuns(query, { now: NOW, retentionDays: 90 })).toEqual({ deleted: 0, cleared: 0, orphaned: 0 });
  });

  it("counts a restarted run's age from the restart", async () => {
    await startRun(query, { email: "ana@example.com", agent: "claude", now: daysAgo(200) });
    await startRun(query, { email: "ana@example.com", agent: "claude", now: daysAgo(10) });
    expect(await purgeFreeRuns(query, { now: NOW, retentionDays: 90 })).toEqual({ deleted: 0, cleared: 0, orphaned: 0 });
    expect(await rows()).toHaveLength(1);
  });

  it("deletes a claimed row once its account is deleted, whatever its age, and keeps one whose account is still there", async () => {
    const users = await query<{ id: string }>(
      "insert into users (email, status, sharing, pending_zack_token) values ('gone@example.com', 'trial', 'share', null), ('gone-old@example.com', 'trial', 'share', null), ('here@example.com', 'trial', 'share', null) returning id",
    );
    const [gone, goneOld, here] = users.map((u) => u.id);
    // A real claim for the first, so the row is one sign-up left behind.
    const claimed = await startRun(query, { email: "gone@example.com", agent: "claude", now: daysAgo(3) });
    await saveReport(query, { token: claimed.token, report: REPORT, now: daysAgo(3) });
    await query("update users set pending_zack_token = $2 where id = $1", [gone, claimed.token]);
    expect(await claimFreeRun(query, gone, "23:59", daysAgo(2))).toBe(true);
    // An old one with its report still on it, so both the clearing and the deleting could apply to it.
    const old = await startRun(query, { email: "gone-old@example.com", agent: "claude", now: daysAgo(120) });
    await saveReport(query, { token: old.token, report: REPORT, now: daysAgo(120) });
    await query("update free_runs set claimed_by = $1 where token = $2", [goneOld, old.token]);
    const kept = await startRun(query, { email: "here@example.com", agent: "claude", now: daysAgo(3) });
    await saveReport(query, { token: kept.token, report: REPORT, now: daysAgo(3) });
    await query("update free_runs set claimed_by = $1 where token = $2", [here, kept.token]);

    // The database does not do this on its own: the column has no foreign key.
    await query("delete from users where id = any($1)", [[gone, goneOld]]);
    expect((await rows()).map((r) => r.email)).toEqual(["gone-old@example.com", "gone@example.com", "here@example.com"]);

    expect(await purgeFreeRuns(query, { now: NOW, retentionDays: 90 })).toEqual({ deleted: 0, cleared: 0, orphaned: 2 });
    expect(await rows()).toEqual([{ token: kept.token, email: "here@example.com", agent: "claude", report: REPORT, report_at: expect.anything(), claimed_by: here }]);
    expect(await purgeFreeRuns(query, { now: NOW, retentionDays: 90 })).toEqual({ deleted: 0, cleared: 0, orphaned: 0 });
  });
});
