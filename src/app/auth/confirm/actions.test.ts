import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { jar, nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
let current: Query;
let failOn: RegExp | null = null;
vi.mock("@/lib/db-query", () => ({
  query: (text: string, params?: unknown[]) => (failOn && failOn.test(text) ? Promise.reject(new Error("blip")) : current(text, params)),
}));

const { confirmSignIn } = await import("./actions");
const { issueToken } = await import("@/lib/auth/login-link");
const { createSession, findSession } = await import("@/lib/auth/session");

const press = (t: string) => {
  const fd = new FormData();
  fd.set("t", t);
  return outcome(() => confirmSignIn(fd));
};

let userId: string;
beforeEach(async () => {
  ({ query: current } = await testDb());
  failOn = null;
  resetNextFakes();
  [{ id: userId }] = await current<{ id: string }>("insert into users (email, signup_step) values ('ana@example.com', 'done') returning id");
});

describe("confirmSignIn", () => {
  it("signs in once, sets both cookies, and goes where the link said", async () => {
    const t = await issueToken(current, { email: "ana@example.com", purpose: "signin", nextPath: "/app/zack" });
    expect(await press(t)).toEqual({ redirect: "/app/zack" });
    expect(jar.has("roger-session")).toBe(true);
    expect(jar.get("roger-in")).toBe("1");
    resetNextFakes();
    expect(await press(t)).toEqual({ redirect: "/signin?e=expired" });
    expect(jar.size).toBe(0);
  });

  it("sends an unknown address to sign-in with a note, setting no cookie", async () => {
    const t = await issueToken(current, { email: "nobody@example.com", purpose: "signin" });
    expect(await press(t)).toEqual({ redirect: "/signin?e=noaccount" });
    expect(jar.size).toBe(0);
  });

  it("asks for a new link, not an error page, when signing in fails after the link was used", async () => {
    const t = await issueToken(current, { email: "ana@example.com", purpose: "signin" });
    failOn = /insert into sessions/;
    expect(await press(t)).toEqual({ redirect: "/signin?e=retry" });
    expect(jar.size).toBe(0);
  });

  it("after an email change, leaves exactly one live session: this one", async () => {
    const old = await createSession(current, userId, "email");
    const t = await issueToken(current, { email: "new@example.com", purpose: "email_change", userId });
    expect(await press(t)).toEqual({ redirect: "/app" });
    expect(await findSession(current, old.token)).toBeNull();
    expect(await findSession(current, jar.get("roger-session"))).not.toBeNull();
    expect(await current("select 1 from sessions")).toHaveLength(1);
  });
});
