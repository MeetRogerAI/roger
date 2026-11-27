import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { Query } from "@/lib/db-query";
import { appUrl } from "./layout";

/**
 * The stats email's own unsubscribe (spec B.15, B2 plan Unit 8): a signed
 * token in `/u/{token}` (the page, one button) and in the List-Unsubscribe
 * header (`/api/unsubscribe/{token}`, RFC 8058 one-click POST).
 *
 * The token is base64url of 33 bytes:
 * - 1 byte: the key version (1 now). A new UNSUB_SECRET gets a new version
 *   (and its own env name), so links in emails already sent can keep working
 *   while the old key is still listed in `KEY_ENV`;
 * - 16 bytes: the member's user id (a uuid);
 * - 16 bytes: HMAC-SHA256, truncated, over "<kind>|<version and id bytes>".
 *
 * The HMAC key is derived from the secret for this one purpose (HKDF, info
 * "unsub:v1"), so UNSUB_SECRET is never used as a key directly and never
 * shared with another use. There is no fallback to ADMIN_SECRET: without
 * UNSUB_SECRET no token is made or accepted, and the job sends nothing.
 *
 * Tokens never expire (an unsubscribe link must keep working) and are
 * compared in constant time. The only kind is "stats": Monday emails are
 * never touched by it.
 */
export type UnsubKind = "stats";

const CURRENT_VERSION = 1;
/** Which env var holds the secret for each key version. */
const KEY_ENV: Record<number, string> = { 1: "UNSUB_SECRET" };
const MAC_BYTES = 16;
const TOKEN_BYTES = 1 + 16 + MAC_BYTES;

type Env = Record<string, string | undefined>;

function keyFor(version: number, env: Env): Buffer | null {
  const name = KEY_ENV[version];
  const secret = name ? env[name] : undefined;
  if (!secret) return null;
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), `unsub:v${version}`, 32));
}

/** True when tokens can be made (UNSUB_SECRET is set). */
export function unsubConfigured(env: Env = process.env): boolean {
  return keyFor(CURRENT_VERSION, env) !== null;
}

const uuidBytes = (id: string): Buffer | null => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? Buffer.from(id.replace(/-/g, ""), "hex") : null);
const uuidString = (b: Buffer) => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const mac = (key: Buffer, kind: UnsubKind, body: Buffer) => createHmac("sha256", key).update(`${kind}|`).update(body).digest().subarray(0, MAC_BYTES);

/** The member's token for `kind`, or null when UNSUB_SECRET is not set (or the id is not a uuid). */
export function unsubToken(userId: string, kind: UnsubKind = "stats", env: Env = process.env): string | null {
  const key = keyFor(CURRENT_VERSION, env);
  const id = uuidBytes(userId);
  if (!key || !id) return null;
  const body = Buffer.concat([Buffer.from([CURRENT_VERSION]), id]);
  return Buffer.concat([body, mac(key, kind, body)]).toString("base64url");
}

/** The user id a token was made for, or null for anything not signed with a known key (tampered, truncated, unknown version). */
export function verifyUnsubToken(token: string | null | undefined, kind: UnsubKind = "stats", env: Env = process.env): string | null {
  if (typeof token !== "string" || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  if (raw.length !== TOKEN_BYTES) return null;
  const key = keyFor(raw[0], env);
  if (!key) return null;
  const body = raw.subarray(0, 17);
  const want = mac(key, kind, body);
  if (!timingSafeEqual(raw.subarray(17), want)) return null;
  return uuidString(raw.subarray(1, 17));
}

/** The page a person opens: shows one button. */
export const unsubPageUrl = (token: string) => appUrl(`/u/${token}`);
/** The List-Unsubscribe target: a one-click POST unsubscribes, a GET goes to the page. */
export const unsubOneClickUrl = (token: string) => appUrl(`/api/unsubscribe/${token}`);

/** The headers for one-click unsubscribe (RFC 2369 and RFC 8058). */
export function unsubHeaders(token: string): Record<string, string> {
  return { "List-Unsubscribe": `<${unsubOneClickUrl(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/**
 * Switches the stats email off for the token's member: `email_prefs.stats =
 * false`, every other preference kept (the Monday email among them). Null
 * for a token that does not verify, and then nothing changes.
 */
export async function unsubscribe(q: Query, token: string | null | undefined, kind: UnsubKind = "stats"): Promise<{ userId: string } | null> {
  const userId = verifyUnsubToken(token, kind);
  if (!userId) return null;
  const rows = await q<{ id: string }>(`update users set email_prefs = email_prefs || jsonb_build_object($2::text, false) where id = $1 returning id`, [userId, kind]);
  return rows[0] ? { userId } : null;
}

/** Whether the token's member already has the email off (the page's "done" state). Null for a bad token or unknown member. */
export async function unsubscribed(q: Query, token: string | null | undefined, kind: UnsubKind = "stats"): Promise<boolean | null> {
  const userId = verifyUnsubToken(token, kind);
  if (!userId) return null;
  const [u] = await q<{ off: boolean }>(`select coalesce((email_prefs ->> $2) = 'false', false) as off from users where id = $1`, [userId, kind]);
  return u ? u.off : null;
}
