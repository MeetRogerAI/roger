import type { Query } from "@/lib/db-query";
import { wallParts } from "@/lib/clock";
import { retryDeletes, sendItemisedNotices } from "@/lib/billing/adjustment";
import { processContributions } from "@/lib/billing/contribution";
import { reconcilePendingItems } from "@/lib/billing/reconcile";
import { syncStripeEmails } from "@/lib/auth/email-change";
import { stripe } from "@/lib/billing/stripe";
import { staleClaims, takeOver } from "@/lib/billing/claims";
import { sendOrderPrompts, takeOverOrder, voidLeftoverInvoices } from "@/lib/billing/orders";
import { finishCancellations } from "@/lib/billing/cancel";
import { endDueSubscriptions, holdUnpaidRenewals } from "@/lib/billing/renewals";
import { applyDueSwitches } from "@/lib/billing/switch";
import { sendFirstChargeReminders } from "@/lib/billing/quote";
import { deliverLate } from "@/lib/cora/send-job";
import { closeUnpaidTrials, dueRetries, repairPaidUsers, takeOverFirstCharge, type ChargeDeps } from "@/lib/billing/first-charge";

/**
 * The hourly pass (plan Unit 12): a list of due tasks that later units add
 * to. Each task is safe to run twice and works only on what is due now. One
 * failing task never stops the others.
 */
export type HourlyTask = { name: string; run: (q: Query, d: ChargeDeps) => Promise<unknown> };

export const HOURLY_TASKS: HourlyTask[] = [
  {
    // Claims left open past 15 minutes: looked up by claim id, then repeated with the same key.
    name: "charge_takeover",
    run: async (q, d) => {
      const out: string[] = [];
      for (const c of await staleClaims(q)) {
        if (c.purpose === "order" && !d.orders) continue;
        if (!(await takeOver(q, c.id))) continue;
        // One claim's failure never stops the others.
        try {
          out.push(c.purpose === "order" ? await takeOverOrder(q, { ...d, orders: d.orders! }, c) : await takeOverFirstCharge(q, d, c));
        } catch (e) {
          console.error("[hourly] takeover", c.id, e instanceof Error ? e.message : e);
          out.push("failed");
        }
      }
      return out;
    },
  },
  // Retries on days 1, 3 and 7, and amount-changed charges after 24 hours.
  { name: "charge_retries", run: (q, d) => dueRetries(q, d) },
  // After the retries, so a day-7 attempt runs before its trial closes.
  { name: "close_unpaid_trials", run: (q, d) => closeUnpaidTrials(q, d) },
  // 48 hours before a first charge: the reminder with the stored date and amount.
  { name: "first_charge_reminders", run: (q, d) => sendFirstChargeReminders(q, d) },
  // Order invoices left open after a failed void.
  { name: "void_leftover_invoices", run: async (q, d) => (d.orders ? voidLeftoverInvoices(q, { ...d, orders: d.orders }) : 0) },
  // A list whose charge settled after Monday is delivered then.
  { name: "deliver_late", run: (q, d) => deliverLate(q, { settings: d.settings, now: d.now, gw: d.gw, adjust: d.adjust, query: d.query, transport: d.transport, sleep: d.sleep }) },
  // The contributor rule: misses settled (forgiven, or the adjustment), then any Stripe items due (a carried one after its renewal).
  { name: "contributions", run: (q, d) => processContributions(q, d) },
  // Stripe deletes of dropped adjustment items that failed, until Stripe confirms them.
  { name: "adjustment_deletes", run: (q, d) => retryDeletes(q, d) },
  // Three days before an invoice carrying an adjustment: the itemised email, from Stripe's preview.
  { name: "invoice_itemised", run: (q, d) => sendItemisedNotices(q, d) },
  // Once a day (4 AM Toronto): pending invoice items with no live adjustment are deleted.
  { name: "reconcile_pending_items", run: async (q, d) => (wallParts(d.now).hour === 4 ? reconcilePendingItems(q, d) : "not this hour") },
  // A paid user left held or in trial is made active.
  { name: "repair_paid_users", run: (q, d) => repairPaidUsers(q, d) },
  // Unit 15. A plan switch booked after a Monday cutoff, from the Tuesday.
  { name: "booked_switches", run: async (q, d) => (d.plans ? applyDueSwitches(q, { ...d, plans: d.plans }) : "Stripe is not set up.") },
  // A switch to one at a time whose paid month ended without its webhook.
  { name: "ended_subscriptions", run: async (q, d) => (d.plans ? endDueSubscriptions(q, { ...d, plans: d.plans }) : "Stripe is not set up.") },
  // A renewal still unpaid on day 7: lists are held until it is paid.
  { name: "renewal_holds", run: (q, d) => holdUnpaidRenewals(q, d) },
  // A cancellation whose card removal or confirmation email failed.
  { name: "finish_cancellations", run: async (q, d) => (d.plans ? finishCancellations(q, { ...d, plans: d.plans }) : "Stripe is not set up.") },
  // Fridays: "Want a list this Monday?" to one-at-a-time users without an order (switchable in settings).
  { name: "order_prompts", run: (q, d) => sendOrderPrompts(q, d) },
  // Stripe customers still holding an address the user has since changed (Unit 16).
  {
    name: "stripe_email_sync",
    run: (q, d) => {
      const s = stripe();
      if (!s) return Promise.resolve({ skipped: "Stripe is not set up." });
      return syncStripeEmails(q, async (customer, email) => void (await s.customers.update(customer, { email })), { query: d.query, transport: d.transport, sleep: d.sleep });
    },
  },
];

export async function runHourly(q: Query, d: ChargeDeps, tasks: HourlyTask[] = HOURLY_TASKS): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (!d.settings.cycleLive) return { skipped: "The cycle is not live." };
  for (const t of tasks) {
    try {
      out[t.name] = await t.run(q, d);
    } catch (e) {
      console.error(`[hourly] ${t.name}`, e instanceof Error ? e.message : e);
      out[t.name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}
