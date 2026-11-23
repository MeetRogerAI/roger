import type { Query } from "@/lib/db-query";

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

export const DELIVERABLE_SQL = `(
  exists (select 1 from orders o where o.user_id = u.id and o.week_of = $2 and o.status in ('charged', 'sent'))
  or (u.status = 'trial' and u.cancel_requested_at is null and (u.sponsor_id is not null or u.free_lists_used < $3))
  or (u.status = 'active' and (u.sponsor_id is not null
       or (u.plan = 'monthly' and (u.cancel_requested_at is null or u.access_ends_at is null or ${COVERS_WEEK("$2")}))))
  or (u.status = 'cancelled' and u.plan = 'monthly' and u.first_charge_at is not null and u.stripe_subscription is not null
       and u.access_ends_at is not null and ${COVERS_WEEK("$2")})
)`;

/**
 * Delivers one user's list for a week; returns how many ideas were delivered
 * now (0 if already delivered, none, or not deliverable). A list paid by order
 * never uses a free list.
 */
export async function deliverWeek(q: Query, userId: string, week: string, freeRuns: number): Promise<{ delivered: number; freeListNumber: number | null }> {
  const [r] = await q<{ delivered: number | string; free_list: number | null }>(
    `with u as (select * from users u where u.id = $1 and ${DELIVERABLE_SQL} for update),
     paid as (select exists (select 1 from orders o where o.user_id = $1 and o.week_of = $2 and o.status in ('charged', 'sent')) as yes),
     p as (
       update picks set delivered_at = now(), is_free_list = ((select status from u) = 'trial' and (select sponsor_id from u) is null and not (select yes from paid))
       where user_id = $1 and week_of = $2 and not dry_run and delivered_at is null and exists (select 1 from u)
       returning position
     ),
     c as (
       update users set free_lists_used = free_lists_used + 1
       where id = $1 and status = 'trial' and sponsor_id is null and exists (select 1 from p) and not (select yes from paid)
       returning free_lists_used
     ),
     w as (update cora_user_weeks set delivered_at = now() where user_id = $1 and week_of = $2 and not dry_run and exists (select 1 from p))
     select (select count(*) from p) as delivered, (select free_lists_used from c) as free_list`,
    [userId, week, freeRuns],
  );
  return { delivered: Number(r?.delivered ?? 0), freeListNumber: r?.free_list ?? null };
}
