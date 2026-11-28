import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { DRAFT_COOKIE, jar, nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));

let failDb = false;
let current: Query;
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
vi.mock("@/lib/db-query", () => ({
  query: (text: string, params?: unknown[]) => {
    if (failDb) return Promise.reject(new Error("connection refused"));
    return current(text, params);
  },
}));

const { requireUser, requireUserForAction, isEmailAdmin, SessionCheckUnavailable } = await import("./access");
const { createSession, SESSION_COOKIE } = await import("./session");
const { GET: clearRoute } = await import("@/app/auth/clear/route");
const { POST: signoutRoute, GET: signoutGet } = await import("@/app/auth/signout/route");

let userId: string;
beforeEach(async () => {
  ({ query: current } = await testDb());
  failDb = false;
  [{ id: userId }] = await current<{ id: string }>("insert into users (email, email_verified_at) values ('peter@example.com', now()) returning id");
  process.env.ADMIN_EMAILS = "peter@example.com";
});

describe("requireUser", () => {
  it("returns the live session", async () => {
    const { token } = await createSession(current, userId, "email");
    resetNextFakes({ [SESSION_COOKIE]: token });
    expect((await requireUser()).userId).toBe(userId);
  });

  it("sends a visitor with no cookie to sign in, keeping where they were going", async () => {
    resetNextFakes();
    expect(await outcome(() => requireUser("/app/zack"))).toEqual({ redirect: "/signin?next=%2Fapp%2Fzack" });
  });

  it("sends a dead cookie through /auth/clear, which removes it", async () => {
    resetNextFakes({ [SESSION_COOKIE]: "revoked-or-forged", "roger-in": "1" });
    const r = await outcome(() => requireUser());
    expect(r).toEqual({ redirect: "/auth/clear?next=%2Fsignin%3Fnext%3D%252Fapp" });
    const res = await clearRoute(new Request("https://meetroger.ai/auth/clear?next=%2Fsignin"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/signin");
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(jar.has("roger-in")).toBe(false);
  });

  it("keeps a good cookie when the database cannot be reached, and says so", async () => {
    const { token } = await createSession(current, userId, "email");
    resetNextFakes({ [SESSION_COOKIE]: token, "roger-in": "1" });
    failDb = true;
    await expect(requireUser()).rejects.toBeInstanceOf(SessionCheckUnavailable);
    await clearRoute(new Request("https://meetroger.ai/auth/clear"));
    expect(jar.get(SESSION_COOKIE)).toBe(token);
  });

  it("never clears a live session through /auth/clear", async () => {
    const { token } = await createSession(current, userId, "email");
    resetNextFakes({ [SESSION_COOKIE]: token });
    await clearRoute(new Request("https://meetroger.ai/auth/clear"));
    expect(jar.get(SESSION_COOKIE)).toBe(token);
  });
});

describe("actions and admin", () => {
  it("refuses a server action with no session", async () => {
    resetNextFakes();
    await expect(requireUserForAction()).rejects.toThrow("Not signed in");
  });

  it("drops admin on the next request once the address leaves ADMIN_EMAILS", async () => {
    const { token } = await createSession(current, userId, "email");
    resetNextFakes({ [SESSION_COOKIE]: token });
    expect(await isEmailAdmin()).toBe(true);
    process.env.ADMIN_EMAILS = "ehab@example.com";
    expect(await isEmailAdmin()).toBe(false);
  });
});

describe("sign-out route", () => {
  it("ends the session and clears both cookies for a POST from this site, and an admin's preview of the drafts with them", async () => {
    const { token } = await createSession(current, userId, "email");
    resetNextFakes({ [SESSION_COOKIE]: token, "roger-in": "1", [DRAFT_COOKIE]: "bypass" });
    const res = await signoutRoute(new Request("https://meetroger.ai/auth/signout", { method: "POST", headers: { origin: "https://meetroger.ai", host: "meetroger.ai" } }));
    expect(res.status).toBe(303);
    expect(jar.size).toBe(0);
    expect(await current("select 1 from sessions")).toHaveLength(0);
  });

  it("does nothing for a POST from another site or a GET", async () => {
    const { token } = await createSession(current, userId, "email");
    resetNextFakes({ [SESSION_COOKIE]: token });
    const res = await signoutRoute(new Request("https://meetroger.ai/auth/signout", { method: "POST", headers: { origin: "https://evil.test", host: "meetroger.ai" } }));
    expect(res.status).toBe(403);
    expect(signoutGet().status).toBe(405);
    expect(jar.get(SESSION_COOKIE)).toBe(token);
    expect(await current("select 1 from sessions")).toHaveLength(1);
  });
});
