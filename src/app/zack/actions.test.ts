/**
 * The free Zack run's two actions (plan U8), against a real Postgres: the
 * actions' own SQL and the rate counter run on PGlite, so what is asserted is
 * what the table holds afterwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

vi.mock("next/headers", () => nextHeaders);

let db = true;
let q: Query;
let queries = 0;
vi.mock("@/lib/db", () => ({ hasDb: () => db }));
vi.mock("@/lib/db-query", () => ({
  query: (text: string, params?: unknown[]) => {
    queries += 1;
    return q(text, params);
  },
}));

const { startFreeRun, saveFreeReport } = await import("./actions");
const { v1Zack } = await import("@/data/site/v1");
const { limits, windowStart } = await import("@/lib/rate-limit");
const { emailKey, hashSecret } = await import("@/lib/auth/tokens");
const { FREE_RUN_REPORT_CHARS, isRunToken } = await import("@/lib/site/free-run");
const { claimFreeRun } = await import("@/lib/zack/receive");

const idle = { status: "idle" as const };
const NOW = new Date("2026-11-29T23:10:00Z");
const IP = "203.0.113.7";

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.append(k, v);
  return fd;
}
const start = (email: string, over: Record<string, string> = {}) => startFreeRun(idle, form({ agent: "claude", email, ...over }));
const paste = (run: string, report: string, over: Record<string, string> = {}) => saveFreeReport(idle, form({ run, report, ...over }));

type Row = { token: string; email: string; agent: string; report: string | null; claimed_by: string | null };
const rows = () => q<Row>("select token, email, agent, report, claimed_by from free_runs order by email");

const limitKeys = async () => (await q<{ key: string }>("select key from rate_events order by key")).map((r) => r.key);
/** Sets a limit's counter for the current window, by default to the limit itself, so the next try is refused. */
const usedUp = (key: string, l: { limit: number; windowSeconds: number }, count = l.limit) =>
  q("insert into rate_events (key, window_start, count, expires_at) values ($1, $2, $3, $4)", [key, windowStart(NOW, l.windowSeconds), count, new Date(NOW.getTime() + l.windowSeconds * 1000).toISOString()]);

const THREE_PLAYS = [
  "# Zack Run - 2026-11-29",
  "## Summary",
  "Total over a year: about 12.5 hours a week saved (4 to 20)",
  "## 1. Client email in two tones: about 1.6 hours a week saved (1.1 to 2.1)",
  "Saves 25 minutes each time.",
  "### Playbook",
  "## 2. Zoning lookup in plain words: about 3.1 hours a week saved (2.2 to 4.1)",
  "## 3. Listing sheet from rough notes: about 0.8 hours a week saved (0.5 to 1.0)",
].join("\n");

beforeEach(async () => {
  ({ query: q } = await testDb());
  db = true;
  queries = 0;
  resetNextFakes({}, { "x-vercel-forwarded-for": IP });
  // Only the date is held still, so the hour-long limit windows cannot roll over mid-test.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("starting a run", () => {
  it("creates one row and answers with its token, of the shape sign-up accepts", async () => {
    const r = await start("Ana@Example.com");
    expect(r.status).toBe("ok");
    expect(isRunToken(r.token)).toBe(true);
    expect(await rows()).toEqual([{ token: r.token, email: "ana@example.com", agent: "claude", report: null, claimed_by: null }]);
  });

  it("for a repeat email answers with a new token, and no answer contains the earlier one", async () => {
    const first = await start("ana@example.com");
    await paste(first.token!, THREE_PLAYS);
    const second = await start("ana@example.com");
    const third = await start("ANA@example.com ");
    for (const later of [second, third]) {
      expect(later.status).toBe("ok");
      expect(JSON.stringify(later)).not.toContain(first.token!);
    }
    expect(JSON.stringify(third)).not.toContain(second.token!);
    // One row, on the newest token, with the report gone.
    expect(await rows()).toEqual([{ token: third.token, email: "ana@example.com", agent: "claude", report: null, claimed_by: null }]);
  });

  it("for an email whose run is attached to an account answers as for a new one, and starts the same empty run", async () => {
    const first = await start("ana@example.com");
    await paste(first.token!, THREE_PLAYS);
    const [u] = await q<{ id: string }>("insert into users (email, status, sharing, pending_zack_token) values ('ana@example.com', 'trial', 'share', $1) returning id", [first.token]);
    expect(await claimFreeRun(q, u.id, "23:59", NOW)).toBe(true);
    const attached = await q("select * from runs");

    const again = await start("ana@example.com");
    const fresh = await start("someone-new@example.com");
    expect(Object.keys(again).sort()).toEqual(Object.keys(fresh).sort());
    expect(again.status).toBe("ok");
    expect(fresh.status).toBe("ok");
    expect(JSON.stringify(again)).not.toContain(first.token!);
    // Both rows are the same but for the email and the token: no report, no claim.
    expect(await rows()).toEqual([
      { token: again.token, email: "ana@example.com", agent: "claude", report: null, claimed_by: null },
      { token: fresh.token, email: "someone-new@example.com", agent: "claude", report: null, claimed_by: null },
    ]);
    // Both tokens take a report, and the run the account already has is as it was.
    for (const r of [again, fresh]) expect((await paste(r.token!, "## 1. Another report")).status).toBe("ok");
    expect(await q("select * from runs")).toEqual(attached);
  });

  // The limits are proven by what the actions count, not by the numbers in the settings: this fails if an action stops applying one.
  it("counts each start against the per-email and per-IP limits, and each paste against the per-run and per-IP limits", async () => {
    const { token } = await start("ana@example.com");
    await paste(token!, THREE_PLAYS);
    const counted = await q<{ key: string; count: number; window_start: number | string }>("select key, count, window_start from rate_events order by key");
    const windowOf = (l: { windowSeconds: number }) => windowStart(NOW, l.windowSeconds);
    expect(counted.map((r) => ({ key: r.key, count: Number(r.count), window_start: Number(r.window_start) }))).toEqual([
      { key: `zack:report:ip:${IP}`, count: 1, window_start: windowOf(limits.zackReportPerIp) },
      { key: `zack:report:run:${hashSecret(token!).slice(0, 22)}`, count: 1, window_start: windowOf(limits.zackReportPerRun) },
      { key: `zack:run:email:${emailKey("ana@example.com")}`, count: 1, window_start: windowOf(limits.zackRunPerEmail) },
      { key: `zack:run:ip:${IP}`, count: 1, window_start: windowOf(limits.zackRunPerIp) },
    ]);
    // A second of each counts again on the same four keys.
    await paste((await start("ana@example.com")).token!, THREE_PLAYS);
    const again = await q<{ key: string; count: number }>("select key, count from rate_events where key not like 'zack:report:run:%' order by key");
    expect(again.map((r) => Number(r.count))).toEqual([2, 2, 2]);
  });

  it("refuses the sixth start from one email inside the window, and gives the email back to the form", async () => {
    expect(limits.zackRunPerEmail.limit).toBe(5);
    for (let i = 0; i < 5; i++) expect((await start("ana@example.com")).status).toBe("ok");
    const stored = (await rows())[0].token;
    const sixth = await start("ana@example.com");
    expect(sixth).toEqual({ status: "error", message: v1Zack.email.limited, values: { email: "ana@example.com" } });
    // The refused start did not replace the token.
    expect((await rows())[0].token).toBe(stored);
    // Another email on the same address is not held back by it.
    expect((await start("bo@example.com")).status).toBe("ok");
    // After the window, the first email starts again.
    vi.setSystemTime(new Date(NOW.getTime() + limits.zackRunPerEmail.windowSeconds * 1000));
    expect((await start("ana@example.com")).status).toBe("ok");
  });

  it("lets twenty different emails on one IP all start", async () => {
    for (let i = 0; i < 20; i++) expect((await start(`person${i}@example.com`)).status, `email ${i}`).toBe("ok");
    expect(await rows()).toHaveLength(20);
  });

  it("stops at the per-IP backstop, says so without naming the email limit, and does not use up one of the email's tries", async () => {
    await usedUp(`zack:run:ip:${IP}`, limits.zackRunPerIp);
    expect(await start("ana@example.com")).toEqual({ status: "error", message: v1Zack.email.limitedHere, values: { email: "ana@example.com" } });
    expect(await rows()).toEqual([]);
    // The address was counted; the email was not.
    expect(await limitKeys()).toEqual([`zack:run:ip:${IP}`]);
    // From another address the same email still has all of its tries.
    resetNextFakes({}, { "x-vercel-forwarded-for": "198.51.100.9" });
    for (let i = 0; i < limits.zackRunPerEmail.limit; i++) expect((await start("ana@example.com")).status, `try ${i + 1}`).toBe("ok");
  });

  it("lets the last start inside the per-IP backstop through, and refuses the next", async () => {
    await usedUp(`zack:run:ip:${IP}`, limits.zackRunPerIp, limits.zackRunPerIp.limit - 1);
    expect((await start("ana@example.com")).status).toBe("ok");
    expect((await start("bo@example.com")).message).toBe(v1Zack.email.limitedHere);
    expect((await rows()).map((r) => r.email)).toEqual(["ana@example.com"]);
  });

  it("answers a filled honeypot as a success, and writes nothing", async () => {
    const r = await start("bot@example.com", { _gotcha: "http://spam.example" });
    expect(r.status).toBe("ok");
    expect(isRunToken(r.token)).toBe(true);
    expect(await rows()).toEqual([]);
    expect(queries).toBe(0);
  });

  it("refuses a bad email or an agent with no page, counts nothing, and gives back what was typed", async () => {
    expect(await start("not an email")).toEqual({ status: "error", errors: { email: v1Zack.email.invalid }, values: { email: "not an email" } });
    expect(await start("")).toMatchObject({ status: "error", errors: { email: v1Zack.email.invalid }, values: { email: "" } });
    expect(await start("ana@example.com", { agent: "nobody" })).toEqual({ status: "error", message: v1Zack.ourSide, values: { email: "ana@example.com" } });
    expect(queries).toBe(0);
  });

  it("takes an agent with no file of its own, and one that is not listed", async () => {
    for (const agent of ["viktor", "other"]) expect((await start("ana@example.com", { agent })).status, agent).toBe("ok");
    expect((await rows()).map((r) => r.agent).sort()).toEqual(["other", "viktor"]);
  });

  it("never puts the email in a limit key", async () => {
    await start("ana@example.com");
    const keys = (await q<{ key: string }>("select key from rate_events")).map((r) => r.key);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).not.toContain("ana");
  });
});

describe("pasting the report back", () => {
  it("stores the report on the row its token names, and gives the three play titles", async () => {
    const { token } = await start("ana@example.com");
    const r = await paste(token!, THREE_PLAYS);
    expect(r).toEqual({ status: "ok", titles: ["Client email in two tones", "Zoning lookup in plain words", "Listing sheet from rough notes"] });
    expect((await rows())[0].report).toBe(THREE_PLAYS);
  });

  it("never shows a figure of time from the report in the summary", async () => {
    const { token } = await start("ana@example.com");
    const r = await paste(token!, THREE_PLAYS);
    expect(JSON.stringify(r)).not.toMatch(/\d[\d.,]*\s*-?\s*(hour|minute)/i);
  });

  it("with no play headings still saves the report, and answers with no titles", async () => {
    const { token } = await start("ana@example.com");
    const report = "Here is what my agent did this week. No headings at all.";
    expect(await paste(token!, report)).toEqual({ status: "ok", titles: [] });
    expect((await rows())[0].report).toBe(report);
  });

  it("stores nothing for an unknown token, says the link is no longer active, and gives the text back", async () => {
    const { token } = await start("ana@example.com");
    const unknown = `${token!.slice(0, -4)}AAAA`;
    for (const bad of [unknown, "", "not a token"]) {
      expect(await paste(bad, THREE_PLAYS), bad).toEqual({ status: "gone", message: v1Zack.paste.notSaved, values: { report: THREE_PLAYS } });
    }
    expect((await rows())[0].report).toBeNull();
  });

  it("stores nothing through a token that a repeat start replaced, or one whose run is claimed", async () => {
    const first = await start("ana@example.com");
    const second = await start("ana@example.com");
    expect((await paste(first.token!, THREE_PLAYS)).status).toBe("gone");
    expect((await rows())[0].report).toBeNull();
    const [u] = await q<{ id: string }>("insert into users (email, status) values ('ana@example.com', 'trial') returning id");
    await q("update free_runs set claimed_by = $1", [u.id]);
    expect((await paste(second.token!, THREE_PLAYS)).status).toBe("gone");
    expect((await rows())[0].report).toBeNull();
  });

  it("refuses a report one character over the cap with a message, and returns the pasted text to the form", async () => {
    const { token } = await start("ana@example.com");
    const report = "x".repeat(FREE_RUN_REPORT_CHARS + 1);
    const r = await paste(token!, report);
    expect(r.status).toBe("error");
    expect(r.errors?.report).toBe("That is over 40,000 characters. Paste the run file only, without the matching profile.");
    expect(r.values?.report).toBe(report);
    expect((await rows())[0].report).toBeNull();
    expect((await paste(token!, "x".repeat(FREE_RUN_REPORT_CHARS))).status).toBe("ok");
  });

  it("refuses an empty report with a message", async () => {
    const { token } = await start("ana@example.com");
    for (const empty of ["", "   \n\n  "]) {
      expect(await paste(token!, empty)).toEqual({ status: "error", errors: { report: v1Zack.paste.empty }, values: { report: empty } });
    }
    expect((await rows())[0].report).toBeNull();
  });

  it("counts a line break as one character, as it was before the browser sent it", async () => {
    const { token } = await start("ana@example.com");
    const lines = Array.from({ length: 2_000 }, () => "123456789").join("\r\n");
    expect(lines.replace(/\r\n/g, "\n")).toHaveLength(19_999);
    expect((await paste(token!, lines)).status).toBe("ok");
    expect((await rows())[0].report).not.toContain("\r");
  });

  it("answers a filled honeypot as a success, and writes nothing", async () => {
    const { token } = await start("ana@example.com");
    const before = queries;
    expect((await paste(token!, THREE_PLAYS, { _gotcha: "x" })).status).toBe("ok");
    expect(queries).toBe(before);
    expect((await rows())[0].report).toBeNull();
  });

  it("allows a few pastes per run and then refuses, with the text given back", async () => {
    const { token } = await start("ana@example.com");
    for (let i = 0; i < limits.zackReportPerRun.limit; i++) expect((await paste(token!, `report ${i}`)).status).toBe("ok");
    expect(await paste(token!, "one more")).toEqual({ status: "error", message: v1Zack.paste.limited, values: { report: "one more" } });
    expect((await rows())[0].report).toBe(`report ${limits.zackReportPerRun.limit - 1}`);
  });

  it("stops at the per-IP backstop before anything is stored or counted against the run, and gives the text back", async () => {
    const { token } = await start("ana@example.com");
    await usedUp(`zack:report:ip:${IP}`, limits.zackReportPerIp);
    expect(await paste(token!, THREE_PLAYS)).toEqual({ status: "error", message: v1Zack.email.limitedHere, values: { report: THREE_PLAYS } });
    expect((await rows())[0].report).toBeNull();
    expect((await limitKeys()).filter((k) => k.startsWith("zack:report:"))).toEqual([`zack:report:ip:${IP}`]);
    // The same answer for a token that opens nothing: the backstop comes before the token is looked at.
    expect((await paste("not a token", THREE_PLAYS)).message).toBe(v1Zack.email.limitedHere);
    // From another address the same run takes the report.
    resetNextFakes({}, { "x-vercel-forwarded-for": "198.51.100.9" });
    expect((await paste(token!, THREE_PLAYS)).status).toBe("ok");
  });

  it("lets the last paste inside the per-IP backstop through, and refuses the next", async () => {
    const { token } = await start("ana@example.com");
    await usedUp(`zack:report:ip:${IP}`, limits.zackReportPerIp, limits.zackReportPerIp.limit - 1);
    expect((await paste(token!, "first")).status).toBe("ok");
    expect((await paste(token!, "second")).message).toBe(v1Zack.email.limitedHere);
    expect((await rows())[0].report).toBe("first");
  });

  it("never puts the token in a limit key", async () => {
    const { token } = await start("ana@example.com");
    await paste(token!, THREE_PLAYS);
    const keys = (await q<{ key: string }>("select key from rate_events")).map((r) => r.key);
    expect(keys.some((k) => k.startsWith("zack:report:run:"))).toBe(true);
    for (const key of keys) expect(key).not.toContain(token!);
  });
});

describe("the whole way to sign-up", () => {
  it("leaves a row the real claimFreeRun takes, for a user with the same email and that token", async () => {
    const { token } = await start("Ana@Example.com");
    await paste(token!, THREE_PLAYS);
    const [u] = await q<{ id: string }>("insert into users (email, status, sharing, pending_zack_token) values ('ana@example.com', 'trial', 'share', $1) returning id", [token]);
    expect(await claimFreeRun(q, u.id, "23:59", NOW)).toBe(true);
    expect(await q("select route, agent, raw_text from runs")).toEqual([{ route: "free_tool", agent: "claude", raw_text: THREE_PLAYS }]);
  });
});

describe("with no database", () => {
  it("both actions answer that saving is not switched on, give back what was typed, and do not throw", async () => {
    db = false;
    q = async () => {
      throw new Error("no database should be touched");
    };
    expect(await start("ana@example.com")).toEqual({ status: "error", message: v1Zack.noDatabase, values: { email: "ana@example.com" } });
    expect(await paste("A".repeat(43), THREE_PLAYS)).toEqual({ status: "error", message: v1Zack.noDatabase, values: { report: THREE_PLAYS } });
    expect(queries).toBe(0);
  });
});

describe("when the database fails", () => {
  it("both actions answer with a plain message and what was typed", async () => {
    const { token } = await start("ana@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    q = async () => {
      throw new Error("connection refused");
    };
    expect(await start("ana@example.com")).toEqual({ status: "error", message: v1Zack.ourSide, values: { email: "ana@example.com" } });
    expect(await paste(token!, THREE_PLAYS)).toEqual({ status: "error", message: v1Zack.ourSide, values: { report: THREE_PLAYS } });
  });
});
