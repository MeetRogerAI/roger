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

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A rate-limit key for an address that does not contain the address. */
export function emailKey(email: string): string {
  return createHash("sha256").update(`rl:${normaliseEmail(email)}`).digest("base64url").slice(0, 22);
}

/**
 * Only same-site paths are followed after sign-in, never another host
 * ("//evil.test", "/\\evil.test" and full URLs are refused).
 */
export function safeNext(path: string | null | undefined, fallback = "/app"): string {
  if (!path || typeof path !== "string") return fallback;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || /[\r\n]/.test(path)) return fallback;
  return path.slice(0, 300);
}
