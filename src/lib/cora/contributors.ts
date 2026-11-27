import type { Query } from "@/lib/db-query";

/**
 * What `pool_play_contributors.contributor` says once the account a shared
 * play came from is deleted (Peter's decision, November 26, 2026). The column
 * otherwise holds a user id as text, or "seed:<seed contributor id>"
 * (merge.ts). This value is neither, so no reader can take it for a person:
 * Cora's "what this user contributed" lookup compares the column with a user
 * id as text and never casts the column (context.ts).
 *
 * A play has at most one such row: the table's key is (pool_play_id,
 * contributor), so however many deleted accounts contributed a play, they
 * end as one "unknown author".
 */
export const UNKNOWN_AUTHOR = "unknown author";

/**
 * The hourly safety net and the backfill for accounts deleted before the
 * relabel existed: every row whose contributor is a user id that matches no
 * user becomes "unknown author". Deleting an account relabels its rows in the
 * statement that deletes it (deleteAccount in src/lib/admin/users.ts), so on a
 * healthy database this finds nothing. Safe to run twice.
 *
 * Seed rows ("seed:…") are not accounts and are left alone. The ids are
 * compared as text (users.id cast to text, never the column cast to uuid), so
 * a value that is not a uuid cannot make the statement fail; it matches no
 * user and is relabelled like any other orphan.
 *
 * One statement, because several orphans of one play would collide on the
 * table's key: for each play the first orphan is relabelled and the rest are
 * deleted, and all of them are deleted when the play already has an "unknown
 * author" row. No row is touched twice.
 */
export async function relabelOrphanContributors(q: Query): Promise<{ relabelled: number; dropped: number }> {
  const [r] = await q<{ relabelled: number; dropped: number }>(
    `with orphans as (
       select c.pool_play_id, c.contributor,
              row_number() over (partition by c.pool_play_id order by c.contributor) as n,
              exists (select 1 from pool_play_contributors k where k.pool_play_id = c.pool_play_id and k.contributor = '${UNKNOWN_AUTHOR}') as has_unknown
       from pool_play_contributors c
       where c.contributor <> '${UNKNOWN_AUTHOR}' and c.contributor not like 'seed:%'
         and not exists (select 1 from users u where u.id::text = c.contributor)
     ),
     dropped as (
       delete from pool_play_contributors c using orphans o
       where c.pool_play_id = o.pool_play_id and c.contributor = o.contributor and (o.has_unknown or o.n > 1)
       returning 1
     ),
     relabelled as (
       update pool_play_contributors c set contributor = '${UNKNOWN_AUTHOR}' from orphans o
       where c.pool_play_id = o.pool_play_id and c.contributor = o.contributor and not o.has_unknown and o.n = 1
       returning 1
     )
     select (select count(*) from relabelled)::int as relabelled, (select count(*) from dropped)::int as dropped`,
  );
  return { relabelled: Number(r.relabelled), dropped: Number(r.dropped) };
}
