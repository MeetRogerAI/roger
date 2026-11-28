import type { Query } from "@/lib/db-query";
import { HAS_CARD_SQL } from "@/lib/billing/has-card";

/**
 * Delivering a list (plan "Delivery and email are separate"): one statement
 * checks that nothing is owed, stamps the week's picks as delivered and, for
 * a trial user, counts the free list once. The check is inside the statement
 * (with the user's row locked), so a cancel, a hold or a second delivery at
 * the same moment cannot slip past it. It is the same for the Monday send, a
 * charge that settles later in the week, and an order paid late. The email is
 * a separate claim-first send afterwards.
 */

/**
 * Nothing is owed (spec B.8 step 2, B.7 table): a trial user on a free list
 * who has not cancelled; an active monthly or sponsored user; a monthly
 * member cancelling or cancelled whose paid month covers the week; and,
 * whatever the account's state, a list whose order for the week was paid.
 * Held, closed and unpaid users wait.
 *
 * A paid month covers a week when access ends on a later Toronto date than
 * the week's Monday (COVERS_WEEK): a list for a paid week delivered late
 * still arrives, and the Monday the month ends on (its renewal, which is not
 * paid, at whatever time of day) is not covered.
 *
 * A cancelled account is covered only by a paid subscription period that
 * outlived the week: it was charged (`first_charge_at`), it still names the
 * subscription (an account that ended at once never had one; a switch to one
 * at a time clears it), and `access_ends_at` is that subscription's end: the
 * period end for a cancellation, or the start of the unpaid period for an
 * unpaid end (cancel.ts `endUnpaid`, renewals.ts `subscriptionEnded`). An
 * account that ended at once (`endNow`: trial, a held first charge, one at a
 * time) is covered by nothing here; only a paid order delivers its list.
 */
export const COVERS_WEEK = (week: string, u = "u") => `(${u}.access_ends_at at time zone 'America/Toronto')::date > ${week}::date`;

/** SQL: the week `week` of the user `user` (SQL expressions) is not superseded, that is not a replaced held list. */
export const NOT_SUPERSEDED_SQL = (user: string, week: string) =>
  `not exists (select 1 from cora_user_weeks sw where sw.user_id = ${user} and sw.week_of = ${week} and not sw.dry_run and sw.superseded_at is not null)`;

/**
 * SQL: the account `alias` is an unsponsored trial still waiting for its
 * first list (nothing ever delivered). A trial with no card always is; so is
 * one whose card was saved since its list was held and not delivered yet.
 */
export const FIRST_LIST_PENDING_SQL = (alias = "u") =>
  `(${alias}.status = 'trial' and ${alias}.sponsor_id is null
    and not exists (select 1 from picks dk where dk.user_id = ${alias}.id and not dk.dry_run and dk.delivered_at is not null)
    and not exists (select 1 from cora_user_weeks dw where dw.user_id = ${alias}.id and not dw.dry_run and dw.delivered_at is not null))`;

/** SQL: Cora is still picking a newer real week for the account `alias` than `week` (it has picks in a week still running). */
export const NEWER_WEEK_PICKING_SQL = (alias: string, week: string) =>
  `exists (select 1 from cora_user_weeks nw join cora_weeks nk on nk.week_of = nw.week_of
     where nw.user_id = ${alias}.id and nw.week_of > ${week} and not nw.dry_run and nw.outcome in ('picked', 'short') and nk.status = 'running' and not nk.dry_run)`;

/*
 * Held lists (plan 2026-11-26-001, Unit 3): a trial is deliverable only with a
 * saved card or a sponsor (HAS_CARD_OR_SPONSORED_SQL). Without one, the list
 * is picked but held: the member gets a titles-only teaser instead
 * (send-job.ts `sendHeldTeaser`). A week replaced by a newer held list
 * (`cora_user_weeks.superseded_at`, stamped when the newer week becomes ready,
 * job.ts SUPERSEDE_AT_READY_SQL) is never delivered, whatever the account's
 * state later, so saving a card unlocks only the newest held list.
 *
 * A trial's first list also waits while Cora is still picking a newer week for
 * it: a card saved during Cora's run must not unlock the older list when the
 * newer one (which may repeat its ideas, as undelivered picks are not "sent")
 * is about to replace it. Once the newer week is ready the older one is
 * superseded; if the newer week fails, the older list is deliverable again.
 */
export const DELIVERABLE_SQL = `((
  exists (select 1 from orders o where o.user_id = u.id and o.week_of = $2 and o.status in ('charged', 'sent'))
  or (u.status = 'trial' and u.cancel_requested_at is null and (u.sponsor_id is not null or (u.free_lists_used < $3 and ${HAS_CARD_SQL("u")}))
       and not (${FIRST_LIST_PENDING_SQL("u")} and ${NEWER_WEEK_PICKING_SQL("u", "$2")}))
  or (u.status = 'active' and (u.sponsor_id is not null
       or (u.plan = 'monthly' and (u.cancel_requested_at is null or u.access_ends_at is null or ${COVERS_WEEK("$2")}))))
  or (u.status = 'cancelled' and u.plan = 'monthly' and u.first_charge_at is not null and u.stripe_subscription is not null
       and u.access_ends_at is not null and ${COVERS_WEEK("$2")})
) and ${NOT_SUPERSEDED_SQL("u.id", "$2")})`;

/**
 * SQL (alias `k` picks): the pick's pool play was not removed from the pool
 * (2026-11-28 review F4). A removed play's pick is never delivered, so the
 * rest of its list goes out without it, and it is never retried.
 */
export const PICK_NOT_REMOVED_SQL = (k = "picks") => `not exists (select 1 from pool_plays rp where rp.id = ${k}.pool_play_id and rp.removed_at is not null)`;

/**
 * Delivers one user's list for a week; returns how many ideas were delivered
 * now (0 if already delivered, none, or not deliverable). A list paid by order
 * never uses a free list. A pick whose pool play an admin removed is skipped
 * (PICK_NOT_REMOVED_SQL), whether this is the Monday send, a late one, or a
 * held list unlocked by a card (unlock.ts goes through here too).
 */
export async function deliverWeek(q: Query, userId: string, week: string, freeRuns: number, now?: Date): Promise<{ delivered: number; freeListNumber: number | null }> {
  // `now` is the job clock: "as of" runs must stamp the simulated time, which the trial close counts from.
  const [r] = await q<{ delivered: number | string; free_list: number | null }>(
    `with u as (select * from users u where u.id = $1 and ${DELIVERABLE_SQL} for update),
     paid as (select exists (select 1 from orders o where o.user_id = $1 and o.week_of = $2 and o.status in ('charged', 'sent')) as yes),
     p as (
       update picks set delivered_at = coalesce($4::timestamptz, now()), is_free_list = ((select status from u) = 'trial' and (select sponsor_id from u) is null and not (select yes from paid))
       where user_id = $1 and week_of = $2 and not dry_run and delivered_at is null and exists (select 1 from u) and ${PICK_NOT_REMOVED_SQL()}
       returning position
     ),
     c as (
       update users set free_lists_used = free_lists_used + 1
       where id = $1 and status = 'trial' and sponsor_id is null and exists (select 1 from p) and not (select yes from paid)
       returning free_lists_used
     ),
     w as (update cora_user_weeks set delivered_at = coalesce($4::timestamptz, now()) where user_id = $1 and week_of = $2 and not dry_run and exists (select 1 from p))
     select (select count(*) from p) as delivered, (select free_lists_used from c) as free_list`,
    [userId, week, freeRuns, now ? now.toISOString() : null],
  );
  return { delivered: Number(r?.delivered ?? 0), freeListNumber: r?.free_list ?? null };
}
