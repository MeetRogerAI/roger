import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins } from "@/lib/mail/send";
import type { AdjustDeps } from "./adjustment";

/**
 * The daily reconcile (plan Key Technical Decisions: "The daily reconcile
 * deletes any pending item with no matching stored id"). Stripe's documents
 * disagree on what happens to a leftover pending item, so the app never
 * leaves one of its own: every pending adjustment item (one carrying
 * `adjustment_id` in its metadata) must be a live (pending) adjustment row.
 * An item made for a live row whose id was not stored yet (a crash between
 * Stripe and the update) is adopted instead. A pending item Roger did not
 * make is left alone and reported to admins once.
 *
 * Unit 18 completes this file (missed events, unsettled states, open claims).
 */
/** Where a pass that ran out of time stopped; the next pass goes on from there. */
const CURSOR = "reconcile.pendingItemsCursor";

export async function reconcilePendingItems(
  q: Query,
  d: AdjustDeps,
  o: { budgetMs?: number; clock?: () => number } = {},
): Promise<{ checked: number; deleted: number; adopted: number; foreign: number; finished: boolean }> {
  const out = { checked: 0, deleted: 0, adopted: 0, foreign: 0, finished: false };
  if (!d.adjust) return out;
  const clock = o.clock ?? Date.now;
  const stopAt = clock() + (o.budgetMs ?? 60_000);
  const [saved] = await q<{ customer: string | null }>(`select value->>'customer' as customer from settings where key = $1`, [CURSOR]);
  const customers = await q<{ customer: string }>(
    `select distinct u.stripe_customer as customer from users u
     where u.stripe_customer is not null and ($1::text is null or u.stripe_customer > $1)
       and (u.stripe_subscription is not null or exists (select 1 from pending_adjustments a where a.user_id = u.id))
     order by 1`,
    [saved?.customer ?? null],
  );
  let last = saved?.customer ?? null;
  for (const { customer } of customers) {
    // Out of time: stop cleanly, so the rest of the hourly pass still runs, and carry on from here next time.
    if (clock() >= stopAt) {
      await q(`insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`, [
        CURSOR,
        JSON.stringify({ customer: last }),
      ]);
      return out;
    }
    try {
      const items = await d.adjust.pendingInvoiceItems(customer);
      out.checked += items.length;
      for (const item of items) {
        if (!item.adjustmentId) {
          out.foreign++;
          await alertAdmins("pending_item_not_ours", item.id, adminAlert("A pending invoice item Roger did not make", [`Customer ${customer}, item ${item.id}. It will go on the next invoice unless removed in Stripe.`]), d).catch(() => {});
          continue;
        }
        const [kept] = await q<{ id: string }>(`select id from pending_adjustments where stripe_item = $1 and status = 'pending'`, [item.id]);
        if (kept) continue;
        const adopted = await q(
          `update pending_adjustments set stripe_item = $2, updated_at = now() where id::text = $1 and status = 'pending' and stripe_item is null returning id`,
          [item.adjustmentId, item.id],
        );
        if (adopted.length) {
          out.adopted++;
          continue;
        }
        await d.adjust.deleteInvoiceItem(item.id);
        await q(`update pending_adjustments set stripe_deleted_at = now() where stripe_item = $1 and status = 'deleted' and stripe_deleted_at is null`, [item.id]);
        out.deleted++;
      }
    } catch (e) {
      console.error("[reconcile] pending items", customer, e instanceof Error ? e.message : e);
    }
    last = customer;
  }
  // A full pass: the next one starts from the beginning.
  await q(`delete from settings where key = $1`, [CURSOR]);
  out.finished = true;
  return out;
}
