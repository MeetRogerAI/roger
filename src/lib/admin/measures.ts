import { adminEmails as configuredAdmins } from "@/lib/auth/admin-emails";
import { addDays, currentMonday, TORONTO, wallToInstant } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { decemberCheckpoint } from "@/data/config";

/**
 * The loop measures on /admin/measures (B3 Unit 3; spec B.16 "Loop
 * measures"). The contract is the plan's "Measure Definitions (SQL level)"
 * table (docs/plans/2026-11-27-003-feat-roger-v3-b3-measurement-plan.md);
 * each SQL constant below cites the row it implements.
 *
 * Every measure is computed live from the tables on each load, with no cache
 * (Key Technical Decisions), over Toronto weeks: Monday 00:00 to the next
 * Monday 00:00 in America/Toronto. The one stored value is the December 14
 * checkpoint, frozen once in measure_snapshots (`snapshotCheckpoint`).
 *
 * Parameters shared by the SQL: $1 the weeks (date[], their Mondays), $2 the
 * admin addresses (text[], lower-cased; ADMIN_EMAILS). Admin accounts are
 * never members, and dry-run lists and picks never count.
 */

/** How many Toronto weeks the table shows, newest first. */
export const MEASURE_WEEKS = 26;

/** Generation buckets: 0 (champions), 1, 2, and 3 or more. */
export const GENERATIONS = ["0", "1", "2", "3 or more"] as const;

/** SQL: the instant a Toronto date expression starts. */
const START_OF = (dateExpr: string) => `((${dateExpr})::timestamp at time zone '${TORONTO}')`;

/**
 * SQL (inside `with recursive`): `gen (id, g)`, every account's referral
 * generation, derived and never read from referrals.generation (which B2
 * never writes). Measure Definitions, "Generation": 0 for an account with no
 * non-void referral (a champion); 1 + the referrer's generation otherwise, or
 * 1 when the referrer was deleted (referrer_id null). The walk stops at 20
 * steps; an account it doesn't reach (deeper than 20) has no row here and is
 * bucketed as "3 or more".
 */
export const GENERATION_SQL = `
  gen_walk (id, g) as (
    select id, g from (
      select u.id, 0 as g from users u
      where not exists (select 1 from referrals r where r.referred_user_id = u.id and r.stage <> 'void')
      union all
      select r.referred_user_id, 1 from referrals r
      where r.referred_user_id is not null and r.stage <> 'void' and r.referrer_id is null
    ) base
    union all
    select r.referred_user_id, w.g + 1 from gen_walk w
    join referrals r on r.referrer_id = w.id and r.referred_user_id is not null and r.stage <> 'void'
    where w.g < 20
  ),
  gen as (select id, min(g)::int as g from gen_walk group by id)`;

/**
 * SQL: `fl(u)`, the first list a person saw (Measure Definitions, "First list
 * at"): the held list's teaser, or the first delivered list or pick, dry runs
 * left out. `alias` is the users row.
 */
export const FIRST_LIST_SQL = (alias: string) => `least(
    ${alias}.first_teaser_at,
    (select min(c.delivered_at) from cora_user_weeks c where c.user_id = ${alias}.id and not c.dry_run),
    (select min(p.delivered_at) from picks p where p.user_id = ${alias}.id and not p.dry_run))`;

/**
 * SQL (after GENERATION_SQL): the weeks `w (wk, s, e)` from $1 with their
 * start and end instants, and the members `m` with (Measure Definitions):
 * `su` signed up at, `ae` access ended at, `referred` (a non-void referral
 * names them), `named_at` (that referral's created_at), `paying_at` (that
 * referral's), `gb` their generation bucket (0 to 3) and `rb` their
 * referrer's (0 to 3; a deleted referrer counts as generation 0, since the
 * member is then generation 1).
 */
const BASE_SQL = `
  w as (select wk, ${START_OF("wk")} as s, ${START_OF("wk + 7")} as e from unnest($1::date[]) wk),
  m as (
    select u.id, u.sponsor_id, u.first_charge_at, u.first_teaser_at, u.access_ends_at as ae,
           coalesce(u.signup_finished_at, case when u.status <> 'signup' then u.created_at end) as su,
           r.id is not null as referred, r.created_at as named_at, r.paying_at,
           least(3, coalesce(g.g, 3)) as gb,
           case when r.id is not null then least(3, coalesce(g.g, 4) - 1) end as rb
    from users u
    left join gen g on g.id = u.id
    left join referrals r on r.referred_user_id = u.id and r.stage <> 'void'
    where lower(u.email) <> all($2::text[])
  )`;

const SIGNED_UP_IN_W = `m.referred and m.su >= w.s and m.su < w.e`;
const ACTIVE_AT_START = `m.su < w.s and (m.ae is null or m.ae > w.s)`;
const BUCKETS = [0, 1, 2, 3];

/**
 * k(W) and k_g(W) (Measure Definitions rows 1 and 2). num: members who
 * signed up in [start(W), end(W)) and were referred. den: members active at
 * start(W). By generation g: num counts those whose referrer has generation
 * g, den the active members of generation g.
 */
export const K_SQL = `with recursive ${GENERATION_SQL}, ${BASE_SQL}
  select to_char(w.wk, 'YYYY-MM-DD') as week,
         count(m.id) filter (where ${SIGNED_UP_IN_W})::int as num,
         count(m.id) filter (where ${ACTIVE_AT_START})::int as den,
         array[${BUCKETS.map((g) => `count(m.id) filter (where ${SIGNED_UP_IN_W} and m.rb = ${g})::int`).join(", ")}] as num_g,
         array[${BUCKETS.map((g) => `count(m.id) filter (where ${ACTIVE_AT_START} and m.gb = ${g})::int`).join(", ")}] as den_g
  from w left join m on true
  group by w.wk
  order by w.wk desc`;

/**
 * Cycle time by week of first list (Measure Definitions row 3): for each
 * referred member whose fl(u) is in W, days = (fl(u) - named_at) / 86400 s.
 * Per W (gen null) and per W and gen(u) (1, 2, 3 or more): n, the median
 * (percentile_cont 0.5) and the mean, to 1 decimal.
 */
export const CYCLE_SQL = `with recursive ${GENERATION_SQL}, ${BASE_SQL},
  firsts as (select m.id, m.gb, m.named_at, ${FIRST_LIST_SQL("m")} as fl from m where m.referred),
  d as (
    select w.wk, f.gb, extract(epoch from f.fl - f.named_at) / 86400 as days
    from w join firsts f on f.fl >= w.s and f.fl < w.e
  )
  select to_char(d.wk, 'YYYY-MM-DD') as week, case when grouping(d.gb) = 1 then null else d.gb end as gen,
         count(*)::int as n,
         round((percentile_cont(0.5) within group (order by d.days))::numeric, 1)::float8 as median,
         round(avg(d.days)::numeric, 1)::float8 as mean
  from d
  group by grouping sets ((d.wk), (d.wk, d.gb))`;

/** Cycle time's "waiting" (row 3): referred members with no first list yet, and the oldest one's age in days at $3 (now), to 1 decimal. */
export const WAITING_SQL = `with recursive ${GENERATION_SQL}, ${BASE_SQL},
  firsts as (select m.named_at, ${FIRST_LIST_SQL("m")} as fl from m where m.referred and m.su is not null)
  select count(*)::int as n, round(max(extract(epoch from $3::timestamptz - named_at) / 86400)::numeric, 1)::float8 as oldest
  from firsts where fl is null`;

/**
 * Paid referral rate at end(W) (row 4). num: non-void referrals with
 * paying_at before end(W) whose referred member isn't sponsored. den: members
 * whose first charge was before end(W) and whose access hadn't ended by then.
 */
export const PAID_SQL = `with recursive ${GENERATION_SQL}, ${BASE_SQL}
  select to_char(w.wk, 'YYYY-MM-DD') as week,
         count(m.id) filter (where m.referred and m.paying_at < w.e and m.sponsor_id is null)::int as num,
         count(m.id) filter (where m.first_charge_at < w.e and (m.ae is null or m.ae > w.e))::int as den
  from w left join m on true
  group by w.wk
  order by w.wk desc`;

/**
 * Adoption per list week W (row 6). sent: members' new-idea picks
 * (`kind = 'new'`) with week_of = W, delivered, not dry runs; upgrades are
 * left out of every count here, since they improve something the member
 * already runs. Marked and confirmed as stamped; adopted is marked
 * or confirmed. members: members with at least one sent; membersAtTarget:
 * those whose adopted / sent is at least 2/3. installed and used (Cora change
 * 15, B3 Unit 11): picks a later profile showed installed (or used), and
 * used, as stamped by recordAdoption (src/lib/cora/adoption.ts). Shown beside
 * adopted; the headline stays marked or confirmed.
 */
export const ADOPTION_SQL = `
  with w as (select wk from unnest($1::date[]) wk),
  per as (
    select p.week_of, p.user_id, count(*)::int as sent,
           count(*) filter (where p.setup_marked_at is not null)::int as marked,
           count(*) filter (where p.setup_confirmed_at is not null)::int as confirmed,
           count(*) filter (where p.setup_marked_at is not null or p.setup_confirmed_at is not null)::int as adopted,
           count(*) filter (where p.installed_at is not null)::int as installed,
           count(*) filter (where p.used_at is not null)::int as used
    from picks p join users u on u.id = p.user_id
    where p.week_of = any($1::date[]) and p.kind = 'new' and p.delivered_at is not null and not p.dry_run and lower(u.email) <> all($2::text[])
    group by p.week_of, p.user_id
  )
  select to_char(w.wk, 'YYYY-MM-DD') as week,
         coalesce(sum(per.sent), 0)::int as sent, coalesce(sum(per.marked), 0)::int as marked,
         coalesce(sum(per.confirmed), 0)::int as confirmed, coalesce(sum(per.adopted), 0)::int as adopted,
         coalesce(sum(per.installed), 0)::int as installed, coalesce(sum(per.used), 0)::int as used,
         count(per.user_id)::int as members,
         count(per.user_id) filter (where per.adopted * 3 >= per.sent * 2)::int as "membersAtTarget"
  from w left join per on per.week_of = w.wk
  group by w.wk
  order by w.wk desc`;

export type Ratio = { num: number; den: number; value: number | null };
export type Cycle = { n: number; median: number | null; mean: number | null };
export type Adoption = { sent: number; marked: number; confirmed: number; adopted: number; installed: number; used: number; members: number; membersAtTarget: number };
export type MeasureWeek = {
  week: string;
  k: Ratio;
  /** By the referrer's generation: 0, 1, 2, 3 or more (GENERATIONS). */
  kByGen: Ratio[];
  /** `byGen` is by the member's own generation: 1, 2, 3 or more. */
  cycle: { all: Cycle; byGen: Cycle[] };
  paid: Ratio;
  adoption: Adoption;
};
export type CheckpointWeek = { week: string; num: number; den: number };
export type Checkpoint = {
  /** not_started: before the first week; in_progress: live, from the weeks begun; frozen: read from the snapshot. */
  state: "not_started" | "in_progress" | "frozen";
  weeksCounted: number;
  weeks: CheckpointWeek[];
  num: number;
  den: number;
  value: number | null;
  floor: number;
  status: "below" | "at_or_above" | null;
  frozenAt: string | null;
};
export type Measures = { weeks: MeasureWeek[]; waiting: { n: number; oldestDays: number | null }; checkpoint: Checkpoint };

export type MeasureOptions = { now: Date; adminEmails?: string[]; realNow?: Date };

const ratio = (num: number, den: number): Ratio => ({ num, den, value: den === 0 ? null : num / den });
const emptyCycle = (): Cycle => ({ n: 0, median: null, mean: null });

/** The last MEASURE_WEEKS Toronto Mondays up to the week of `now`, newest first. */
export function measureWeeks(now: Date): string[] {
  const monday = currentMonday(now);
  return Array.from({ length: MEASURE_WEEKS }, (_, i) => addDays(monday, -7 * i));
}

async function kRows(q: Query, weeks: string[], admins: string[]) {
  return q<{ week: string; num: number; den: number; num_g: number[]; den_g: number[] }>(K_SQL, [weeks, admins]);
}

function checkpointFrom(weeks: CheckpointWeek[], state: Checkpoint["state"], frozenAt: string | null): Checkpoint {
  const num = weeks.reduce((n, w) => n + w.num, 0);
  const den = weeks.reduce((n, w) => n + w.den, 0);
  const { floor } = decemberCheckpoint;
  return {
    state,
    weeksCounted: weeks.length,
    weeks,
    num,
    den,
    value: den === 0 ? null : num / den,
    floor,
    status: den === 0 ? null : num >= floor * den ? "at_or_above" : "below",
    frozenAt,
  };
}

/** The checkpoint's weeks that have begun by `now`, oldest first. */
function checkpointWeeksBegun(now: Date): string[] {
  return decemberCheckpoint.weeks.filter((w) => wallToInstant(w, "00:00").getTime() <= now.getTime());
}

async function liveCheckpointWeeks(q: Query, weeks: string[], admins: string[]): Promise<CheckpointWeek[]> {
  if (weeks.length === 0) return [];
  const rows = await kRows(q, weeks, admins);
  return rows.map((r) => ({ week: r.week, num: r.num, den: r.den })).sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * The December 14 checkpoint, frozen once (Key Technical Decisions; feasibility
 * review 8). At or after `frozenFrom` 00:00 Toronto, by the job clock and
 * never ahead of the real clock (`realNow`, default the system clock), the
 * first call computes the pooled value with the live K_SQL and stores it with
 * its per-week counts under the checkpoint key, `on conflict do nothing`, so
 * concurrent first calls store one row and later calls never change it.
 * Returns the stored snapshot, or null before December 14.
 *
 * Two single statements (Neon over HTTP has no transactions): the insert is
 * idempotent, and the read after it sees whichever insert won.
 */
export async function snapshotCheckpoint(q: Query, o: MeasureOptions): Promise<Checkpoint | null> {
  const at = new Date(Math.min(o.now.getTime(), (o.realNow ?? new Date()).getTime()));
  if (at.getTime() < wallToInstant(decemberCheckpoint.frozenFrom, "00:00").getTime()) return null;
  const read = () =>
    q<{ detail: { weeks: CheckpointWeek[] }; computed_at: string | Date }>(`select detail, computed_at from measure_snapshots where key = $1`, [decemberCheckpoint.key]);
  let [row] = await read();
  const admins = o.adminEmails ?? configuredAdmins();
  // Never freeze without the admin list: admins would count in the checkpoint for good (B3 Unit 3 review). The live value shows meanwhile.
  if (!row && admins.length === 0 && process.env.VERCEL_ENV === "production") return null;
  if (!row) {
    const weeks = await liveCheckpointWeeks(q, [...decemberCheckpoint.weeks], admins);
    const c = checkpointFrom(weeks, "frozen", null);
    await q(
      `insert into measure_snapshots (key, value, detail, computed_at)
       values ($1, case when $3::int = 0 then null else $2::int::numeric / $3::int end, $4::jsonb, coalesce($5::timestamptz, now()))
       on conflict (key) do nothing`,
      [decemberCheckpoint.key, c.num, c.den, JSON.stringify({ floor: c.floor, weeks }), at.toISOString()],
    );
    [row] = await read();
  }
  if (!row) return null;
  return checkpointFrom(row.detail.weeks, "frozen", new Date(row.computed_at).toISOString());
}

/** Every measure for the page, as of `now`. Takes the checkpoint snapshot when it's due (the page's only write). */
export async function loadMeasures(q: Query, o: MeasureOptions): Promise<Measures> {
  const admins = o.adminEmails ?? configuredAdmins();
  const weeks = measureWeeks(o.now);
  const [k, cycles, [waiting], paid, adoption, frozen] = await Promise.all([
    kRows(q, weeks, admins),
    q<{ week: string; gen: number | null; n: number; median: number; mean: number }>(CYCLE_SQL, [weeks, admins]),
    q<{ n: number; oldest: number | null }>(WAITING_SQL, [weeks, admins, o.now.toISOString()]),
    q<{ week: string; num: number; den: number }>(PAID_SQL, [weeks, admins]),
    q<Adoption & { week: string }>(ADOPTION_SQL, [weeks, admins]),
    snapshotCheckpoint(q, { ...o, adminEmails: admins }),
  ]);

  const byWeek = <T extends { week: string }>(rows: T[]) => new Map(rows.map((r) => [r.week, r]));
  const kw = byWeek(k);
  const pw = byWeek(paid);
  const aw = byWeek(adoption);
  const rows: MeasureWeek[] = weeks.map((week) => {
    const kr = kw.get(week);
    const pr = pw.get(week);
    const ar = aw.get(week);
    const cycle = { all: emptyCycle(), byGen: [emptyCycle(), emptyCycle(), emptyCycle()] };
    for (const c of cycles.filter((x) => x.week === week)) {
      const v = { n: c.n, median: c.median, mean: c.mean };
      if (c.gen === null) cycle.all = v;
      else cycle.byGen[c.gen - 1] = v;
    }
    return {
      week,
      k: ratio(kr?.num ?? 0, kr?.den ?? 0),
      kByGen: BUCKETS.map((g) => ratio(kr?.num_g[g] ?? 0, kr?.den_g[g] ?? 0)),
      cycle,
      paid: ratio(pr?.num ?? 0, pr?.den ?? 0),
      adoption: { sent: ar?.sent ?? 0, marked: ar?.marked ?? 0, confirmed: ar?.confirmed ?? 0, adopted: ar?.adopted ?? 0, installed: ar?.installed ?? 0, used: ar?.used ?? 0, members: ar?.members ?? 0, membersAtTarget: ar?.membersAtTarget ?? 0 },
    };
  });

  let checkpoint = frozen;
  if (!checkpoint) {
    const begun = checkpointWeeksBegun(o.now);
    checkpoint = checkpointFrom(await liveCheckpointWeeks(q, begun, admins), begun.length === 0 ? "not_started" : "in_progress", null);
  }
  return { weeks: rows, waiting: { n: waiting?.n ?? 0, oldestDays: waiting?.oldest ?? null }, checkpoint };
}
