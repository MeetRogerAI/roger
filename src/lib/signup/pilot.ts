import { logAdminAction } from "@/lib/admin/log";
import { adminEmails } from "@/lib/auth/admin-emails";
import { issueToken } from "@/lib/auth/login-link";
import { normaliseEmail } from "@/lib/auth/tokens";
import type { Query } from "@/lib/db-query";
import { isEmail } from "@/lib/form";
import { appUrl } from "@/lib/mail/layout";
import { applyReferralSafely, referralEmailKey } from "@/lib/referrals/attribution";

/**
 * Spec B.4, "Existing pilot users": an admin makes an account for a person and
 * gets a link that opens at Step 3, Product and Pricing (`/start/plan`). They
 * finish sign-up there and add a card when their first list is ready, like
 * everyone else (plan 2026-11-26-001, Unit 2; origin R26).
 *
 * The link is single-use, lasts 7 days, opens the same confirm page as every
 * sign-in link, and is shown to the admin once (only its hash is stored). It
 * cannot be made for an admin address, and who made it is recorded on the
 * token and in the admin log.
 */
export type PilotResult = { ok: true; link: string; userId: string } | { ok: false; reason: "invalid" | "admin_address" | "already_signed_up" };

export async function createPilotLink(
  q: Query,
  o: { email: string; name: string; createdBy: string },
  now = new Date(),
): Promise<PilotResult> {
  const email = normaliseEmail(o.email);
  const name = o.name.trim().slice(0, 80);
  if (!isEmail(email) || !name) return { ok: false, reason: "invalid" };
  if (adminEmails().includes(email)) return { ok: false, reason: "admin_address" };

  const rows = await q<{ id: string; status: string; created: boolean; pending_referrer_id: string | null }>(
    // pending_referrer_id: a guest invitation's inviter, kept with the new account so a failed attribution is retried hourly (B2 Unit 3).
    `insert into users (email, name, path, signup_step, created_by, pending_referrer_id) values ($1, $2, 'running', 'plan', $3,
       (select r.referrer_id from referrals r where r.stage = 'invited' and r.referred_user_id is null and lower(r.referred_email) = $4 order by r.created_at, r.id limit 1))
     on conflict (email) do update set email = excluded.email
     returning id, status, (xmax = 0) as created, pending_referrer_id`,
    [email, name, o.createdBy, referralEmailKey(email)],
  );
  const user = rows[0];
  if (user.status !== "signup") return { ok: false, reason: "already_signed_up" };
  // A pilot account has no cookie to read: only a guest invitation for this address can name its referrer.
  if (user.created && user.pending_referrer_id) await applyReferralSafely(q, { userId: user.id, email, referrer: null, now });

  const token = await issueToken(q, { email, purpose: "pilot", userId: user.id, nextPath: "/start/plan", createdBy: o.createdBy }, now);
  await logAdminAction(q, { by: o.createdBy, userId: user.id, action: "pilot_link", detail: { email } });
  return { ok: true, link: appUrl(`/auth/confirm?t=${encodeURIComponent(token)}`), userId: user.id };
}

/** Ends every unused pilot link for a user. */
export async function revokePilotLinks(q: Query, userId: string): Promise<number> {
  const rows = await q(`update login_tokens set revoked_at = now() where user_id = $1 and purpose = 'pilot' and used_at is null and revoked_at is null returning 1`, [userId]);
  return rows.length;
}
