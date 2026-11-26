import type { Query } from "@/lib/db-query";

/**
 * "Has a card" (plan 2026-11-26-001, Unit 1). Sign-up ends without a card, so
 * a trial account may have none: `status = 'trial'` with `trial_started_at`
 * null. `trial_started_at` keeps its meaning, "card saved".
 *
 * - A trial has a card once `trial_started_at` is set.
 * - Every other live status (active, held, cancelled) got there through a
 *   saved card, so it counts as having one.
 * - signup and closed never count.
 *
 * "Has card or sponsored" adds sponsored members (`sponsor_id` set), who never
 * need a card. Every place that asks "may this account be quoted, charged,
 * delivered to or given a card update" uses one of these, in SQL or in code,
 * so the rule lives in one place.
 */

/** The statuses that only exist after a card was saved. */
export const CARDED_STATUSES = ["active", "held", "cancelled"] as const;

/** SQL: the account `alias` (a users row) has a saved card. */
export const HAS_CARD_SQL = (alias = "u") =>
  `(${alias}.status in (${CARDED_STATUSES.map((s) => `'${s}'`).join(", ")}) or (${alias}.status = 'trial' and ${alias}.trial_started_at is not null))`;

/** SQL: the account `alias` has a saved card, or is sponsored and needs none. */
export const HAS_CARD_OR_SPONSORED_SQL = (alias = "u") => `(${HAS_CARD_SQL(alias)} or ${alias}.sponsor_id is not null)`;

/** SQL: the account `alias` is a trial still waiting for its card: no card and no sponsor (mirrors isNoCardTrial). */
export const NO_CARD_TRIAL_SQL = (alias = "u") => `(${alias}.status = 'trial' and not ${HAS_CARD_OR_SPONSORED_SQL(alias)})`;

export type CardFacts = {
  status: string;
  /** users.trial_started_at: when the card was saved. */
  trialStartedAt: string | Date | null;
  /** users.sponsor_id is not null. */
  sponsored?: boolean;
};

/** The account has a saved card (mirrors HAS_CARD_SQL). */
export function hasCard(f: Pick<CardFacts, "status" | "trialStartedAt">): boolean {
  if ((CARDED_STATUSES as readonly string[]).includes(f.status)) return true;
  return f.status === "trial" && f.trialStartedAt != null;
}

/** The account has a saved card, or is sponsored (mirrors HAS_CARD_OR_SPONSORED_SQL). */
export function hasCardOrSponsored(f: CardFacts): boolean {
  return hasCard(f) || Boolean(f.sponsored);
}

/** A trial still waiting for its card: no card and not sponsored. */
export const isNoCardTrial = (f: CardFacts) => f.status === "trial" && !hasCardOrSponsored(f);

/** Reads the user and says whether it is a trial still waiting for its card (false for an unknown id). */
export async function isNoCardTrialUser(q: Query, userId: string): Promise<boolean> {
  const rows = await q<{ ok: boolean }>(`select ${NO_CARD_TRIAL_SQL("u")} as ok from users u where u.id = $1`, [userId]);
  return rows[0]?.ok === true;
}

/** What admin actions that need a card say for a trial without one. */
export const WAITING_FOR_CARD = "Waiting for the member’s card.";
