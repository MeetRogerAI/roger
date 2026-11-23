import type { Query } from "@/lib/db-query";

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
    `with u as (
       select id from users x
       where x.status in ('cancelled', 'closed') and x.access_ends_at is not null
         and x.access_ends_at <= $1::timestamptz - make_interval(days => $2)
         and (exists (select 1 from runs r where r.user_id = x.id and (r.status <> 'deleted' or r.raw_text <> '' or r.parsed is not null))
              or exists (select 1 from plays p where p.user_id = x.id and p.pool_play_id is null)
              or exists (select 1 from zack_profiles z where z.user_id = x.id and (z.status <> 'deleted' or z.raw_text <> '')))
       order by x.access_ends_at
       limit $3
     ),
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
     select (select count(*) from u)::int as users, (select count(*) from r)::int as runs, (select count(*) from d)::int as plays, (select count(*) from z)::int as profiles`,
    [o.now.toISOString(), o.retentionDays, o.limit ?? 200],
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
