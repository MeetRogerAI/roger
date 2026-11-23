import { adjustmentOnAccountClosed, type AdjustDeps } from "@/lib/billing/adjustment";
import { isLive, type BillingGateway } from "@/lib/billing/subscriptions";
import { isRealDate, wallParts } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { adminEmails } from "@/lib/auth/admin-emails";
import { revokeUserSessions } from "@/lib/auth/session";
import { normaliseEmail } from "@/lib/auth/tokens";
import { isEmail } from "@/lib/form";
import { adminAlert, alertAdmins, sendToUser, type MailDeps } from "@/lib/mail/send";
import { addressChangedBySupportEmail, addressMovedAwayEmail, nudgeEmail, type Nudge } from "@/lib/mail/templates/admin-user";
import { checkReport, storeReport, type Stored } from "@/lib/zack/receive";
import { logAdminAction } from "./log";

/**
 * What an admin can do to one user (spec B.12, plan Unit 17). Each function
 * takes who the admin is, checks what it needs in the statement that acts,
 * and logs itself (spec check 31). The server actions in
 * src/app/admin/v3-actions.ts check that the caller is an admin first.
 */
export type Done = { ok: true; message: string } | { ok: false; message: string };
const ok = (message: string): Done => ({ ok: true, message });
const no = (message: string): Done => ({ ok: false, message });

export const MAX_NOTE = 2000;

/** The private note on the operations screen. */
export async function saveNote(q: Query, by: string, userId: string, note: string): Promise<Done> {
  const text = note.replace(/\r\n/g, "\n").trim().slice(0, MAX_NOTE);
  const rows = await q(`update users set admin_note = $2 where id = $1 returning id`, [userId, text]);
  if (!rows.length) return no("No such user.");
  await logAdminAction(q, { by, userId, action: "note", detail: { length: text.length } });
  return ok("Note saved.");
}

/** A charge in flight for the user: anything that changes what they owe waits for it. */
const OPEN_CLAIM = `exists (select 1 from charge_attempts c where c.user_id = u.id and c.outcome in ('claimed', 'unknown'))`;

/**
 * One extra free list for a trial member: one fewer list counted as used, so
 * the first charge (or the first order) moves one list later, and the status
 * line says so. The told quote is dropped, because it named the old Monday;
 * the second-list email tells the new date and amount again. Refused while a
 * list is ordered (it would be charged for a list that is now free) and
 * while a charge is in flight, both checked in the statement that acts.
 */
const OPEN_ORDER = `exists (select 1 from orders o where o.user_id = u.id and o.status = 'ordered')`;

export async function giveExtraFreeList(q: Query, by: string, userId: string): Promise<Done> {
  const rows = await q<{ free_lists_used: number }>(
    `update users u set free_lists_used = u.free_lists_used - 1, quote = null
     where u.id = $1 and u.status = 'trial' and u.stripe_subscription is null and u.free_lists_used > 0 and not ${OPEN_CLAIM} and not ${OPEN_ORDER}
     returning u.free_lists_used`,
    [userId],
  );
  if (!rows.length) {
    const [u] = await q<{ status: string; free_lists_used: number; open: boolean; ordered: boolean }>(
      `select status, free_lists_used, ${OPEN_CLAIM} as open, ${OPEN_ORDER} as ordered from users u where id = $1`,
      [userId],
    );
    if (!u) return no("No such user.");
    if (u.open) return no("A charge for this user is in progress. Try again in a few minutes.");
    if (u.ordered) return no("They have a list ordered, which would be charged. Give the extra list after that Monday, or once they cancel the order.");
    if (u.status !== "trial") return no("Only a member still on the trial can get an extra free list.");
    return no("They haven’t used a free list yet, so there is nothing to give back.");
  }
  await logAdminAction(q, { by, userId, action: "extra_free_list", detail: { freeListsUsed: rows[0].free_lists_used } });
  return ok("One extra free list given. Their first paid list moves one week later.");
}

/** One fixed template email; the same template goes at most once per week. */
export async function sendNudge(q: Query, d: MailDeps, by: string, userId: string, kind: Nudge, week: string): Promise<Done> {
  const [u] = await q<{ id: string; email: string; status: string }>(`select id, email, status from users where id = $1`, [userId]);
  if (!u) return no("No such user.");
  if (u.status === "closed") return no("This account is closed.");
  const res = await sendToUser({ id: u.id, email: u.email }, "admin_nudge", `${kind}:${week}`, nudgeEmail(kind, { week }), { ...d, query: q });
  if (res === "already") return no("That email already went to them this week.");
  await logAdminAction(q, { by, userId, action: "nudge", detail: { template: kind, week, result: res } });
  return res === "sent" ? ok("Sent.") : no("The email could not be sent. Try again later.");
}

/**
 * A run an admin adds for a member (a report they sent to support), stored
 * by route `admin` through the same path as the endpoint. Like a run Zack
 * sends, it counts for the list it arrives in time for by the job clock:
 * up to Sunday's cutoff, the coming Monday; after it, the Monday a week
 * later. It replaces a run already stored for that week. The caller hands
 * it to intake.
 */
export async function addRunForUser(q: Query, by: string, userId: string, body: string, o: { cutoff: string; now: Date }): Promise<Done & { stored?: Stored }> {
  const checked = checkReport(body, "run");
  if (!checked.ok) return no(checked.error);
  const [u] = await q<{ id: string; email: string; sharing: "share" | "match_only" | "off"; agent: string; status: string }>(
    `select id, email, sharing, agent, status from users where id = $1`,
    [userId],
  );
  if (!u) return no("No such user.");
  if (u.status === "closed" || u.status === "signup") return no("This account can’t receive runs.");
  const stored = await storeReport(q, u, checked, { route: "admin", test: false, cutoff: o.cutoff, now: o.now });
  await logAdminAction(q, { by, userId, action: "add_run", detail: { runId: stored.id, week: stored.week_of, replaced: stored.replaced, kind: stored.kind } });
  return { ok: true, message: `Stored for the list on ${stored.week_of}${stored.replaced ? ", replacing the earlier one" : ""}. Intake reads it now.`, stored };
}

/** A Monday, written YYYY-MM-DD (the week a contribution or excuse is for). */
export function isMonday(s: string): boolean {
  return isRealDate(s) && wallParts(new Date(`${s}T17:00:00Z`)).dow === 1;
}

/**
 * Links a hidden seed contributor to a real account (R25), or unlinks it
 * (userId null). The user it was linked to is read in the same statement, so
 * an unlink is logged against that user, and a move from one user to another
 * is logged against both.
 */
export async function linkContributor(q: Query, by: string, contributorId: string, userId: string | null): Promise<Done> {
  try {
    const rows = await q<{ label: string; previous: string | null }>(
      `update seed_contributors s set user_id = $2 from (select id, user_id from seed_contributors where id = $1) old
       where s.id = old.id returning s.label, old.user_id as previous`,
      [contributorId, userId],
    );
    if (!rows.length) return no("No such contributor.");
    const { label, previous } = rows[0];
    if (previous && previous !== userId) await logAdminAction(q, { by, userId: previous, action: "unlink_contributor", detail: { contributorId, label, movedTo: userId } });
    if (userId && previous !== userId) await logAdminAction(q, { by, userId, action: "link_contributor", detail: { contributorId, label, movedFrom: previous } });
    return ok(userId ? `Linked ${label}. Cora leaves their seed plays out of this user’s lists.` : `Unlinked ${label}.`);
  } catch (e) {
    if (/unique|duplicate/i.test((e as Error).message)) return no("That user is already linked to another contributor.");
    if (/foreign key/i.test((e as Error).message)) return no("No such user.");
    throw e;
  }
}

/**
 * Closes an account on request: nothing more is charged or sent, every
 * session and unused link ends, and any pending higher-rate difference is
 * dropped (adjustmentOnAccountClosed). Refused while a charge is in flight,
 * and while Stripe still has a live subscription for the customer: cancel it
 * in Stripe first, so a closed account is never billed. Never for an admin's
 * account. Pressed again on a closed account, the clean-up steps run again
 * (each is safe to repeat) and nothing more is logged, so a clean-up that
 * failed half-way can be finished.
 */
export async function closeAccount(q: Query, d: AdjustDeps & { gw?: BillingGateway | null }, by: string, userId: string): Promise<Done> {
  const [u] = await q<{ email: string; status: string; stripe_customer: string | null; stripe_subscription: string | null; open: boolean }>(
    `select email, status, stripe_customer, stripe_subscription, ${OPEN_CLAIM} as open from users u where id = $1`,
    [userId],
  );
  if (!u) return no("No such user.");
  if (isAdminAddress(u.email)) return no("That is an admin’s account.");
  if (u.status === "closed") {
    await cleanUpClosed(q, d, userId);
    return ok("This account was already closed. Its sessions, links, orders and pending differences are cleared again.");
  }
  if (u.open) return no("A charge for this user is in progress. Try again in a few minutes.");
  if (u.stripe_customer) {
    if (!d.gw) {
      if (u.stripe_subscription) return no("Stripe isn’t reachable from here, and this account has a subscription. Cancel it in Stripe, then close the account.");
    } else {
      const live = (await d.gw.subscriptions(u.stripe_customer)).filter(isLive);
      if (live.length) return no("Stripe still has a live subscription for this customer. Cancel it in Stripe (Open in Stripe), then close the account.");
    }
  }
  const rows = await q(
    // Access ends now; the retention clock counts from it (Unit 18).
    `update users u set status = 'closed', hold_reason = null, access_ends_at = least(coalesce(u.access_ends_at, now()), now()) where u.id = $1 and u.status <> 'closed' and not ${OPEN_CLAIM} and lower(u.email) <> all($2::text[]) returning id`,
    [userId, adminEmails()],
  );
  if (!rows.length) return no("The account changed meanwhile. Reload and try again.");
  // Logged as soon as the account is closed, so a clean-up that fails below is still on record.
  await logAdminAction(q, { by, userId, action: "close_account", detail: { from: u.status } });
  const dropped = await cleanUpClosed(q, d, userId);
  return ok(`Account closed. Nothing more will be charged or sent.${dropped ? ` ${dropped} pending difference${dropped === 1 ? "" : "s"} dropped.` : ""}`);
}

/** Ends what a closed account still has open. Every step is safe to run again. */
async function cleanUpClosed(q: Query, d: AdjustDeps, userId: string): Promise<number> {
  await revokeUserSessions(q, userId);
  await q(`update login_tokens set revoked_at = now() where user_id = $1 and used_at is null and revoked_at is null`, [userId]);
  await q(`update orders set status = 'cancelled', updated_at = now() where user_id = $1 and status = 'ordered'`, [userId]);
  return adjustmentOnAccountClosed(q, d, userId);
}

const isAdminAddress = (email: string) => adminEmails().includes(email.toLowerCase());

/**
 * Deletes a closed account and everything that is only theirs (runs, plays
 * not yet in the pool, picks, settings). Plays already in the pool stay in
 * their anonymous form. The admin log keeps its rows, including the deleted
 * address (see the privacy note in the plan). Refused while a dropped
 * higher-rate item may still be in Stripe (its delete not yet confirmed):
 * deleting the account would lose the record the hourly retry needs.
 */
export async function deleteAccount(q: Query, by: string, userId: string, confirmEmail: string): Promise<Done> {
  const [u] = await q<{ email: string; status: string; stripe_open: boolean }>(
    `select email, status, exists (select 1 from pending_adjustments a where a.user_id = u.id and a.stripe_item is not null and a.stripe_deleted_at is null and a.status <> 'invoiced') as stripe_open
     from users u where id = $1`,
    [userId],
  );
  if (!u) return no("No such user.");
  if (isAdminAddress(u.email)) return no("That is an admin’s account.");
  if (u.status !== "closed") return no("Close the account first.");
  if (normaliseEmail(confirmEmail) !== u.email.toLowerCase()) return no("Type the account’s email address to confirm.");
  if (u.stripe_open) return no("A higher-rate item for this account may still be in Stripe. Wait for the hourly pass to remove it, then delete.");
  const gone = await q<{ email: string }>(
    `delete from users u where u.id = $1 and u.status = 'closed' and lower(u.email) <> all($2::text[])
       and not exists (select 1 from pending_adjustments a where a.user_id = u.id and a.stripe_item is not null and a.stripe_deleted_at is null and a.status <> 'invoiced')
     returning u.email`,
    [userId, adminEmails()],
  );
  if (!gone.length) return no("The account changed meanwhile. Reload and try again.");
  await logAdminAction(q, { by, userId, action: "delete_account", detail: { email: gone[0].email } });
  return ok("Account deleted.");
}

/**
 * Support changes a member's address when they have lost the old one (Unit
 * 16 sends them here). The new address must be free and not an admin's; all
 * sessions and unused links end; Stripe's customer is marked for the hourly
 * sync; both addresses are told. Never an admin's account (that would move
 * admin rights to an address nobody checked).
 */
export async function changeUserEmail(q: Query, d: MailDeps, by: string, userId: string, newEmail: string): Promise<Done> {
  const email = normaliseEmail(newEmail);
  if (!isEmail(email)) return no("That isn’t an email address.");
  if (isAdminAddress(email)) return no("That is an admin address.");
  const [u] = await q<{ email: string }>(`select email from users where id = $1`, [userId]);
  if (!u) return no("No such user.");
  if (isAdminAddress(u.email)) return no("That is an admin’s account. Change ADMIN_EMAILS instead.");
  if (u.email.toLowerCase() === email) return no("That is already their address.");
  let rows: { id: string }[];
  try {
    rows = await q<{ id: string }>(
      // A Google sign-in linked through the old address is unlinked with it (Unit 18 review).
      `update users u set email = $3, email_verified_at = null, stripe_email_synced = (u.stripe_customer is null), stripe_email_attempts = 0,
         google_sub = null, google_email = null
       where u.id = $1 and u.email = $2 and lower(u.email) <> all($4::text[])
         and not exists (select 1 from users x where lower(x.email) = $3 and x.id <> $1)
       returning u.id`,
      [userId, u.email, email, adminEmails()],
    );
  } catch (e) {
    if (/unique|duplicate/i.test((e as Error).message)) return no("Another account uses that address.");
    throw e;
  }
  if (!rows.length) return no("Another account uses that address, or this one changed meanwhile.");
  await revokeUserSessions(q, userId);
  await q(`update login_tokens set revoked_at = now() where user_id = $1 and used_at is null and revoked_at is null`, [userId]);
  // The ref for both notices: unique to this change, and no address in it.
  const ref = `${userId}:${Date.now()}`;
  const mail = { ...d, query: q };
  const toNew = await sendToUser({ id: userId, email }, "email_changed_by_support", ref, addressChangedBySupportEmail({ newEmail: email }), mail).catch(() => "failed" as const);
  const toOld = await sendToUser({ id: userId, email: u.email }, "email_moved_by_support", ref, addressMovedAwayEmail({ newEmail: email }), mail).catch(() => "failed" as const);
  await logAdminAction(q, { by, userId, action: "change_email", detail: { from: u.email, to: email, noticeToNew: toNew, noticeToOld: toOld } });
  const failed = [toNew !== "sent" && "the new address", toOld !== "sent" && "the old address"].filter(Boolean);
  if (failed.length) {
    await alertAdmins(
      "admin_email_change_notice",
      ref,
      adminAlert("A member's address was changed but a notice did not go", [`User ${userId}: the notice to ${failed.join(" and ")} could not be sent. Tell them another way.`]),
      mail,
    ).catch(() => {});
    return ok(`Address changed to ${email} and they are signed out everywhere, but the notice to ${failed.join(" and ")} could not be sent. Tell them another way.`);
  }
  return ok(`Address changed to ${email}. They are signed out everywhere and both addresses were told.`);
}
