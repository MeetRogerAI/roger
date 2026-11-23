import type Stripe from "stripe";
import type { Query } from "@/lib/db-query";
import { completeCardSetup, type CompleteOptions } from "./card-setup";
import { adminAlert, alertAdmins } from "@/lib/mail/send";
import { settleFromInvoice } from "./first-charge";
import type { CardGateway } from "./gateway";
import { adjustmentOnSubscriptionEnded, markInvoiced } from "./adjustment";
import type { AdjustmentGateway } from "./subscriptions";

/**
 * Stripe webhooks: signals, not facts. Each event id is claimed once in
 * `stripe_events`; handlers re-read the object from Stripe and write state
 * that is safe to write twice. A failed event is answered with an error so
 * Stripe sends it again, and its claim can be taken again.
 *
 * Later units add their event types here (invoice.paid, invoice.payment_failed,
 * customer.subscription.updated and .deleted, charge.dispute.created ...).
 */
export type EventOutcome = "handled" | "ignored" | "duplicate";

export async function claimEvent(q: Query, id: string, type: string): Promise<boolean> {
  const rows = await q(
    `insert into stripe_events (id, type) values ($1, $2)
     on conflict (id) do update set status = 'processing', claimed_at = now(), error = null
       where stripe_events.status = 'failed'
          or (stripe_events.status = 'processing' and stripe_events.claimed_at < now() - interval '15 minutes')
     returning id`,
    [id, type],
  );
  return rows.length > 0;
}

/** Stripe said the card step finished but we could not see it yet: let Stripe send it again. */
export class NotReadyYet extends Error {}

export async function handleStripeEvent(
  q: Query,
  gw: CardGateway,
  event: Stripe.Event,
  o: Omit<CompleteOptions, "expectUserId"> & { adjust?: AdjustmentGateway },
): Promise<EventOutcome> {
  if (!(await claimEvent(q, event.id, event.type))) return "duplicate";
  try {
    let outcome: EventOutcome = "ignored";
    let note: string | null = null;
    if (event.type === "checkout.session.completed" && event.data.object.mode === "setup") {
      const result = await completeCardSetup(q, gw, event.data.object.id, o);
      if (result === "pending") throw new NotReadyYet("Checkout reported complete but the session is not complete yet");
      outcome = "handled";
      // Kept on the event so an admin can see why a card step did not start a trial.
      if (result !== "done") {
        note = result;
        console.warn(`[stripe] ${event.id}: card step ended as ${result}`);
      }
    }
    // The renewal's invoice carrying the second-miss adjustment was finalized: it is invoiced, no longer pending. A draft can still change, so it is not enough.
    if (event.type === "invoice.finalized" || event.type === "invoice.paid") {
      const inv = event.data.object;
      const items = (inv.lines?.data ?? []).map((l) => l.parent?.invoice_item_details?.invoice_item).filter((x): x is string => Boolean(x));
      if (items.length && (await markInvoiced(q, o, inv.id ?? "", items))) outcome = "handled";
    }
    // The subscription ended: an adjustment still pending can never be collected, so it is deleted.
    if (event.type === "customer.subscription.deleted") {
      const [u] = await q<{ id: string }>(`select id from users where stripe_subscription = $1`, [event.data.object.id]);
      if (u) {
        await adjustmentOnSubscriptionEnded(q, { settings: await o.getSettings(), now: new Date(), adjust: o.adjust, query: o.query, transport: o.transport, sleep: o.sleep }, u.id);
        outcome = "handled";
      }
    }
    if (event.type === "invoice.paid") {
      // A first charge whose recording was interrupted: the invoice names its claim.
      const inv = event.data.object;
      const sub = inv.parent?.subscription_details;
      const claimId = sub?.metadata?.claim_id;
      if (claimId && sub) {
        const r = await settleFromInvoice(
          q,
          { claimId, subscription: typeof sub.subscription === "string" ? sub.subscription : sub.subscription.id, amountCents: inv.amount_paid, currency: inv.currency, anchor: planLineStart(inv) },
          { settings: await o.getSettings(), now: new Date(), query: o.query, transport: o.transport, sleep: o.sleep },
        );
        outcome = "handled";
        if (r !== "charged") note = `invoice.paid: ${r}`;
      }
      // An order invoice paid outside the charge job (for example from the hosted page) after its claim failed.
      const orderClaim = !sub ? inv.metadata?.claim_id : undefined;
      if (orderClaim) {
        const [c] = await q<{ outcome: string; user_id: string }>(`select outcome, user_id from charge_attempts where id = $1 and purpose = 'order'`, [orderClaim]);
        if (c && c.outcome !== "succeeded" && c.outcome !== "claimed" && c.outcome !== "unknown") {
          await alertAdmins("order_paid_after_failure", orderClaim, adminAlert("An order invoice was paid after its charge failed", [`User ${c.user_id}, invoice ${inv.id}. Send the list or refund.`]), {
            query: o.query,
            transport: o.transport,
          }).catch(() => {});
          note = "order invoice paid after its claim failed";
        }
        outcome = "handled";
      }
    }
    await q(`update stripe_events set status = 'done', done_at = now(), error = $2 where id = $1`, [event.id, note]);
    return outcome;
  } catch (e) {
    await q(`update stripe_events set status = 'failed', error = $2 where id = $1`, [event.id, String((e as Error).message).slice(0, 500)]).catch(() => {});
    throw e;
  }
}

/** The start of the plan line's period on a subscription's first invoice: the subscription's billing cycle anchor. */
function planLineStart(inv: Stripe.Invoice): number | null {
  return (inv.lines?.data ?? []).find((l) => l.parent?.subscription_item_details)?.period?.start ?? null;
}
