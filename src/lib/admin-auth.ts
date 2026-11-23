import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSession, isEmailAdmin } from "./auth/access";

const COOKIE = "roger-admin";
const DAYS = 14;

/**
 * The key that signs the password cookie: ADMIN_SECRET, or, when that is not
 * set, a key derived from CRON_SECRET for this one use. Never CRON_SECRET
 * itself, so the cron bearer token alone can't make an admin cookie.
 */
function secret() {
  if (process.env.ADMIN_SECRET) return process.env.ADMIN_SECRET;
  if (process.env.CRON_SECRET) return createHmac("sha256", process.env.CRON_SECRET).update("admin-cookie-v1").digest("base64url");
  throw new Error("ADMIN_SECRET is not set");
}

/** The cookie's MAC covers the password too, so changing ADMIN_PASSWORD ends every cookie issued under the old one. */
function sign(expires: number) {
  const password = process.env.ADMIN_PASSWORD?.trim() ?? "";
  const bound = createHash("sha256").update(password).digest("base64url");
  return createHmac("sha256", secret()).update(`admin:${expires}:${bound}`).digest("base64url");
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * True for an admin: someone signed in by email link whose address is in
 * ADMIN_EMAILS (spec B.3), or, until that is confirmed on production and the
 * password login is removed, someone holding the shared-password cookie.
 *
 * THE PASSWORD SWITCH. The shared-password login works only while the
 * ADMIN_PASSWORD environment variable is set. Removing it turns the login
 * off and makes every password cookie already issued worthless at once.
 * Plan Unit 17: remove ADMIN_PASSWORD (and later this code) once both admins
 * have signed in by email link on production.
 */
export async function isAdmin() {
  return (await adminIdentity()) !== null;
}

/** Who the admin is, for the action log: their email, "admin (password)", or null for anyone else. */
export async function adminIdentity(): Promise<string | null> {
  if (await isEmailAdmin()) {
    const s = await getSession();
    if (s) return s.email;
  }
  return (await passwordAdmin()) ? PASSWORD_ADMIN : null;
}

export const PASSWORD_ADMIN = "admin (password)";

/** Whether the shared-password login is switched on (ADMIN_PASSWORD set). */
export const passwordLoginOn = () => Boolean(process.env.ADMIN_PASSWORD?.trim());

/** The shared-password cookie (to be removed once email admin works on production). */
async function passwordAdmin() {
  if (!passwordLoginOn()) return false;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [exp, mac] = raw.split(".");
  const expires = Number(exp);
  if (!expires || expires < Date.now() || !mac) return false;
  try {
    return same(mac, sign(expires));
  } catch {
    return false;
  }
}

/**
 * For every admin server action and route handler (they are public
 * endpoints): throws for anyone who is not an admin, and returns who the
 * admin is, for the action log.
 */
export async function requireAdmin(): Promise<string> {
  const who = await adminIdentity();
  if (!who) throw new Error("Not signed in");
  return who;
}

export async function signIn(password: string) {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected || !same(password.trim(), expected)) return false;
  const expires = Date.now() + DAYS * 86400_000;
  (await cookies()).set(COOKIE, `${expires}.${sign(expires)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DAYS * 86400,
  });
  return true;
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}
