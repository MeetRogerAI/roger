import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, type MailDeps } from "@/lib/mail/send";
import { adminUserUrl } from "./credit-post";

/**
 * Referral stages (B2 plan Unit 3): `invited` (a guest, Unit 9) → `trial`
 * (account created, `applyReferral`) → `paying` (first paid invoice, Unit 4),
 * or `void` with a reason. The transitions here are the ones that void.
 */
export type ReferralStage = "invited" | "trial" | "paying" | "void";

export const stageLabel: Record<ReferralStage, string> = {
  invited: "Invited",
  trial: "In trial",
  paying: "Paying",
  void: "Not counted",
};

/**
 * Self-referral by card: when a member's saved card has the same fingerprint
 * as the other side of one of their referrals (their referrer, or someone
 * they referred), that referral is void and earns nothing. Run after every
 * card save and card update; idempotent.
 *
 * Only before payment (`invited`, `trial`). A `paying` referral has earned
 * its credit, so its stage stays and both admins are told once (keyed by the
 * referral) to look at it.
 */
export async function voidSameCardReferrals(q: Query, userId: string, now: Date, mail: MailDeps = {}): Promise<number> {
  const sameCard = `a.id = r.referrer_id and b.id = r.referred_user_id and (a.id = $1 or b.id = $1)
     and a.card_fingerprint is not null and a.card_fingerprint = b.card_fingerprint`;
  const voided = await q(
    `update referrals r set stage = 'void', void_reason = 'same_card', voided_at = $2
     from users a, users b
     where ${sameCard} and r.stage in ('invited', 'trial')
     returning r.id`,
    [userId, now.toISOString()],
  );
  const paid = await q<{ id: string; referrer_id: string; referred_user_id: string }>(
    `select r.id, r.referrer_id, r.referred_user_id from referrals r, users a, users b where ${sameCard} and r.stage = 'paying'`,
    [userId],
  );
  for (const r of paid) {
    await alertAdmins(
      "referral_paid_same_card",
      r.id,
      adminAlert("A paid referral shares a card with its referrer", [
        `Referral ${r.id}: member ${r.referred_user_id} was referred by ${r.referrer_id}, and both now have the same card saved.`,
        "It is already paying, so it was left as it is. Check whether the credit should stand.",
        `Referrer: ${adminUserUrl(r.referrer_id)}`,
        `Referred member: ${adminUserUrl(r.referred_user_id)}`,
      ]),
      { ...mail, query: q },
    ).catch((e) => console.error("[referrals] same-card alert not sent", (e as Error)?.message));
  }
  return voided.length;
}

/**
 * A referred account that was deleted before paying: its referral row stays
 * (credits point at it) but loses its user through the foreign key, so it is
 * voided. A `trial` row with no user can only mean that. A `paying` row keeps
 * its stage: the credit was earned. Idempotent, and catches up on any
 * deletion it did not see.
 */
export async function voidDeletedReferrals(q: Query, now: Date): Promise<number> {
  const rows = await q(
    `update referrals set stage = 'void', void_reason = 'account_deleted', voided_at = $1
     where referred_user_id is null and stage = 'trial'
     returning id`,
    [now.toISOString()],
  );
  return rows.length;
}

/**
 * One line on /app/referrals. Never an address, and never a name the
 * referred person typed: a link referral is "Someone you invited", a guest
 * is shown by the name the member gave when inviting them.
 */
export type ReferralLine = { id: string; who: string; stage: ReferralStage };

export async function referralsFor(q: Query, referrerId: string): Promise<ReferralLine[]> {
  const rows = await q<{ id: string; source: "link" | "guest"; stage: ReferralStage; guest_name: string | null }>(
    `select r.id, r.source, r.stage,
       (select g.name from session_guests g where g.referral_id = r.id and g.inviter_id = r.referrer_id order by g.created_at desc limit 1) as guest_name
     from referrals r
     where r.referrer_id = $1
     order by r.created_at desc, r.id
     limit 200`,
    [referrerId],
  );
  return rows.map((r) => ({
    id: r.id,
    who: r.source === "guest" ? r.guest_name?.trim() || "A guest you invited" : "Someone you invited",
    stage: r.stage,
  }));
}
