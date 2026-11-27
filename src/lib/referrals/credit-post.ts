import type { Query } from "@/lib/db-query";
import { HAS_CARD_SQL } from "@/lib/billing/has-card";
import type { Currency } from "@/lib/billing/prices";
import { appUrl } from "@/lib/mail/layout";
import { adminAlert, alertAdmins, MAX_ATTEMPTS, sendToUser } from "@/lib/mail/send";
import { creditEarnedEmail } from "@/lib/mail/templates/credit-earned";
import { CreditBusy, guardLease, refreshStaleBalances, takeableCredit, withBalanceLease, writeBalanceCache } from "./credit-balance";
import { convertGrant, loadCredit, sqlList, WAITING, type CreditDeps, type CreditRow, type CreditStatus } from "./credit-money";

/**
 * Posting ledger rows to the Stripe customer balance (B2 plan Unit 4), and
 * the hourly sweep that posts what is waiting. A row is always written before
 * its Stripe call; the call uses the row id as idempotency key and as
 * `metadata.credit_ledger_id`, so a lost answer is adopted instead of posted
 * twice (Stripe forgets keys after 24 hours; the reconcile looks back 7 days).
 */

/** Where an admin looks at a member's credit (every credit alert links it). */
export const adminUserUrl = (userId: string | null) => (userId ? appUrl(`/admin/users/${userId}`) : "(the member was deleted)");

type Member = { customer: string | null; currency: Currency | null; status: string; card: boolean; sponsored: boolean };

/**
 * Posts one waiting row, safe to repeat, under the member's balance lease:
 *
 * - A grant lapses (`sponsored`) for a sponsored referrer, waits for the lapse
 *   for a closed one, waits (`pending_switch`) while `v3.referralsOn` is off,
 *   and (`pending_customer`) until its referrer has a saved card, which fixes
 *   their currency; a grant kept in the other currency is converted then.
 * - A clawback or lapse whose member has no Stripe customer (deleted, or
 *   never had one) has nothing to take: posted with reason `no_customer`.
 * - The customer's balance transactions are searched first, and one carrying
 *   this row's id is adopted (a lost answer, maybe days ago).
 * - Otherwise the transaction is made with the amounts stored on the row
 *   (never re-read), so a retry sends the same parameters.
 *
 * A grant posts credit (negative); a clawback takes back its collectable
 * part (`amount - uncollected`); a lapse takes back the unused balance.
 */
export async function postCredit(q: Query, d: CreditDeps, id: string): Promise<CreditStatus | "none"> {
  const first = await loadCredit(q, id);
  if (!first) return "none";
  if (!(WAITING as readonly string[]).includes(first.status)) return first.status;
  return withBalanceLease(q, d, first.user_id, (ld) => postLocked(q, ld, id));
}

async function postLocked(q: Query, d: CreditDeps, id: string): Promise<CreditStatus | "none"> {
  let row = await loadCredit(q, id);
  if (!row) return "none";
  if (!(WAITING as readonly string[]).includes(row.status)) return row.status;
  const [u] = row.user_id
    ? await q<Member>(
        `select u.stripe_customer as customer, u.currency, u.status, ${HAS_CARD_SQL("u")} as card, u.sponsor_id is not null as sponsored from users u where u.id = $1`,
        [row.user_id],
      )
    : [];
  const at = d.now.toISOString();
  if (row.kind === "grant") {
    if (!u || u.status === "closed") return row.status;
    if (u.sponsored) {
      await q(`update credits set status = 'lapsed', reason = 'sponsored', updated_at = $2 where id = $1 and status in (${sqlList(WAITING)})`, [id, at]);
      return "lapsed";
    }
    if (!d.settings.referralsOn) {
      await q(`update credits set status = 'pending_switch', updated_at = $2 where id = $1 and status = 'pending_customer'`, [id, at]);
      return "pending_switch";
    }
    if (row.status === "pending_switch") await q(`update credits set status = 'pending_customer', updated_at = $2 where id = $1 and status = 'pending_switch'`, [id, at]);
    if (!u.card || !u.customer || !u.currency) return "pending_customer";
    if (row.currency !== u.currency) {
      const c = convertGrant({ amount: row.amount_cents, offset: row.offset_cents }, row.currency, u.currency);
      await q(`update credits set currency = $2, amount_cents = $3, offset_cents = $4, updated_at = $5 where id = $1 and status = 'pending_customer' and currency = $6`, [
        id,
        u.currency,
        c.amount,
        c.offset,
        at,
        row.currency,
      ]);
    }
    row = await loadCredit(q, id);
    if (!row) return "none";
    if (row.status !== "pending_customer") return row.status;
  }
  const signedOf = (r: CreditRow) => (r.kind === "grant" ? -r.amount_cents : r.kind === "clawback" ? r.amount_cents - r.uncollected_cents : r.amount_cents);
  let signed = signedOf(row);
  if (signed !== 0 && !u?.customer) {
    // Nothing to take back from: the whole clawback is uncollected, and a lapse zeroed nothing.
    await q(
      `update credits set status = 'posted', reason = 'no_customer', posted_at = $2, updated_at = $2,
         uncollected_cents = case when kind = 'clawback' then amount_cents else uncollected_cents end,
         amount_cents = case when kind = 'lapse' then 0 else amount_cents end
       where id = $1 and status in (${sqlList(WAITING)})`,
      [id, at],
    );
    return "posted";
  }
  let txn: { id: string; credit: number } | null = null;
  if (signed !== 0 && u?.customer) {
    const since = Math.floor(new Date(row.created_at).getTime() / 1000) - 300;
    const found = await d.credits.findBalanceTransaction(u.customer, row.id, since);
    if (found) {
      // Adopted: its ending balance is from then; the balance now is read instead.
      txn = { id: found.id, credit: Math.max(0, -(await d.credits.balance(u.customer))) };
    } else if (row.kind !== "grant" && row.user_id) {
      // A clawback or lapse is re-capped now: an invoice may have used the credit since it was written.
      const takeable = await takeableCredit(q, d, row.user_id, u.customer, row.id);
      if (signed > takeable) {
        const shrunk = row.kind === "clawback" ? { amount: row.amount_cents, uncollected: row.amount_cents - takeable } : { amount: takeable, uncollected: row.uncollected_cents };
        await q(
          `update credits set amount_cents = $2, uncollected_cents = $3, updated_at = $4
           where id = $1 and status in (${sqlList(WAITING)}) and amount_cents = $5 and uncollected_cents = $6`,
          [id, shrunk.amount, shrunk.uncollected, at, row.amount_cents, row.uncollected_cents],
        );
        row = await loadCredit(q, id);
        if (!row) return "none";
        if (!(WAITING as readonly string[]).includes(row.status)) return row.status;
        signed = signedOf(row);
      }
    }
    if (!found && signed !== 0) {
      await guardLease(q, d);
      const t = await d.credits.postBalance({
        customer: u.customer,
        amountCents: signed,
        currency: row.currency,
        ledgerId: row.id,
        description: row.kind === "grant" ? "Roger referral credit" : row.kind === "clawback" ? "Roger referral credit reversed (refund or dispute)" : "Roger referral credit ended (account closed)",
        idempotencyKey: `credit:${row.id}`,
      });
      txn = { id: t.id, credit: Math.max(0, -t.endingBalance) };
    }
  }
  const done = await q(
    `update credits set status = 'posted', stripe_txn = $2, posted_at = $3, updated_at = $3
     where id = $1 and status in (${sqlList(WAITING)}) and amount_cents = $4 and uncollected_cents = $5 returning id`,
    [id, txn?.id ?? null, at, row.amount_cents, row.uncollected_cents],
  );
  if (!done.length) {
    const now = await loadCredit(q, id);
    if (now?.status !== "posted" || (txn && now.stripe_txn !== txn.id)) {
      await alertAdmins(
        "credit_post_changed",
        id,
        adminAlert("A referral credit changed while it was being posted", [
          `Member ${row.user_id ?? "(deleted)"}, ledger row ${id} (${row.kind}): posted to Stripe as ${signed} cents ${row.currency}${txn ? ` (transaction ${txn.id})` : ""}, but the row changed meanwhile.`,
          "Check the member's balance in Stripe against the ledger and correct it by hand.",
          adminUserUrl(row.user_id),
        ]),
        { ...d, query: d.query ?? q },
      ).catch(() => {});
    }
  }
  if (txn && row.user_id) await writeBalanceCache(q, row.user_id, txn.credit, d.now);
  return "posted";
}

export const CREDIT_EARNED = "credit_earned";

/**
 * "You earned a credit", once per posted grant (keyed by the row). Never
 * throws for a failed send: the sweep tries again, up to the notification's
 * attempt cap, after which the row's email is marked skipped.
 */
export async function notifyGrant(q: Query, d: CreditDeps, id: string): Promise<"sent" | "failed" | "none"> {
  const [g] = await q<{ user_id: string; email: string; amount_cents: number; currency: Currency }>(
    `select c.user_id, u.email, c.amount_cents, c.currency from credits c join users u on u.id = c.user_id
     where c.id = $1 and c.kind = 'grant' and c.status = 'posted' and c.amount_cents > 0 and u.status <> 'closed'`,
    [id],
  );
  if (!g) return "none";
  const r = await sendToUser({ id: g.user_id, email: g.email }, CREDIT_EARNED, id, creditEarnedEmail({ amountCents: g.amount_cents, currency: g.currency }), {
    ...d,
    query: d.query ?? q,
  }).catch((e) => {
    console.error("[credits] credit email failed", id, e instanceof Error ? e.message : e);
    return "failed" as const;
  });
  if (r === "sent" || r === "skipped") return "sent";
  // Out of attempts: given up, so the sweep stops picking it.
  await q(
    `update notifications set status = 'skipped', error = coalesce(error, '') || ' (gave up)'
     where recipient = $1 and kind = $2 and ref = $3 and status = 'failed' and attempts >= $4`,
    [g.user_id, CREDIT_EARNED, id, MAX_ATTEMPTS],
  );
  return r === "already" ? "none" : "failed";
}

export type SweepResult = { posted: number; waiting: number; failed: number; busy: number; emails: number; refreshed: number };

/**
 * The pending sweep (hourly, and for one member when their card is saved):
 *
 * 1. Grants follow the switch: all `pending_switch` grants become
 *    `pending_customer` while `v3.referralsOn` is on, and back while off.
 * 2. Rows that can post now (a clawback or lapse; a grant only with the
 *    switch on and its referrer open with a card, or sponsored, to lapse) are
 *    posted, least recently tried first. A row that does not post has its
 *    `updated_at` moved on, so rows that keep failing never starve the rest.
 * 3. "You earned a credit" emails still unsent, under their attempt cap.
 * 4. Cached balances older than the member's last posted row are refreshed.
 */
export async function postPendingCredits(q: Query, d: CreditDeps, o: { userId?: string; limit?: number } = {}): Promise<SweepResult> {
  const out: SweepResult = { posted: 0, waiting: 0, failed: 0, busy: 0, emails: 0, refreshed: 0 };
  const at = d.now.toISOString();
  const user = o.userId ?? null;
  const on = d.settings.referralsOn === true;
  await q(
    `update credits set status = $3, updated_at = $2 where kind = 'grant' and status = $4 and ($1::uuid is null or user_id = $1::uuid)`,
    on ? [user, at, "pending_customer", "pending_switch"] : [user, at, "pending_switch", "pending_customer"],
  );
  const rows = await q<{ id: string }>(
    `select c.id from credits c left join users u on u.id = c.user_id
     where c.status in (${sqlList(WAITING)}) and ($1::uuid is null or c.user_id = $1::uuid)
       and (c.kind <> 'grant'
         or ($3::boolean and u.status <> 'closed'
             and (u.sponsor_id is not null or (u.stripe_customer is not null and u.currency is not null and ${HAS_CARD_SQL("u")}))))
     order by c.updated_at, c.id limit $2`,
    [user, o.limit ?? 200, on],
  );
  for (const r of rows) {
    let s: CreditStatus | "none" | "error" = "error";
    try {
      s = await postCredit(q, d, r.id);
      if (s === "posted") {
        out.posted++;
        if ((await notifyGrant(q, d, r.id)) === "sent") out.emails++;
      } else out.waiting++;
    } catch (e) {
      if (e instanceof CreditBusy) out.busy++;
      else {
        out.failed++;
        console.error("[credits] posting failed; a later pass retries it", r.id, e instanceof Error ? e.message : e);
      }
    }
    if (s !== "posted") await q(`update credits set updated_at = $2 where id = $1 and status in (${sqlList(WAITING)})`, [r.id, at]).catch(() => {});
  }
  const unsent = await q<{ id: string }>(
    `select c.id from credits c join users u on u.id = c.user_id
     where c.kind = 'grant' and c.status = 'posted' and c.amount_cents > 0 and u.status <> 'closed'
       and c.posted_at > $1::timestamptz - interval '14 days'
       and ($2::uuid is null or c.user_id = $2::uuid)
       and not exists (select 1 from notifications n where n.recipient = c.user_id::text and n.kind = '${CREDIT_EARNED}' and n.ref = c.id::text
                       and (n.status in ('sent', 'skipped') or n.attempts >= $3))
     order by c.posted_at limit 100`,
    [at, user, MAX_ATTEMPTS],
  );
  for (const r of unsent) if ((await notifyGrant(q, d, r.id).catch(() => "failed")) === "sent") out.emails++;
  if (!user) out.refreshed = await refreshStaleBalances(q, d);
  return out;
}
