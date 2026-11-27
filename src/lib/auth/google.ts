import { createHash, createPublicKey, timingSafeEqual, verify, type JsonWebKey } from "node:crypto";
import type { Query } from "@/lib/db-query";
import { appUrl } from "@/lib/mail/layout";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { googleLinkedEmail } from "@/lib/mail/templates/sign-in";
import { counterFor, hit, limits } from "@/lib/rate-limit";
import { applyReferralSafely } from "@/lib/referrals/attribution";
import { sendSignupLink, stepPaths } from "@/lib/signup/account";
import { adminEmails } from "./admin-emails";
import type { NewAccount } from "./login-link";
import { createSession } from "./session";
import { emailKey, hashSecret, newSecret, normaliseEmail, safeNext } from "./tokens";

/**
 * "Sign in with Google" (spec B.3, plan Unit 18): the OAuth code flow with
 * PKCE, a state value and a nonce, and Google's ID token checked here against
 * Google's published keys (issuer, audience, expiry, nonce, and a verified
 * email). No auth library.
 *
 * - Off unless GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are both set: no
 *   button, and both routes answer 404.
 * - The browser holds the state value in a cookie; the database holds only its
 *   hash, with the PKCE verifier and the nonce. The callback must bring the
 *   same state in the URL and the cookie, and uses the row once, so a replayed
 *   or forged callback finds nothing.
 * - An address is trusted from Google only where Google is its authority
 *   (`googleVouches`: Gmail, or a Workspace account whose `hd` names the
 *   address's domain). For any other address an existing account must first
 *   be signed in to by email link in the same browser, and a new sign-up is
 *   sent the ordinary email sign-up link instead.
 * - Google's account id (`sub`, and the Google address as `google_email`) is
 *   stored at first use and matched on after that. Any change of the Roger
 *   address unlinks it, and the member can unlink it on /app/settings. The
 *   first use on an existing account emails a notice to its address. An
 *   account already linked to another Google account is refused.
 * - Admin addresses (ADMIN_EMAILS) are never linked or signed in with Google,
 *   and a Google session never grants admin rights (`sessionIsAdmin`).
 * - Tokens are never logged.
 */

export type GoogleConfig = { clientId: string; clientSecret: string };

export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleEnabled = () => googleConfig() !== null;

export const GOOGLE_STATE_COOKIE = "roger-google-state";
export const GOOGLE_COOKIE_PATH = "/auth/google";
export const STATE_MINUTES = 10;

/**
 * The state cookie: sent back only to /auth/google/*, for the minutes a
 * sign-in may take. SameSite lax, because Google's redirect back is a
 * top-level navigation from another site.
 */
export const googleStateCookie = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: GOOGLE_COOKIE_PATH,
  maxAge: STATE_MINUTES * 60,
});

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** The one callback address registered with Google for this deployment. */
export const redirectUri = () => appUrl("/auth/google/callback");

const b64url = (b: Buffer) => b.toString("base64url");

/** Starts a sign-in: stores the row, and returns Google's address and the state for the cookie. */
export async function beginGoogle(
  q: Query,
  cfg: GoogleConfig,
  o: { next?: string; newAccount?: NewAccount | null; now?: Date },
): Promise<{ url: string; state: string }> {
  const now = o.now ?? new Date();
  const state = newSecret();
  const verifier = newSecret();
  const nonce = newSecret();
  await q(`insert into oauth_states (state_hash, verifier, nonce, next_path, payload, expires_at, created_at) values ($1, $2, $3, $4, $5::jsonb, $6, $7)`, [
    hashSecret(state),
    verifier,
    nonce,
    safeNext(o.next),
    o.newAccount ? JSON.stringify(o.newAccount) : null,
    new Date(now.getTime() + STATE_MINUTES * 60_000).toISOString(),
    now.toISOString(),
  ]);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), state };
}

// ---------------------------------------------------------------------------
// The ID token

export type GoogleClaims = { sub: string; email: string; emailVerified: boolean; name: string; /** The Workspace domain, if any. */ hd: string | null };
/** Google's public key for a key id, or null when it has none by that id. */
export type KeySource = (kid: string) => Promise<JsonWebKey | null>;

function json(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Checks an ID token: RS256 signed by one of Google's keys, issued by Google
 * for this client, not expired (a minute's grace for clock drift), and
 * carrying this sign-in's nonce. Returns its claims, or null with no detail
 * (the reason is never shown to the visitor).
 */
export async function verifyIdToken(token: string, o: { clientId: string; nonce: string; keys: KeySource; now: Date }): Promise<GoogleClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = json(parts[0]);
  const p = json(parts[1]);
  if (!header || !p || header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const jwk = await o.keys(header.kid);
  if (!jwk) return null;
  let ok = false;
  try {
    ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  } catch {
    return null;
  }
  if (!ok) return null;
  if (typeof p.iss !== "string" || !ISSUERS.has(p.iss)) return null;
  const aud = p.aud;
  if (Array.isArray(aud) ? !aud.includes(o.clientId) || p.azp !== o.clientId : aud !== o.clientId) return null;
  const nowSec = o.now.getTime() / 1000;
  if (typeof p.exp !== "number" || p.exp + 60 < nowSec) return null;
  if (typeof p.iat === "number" && p.iat - 300 > nowSec) return null;
  if (typeof p.nonce !== "string" || !same(p.nonce, o.nonce)) return null;
  if (typeof p.sub !== "string" || !p.sub || typeof p.email !== "string" || !p.email.includes("@")) return null;
  return { sub: p.sub, email: normaliseEmail(p.email), emailVerified: p.email_verified === true || p.email_verified === "true", name: typeof p.name === "string" ? p.name.slice(0, 80) : "",
    hd: typeof p.hd === "string" && p.hd ? p.hd : null,
  };
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

let keyCache: { keys: Map<string, JsonWebKey>; until: number; fetchedAt: number } | null = null;

/** Google's published keys, cached for as long as Google says; fetched again for an unknown key id, at most once a minute. */
export const googleKeys: KeySource = async (kid) => {
  const now = Date.now();
  const fresh = keyCache && keyCache.until > now;
  if (fresh && keyCache!.keys.has(kid)) return keyCache!.keys.get(kid)!;
  if (keyCache && now - keyCache.fetchedAt < 60_000) return keyCache.keys.get(kid) ?? null;
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Google keys: ${res.status}`);
  const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  keyCache = { keys: new Map((body.keys ?? []).filter((k) => k.kid).map((k) => [k.kid!, k])), until: now + maxAge * 1000, fetchedAt: now };
  return keyCache.keys.get(kid) ?? null;
};

/** Trades the code (with the PKCE verifier) for the ID token. Null on any refusal; nothing secret is logged. */
export type CodeExchange = (o: { code: string; verifier: string; cfg: GoogleConfig }) => Promise<string | null>;

export const exchangeCode: CodeExchange = async ({ code, verifier, cfg }) => {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error(`[google] code exchange refused: ${res.status}`);
    return null;
  }
  const body = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  return typeof body?.id_token === "string" ? body.id_token : null;
};

// ---------------------------------------------------------------------------
// The callback

export type RefusedReason = "state" | "token" | "unverified" | "noaccount" | "other_google" | "email_first" | "admin" | "signup_closed" | "limited";
export type GoogleOutcome =
  | { kind: "signed_in"; userId: string; token: string; next: string; linked: boolean; created: boolean }
  | { kind: "refused"; reason: RefusedReason }
  /** A sign-up whose address Google can't vouch for: the email sign-up link was sent instead. */
  | { kind: "email_sent" };

type Found = { id: string; email: string; signup_step: string };

/**
 * Finishes a sign-in: the state checked and used once, the code exchanged,
 * the ID token checked, then the account found (by Google id, then by
 * verified email) or, for a sign-up, created the way the email sign-up link
 * creates it. Makes a session with method "google".
 */
export async function completeGoogle(
  q: Query,
  cfg: GoogleConfig,
  input: {
    state?: string | null;
    cookieState?: string | null;
    code?: string | null;
    /** The account this browser is already signed in to by an email link (or pilot link), if any. */
    signedInAs?: string | null;
  },
  deps: { exchange: CodeExchange; keys: KeySource; now?: Date; signupOpen: () => Promise<boolean>; adminEmails?: string[] } & MailDeps,
): Promise<GoogleOutcome> {
  const now = deps.now ?? new Date();
  const admins = (deps.adminEmails ?? adminEmails()).map((e) => e.toLowerCase());
  const refused = (reason: RefusedReason): GoogleOutcome => ({ kind: "refused", reason });
  if (!input.state || !input.cookieState || input.state.length > 100 || !same(input.state, input.cookieState)) return refused("state");
  const [row] = await q<{ verifier: string; nonce: string; next_path: string; payload: NewAccount | null }>(
    `update oauth_states set used_at = $2 where state_hash = $1 and used_at is null and expires_at > $2 returning verifier, nonce, next_path, payload`,
    [hashSecret(input.state), now.toISOString()],
  );
  if (!row) return refused("state");
  if (!input.code || input.code.length > 2000) return refused("token");
  const idToken = await deps.exchange({ code: input.code, verifier: row.verifier, cfg });
  if (!idToken) return refused("token");
  const claims = await verifyIdToken(idToken, { clientId: cfg.clientId, nonce: row.nonce, keys: deps.keys, now });
  if (!claims) return refused("token");
  if (!claims.emailVerified) return refused("unverified");
  // Admin accounts sign in by email link only; Google is never linked to them.
  if (admins.includes(claims.email)) return refused("admin");
  const vouched = googleVouches(claims);

  const signup = row.payload;
  const at = now.toISOString();
  const nextFor = (u: Found) => (signup ? (stepPaths[u.signup_step] ?? "/app") : safeNext(row.next_path));
  const signIn = async (u: Found, linked: boolean, created: boolean): Promise<GoogleOutcome> => {
    const { token } = await createSession(q, u.id, "google", now);
    return { kind: "signed_in", userId: u.id, token, next: created ? "/start/plan" : nextFor(u), linked, created };
  };

  // 1. Matched by Google's id, whatever the account's email is now.
  const [bySub] = await q<Found>(`select id, email, signup_step from users where google_sub = $1`, [claims.sub]);
  if (bySub) return admins.includes(bySub.email.toLowerCase()) ? refused("admin") : signIn(bySub, false, false);

  // 2. An account with this email: linked at first use, and its address told. Only when Google
  //    speaks for the address (Gmail, or the Workspace domain it names), or when this browser is
  //    already signed in to that account by an email link. Otherwise the email link comes first.
  const linkExisting = async (): Promise<GoogleOutcome | null> => {
    const [u] = await q<Found & { google_sub: string | null }>(`select id, email, signup_step, google_sub from users where email = $1`, [claims.email]);
    if (!u) return null;
    if (admins.includes(u.email.toLowerCase())) return refused("admin");
    if (u.google_sub && u.google_sub !== claims.sub) return refused("other_google");
    if (!vouched && input.signedInAs !== u.id) return refused("email_first");
    const [linked] = await q<Found>(
      `update users set google_sub = $2, google_email = $4,
         email_verified_at = case when $5::boolean then coalesce(email_verified_at, $3) else email_verified_at end
       where id = $1 and (google_sub is null or google_sub = $2) returning id, email, signup_step`,
      [u.id, claims.sub, at, claims.email, vouched],
    );
    if (!linked) return refused("other_google");
    await sendToUser({ id: linked.id, email: linked.email }, "google_linked", hashSecret(claims.sub).slice(0, 16), googleLinkedEmail(), deps).catch(() => {});
    return signIn(linked, true, false);
  };
  const existing = await linkExisting();
  if (existing) return existing;

  // 3. No account: only a sign-up makes one, from the details it carried, and only while sign-up is open.
  if (!signup) return refused("noaccount");
  if (!(await deps.signupOpen())) return refused("signup_closed");
  const account: NewAccount = { ...signup, name: signup.name || claims.name };
  if (!vouched) {
    // Google can't vouch for this address: the ordinary email sign-up link instead, from the same details.
    if (!(await hit(`signin:email:${emailKey(claims.email)}`, limits.signinPerEmail, now, counterFor(q)))) return refused("limited");
    const r = await sendSignupLink(q, claims.email, account, { ...deps, now });
    return r === "failed" ? refused("token") : { kind: "email_sent" };
  }
  const [created] = await q<Found>(
    `insert into users (email, name, path, not_ready, profile, agent, currency, ref, utm, pending_zack_token, signup_step, email_verified_at, google_sub, google_email, pending_referrer_id)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, 'plan', $11, $12, $1, (select x.id from users x where x.id = $13::uuid))
     on conflict do nothing
     returning id, email, signup_step`,
    [claims.email, account.name, account.path, account.notReady, JSON.stringify(account.profile), account.agent, account.currency, account.ref, account.utm, account.zack, at, claims.sub, account.referrer?.id ?? null],
  );
  if (created) {
    // Only this insert's own row (on conflict do nothing returns none otherwise) gets a referral.
    await applyReferralSafely(q, { userId: created.id, email: created.email, referrer: account.referrer, now });
    return signIn(created, false, true);
  }
  // Made by someone else at the same moment: the same rules as an existing account.
  return (await linkExisting()) ?? refused("token");
}

/**
 * Whether Google is the authority for the address: a Gmail address, or a
 * Workspace account whose `hd` claim names the address's own domain. Any
 * other Google account can carry an address its owner no longer controls.
 */
export function googleVouches(c: Pick<GoogleClaims, "email" | "hd">): boolean {
  const domain = c.email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return true;
  return Boolean(c.hd) && c.hd!.toLowerCase() === domain;
}

/**
 * "Unlink Google" on /app/settings: Google no longer signs this account in,
 * and every other session it made ends.
 */
export async function unlinkGoogle(q: Query, userId: string, keepIdHash?: string): Promise<boolean> {
  const rows = await q(`update users set google_sub = null, google_email = null where id = $1 and google_sub is not null returning id`, [userId]);
  await q(`delete from sessions where user_id = $1 and method = 'google' and id_hash is distinct from $2`, [userId, keepIdHash ?? null]);
  return rows.length > 0;
}
