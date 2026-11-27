import { generateKeyPairSync, sign, type JsonWebKey, type KeyObject } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { testDb } from "@/test-helpers/pglite-db";
import { GoogleSignInLink } from "@/components/app/google-button";
import type { NewAccount } from "./login-link";
import { changeUserEmail } from "@/lib/admin/users";
import { beginGoogle, completeGoogle, googleConfig, googleVouches, unlinkGoogle, verifyIdToken, type CodeExchange, type GoogleConfig } from "./google";
import { findSession, sessionIsAdmin } from "./session";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

const cfg: GoogleConfig = { clientId: "client-123.apps.googleusercontent.com", clientSecret: "shh" };
const NOW = new Date("2026-12-01T15:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);

const pair = () => generateKeyPairSync("rsa", { modulusLength: 2048 });
const google = pair();
const stranger = pair();
const jwk = google.publicKey.export({ format: "jwk" }) as JsonWebKey;
const keys = async (kid: string) => (kid === "k1" ? jwk : null);

function idToken(claims: Record<string, unknown>, o: { key?: KeyObject; kid?: string; alg?: string } = {}): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = enc({ alg: o.alg ?? "RS256", kid: o.kid ?? "k1", typ: "JWT" });
  const body = enc(claims);
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), o.key ?? google.privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const claimsFor = (nonce: string, extra: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: cfg.clientId,
  sub: "g-111",
  email: "Ana@Gmail.com",
  email_verified: true,
  name: "Ana Google",
  iat: nowSec - 10,
  exp: nowSec + 3600,
  nonce,
  ...extra,
});

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
});
afterEach(() => vi.unstubAllEnvs());

/** A whole round trip: begin, then Google answers with a token made from `extra` claims. */
async function roundTrip(
  o: { extra?: Record<string, unknown>; newAccount?: NewAccount; next?: string; cookieState?: string; signedInAs?: string; open?: boolean; admins?: string[] } = {},
) {
  const { url, state } = await beginGoogle(query, cfg, { next: o.next ?? "/app", newAccount: o.newAccount, now: NOW });
  const nonce = new URL(url).searchParams.get("nonce")!;
  const calls: Parameters<CodeExchange>[0][] = [];
  const exchange: CodeExchange = async (c) => {
    calls.push(c);
    return idToken(claimsFor(nonce, o.extra));
  };
  const run = (cookieState = o.cookieState ?? state) =>
    completeGoogle(
      query,
      cfg,
      { state, cookieState, code: "code-1", signedInAs: o.signedInAs },
      { exchange, keys, now: NOW, query, transport, signupOpen: async () => o.open ?? true, adminEmails: o.admins ?? [] },
    );
  return { url, state, calls, run };
}
const signupDetails: NewAccount = { name: "", path: "running", notReady: false, profile: { q: 1 }, agent: "hark", currency: "CAD", ref: "r1", utm: "u1", zack: null };

describe("the ID token", () => {
  const ok = (extra: Record<string, unknown> = {}, o?: Parameters<typeof idToken>[1]) =>
    verifyIdToken(idToken(claimsFor("n1", extra), o), { clientId: cfg.clientId, nonce: "n1", keys, now: NOW });

  it("accepts one signed by Google's key for this client", async () => {
    expect(await ok()).toEqual({ sub: "g-111", email: "ana@gmail.com", emailVerified: true, name: "Ana Google", hd: null });
  });

  it("refuses another issuer, another audience, an expired token, a wrong nonce, a stranger's signature, an unknown key or no algorithm", async () => {
    expect(await ok({ iss: "https://evil.example" })).toBeNull();
    expect(await ok({ aud: "someone-else" })).toBeNull();
    expect(await ok({ exp: nowSec - 120 })).toBeNull();
    expect(await ok({ nonce: "n2" })).toBeNull();
    expect(await ok({}, { key: stranger.privateKey })).toBeNull();
    expect(await ok({}, { kid: "k9" })).toBeNull();
    expect(await ok({}, { alg: "none" })).toBeNull();
  });

  it("reads an unverified email as unverified", async () => {
    expect(await ok({ email_verified: false })).toMatchObject({ emailVerified: false });
  });
});

describe("starting a sign-in", () => {
  it("sends PKCE (S256), state and nonce, and stores only the state's hash", async () => {
    const { url, state } = await beginGoogle(query, cfg, { next: "/app/billing", now: NOW });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(state);
    expect(u.searchParams.get("redirect_uri")).toMatch(/\/auth\/google\/callback$/);
    const rows = await query<{ state_hash: string; next_path: string }>("select state_hash, next_path from oauth_states");
    expect(rows).toHaveLength(1);
    expect(rows[0].state_hash).not.toBe(state);
    expect(rows[0].next_path).toBe("/app/billing");
  });
});

describe("the callback", () => {
  it("signs a person who signed up by email link in to the same account, links Google and tells their address", async () => {
    const [{ id }] = await query<{ id: string }>("insert into users (email, signup_step, status) values ('ana@gmail.com', 'done', 'trial') returning id");
    const t = await roundTrip({ next: "/app/zack" });
    const out = await t.run();
    expect(out).toMatchObject({ kind: "signed_in", userId: id, next: "/app/zack", linked: true, created: false });
    expect(t.calls[0].verifier).toBeTruthy();
    expect(await query("select google_sub from users")).toEqual([{ google_sub: "g-111" }]);
    expect(sent.map((m) => m.to[0])).toEqual(["ana@gmail.com"]);
    expect(sent[0].subject).toBe("Google sign-in added to your Roger account");
    if (out.kind !== "signed_in") throw new Error("not signed in");
    expect((await findSession(query, out.token, NOW))?.method).toBe("google");
  });

  it("refuses an unverified email", async () => {
    await query("insert into users (email) values ('ana@gmail.com')");
    expect(await (await roundTrip({ extra: { email_verified: false } })).run()).toEqual({ kind: "refused", reason: "unverified" });
    expect(await query("select google_sub from users")).toEqual([{ google_sub: null }]);
    expect(await query("select 1 from sessions")).toEqual([]);
  });

  it("refuses a wrong state value without asking Google for anything", async () => {
    await query("insert into users (email) values ('ana@gmail.com')");
    const t = await roundTrip({ cookieState: "not-the-state" });
    expect(await t.run()).toEqual({ kind: "refused", reason: "state" });
    expect(t.calls).toEqual([]);
    const deps = { exchange: async () => null, keys, now: NOW, query, transport, signupOpen: async () => true };
    expect(await completeGoogle(query, cfg, { state: t.state, cookieState: null, code: "c" }, deps)).toEqual({
      kind: "refused",
      reason: "state",
    });
  });

  it("refuses a replayed code: the state is used once", async () => {
    await query("insert into users (email) values ('ana@gmail.com')");
    const t = await roundTrip();
    expect((await t.run()).kind).toBe("signed_in");
    expect(await t.run()).toEqual({ kind: "refused", reason: "state" });
    expect(t.calls).toHaveLength(1);
  });

  it("refuses a state older than ten minutes", async () => {
    await query("insert into users (email) values ('ana@gmail.com')");
    const t = await roundTrip();
    await query("update oauth_states set expires_at = $1", [new Date(NOW.getTime() - 1000).toISOString()]);
    expect(await t.run()).toEqual({ kind: "refused", reason: "state" });
  });

  it("reaches a linked account by Google's id, whatever its address", async () => {
    const [{ id }] = await query<{ id: string }>("insert into users (email, google_sub) values ('ana.work@example.com', 'g-111') returning id");
    const out = await (await roundTrip()).run();
    expect(out).toMatchObject({ kind: "signed_in", userId: id, linked: false });
    expect(sent).toEqual([]);
  });

  it("is unlinked when an admin changes the member's address, so Google no longer reaches the account", async () => {
    const [{ id }] = await query<{ id: string }>("insert into users (email, google_sub, google_email) values ('ana@gmail.com', 'g-111', 'ana@gmail.com') returning id");
    expect((await changeUserEmail(query, { query, transport }, "admin@example.com", id, "ana.new@example.com")).ok).toBe(true);
    expect(await query("select google_sub, google_email from users")).toEqual([{ google_sub: null, google_email: null }]);
    expect(await (await roundTrip()).run()).toEqual({ kind: "refused", reason: "noaccount" });
  });

  it("asks for an email link first when Google is not the authority for an existing account's address", async () => {
    await query("insert into users (email) values ('ana@example.com')");
    expect(await (await roundTrip({ extra: { email: "ana@example.com" } })).run()).toEqual({ kind: "refused", reason: "email_first" });
    expect(await query("select google_sub from users")).toEqual([{ google_sub: null }]);
    expect(await query("select 1 from sessions")).toEqual([]);
    // A Workspace account for another domain is no authority either.
    expect(await (await roundTrip({ extra: { email: "ana@example.com", hd: "other.example" } })).run()).toEqual({ kind: "refused", reason: "email_first" });
  });

  it("links a non-Gmail address when the browser is already signed in to that account by email link, without marking it verified", async () => {
    const [{ id }] = await query<{ id: string }>("insert into users (email) values ('ana@example.com') returning id");
    const out = await (await roundTrip({ extra: { email: "ana@example.com" }, signedInAs: id })).run();
    expect(out).toMatchObject({ kind: "signed_in", userId: id, linked: true });
    expect(await query("select google_sub, google_email, email_verified_at from users")).toEqual([{ google_sub: "g-111", google_email: "ana@example.com", email_verified_at: null }]);
  });

  it("trusts a Workspace account whose hd claim is the address's own domain", async () => {
    const [{ id }] = await query<{ id: string }>("insert into users (email) values ('ana@example.com') returning id");
    expect(await (await roundTrip({ extra: { email: "ana@example.com", hd: "example.com" } })).run()).toMatchObject({ kind: "signed_in", userId: id });
    expect(googleVouches({ email: "x@googlemail.com", hd: null })).toBe(true);
  });

  it("sends the ordinary sign-up link for a new non-Gmail address, and makes no account from Google", async () => {
    const out = await (await roundTrip({ extra: { email: "ana@example.com" }, newAccount: signupDetails })).run();
    expect(out).toEqual({ kind: "email_sent" });
    expect(await query("select 1 from users")).toEqual([]);
    expect(sent.map((m) => m.to[0])).toEqual(["ana@example.com"]);
    const [t] = await query<{ purpose: string; payload: NewAccount }>("select purpose, payload from login_tokens");
    expect(t).toMatchObject({ purpose: "signin", payload: { name: "Ana Google", agent: "hark" } });
  });

  it("makes no account while sign-up is closed", async () => {
    expect(await (await roundTrip({ newAccount: signupDetails, open: false })).run()).toEqual({ kind: "refused", reason: "signup_closed" });
    expect(await query("select 1 from users")).toEqual([]);
  });

  it("refuses an account already linked to a different Google account", async () => {
    await query("insert into users (email, google_sub) values ('ana@gmail.com', 'g-999')");
    expect(await (await roundTrip()).run()).toEqual({ kind: "refused", reason: "other_google" });
  });

  it("says there is no account when signing in with an address Roger does not know", async () => {
    expect(await (await roundTrip()).run()).toEqual({ kind: "refused", reason: "noaccount" });
    expect(await query("select 1 from users")).toEqual([]);
  });

  it("creates the account on sign-up the way the email link does, and opens the plan step", async () => {
    const out = await (await roundTrip({ newAccount: signupDetails })).run();
    expect(out).toMatchObject({ kind: "signed_in", next: "/start/plan", created: true });
    const [u] = await query<Record<string, unknown>>("select email, name, path, agent, currency, signup_step, google_sub, google_email, email_verified_at is not null as verified from users");
    expect(u).toEqual({ email: "ana@gmail.com", name: "Ana Google", path: "running", agent: "hark", currency: "CAD", signup_step: "plan", google_sub: "g-111", google_email: "ana@gmail.com", verified: true });
  });

  it("applies the referral carried from the sign-up on a new account only (B2 Unit 3)", async () => {
    const [ref] = await query<{ id: string }>("insert into users (email, status) values ('rae@example.com', 'trial') returning id");
    const out = await (await roundTrip({ newAccount: { ...signupDetails, referrer: { id: ref.id, via: "link" } } })).run();
    expect(out).toMatchObject({ kind: "signed_in", created: true });
    const [u] = await query<{ id: string; referred_by: string | null }>("select id, referred_by from users where email = 'ana@gmail.com'");
    expect(u.referred_by).toBe(ref.id);
    expect(await query("select referrer_id, referred_user_id, stage, source from referrals")).toEqual([{ referrer_id: ref.id, referred_user_id: u.id, stage: "trial", source: "link" }]);

    // Signing in again with another referrer on the sign-up: the account exists, so nothing changes.
    const [other] = await query<{ id: string }>("insert into users (email, status) values ('sol@example.com', 'trial') returning id");
    const again = await (await roundTrip({ newAccount: { ...signupDetails, referrer: { id: other.id, via: "link" } } })).run();
    expect(again).toMatchObject({ kind: "signed_in", created: false });
    expect((await query<{ referred_by: string }>("select referred_by from users where email = 'ana@gmail.com'"))[0].referred_by).toBe(ref.id);
    expect(await query("select 1 from referrals")).toHaveLength(1);
  });

  it("never links or signs in an admin address with Google, and a Google session is never admin", async () => {
    await query("insert into users (email, signup_step) values ('ana@gmail.com', 'done')");
    expect(await (await roundTrip({ admins: ["ana@gmail.com"] })).run()).toEqual({ kind: "refused", reason: "admin" });
    expect(await query("select google_sub from users")).toEqual([{ google_sub: null }]);
    // Linked before the address became an admin's: still refused.
    await query("update users set google_sub = 'g-111'");
    expect(await (await roundTrip({ admins: ["ana@gmail.com"] })).run()).toEqual({ kind: "refused", reason: "admin" });
    const s = { idHash: "h", userId: "u", email: "ana@gmail.com", method: "google" as const, createdAt: NOW, expiresAt: NOW };
    expect(sessionIsAdmin(s, ["ana@gmail.com"], NOW)).toBe(false);
    expect(sessionIsAdmin({ ...s, method: "email" }, ["ana@gmail.com"], NOW)).toBe(true);
  });

  it("unlinks on request: Google stops reaching the account, and other Google sessions end", async () => {
    await query("insert into users (email) values ('ana@gmail.com')");
    const first = await (await roundTrip()).run();
    if (first.kind !== "signed_in") throw new Error("not signed in");
    expect(await unlinkGoogle(query, first.userId)).toBe(true);
    expect(await query("select google_sub, google_email from users")).toEqual([{ google_sub: null, google_email: null }]);
    expect(await findSession(query, first.token, NOW)).toBeNull();
  });
});

describe("switched off without keys", () => {
  it("has no config, no button, and both routes answer 404", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(googleConfig()).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "x" })).toBeNull();
    expect(GoogleSignInLink({ next: "/app" })).toBeNull();
    const start = await import("@/app/auth/google/route");
    const callback = await import("@/app/auth/google/callback/route");
    expect((await start.GET(new Request("http://localhost/auth/google"))).status).toBe(404);
    expect((await callback.GET(new Request("http://localhost/auth/google/callback?state=a&code=b"))).status).toBe(404);
  });

  it("shows the button once both keys are set", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", cfg.clientId);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", cfg.clientSecret);
    expect(renderToStaticMarkup(GoogleSignInLink({ next: "/app/billing" })!)).toContain('href="/auth/google?next=%2Fapp%2Fbilling"');
  });
});
