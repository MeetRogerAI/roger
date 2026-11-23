import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const req = (path: string, init: { cookie?: string; method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`https://meetroger.ai${path}`, {
    method: init.method ?? "GET",
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers ?? {}) },
  });

describe("proxy", () => {
  it("sends a visitor with no session cookie from /app to sign in, keeping the path and query", () => {
    const res = proxy(req("/app/zack?tab=key"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://meetroger.ai/signin?next=%2Fapp%2Fzack%3Ftab%3Dkey");
  });

  it("leaves /admin and the builder previews alone without a cookie", () => {
    expect(proxy(req("/admin")).headers.get("location")).toBeNull();
    expect(proxy(req("/app/dev/quiz")).headers.get("location")).toBeNull();
  });

  it("renews both cookies on a page load: the session httpOnly, the hint readable", () => {
    const set = proxy(req("/app", { cookie: "roger-session=abc" })).headers.getSetCookie();
    const session = set.find((c) => c.startsWith("roger-session="))!;
    const hint = set.find((c) => c.startsWith("roger-in="))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Max-Age=2592000/);
    expect(hint).not.toMatch(/HttpOnly/i);
  });

  it("does not renew on a form post or server action, which may be signing out", () => {
    expect(proxy(req("/admin", { cookie: "roger-session=abc", method: "POST" })).headers.getSetCookie()).toEqual([]);
    expect(proxy(req("/admin", { cookie: "roger-session=abc", headers: { "next-action": "x" } })).headers.getSetCookie()).toEqual([]);
  });
});
