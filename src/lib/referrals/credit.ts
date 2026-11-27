import type { Query } from "@/lib/db-query";
import { OPEN_DISPUTE_STATUSES, type PaidInvoice } from "@/lib/billing/gateway";
import type { Currency } from "@/lib/billing/prices";
import { adminAlert, alertAdmins } from "@/lib/mail/send";
import { CreditBusy, withBalanceLease } from "./credit-balance";
import { grantCents, pastDeadline, sqlList, UNPOSTED, type CreditDeps, type CreditStatus } from "./credit-money";
import { adminUserUrl, notifyGrant, postCredit } from "./credit-post";
import { syncReversals } from "./credit-reversal";

/**
 * Referral credit grants (spec B.15, B2 plan Unit 4, origin R7): one
 * mechanism, the Stripe customer balance, and the `credits` ledger as its
 * record. A referral earns one grant, on the referred member's first paid
 * subscription invoice with a value above 0, from `invoice.paid` (and its
 * reconcile replay), from a referral recorded late, and from the hourly
 * late-grant sweep. Posting is credit-post.ts; clawback, disputes and lapse
 * are credit-reversal.ts; the money rules are credit-money.ts.
 */

export type GrantOutcome = "granted" | "replayed" | "none" | "void" | "no_referrer";

/**
 * `invoice.paid`: the invoice is read again from Stripe, and its customer's
 * referral earns its grant. Most invoices are not a referred member's: the
 * event's customer is checked first, with no Stripe call.
 */
export async function grantForInvoice(q: Query, d: CreditDeps, invoiceId: string, customerHint?: string | null): Promise<GrantOutcome> {
  if (customerHint) {
    const [x] = await q<{ n: number }>(
      `select count(*)::int as n from referrals r join users u on u.id = r.referred_user_id where u.stripe_customer = $1 and r.stage in ('trial', 'paying')`,
      [customerHint],
    );
    if (!x?.n) return "none";
  }
  const inv = await d.credits.paidInvoice(invoiceId);
  if (!inv?.customer || inv.status !== "paid") return "none";
  const [u] = await q<{ id: string }>(`select id from users where stripe_customer = $1`, [inv.customer]);
  if (!u) return "none";
  return grantFor(q, d, u.id, inv);
}

/**
 * A referral recorded after the referred member's first invoice was paid (a
 * late attribution): the member's paid invoices are read back and the first
 * subscription invoice with a value above 0 earns the grant, through the same
 * idempotent path.
 */
export async function grantForReferredUser(q: Query, d: CreditDeps, userId: string): Promise<GrantOutcome> {
  const [u] = await q<{ customer: string | null; trial: boolean }>(
    `select u.stripe_customer as customer, exists (select 1 from referrals r where r.referred_user_id = u.id and r.stage = 'trial') as trial from users u where u.id = $1`,
    [userId],
  );
  if (!u?.customer || !u.trial) return "none";
  const inv = (await d.credits.paidInvoices(u.customer)).find((i) => i.subscription && i.totalExcludingTax > 0 && i.currency);
  return inv ? grantFor(q, d, userId, inv) : "none";
}

/**
 * The move to `paying` and the grant, in one statement (Neon over HTTP has no
 * transactions), run under the referrer's balance lease so two grants never
 * consume the same shortfall. `r` re-checks everything the grant depends on:
 * the referral is still `trial`, the referrer exists and is not closed, the
 * referred member is not sponsored, and the two are not on the same card (a
 * member with no stored fingerprint cannot be checked; accepted). `s` moves
 * the stage, and the grant is inserted only from `s`, less what the referrer
 * still owes from earlier clawbacks (`offset_cents`; a lapsed grant offsets
 * nothing). What is owed: every clawback's `uncollected_cents`, less the
 * offsets of grants that really paid it off. A grant that lapsed before
 * posting (closed, sponsored) repaid nothing, so its offset is owed again;
 * one clawed back to nothing already recorded the offset part it gave back
 * as its clawback's `uncollected_cents`, so its offset still counts.
 *
 * $1 referral, $2 job clock, $3 invoice id, $4 payment intent, $5 gross
 * cents, $6 currency, $7 status, $8 reason.
 */
export const GRANT_SQL = `
with r as (
  select r.id, r.referrer_id from referrals r
  join users a on a.id = r.referrer_id
  join users b on b.id = r.referred_user_id
  where r.id = $1 and r.stage = 'trial' and a.status <> 'closed' and b.sponsor_id is null
    and not (a.card_fingerprint is not null and a.card_fingerprint = b.card_fingerprint)
),
s as (
  update referrals x set stage = 'paying', paying_at = $2::timestamptz
  from r where x.id = r.id and x.stage = 'trial'
  returning x.id, x.referrer_id
),
owed as (
  select case when $7 = 'lapsed' then 0
    else least($5::int, greatest(0,
      coalesce(sum(c.uncollected_cents) filter (where c.kind = 'clawback'), 0)
      - coalesce(sum(c.offset_cents) filter (where c.kind = 'grant' and (c.status <> 'lapsed' or c.reason = 'clawed_back')), 0)))::int end as n
  from credits c where c.user_id = (select referrer_id from s) and c.currency = $6
),
ins as (
  insert into credits (user_id, referral_id, kind, amount_cents, offset_cents, currency, status, reason, source_payment_intent, source_object_id, created_at, updated_at)
  select s.referrer_id, s.id, 'grant', $5::int - owed.n, owed.n, $6, $7, $8, $4, $3, $2::timestamptz, $2::timestamptz
  from s, owed
  on conflict do nothing
  returning id
)
select (select id from ins) as id`;

async function grantFor(q: Query, d: CreditDeps, referredId: string, inv: PaidInvoice): Promise<GrantOutcome> {
  // Only a subscription invoice (the monthly plan) earns credit.
  if (!inv.subscription) return "none";
  const [f] = await q<{
    id: string;
    stage: string;
    referrer_id: string | null;
    referred_sponsored: boolean;
    referrer_status: string | null;
    referrer_sponsored: boolean;
    referrer_currency: Currency | null;
    same_card: boolean;
    grant_id: string | null;
  }>(
    `select r.id, r.stage, r.referrer_id, b.sponsor_id is not null as referred_sponsored,
       a.status as referrer_status, coalesce(a.sponsor_id is not null, false) as referrer_sponsored, a.currency as referrer_currency,
       coalesce(a.card_fingerprint is not null and a.card_fingerprint = b.card_fingerprint, false) as same_card,
       (select c.id from credits c where c.referral_id = r.id and c.kind = 'grant') as grant_id
     from referrals r join users b on b.id = r.referred_user_id left join users a on a.id = r.referrer_id
     where r.referred_user_id = $1`,
    [referredId],
  );
  if (!f) return "none";
  // Already granted (a replay, or a later invoice): only what is left to do, posting and the email.
  if (f.grant_id) {
    await postCredit(q, d, f.grant_id);
    await notifyGrant(q, d, f.grant_id);
    return "replayed";
  }
  if (f.stage !== "trial") return "none";
  // A 100%-off invoice earns nothing, and leaves the referral waiting for the next invoice above 0.
  if (inv.totalExcludingTax <= 0 || !inv.currency) return "none";
  // A sponsored member never pays, so never earns their referrer anything.
  if (f.referred_sponsored) return "none";
  const at = d.now.toISOString();
  if (f.same_card) {
    await q(`update referrals set stage = 'void', void_reason = 'same_card', voided_at = $2 where id = $1 and stage = 'trial'`, [f.id, at]);
    return "void";
  }
  if (!f.referrer_id || f.referrer_status === "closed") {
    // Paying, but nobody to credit: the referrer was deleted or has closed their account.
    await q(`update referrals set stage = 'paying', paying_at = $2 where id = $1 and stage = 'trial'`, [f.id, at]);
    return "no_referrer";
  }
  // A referrer with no card yet has no fixed currency: the grant is kept in the invoice's, and converted when it posts.
  const currency = f.referrer_currency ?? inv.currency;
  const gross = grantCents(d.settings, { totalExcludingTax: inv.totalExcludingTax, currency: inv.currency }, currency);
  let status: CreditStatus = f.referrer_sponsored ? "lapsed" : d.settings.referralsOn ? "pending_customer" : "pending_switch";
  let reason: string | null = f.referrer_sponsored ? "sponsored" : null;
  if (status !== "lapsed" && inv.paymentIntent) {
    const open = (await d.credits.disputesFor(inv.paymentIntent)).find((x) => OPEN_DISPUTE_STATUSES.includes(x.status));
    if (open) {
      status = "frozen";
      reason = `dispute:${open.id}`;
    }
  }
  const referrer = f.referrer_id;
  const r = await withBalanceLease(q, d, referrer, async (ld) => {
    const [ins] = await q<{ id: string | null }>(GRANT_SQL, [f.id, at, inv.id, inv.paymentIntent, gross, currency, status, reason]);
    const [g] = await q<{ id: string }>(`select id from credits where referral_id = $1 and kind = 'grant'`, [f.id]);
    if (!g) return { created: false, grant: null };
    // A refund or lost dispute that came before this grant reduces it now, before it can post.
    if (inv.paymentIntent) await syncReversals(q, ld, g.id, inv.amountPaid);
    await postCredit(q, ld, g.id);
    return { created: Boolean(ins?.id), grant: g.id };
  });
  if (r.grant) await notifyGrant(q, d, r.grant);
  return r.created ? "granted" : r.grant ? "replayed" : "none";
}

/** Failed looks after which the late-grant sweep stops trying a referral (admins are told once). */
export const LATE_GRANT_ATTEMPTS = 5;

/**
 * The hourly late-grant sweep: a referral still in `trial` whose member has
 * evidently paid (active, held or cancelled, or charged once) and has no
 * grant, because its `invoice.paid` came before the referral was recorded or
 * the grant attempted then failed. Each look is stamped; one that found
 * nothing waits a day, one that failed is tried again next hour, up to
 * LATE_GRANT_ATTEMPTS. Stops at the caller's deadline (`d.deadline`).
 */
export async function grantLateReferrals(q: Query, d: CreditDeps, limit = 50): Promise<{ granted: number; none: number; failed: number; busy: number }> {
  const out = { granted: 0, none: 0, failed: 0, busy: 0 };
  const at = d.now.toISOString();
  const rows = await q<{ id: string; user_id: string }>(
    `select r.id, r.referred_user_id as user_id from referrals r join users b on b.id = r.referred_user_id
     where r.stage = 'trial' and b.stripe_customer is not null and b.sponsor_id is null
       and (b.status in ('active', 'held', 'cancelled') or b.first_charge_at is not null)
       and r.grant_attempts < $2
       and not exists (select 1 from credits c where c.referral_id = r.id and c.kind = 'grant')
       and (r.grant_checked_at is null
         or r.grant_checked_at < $1::timestamptz - case when r.grant_attempts > 0 then interval '50 minutes' else interval '1 day' end)
     order by r.grant_checked_at nulls first, r.created_at, r.id limit $3`,
    [at, LATE_GRANT_ATTEMPTS, limit],
  );
  for (const r of rows) {
    if (pastDeadline(d)) break;
    try {
      const o = await grantForReferredUser(q, d, r.user_id);
      if (o === "granted" || o === "replayed") out.granted++;
      else out.none++;
      await q(`update referrals set grant_checked_at = $2 where id = $1`, [r.id, at]);
    } catch (e) {
      // Busy (another change to the referrer's credit) is not a failure: the next pass tries again, uncounted.
      if (e instanceof CreditBusy) {
        out.busy++;
        continue;
      }
      out.failed++;
      console.error("[credits] late grant failed; the next pass retries it", r.id, e instanceof Error ? e.message : e);
      const [a] = await q<{ n: number }>(`update referrals set grant_attempts = grant_attempts + 1, grant_checked_at = $2 where id = $1 returning grant_attempts as n`, [
        r.id,
        at,
      ]).catch(() => []);
      if (a && a.n >= LATE_GRANT_ATTEMPTS) {
        await alertAdmins(
          "credit_late_grant_gave_up",
          r.id,
          adminAlert("A referral credit could not be granted", [
            `Referral ${r.id}, member ${r.user_id}: granting failed ${a.n} times and is no longer retried.`,
            `Last error: ${e instanceof Error ? e.message : String(e)}`,
            adminUserUrl(r.user_id),
          ]),
          { ...d, query: d.query ?? q },
        ).catch(() => {});
      }
    }
  }
  return out;
}

/** SQL: the account `alias` has credit rows still settling (pending, waiting for the switch, or frozen by a dispute). */
export const UNSETTLED_CREDIT_SQL = (alias = "u") => `exists (select 1 from credits c where c.user_id = ${alias}.id and c.status in (${sqlList(UNPOSTED)}))`;
