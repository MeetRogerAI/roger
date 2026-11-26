import { isRealDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { HAS_CARD_OR_SPONSORED_SQL } from "@/lib/billing/has-card";

/**
 * Held lists (plan 2026-11-26-001, Unit 3; origin R8, R10). A trial with no
 * card and no sponsor has its Monday list picked as usual, but not delivered.
 * Until the card is saved the member sees the titles only: in the teaser
 * email, on `/app` and on the week's page.
 *
 * This file is the only reader of picks that were not delivered, and it
 * selects titles only: never the reason, the score, the steps or any other
 * detail. Everything else reads picks through `weekIdeas` (week.ts), which
 * returns delivered picks only. `src/lib/app/held.test.ts` scans `src/` to
 * keep it that way.
 */
export type HeldTeaser = { week: string; titles: string[]; count: number };

/**
 * A held week (aliases: `cw` cora_user_weeks, `u` users, `w` cora_weeks): a
 * real (not dry-run) picked or short week, not delivered and not replaced by
 * a newer one, of a week Cora finished, for a trial with no card and no
 * sponsor.
 */
export const HELD_WEEK_SQL = `(cw.user_id = u.id and w.week_of = cw.week_of
  and not cw.dry_run and cw.outcome in ('picked', 'short') and cw.delivered_at is null and cw.superseded_at is null
  and not w.dry_run and w.status in ('ready', 'sent')
  and u.status = 'trial' and not ${HAS_CARD_OR_SPONSORED_SQL("u")})`;

/** The titles of one held week, in order; empty when the week is not held for this user. Titles only. */
export async function heldTitles(q: Query, userId: string, week: string): Promise<string[]> {
  if (!isRealDate(week)) return [];
  const rows = await q<{ title: string }>(
    `select pp.title
     from cora_user_weeks cw join users u on u.id = cw.user_id join cora_weeks w on w.week_of = cw.week_of
       join picks k on k.user_id = cw.user_id and k.week_of = cw.week_of and not k.dry_run and k.delivered_at is null
       join pool_plays pp on pp.id = k.pool_play_id
     where cw.user_id = $1 and cw.week_of = $2::date and ${HELD_WEEK_SQL}
     order by k.position`,
    [userId, week],
  );
  return rows.map((r) => r.title);
}

/** The newest held week's titles (there is at most one: older ones are superseded when Cora picks), or null. Titles only. */
export async function heldTeaser(q: Query, userId: string): Promise<HeldTeaser | null> {
  const [h] = await q<{ week: string }>(
    `select to_char(cw.week_of, 'YYYY-MM-DD') as week
     from cora_user_weeks cw join users u on u.id = cw.user_id join cora_weeks w on w.week_of = cw.week_of
     where cw.user_id = $1 and ${HELD_WEEK_SQL}
     order by cw.week_of desc limit 1`,
    [userId],
  );
  if (!h) return null;
  const titles = await heldTitles(q, userId, h.week);
  return titles.length ? { week: h.week, titles, count: titles.length } : null;
}

/** The teaser's heading (origin R8): three ideas, or fewer on a short week. */
export const heldHeading = (count: number) => (count >= 3 ? "Your first 3 ideas are ready" : "Your first ideas are ready");

/** The teaser's button. */
export const HELD_BUTTON = "Add your card to see them";
