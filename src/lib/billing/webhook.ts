import type Stripe from "stripe";
import type { Query } from "@/lib/db-query";
import { completeCardSetup, type CompleteOptions } from "./card-setup";
import { settleFromInvoice } from "./first-charge";
import type { CardGateway } from "./gateway";

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
  o: Omit<CompleteOptions, "expectUserId">,
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
    if (event.type === "invoice.paid") {
      // A first charge whose recording was interrupted: the invoice names its claim.
      const inv = event.data.object;
      const sub = inv.parent?.subscription_details;
      const claimId = sub?.metadata?.claim_id;
      if (claimId && sub) {
        const r = await settleFromInvoice(
          q,
          { claimId, subscription: typeof sub.subscription === "string" ? sub.subscription : sub.subscription.id, amountCents: inv.amount_paid, currency: inv.currency },
          { settings: await o.getSettings(), now: new Date(), query: o.query, transport: o.transport, sleep: o.sleep },
        );
        outcome = "handled";
        if (r !== "charged") note = `invoice.paid: ${r}`;
      }
    }
    await q(`update stripe_events set status = 'done', done_at = now(), error = $2 where id = $1`, [event.id, note]);
    return outcome;
  } catch (e) {
    await q(`update stripe_events set status = 'failed', error = $2 where id = $1`, [event.id, String((e as Error).message).slice(0, 500)]).catch(() => {});
    throw e;
  }
}
