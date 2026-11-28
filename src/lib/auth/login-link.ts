import { autoLinkContributor, SIGNUP_ACTOR } from "@/lib/admin/contributors";
import type { Query } from "@/lib/db-query";
import { hashSecret, newSecret, normaliseEmail, safeNext } from "./tokens";

/**
 * One-time links (spec B.3): valid for 15 minutes, work once. The link opens a
 * confirm page; only pressing its button uses the token, so a mail scanner
 * that fetches the link does not sign anyone in or burn the link.
 */
export const LINK_MINUTES = 15;
export const PILOT_LINK_DAYS = 7;

/** email_approve: sent to the current address to approve a change. email_change: then sent to the new address to confirm it. */
export type LinkPurpose = "signin" | "pilot" | "email_change" | "email_approve";

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
    /** Anything else the link needs when it is used (an email revert: the address it undoes). */
    data?: Record<string, unknown>;
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
      o.newAccount ? JSON.stringify(o.newAccount) : o.data ? JSON.stringify(o.data) : null,
      o.createdBy ?? null,
      new Date(now.getTime() + ttl).toISOString(),
      now.toISOString(),
    ],
  );
  return token;
}

export type UsedToken = {
  email: string;
  purpose: LinkPurpose;
  userId: string | null;
  nextPath: string;
  newAccount: NewAccount | null;
  data: Record<string, unknown> | null;
  /** The stored hash of the token, never the token itself. */
  hash: string;
};

/**
 * A token is usable when it is unused, not revoked and not expired. Both
 * email-change links also belong to the newest change request on the
 * account: any approval request made after one was issued supersedes it, so
 * two requests racing, or an old link found later, can never complete.
 */
const LIVE = `used_at is null and revoked_at is null and expires_at > $2
  and (purpose not in ('email_change', 'email_approve') or not exists (
    select 1 from login_tokens n
    where n.user_id = login_tokens.user_id and n.purpose = 'email_approve' and n.token_hash <> login_tokens.token_hash
      and (n.created_at, n.token_hash) > (login_tokens.created_at, login_tokens.token_hash)))`;

/** Uses a token, once. Null if it is unknown, used, revoked, expired or superseded. */
export async function consumeToken(q: Query, token: string | undefined, now = new Date()): Promise<UsedToken | null> {
  if (!token || token.length > 100) return null;
  const hash = hashSecret(token);
  const rows = await q<{ email: string; purpose: LinkPurpose; user_id: string | null; next_path: string; payload: Record<string, unknown> | null }>(
    `update login_tokens set used_at = $2
     where token_hash = $1 and ${LIVE}
     returning email, purpose, user_id, next_path, payload`,
    [hash, now.toISOString()],
  );
  const r = rows[0];
  if (!r) return null;
  const isAccount = r.purpose === "signin" || r.purpose === "pilot";
  return {
    email: r.email,
    purpose: r.purpose,
    userId: r.user_id,
    nextPath: safeNext(r.next_path),
    newAccount: isAccount ? ((r.payload as NewAccount | null) ?? null) : null,
    data: isAccount ? null : (r.payload ?? null),
    hash,
  };
}

/** What a token is for, if it is still usable, without using it (for the confirm page's wording). */
export async function livePurpose(q: Query, token: string | undefined, now = new Date()): Promise<LinkPurpose | null> {
  if (!token || token.length > 100) return null;
  const rows = await q<{ purpose: LinkPurpose }>(`select purpose from login_tokens where token_hash = $1 and ${LIVE}`, [hashSecret(token), now.toISOString()]);
  return rows[0]?.purpose ?? null;
}

/** Whether a token is still usable, without using it (for the confirm page). */
export async function tokenIsLive(q: Query, token: string | undefined, now = new Date()): Promise<boolean> {
  return (await livePurpose(q, token, now)) !== null;
}

export type SignedInUser = { id: string; email: string };

/**
 * What a used token signs in to.
 * - Sign-in: the account for that email, marked verified. A sign-up link
 *   creates the account from its carried details if there is none yet; an
 *   account that already exists keeps its own details. A new account is
 *   linked to the seed contributor carrying its address (R25).
 * - Pilot: the named account, if the email still matches.
 * - Anything else (email-change links, or a purpose this code doesn't know): nobody.
 */
export async function userForToken(q: Query, t: UsedToken, now = new Date()): Promise<SignedInUser | null> {
  const at = now.toISOString();
  // An allow-list: only sign-in and pilot links ever make a session here.
  // Email changes go only through src/lib/auth/email-change.ts.
  if (t.purpose !== "signin" && t.purpose !== "pilot") return null;
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
    // xmax = 0: this statement inserted the row (it is not an account that existed already).
    const rows = await q<SignedInUser & { created: boolean }>(
      `insert into users (email, name, path, not_ready, profile, agent, currency, ref, utm, pending_zack_token, signup_step, email_verified_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, 'plan', $11)
       on conflict (email) do update set email_verified_at = coalesce(users.email_verified_at, excluded.email_verified_at)
       returning id, email, (xmax = 0) as created`,
      [t.email, a.name, a.path, a.notReady, JSON.stringify(a.profile), a.agent, a.currency, a.ref, a.utm, a.zack, at],
    );
    if (!rows[0]) return null;
    if (rows[0].created) await autoLinkContributor(q, SIGNUP_ACTOR, rows[0].id);
    return { id: rows[0].id, email: rows[0].email };
  }
  const rows = await q<SignedInUser>(`update users set email_verified_at = coalesce(email_verified_at, $2) where email = $1 returning id, email`, [t.email, at]);
  return rows[0] ?? null;
}
