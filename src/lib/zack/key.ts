import { randomBytes } from "node:crypto";
import { hashSecret } from "@/lib/auth/tokens";
import type { Query } from "@/lib/db-query";
import { clientIp, counterFor, hit, limits } from "@/lib/rate-limit";

/**
 * Each user's Zack key (spec B.5): 256 random bits with a recognisable
 * prefix, shown once, stored only as a hash and looked up by that hash.
 * Replacing it ends the old one at once.
 */
export const KEY_PREFIX = "rgr_zk_";

export function newZackKey(): { key: string; hash: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashSecret(key), prefix: key.slice(0, KEY_PREFIX.length + 4) };
}

/** Makes (or replaces) a user's key and returns it. The only time the key itself is available. */
export async function replaceZackKey(q: Query, userId: string): Promise<string> {
  const k = newZackKey();
  await q(`update users set zack_key_hash = $2, zack_key_prefix = $3, zack_key_created_at = now() where id = $1`, [userId, k.hash, k.prefix]);
  return k.key;
}

export type KeyUser = { id: string; email: string; name: string; status: string; sharing: "share" | "match_only" | "off"; agent: string; timezone: string };

/** The user a key belongs to, or null. Held accounts may still send: their runs count once they pay. */
export async function userForKey(q: Query, key: string | null | undefined): Promise<KeyUser | null> {
  if (!key || !key.startsWith(KEY_PREFIX) || key.length > 100) return null;
  const rows = await q<KeyUser>(
    `select id, email, name, status, sharing, agent, timezone from users
     where zack_key_hash = $1 and status in ('trial', 'active', 'held')`,
    [hashSecret(key)],
  );
  return rows[0] ?? null;
}

/** The key from "Authorization: Bearer ..." or, for AI agents that cannot set headers, "?key=". */
export function keyFrom(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return new URL(request.url).searchParams.get("key");
}

/**
 * The user behind a request's key, or a bare 401. A valid key always works:
 * agents send from their platform's shared addresses, so one IP may carry
 * many members. Only wrong keys are counted per IP, and an IP past the limit
 * gets 429 for wrong keys (spec B.5 Limits). Requests with no key at all
 * (a link preview, a browser) are not counted.
 */
export async function authenticate(q: Query, request: Request, now: Date = new Date()): Promise<KeyUser | Response> {
  const key = keyFrom(request);
  if (!key) return bare(401);
  const ipKey = `zack:badkey:${clientIp(request.headers)}`;
  const user = await userForKey(q, key);
  if (user) return user;
  return (await hit(ipKey, limits.zackBadKeyPerIp, now, counterFor(q))) ? bare(401) : bare(429);
}

/** No detail, nothing cached, the address (which may hold the key) never sent on. */
export const PRIVATE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" } as const;

export function bare(status: number): Response {
  return new Response(null, { status, headers: PRIVATE_HEADERS });
}
