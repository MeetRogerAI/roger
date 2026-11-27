import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, type MailDeps } from "@/lib/mail/send";
import { CreditBusy } from "./credit-balance";
import { adminUserUrl } from "./credit-post";
import { referrerForCode } from "./code";
import { readRefCookie, refKey, type RefPurpose } from "./cookie";

/**
 * Referral attribution (spec B.15, B2 plan Unit 3).
 *
 * The referrer is resolved when the sign-up link is requested (the browser
 * that visited /r has the cookie; the email link is often opened on another
 * device, and `userForToken` has no cookies), and travels in `NewAccount`
 * next to `ref`. A sponsor code (Unit 10) travels in its own `NewAccount`
 * field, never as a Referrer.
 *
 * Every path that creates an account (the email sign-up link, Google
 * sign-up, an admin's pilot account) writes the resolved referrer into
 * `users.pending_referrer_id` in the same insert, then calls
 * `applyReferralSafely` on the newly created row only. If that fails, the
 * hourly `referral_pending` task finishes it (`retryPendingReferrals`).
 *
 * Attribution runs even while `v3.referralsOn` is off, by design: links
 * shared before launch still count, and credit waits for the switch (B2 plan,
 * Key Technical Decisions).
 */
export type Referrer = { id: string; via: RefPurpose };

/** The referrer named by this browser's `roger-ref` cookie, if it is valid and its code still belongs to a member. */
export async function resolveReferrer(q: Query, raw: string | undefined | null, now: Date, key: string | null = refKey()): Promise<Referrer | null> {
  const c = readRefCookie(raw, key, now);
  if (!c) return null;
  const r = await referrerForCode(q, c.code);
  return r ? { id: r.id, via: c.purpose } : null;
}

/**
 * The form an address is compared in for self-referral, and stored in for a
 * guest's invitation (`referrals.referred_email`): lower-cased, any plus-tag
 * dropped, and for Gmail the dots in the name dropped too (googlemail.com is
 * the same mailbox as gmail.com).
 */
export function referralEmailKey(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

/**
 * SQL: the referral row `alias` is an open guest invitation for the address
 * whose `referralEmailKey` is in parameter `keyParam`: still `invited`, not
 * linked to an account. The one predicate attribution and the session
 * invitations (`recordInvitedReferral`) share.
 */
export const INVITED_FOR_ADDRESS_SQL = (alias: string, keyParam: string) =>
  `${alias}.stage = 'invited' and ${alias}.referred_user_id is null and lower(${alias}.referred_email) = ${keyParam}`;

/** The domains an address key may be stored under (gmail.com and googlemail.com are one mailbox). */
export function keyDomains(key: string): string[] {
  const domain = key.slice(key.lastIndexOf("@") + 1);
  return domain === "gmail.com" ? ["gmail.com", "googlemail.com"] : [domain];
}

/** Whether an account exists for this address, compared by `referralEmailKey` (dots and plus-tags don't make a new person). */
export async function accountForAddress(q: Query, email: string): Promise<boolean> {
  const key = referralEmailKey(email);
  const rows = await q<{ email: string }>(`select email from users where lower(split_part(email, '@', 2)) = any($1::text[])`, [keyDomains(key)]);
  return rows.some((r) => referralEmailKey(r.email) === key);
}

/**
 * The `invited` referral row for a guest a member invited (B2 Unit 9),
 * made once per (member, address) and reused after that; null when the
 * address already has an account (attribution only ever runs for new
 * accounts, so such a row could never link). Idempotent: safe to call again
 * after a failure, from the invitation and from its re-send.
 */
export async function recordInvitedReferral(q: Query, o: { referrerId: string; email: string; at: Date }): Promise<string | null> {
  if (await accountForAddress(q, o.email)) return null;
  const key = referralEmailKey(o.email);
  const [r] = await q<{ id: string }>(
    `with r as (
       insert into referrals (referrer_id, referred_email, source, stage, created_at)
       values ($1, $2, 'guest', 'invited', $3::timestamptz)
       on conflict do nothing
       returning id
     )
     select id from r
     union all
     (select id from referrals x where x.referrer_id = $1 and ${INVITED_FOR_ADDRESS_SQL("x", "$2")} order by x.created_at, x.id limit 1)
     limit 1`,
    [o.referrerId, key, o.at.toISOString()],
  );
  return r?.id ?? null;
}

export type ReferralOutcome = "attributed" | "self" | "none";

/**
 * Records who referred a newly created account. First referrer wins:
 * `users.referred_by` is set only while empty, and the referral row is written
 * in the same statement, gated on that write.
 *
 * Who counts, in order (decided in the Unit 3 review): an open guest
 * invitation for this exact address (oldest first), then the cookie's
 * referrer. So a person A invited who arrives through B's link is A's, and B
 * gets no row; a `guest` cookie from the same inviter agrees with the
 * invitation. A candidate is refused when it is the same account or the same
 * address (`referralEmailKey`), and the next one is tried.
 *
 * The chosen referrer's `invited` row for this address, if any, moves to
 * `trial` and loses its email; otherwise a `trial` row is inserted. A linked
 * row never keeps an email. Any definite answer (attributed, refused, nobody)
 * clears `pending_referrer_id`; an error leaves it for the hourly retry.
 *
 * Call it only for an account this request created: an existing member
 * signing in again never gets a referral.
 */
export async function applyReferral(q: Query, o: { userId: string; email: string; referrer: Referrer | null | undefined; now: Date }): Promise<ReferralOutcome> {
  const outcome = await attribute(q, o);
  await q(`update users set pending_referrer_id = null where id = $1 and pending_referrer_id is not null`, [o.userId]);
  return outcome;
}

async function attribute(q: Query, o: { userId: string; email: string; referrer: Referrer | null | undefined; now: Date }): Promise<ReferralOutcome> {
  const key = referralEmailKey(o.email);
  const candidates: { id: string; email: string; via: RefPurpose }[] = (
    await q<{ id: string; email: string }>(
      `select u.id, u.email from referrals r join users u on u.id = r.referrer_id
       where ${INVITED_FOR_ADDRESS_SQL("r", "$1")}
       order by r.created_at, r.id limit 5`,
      [key],
    )
  ).map((r) => ({ ...r, via: "guest" as const }));
  if (o.referrer?.id) {
    const [r] = await q<{ id: string; email: string }>(`select id, email from users where id = $1`, [o.referrer.id]);
    if (r) candidates.push({ ...r, via: o.referrer.via });
  }
  if (!candidates.length) return "none";

  const isSelf = (c: { id: string; email: string }) => c.id === o.userId || referralEmailKey(c.email) === key;
  const chosen = candidates.find((c) => !isSelf(c));
  if (!chosen) return "self";

  const at = o.now.toISOString();
  const [r] = await q<{ set: boolean }>(
    `with u as (
       update users set referred_by = $2
       where id = $1 and referred_by is null and id <> $2 and exists (select 1 from users x where x.id = $2)
       returning id
     ),
     p as (
       update referrals set referred_user_id = $1, referred_email = null, stage = 'trial', trial_at = $4
       where id = (
           select id from referrals
           where referrer_id = $2 and ${INVITED_FOR_ADDRESS_SQL("referrals", "$3")}
           order by created_at, id limit 1)
         and exists (select 1 from u)
       returning id
     ),
     i as (
       insert into referrals (referrer_id, referred_user_id, source, stage, trial_at, created_at)
       select $2, $1, $5, 'trial', $4, $4 from u
       where not exists (select 1 from p)
       on conflict do nothing
       returning id
     )
     select exists (select 1 from u) as set`,
    [o.userId, chosen.id, key, at, chosen.via],
  );
  return r?.set ? "attributed" : "none";
}

/**
 * `applyReferral` for the account-creating paths: tried twice at once, then
 * left to the hourly retry (`pending_referrer_id` stays set). A failure is
 * logged and never stops the sign-up or sign-in it rides on.
 */
export async function applyReferralSafely(q: Query, o: Parameters<typeof applyReferral>[1]): Promise<ReferralOutcome | "failed"> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await applyReferral(q, o);
    } catch (e) {
      if (attempt < 2) continue;
      console.error("[referrals] attribution failed; the hourly pass retries it", { userId: o.userId, message: (e as Error)?.message });
      return "failed";
    }
  }
}

/** Failed passes after which a pending referral is no longer retried (admins are told once). */
export const REFERRAL_RETRY_ATTEMPTS = 5;

/**
 * The hourly `referral_pending` task: attribution for every account whose
 * first attempt failed. Safe to overlap with itself or a sign-up: every write
 * is guarded (`referred_by` set only while empty, one referral per account by
 * its unique index), so a second run changes nothing. Bounded per pass.
 * The cookie's purpose is not kept, so a retried row with no invitation is a
 * `link` referral.
 *
 * A row that fails counts an attempt (`pending_referrer_attempts`); after
 * REFERRAL_RETRY_ATTEMPTS it is no longer picked, so rows that keep failing
 * cannot starve newer ones.
 *
 * `grant` (B2 Unit 4, late attribution): a referral recorded here may come
 * after the member's first invoice was paid, so the grant is attempted for
 * every account attributed (the same idempotent path as `invoice.paid`). A
 * grant failure is logged and left to the hourly `referral_late_grants`
 * sweep (which retries it, up to a cap); the attribution stands.
 */
export async function retryPendingReferrals(
  q: Query,
  now: Date,
  limit = 200,
  o: { grant?: (userId: string) => Promise<unknown>; mail?: MailDeps; deadline?: number; clock?: () => number } = {},
): Promise<{ done: number; failed: number }> {
  const rows = await q<{ id: string; email: string; pending_referrer_id: string }>(
    `select id, email, pending_referrer_id from users
     where pending_referrer_id is not null and pending_referrer_attempts < $2
     order by created_at limit $1`,
    [limit, REFERRAL_RETRY_ATTEMPTS],
  );
  let done = 0;
  let failed = 0;
  for (const u of rows) {
    // The hourly pass's deadline (each row may call Stripe for a late grant): what is left waits for the next pass.
    if (o.deadline != null && (o.clock ?? Date.now)() >= o.deadline) break;
    let outcome: ReferralOutcome;
    try {
      outcome = await applyReferral(q, { userId: u.id, email: u.email, referrer: { id: u.pending_referrer_id, via: "link" }, now });
      done++;
    } catch (e) {
      failed++;
      console.error("[referrals] pending attribution failed again", { userId: u.id, message: (e as Error)?.message });
      // Busy is not a failure of this row: retried next pass without counting toward the cap.
      if (e instanceof CreditBusy) continue;
      const [a] = await q<{ attempts: number }>(
        `update users set pending_referrer_attempts = pending_referrer_attempts + 1 where id = $1 returning pending_referrer_attempts as attempts`,
        [u.id],
      ).catch(() => []);
      if (a && a.attempts >= REFERRAL_RETRY_ATTEMPTS) {
        await alertAdmins(
          "referral_pending_gave_up",
          u.id,
          adminAlert("A referral could not be recorded", [
            `Member ${u.id} was referred by ${u.pending_referrer_id}, but recording it failed ${a.attempts} times. It is no longer retried.`,
            `Last error: ${(e as Error)?.message ?? "unknown"}`,
            adminUserUrl(u.id),
          ]),
          { ...o.mail, query: q },
        ).catch(() => {});
      }
      continue;
    }
    if (outcome === "attributed" && o.grant) {
      await o.grant(u.id).catch((e) => console.error("[referrals] grant after late attribution failed", { userId: u.id, message: (e as Error)?.message }));
    }
  }
  return { done, failed };
}
