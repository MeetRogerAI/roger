import type { Query } from "@/lib/db-query";
import { hashSecret, newSecret, normaliseEmail, safeNext } from "./tokens";

/**
 * One-time links (spec B.3): valid for 15 minutes, work once. The link opens a
 * confirm page; only pressing its button uses the token, so a mail scanner
 * that fetches the link does not sign anyone in or burn the link.
 */
export const LINK_MINUTES = 15;
export const PILOT_LINK_DAYS = 7;

export type LinkPurpose = "signin" | "pilot" | "email_change";

/**
 * A new account's details, carried on the sign-up link and applied only when
 * the address is confirmed. Until then no account exists, so typing someone
 * else's address changes nothing of theirs.
 */
export type NewAccount = {
  name: string;
  path: "new" | "running";
  notReady: boolean;
  profile: Record<string, unknown>;
  agent: string;
  currency: "USD" | "CAD";
  ref: string;
  utm: string;
  zack: string | null;
};

export async function issueToken(
  q: Query,
  o: {
    email: string;
    purpose: LinkPurpose;
    userId?: string | null;
    nextPath?: string;
    createdBy?: string | null;
    ttlMs?: number;
    newAccount?: NewAccount;
  },
  now = new Date(),
): Promise<string> {
  const token = newSecret();
  const ttl = o.ttlMs ?? (o.purpose === "pilot" ? PILOT_LINK_DAYS * 86_400_000 : LINK_MINUTES * 60_000);
  await q(
    `insert into login_tokens (token_hash, email, purpose, user_id, next_path, payload, created_by, expires_at, created_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
    [
      hashSecret(token),
      normaliseEmail(o.email),
      o.purpose,
      o.userId ?? null,
      safeNext(o.nextPath),
      o.newAccount ? JSON.stringify(o.newAccount) : null,
      o.createdBy ?? null,
      new Date(now.getTime() + ttl).toISOString(),
      now.toISOString(),
    ],
  );
  return token;
}

export type UsedToken = { email: string; purpose: LinkPurpose; userId: string | null; nextPath: string; newAccount: NewAccount | null };

/** Uses a token, once. Null if it is unknown, used, revoked or expired. */
export async function consumeToken(q: Query, token: string | undefined, now = new Date()): Promise<UsedToken | null> {
  if (!token || token.length > 100) return null;
  const rows = await q<{ email: string; purpose: LinkPurpose; user_id: string | null; next_path: string; payload: NewAccount | null }>(
    `update login_tokens set used_at = $2
     where token_hash = $1 and used_at is null and revoked_at is null and expires_at > $2
     returning email, purpose, user_id, next_path, payload`,
    [hashSecret(token), now.toISOString()],
  );
  const r = rows[0];
  return r ? { email: r.email, purpose: r.purpose, userId: r.user_id, nextPath: safeNext(r.next_path), newAccount: r.payload ?? null } : null;
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
 * What a used token signs in to.
 * - Sign-in: the account for that email, marked verified. A sign-up link
 *   creates the account from its carried details if there is none yet; an
 *   account that already exists keeps its own details.
 * - Pilot: the named account, if the email still matches.
 * - Email change: the new address takes effect now that it has proved
 *   itself, unless another account has taken it in the meantime.
 */
export async function userForToken(q: Query, t: UsedToken, now = new Date()): Promise<SignedInUser | null> {
  const at = now.toISOString();
  if (t.purpose === "email_change") {
    if (!t.userId) return null;
    try {
      const rows = await q<SignedInUser>(
        `update users set email = $2, email_verified_at = $3
         where id = $1 and not exists (select 1 from users where email = $2 and id <> $1)
         returning id, email`,
        [t.userId, t.email, at],
      );
      return rows[0] ?? null;
    } catch (e) {
      // Taken by someone else between the check and the update.
      if (/unique|duplicate/i.test((e as Error).message)) return null;
      throw e;
    }
  }
  if (t.purpose === "pilot" && t.userId) {
    const rows = await q<SignedInUser>(`update users set email_verified_at = coalesce(email_verified_at, $2) where id = $1 and email = $3 returning id, email`, [
      t.userId,
      at,
      t.email,
    ]);
    return rows[0] ?? null;
  }
  const a = t.newAccount;
  if (a) {
    const rows = await q<SignedInUser>(
      `insert into users (email, name, path, not_ready, profile, agent, currency, ref, utm, pending_zack_token, signup_step, email_verified_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, 'plan', $11)
       on conflict (email) do update set email_verified_at = coalesce(users.email_verified_at, excluded.email_verified_at)
       returning id, email`,
      [t.email, a.name, a.path, a.notReady, JSON.stringify(a.profile), a.agent, a.currency, a.ref, a.utm, a.zack, at],
    );
    return rows[0] ?? null;
  }
  const rows = await q<SignedInUser>(`update users set email_verified_at = coalesce(email_verified_at, $2) where email = $1 returning id, email`, [t.email, at]);
  return rows[0] ?? null;
}
