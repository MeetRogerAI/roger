import { createHash, randomBytes } from "node:crypto";

/** A new random secret: 256 bits, URL-safe. Sent to the user; only its hash is stored. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores for a secret. A leaked table cannot be turned back into cookies or links. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

/** Lower-cased and trimmed: one account per address however it is typed. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A rate-limit key for an address that does not contain the address. */
export function emailKey(email: string): string {
  return createHash("sha256").update(`rl:${normaliseEmail(email)}`).digest("base64url").slice(0, 22);
}

/** True for any backslash, space or control character (code 0 to 32, or 127). */
function hasUnsafeChar(path: string): boolean {
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c <= 32 || c === 127 || c === 92) return true;
  }
  return false;
}

/**
 * Only same-site paths are followed after sign-in, never another host. Any
 * backslash, whitespace or control character is refused: browsers strip tabs
 * and newlines from URLs, so a tab after the first slash would otherwise turn
 * the path into "//other-host". The result must also resolve to this site.
 */
export function safeNext(path: string | null | undefined, fallback = "/app"): string {
  if (!path || typeof path !== "string" || path.length > 300) return fallback;
  if (!path.startsWith("/") || path.startsWith("//") || hasUnsafeChar(path)) return fallback;
  try {
    if (new URL(path, "http://roger.invalid").origin !== "http://roger.invalid") return fallback;
  } catch {
    return fallback;
  }
  return path;
}
