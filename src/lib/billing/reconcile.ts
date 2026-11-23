import type Stripe from "stripe";
import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins } from "@/lib/mail/send";
import type { AdjustDeps } from "./adjustment";
import { staleClaims, takeOver } from "./claims";
import { takeOverFirstCharge, type ChargeDeps } from "./first-charge";
import { takeOverOrder } from "./orders";
import { renewalPaid, syncSubscription, type RenewalDeps } from "./renewals";
import { isLive, type BillingGateway, type PlanGateway } from "./subscriptions";

/**
 * The reconcile: Stripe is read back and the database brought into line
 * with it, for anything a webhook or a crash left behind (plan Units 14 and
 * 18). Every step is time-budgeted and continues from a saved cursor, so a
 * long one never stops the rest of the hourly pass.
 *
 * 1. Open claims (hourly, `settleOpenClaims`): a charge claim left open past
 *    15 minutes is looked up by its claim id and finished; one still open
 *    nine days after its Monday is reported to admins.
 * 2. Pending invoice items (daily, `reconcilePendingItems`): see below.
 * 3. Missed events (daily, `reconcileEvents`): Stripe's events of the kinds
 *    the webhook handles, from the last week, that were never handled here
 *    are handled now, through the webhook's own handler.
 * 4. Unsettled accounts (daily, `reconcileUsers`): each subscription is read
 *    back (an end or a schedule copied, an unpaid renewal released once
 *    Stripe has nothing open), and a first-charge account is checked for a
 *    live subscription Roger does not know about.
 *
 * The daily pending-item step (plan Key Technical Decisions: "The daily
 * reconcile deletes any pending item with no matching stored id"). Stripe's
 * documents disagree on what happens to a leftover pending item, so the app
 * never leaves one of its own: every pending adjustment item (one carrying
 * `adjustment_id` in its metadata) must be a live (pending) adjustment row.
 * An item made for a live row whose id was not stored yet (a crash between
 * Stripe and the update) is adopted instead. A pending item Roger did not
 * make is left alone and reported to admins once.
 */
/** Where a pass that ran out of time stopped; the next pass goes on from there. */
const CURSOR = "reconcile.pendingItemsCursor";

export async function reconcilePendingItems(
  q: Query,
  d: AdjustDeps,
  o: Budget = {},
): Promise<{ checked: number; deleted: number; adopted: number; foreign: number; finished: boolean }> {
  const out = { checked: 0, deleted: 0, adopted: 0, foreign: 0, finished: false };
  if (!d.adjust) return out;
  const clock = o.clock ?? Date.now;
  const stopAt = Math.min(clock() + (o.budgetMs ?? 60_000), o.deadline ?? Infinity);
  const [saved] = await q<{ customer: string | null }>(`select value->>'customer' as customer from settings where key = $1`, [CURSOR]);
  const customers = await q<{ customer: string }>(
    `select distinct u.stripe_customer as customer from users u
     where u.stripe_customer is not null and ($1::text is null or u.stripe_customer > $1)
       and (u.stripe_subscription is not null or exists (select 1 from pending_adjustments a where a.user_id = u.id))
     order by 1`,
    [saved?.customer ?? null],
  );
  let last = saved?.customer ?? null;
  for (const { customer } of customers) {
    // Out of time: stop cleanly, so the rest of the hourly pass still runs, and carry on from here next time.
    if (clock() >= stopAt) {
      await q(`insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`, [
        CURSOR,
        JSON.stringify({ customer: last }),
      ]);
      return out;
    }
    try {
      const items = await d.adjust.pendingInvoiceItems(customer);
      out.checked += items.length;
      for (const item of items) {
        if (!item.adjustmentId) {
          out.foreign++;
          await alertAdmins("pending_item_not_ours", item.id, adminAlert("A pending invoice item Roger did not make", [`Customer ${customer}, item ${item.id}. It will go on the next invoice unless removed in Stripe.`]), d).catch(() => {});
          continue;
        }
        const [kept] = await q<{ id: string }>(`select id from pending_adjustments where stripe_item = $1 and status = 'pending'`, [item.id]);
        if (kept) continue;
        const adopted = await q(
          `update pending_adjustments set stripe_item = $2, updated_at = now() where id::text = $1 and status = 'pending' and stripe_item is null returning id`,
          [item.adjustmentId, item.id],
        );
        if (adopted.length) {
          out.adopted++;
          continue;
        }
        await d.adjust.deleteInvoiceItem(item.id);
        await q(`update pending_adjustments set stripe_deleted_at = now() where stripe_item = $1 and status = 'deleted' and stripe_deleted_at is null`, [item.id]);
        out.deleted++;
      }
    } catch (e) {
      console.error("[reconcile] pending items", customer, e instanceof Error ? e.message : e);
    }
    last = customer;
  }
  // A full pass: the next one starts from the beginning.
  await q(`delete from settings where key = $1`, [CURSOR]);
  out.finished = true;
  return out;
}

/** A step's own time budget, the clock it reads, and the pass's deadline (epoch ms): it stops at whichever comes first. */
type Budget = { budgetMs?: number; clock?: () => number; deadline?: number };

async function saveCursor(q: Query, key: string, value: unknown) {
  await q(`insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);
}

async function readCursor<T>(q: Query, key: string): Promise<T | null> {
  const [r] = await q<{ value: T }>(`select value from settings where key = $1`, [key]);
  return r?.value ?? null;
}

export const EVENTS_CURSOR = "reconcile.eventsCursor";
export const USERS_CURSOR = "reconcile.usersCursor";

export const LAST_FINISHED = "reconcile.lastFinished";

/** Whether a daily step is still part-way through (it then carries on every hour until done). */
export async function cursorPending(q: Query, key: typeof EVENTS_CURSOR | typeof USERS_CURSOR): Promise<boolean> {
  return (await q(`select 1 from settings where key = $1`, [key])).length > 0;
}

/**
 * Whether the daily pass (missed events, then accounts) is under way, after
 * starting one if none is and the last finished more than 24 hours ago (or
 * never). A new pass writes both steps' cursors before any Stripe call, so a
 * pass that fails part-way carries on next hour instead of starting over.
 */
export async function reconcilePassUnderway(q: Query, now: Date): Promise<boolean> {
  if ((await cursorPending(q, EVENTS_CURSOR)) || (await cursorPending(q, USERS_CURSOR))) return true;
  const last = await readCursor<{ at: string }>(q, LAST_FINISHED);
  if (last && now.getTime() - Date.parse(last.at) < 86_400_000) return false;
  await saveCursor(q, EVENTS_CURSOR, { since: Math.floor(now.getTime() / 1000) - EVENT_WINDOW_DAYS * 86_400, after: null });
  await saveCursor(q, USERS_CURSOR, { id: null });
  return true;
}

/**
 * Records the pass as finished once neither step has anything left. Never
 * later than the real clock: an "as of" run in the future would otherwise
 * keep the real daily pass from starting until that date.
 */
export async function finishReconcilePass(q: Query, now: Date, realNow: Date = new Date()): Promise<boolean> {
  if ((await cursorPending(q, EVENTS_CURSOR)) || (await cursorPending(q, USERS_CURSOR))) return false;
  await saveCursor(q, LAST_FINISHED, { at: new Date(Math.min(now.getTime(), realNow.getTime())).toISOString() });
  return true;
}

/** 1. Charge claims left open past the takeover time are looked up by claim id and finished (the hourly pass). */
export async function settleOpenClaims(q: Query, d: ChargeDeps): Promise<string[]> {
  const out: string[] = [];
  for (const c of await staleClaims(q)) {
    if (c.purpose === "order" && !d.orders) continue;
    if (!(await takeOver(q, c.id))) continue;
    // One claim's failure never stops the others.
    try {
      out.push(c.purpose === "order" ? await takeOverOrder(q, { ...d, orders: d.orders! }, c) : await takeOverFirstCharge(q, d, c));
    } catch (e) {
      console.error("[reconcile] takeover", c.id, e instanceof Error ? e.message : e);
      out.push("failed");
    }
  }
  // Still open two days after the last retry day of its Monday (a takeover renews claimed_at, so the
  // Monday is the fixed point): something keeps failing, and a person must look.
  const stuck = await q<{ id: string; user_id: string; purpose: string; error: string | null }>(
    `select id, user_id, purpose, error from charge_attempts
     where outcome in ('claimed', 'unknown') and week_of < ($1::timestamptz at time zone 'America/Toronto')::date - 9`,
    [d.now.toISOString()],
  );
  for (const c of stuck) {
    await alertAdmins(
      "claim_stuck",
      c.id,
      adminAlert("A charge claim is still open", [`User ${c.user_id}, ${c.purpose} claim ${c.id}. Look it up in Stripe by its claim id and settle it by hand.`, c.error ?? ""]),
      d,
    ).catch(() => {});
  }
  return out;
}

/** The Stripe event kinds the webhook acts on (src/lib/billing/webhook.ts). */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.updated",
];

export type EventPage = { events: Stripe.Event[]; hasMore: boolean };
/** One page of Stripe's events, newest first, created at or after `since` (unix seconds). */
export type EventSource = (o: { since: number; startingAfter?: string }) => Promise<EventPage>;

export function stripeEventSource(s: Stripe): EventSource {
  return async ({ since, startingAfter }) => {
    const page = await s.events.list({ created: { gte: since }, types: HANDLED_EVENT_TYPES, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    return { events: page.data, hasMore: page.has_more };
  };
}

/** Days of events each pass looks back over: longer than Stripe's own three days of retries. */
export const EVENT_WINDOW_DAYS = 7;

/**
 * 3. Events Stripe made that were never handled here (the endpoint was down
 * past Stripe's retries, or not subscribed to the kind) are handled now, by
 * the webhook's handler: it claims each event id, so one the webhook is
 * handling at the same moment is not handled twice, and its handlers re-read
 * Stripe. An event under an hour old is left to Stripe's own delivery.
 */
export async function reconcileEvents(
  q: Query,
  source: EventSource,
  handle: (e: Stripe.Event) => Promise<unknown>,
  o: { now: Date } & Budget,
): Promise<{ seen: number; handled: number; failed: number; finished: boolean }> {
  const out = { seen: 0, handled: 0, failed: 0, finished: false };
  const clock = o.clock ?? Date.now;
  const stopAt = Math.min(clock() + (o.budgetMs ?? 45_000), o.deadline ?? Infinity);
  const nowSec = Math.floor(o.now.getTime() / 1000);
  const saved = await readCursor<{ since: number; after: string | null }>(q, EVENTS_CURSOR);
  const since = saved?.since ?? nowSec - EVENT_WINDOW_DAYS * 86_400;
  let after = saved?.after ?? null;
  for (;;) {
    if (clock() >= stopAt) {
      await saveCursor(q, EVENTS_CURSOR, { since, after });
      return out;
    }
    const page = await source({ since, startingAfter: after ?? undefined });
    const done = new Set(
      (await q<{ id: string }>(`select id from stripe_events where id = any($1::text[]) and status = 'done'`, [page.events.map((e) => e.id)])).map((r) => r.id),
    );
    for (const e of page.events) {
      if (clock() >= stopAt) {
        await saveCursor(q, EVENTS_CURSOR, { since, after });
        return out;
      }
      out.seen++;
      if (!done.has(e.id) && e.created <= nowSec - 3600) {
        try {
          await handle(e);
          out.handled++;
        } catch (err) {
          out.failed++;
          console.error("[reconcile] event", e.id, e.type, err instanceof Error ? err.message : err);
        }
      }
      after = e.id;
    }
    if (!page.hasMore || !page.events.length) break;
    await saveCursor(q, EVENTS_CURSOR, { since, after });
  }
  await q(`delete from settings where key = $1`, [EVENTS_CURSOR]);
  out.finished = true;
  return out;
}

/**
 * 4. Accounts whose state depends on Stripe, read back one by one:
 * - with a subscription: re-read it (an end, a cancellation scheduled or
 *   taken back, all copied here), and a renewal marked unpaid is released
 *   once Stripe has no open invoice for it;
 * - waiting for a first monthly charge (a trial past its free lists, or held):
 *   a live subscription made by a claim recorded as anything but succeeded,
 *   or one Roger did not make, is reported to admins. A succeeded claim is
 *   already repaired hourly, and an open one is taken over.
 */
export async function reconcileUsers(
  q: Query,
  d: RenewalDeps & { plans: PlanGateway; gw?: BillingGateway },
  o: Budget = {},
): Promise<{ checked: number; changed: number; alerts: number; finished: boolean }> {
  const out = { checked: 0, changed: 0, alerts: 0, finished: false };
  const clock = o.clock ?? Date.now;
  const stopAt = Math.min(clock() + (o.budgetMs ?? 45_000), o.deadline ?? Infinity);
  const saved = await readCursor<{ id: string }>(q, USERS_CURSOR);
  const users = await q<{ id: string; sub: string | null; customer: string | null }>(
    `select id, stripe_subscription as sub, stripe_customer as customer from users
     where ($1::uuid is null or id > $1::uuid)
       and ((stripe_subscription is not null and status in ('active', 'held'))
         or (stripe_subscription is null and stripe_customer is not null and plan = 'monthly'
             and (status = 'held' or (status = 'trial' and free_lists_used >= $2))))
     order by id`,
    [saved?.id ?? null, d.settings.freeRuns],
  );
  for (const u of users) {
    if (clock() >= stopAt) return out;
    out.checked++;
    try {
      if (u.sub) {
        const r = await syncSubscription(q, d, u.sub);
        if (r !== "unchanged" && r !== "scheduled" && r !== "unknown") out.changed++;
        const [x] = await q<{ unpaid: boolean }>(
          `select (renewal_failed_at is not null or (status = 'held' and hold_reason = 'renewal_unpaid')) as unpaid from users where id = $1 and stripe_subscription = $2`,
          [u.id, u.sub],
        );
        if (x?.unpaid && (await renewalPaid(q, d, { subscription: u.sub })) !== "still_unpaid") out.changed++;
      } else if (u.customer && d.gw) {
        for (const s of (await d.gw.subscriptions(u.customer)).filter(isLive)) {
          const [c] = s.claimId ? await q<{ outcome: string }>(`select outcome from charge_attempts where id::text = $1 and user_id = $2`, [s.claimId, u.id]) : [];
          if (c && ["claimed", "unknown", "succeeded"].includes(c.outcome)) continue;
          out.alerts++;
          await alertAdmins(
            "subscription_unknown",
            s.id,
            adminAlert("Stripe has a live subscription Roger does not count", [
              `User ${u.id}, subscription ${s.id}${s.claimId ? `, made by claim ${s.claimId} recorded as ${c?.outcome ?? "missing"}` : ", made outside Roger"}. Check it and refund or attach it by hand.`,
            ]),
            d,
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error("[reconcile] user", u.id, e instanceof Error ? e.message : e);
    }
    await saveCursor(q, USERS_CURSOR, { id: u.id });
  }
  await q(`delete from settings where key = $1`, [USERS_CURSOR]);
  out.finished = true;
  return out;
}
