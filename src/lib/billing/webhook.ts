import type Stripe from "stripe";
import type { Query } from "@/lib/db-query";
import { completeCardSetup, completeCardUpdate, type CompleteOptions } from "./card-setup";
import { adminAlert, alertAdmins } from "@/lib/mail/send";
import { cacheInvoiceBalance } from "./credit-display";
import { invoiceCreditCents } from "./credit-lines";
import { settleFromInvoice } from "./first-charge";
import type { CardGateway, CreditGateway } from "./gateway";
import { grantForInvoice } from "@/lib/referrals/credit";
import { CreditBusy } from "@/lib/referrals/credit-balance";
import type { CreditDeps } from "@/lib/referrals/credit-money";
import { clawbackForRefunds, creditsForDispute } from "@/lib/referrals/credit-reversal";
import { adjustmentOnSubscriptionEnded, markInvoiced } from "./adjustment";
import { noticeQuoteChange } from "./quote";
import { afterCardChange, renewalFailed, renewalPaid, subscriptionEnded, syncSubscription, type RenewalDeps } from "./renewals";
import type { AdjustmentGateway, BillingGateway, OrderGateway, PlanGateway } from "./subscriptions";

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
  o: Omit<CompleteOptions, "expectUserId"> & {
    adjust?: AdjustmentGateway;
    plans?: PlanGateway;
    billing?: BillingGateway;
    orders?: OrderGateway;
    credits?: CreditGateway;
    /** The credit ledger's clock: never ahead of the real one (the reconcile's "as of" replay passes it). */
    creditsNow?: Date;
    /** The credit lease and its work budget (the webhook route passes WEBHOOK_LEASE: it runs for at most 60 seconds). */
    creditLease?: CreditDeps["leaseBudget"];
    /** The caller's deadline for credit work (the reconcile passes its pass's). */
    creditDeadline?: number;
  },
): Promise<EventOutcome> {
  if (!(await claimEvent(q, event.id, event.type))) return "duplicate";
  // Unit 15's handlers: settings are read only when one of them runs.
  const rdeps = async (): Promise<RenewalDeps> => ({
    plans: o.plans,
    gw: o.billing,
    orders: o.orders,
    adjust: o.adjust,
    settings: await o.getSettings(),
    now: o.now ?? new Date(),
    query: o.query,
    transport: o.transport,
    sleep: o.sleep,
  });
  try {
    let outcome: EventOutcome = "ignored";
    let note: string | null = null;
    if (event.type === "checkout.session.completed" && event.data.object.mode === "setup" && event.data.object.metadata?.purpose === "card_update") {
      // "Update card" on /app/billing: the new default card, then a held charge retried at once.
      const id = event.data.object.id;
      const d = await rdeps();
      const result = await completeCardUpdate(q, gw, id, { after: (userId) => afterCardChange(q, d, userId, id), mail: o });
      if (result === "pending") throw new NotReadyYet("Checkout reported complete but the session is not complete yet");
      outcome = "handled";
      if (result !== "done") note = result;
    } else if (event.type === "checkout.session.completed" && event.data.object.mode === "setup") {
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
      // B2 Unit 5: an invoice that used (or changed) the referral credit leaves its ending balance as the cached
      // balance, so the displays do not keep showing credit Stripe has spent. No Stripe call; never over a newer reading.
      const finalized = inv.status_transitions?.finalized_at ?? event.created;
      if (
        await cacheInvoiceBalance(q, {
          customer: typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
          starting_balance: inv.starting_balance,
          ending_balance: inv.ending_balance,
          finalizedAt: new Date(finalized * 1000),
        })
      )
        outcome = "handled";
    }
    // The subscription ended: an adjustment still pending can never be collected, so it is deleted.
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const [u] = await q<{ id: string }>(`select id from users where stripe_subscription = $1`, [sub.id]);
      if (u) {
        // The job's clock (the reconcile replays events "as of" its own time), never the real one.
        await adjustmentOnSubscriptionEnded(q, { settings: await o.getSettings(), now: o.now ?? new Date(), adjust: o.adjust, query: o.query, transport: o.transport, sleep: o.sleep }, u.id);
        // The account follows: cancelled, or one list at a time after a switch (Unit 15).
        const r = await subscriptionEnded(q, await rdeps(), { subscription: sub.id, endedAt: sub.ended_at ? new Date(sub.ended_at * 1000) : (o.now ?? new Date()) });
        if (r === "none") note = "subscription ended: no account changed";
        outcome = "handled";
      }
    }
    // A cancellation scheduled or taken back (here or in Stripe): the subscription is re-read and its cancel date copied.
    if (event.type === "customer.subscription.updated" && o.plans) {
      const r = await syncSubscription(q, { ...(await rdeps()), plans: o.plans }, event.data.object.id);
      if (r !== "unknown") outcome = "handled";
    }
    // A renewal Stripe could not collect: Roger's email, and the 7 days before lists are held.
    if (event.type === "invoice.payment_failed") {
      const inv = event.data.object;
      const sub = inv.parent?.subscription_details?.subscription;
      if (sub && inv.billing_reason === "subscription_cycle" && inv.id) {
        if (await renewalFailed(q, await rdeps(), { subscription: typeof sub === "string" ? sub : sub.id, invoice: inv.id, attempt: inv.attempt_count, at: event.created ? new Date(event.created * 1000) : undefined })) outcome = "handled";
      }
    }
    // The address (and so the tax) may have changed: the told first-charge amount is re-checked.
    if (event.type === "customer.updated" && o.billing) {
      const [u] = await q<{ id: string }>(`select id from users where stripe_customer = $1`, [event.data.object.id]);
      if (u) {
        const d = await rdeps();
        await noticeQuoteChange(q, { gw: o.billing, balances: o.credits ?? null, settings: d.settings, now: d.now, query: o.query, transport: o.transport, sleep: o.sleep }, u.id);
        outcome = "handled";
      }
    }
    if (event.type === "invoice.paid") {
      // A first charge whose recording was interrupted: the invoice names its claim.
      const inv = event.data.object;
      const sub = inv.parent?.subscription_details;
      const claimId = sub?.metadata?.claim_id;
      // A renewal's invoice carries the subscription's metadata too (claim id included): only the first invoice settles a claim.
      const renewal = inv.billing_reason === "subscription_cycle";
      if (claimId && sub && !renewal) {
        const r = await settleFromInvoice(
          q,
          {
            claimId,
            subscription: typeof sub.subscription === "string" ? sub.subscription : sub.subscription.id,
            amountCents: inv.amount_paid,
            currency: inv.currency,
            anchor: planLineStart(inv),
            // The paid invoice's own balance figures: the subscribed email states the referral credit it used.
            creditAppliedCents: invoiceCreditCents(inv),
          },
          { settings: await o.getSettings(), now: o.creditsNow ?? o.now ?? new Date(), query: o.query, transport: o.transport, sleep: o.sleep },
        );
        outcome = "handled";
        if (r !== "charged") note = `invoice.paid: ${r}`;
      }
      // Any other subscription invoice paid: a failed renewal is cleared, and a held account released.
      if (sub && (renewal || !claimId)) {
        const r = await renewalPaid(q, await rdeps(), { subscription: typeof sub.subscription === "string" ? sub.subscription : sub.subscription.id });
        if (r !== "none") outcome = "handled";
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
    // Referral credit (B2 Unit 4): the grant on a paid invoice, a clawback on a refund or a lost dispute, a freeze while one
    // is open. Each handler re-reads Stripe and is safe to run again; a failure (a Stripe call, the email) answers 500.
    // Its ledger stamps use the job clock, never ahead of the real one (creditsNow), as every other credit write does.
    //
    // CreditBusy (B2 whole-branch review: another change holds the member's credit lease, or this webhook's shorter
    // budget ran out) is decided per event:
    // - invoice.paid: answered 200 with a note. The event's other work (the first charge, a renewal) is done, and the
    //   hourly sweep already finishes the grant: referral_late_grants grants a paid trial referral with no grant, and
    //   referral_credits posts an unposted one and sends its email. A 500 would only replay the whole event.
    // - charge.refunded and charge.dispute.*: credit is all these events do, and nothing hourly looks for a reversal
    //   (only this event, or the reconcile's replay of a failed one, does), so CreditBusy still answers 500 and
    //   Stripe sends it again.
    if (o.credits) {
      const credits = o.credits;
      const cd = async (): Promise<CreditDeps> => ({
        credits,
        settings: await o.getSettings(),
        now: o.creditsNow ?? o.now ?? new Date(),
        query: o.query,
        transport: o.transport,
        sleep: o.sleep,
        leaseBudget: o.creditLease,
        deadline: o.creditDeadline,
      });
      switch (event.type) {
        case "invoice.paid": {
          const inv = event.data.object;
          if (!inv.id) break;
          try {
            const r = await grantForInvoice(q, await cd(), inv.id, typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null));
            if (r !== "none") {
              outcome = "handled";
              note ??= `referral credit: ${r}`;
            }
          } catch (e) {
            if (!(e instanceof CreditBusy)) throw e;
            note ??= "referral credit busy: left to the hourly sweep";
            console.warn(`[stripe] ${event.id}: ${e.message}; the hourly credit sweep finishes the grant`);
          }
          break;
        }
        case "charge.refunded":
          if ((await clawbackForRefunds(q, await cd(), event.data.object.id)) > 0) outcome = "handled";
          break;
        case "charge.dispute.created":
        case "charge.dispute.closed":
          if ((await creditsForDispute(q, await cd(), event.data.object.id)) !== "none") outcome = "handled";
          break;
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
