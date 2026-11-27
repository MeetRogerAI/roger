import type { Query } from "@/lib/db-query";
import { contributionStatus } from "@/lib/billing/contribution";
import { displayCredit } from "@/lib/billing/credit-display";
import type { Currency } from "@/lib/billing/prices";
import type { V3Settings } from "@/lib/v3-settings";
import { HAS_CARD_SQL } from "@/lib/billing/has-card";
import { adjustmentLine, statusLine, statusLink, type StatusFacts } from "./status";
import { heldTeaser, type HeldTeaser } from "./held";
import { bricks, latestWeek, weekIdeas, type WeekIdea } from "./week";

/** What the signed-in pages need about one user, read once per request. */
export type Home = {
  status: string;
  plan: "monthly" | "per_run";
  statusLine: string;
  /** The link that goes with the status line (a held list's Payment page), if any. */
  statusLink: { href: string; label: string } | null;
  /** The second-miss banner (spec B.9 notice 4), with the fix. */
  missBanner: string | null;
  week: string | null;
  ideas: WeekIdea[];
  /** No card yet: the newest held list's titles (plan 2026-11-26-001, Unit 3). Titles only; never details. */
  held: HeldTeaser | null;
  bricks: { marked: number; confirmed: number };
};

type U = {
  status: string;
  plan: "monthly" | "per_run";
  sponsored: boolean;
  sharing: StatusFacts["sharing"];
  currency: Currency | null;
  free_lists_used: number;
  quote: StatusFacts["quote"];
  first_charge_at: string | null;
  stripe_subscription: string | null;
  access_ends_at: string | null;
  hold_reason: string | null;
  renewal_failed_at: string | null;
  switching_at: string | null;
  ending_at: string | null;
  switched: boolean;
  has_card: boolean;
  first_teaser_at: string | null;
};

export async function loadHome(q: Query, userId: string, s: V3Settings, now: Date, week?: string): Promise<Home | null> {
  const [u] = await q<U>(
    `select status, plan, (sponsor_id is not null) as sponsored, sharing, currency, free_lists_used, quote, first_charge_at::text, stripe_subscription, access_ends_at::text,
            hold_reason, renewal_failed_at::text, case when plan_change_to = 'per_run' and cancel_requested_at is not null then access_ends_at::text end as switching_at,
            case when status = 'active' and cancel_requested_at is not null and plan_change_to is distinct from 'per_run' then access_ends_at::text end as ending_at, switched_from_per_run_at is not null as switched,
            ${HAS_CARD_SQL("users")} as has_card, first_teaser_at::text
     from users where id = $1`,
    [userId],
  );
  if (!u) return null;
  const shown = week ?? (await latestWeek(q, userId));
  const ideas = shown ? await weekIdeas(q, userId, shown, s.playbookPreface) : [];
  const [order] = shown ? await q<{ amount_cents: number | null }>(`select amount_cents from orders where user_id = $1 and week_of = $2`, [userId, shown]) : [];
  const contribution = u.status === "active" && u.plan === "monthly" ? await contributionStatus(q, userId, s, now) : null;
  const facts: StatusFacts = {
    contribution,
    status: u.status,
    plan: u.plan,
    sponsored: u.sponsored,
    sharing: u.sharing,
    currency: u.currency,
    freeListsUsed: u.free_lists_used,
    freeRuns: s.freeRuns,
    quote: u.quote,
    firstChargeAt: u.first_charge_at,
    orderCents: order?.amount_cents ?? null,
    accessEndsAt: u.access_ends_at,
    holdReason: u.hold_reason,
    renewalFailedAt: u.renewal_failed_at,
    switchingAt: u.switching_at,
    endingAt: u.ending_at,
    switchedFromPerRun: u.switched,
    hasCard: u.has_card,
    firstTeaserAt: u.first_teaser_at,
    // Referral credit for a told first charge (B2 plan Unit 5); only read when there is one.
    credit: u.quote ? await displayCredit(q, userId, now) : null,
    now,
  };
  const line = statusLine(facts, s);
  // Spec B.9 notice 4: after a second miss, a banner on /app as well as the strip.
  const banner = adjustmentLine(contribution, s, u.currency ?? "USD");
  const held = !week && !ideas.length && u.status === "trial" && !u.has_card && !u.sponsored ? await heldTeaser(q, userId) : null;
  // One call to action for a held list (plan 2026-11-26-001, Unit 9): the held block's button. The line's own link
  // stays only for the rare moment the line asks for the card with no held titles to show.
  const link = held ? null : statusLink(facts);
  return { status: u.status, plan: u.plan, statusLine: line, statusLink: link, missBanner: banner, week: shown, ideas, held, bricks: await bricks(q, userId) };
}
