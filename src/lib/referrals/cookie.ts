import { createHmac, timingSafeEqual } from "node:crypto";
import type { Query } from "@/lib/db-query";
import { cleanCode, referrerForCode } from "./code";

/**
 * Referral memory (B2 plan, Key Technical Decisions): a signed, httpOnly,
 * SameSite=Lax cookie that lasts 60 days, set by /r/{code} (and, in Unit 9,
 * by /g/{token} for the inviter). It holds the code, when it was issued and
 * what set it, as `<payload>.<signature>`:
 *
 * - payload: base64url JSON `{ c: code, t: issued at (ms), p: purpose }`;
 * - signature: HMAC-SHA256 over `roger-ref:v1:<payload>`, base64url.
 *
 * The key is REF_SECRET. Without it, a key derived for this one use from
 * ADMIN_SECRET (or CRON_SECRET), the same fallback the admin cookie uses.
 * The sign-up draft cookie is not signed, so it has no key to share. With no
 * secret at all no cookie is written and none is trusted.
 *
 * The first valid cookie wins: a later /r visit never replaces one that is
 * still valid. A cookie older than 60 days by its own issued time is ignored
 * even if the browser kept it.
 */
export const REF_COOKIE = "roger-ref";
export const REF_DAYS = 60;
const REF_MS = REF_DAYS * 86_400_000;

export type RefPurpose = "link" | "guest";
export type RefCookie = { code: string; issuedAt: number; purpose: RefPurpose };

export function refKey(env: Record<string, string | undefined> = process.env): string | null {
  if (env.REF_SECRET) return env.REF_SECRET;
  const base = env.ADMIN_SECRET || env.CRON_SECRET;
  return base ? createHmac("sha256", base).update("ref-cookie-v1").digest("base64url") : null;
}

const mac = (key: string, payload: string) => createHmac("sha256", key).update(`roger-ref:v1:${payload}`).digest("base64url");

export function signRefCookie(c: RefCookie, key: string): string {
  const payload = Buffer.from(JSON.stringify({ c: c.code, t: c.issuedAt, p: c.purpose }), "utf8").toString("base64url");
  return `${payload}.${mac(key, payload)}`;
}

/** The cookie's contents if it is signed with this key, well formed and not over 60 days old; otherwise null. */
export function readRefCookie(raw: string | undefined | null, key: string | null, now: Date): RefCookie | null {
  if (!raw || !key || raw.length > 400) return null;
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(mac(key, payload));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  let v: unknown;
  try {
    v = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const { c, t, p } = v as Record<string, unknown>;
  const code = cleanCode(typeof c === "string" ? c : null);
  if (!code || typeof t !== "number" || !Number.isFinite(t) || (p !== "link" && p !== "guest")) return null;
  const age = now.getTime() - t;
  if (age < -5 * 60_000 || age > REF_MS) return null;
  return { code, issuedAt: t, purpose: p };
}

/** Cookie options: sent on every path, so /start's actions and the Google start can read it. */
export const refCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: REF_DAYS * 86_400,
});

/** The cookie reads and writes `rememberReferrer` needs: `cookies()` from next/headers, or a request's cookies with a response's. */
export type RefJar = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: ReturnType<typeof refCookieOptions>): unknown;
};

/**
 * Remembers a referral code in the browser, first valid cookie wins: a cookie
 * that is still valid, for a code that still belongs to a member, is never
 * replaced. A code nobody has stores nothing. Used by /r/{code} ("link") and,
 * in Unit 9, /g/{token} for the inviter ("guest"). Returns whether it wrote.
 */
export async function rememberReferrer(q: Query, jar: RefJar, rawCode: string, purpose: RefPurpose, now: Date, key: string | null = refKey()): Promise<boolean> {
  const code = cleanCode(rawCode);
  if (!key || !code) return false;
  const held = readRefCookie(jar.get(REF_COOKIE)?.value, key, now);
  if (held && (await referrerForCode(q, held.code))) return false;
  if (!(await referrerForCode(q, code))) return false;
  jar.set(REF_COOKIE, signRefCookie({ code, issuedAt: now.getTime(), purpose }, key), refCookieOptions());
  return true;
}
