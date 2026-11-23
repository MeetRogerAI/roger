import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";

let current: Query;
let settingsFail = false;
let cutoff = "23:59";
const deferred: (() => unknown)[] = [];
const mailed: string[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => deferred.push(fn) }));
const arrived: string[] = [];
vi.mock("@/lib/intake/arrival", () => ({ processArrived: async (_q: unknown, s: { kind: string }) => void arrived.push(s.kind) }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/v3-settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/v3-settings")>()),
  readV3Settings: async () => {
    if (settingsFail) throw new Error("settings down");
    return mergeV3([{ key: "v3.runCutoff", value: cutoff }]);
  },
}));
vi.mock("@/lib/mail/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/mail/send")>()),
  sendToUser: async (_u: unknown, kind: string, ref: string) => {
    mailed.push(`${kind}:${ref}`);
    return "sent";
  },
}));

const { GET } = await import("./instructions/route");
const { POST } = await import("./runs/route");
const { replaceZackKey } = await import("@/lib/zack/key");

let key: string;
let userId: string;
beforeEach(async () => {
  ({ query: current } = await testDb());
  settingsFail = false;
  cutoff = "23:59";
  deferred.length = 0;
  mailed.length = 0;
  // Sunday 2026-11-29, 9:00 PM Toronto.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-30T02:00:00Z"));
  [{ id: userId }] = await current<{ id: string }>("insert into users (email, status, agent, sharing) values ('ana@example.com', 'trial', 'duet', 'share') returning id");
  key = await replaceZackKey(current, userId);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const RUN = "# Zack The Collector (for Duet) v2.0\n\n```roger-run\n{}\n```\n";
const PROFILE = "# Zack Profile - 2026-11-29\n\n```roger-profile\n{}\n```\n";
const send = (body: string, q = "?kind=run", headers: Record<string, string> = { authorization: `Bearer ${key}` }) =>
  POST(new Request(`https://meetroger.ai/api/zack/runs${q}`, { method: "POST", body, headers: { "x-vercel-forwarded-for": "1.2.3.4", ...headers } }));
const fetchInstructions = (q = "", headers: Record<string, string> = { authorization: `Bearer ${key}` }) =>
  GET(new Request(`https://meetroger.ai/api/zack/instructions${q}`, { headers }));

describe("GET /api/zack/instructions", () => {
  it("serves the user's agent's Zack with their rules, uncached", async () => {
    await current("insert into zack_settings (user_id, skip_categories) values ($1, '{Sales}')", [userId]);
    const res = await fetchInstructions();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const text = await res.text();
    expect(text).toContain("Zack The Collector (for Duet)");
    expect(text).toContain('Skip these categories entirely: "Sales".');
    expect(text).toContain("/api/zack/runs?kind=run");
    expect(text).toContain("/api/zack/runs?kind=profile");
  });

  it("reads the rules fresh: a change on the Zack page shows in the next fetch (spec check 5)", async () => {
    const first = await (await fetchInstructions()).text();
    await current("insert into zack_settings (user_id, plays_per_week, never_words, outline_categories, extra_rules) values ($1, 2, '{Acme}', '{Builds}', 'No real estate.')", [userId]);
    const second = await (await fetchInstructions()).text();
    expect(first).not.toContain("Pick at most 2 plays");
    expect(second).toContain("Pick at most 2 plays");
    expect(second).toContain('"Acme"');
    expect(second).toContain('Outline only for these categories: "Builds"');
    expect(second).toContain("> No real estate.");
  });

  it("serves the agent asked for, falls back to the user's own, and grok-bot for any other agent", async () => {
    expect(await (await fetchInstructions(`?agent=hark&test=1&key=${key}`, {})).text()).toContain("(for Hark)");
    expect(await (await fetchInstructions("?agent=bogus")).text()).toContain("(for Duet)");
    await current("update users set agent = 'chatgpt'");
    expect(await (await fetchInstructions()).text()).toContain("(for Grok Bot)");
  });

  it("with Zack off, tells the agent to send nothing (spec check 8)", async () => {
    await current("update users set sharing = 'off'");
    const text = await (await fetchInstructions()).text();
    expect(text).toContain("Send nothing");
    expect(text).not.toContain("/api/zack/runs");
  });

  it("gives a bare 401 without a valid key, and a bare 503 with no key in the log when it fails", async () => {
    const res = await fetchInstructions("", {});
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
    const logs = [vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {})];
    const real = current;
    current = async (t, p) => {
      if (/zack_settings/.test(t)) throw new Error(`query failed: ${t} ${JSON.stringify(p)}`);
      return real(t, p);
    };
    const failed = await fetchInstructions(`?key=${key}`, {});
    expect(failed.status).toBe(503);
    expect(await failed.text()).toBe("");
    expect(JSON.stringify(logs.map((l) => l.mock.calls))).not.toContain(key);
  });
});

describe("POST /api/zack/runs", () => {
  it("stores a run and answers { ok, week_of, replaced } for the coming Monday", async () => {
    const res = await send(RUN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, week_of: "2026-11-30", replaced: false });
    expect(await (await send(RUN + "again")).json()).toMatchObject({ replaced: true });
  });

  it("uses the cutoff setting", async () => {
    cutoff = "18:00";
    expect(await (await send(RUN)).json()).toMatchObject({ week_of: "2026-12-07" });
  });

  it("stores the profile at its own address, never as a run, and refuses a profile sent to the run address", async () => {
    expect((await send(PROFILE, "?kind=profile")).status).toBe(200);
    expect(await current("select 1 from zack_profiles")).toHaveLength(1);
    expect((await send(PROFILE, "?kind=run")).status).toBe(400);
    expect(await current("select 1 from runs")).toHaveLength(0);
  });

  it("accepts the report wrapped in JSON", async () => {
    await send(JSON.stringify({ report: RUN }));
    const [r] = await current<{ raw_text: string }>("select raw_text from runs");
    expect(r.raw_text).toBe(RUN);
  });

  it("stores a test run as a test and sends 'connected' only after answering", async () => {
    const res = await send(RUN, "?kind=run&test=1");
    expect(res.status).toBe(200);
    expect(mailed).toEqual([]);
    for (const fn of deferred) await fn();
    expect(mailed).toEqual(["zack_connected:test"]);
    expect(arrived).toEqual(["run"]);
    const [r] = await current<{ is_test: boolean }>("select is_test from runs");
    expect(r.is_test).toBe(true);
  });

  it("refuses the seventh send in a day, counting only reports that pass the checks", async () => {
    for (let i = 0; i < 3; i++) expect((await send("   ")).status).toBe(400);
    for (let i = 0; i < 6; i++) expect((await send(`${RUN} ${i}`)).status).toBe(200);
    expect((await send(RUN)).status).toBe(429);
  });

  it("gives tests their own allowance, so trying the connection never blocks the real run", async () => {
    for (let i = 0; i < 6; i++) expect((await send(RUN, "?kind=run&test=1")).status).toBe(200);
    expect((await send(RUN, "?kind=run&test=1")).status).toBe(429);
    expect((await send(RUN)).status).toBe(200);
  });

  it("refuses a report over 80,000 characters, and a too-large Content-Length before reading or counting", async () => {
    expect((await send("x".repeat(80_001))).status).toBe(413);
    const big = await POST(
      new Request("https://meetroger.ai/api/zack/runs?kind=run", { method: "POST", body: RUN, headers: { authorization: `Bearer ${key}`, "content-length": String(80_000 * 4 + 1001) } }),
    );
    expect(big.status).toBe(413);
    expect(await current("select 1 from runs")).toHaveLength(0);
    expect(await current("select 1 from rate_events where key like 'zack:send:%'")).toHaveLength(0);
  });

  it("accepts the key in the query string and never writes it to the log", async () => {
    const logs = [vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {})];
    expect((await send(RUN, `?kind=run&key=${key}`, {})).status).toBe(200);
    settingsFail = true;
    expect((await send(RUN, `?kind=run&key=${key}`, {})).status).toBe(503);
    expect(JSON.stringify(logs.map((l) => l.mock.calls))).not.toContain(key);
  });

  it("gives a bare 401 to a wrong key and stores nothing", async () => {
    const res = await send(RUN, "?kind=run", { authorization: "Bearer rgr_zk_nope" });
    expect(res.status).toBe(401);
    expect(await current("select 1 from runs")).toHaveLength(0);
  });
});
