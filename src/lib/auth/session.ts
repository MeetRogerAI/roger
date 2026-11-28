import type { Query } from "@/lib/db-query";
import { hashSecret, newSecret } from "./tokens";

/**
 * Sessions (spec B.3): a random id in an httpOnly cookie, only its hash in
 * the `sessions` table. 30 days, renewed on use. A new id on every sign-in.
 */
export const SESSION_COOKIE = "roger-session";
export const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;

export type SessionMethod = "email" | "google" | "pilot";

export type SessionInfo = {
  idHash: string;
  userId: string;
  email: string;
  method: SessionMethod;
  createdAt: Date;
  expiresAt: Date;
};

export async function createSession(q: Query, userId: string, method: SessionMethod, now = new Date()) {
  const token = newSecret();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  await q(`insert into sessions (id_hash, user_id, method, created_at, expires_at, last_seen_at) values ($1, $2, $3, $4, $5, $4)`, [
    hashSecret(token),
    userId,
    method,
    now.toISOString(),
    expiresAt.toISOString(),
  ]);
  // A sign-in counts as activity for idle retention (privacy P3), even if the session is never used again.
  await q(`update users set last_seen_at = $2 where id = $1`, [userId, now.toISOString()]);
  return { token, expiresAt };
}

/**
 * The live session for a cookie value, or null. Renews the stored expiry at
 * most once a day, so ordinary page views do not write on every request.
 */
export async function findSession(q: Query, token: string | undefined, now = new Date()): Promise<SessionInfo | null> {
  if (!token || token.length > 100) return null;
  const idHash = hashSecret(token);
  const rows = await q<{ user_id: string; email: string; method: SessionMethod; created_at: string | Date; expires_at: string | Date; last_seen_at: string | Date }>(
    `select s.user_id, u.email, s.method, s.created_at, s.expires_at, s.last_seen_at
     from sessions s join users u on u.id = s.user_id
     where s.id_hash = $1 and s.expires_at > $2`,
    [idHash, now.toISOString()],
  );
  const r = rows[0];
  if (!r) return null;
  let expiresAt = new Date(r.expires_at);
  if (now.getTime() - new Date(r.last_seen_at).getTime() > DAY_MS) {
    expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
    await q(`update sessions set last_seen_at = $2, expires_at = $3 where id_hash = $1`, [idHash, now.toISOString(), expiresAt.toISOString()]);
    await q(`update users set last_seen_at = $2 where id = $1`, [r.user_id, now.toISOString()]);
  }
  return { idHash, userId: r.user_id, email: r.email, method: r.method, createdAt: new Date(r.created_at), expiresAt };
}

export async function revokeSession(q: Query, token: string | undefined) {
  if (!token) return;
  await q(`delete from sessions where id_hash = $1`, [hashSecret(token)]);
}

/** Signs a user out everywhere, optionally keeping the session they are using. */
export async function revokeUserSessions(q: Query, userId: string, keepIdHash?: string) {
  await q(`delete from sessions where user_id = $1 and id_hash is distinct from $2`, [userId, keepIdHash ?? null]);
}

export const ADMIN_SIGNIN_DAYS = 14;

/**
 * Admin rights (spec B.3): a verified email listed in ADMIN_EMAILS, checked on
 * every request; a session from an email link the admin requested (not
 * Google alone, not a pilot link); and a sign-in within the last 14 days.
 */
export function sessionIsAdmin(s: SessionInfo, adminEmails: string[], now = new Date()): boolean {
  if (!adminEmails.includes(s.email.toLowerCase())) return false;
  // An email link the admin asked for themselves: not Google alone, not an admin-made pilot link.
  if (s.method !== "email") return false;
  return now.getTime() - s.createdAt.getTime() < ADMIN_SIGNIN_DAYS * DAY_MS;
}
