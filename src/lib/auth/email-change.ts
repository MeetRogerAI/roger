import type { Query } from "@/lib/db-query";
import { isEmail } from "@/lib/form";
import { adminAlert, alertAdmins, sendToUser, type MailDeps, type SendResult } from "@/lib/mail/send";
import { approveEmailChangeEmail, emailChangedEmail, emailInUseEmail } from "@/lib/mail/templates/confirm-new-email";
import { confirmNewEmail } from "@/lib/mail/templates/sign-in";
import { issueToken, type UsedToken } from "./login-link";
import { hashSecret, newSecret, normaliseEmail } from "./tokens";

/**
 * Changing a user's email address (spec B.10) needs both addresses, so a
 * session alone can never move an account:
 *
 * 1. Request (signed in): a link goes to the CURRENT address only, asking to
 *    approve the change. Nothing goes to the new address yet.
 * 2. Approve (that link): the account must still have the address it had at
 *    the request, and this must be its newest request. Signs nobody in. Then
 *    the confirm link goes to the new address, unless another account uses
 *    it (that address's owner is told someone tried; no link is made).
 * 3. Confirm (the new address's link): the change applies only if the
 *    account still has the address it had at the request. The old address is
 *    told once. Sessions are handled by the confirm action.
 *
 * A newer request supersedes both kinds of link (login-link.ts, LIVE).
 * Someone who has lost their old address writes to support; an admin changes
 * it (Unit 17). Notification refs are token-hash prefixes, never addresses.
 */
export const APPROVE_LINK_MINUTES = 60;

const refOf = (hash: string) => hash.slice(0, 16);

export type EmailChangeOutcome = "sent" | "same" | "invalid" | "limited" | "send_failed";

type ChangeData = { from: string; to: string; approval?: string };
function changeData(t: UsedToken): ChangeData | null {
  const d = t.data ?? {};
  return typeof d.from === "string" && typeof d.to === "string" ? { from: d.from, to: d.to, approval: typeof d.approval === "string" ? d.approval : undefined } : null;
}

/**
 * Step 1. Asks the current address to approve a change to `rawEmail`. The
 * answer never depends on whether another account uses the new address
 * (that is only looked at in step 2). Fails closed: if the approval email
 * can't be sent, its link is withdrawn and the user is asked to try again.
 * `allow` is the per-address rate limit, checked only for a valid, different
 * address.
 */
export async function requestEmailChange(
  q: Query,
  user: { id: string; email: string },
  rawEmail: string,
  deps: MailDeps & { now?: Date; allow?: (email: string) => Promise<boolean> } = {},
): Promise<EmailChangeOutcome> {
  const to = normaliseEmail(rawEmail);
  const from = normaliseEmail(user.email);
  if (!isEmail(to)) return "invalid";
  if (to === from) return "same";
  if (deps.allow && !(await deps.allow(to))) return "limited";
  const now = deps.now ?? new Date();

  // Earlier requests stop here too (and are superseded in consumeToken regardless).
  await q(
    `update login_tokens set revoked_at = $2 where user_id = $1 and purpose in ('email_approve', 'email_change') and used_at is null and revoked_at is null`,
    [user.id, now.toISOString()],
  );
  const token = await issueToken(q, { email: from, purpose: "email_approve", userId: user.id, ttlMs: APPROVE_LINK_MINUTES * 60_000, data: { from, to } }, now);
  const hash = hashSecret(token);
  const sent = await sendToUser({ id: user.id, email: from }, "email_change_approve", refOf(hash), approveEmailChangeEmail(token, to), deps).catch(() => "failed" as const);
  if (sent === "failed") {
    await q(`update login_tokens set revoked_at = $2 where token_hash = $1`, [hash, now.toISOString()]);
    return "send_failed";
  }
  return "sent";
}

export type ApproveOutcome = "sent" | "taken" | "stale" | "send_failed";

/**
 * Step 2, after the current address's link was used. Nobody is signed in.
 * Run it after the response (the confirm action uses after()), so the reply
 * and its timing are the same whatever happens here.
 */
export async function approveEmailChange(q: Query, t: UsedToken, deps: MailDeps & { now?: Date } = {}): Promise<ApproveOutcome> {
  const d = changeData(t);
  if (t.purpose !== "email_approve" || !t.userId || !d) return "stale";
  const [u] = await q<{ email: string }>(`select email from users where id = $1`, [t.userId]);
  if (!u || normaliseEmail(u.email) !== d.from) return "stale";

  const [taken] = await q<{ id: string }>(`select id from users where lower(email) = $1 and id <> $2`, [d.to, t.userId]);
  if (taken) {
    await sendToUser({ id: taken.id, email: d.to }, "email_change_taken", refOf(hashSecret(newSecret())), emailInUseEmail(), deps);
    return "taken";
  }
  const token = await issueToken(
    q,
    { email: d.to, purpose: "email_change", userId: t.userId, nextPath: "/app/settings?email=changed", data: { from: d.from, to: d.to, approval: t.hash } },
    deps.now ?? new Date(),
  );
  const r = await sendToUser({ id: t.userId, email: d.to }, "email_change", refOf(hashSecret(token)), confirmNewEmail(token), deps);
  return r === "failed" ? "send_failed" : "sent";
}

/**
 * Step 3, after the new address's link was used: applies the change if the
 * account still has the address it had at the request, the approval was
 * really used, and nobody else has the new address. Stripe's customer is
 * marked as needing the new address.
 */
export async function confirmEmailChange(q: Query, t: UsedToken, now = new Date()): Promise<{ id: string; email: string; oldEmail: string } | null> {
  const d = changeData(t);
  if (t.purpose !== "email_change" || !t.userId || !d?.approval) return null;
  const [approved] = await q(`select 1 from login_tokens where token_hash = $1 and user_id = $2 and purpose = 'email_approve' and used_at is not null`, [d.approval, t.userId]);
  if (!approved) return null;
  try {
    const rows = await q<{ id: string; email: string }>(
      `update users u set email = $3, email_verified_at = $4, stripe_email_synced = (u.stripe_customer is null), stripe_email_attempts = 0
       where u.id = $1 and u.email = $2 and not exists (select 1 from users where email = $3 and id <> $1)
       returning u.id, u.email`,
      [t.userId, d.from, d.to, now.toISOString()],
    );
    return rows[0] ? { ...rows[0], oldEmail: d.from } : null;
  } catch (e) {
    // Taken by someone else between the check and the update.
    if (/unique|duplicate/i.test((e as Error).message)) return null;
    throw e;
  }
}

/** Once a change is complete: the old address is told, once per change (the ref is the confirm link's hash prefix). */
export function noticeEmailChanged(q: Query, changed: { id: string; email: string; oldEmail: string }, confirmHash: string, deps: MailDeps = {}): Promise<SendResult> {
  return sendToUser({ id: changed.id, email: changed.oldEmail }, "email_changed", refOf(confirmHash), emailChangedEmail({ newEmail: changed.email }), { query: q, ...deps });
}

export type CustomerEmailUpdate = (customer: string, email: string) => Promise<void>;

/**
 * Gives Stripe's customer the user's current address (receipts and invoices
 * go there). On failure the account keeps its new address; the flag stays
 * off and the hourly pass tries again.
 */
export async function syncCustomerEmail(q: Query, userId: string, update: CustomerEmailUpdate): Promise<"synced" | "none" | "failed"> {
  const [u] = await q<{ email: string; stripe_customer: string | null }>(`select email, stripe_customer from users where id = $1`, [userId]);
  if (!u?.stripe_customer) {
    await q(`update users set stripe_email_synced = true where id = $1`, [userId]);
    return "none";
  }
  try {
    await update(u.stripe_customer, u.email);
  } catch (e) {
    console.error("[email-change] stripe email sync failed", userId, e instanceof Error ? e.message : e);
    await q(`update users set stripe_email_attempts = stripe_email_attempts + 1 where id = $1`, [userId]);
    return "failed";
  }
  // Only if the address did not change again while Stripe was being called.
  await q(`update users set stripe_email_synced = true, stripe_email_attempts = 0 where id = $1 and email = $2`, [userId, u.email]);
  return "synced";
}

export const SYNC_ALERT_AFTER = 3;

/** The hourly retry: every account whose Stripe customer still has an old address. Admins hear after repeated failures. */
export async function syncStripeEmails(q: Query, update: CustomerEmailUpdate, deps: MailDeps = {}): Promise<{ synced: number; failed: number }> {
  const due = await q<{ id: string }>(`select id from users where not stripe_email_synced order by id limit 100`);
  let synced = 0;
  let failed = 0;
  for (const { id } of due) {
    const r = await syncCustomerEmail(q, id, update);
    if (r !== "failed") {
      synced++;
      continue;
    }
    failed++;
    const [u] = await q<{ attempts: number; email: string }>(`select stripe_email_attempts as attempts, email from users where id = $1`, [id]);
    if (u && u.attempts >= SYNC_ALERT_AFTER) {
      await alertAdmins(
        "stripe_email_sync",
        `${id}:${hashSecret(u.email).slice(0, 8)}`,
        adminAlert("A Stripe customer has an old email address", [`User ${id} changed their email address, and updating their Stripe customer has failed ${u.attempts} times.`, "Update the customer's email in Stripe by hand, or look at the error in the logs."]),
        deps,
      ).catch(() => {});
    }
  }
  return { synced, failed };
}
