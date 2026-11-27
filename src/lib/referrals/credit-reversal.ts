import type { Query } from "@/lib/db-query";
import { OPEN_DISPUTE_STATUSES, sortByCreated } from "@/lib/billing/gateway";
import { CLOSED_NO_CARD } from "@/lib/billing/no-card";
import { moneyCents } from "@/lib/billing/prices";
import { adminAlert, alertAdmins } from "@/lib/mail/send";
import { takeableCredit, withBalanceLease } from "./credit-balance";
import { ACCESS_ENDED_SQL, CLOSE_KEY_SQL, clawCents, grantForPayment, loadCredit, pastDeadline, sqlList, UNPOSTED, WAITING, type CreditDeps } from "./credit-money";
import { adminUserUrl, notifyGrant, postCredit } from "./credit-post";

/**
 * What reverses referral credit (B2 plan Unit 4, origin R8–R9): refunds and
 * lost disputes on the payment a grant was earned on (clawback), disputes
 * still open (freeze), and closing the referrer's account (lapse). Every
 * change to a member's credit runs under their balance lease.
 */

/**
 * Brings a grant in line with every reversal Stripe has on its payment:
 * each succeeded refund and each lost dispute, oldest first, makes one
 * clawback keyed by its id, sized by the share of the payment reversed up
 * to and including it (a partial dispute counts its own amount). One already
 * recorded is only posted if it is still waiting. Used by the refund and
 * dispute events and when a grant is created (a reversal that came first).
 * `paid` is what the payment charged. The caller holds the member's lease.
 */
export async function syncReversals(q: Query, d: CreditDeps, grantId: string, paid: number): Promise<number> {
  const g = await loadCredit(q, grantId);
  const pi = g?.source_payment_intent;
  if (!g || !pi) return 0;
  const [refunds, disputes] = await Promise.all([d.credits.refundsFor(pi), d.credits.disputesFor(pi)]);
  const reversals = sortByCreated([
    ...refunds.filter((r) => r.status === "succeeded").map((r) => ({ id: r.id, amount: r.amount, created: r.created, why: "refund" as const })),
    ...disputes.filter((x) => x.status === "lost").map((x) => ({ id: x.id, amount: x.amount, created: x.created, why: "dispute_lost" as const })),
  ]);
  let reversed = 0;
  let n = 0;
  for (const r of reversals) {
    reversed += r.amount;
    const [existing] = await q<{ id: string }>(`select id from credits where kind = 'clawback' and source_object_id = $1`, [r.id]);
    if (existing) {
      await postCredit(q, d, existing.id);
      await alertClawback(q, d, existing.id);
      continue;
    }
    if (await clawbackOne(q, d, grantId, { sourceId: r.id, reversed: Math.min(reversed, paid), paid, why: r.why })) n++;
  }
  return n;
}

/**
 * The unposted-grant clawback, one statement: `chk` finds the reversal not
 * recorded yet, `upd` reduces the grant only if it is still unposted with the
 * amount read (lapsed at 0), and the clawback row is inserted from `upd`, so
 * it exists only when the grant really was reduced.
 * $1 grant, $2 reduce by, $3 amount read, $4 job clock, $5 claw, $6
 * uncollected, $7 reason, $8 source id.
 */
export const REDUCE_UNPOSTED_SQL = `
with chk as (select not exists (select 1 from credits where kind = 'clawback' and source_object_id = $8) as free),
upd as (
  update credits set amount_cents = amount_cents - $2::int,
    status = case when amount_cents - $2::int = 0 then 'lapsed' else status end,
    reason = case when amount_cents - $2::int = 0 then 'clawed_back' else reason end,
    updated_at = $4::timestamptz
  where id = $1 and status in (${sqlList(UNPOSTED)}) and amount_cents = $3::int and (select free from chk)
  returning id, user_id, referral_id, currency, source_payment_intent
),
ins as (
  insert into credits (user_id, referral_id, kind, amount_cents, uncollected_cents, currency, status, reason, source_payment_intent, source_object_id, created_at, updated_at, posted_at)
  select upd.user_id, upd.referral_id, 'clawback', $5::int, $6::int, upd.currency, 'posted', $7, upd.source_payment_intent, $8, $4::timestamptz, $4::timestamptz, $4::timestamptz
  from upd
  on conflict do nothing
  returning id
)
select (select id from ins) as id`;

/**
 * One clawback (see `clawCents`). A grant not posted yet is reduced in
 * place, with the clawback recording it and nothing to post; if it was posted
 * meanwhile, the posted branch runs instead. A posted grant gets a positive
 * balance transaction capped at the credit that can be taken
 * (`takeableCredit`: the Stripe balance, never more than the ledger's), so
 * the balance never becomes a debt; the rest is `uncollected_cents`, offset
 * against the referrer's next grant. A grant lapsed for any other reason
 * (sponsored, closed) gave nothing, so takes nothing.
 */
async function clawbackOne(q: Query, d: CreditDeps, grantId: string, o: { sourceId: string; reversed: number; paid: number; why: "refund" | "dispute_lost" }): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await loadCredit(q, grantId);
    if (!g || (g.status === "lapsed" && g.reason !== "clawed_back")) return false;
    const [s] = await q<{ taken: number; reduced: number }>(
      `select coalesce(sum(amount_cents), 0)::int as taken,
         coalesce(sum(amount_cents - uncollected_cents) filter (where reason like 'unposted_grant%'), 0)::int as reduced
       from credits where kind = 'clawback' and source_payment_intent = $1`,
      [g.source_payment_intent],
    );
    const gross = g.amount_cents + g.offset_cents + s.reduced;
    const claw = clawCents({ gross, taken: s.taken, reversed: o.reversed, paid: o.paid });
    if (claw === 0) return false;
    const at = d.now.toISOString();
    let id: string | undefined;
    if (g.status === "posted") {
      const [u] = g.user_id ? await q<{ customer: string | null }>(`select stripe_customer as customer from users where id = $1`, [g.user_id]) : [];
      const available = g.user_id && u?.customer ? await takeableCredit(q, d, g.user_id, u.customer) : 0;
      const uncollected = claw - Math.min(claw, available);
      id = (
        await q<{ id: string }>(
          `insert into credits (user_id, referral_id, kind, amount_cents, uncollected_cents, currency, status, reason, source_payment_intent, source_object_id, created_at, updated_at)
           select $1, $2, 'clawback', $3, $4, $5, 'pending_customer', $6, $7, $8, $9::timestamptz, $9::timestamptz
           where not exists (select 1 from credits where kind = 'clawback' and source_object_id = $8)
           on conflict do nothing returning id`,
          [g.user_id, g.referral_id, claw, uncollected, g.currency, o.why, g.source_payment_intent, o.sourceId, at],
        )
      )[0]?.id;
      if (id) await postCredit(q, d, id);
    } else {
      // A claw beyond what is left of the grant (the part that paid off earlier shortfalls) is owed again, as uncollected.
      const reduce = Math.min(claw, g.amount_cents);
      id = (await q<{ id: string | null }>(REDUCE_UNPOSTED_SQL, [g.id, reduce, g.amount_cents, at, claw, claw - reduce, `unposted_grant:${o.why}`, o.sourceId]))[0]?.id ?? undefined;
      // Posted (or changed) between the read and the update: read it again and take the right branch.
      if (!id) continue;
    }
    if (id) await alertClawback(q, d, id);
    return Boolean(id);
  }
  return false;
}

async function alertClawback(q: Query, d: CreditDeps, id: string): Promise<void> {
  const r = await loadCredit(q, id);
  if (!r) return;
  const short = r.uncollected_cents > 0 ? ` ${moneyCents(r.uncollected_cents, r.currency)} could not be taken from the balance; it comes off their next referral credit.` : "";
  await alertAdmins(
    "credit_clawback",
    id,
    adminAlert("A referral credit was clawed back", [
      `Member ${r.user_id ?? "(deleted)"}, ledger row ${id}: ${moneyCents(r.amount_cents, r.currency)} taken back after a ${r.reason?.includes("dispute") ? "lost dispute" : "refund"} on ${r.source_payment_intent}.${short}`,
      adminUserUrl(r.user_id),
    ]),
    { ...d, query: d.query ?? q },
  ).catch(() => {});
}

/** `charge.refunded`: the credited payment's refunds are brought into the ledger. A refund on any other payment does nothing. */
export async function clawbackForRefunds(q: Query, d: CreditDeps, chargeId: string): Promise<number> {
  const ch = await d.credits.charge(chargeId);
  if (!ch?.paymentIntent) return 0;
  const g = await grantForPayment(q, ch.paymentIntent);
  if (!g) return 0;
  return withBalanceLease(q, d, g.user_id, (ld) => syncReversals(q, ld, g.id, ch.amount));
}

/**
 * `charge.dispute.created` and `.closed`: a lost dispute claws back (its own
 * amount's share); then, while any dispute on the payment is still open, the
 * grant stays frozen under that dispute (frozen if it was waiting), and once
 * none is open a frozen grant is released and posted.
 */
export async function creditsForDispute(q: Query, d: CreditDeps, disputeId: string): Promise<"frozen" | "clawed_back" | "unfrozen" | "none"> {
  const dp = await d.credits.dispute(disputeId);
  if (!dp) return "none";
  const ch = dp.charge ? await d.credits.charge(dp.charge) : null;
  const pi = dp.paymentIntent ?? ch?.paymentIntent ?? null;
  if (!pi) return "none";
  const g = await grantForPayment(q, pi);
  if (!g) return "none";
  const paid = ch?.amount ?? dp.amount;
  const out = await withBalanceLease(q, d, g.user_id, async (ld) => {
    const clawed = dp.status === "lost" ? await syncReversals(q, ld, g.id, paid) : 0;
    const open = (await ld.credits.disputesFor(pi)).find((x) => OPEN_DISPUTE_STATUSES.includes(x.status));
    const at = ld.now.toISOString();
    if (open) {
      const tag = `dispute:${open.id}`;
      const r = await q(
        `update credits set status = 'frozen', reason = $2, updated_at = $3 where id = $1 and (status in (${sqlList(WAITING)}) or (status = 'frozen' and reason is distinct from $2)) returning id`,
        [g.id, tag, at],
      );
      const now = await loadCredit(q, g.id);
      return r.length || now?.status === "frozen" ? ("frozen" as const) : clawed ? ("clawed_back" as const) : ("none" as const);
    }
    const r = await q(`update credits set status = 'pending_customer', reason = null, updated_at = $2 where id = $1 and status = 'frozen' returning id`, [g.id, at]);
    if (r.length) await postCredit(q, ld, g.id);
    return r.length ? ("unfrozen" as const) : clawed || dp.status === "lost" ? ("clawed_back" as const) : ("none" as const);
  });
  if (out === "unfrozen") await notifyGrant(q, d, g.id);
  return out;
}

/** SQL: an ended account `alias` (closed, or cancelled with access over) with posted referral credit and no lapse row for its current close yet. */
export const NEEDS_LAPSE_SQL = (alias = "u") =>
  `(exists (select 1 from credits c where c.user_id = ${alias}.id and c.kind = 'grant' and c.status = 'posted')
    and not exists (select 1 from credits c where c.user_id = ${alias}.id and c.kind = 'lapse' and c.source_object_id = ${CLOSE_KEY_SQL(alias)}))`;

/**
 * Lapse on close (origin R9), hourly: a closed account's unposted credits
 * lapse and never post (a cancelled account whose access has ended counts as
 * closed: ACCESS_ENDED_SQL), and the referral credit still on its balance
 * (`takeableCredit`) is taken back with one `lapse` row per close (keyed by
 * the close: its access end). A no-card close is left alone while the
 * account can still be reopened by its card (REOPEN_DAYS in card-setup.ts).
 * A lapse row that fails to post is retried by the posting sweep. Accounts
 * are taken least recently tried first (`credit_lapse_tried_at`, stamped on
 * a failure), so one that keeps failing never starves the rest. Stops at
 * the caller's deadline (`d.deadline`).
 */
export async function lapseClosedCredits(q: Query, d: CreditDeps, limit = 100): Promise<{ lapsed: number; zeroed: number; failed: number }> {
  const out = { lapsed: 0, zeroed: 0, failed: 0 };
  const at = d.now.toISOString();
  const users = await q<{ id: string; customer: string | null; currency: string | null; close_key: string; needs_lapse: boolean }>(
    `select u.id, u.stripe_customer as customer, u.currency, ${CLOSE_KEY_SQL("u")} as close_key, ${NEEDS_LAPSE_SQL("u")} as needs_lapse
     from users u
     where ${ACCESS_ENDED_SQL("u", "$1::timestamptz")}
       and not (u.closed_reason = '${CLOSED_NO_CARD}' and u.trial_started_at is null and u.access_ends_at > $1::timestamptz - interval '7 days')
       and (exists (select 1 from credits c where c.user_id = u.id and c.kind <> 'lapse' and c.status in (${sqlList(UNPOSTED)}))
         or ${NEEDS_LAPSE_SQL("u")})
     order by u.credit_lapse_tried_at nulls first, u.id limit $2`,
    [at, limit],
  );
  for (const u of users) {
    if (pastDeadline(d)) break;
    try {
      await withBalanceLease(q, d, u.id, async (ld) => {
        const l = await q(
          `update credits set status = 'lapsed', reason = 'account_closed', updated_at = $2
           where user_id = $1 and kind <> 'lapse' and status in (${sqlList(UNPOSTED)}) returning id`,
          [u.id, at],
        );
        out.lapsed += l.length;
        if (!u.needs_lapse) return;
        const unused = u.customer ? await takeableCredit(q, ld, u.id, u.customer) : 0;
        const [cur] = await q<{ currency: string }>(`select currency from credits where user_id = $1 and kind = 'grant' and status = 'posted' order by posted_at desc limit 1`, [u.id]);
        const [row] = await q<{ id: string }>(
          `insert into credits (user_id, kind, amount_cents, currency, status, reason, source_object_id, created_at, updated_at, posted_at)
           select $1, 'lapse', $2::int, $3, case when $2::int > 0 then 'pending_customer' else 'posted' end, 'account_closed', $4, $5::timestamptz, $5::timestamptz,
             case when $2::int > 0 then null else $5::timestamptz end
           where not exists (select 1 from credits where kind = 'lapse' and source_object_id = $4 and user_id = $1)
           on conflict do nothing returning id`,
          [u.id, unused, u.currency ?? cur?.currency ?? "USD", u.close_key, at],
        );
        if (row && unused > 0 && (await postCredit(q, ld, row.id)) === "posted") out.zeroed++;
      });
    } catch (e) {
      out.failed++;
      console.error("[credits] lapse failed; the next pass retries it", u.id, e instanceof Error ? e.message : e);
      // Tried and not finished: to the back of the queue.
      await q(`update users set credit_lapse_tried_at = $2 where id = $1`, [u.id, at]).catch(() => {});
    }
  }
  return out;
}
