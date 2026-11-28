import type { Query } from "@/lib/db-query";
import { NO_CARD_FLOW_FROM } from "@/lib/billing/no-card";
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

/**
 * SQL (aliases as above): `cw` is the first list this user ever had delivered.
 * Decided by order, not by comparing clocks: `delivered_at` is the clock of
 * whichever job delivered it and `trial_started_at` another caller's, so
 * "delivered since the card" could strand the email. A held-list trial cannot
 * have had anything delivered before its card, so its first-ever list is the
 * unlocked one.
 */
const FIRST_DELIVERED_SQL = `(cw.delivered_at is not null
  and not exists (select 1 from cora_user_weeks e where e.user_id = u.id and not e.dry_run and e.delivered_at is not null and e.week_of < cw.week_of))`;

/**
 * SQL (alias `n` notifications): the list email is settled: sent, skipped,
 * given up on, or being sent right now. `clock` is the job clock parameter
 * (e.g. "$2"). `claimed_at` is written by sendToUser with the database's
 * now(), so a send in flight counts as fresh within 15 minutes of either
 * clock (on production they agree; an "as of" run never retries a send that
 * is under way).
 */
const EMAIL_SETTLED_SQL = (clock: string) => `(n.status in ('sent', 'skipped')
  or (n.status = 'sending' and n.claimed_at > least(coalesce(${clock}::timestamptz, now()), now()) - interval '15 minutes')
  or (n.status = 'failed' and n.attempts >= ${MAX_ATTEMPTS}))`;

/** The kinds a delivered list's email goes out as: the Monday list, or (a charged one-list order) the receipt. */
const LIST_EMAIL_KINDS = `('monday_list', 'order_receipt')`;

/** SQL (aliases as above): the email for `cw`'s week is settled (EMAIL_SETTLED_SQL), under either kind. */
const LIST_EMAIL_SETTLED_SQL = (clock: string) =>
  `exists (select 1 from notifications n where n.recipient = u.id::text and n.kind in ${LIST_EMAIL_KINDS} and n.ref = to_char(cw.week_of, 'YYYY-MM-DD')
  and ${EMAIL_SETTLED_SQL(clock)})`;

/**
 * SQL (alias `u`): a card saved in the card-at-the-first-list flow, the only
 * members the hourly sweep unlocks for (whole-branch review W5): teasered
 * (`first_teaser_at`, only this flow sets it), or the card saved on or after
 * NO_CARD_FLOW_FROM (`from`, a parameter). An old-flow trial (card at sign-up,
 * a leftover preview account) is left to the Monday send, so the first hourly
 * pass after the deploy never emails it an old list.
 */
export const NEW_FLOW_CARD_SQL = (from: string) => `(u.first_teaser_at is not null or u.trial_started_at >= ${from}::timestamptz)`;

/**
 * SQL (aliases `cw`, `w`, `u`): `cw` is the list this user's saved card
 * unlocks and the unlock is not finished: with nothing delivered yet, a live
 * undelivered list (the caller takes the newest); otherwise the first list
 * ever delivered, while its email is still owed. Shared by `unlockWeek` and
 * the hourly sweep, so both pick the same users. `clock` is the job clock
 * parameter.
 */
export const UNLOCK_DUE_SQL = (clock: string) => `(${LIVE_WEEK_SQL} and ${CARDED_TRIAL_SQL}
  and ((cw.delivered_at is null and ${FIRST_LIST_PENDING_SQL("u")})
       or (${FIRST_DELIVERED_SQL} and not ${LIST_EMAIL_SETTLED_SQL(clock)})))`;

/**
 * The week the card unlocks for this user, or null: with nothing delivered
 * yet, the newest live list; otherwise the first list ever delivered, while
 * its email is still owed (UNLOCK_DUE_SQL). `now` is the job clock.
 */
export async function unlockWeek(q: Query, userId: string, now?: Date): Promise<{ week: string; delivered: boolean } | null> {
  const [r] = await q<{ week: string; delivered: boolean }>(
    `select to_char(cw.week_of, 'YYYY-MM-DD') as week, cw.delivered_at is not null as delivered
     from cora_user_weeks cw join users u on u.id = cw.user_id join cora_weeks w on w.week_of = cw.week_of
     where cw.user_id = $1 and ${UNLOCK_DUE_SQL("$2")}
     order by cw.week_of desc limit 1`,
    [userId, now ? now.toISOString() : null],
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
  const target = await unlockWeek(q, userId, d.now);
  if (!target) return null;
  const [row] = await usersFor(q, target.week, [userId]);
  if (!row) return null;
  await deliverAndTell(q, d, row, target.week);
  const [after] = await q<{ delivered: boolean; settled: boolean }>(
    `select exists (select 1 from picks k where k.user_id = $1 and k.week_of = $2::date and not k.dry_run and k.delivered_at is not null) as delivered,
            exists (select 1 from notifications n where n.recipient = $1::uuid::text and n.kind in ${LIST_EMAIL_KINDS} and n.ref = $2::text
                    and ${EMAIL_SETTLED_SQL("$3")}) as settled`,
    [userId, target.week, d.now ? d.now.toISOString() : null],
  );
  if (!after?.delivered) return null;
  if (!after.settled) throw new UnlockEmailNotSent(target.week);
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
 * A member the sweep tried this recently is skipped. Shorter than the hour
 * between passes, so a stuck member is tried once each hourly pass, never
 * twice in one hour (a re-run), and never ahead of members not tried yet.
 */
export const UNLOCK_COOL_DOWN = "50 minutes";

/**
 * The hourly `unlock_pending` sweep: trials with a saved card whose unlock is
 * not finished (UNLOCK_DUE_SQL: the newest live list undelivered while nothing
 * has been delivered yet, or the first list delivered without its email). This
 * includes a card saved before any teaser went out (`first_teaser_at` null)
 * whose first list is held. Covers a return page that was closed, a webhook
 * that kept failing, and held lists older than `deliverLate`'s 8 days.
 *
 * Each attempt stamps `users.unlock_attempted_at` (job clock) first, and the
 * pass takes members never tried, then the longest since their last try,
 * skipping those tried within UNLOCK_COOL_DOWN: members whose unlock keeps
 * failing cannot hold all MAX_UNLOCKS places and starve the rest. Stops at the
 * deadline. Only new-flow cards (NEW_FLOW_CARD_SQL, whole-branch review W5).
 */
export async function sendPendingUnlocks(q: Query, d: SendDeps & { deadline?: number }): Promise<number> {
  const clock = d.now ? d.now.toISOString() : null;
  const due = await q<{ id: string }>(
    `select u.id from users u
     where ${CARDED_TRIAL_SQL} and ${NEW_FLOW_CARD_SQL("$3")}
       and (u.unlock_attempted_at is null or u.unlock_attempted_at <= coalesce($2::timestamptz, now()) - interval '${UNLOCK_COOL_DOWN}')
       and exists (select 1 from cora_user_weeks cw join cora_weeks w on w.week_of = cw.week_of where ${UNLOCK_DUE_SQL("$2")})
     order by u.unlock_attempted_at nulls first, u.trial_started_at, u.id
     limit $1`,
    [MAX_UNLOCKS, clock, NO_CARD_FLOW_FROM],
  );
  let done = 0;
  for (const { id } of due) {
    if (d.deadline && Date.now() >= d.deadline) break;
    try {
      await q(`update users set unlock_attempted_at = coalesce($2::timestamptz, now()) where id = $1`, [id, clock]);
      if (await deliverUnlock(q, d, id)) done++;
    } catch (e) {
      console.error("[hourly] unlock", id, e instanceof Error ? e.message : e);
    }
  }
  return done;
}
