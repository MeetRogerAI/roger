import { getSession, isEmailAdmin } from "./auth/access";

/**
 * True for an admin: someone signed in by email link whose address is in
 * ADMIN_EMAILS (spec B.3). There is no other way in: the shared-password
 * login was removed after launch (launch list g-password).
 */
export async function isAdmin() {
  return (await adminIdentity()) !== null;
}

/** Who the admin is, for the action log: their email, or null for anyone else. */
export async function adminIdentity(): Promise<string | null> {
  if (!(await isEmailAdmin())) return null;
  const s = await getSession();
  return s ? s.email : null;
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
