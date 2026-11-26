import { adminEmails } from "@/lib/auth/admin-emails";
import type { Query } from "@/lib/db-query";

/**
 * The Interest page (spec B.12): "not ready" emails, cancellation reasons,
 * how many members are on each kind of account, and the sign-up funnel.
 */
export type Interest = {
  notReady: { email: string; createdAt: string }[];
  notOpen: number;
  cancelReasons: { reason: string; n: number }[];
  plans: { monthly: number; trial: number; sponsored: number };
  funnel: FunnelWeek[];
};

/**
 * One sign-up week of the funnel (plan 2026-11-26-001, Unit 9; origin R30):
 * the people whose account was made that week (Toronto, weeks start Monday),
 * and how many of them reached each stage so far.
 */
export type FunnelWeek = {
  /** The Monday the sign-up week starts, YYYY-MM-DD. */
  week: string;
  signedUp: number;
  /** A Zack key made, or a real run received from Zack (connector or upload). */
  zackConnected: number;
  /** The first held list's teaser (`users.first_teaser_at`). */
  firstTeaser: number;
  /** A card saved (`users.trial_started_at`, "card saved"). */
  cardSaved: number;
  /** The first monthly charge (`users.first_charge_at`). */
  firstCharge: number;
};

/** How many sign-up weeks the funnel shows, newest first. */
export const FUNNEL_WEEKS = 26;

/**
 * The last FUNNEL_WEEKS calendar weeks (Toronto, Monday to Sunday) up to the
 * week of `$1` (now), one row each, a week nobody signed up in included with
 * zeros (review fixes Unit 9, F6). Left out: sponsored members (never asked
 * for a card: the funnel measures the card asked for at the first list,
 * Strategy v3.1 decision 38, reversed by this plan) and admin accounts (`$2`,
 * ADMIN_EMAILS, as `closeAccount` identifies them). A deleted run does not
 * count as Zack connected.
 */
export const FUNNEL_SQL = `
  with weeks as (
    select (date_trunc('week', $1::timestamptz at time zone 'America/Toronto') - g * interval '1 week')::date as wk
    from generate_series(0, ${FUNNEL_WEEKS - 1}) g
  ),
  cohort as (
    select date_trunc('week', u.created_at at time zone 'America/Toronto')::date as wk, u.id, u.zack_key_created_at, u.first_teaser_at, u.trial_started_at, u.first_charge_at
    from users u
    where u.sponsor_id is null and lower(u.email) <> all($2::text[])
      and u.created_at >= ((select min(wk) from weeks)::timestamp at time zone 'America/Toronto')
  )
  select to_char(w.wk, 'YYYY-MM-DD') as week,
         count(c.id)::int as "signedUp",
         count(c.id) filter (where c.zack_key_created_at is not null
           or exists (select 1 from runs r where r.user_id = c.id and not r.is_test and r.status <> 'deleted' and r.route in ('connector', 'upload')))::int as "zackConnected",
         count(c.id) filter (where c.first_teaser_at is not null)::int as "firstTeaser",
         count(c.id) filter (where c.trial_started_at is not null)::int as "cardSaved",
         count(c.id) filter (where c.first_charge_at is not null)::int as "firstCharge"
  from weeks w left join cohort c on c.wk = w.wk
  group by w.wk
  order by w.wk desc`;

export async function loadInterest(q: Query, o: { now?: Date; admins?: string[] } = {}): Promise<Interest> {
  const notReady = await q<{ email: string; createdAt: string }>(
    `select email, created_at::text as "createdAt" from leads where kind = 'not_ready' order by created_at desc limit 500`,
  );
  const [open] = await q<{ n: number }>(`select count(*)::int as n from leads where kind = 'not_open'`);
  const cancelReasons = await q<{ reason: string; n: number }>(
    `select coalesce(nullif(trim(cancel_reason), ''), '(no answer)') as reason, count(*)::int as n from users
     -- A leftover switch to one at a time also waits on cancel_requested_at; it is not a cancellation.
     where (cancel_requested_at is not null and plan_change_to is distinct from 'per_run') or status = 'cancelled' group by 1 order by n desc, reason`,
  );
  // Monthly is the only plan (Unit 9): no one-at-a-time count. A leftover member who switched to monthly is "trial" in
  // the data until the first monthly charge: counted as monthly.
  const [plans] = await q<Interest["plans"]>(
    `select count(*) filter (where sponsor_id is null and plan = 'monthly' and (status = 'active' or (status = 'trial' and switched_from_per_run_at is not null)))::int as monthly,
            count(*) filter (where status = 'trial' and sponsor_id is null and switched_from_per_run_at is null)::int as trial,
            count(*) filter (where sponsor_id is not null and status in ('trial', 'active'))::int as sponsored
     from users`,
  );
  const funnel = await q<FunnelWeek>(FUNNEL_SQL, [(o.now ?? new Date()).toISOString(), o.admins ?? adminEmails()]);
  return { notReady, notOpen: open?.n ?? 0, cancelReasons, plans, funnel };
}
