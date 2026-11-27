import { statusLine } from "@/lib/app/status";
import { displayCredit } from "@/lib/billing/credit-display";
import { contributionStatus } from "@/lib/billing/contribution";
import { HAS_CARD_SQL } from "@/lib/billing/has-card";
import type { Currency } from "@/lib/billing/prices";
import type { Query } from "@/lib/db-query";
import type { V3Settings } from "@/lib/v3-settings";
import { actionsForUser, type LoggedAction } from "./log";
import { userPicks, type UserPick } from "./cora";
import { loadOps, type OpsRow } from "./ops";
import { listRuns, type RunListItem } from "./runs";
import { creditBalance } from "@/lib/referrals/credit-balance";

/** One referral credit ledger row, as the admin user page lists it (B2 Unit 4). */
export type CreditLine = {
  id: string;
  kind: string;
  status: string;
  amountCents: number;
  offsetCents: number;
  uncollectedCents: number;
  currency: Currency;
  reason: string | null;
  stripeTxn: string | null;
  createdAt: string;
  postedAt: string | null;
};

/** Everything about one person (spec B.12 Users): profile, plan, runs, ideas, emails and the admin log. */
export type UserDetail = {
  row: OpsRow;
  week: string;
  profile: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
  timezone: string;
  agent: string;
  stripeSubscription: string | null;
  statusLine: string;
  runs: RunListItem[];
  picks: UserPick[];
  emails: { kind: string; ref: string; status: string; at: string }[];
  log: LoggedAction[];
  contributor: { id: string; label: string } | null;
  contributors: { id: string; label: string; userId: string | null }[];
  /** Their referral credit ledger rows, newest first, and the cached balance (read-only). */
  credits: CreditLine[];
  creditBalance: Awaited<ReturnType<typeof creditBalance>>;
};

type U = {
  status: string;
  plan: "monthly" | "per_run";
  sponsored: boolean;
  sharing: "share" | "match_only" | "off";
  currency: Currency | null;
  free_lists_used: number;
  quote: { totalCents: number; currency: Currency; week: string } | null;
  first_charge_at: string | null;
  access_ends_at: string | null;
  profile: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
  timezone: string;
  agent: string;
  stripe_subscription: string | null;
  hold_reason: string | null;
  renewal_failed_at: string | null;
  switching_at: string | null;
  ending_at: string | null;
  switched: boolean;
  has_card: boolean;
  first_teaser_at: string | null;
};

/** The status line the member sees right now (the same function as the Monday email and /app). */
export async function memberStatusLine(q: Query, userId: string, s: V3Settings, now: Date): Promise<string | null> {
  const [u] = await q<U>(USER_SQL, [userId]);
  return u ? lineFor(q, userId, u, s, now) : null;
}

const USER_SQL = `select status, plan, (sponsor_id is not null) as sponsored, sharing, currency, free_lists_used, quote, first_charge_at::text, access_ends_at::text,
  profile, created_at::text, created_by, timezone, agent, stripe_subscription, hold_reason, renewal_failed_at::text,
  case when plan_change_to = 'per_run' and cancel_requested_at is not null then access_ends_at::text end as switching_at,
  case when status = 'active' and cancel_requested_at is not null and plan_change_to is distinct from 'per_run' then access_ends_at::text end as ending_at,
  switched_from_per_run_at is not null as switched, ${HAS_CARD_SQL("users")} as has_card, first_teaser_at::text from users where id = $1`;

async function lineFor(q: Query, userId: string, u: U, s: V3Settings, now: Date): Promise<string> {
  const contribution = u.status === "active" && u.plan === "monthly" ? await contributionStatus(q, userId, s, now).catch(() => null) : null;
  return statusLine(
    {
      status: u.status,
      plan: u.plan,
      sponsored: u.sponsored,
      sharing: u.sharing,
      currency: u.currency,
      freeListsUsed: u.free_lists_used,
      freeRuns: s.freeRuns,
      quote: u.quote,
      firstChargeAt: u.first_charge_at,
      orderCents: null,
      accessEndsAt: u.access_ends_at,
      holdReason: u.hold_reason,
      renewalFailedAt: u.renewal_failed_at,
      switchingAt: u.switching_at,
      endingAt: u.ending_at,
      switchedFromPerRun: u.switched,
      hasCard: u.has_card,
      firstTeaserAt: u.first_teaser_at,
      contribution,
      // The member's own line (B2 plan Unit 5): referral credit for a told first charge.
      credit: u.quote ? await displayCredit(q, userId, now) : null,
      now,
    },
    s,
  );
}

export async function userDetail(q: Query, userId: string, s: V3Settings, now: Date): Promise<UserDetail | null> {
  const [u] = await q<U>(USER_SQL, [userId]);
  if (!u) return null;
  const { week, rows } = await loadOps(q, { now, settings: s, userId });
  const row = rows[0];
  if (!row) return null;
  const [runs, picks, emails, log, contributors, credits, balance] = await Promise.all([
    listRuns(q, { userId, limit: 30 }),
    userPicks(q, userId),
    q<{ kind: string; ref: string; status: string; at: string }>(
      `select kind, ref, status, coalesce(sent_at, claimed_at)::text as at from notifications where recipient = $1 order by claimed_at desc limit 60`,
      [userId],
    ),
    actionsForUser(q, userId),
    q<{ id: string; label: string; userId: string | null }>(`select id, label, user_id as "userId" from seed_contributors order by label`),
    q<CreditLine>(
      `select id, kind, status, amount_cents as "amountCents", offset_cents as "offsetCents", uncollected_cents as "uncollectedCents", currency, reason,
         stripe_txn as "stripeTxn", created_at::text as "createdAt", posted_at::text as "postedAt"
       from credits where user_id = $1 order by created_at desc, id limit 100`,
      [userId],
    ),
    creditBalance(q, userId),
  ]);
  const mine = contributors.find((c) => c.userId === userId);
  return {
    row,
    week,
    profile: u.profile ?? {},
    createdAt: u.created_at,
    createdBy: u.created_by,
    timezone: u.timezone,
    agent: u.agent,
    stripeSubscription: u.stripe_subscription,
    statusLine: await lineFor(q, userId, u, s, now),
    runs,
    picks,
    emails,
    log,
    contributor: mine ? { id: mine.id, label: mine.label } : null,
    contributors,
    credits,
    creditBalance: balance,
  };
}
