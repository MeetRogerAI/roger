import type { Query } from "@/lib/db-query";
import { hashSecret, newSecret, normaliseEmail, safeNext } from "./secrets";

/**
 * One-time links (spec B.3): valid for 15 minutes, work once. The link opens a
 * confirm page; only pressing its button uses the token, so a mail scanner
 * that fetches the link does not sign anyone in or burn the link.
 */
export const LINK_MINUTES = 15;
export const PILOT_LINK_DAYS = 7;

export type LinkPurpose = "signin" | "pilot" | "email_change";

export async function issueToken(
  q: Query,
  o: { email: string; purpose: LinkPurpose; userId?: string | null; nextPath?: string; createdBy?: string | null; ttlMs?: number },
  now = new Date(),
): Promise<string> {
  const token = newSecret();
  const ttl = o.ttlMs ?? (o.purpose === "pilot" ? PILOT_LINK_DAYS * 86_400_000 : LINK_MINUTES * 60_000);
  await q(
    `insert into login_tokens (token_hash, email, purpose, user_id, next_path, created_by, expires_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [hashSecret(token), normaliseEmail(o.email), o.purpose, o.userId ?? null, safeNext(o.nextPath), o.createdBy ?? null, new Date(now.getTime() + ttl).toISOString(), now.toISOString()],
  );
  return token;
}

export type UsedToken = { email: string; purpose: LinkPurpose; userId: string | null; nextPath: string };

/** Uses a token, once. Null if it is unknown, used, revoked or expired. */
export async function consumeToken(q: Query, token: string | undefined, now = new Date()): Promise<UsedToken | null> {
  if (!token || token.length > 100) return null;
  const rows = await q<{ email: string; purpose: LinkPurpose; user_id: string | null; next_path: string }>(
    `update login_tokens set used_at = $2
     where token_hash = $1 and used_at is null and revoked_at is null and expires_at > $2
     returning email, purpose, user_id, next_path`,
    [hashSecret(token), now.toISOString()],
  );
  const r = rows[0];
  return r ? { email: r.email, purpose: r.purpose, userId: r.user_id, nextPath: safeNext(r.next_path) } : null;
}

/** Whether a token is still usable, without using it (for the confirm page). */
export async function tokenIsLive(q: Query, token: string | undefined, now = new Date()): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const rows = await q(`select 1 from login_tokens where token_hash = $1 and used_at is null and revoked_at is null and expires_at > $2`, [
    hashSecret(token),
    now.toISOString(),
  ]);
  return rows.length > 0;
}

export type SignedInUser = { id: string; email: string };

/**
 * What a used token signs in to. A sign-in link finds the account by email and
 * marks the address verified; a pilot or email-change link names its user.
 * An email change takes effect here, once the new address has proved itself.
 */
export async function userForToken(q: Query, t: UsedToken, now = new Date()): Promise<SignedInUser | null> {
  if (t.purpose === "email_change") {
    if (!t.userId) return null;
    const taken = await q(`select 1 from users where email = $1 and id <> $2`, [t.email, t.userId]);
    if (taken.length) return null;
    const rows = await q<SignedInUser>(`update users set email = $2, email_verified_at = $3 where id = $1 returning id, email`, [t.userId, t.email, now.toISOString()]);
    return rows[0] ?? null;
  }
  const rows =
    t.purpose === "pilot" && t.userId
      ? await q<SignedInUser>(`update users set email_verified_at = coalesce(email_verified_at, $2) where id = $1 and email = $3 returning id, email`, [t.userId, now.toISOString(), t.email])
      : await q<SignedInUser>(`update users set email_verified_at = coalesce(email_verified_at, $2) where email = $1 returning id, email`, [t.email, now.toISOString()]);
  return rows[0] ?? null;
}
