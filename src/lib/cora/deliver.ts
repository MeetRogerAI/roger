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
 * who has not cancelled; an active monthly or sponsored user; a cancelled
 * user inside the paid month; a one-at-a-time user whose order for the week
 * was paid. Held, closed and unpaid users wait.
 */
export const DELIVERABLE_SQL = `(
  (u.status = 'trial' and u.cancel_requested_at is null and (u.sponsor_id is not null or u.free_lists_used < $3))
  -- A monthly member cancelling (or switching) stays active until the subscription ends, with lists until the paid month's end.
  or (u.status = 'active' and ((u.plan = 'monthly' and (u.cancel_requested_at is null or u.access_ends_at is null or u.access_ends_at > $4::timestamptz))
       or u.sponsor_id is not null
       or exists (select 1 from orders o where o.user_id = u.id and o.week_of = $2 and o.status in ('charged', 'sent'))))
  or (u.status = 'cancelled' and u.plan = 'monthly' and (u.access_ends_at is null or u.access_ends_at > $4::timestamptz))
  -- A list already paid for that week is delivered even after the account was cancelled.
  or (u.status = 'cancelled' and exists (select 1 from orders o where o.user_id = u.id and o.week_of = $2 and o.status in ('charged', 'sent')))
)`;

/** Delivers one user's list for a week; returns how many ideas were delivered now (0 if already delivered, none, or not deliverable). */
/** `now` is the job's clock (tests run simulated Mondays), used for the cancelled user's access end. */
export async function deliverWeek(q: Query, userId: string, week: string, freeRuns: number, now: Date): Promise<{ delivered: number; freeListNumber: number | null }> {
  const [r] = await q<{ delivered: number | string; free_list: number | null }>(
    `with u as (select * from users u where u.id = $1 and ${DELIVERABLE_SQL} for update),
     p as (
       update picks set delivered_at = now(), is_free_list = ((select status from u) = 'trial' and (select sponsor_id from u) is null)
       where user_id = $1 and week_of = $2 and not dry_run and delivered_at is null and exists (select 1 from u)
       returning position
     ),
     c as (
       update users set free_lists_used = free_lists_used + 1
       where id = $1 and status = 'trial' and sponsor_id is null and exists (select 1 from p)
       returning free_lists_used
     ),
     w as (update cora_user_weeks set delivered_at = now() where user_id = $1 and week_of = $2 and not dry_run and exists (select 1 from p))
     select (select count(*) from p) as delivered, (select free_lists_used from c) as free_list`,
    [userId, week, freeRuns, now.toISOString()],
  );
  return { delivered: Number(r?.delivered ?? 0), freeListNumber: r?.free_list ?? null };
}
