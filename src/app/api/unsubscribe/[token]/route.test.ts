import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

let dbOn = true;
vi.mock("@/lib/db", () => ({ hasDb: () => dbOn }));
let current: Query;
let failOn: RegExp | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => (failOn && failOn.test(t) ? Promise.reject(new Error("blip")) : current(t, p)) }));

const { GET, POST } = await import("./route");
const { unsubToken } = await import("@/lib/mail/unsubscribe");

let id: string;
const prefs = async () => (await current<{ email_prefs: Record<string, unknown> }>("select email_prefs from users where id = $1", [id]))[0].email_prefs;
const oneClick = (token: string) =>
  POST(
    new NextRequest(`http://localhost:3000/api/unsubscribe/${token}`, {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }),
    { params: Promise.resolve({ token }) },
  );
const tamper = (t: string, i: number) => `${t.slice(0, i)}${t[i] === "A" ? "B" : "A"}${t.slice(i + 1)}`;

beforeEach(async () => {
  vi.stubEnv("UNSUB_SECRET", "route-secret");
  dbOn = true;
  failOn = null;
  ({ query: current } = await testDb());
  [{ id }] = await current<{ id: string }>(`insert into users (email, status, email_prefs) values ('a@example.com', 'active', '{"monday": true}') returning id`);
});

describe("/api/unsubscribe/{token}", () => {
  it("a one-click POST switches the stats email off and leaves Monday on", async () => {
    const res = await oneClick(unsubToken(id)!);
    expect(res.status).toBe(200);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await res.text()).toBe("You won’t get the Wednesday stats email any more.");
    expect(await prefs()).toEqual({ monday: true, stats: false });
    // Again: still fine, still off.
    expect((await oneClick(unsubToken(id)!)).status).toBe(200);
  });

  it("a tampered token changes nothing", async () => {
    const res = await oneClick(tamper(unsubToken(id)!, 10));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("This link isn’t valid.");
    expect(await prefs()).toEqual({ monday: true });
  });

  it("a valid token for a member who no longer exists writes nothing", async () => {
    const gone = "0b7c2a9e-1111-4222-8333-944455556666";
    const res = await oneClick(unsubToken(gone)!);
    expect(res.status).toBe(400);
    expect(await current("select 1 from users where id = $1", [gone])).toEqual([]);
    expect(await prefs()).toEqual({ monday: true });
  });

  it("answers 503 without a database and 500 when the write fails, changing nothing", async () => {
    dbOn = false;
    expect((await oneClick(unsubToken(id)!)).status).toBe(503);
    dbOn = true;
    failOn = /update users set email_prefs/;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await oneClick(unsubToken(id)!)).status).toBe(500);
    } finally {
      err.mockRestore();
    }
    failOn = null;
    expect(await prefs()).toEqual({ monday: true });
  });

  it("a GET changes nothing and goes to the page with the button", async () => {
    const t = unsubToken(id)!;
    const res = await GET(new NextRequest(`http://localhost:3000/api/unsubscribe/${t}`), { params: Promise.resolve({ token: t }) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`http://localhost:3000/u/${t}`);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await prefs()).toEqual({ monday: true });
  });
});
