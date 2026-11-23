import { torontoDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, sendToUser, type MailDeps } from "@/lib/mail/send";
import { invoiceItemisedEmail } from "@/lib/mail/templates/invoice-itemised";
import { notSharingMonthEmail, secondMissEmail } from "@/lib/mail/templates/second-miss";
import type { Rendered } from "@/lib/mail/layout";
import type { V3Settings } from "@/lib/v3-settings";
import { NOTICE_DAYS, periodAt, periodLabel, placement } from "./period";
import { amount, differenceCents, money, moneyCents, monthDifferenceCents, type Currency } from "./prices";
import type { AdjustmentGateway } from "./subscriptions";

export { differenceCents };

/**
 * The month's difference (spec B.9, plan Unit 14, one mechanism): a monthly
 * member's subscription always stays at the standard price. A billing month
 * owes the higher rate when any of its Sunday cutoffs found sharing off ("by
 * choice"), or when more weeks were missed than are forgiven. It is billed as
 * one pending invoice item on the subscription, for the difference between the
 * higher and the standard price, with its id stored: exactly one row per
 * member and month. The row is the truth; Stripe follows it:
 *
 * - The row is written first, in one statement that re-checks that the month
 *   owes it and the member can be billed it. Its Stripe item is made by
 *   `placeAdjustments` once `create_after` has passed (at once, or after the
 *   renewal for a carried one), with a key from the row's id. Placing checks
 *   the member again, and moves a row now too close to its invoice for the
 *   three-day email to the next one (with a corrected notice).
 * - It is deleted when an excuse means the month no longer owes it, when a
 *   cancellation is scheduled, on a switch to one list at a time, when the
 *   subscription ends, and when the account closes, but never (except for an
 *   excuse) once its renewal may have been drafted: an item already placed is
 *   kept when `invoice_at` has passed. A deleted row keeps its item id until
 *   Stripe confirms the delete (`stripe_deleted_at`); a failed delete is
 *   retried hourly, and no new item is made for that month meanwhile. An item
 *   Stripe can no longer delete (its invoice is finalized) is billed: the row
 *   is marked invoiced and admins are told once that a credit is due.
 */
export type AdjustDeps = { settings: V3Settings; now: Date; adjust?: AdjustmentGateway } & MailDeps;
export type DropReason = "cancel" | "switch" | "excused" | "ended" | "closed";
export type OweReason = "two_misses" | "not_sharing";

export const ISO = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
/** Billing months count from the current subscription's anchor (first_charge_at for rows from before it was stored). */
export const ANCHOR = (u = "u") => `coalesce(${u}.billing_anchor, ${u}.first_charge_at)`;

export type RuleUser = { status: string; plan: string; cancel_requested_at: string | null; stripe_subscription: string | null };

/** Whether a month's difference can stand for this member: null (yes), a reason to drop it, or "wait" (held for an unpaid renewal). */
export function dropReasonFor(u: RuleUser): DropReason | "wait" | null {
  if (u.cancel_requested_at) return "cancel";
  if (u.plan !== "monthly") return "switch";
  if (u.status === "closed") return "closed";
  if (u.status === "cancelled" || (u.status === "active" && !u.stripe_subscription)) return "ended";
  if (u.status !== "active") return "wait";
  return null;
}

/** The invoice line (spec B.9 notice 6). */
export const lineLabel = (period: string, reason: OweReason) => `Higher-rate adjustment for ${period}: ${reason === "not_sharing" ? "Zack not sharing" : "two missed weeks"}`;

/**
 * Notice 4 (two misses) or the not-sharing notice, with the invoice the
 * difference is on. A month that has already ended at `now` is named
 * ("Your billing month to …") instead of "this month".
 */
export function oweNotice(
  reason: OweReason,
  s: V3Settings,
  o: { amountCents: number; currency: Currency; invoiceDate: string; periodEnd: string; periodEndAt: Date | null; now: Date },
): { kind: string; message: Rendered } {
  const args = {
    higher: money(amount(s, "monthly", o.currency, "higher"), o.currency),
    difference: moneyCents(o.amountCents, o.currency),
    invoiceDate: o.invoiceDate,
    ended: o.periodEndAt && o.periodEndAt <= o.now ? { periodEnd: o.periodEnd } : null,
  };
  return reason === "not_sharing" ? { kind: "not_sharing_month", message: notSharingMonthEmail(args) } : { kind: "second_miss", message: secondMissEmail(args) };
}

export type LiveAdjustment = { id: string; periodStart: string; invoiceAt: string; amountCents: number; currency: Currency; status: "pending" | "invoiced"; reason: OweReason };

/** The month's difference that stands (pending or already invoiced), if any. */
export async function liveAdjustment(q: Query, userId: string, periodStart: string): Promise<LiveAdjustment | null> {
  const [r] = await q<{ id: string; invoice_at: string; amount_cents: number; currency: Currency; status: "pending" | "invoiced"; reason: OweReason }>(
    `select id, ${ISO("invoice_at")} as invoice_at, amount_cents, currency, status, reason from pending_adjustments
     where user_id = $1 and period_start = $2 and status in ('pending', 'invoiced') order by created_at desc limit 1`,
    [userId, periodStart],
  );
  return r ? { id: r.id, periodStart, invoiceAt: r.invoice_at, amountCents: r.amount_cents, currency: r.currency, status: r.status, reason: r.reason } : null;
}

/** Only weeks Cora has settled count (ready, sent or failed, never a dry run): a week still being worked may yet be excused. */
export const SETTLED_SQL = (c: string) => `exists (select 1 from cora_weeks w where w.week_of = ${c}.week_of and not w.dry_run and w.status in ('ready', 'sent', 'failed'))`;

/** What a month owes from its settled weeks: the higher rate if any cutoff found sharing off, or misses beyond the forgiven ones. */
export const OWES_SQL = (user: string, period: string, allowed: string) => `(
  exists (select 1 from contribution_weeks c where c.user_id = ${user} and c.period_start = ${period} and c.result = 'by_choice' and ${SETTLED_SQL("c")})
  or (select count(*) from contribution_weeks c where c.user_id = ${user} and c.period_start = ${period} and c.result = 'missed' and ${SETTLED_SQL("c")}) > ${allowed}
)`;
const REASON_SQL = (user: string, period: string) =>
  `case when exists (select 1 from contribution_weeks c where c.user_id = ${user} and c.period_start = ${period} and c.result = 'by_choice' and ${SETTLED_SQL("c")}) then 'not_sharing' else 'two_misses' end`;

/**
 * Raises the month's difference when its weeks say it owes it, for a monthly
 * member with a subscription who has not asked to cancel. Never a second one
 * for the month (the first month of a member charged the higher rate up front
 * already has its invoiced row), and never again after it was dropped for a
 * reason that ends it (a switch, the end, closing). Returns the one that
 * stands, new or not; a pending row not yet placed takes the current reason.
 */
export async function ensureAdjustment(q: Query, d: AdjustDeps, o: { userId: string; periodStart: string; weekOf: string; anchor: string; currency: Currency }): Promise<LiveAdjustment | null> {
  const where = placement(o.anchor, d.now);
  if (where) {
    await q(
      `insert into pending_adjustments (user_id, period_start, amount_cents, currency, week_of, invoice_at, create_after, reason)
       select u.id, $2, $3, $4, $5, $6, $7, ${REASON_SQL("u.id", "$2::date")} from users u
       where u.id = $1 and u.status = 'active' and u.plan = 'monthly' and u.cancel_requested_at is null and u.stripe_subscription is not null
         and ${OWES_SQL("u.id", "$2::date", "$8")}
         and not exists (
           select 1 from pending_adjustments a where a.user_id = u.id and a.period_start = $2
             and (a.status in ('pending', 'invoiced') or coalesce(a.deleted_reason, '') not in ('excused', 'cancel'))
         )
       on conflict do nothing`,
      [
        o.userId,
        o.periodStart,
        await monthDifferenceCents(d.settings, o.currency, d.adjust),
        o.currency,
        o.weekOf,
        where.invoiceAt.toISOString(),
        where.createAfter.toISOString(),
        d.settings.forgivenMissesPerMonth,
      ],
    );
  }
  // The wording follows the month until its item is first asked for; after that it is frozen with the item.
  await q(
    `update pending_adjustments set reason = ${REASON_SQL("$1", "$2::date")}, updated_at = now()
     where user_id = $1 and period_start = $2 and status = 'pending' and stripe_item is null and attempted_at is null and reason <> ${REASON_SQL("$1", "$2::date")}`,
    [o.userId, o.periodStart],
  );
  return liveAdjustment(q, o.userId, o.periodStart);
}

/**
 * Deletes one Stripe item and records that Stripe confirmed it. An item on a
 * finalized invoice was billed: its row is marked invoiced and admins are told
 * once (a credit is due). Any other failure is retried by `retryDeletes`.
 */
async function deleteItem(q: Query, d: AdjustDeps, item: string): Promise<boolean> {
  if (!d.adjust) return false;
  let r: "deleted" | "locked";
  try {
    r = await d.adjust.deleteInvoiceItem(item);
  } catch (e) {
    console.error("[adjustment] delete", item, e instanceof Error ? e.message : e);
    return false;
  }
  if (r === "deleted") {
    await q(`update pending_adjustments set stripe_deleted_at = now() where stripe_item = $1 and status = 'deleted' and stripe_deleted_at is null`, [item]);
    return true;
  }
  const rows = await q<{ id: string; user_id: string; period_start: string }>(
    `update pending_adjustments set status = 'invoiced', updated_at = now() where stripe_item = $1 and status = 'deleted'
     returning id, user_id, to_char(period_start, 'YYYY-MM-DD') as period_start`,
    [item],
  );
  for (const x of rows) {
    // The month is billed: a row raised again for it (waiting for this delete) must never make a second item.
    await q(
      `update pending_adjustments set status = 'deleted', deleted_reason = 'billed', updated_at = now()
       where user_id = $1 and period_start = $2 and status = 'pending' and stripe_item is null`,
      [x.user_id, x.period_start],
    );
    await alertAdmins("adjustment_billed_after_drop", `${x.user_id}:${x.period_start}`, adminAlert("A dropped higher-rate difference was already billed", [`User ${x.user_id}, month from ${x.period_start}, item ${item}: its invoice is finalized. A credit is due.`]), d).catch(() => {});
  }
  return true;
}

/**
 * Deletes the member's pending differences (all, or one month's): the rows
 * first, then their Stripe items. For anything but an excuse, an item that
 * may already be on its renewal's draft (`invoice_at` passed) is kept.
 */
export async function dropAdjustments(q: Query, d: AdjustDeps, userId: string, reason: DropReason, o: { periodStart?: string } = {}): Promise<number> {
  const rows = await q<{ id: string; stripe_item: string | null }>(
    `update pending_adjustments set status = 'deleted', deleted_reason = $2, updated_at = now()
     where user_id = $1 and status = 'pending' and ($3::date is null or period_start = $3)
       and ($2 = 'excused' or stripe_item is null or invoice_at > $4)
     returning id, stripe_item`,
    [userId, reason, o.periodStart ?? null, d.now.toISOString()],
  );
  for (const r of rows) if (r.stripe_item) await deleteItem(q, d, r.stripe_item);
  return rows.length;
}

/** Hourly: Stripe deletes that failed, tried again until Stripe confirms them (or says they were billed). */
export async function retryDeletes(q: Query, d: AdjustDeps): Promise<number> {
  if (!d.adjust) return 0;
  const rows = await q<{ stripe_item: string }>(`select stripe_item from pending_adjustments where status = 'deleted' and stripe_item is not null and stripe_deleted_at is null`);
  let n = 0;
  for (const r of rows) if (await deleteItem(q, d, r.stripe_item)) n++;
  return n;
}

/** The plan's deletion points. Unit 15 calls the cancel and switch ones; the webhook calls "ended". */
export const adjustmentOnCancelScheduled = (q: Query, d: AdjustDeps, userId: string) => dropAdjustments(q, d, userId, "cancel");
export const adjustmentOnSwitchToPerRun = (q: Query, d: AdjustDeps, userId: string) => dropAdjustments(q, d, userId, "switch");
export const adjustmentOnSubscriptionEnded = (q: Query, d: AdjustDeps, userId: string) => dropAdjustments(q, d, userId, "ended");
export const adjustmentOnAccountClosed = (q: Query, d: AdjustDeps, userId: string) => dropAdjustments(q, d, userId, "closed");

/**
 * The cancellation was undone: each difference it deleted whose invoice has
 * not come yet is raised again, if the month still owes it, as a new row with
 * a new Stripe item. Call after `cancel_requested_at` is cleared.
 */
export async function adjustmentOnCancelUndone(q: Query, d: AdjustDeps, userId: string): Promise<number> {
  const rows = await q<{ period_start: string; week_of: string; currency: Currency; anchor: string | null }>(
    `select distinct on (a.period_start) to_char(a.period_start, 'YYYY-MM-DD') as period_start, to_char(a.week_of, 'YYYY-MM-DD') as week_of, a.currency,
            ${ISO(ANCHOR())} as anchor
     from pending_adjustments a join users u on u.id = a.user_id
     where a.user_id = $1 and a.status = 'deleted' and a.deleted_reason = 'cancel' and a.invoice_at > $2
     order by a.period_start, a.updated_at desc`,
    [userId, d.now.toISOString()],
  );
  let n = 0;
  for (const r of rows) {
    if (!r.anchor) continue;
    const live = await ensureAdjustment(q, d, { userId, periodStart: r.period_start, weekOf: r.week_of, anchor: r.anchor, currency: r.currency });
    if (live?.status === "pending") n++;
  }
  if (n) await placeAdjustments(q, d);
  return n;
}

/** The month a period start belongs to; two days in is always inside it (a month is at least 28 days). */
export const periodOf = (anchor: string, periodStart: string) => periodAt(anchor, new Date(Date.parse(`${periodStart}T00:00:00Z`) + 2 * 86_400_000));

type PlaceRow = RuleUser & {
  id: string;
  user_id: string;
  email: string;
  period_start: string;
  amount_cents: number;
  currency: Currency;
  reason: OweReason;
  invoice_at: string;
  attempted: boolean;
  customer: string | null;
  anchor: string;
};

/**
 * A create whose answer was lost (the item exists, its id was never stored):
 * the customer's pending item carrying this row's id is adopted. Returns
 * whether the row now has its item.
 */
async function adoptLostItem(q: Query, d: AdjustDeps, r: PlaceRow): Promise<boolean> {
  if (!r.attempted || !r.customer || !d.adjust) return false;
  const found = (await d.adjust.pendingInvoiceItems(r.customer)).find((i) => i.adjustmentId === r.id);
  if (!found) return false;
  const kept = await q(`update pending_adjustments set stripe_item = $2, updated_at = now() where id = $1 and status = 'pending' and stripe_item is null returning id`, [r.id, found.id]);
  return kept.length > 0;
}

/**
 * Makes the Stripe item for each difference whose time has come. The member
 * is checked again first. A row now too close to its invoice for the three-day
 * email is moved to the next one, and the member is told the new date. The
 * key is the row's id, so a repeat finds the same item; if the row was deleted
 * while the item was being made, the item is deleted at once.
 */
export async function placeAdjustments(q: Query, d: AdjustDeps): Promise<number> {
  if (!d.adjust) return 0;
  const rows = await q<PlaceRow>(
    `select a.id, a.user_id, u.email, to_char(a.period_start, 'YYYY-MM-DD') as period_start, a.amount_cents, a.currency, a.reason,
            ${ISO("a.invoice_at")} as invoice_at, a.attempted_at is not null as attempted,
            u.status, u.plan, u.cancel_requested_at::text, u.stripe_customer as customer, u.stripe_subscription, ${ISO(ANCHOR())} as anchor
     from pending_adjustments a join users u on u.id = a.user_id
     where a.status = 'pending' and a.stripe_item is null and a.create_after <= $1 and ${ANCHOR()} is not null
       -- Never a second item for a month while an earlier one is not confirmed deleted, or once the month is billed.
       and not exists (
         select 1 from pending_adjustments x where x.user_id = a.user_id and x.period_start = a.period_start and x.id <> a.id
           and ((x.status = 'deleted' and x.stripe_item is not null and x.stripe_deleted_at is null) or x.status = 'invoiced')
       )
     order by a.created_at`,
    [d.now.toISOString()],
  );
  let n = 0;
  for (const r of rows) {
    const why = dropReasonFor(r);
    if (why === "wait") continue;
    if (why) {
      await dropAdjustments(q, d, r.user_id, why, { periodStart: r.period_start });
      continue;
    }
    const p = periodOf(r.anchor, r.period_start);
    if (!p || !r.customer || !r.stripe_subscription) continue;
    // An earlier create may have made the item and lost the answer: find it before moving or making anything.
    try {
      if (await adoptLostItem(q, d, r)) {
        n++;
        continue;
      }
    } catch (e) {
      console.error("[adjustment] look up", r.id, e instanceof Error ? e.message : e);
      continue;
    }
    // Too close to its invoice for the three-day email: the next invoice, and the member is told.
    if (d.now.getTime() > Date.parse(r.invoice_at) - NOTICE_DAYS * 86_400_000) {
      const where = placement(r.anchor, d.now);
      if (!where) continue;
      const moved = await q(
        `update pending_adjustments set invoice_at = $2, create_after = $3, updated_at = now() where id = $1 and status = 'pending' and stripe_item is null returning id`,
        [r.id, where.invoiceAt.toISOString(), where.createAfter.toISOString()],
      );
      if (moved.length) {
        const date = torontoDate(where.invoiceAt);
        const notice = oweNotice(r.reason, d.settings, { amountCents: r.amount_cents, currency: r.currency, invoiceDate: date, periodEnd: p.endDate, periodEndAt: p.end, now: d.now });
        await sendToUser({ id: r.user_id, email: r.email }, notice.kind, `${r.id}:${date}`, notice.message, d).catch(() => {});
      }
      if (where.createAfter > d.now) continue;
    }
    // From the first ask on, the wording is frozen (it is on the item), and a lost answer is looked for next time.
    const [frozen] = await q<{ reason: OweReason }>(
      `update pending_adjustments set attempted_at = coalesce(attempted_at, now()) where id = $1 and status = 'pending' and stripe_item is null returning reason`,
      [r.id],
    );
    if (!frozen) continue;
    r.reason = frozen.reason;
    let item: string;
    try {
      item = await d.adjust.createInvoiceItem({
        customer: r.customer,
        subscription: r.stripe_subscription,
        amountCents: r.amount_cents,
        currency: r.currency,
        description: lineLabel(periodLabel(p), r.reason),
        metadata: { adjustment_id: r.id, user_id: r.user_id, period_start: r.period_start },
        idempotencyKey: `adjustment:${r.id}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[adjustment] create", r.id, msg);
      await alertAdmins("adjustment_failed", `${r.user_id}:${r.period_start}`, adminAlert("A higher-rate difference could not be added in Stripe", [`User ${r.user_id}, month from ${r.period_start}, adjustment ${r.id}. It is retried every hour.`, msg]), d).catch(() => {});
      continue;
    }
    const kept = await q(`update pending_adjustments set stripe_item = $2, updated_at = now() where id = $1 and status = 'pending' and stripe_item is null returning id`, [r.id, item]);
    if (kept.length) {
      n++;
      continue;
    }
    // The row was deleted meanwhile: its item is recorded on it, so a failed delete is retried.
    await q(`update pending_adjustments set stripe_item = $2 where id = $1 and status = 'deleted' and stripe_item is null`, [r.id, item]);
    const [now] = await q<{ status: string; stripe_item: string | null }>(`select status, stripe_item from pending_adjustments where id = $1`, [r.id]);
    if (!now || now.status !== "pending" || now.stripe_item !== item) await deleteItem(q, d, item);
  }
  return n;
}

/**
 * Stripe finalized or paid an invoice carrying difference items (the
 * renewal): those rows are invoiced. Never on a draft, which can still
 * change. An item the app had deleted that still reached an invoice is
 * reported, so an admin can credit it.
 */
export async function markInvoiced(q: Query, d: MailDeps, invoiceId: string, items: string[]): Promise<number> {
  if (!items.length) return 0;
  const rows = await q<{ id: string; user_id: string; period_start: string; was: string }>(
    `with before as (select id, status from pending_adjustments where stripe_item = any($1::text[]) and status in ('pending', 'deleted'))
     update pending_adjustments a set status = 'invoiced', updated_at = now()
     from before b where a.id = b.id
     returning a.id, a.user_id, to_char(a.period_start, 'YYYY-MM-DD') as period_start, b.status as was`,
    [items],
  );
  for (const r of rows.filter((x) => x.was === "deleted")) {
    await alertAdmins("adjustment_billed_after_drop", `${r.user_id}:${r.period_start}`, adminAlert("A dropped higher-rate difference was already billed", [`User ${r.user_id}, month from ${r.period_start}, invoice ${invoiceId}. A credit is due.`]), d).catch(() => {});
  }
  return rows.length;
}

/**
 * Notice 5 (spec B.9): three days before an invoice that carries a
 * difference, the full amount, itemised, from Stripe's preview of that
 * invoice. Once per member and invoice date. Only sent when the preview shows
 * the difference, so the email always matches the invoice.
 */
export async function sendItemisedNotices(q: Query, d: AdjustDeps): Promise<number> {
  if (!d.adjust) return 0;
  const rows = await q<{ user_id: string; email: string; customer: string; subscription: string; invoice_at: string; items: string[] }>(
    `select a.user_id, u.email, u.stripe_customer as customer, u.stripe_subscription as subscription, ${ISO("a.invoice_at")} as invoice_at,
            array_agg(a.stripe_item) as items
     from pending_adjustments a join users u on u.id = a.user_id
     where a.status = 'pending' and a.stripe_item is not null and a.invoice_at > $1::timestamptz and a.invoice_at <= $1::timestamptz + make_interval(days => $2)
       and u.status = 'active' and u.stripe_customer is not null and u.stripe_subscription is not null
     group by a.user_id, u.email, u.stripe_customer, u.stripe_subscription, a.invoice_at`,
    [d.now.toISOString(), NOTICE_DAYS],
  );
  let n = 0;
  for (const r of rows) {
    const date = torontoDate(new Date(r.invoice_at));
    const done = await q(`select 1 from notifications where recipient = $1 and kind = 'invoice_itemised' and ref = $2 and status = 'sent'`, [r.user_id, date]);
    if (done.length) continue;
    try {
      const preview = await d.adjust.previewRenewal({ customer: r.customer, subscription: r.subscription });
      const onIt = r.items.every((i) => preview.lines.some((l) => l.invoiceItem === i));
      if (!onIt) {
        await alertAdmins("adjustment_not_on_preview", `${r.user_id}:${date}`, adminAlert("A higher-rate difference is missing from the invoice preview", [`User ${r.user_id}, invoice of ${date}. The itemised email was not sent.`]), d).catch(() => {});
        continue;
      }
      const res = await sendToUser(
        { id: r.user_id, email: r.email },
        "invoice_itemised",
        date,
        invoiceItemisedEmail({ invoiceDate: date, lines: preview.lines, taxCents: preview.taxCents, totalCents: preview.totalCents, currency: preview.currency as Currency }),
        d,
      );
      if (res === "sent") n++;
    } catch (e) {
      console.error("[adjustment] itemised", r.user_id, e instanceof Error ? e.message : e);
    }
  }
  return n;
}
