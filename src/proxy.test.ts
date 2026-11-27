import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

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

  it("/start?sponsor= keeps the code in a /start cookie and redirects to the clean URL, other parameters kept (B2 Unit 10)", () => {
    const res = proxy(req("/start?path=re&sponsor=abcd-efgh-2345&cur=CAD"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://meetroger.ai/start?path=re&cur=CAD");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const c = res.headers.getSetCookie().find((l) => l.startsWith("roger-sponsor="))!;
    expect(c).toMatch(/^roger-sponsor=ABCDEFGH2345;/);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/Path=\/start/);
  });

  it("drops a malformed sponsor code from the URL without a cookie, and leaves /start alone otherwise", () => {
    const res = proxy(req("/start?sponsor=%3Cscript%3E"));
    expect(res.headers.get("location")).toBe("https://meetroger.ai/start");
    expect(res.headers.getSetCookie().some((l) => l.startsWith("roger-sponsor="))).toBe(false);
    expect(proxy(req("/start?path=re")).headers.get("location")).toBeNull();
  });

  it("does nothing else on /start: no session renewal there, even with a session cookie", () => {
    const res = proxy(req("/start?path=re", { cookie: "roger-session=abc" }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("runs on /start itself but not on the other sign-up steps", () => {
    expect(config.matcher).toContain("/start");
    expect(config.matcher.some((m) => m === "/start/:path*" || m.startsWith("/start/"))).toBe(false);
  });
});
