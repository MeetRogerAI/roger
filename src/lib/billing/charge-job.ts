import { isAtOrPast } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { sendToUser } from "@/lib/mail/send";
import { chargeDateMovedEmail } from "@/lib/mail/templates/charges";
import { chargeFirst, nextChargeMonday, type ChargeDeps, type FirstOutcome } from "./first-charge";
import { chargeOrders, type OrderOutcome } from "./orders";

/**
 * The Monday charge job (spec B.8 step 1): at or after the charge time, on a
 * week Cora marked ready, start the subscription for every monthly trial user
 * whose third list is ready. Safe to run twice: each charge is a claim. Orders
 * (one list at a time) are charged by Unit 12b.
 */
export type ChargeJobResult = {
  week: string;
  status: "skipped" | "done";
  note?: string;
  first?: Record<FirstOutcome, number>;
  orders?: Record<OrderOutcome, number>;
  dateMoved?: number;
};

export async function runChargeJob(q: Query, d: ChargeDeps, o: { week: string }): Promise<ChargeJobResult> {
  const { week } = o;
  if (!d.settings.cycleLive) return { week, status: "skipped", note: "The cycle is not live." };
  if (!isAtOrPast(d.now, week, d.settings.chargeAt)) return { week, status: "skipped", note: `Before ${d.settings.chargeAt}.` };
  const [w] = await q<{ status: string; dry_run: boolean }>(`select status, dry_run from cora_weeks where week_of = $1`, [week]);
  // Nobody is charged for a week Cora has not finished, or for a dry run.
  if (!w || w.dry_run || (w.status !== "ready" && w.status !== "sent")) return { week, status: "skipped", note: "Cora's week is not ready." };

  // The third list: a monthly trial user who has had the free lists and has picks this week (two ideas still count, R14).
  const due = await q<{ id: string }>(
    `select u.id from users u join cora_user_weeks cw on cw.user_id = u.id and cw.week_of = $1 and not cw.dry_run
     where u.status = 'trial' and u.plan = 'monthly' and u.cancel_requested_at is null and u.stripe_subscription is null
       and u.sponsor_id is null and u.free_lists_used >= $2 and cw.outcome in ('picked', 'short')
     order by u.id`,
    [week, d.settings.freeRuns],
  );
  const first: Record<FirstOutcome, number> = { charged: 0, declined: 0, held_amount: 0, unknown: 0, error: 0, skipped: 0, open: 0 };
  for (const u of due) {
    try {
      first[await chargeFirst(q, d, u.id, week)]++;
    } catch (e) {
      // A failure before Stripe was reached leaves the claim open; the hourly pass takes it over after 15 minutes.
      console.error("[charge] first charge", u.id, e instanceof Error ? e.message : e);
      first.unknown++;
    }
  }

  // The announced Monday passed without a third list: one note with the next possible date. No eligible plays
  // ('none'), or no run by the cutoff ('not_eligible': a trial with no run is the only trial Cora passes over).
  const moved = await q<{ id: string; email: string; outcome: string }>(
    `select u.id, u.email, cw.outcome from users u join cora_user_weeks cw on cw.user_id = u.id and cw.week_of = $1 and not cw.dry_run
     where u.status = 'trial' and u.plan = 'monthly' and u.free_lists_used >= $2 and u.sponsor_id is null and u.cancel_requested_at is null
       and u.stripe_subscription is null and cw.outcome in ('none', 'not_eligible')`,
    [week, d.settings.freeRuns],
  );
  for (const u of moved) {
    const reason = u.outcome === "none" ? "no_plays" : "no_run";
    await sendToUser({ id: u.id, email: u.email }, "charge_date_moved", week, chargeDateMovedEmail({ nextMonday: nextChargeMonday(week), reason }), d).catch(() => {});
  }
  const orders = d.orders ? await chargeOrders(q, { ...d, orders: d.orders }, week) : undefined;
  return { week, status: "done", first, orders, dateMoved: moved.length };
}
