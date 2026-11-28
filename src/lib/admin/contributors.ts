import { normaliseEmail } from "@/lib/auth/tokens";
import type { Query } from "@/lib/db-query";
import { isEmail } from "@/lib/form";
import { logAdminAction } from "./log";

/**
 * The hidden seed contributors (R25): one record per person whose pilot runs
 * seed the pool. Linking one to that person's real account makes Cora leave
 * their own seed plays out of their lists.
 *
 * One person can have several contributor records (their name spelled two
 * ways), so one account can be linked to several contributors, and several
 * contributors can carry the same email address. A contributor is linked to
 * at most one account.
 *
 * A contributor can carry the person's email address. Then linking happens by
 * itself: when the email is set and an account has it, when an account is
 * made with it (sign-up, a pilot link), and when an account's address changes
 * to it, every unlinked contributor with that address is linked. Every
 * automatic link goes through linkContributor, so it is logged like a manual
 * one. Nothing is ever unlinked automatically, and a contributor already
 * linked to an account is never moved to another.
 */
type Done = { ok: true; message: string } | { ok: false; message: string };
const ok = (message: string): Done => ({ ok: true, message });
const no = (message: string): Done => ({ ok: false, message });

/** Who an automatic link at sign-up is logged as. */
export const SIGNUP_ACTOR = "system (sign-up)";
/** Who an automatic link after a member's own email change is logged as. */
export const EMAIL_CHANGE_ACTOR = "system (email change)";

/**
 * Links a hidden seed contributor to a real account (R25), or unlinks it
 * (userId null). The user it was linked to is read in the same statement, so
 * an unlink is logged against that user, and a move from one user to another
 * is logged against both. `onlyIfUnlinked` (the automatic links): nothing
 * happens if the contributor is linked already, checked in the statement
 * that links. `via` is recorded in the log ("email" for the automatic links).
 */
export async function linkContributor(
  q: Query,
  by: string,
  contributorId: string,
  userId: string | null,
  o: { onlyIfUnlinked?: boolean; via?: string } = {},
): Promise<Done> {
  try {
    const rows = await q<{ label: string; previous: string | null }>(
      `update seed_contributors s set user_id = $2 from (select id, user_id from seed_contributors where id = $1) old
       where s.id = old.id and (not $3::boolean or s.user_id is null) returning s.label, old.user_id as previous`,
      [contributorId, userId, Boolean(o.onlyIfUnlinked)],
    );
    if (!rows.length) {
      if (o.onlyIfUnlinked && (await q(`select 1 from seed_contributors where id = $1`, [contributorId])).length) return no("That contributor is already linked to an account.");
      return no("No such contributor.");
    }
    const { label, previous } = rows[0];
    const via = o.via ? { via: o.via } : {};
    if (previous && previous !== userId) await logAdminAction(q, { by, userId: previous, action: "unlink_contributor", detail: { contributorId, label, movedTo: userId, ...via } });
    if (userId && previous !== userId) await logAdminAction(q, { by, userId, action: "link_contributor", detail: { contributorId, label, movedFrom: previous, ...via } });
    return ok(userId ? `Linked ${label}. Cora leaves their seed plays out of this user’s lists.` : `Unlinked ${label}.`);
  } catch (e) {
    if (/foreign key/i.test((e as Error).message)) return no("No such user.");
    throw e;
  }
}

/**
 * Links the account to every contributor carrying its email address that is
 * not linked yet. Null when there was nothing to link. Called where an
 * account is made and where its address changes.
 */
export async function linkContributorByEmail(q: Query, by: string, userId: string): Promise<Done | null> {
  const found = await q<{ id: string }>(
    `select s.id from seed_contributors s join users u on lower(u.email) = lower(s.email)
     where u.id = $1 and s.user_id is null order by lower(s.label)`,
    [userId],
  );
  if (!found.length) return null;
  const done: Done[] = [];
  for (const c of found) done.push(await linkContributor(q, by, c.id, userId, { onlyIfUnlinked: true, via: "email" }));
  const failed = done.filter((d) => !d.ok);
  if (failed.length) return no(failed.map((d) => d.message).join(" "));
  return ok(done.map((d) => d.message).join(" "));
}

/**
 * The same, for a step that must not fail because of it (sign-up, an email
 * change): an error is logged and the step goes on. An admin can still link
 * by hand on the user page.
 */
export async function autoLinkContributor(q: Query, by: string, userId: string): Promise<void> {
  try {
    const r = await linkContributorByEmail(q, by, userId);
    if (r && !r.ok) console.warn("[contributors] automatic link not made", userId, r.message);
  } catch (e) {
    console.error("[contributors] automatic link", userId, e instanceof Error ? e.message : e);
  }
}

/**
 * Sets (or, with an empty address, clears) a contributor's email address.
 * Several contributors may share one (one person, several records). If an
 * account already has the address and the contributor is not linked yet, it
 * is linked at once. Clearing the address, or changing it, never unlinks.
 */
export async function setContributorEmail(q: Query, by: string, contributorId: string, rawEmail: string): Promise<Done> {
  const email = rawEmail.trim() ? normaliseEmail(rawEmail) : null;
  if (email !== null && !isEmail(email)) return no("That isn’t an email address.");
  const [old] = await q<{ label: string; email: string | null }>(`select label, email from seed_contributors where id = $1`, [contributorId]);
  if (!old) return no("No such contributor.");
  // Saving the same address again changes nothing, but still links an account made with it since.
  if ((old.email ?? null) !== email) {
    await q(`update seed_contributors set email = $2 where id = $1`, [contributorId, email]);
    await logAdminAction(q, { by, action: "contributor_email", detail: { contributorId, label: old.label, from: old.email, to: email } });
  }
  if (!email) return ok(`Address cleared for ${old.label}. Any link stays as it is.`);

  const [c] = await q<{ user_id: string | null }>(`select user_id from seed_contributors where id = $1`, [contributorId]);
  if (c?.user_id) return ok(`Address saved for ${old.label}. It was already linked to an account, which stays as it is.`);
  const [u] = await q<{ id: string }>(`select id from users where lower(email) = $1`, [email]);
  if (!u) return ok(`Address saved for ${old.label}. No account has it yet; one made with it is linked when it is created.`);
  const linked = await linkContributor(q, by, contributorId, u.id, { onlyIfUnlinked: true, via: "email" });
  return linked.ok ? ok(`Address saved, and ${old.label} is linked to the account with it.`) : ok(`Address saved for ${old.label}, but it could not be linked: ${linked.message}`);
}

/** Every contributor, for the Cora page's list. */
export type ContributorRow = { id: string; label: string; email: string | null; userId: string | null; userEmail: string | null; runs: number };

export function listContributors(q: Query): Promise<ContributorRow[]> {
  return q<ContributorRow>(
    `select s.id, s.label, s.email, s.user_id as "userId", u.email as "userEmail",
       (select count(*)::int from runs r where r.contributor_id = s.id and r.status <> 'deleted') as runs
     from seed_contributors s left join users u on u.id = s.user_id order by lower(s.label)`,
  );
}
