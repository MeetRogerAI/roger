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
 * Sponsored members never need a card, so they are left out: the funnel
 * measures the card asked for at the first list (Strategy v3.1 decision 38,
 * reversed by this plan).
 */
export const FUNNEL_SQL = `
  select to_char(date_trunc('week', u.created_at at time zone 'America/Toronto'), 'YYYY-MM-DD') as week,
         count(*)::int as "signedUp",
         count(*) filter (where u.zack_key_created_at is not null
           or exists (select 1 from runs r where r.user_id = u.id and not r.is_test and r.route in ('connector', 'upload')))::int as "zackConnected",
         count(*) filter (where u.first_teaser_at is not null)::int as "firstTeaser",
         count(*) filter (where u.trial_started_at is not null)::int as "cardSaved",
         count(*) filter (where u.first_charge_at is not null)::int as "firstCharge"
  from users u
  where u.sponsor_id is null
  group by 1
  order by 1 desc
  limit ${FUNNEL_WEEKS}`;

export async function loadInterest(q: Query): Promise<Interest> {
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
  const funnel = await q<FunnelWeek>(FUNNEL_SQL);
  return { notReady, notOpen: open?.n ?? 0, cancelReasons, plans, funnel };
}
