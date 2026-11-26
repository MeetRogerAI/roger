import type { Query } from "@/lib/db-query";
import { MAX_ATTEMPTS } from "@/lib/mail/send";
import { FIRST_LIST_PENDING_SQL } from "./deliver";
import { deliverAndTell, usersFor, type SendDeps } from "./send-job";

/**
 * The unlock (plan 2026-11-26-001, Unit 5): once a trial's card is saved, its
 * newest held list is delivered at once, as free list 1, with the Monday list
 * email. It is decided from stored state ("card saved, and the newest live
 * list not delivered, or delivered without its email"), never from which call
 * saved the card, so the return page, the webhook, Stripe's retries and the
 * hourly `unlock_pending` sweep all do the same thing and only the first one
 * changes anything.
 *
 * Delivery goes through `deliverAndTell` (send-job.ts), so DELIVERABLE_SQL
 * still decides: a superseded week is never delivered, and while Cora is still
 * picking a newer week for the member nothing is delivered (that week, once
 * ready, is the one the Monday send or this sweep delivers). There is no
 * 8-day window: a held list of any age is unlocked.
 */

/** SQL (aliases `cw` cora_user_weeks, `w` cora_weeks, `u` users): a real, live list of a week Cora finished, for this user. */
const LIVE_WEEK_SQL = `(cw.user_id = u.id and w.week_of = cw.week_of and not cw.dry_run and cw.outcome in ('picked', 'short')
  and cw.superseded_at is null and not w.dry_run and w.status in ('ready', 'sent'))`;

/** SQL (aliases as above): a trial whose card is saved (unsponsored: a sponsored trial is never held). */
const CARDED_TRIAL_SQL = `(u.status = 'trial' and u.sponsor_id is null and u.trial_started_at is not null)`;

/** SQL (aliases as above): `cw` is the first list this user ever had delivered, delivered since the card was saved. */
const FIRST_DELIVERED_SINCE_CARD_SQL = `(cw.delivered_at is not null and cw.delivered_at >= u.trial_started_at
  and not exists (select 1 from cora_user_weeks e where e.user_id = u.id and not e.dry_run and e.delivered_at is not null and e.week_of < cw.week_of))`;

/** SQL: the Monday email for `cw`'s week is sent, skipped, given up on, or being sent right now. */
const LIST_EMAIL_SETTLED_SQL = `exists (select 1 from notifications n where n.recipient = u.id::text and n.kind = 'monday_list' and n.ref = to_char(cw.week_of, 'YYYY-MM-DD')
  and (n.status in ('sent', 'skipped') or (n.status = 'sending' and n.claimed_at > now() - interval '15 minutes') or (n.status = 'failed' and n.attempts >= ${MAX_ATTEMPTS})))`;

/**
 * The week the card unlocks for this user, or null: with nothing delivered
 * yet, the newest live list; otherwise the first list delivered since the
 * card, while its email is still owed.
 */
export async function unlockWeek(q: Query, userId: string): Promise<{ week: string; delivered: boolean } | null> {
  const [r] = await q<{ week: string; delivered: boolean }>(
    `select to_char(cw.week_of, 'YYYY-MM-DD') as week, cw.delivered_at is not null as delivered
     from cora_user_weeks cw join users u on u.id = cw.user_id join cora_weeks w on w.week_of = cw.week_of
     where cw.user_id = $1 and ${LIVE_WEEK_SQL} and ${CARDED_TRIAL_SQL}
       and ((cw.delivered_at is null and ${FIRST_LIST_PENDING_SQL("u")})
            or (${FIRST_DELIVERED_SINCE_CARD_SQL} and not ${LIST_EMAIL_SETTLED_SQL}))
     order by cw.week_of desc limit 1`,
    [userId],
  );
  return r ?? null;
}

/** The unlocked list's email failed: thrown so the webhook answers 500 and Stripe sends the event again (the hourly sweep also retries). */
export class UnlockEmailNotSent extends Error {
  constructor(public week: string) {
    super(`The unlocked list's email for ${week} was not sent`);
  }
}

/**
 * Delivers the unlocked list and makes sure its email went. Returns the week
 * delivered (now or before), or null when there is nothing to unlock now (no
 * held list, or Cora is still picking a newer week). Throws UnlockEmailNotSent
 * when the list is delivered but its email failed and will be tried again.
 */
export async function deliverUnlock(q: Query, d: SendDeps, userId: string): Promise<string | null> {
  const target = await unlockWeek(q, userId);
  if (!target) return null;
  const [row] = await usersFor(q, target.week, [userId]);
  if (!row) return null;
  await deliverAndTell(q, d, row, target.week);
  const [after] = await q<{ delivered: boolean; email: string | null; attempts: number | null; fresh: boolean | null }>(
    `select exists (select 1 from picks k where k.user_id = $1 and k.week_of = $2::date and not k.dry_run and k.delivered_at is not null) as delivered,
            n.status as email, n.attempts, n.claimed_at > now() - interval '15 minutes' as fresh
     from (select 1) one left join notifications n on n.recipient = $1::uuid::text and n.kind = 'monday_list' and n.ref = $2`,
    [userId, target.week],
  );
  if (!after?.delivered) return null;
  const settled =
    after.email === "sent" || after.email === "skipped" || (after.email === "sending" && after.fresh === true) || (after.email === "failed" && Number(after.attempts) >= MAX_ATTEMPTS);
  if (!settled) throw new UnlockEmailNotSent(target.week);
  return target.week;
}

/** The newest week this user has had delivered (the page a saved card lands on), or null. */
export async function newestDeliveredWeek(q: Query, userId: string): Promise<string | null> {
  const [r] = await q<{ week: string | null }>(
    `select to_char(max(week_of), 'YYYY-MM-DD') as week from cora_user_weeks where user_id = $1 and not dry_run and delivered_at is not null`,
    [userId],
  );
  return r?.week ?? null;
}

/** How many unlocks one hourly pass handles at most. */
export const MAX_UNLOCKS = 50;

/**
 * The hourly `unlock_pending` sweep: trials whose card was saved after a held
 * list (`first_teaser_at` set) and whose unlock is not finished (the newest
 * live list undelivered, or delivered without its email). Covers a return page
 * that was closed, a webhook that kept failing, and held lists older than
 * `deliverLate`'s 8 days. Job clock; at most MAX_UNLOCKS a pass; stops at the
 * deadline.
 */
export async function sendPendingUnlocks(q: Query, d: SendDeps & { deadline?: number }): Promise<number> {
  const due = await q<{ id: string }>(
    `select u.id from users u
     where ${CARDED_TRIAL_SQL} and u.first_teaser_at is not null
       and exists (select 1 from cora_user_weeks cw join cora_weeks w on w.week_of = cw.week_of
                   where ${LIVE_WEEK_SQL}
                     and ((cw.delivered_at is null and ${FIRST_LIST_PENDING_SQL("u")})
                          or (${FIRST_DELIVERED_SINCE_CARD_SQL} and not ${LIST_EMAIL_SETTLED_SQL})))
     order by u.trial_started_at, u.id
     limit $1`,
    [MAX_UNLOCKS],
  );
  let done = 0;
  for (const { id } of due) {
    if (d.deadline && Date.now() >= d.deadline) break;
    try {
      if (await deliverUnlock(q, d, id)) done++;
    } catch (e) {
      console.error("[hourly] unlock", id, e instanceof Error ? e.message : e);
    }
  }
  return done;
}
