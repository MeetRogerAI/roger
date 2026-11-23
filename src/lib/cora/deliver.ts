import { wallToInstant } from "@/lib/clock";
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
 * A paid month covers a week when it was still running at that week's charge
 * instant (the Monday at the charge time; $4): a list for a paid week
 * delivered late still arrives, and the Monday the month ends on (its
 * renewal, which is not paid) is not covered.
 */
export const DELIVERABLE_SQL = `(
  exists (select 1 from orders o where o.user_id = u.id and o.week_of = $2 and o.status in ('charged', 'sent'))
  or (u.status = 'trial' and u.cancel_requested_at is null and (u.sponsor_id is not null or u.free_lists_used < $3))
  or (u.status = 'active' and (u.sponsor_id is not null
       or (u.plan = 'monthly' and (u.cancel_requested_at is null or u.access_ends_at is null or u.access_ends_at > $4::timestamptz))))
  or (u.status = 'cancelled' and u.plan = 'monthly' and (u.access_ends_at is null or u.access_ends_at > $4::timestamptz))
)`;

/**
 * Delivers one user's list for a week; returns how many ideas were delivered
 * now (0 if already delivered, none, or not deliverable). A list paid by order
 * never uses a free list.
 */
export async function deliverWeek(q: Query, userId: string, week: string, freeRuns: number, chargeAt: string): Promise<{ delivered: number; freeListNumber: number | null }> {
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
    [userId, week, freeRuns, wallToInstant(week, chargeAt).toISOString()],
  );
  return { delivered: Number(r?.delivered ?? 0), freeListNumber: r?.free_list ?? null };
}
