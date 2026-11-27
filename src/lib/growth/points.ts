import { addDays, currentMonday, TORONTO } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { HAS_CARD_OR_SPONSORED_SQL } from "@/lib/billing/has-card";
import { releaseLease, takeLease } from "@/lib/leases";

/**
 * Contribution points (spec B.15 "Leaderboard", plan B2 Unit 6).
 *
 * The rule, computed from picks joined to pool_play_contributors (never stored
 * as events):
 * - 1 point ("adopted") for each delivered, non-dry-run pick of a pool play the
 *   member contributed to, picked for ANOTHER member. It counts only if the
 *   member contributed in an earlier list week than the pick's
 *   (`contributed_week` null, from before B2, or < `picks.week_of`), so a
 *   member who becomes a contributor later (including by the merge that
 *   confirms their own pick) earns nothing for picks already made. Weeks, not
 *   stamps: the two stamps come from different clocks.
 * - 1 more point ("confirmed") when that pick's set-up is confirmed by Zack
 *   (`picks.setup_confirmed_at`, stamped by the Cora merge).
 * - Anti-farming: both count only when the picked member is a real customer,
 *   a saved card or a sponsor (has-card.ts), or once had a card
 *   (`trial_started_at` is set: a member who has since closed still counted).
 *   A trial still waiting for its card never earns anyone a point. Card
 *   history is not stored, so this is the member's card state now, widened to
 *   "ever had one"; a no-card trial's lists are held, not delivered, until the
 *   card is saved, so in practice it is the state at delivery.
 * - A contributor is `user_id::text` or `seed:<seed contributor id>`. A seed
 *   record scores only while an admin has linked it to an account, and then
 *   for that account. A member who is a contributor under both keys earns once
 *   per pick.
 * - Each point belongs to the Toronto week (Monday) it happened in: an adopted
 *   point to the week the pick was delivered, a confirmed point to the week it
 *   was confirmed. Nothing after the job clock counts.
 *
 * The `points` table caches each member's weekly totals for rank and history.
 * The hourly refresh rewrites every open week. A week closes once a refresh
 * writes it at or after its end plus a grace of two days (so a late merge or
 * delivery stamped inside the week but committed after Monday 00:00 still
 * counts); from then on that week and every earlier one are authoritative and
 * never recomputed. `rebuildPoints` recomputes everything from scratch, for an
 * admin, and after a seed contributor is linked or unlinked.
 */

/** SQL: the Toronto Monday of the week a timestamptz expression falls in (the same week as clock.ts currentMonday). */
export const WEEK_OF_SQL = (expr: string) => `date_trunc('week', (${expr}) at time zone '${TORONTO}')::date`;

/** SQL: the instant a Toronto date expression starts. */
const START_OF = (dateExpr: string) => `((${dateExpr})::timestamp at time zone '${TORONTO}')`;

/** Days after a week's Monday when a refresh closes it: the week's 7, plus 2 days' grace. */
export const CLOSE_AFTER_DAYS = 9;

/** One member's points in one week, as computed (not cached). */
export type WeekPoints = { userId: string; weekOf: string; adopted: number; confirmed: number; total: number };

/**
 * The points of every member by week, as of the job clock ($1), from the week
 * $2 on (null: all weeks). Shared by `computePoints` and the cache writes so
 * the two cannot drift.
 */
const EARNED = `
  who as (
    -- Contributor keys resolved to accounts: a user id, or a seed record linked to one.
    select c.pool_play_id, u.id as user_id, c.contributed_week
    from pool_play_contributors c join users u on u.id::text = c.contributor
    union all
    select c.pool_play_id, sc.user_id, c.contributed_week
    from pool_play_contributors c join seed_contributors sc on c.contributor = 'seed:' || sc.id::text
    where sc.user_id is not null
  ),
  earned as (
    -- One row per (contributor, pick), however many keys the contributor has on the play.
    select w.user_id, k.user_id as picked, k.week_of, k.position, k.delivered_at, k.setup_confirmed_at
    from picks k join who w on w.pool_play_id = k.pool_play_id join users pu on pu.id = k.user_id
    where not k.dry_run and k.delivered_at is not null and k.delivered_at <= $1::timestamptz
      and w.user_id <> k.user_id
      and (w.contributed_week is null or w.contributed_week < k.week_of)
      and (${HAS_CARD_OR_SPONSORED_SQL("pu")} or pu.trial_started_at is not null)
      and ($2::date is null or k.delivered_at >= ${START_OF("$2::date")} or k.setup_confirmed_at >= ${START_OF("$2::date")})
    group by w.user_id, k.user_id, k.week_of, k.position, k.delivered_at, k.setup_confirmed_at
  ),
  events as (
    select user_id, ${WEEK_OF_SQL("delivered_at")} as wk, 1 as adopted, 0 as confirmed from earned
    union all
    select user_id, ${WEEK_OF_SQL("setup_confirmed_at")}, 0, 1 from earned
    where setup_confirmed_at is not null and setup_confirmed_at <= $1::timestamptz
  ),
  computed as (
    select user_id, wk, sum(adopted)::int as adopted, sum(confirmed)::int as confirmed from events
    where $2::date is null or wk >= $2::date
    group by user_id, wk
  )`;

type Row = { user_id: string; week_of: string; adopted: number | string; confirmed: number | string };
const toWeek = (r: Row): WeekPoints => {
  const adopted = Number(r.adopted);
  const confirmed = Number(r.confirmed);
  return { userId: r.user_id, weekOf: r.week_of, adopted, confirmed, total: adopted + confirmed };
};

/** Every member's points by week as of `now`, computed from the picks (no cache, every week). */
export async function computePoints(q: Query, now: Date): Promise<WeekPoints[]> {
  const rows = await q<Row>(
    `with ${EARNED} select user_id, to_char(wk, 'YYYY-MM-DD') as week_of, adopted, confirmed from computed order by wk, user_id`,
    [now.toISOString(), null],
  );
  return rows.map(toWeek);
}

/**
 * Rewrites the cache for the weeks from $2 (null: every week) to the current
 * Monday $5: stale rows removed, the rest upserted, stamped $4. Every write is
 * guarded by the lease holder $3. $1 is the job clock.
 */
export const WRITE_POINTS_SQL = `with ${EARNED},
  lease as (select 1 from leases where name = 'points-refresh' and holder = $3),
  removed as (
    delete from points p
    where exists (select 1 from lease) and ($2::date is null or p.week_of >= $2::date) and p.week_of <= $5::date
      and not exists (select 1 from computed c where c.user_id = p.user_id and c.wk = p.week_of)
    returning 1
  ),
  written as (
    insert into points (user_id, week_of, adopted, confirmed, total, computed_at)
    select c.user_id, c.wk, c.adopted, c.confirmed, c.adopted + c.confirmed, $4::timestamptz
    from computed c where exists (select 1 from lease) and c.wk <= $5::date
    on conflict (user_id, week_of) do update
      set adopted = excluded.adopted, confirmed = excluded.confirmed, total = excluded.total, computed_at = excluded.computed_at
    returning 1
  )
  select exists (select 1 from lease) as held, (select count(*) from written) as written, (select count(*) from removed) as removed`;

/** The newest closed week: written at or after its end plus the grace. Every week up to it is authoritative. */
const LAST_CLOSED_SQL = `select to_char(max(week_of), 'YYYY-MM-DD') as wk from points
  where computed_at >= ${START_OF(`week_of + ${CLOSE_AFTER_DAYS}`)}`;

export type RefreshResult = { from: string | null; written: number; removed: number } | { busy: true };

async function writeWeeks(q: Query, o: { now: Date; realNow?: Date; holder?: string }, rebuild: boolean): Promise<RefreshResult> {
  const holder = o.holder ?? crypto.randomUUID();
  if (!(await takeLease(q, "points-refresh", holder, 120))) return { busy: true };
  try {
    let from: string | null = null;
    if (!rebuild) {
      const [c] = await q<{ wk: string | null }>(LAST_CLOSED_SQL);
      from = c?.wk ? addDays(c.wk, 7) : null;
    }
    // The stamp that closes a week is never ahead of the real clock: an "as of" run must not close a real week early.
    const stamp = new Date(Math.min(o.now.getTime(), (o.realNow ?? new Date()).getTime()));
    const [r] = await q<{ held: boolean; written: number | string; removed: number | string }>(WRITE_POINTS_SQL, [
      o.now.toISOString(),
      from,
      holder,
      stamp.toISOString(),
      currentMonday(o.now),
    ]);
    if (!r?.held) return { busy: true };
    return { from, written: Number(r.written), removed: Number(r.removed) };
  } finally {
    await releaseLease(q, "points-refresh", holder);
  }
}

/**
 * The hourly refresh of the `points` cache (an HOURLY_TASKS item): only the
 * open weeks, from the Monday after the newest closed one. Leased; the job
 * clock decides the current week and what has happened.
 */
export function refreshPoints(q: Query, o: { now: Date; realNow?: Date; holder?: string }): Promise<RefreshResult> {
  return writeWeeks(q, o, false);
}

/**
 * Recomputes every week from scratch, closed ones included (for a seed link
 * or unlink, and the admin "Rebuild points" button). One statement under the
 * same lease, so readers never see an empty cache.
 */
export function rebuildPoints(q: Query, o: { now: Date; realNow?: Date; holder?: string }): Promise<RefreshResult> {
  return writeWeeks(q, o, true);
}

/**
 * The "rebuild owed" marker (B2 Unit 6, round-2 review): a `settings` row
 * saying a closed week may be wrong, so the next hourly pass rebuilds every
 * week instead of refreshing the open ones. Set when a seed link's rebuild
 * found the lease busy, when a merge adds a contributor whose week is before
 * the newest closed week, and on every seed import. Each set writes a new
 * token; the pass clears only the token it read before rebuilding, so a
 * marker set during the rebuild survives for the next pass.
 */
export const REBUILD_OWED_KEY = "points.rebuildOwed";

export async function owePointsRebuild(q: Query, reason: string): Promise<void> {
  await q(
    `insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [REBUILD_OWED_KEY, JSON.stringify({ token: crypto.randomUUID(), reason })],
  );
}

async function owedToken(q: Query): Promise<string | null> {
  const [r] = await q<{ token: string | null }>(`select value->>'token' as token from settings where key = $1`, [REBUILD_OWED_KEY]);
  return r?.token ?? null;
}

/**
 * After a merge (the Cora job, a seed import): a contributor added with a
 * contributed_week before the newest closed week makes picks in closed weeks
 * score for them, which the hourly refresh never revisits. Owes a rebuild then.
 */
export async function owePointsRebuildFor(q: Query, earliestContribution: string | null): Promise<boolean> {
  if (!earliestContribution) return false;
  const [c] = await q<{ wk: string | null }>(LAST_CLOSED_SQL);
  if (!c?.wk || earliestContribution >= c.wk) return false;
  await owePointsRebuild(q, `contributor from the week of ${earliestContribution}`);
  return true;
}

/**
 * The hourly points task: a full rebuild while one is owed (the marker cleared
 * only if the rebuild ran and the marker is still the one read), otherwise the
 * refresh of the open weeks.
 */
export async function runPointsTask(q: Query, o: { now: Date; realNow?: Date }): Promise<RefreshResult & { rebuilt?: boolean }> {
  const token = await owedToken(q);
  if (!token) return refreshPoints(q, o);
  const r = await rebuildPoints(q, o);
  if ("busy" in r) return r;
  await q(`delete from settings where key = $1 and value->>'token' = $2`, [REBUILD_OWED_KEY, token]);
  return { ...r, rebuilt: true };
}

/** A member's all-time points from the cache, and their rank. */
export type Standing = { userId: string; adopted: number; confirmed: number; total: number; rank: number };

/**
 * The rank rule (for the leaderboard, Unit 7, and the stats email, Unit 8):
 * standard competition ranking over every member, whether or not they opted
 * in to the board. Closed and cancelled accounts are left out (their rows stay
 * in the cache). rank = 1 + the number of members with a strictly higher
 * all-time total. Ties share a rank (two at 5 points are both 1st, the next is
 * 3rd); a member with no points ranks after everyone who has some. Lists of
 * tied members are ordered by user id, so the order is stable but carries no
 * meaning.
 */
const TOTALS = `totals as (
  select p.user_id, sum(p.adopted)::int as adopted, sum(p.confirmed)::int as confirmed, sum(p.total)::int as total
  from points p join users u on u.id = p.user_id
  where u.status not in ('closed', 'cancelled')
  group by p.user_id having sum(p.total) > 0
)`;

type StandingRow = { user_id: string; adopted: number | string; confirmed: number | string; total: number | string; rank: number | string };
const toStanding = (r: StandingRow): Standing => ({
  userId: r.user_id,
  adopted: Number(r.adopted),
  confirmed: Number(r.confirmed),
  total: Number(r.total),
  rank: Number(r.rank),
});

/** Every member with points, best first (rank, then user id). */
export async function standings(q: Query): Promise<Standing[]> {
  const rows = await q<StandingRow>(
    `with ${TOTALS} select user_id, adopted, confirmed, total, rank() over (order by total desc) as rank from totals order by total desc, user_id`,
  );
  return rows.map(toStanding);
}

/**
 * The one standing reader (Unit 7 review): a member's standing from the full
 * list. A member with no points (or an unknown id) gets zeros and ranks after
 * everyone who has some (rank = number of members with points + 1).
 */
export function myStanding(all: Standing[], userId: string): Standing {
  return all.find((s) => s.userId === userId) ?? { userId, adopted: 0, confirmed: 0, total: 0, rank: all.length + 1 };
}

/** Many members' standings in one read (the stats email, Unit 8). */
export async function standingsFor(q: Query, userIds: string[]): Promise<Map<string, Standing>> {
  const all = await standings(q);
  const byId = new Map(all.map((s) => [s.userId, s]));
  return new Map(userIds.map((id) => [id, byId.get(id) ?? myStanding(all, id)]));
}

/** One member's points and rank (the leaderboard page and API); the same rule as myStanding. */
export async function standingOf(q: Query, userId: string): Promise<Standing> {
  return myStanding(await standings(q), userId);
}
