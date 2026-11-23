import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { consumeToken, issueToken, tokenIsLive, userForToken } from "./login-link";
import { safeNext } from "./secrets";
import { createSession, findSession, revokeSession, revokeUserSessions, sessionIsAdmin } from "./session";

let query: Query;
let userId: string;
const t0 = new Date("2026-11-22T15:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60_000;
const DAY = 86_400_000;

beforeEach(async () => {
  ({ query } = await testDb());
  [{ id: userId }] = await query<{ id: string }>("insert into users (email) values ('a@example.com') returning id");
});

describe("sign-in links", () => {
  it("works once", async () => {
    const tok = await issueToken(query, { email: "A@Example.com ", purpose: "signin", nextPath: "/app/zack" }, t0);
    const used = await consumeToken(query, tok, later(MIN));
    expect(used).toMatchObject({ email: "a@example.com", purpose: "signin", nextPath: "/app/zack" });
    expect(await consumeToken(query, tok, later(2 * MIN))).toBeNull();
  });

  it("stops working after 15 minutes", async () => {
    const tok = await issueToken(query, { email: "a@example.com", purpose: "signin" }, t0);
    expect(await consumeToken(query, tok, later(15 * MIN + 1000))).toBeNull();
  });

  it("is still live after being looked at, so a mail scanner cannot burn it", async () => {
    const tok = await issueToken(query, { email: "a@example.com", purpose: "signin" }, t0);
    expect(await tokenIsLive(query, tok, later(MIN))).toBe(true);
    expect(await tokenIsLive(query, tok, later(MIN))).toBe(true);
    expect(await consumeToken(query, tok, later(2 * MIN))).not.toBeNull();
  });

  it("is used by exactly one of two racing presses", async () => {
    const tok = await issueToken(query, { email: "a@example.com", purpose: "signin" }, t0);
    const r = await Promise.all([consumeToken(query, tok, later(MIN)), consumeToken(query, tok, later(MIN))]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it("stores only a hash of the token", async () => {
    const tok = await issueToken(query, { email: "a@example.com", purpose: "signin" }, t0);
    const rows = await query<{ token_hash: string }>("select token_hash from login_tokens");
    expect(rows[0].token_hash).not.toBe(tok);
  });

  it("refuses an outside address as the place to go next", async () => {
    const tok = await issueToken(query, { email: "a@example.com", purpose: "signin", nextPath: "//evil.test/x" }, t0);
    expect((await consumeToken(query, tok, later(MIN)))!.nextPath).toBe("/app");
  });

  it("finds the account by email and marks it verified", async () => {
    const tok = await issueToken(query, { email: "a@example.com", purpose: "signin" }, t0);
    const user = await userForToken(query, (await consumeToken(query, tok, later(MIN)))!, later(MIN));
    expect(user?.id).toBe(userId);
    const [{ email_verified_at }] = await query<{ email_verified_at: unknown }>("select email_verified_at from users");
    expect(email_verified_at).not.toBeNull();
  });

  it("signs in to no account for an unknown address", async () => {
    const tok = await issueToken(query, { email: "nobody@example.com", purpose: "signin" }, t0);
    expect(await userForToken(query, (await consumeToken(query, tok, later(MIN)))!)).toBeNull();
  });

  it("lasts 7 days for an admin-made pilot link", async () => {
    const tok = await issueToken(query, { email: "a@example.com", purpose: "pilot", userId, createdBy: "peter@example.com" }, t0);
    expect(await consumeToken(query, tok, later(6 * DAY))).not.toBeNull();
  });

  it("changes the email only when the new address's link is used, and never to one in use", async () => {
    await query("insert into users (email) values ('taken@example.com')");
    const tok = await issueToken(query, { email: "taken@example.com", purpose: "email_change", userId }, t0);
    expect(await userForToken(query, (await consumeToken(query, tok, later(MIN)))!)).toBeNull();
    const ok = await issueToken(query, { email: "new@example.com", purpose: "email_change", userId }, t0);
    expect((await userForToken(query, (await consumeToken(query, ok, later(MIN)))!))?.email).toBe("new@example.com");
  });
});

describe("sessions", () => {
  it("finds a live session and not an expired one", async () => {
    const { token } = await createSession(query, userId, "email", t0);
    expect((await findSession(query, token, later(DAY)))?.userId).toBe(userId);
    expect(await findSession(query, token, later(31 * DAY))).toBeNull();
  });

  it("renews on use, at most once a day", async () => {
    const { token, expiresAt } = await createSession(query, userId, "email", t0);
    const same = await findSession(query, token, later(2 * 60 * MIN));
    expect(same!.expiresAt.getTime()).toBe(expiresAt.getTime());
    const renewed = await findSession(query, token, later(20 * DAY));
    expect(renewed!.expiresAt.getTime()).toBe(later(50 * DAY).getTime());
  });

  it("refuses a forged or unknown cookie", async () => {
    expect(await findSession(query, "not-a-real-session", t0)).toBeNull();
    expect(await findSession(query, undefined, t0)).toBeNull();
  });

  it("ends on sign-out, and other sessions end on demand", async () => {
    const a = await createSession(query, userId, "email", t0);
    const b = await createSession(query, userId, "email", t0);
    await revokeSession(query, a.token);
    expect(await findSession(query, a.token, t0)).toBeNull();
    const c = await createSession(query, userId, "email", t0);
    const cInfo = await findSession(query, c.token, t0);
    await revokeUserSessions(query, userId, cInfo!.idHash);
    expect(await findSession(query, b.token, t0)).toBeNull();
    expect(await findSession(query, c.token, t0)).not.toBeNull();
  });

  it("gives a new id on every sign-in", async () => {
    const a = await createSession(query, userId, "email", t0);
    const b = await createSession(query, userId, "email", t0);
    expect(a.token).not.toBe(b.token);
  });
});

describe("admin", () => {
  const s = { idHash: "x", userId: "u", email: "peter@example.com", method: "email" as const, createdAt: t0, expiresAt: later(30 * DAY) };
  const admins = ["peter@example.com", "ehab@example.com"];

  it("is an email-link session for a listed address, from the last 14 days", () => {
    expect(sessionIsAdmin(s, admins, later(DAY))).toBe(true);
    expect(sessionIsAdmin(s, admins, later(15 * DAY))).toBe(false);
  });

  it("is never granted by Google alone or to an unlisted address", () => {
    expect(sessionIsAdmin({ ...s, method: "google" }, admins, later(DAY))).toBe(false);
    expect(sessionIsAdmin({ ...s, email: "someone@example.com" }, admins, later(DAY))).toBe(false);
  });

  it("is lost as soon as the address leaves the list", () => {
    expect(sessionIsAdmin(s, ["ehab@example.com"], later(DAY))).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps same-site paths and refuses anything else", () => {
    expect(safeNext("/app/billing")).toBe("/app/billing");
    expect(safeNext("https://evil.test")).toBe("/app");
    expect(safeNext("//evil.test")).toBe("/app");
    expect(safeNext("/\\evil.test")).toBe("/app");
    expect(safeNext(undefined, "/admin")).toBe("/admin");
  });
});
