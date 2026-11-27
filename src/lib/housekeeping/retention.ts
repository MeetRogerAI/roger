import type { Query } from "@/lib/db-query";

/** The erase applyRetention does, for the users chosen by `chosen` (a select of user ids, bounded). */
const ERASE_SQL = (chosen: string) => `with u as (${chosen}),
     r as (
       update runs set status = 'deleted', raw_text = '', parsed = null, reason = '', revision = revision + 1
       where user_id in (select id from u) and (status <> 'deleted' or raw_text <> '' or parsed is not null)
       returning id
     ),
     d as (delete from plays where user_id in (select id from u) and pool_play_id is null returning id),
     z as (
       update zack_profiles set status = 'deleted', raw_text = '', parsed = null, revision = revision + 1
       where user_id in (select id from u) and (status <> 'deleted' or raw_text <> '')
       returning id
     )
     select (select count(*) from u)::int as users, (select count(*) from r)::int as runs, (select count(*) from d)::int as plays, (select count(*) from z)::int as profiles`;

/** What a user still holds that retention erases (as in applyRetention). */
const HOLDS_DATA_SQL = (u: string) => `(exists (select 1 from runs r where r.user_id = ${u}.id and (r.status <> 'deleted' or r.raw_text <> '' or r.parsed is not null))
          or exists (select 1 from plays p where p.user_id = ${u}.id and p.pool_play_id is null)
          or exists (select 1 from zack_profiles z where z.user_id = ${u}.id and (z.status <> 'deleted' or z.raw_text <> '')))`;

/**
 * Data retention (spec 0.2 and B.14): runs are kept while a member has
 * access and for `retentionDays` (90) after it ends. Then their runs are
 * erased and their plays not in the pool removed, as deleting a run does
 * (src/lib/zack/settings.ts, deleteRun): the run row stays as an empty
 * "deleted" stub so plays already in the pool keep their place there, in
 * anonymous form. The private matching profiles sent with the runs go too.
 *
 * Access ends at `access_ends_at`: set by a cancellation, a subscription's
 * end, and every close. An account with no end recorded is left alone.
 * Bounded per pass, so a backlog spreads over several hours.
 */
export async function applyRetention(q: Query, o: { now: Date; retentionDays: number; limit?: number }): Promise<{ users: number; runs: number; plays: number; profiles: number }> {
  const [r] = await q<{ users: number; runs: number; plays: number; profiles: number }>(
    ERASE_SQL(`select id from users x
       where x.status in ('cancelled', 'closed') and x.access_ends_at is not null
         and x.access_ends_at <= $1::timestamptz - make_interval(days => $2)
         and ${HOLDS_DATA_SQL("x")}
       order by x.access_ends_at
       limit $3`),
    [o.now.toISOString(), o.retentionDays, o.limit ?? 200],
  );
  return r;
}

/** Privacy decision P3 (Peter, 2026-11-27): how long a one-at-a-time or held member may be idle before their runs are erased. */
export const IDLE_RETENTION_DAYS = 365;

/**
 * Retention for members whose access never ends on its own (privacy P3):
 * one-at-a-time members (`per_run`, still active) and held members are
 * erased as applyRetention erases, once they have had no run, order or
 * sign-in for IDLE_RETENTION_DAYS. Sign-in is the user's last_seen_at (set
 * when a session is created or renewed) or a live session's; the account's
 * creation counts as activity too. Job clock, bounded per pass.
 */
export async function applyIdleRetention(q: Query, o: { now: Date; idleDays?: number; limit?: number }): Promise<{ users: number; runs: number; plays: number; profiles: number }> {
  const [r] = await q<{ users: number; runs: number; plays: number; profiles: number }>(
    ERASE_SQL(`select x.id from users x
       where ((x.status = 'active' and x.plan = 'per_run') or x.status = 'held')
         and greatest(
               x.created_at,
               coalesce(x.last_seen_at, x.created_at),
               coalesce((select max(s.last_seen_at) from sessions s where s.user_id = x.id), x.created_at),
               coalesce((select max(r.received_at) from runs r where r.user_id = x.id), x.created_at),
               coalesce((select max(o.created_at) from orders o where o.user_id = x.id), x.created_at)
             ) < $1::timestamptz - make_interval(days => $2)
         and ${HOLDS_DATA_SQL("x")}
       order by x.created_at
       limit $3`),
    [o.now.toISOString(), o.idleDays ?? IDLE_RETENTION_DAYS, o.limit ?? 200],
  );
  return r;
}

/** Privacy decision P6 (Peter, 2026-11-27): how long these records are kept, in months. */
export const RECORD_MONTHS = { signupInterest: 12, notifications: 12, stripeEvents: 18 } as const;

/**
 * Notification kinds whose record is the only guard against sending again,
 * with no time window of its own: kept while the account exists. (Every
 * other "already sent" check is keyed to a week, a date or a recent window.)
 */
export const KEEP_NOTIFICATION_KINDS = ["welcome"] as const;

/**
 * Old-record purge (privacy P6): sign-up interest that never became an
 * account after 12 months, notification records after 12 months (except
 * KEEP_NOTIFICATION_KINDS), and finished Stripe event records after 18
 * months (Stripe itself keeps events about 30 days, so the reconcile never
 * looks one up that old; one still processing is never touched). Job clock,
 * bounded per table per pass.
 */
export async function purgeOldRecords(q: Query, o: { now: Date; limit?: number }): Promise<{ leads: number; notifications: number; stripeEvents: number }> {
  const [r] = await q<{ leads: number; notifications: number; stripeEvents: number }>(
    `with l as (
       delete from leads where id in (
         select l.id from leads l
         where l.created_at < $1::timestamptz - make_interval(months => $2)
           and not exists (select 1 from users u where lower(u.email) = lower(l.email))
         order by l.created_at limit $5)
       returning 1
     ),
     n as (
       delete from notifications where id in (
         select n.id from notifications n
         where coalesce(n.sent_at, n.claimed_at) < $1::timestamptz - make_interval(months => $3) and n.kind <> all($6::text[])
         order by n.claimed_at limit $5)
       returning 1
     ),
     e as (
       delete from stripe_events where id in (
         select e.id from stripe_events e
         where e.status in ('done', 'failed') and coalesce(e.done_at, e.claimed_at) < $1::timestamptz - make_interval(months => $4)
         order by e.claimed_at limit $5)
       returning 1
     )
     select (select count(*) from l)::int as leads, (select count(*) from n)::int as notifications, (select count(*) from e)::int as "stripeEvents"`,
    [o.now.toISOString(), RECORD_MONTHS.signupInterest, RECORD_MONTHS.notifications, RECORD_MONTHS.stripeEvents, o.limit ?? 500, [...KEEP_NOTIFICATION_KINDS]],
  );
  return r;
}

/**
 * Expired sign-in material (spec B.14: "removes expired sign-in tokens"):
 * links a day past their expiry (a day's grace keeps the email-change
 * "newest request" rule whole while any link it compares could still work),
 * expired sessions, used or expired Google sign-in states, and spent rate
 * counters. Uses the database's own clock, never an "as of" time, so a
 * preview run in the future cannot end live sessions.
 */
export async function cleanUpExpired(q: Query): Promise<{ tokens: number; sessions: number; states: number; counters: number }> {
  const [r] = await q<{ tokens: number; sessions: number; states: number; counters: number }>(
    `with t as (delete from login_tokens where expires_at < now() - interval '1 day' returning 1),
     s as (delete from sessions where expires_at < now() returning 1),
     o as (delete from oauth_states where expires_at < now() - interval '1 hour' returning 1),
     c as (delete from rate_events where expires_at < now() returning 1)
     select (select count(*) from t)::int as tokens, (select count(*) from s)::int as sessions, (select count(*) from o)::int as states, (select count(*) from c)::int as counters`,
  );
  return r;
}
