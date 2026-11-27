import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";

/** B2 Unit 7 review: /api/leaderboard, the agent surface for the caller's own standing, join and leave. */

const db: { query: Query | null; userId: string | null; on: boolean; allow: boolean; dbDown: boolean } = { query: null, userId: null, on: true, allow: true, dbDown: false };
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  lookupSession: async () => (db.dbDown ? { state: "error" } : db.userId ? { state: "live", session: { userId: db.userId } } : { state: "none", hasCookie: false }),
}));
const settings = () => ({ ...mergeV3([]), signupOpen: true, cycleLive: true, leaderboardOn: db.on });
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => settings() }));
vi.mock("@/lib/v3-settings-display", () => ({ getV3SettingsForDisplay: async () => settings() }));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => db.allow }));

const { GET, POST, DELETE } = await import("./route");

const URL_ = "https://meetroger.ai/api/leaderboard";
const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  POST(new Request(URL_, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
const del = (headers: Record<string, string> = {}) => DELETE(new Request(URL_, { method: "DELETE", headers }));
const onBoard = async () => (await db.query!<{ display_name: string }>("select display_name from users where leaderboard_opt_in_at is not null")).map((r) => r.display_name);

let ken: string;
beforeEach(async () => {
  ({ query: db.query } = await testDb());
  Object.assign(db, { on: true, allow: true, dbDown: false });
  [{ id: ken }] = await db.query!<{ id: string }>("insert into users (email, status, display_name) values ('ken@example.com', 'active', 'Kenneth') returning id");
  db.userId = ken;
  await db.query!("insert into points (user_id, week_of, adopted, confirmed, total, computed_at) values ($1, '2026-11-16', 2, 1, 3, now())", [ken]);
});

describe("GET /api/leaderboard", () => {
  it("returns the caller's own standing as JSON, with no board name until they opt in", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ points: 3, rank: 1, optedIn: false, name: null, open: true });
  });

  it("refuses without a session (401), while signing up (403), and says so when the sign-in check fails (503)", async () => {
    db.userId = null;
    expect((await GET()).status).toBe(401);
    [{ id: db.userId }] = await db.query!<{ id: string }>("insert into users (email, status) values ('new@example.com', 'signup') returning id");
    expect((await GET()).status).toBe(403);
    db.dbDown = true;
    expect((await GET()).status).toBe(503);
  });
});

describe("POST /api/leaderboard", () => {
  it("joins under the name, with the page's rules", async () => {
    const r = await post({ name: "  Ken R. " });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ points: 3, rank: 1, optedIn: true, name: "Ken R.", open: true });
    expect(await onBoard()).toEqual(["Ken R."]);
  });

  it("answers a taken name (409), a bad name (400), the switch off (409) and the rate limit (429) with a message", async () => {
    await db.query!("insert into users (email, status, display_name, leaderboard_name_key, leaderboard_opt_in_at) values ('kim@example.com', 'active', 'Ken R.', 'kenr', now())");
    let r = await post({ name: "KEN R" });
    expect([r.status, await r.json()]).toEqual([409, { error: "That name is taken. Try another.", reason: "taken" }]);
    r = await post({ name: "R0ger" });
    expect([r.status, (await r.json()).reason]).toEqual([400, "invalid"]);
    db.on = false;
    r = await post({ name: "Ken T." });
    expect([r.status, (await r.json()).reason]).toEqual([409, "closed"]);
    db.on = true;
    db.allow = false;
    r = await post({ name: "Ken T." });
    expect([r.status, (await r.json()).reason]).toEqual([429, "limited"]);
    expect(await onBoard()).toEqual(["Ken R."]);
  });

  it("refuses a body that is not JSON (415), a missing name (400) and a cross-site origin (403)", async () => {
    expect((await post("displayName=Ken", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await post({ nom: "Ken" })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ name: "Ken R." }, { "content-type": "application/json", origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ name: "Ken R." }, { "content-type": "application/json", origin: "https://meetroger.ai" })).status).toBe(200);
  });

  it("needs a session", async () => {
    db.userId = null;
    expect((await post({ name: "Ken R." })).status).toBe(401);
    expect(await onBoard()).toEqual([]);
  });
});

describe("DELETE /api/leaderboard", () => {
  it("leaves the board, even while the leaderboard is switched off", async () => {
    await post({ name: "Ken R." });
    db.on = false;
    const r = await del();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ points: 3, rank: 1, optedIn: false, name: null, open: false });
    expect(await onBoard()).toEqual([]);
  });

  it("refuses a cross-site origin and a caller with no session", async () => {
    await post({ name: "Ken R." });
    expect((await del({ origin: "https://evil.example" })).status).toBe(403);
    db.userId = null;
    expect((await del()).status).toBe(401);
    expect(await onBoard()).toEqual(["Ken R."]);
  });
});
