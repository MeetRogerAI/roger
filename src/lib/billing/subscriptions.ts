import Stripe from "stripe";
import { isHardDecline } from "./claims";
import { stripe } from "./stripe";

/**
 * The Stripe calls for charging (plan "Every charge carries its claim id").
 * Subscriptions are created with the claim id in their metadata and
 * `error_if_incomplete`, so a failed first payment creates nothing. Before any
 * call is repeated, the subscription is looked up by its claim id.
 */
export type ChargeResult =
  | { kind: "succeeded"; object: string; amountCents: number | null; currency: string | null; receiptUrl?: string | null; /** A new subscription's billing cycle anchor (unix seconds). */ anchor?: number | null }
  | { kind: "declined"; code: string | null; hard: boolean }
  /** Stripe could not work out the tax for the address: an admin looks, the user is not asked for a new card. */
  | { kind: "tax_address"; error: string }
  /** The call may have happened: never treated as a decline; settled later by looking it up. */
  | { kind: "unknown"; error: string }
  /** Refused for a reason a retry cannot fix (our setup, a bad request). */
  | { kind: "error"; error: string };

export type FoundSubscription = { id: string; status: string; claimId: string | null; anchor?: number | null };

/**
 * The higher rate's difference on the first invoice (plan Unit 14): a member
 * not sharing at the cutoff of their first paid Monday is subscribed at the
 * standard price, with the difference added to the first invoice only, taxed
 * like the plan line. The preview carries the same item, so the told total is
 * the charged total.
 */
export type FirstExtra = { amountCents: number; currency: string } | null;

export interface BillingGateway {
  /** The first invoice's total with tax, from Stripe's preview. */
  preview(o: { customer: string; price: string; extra?: FirstExtra }): Promise<{ totalCents: number; currency: string }>;
  /** The customer's subscriptions that are live (or were made by a claim). */
  subscriptions(customer: string): Promise<FoundSubscription[]>;
  createSubscription(o: { customer: string; price: string; extra?: FirstExtra; claimId: string; userId: string; idempotencyKey: string }): Promise<ChargeResult>;
  /** A price's unit amount in cents (to bill the month's difference as Stripe prices it). */
  unitAmount?(price: string): Promise<number | null>;
}

/** A one-off line for `price`'s product, with its tax behaviour: taxed exactly like the plan line. */
/** Stripe's tax behaviour copied as it is, or left out when the price leaves it to the account. */
const sameTax = (t: Stripe.Price.TaxBehavior | null) => (t === "inclusive" || t === "exclusive" ? { tax_behavior: t } : {});

async function sameProduct(s: Stripe, price: string, extra: NonNullable<FirstExtra>) {
  const p = await s.prices.retrieve(price);
  return {
    currency: extra.currency.toLowerCase(),
    product: typeof p.product === "string" ? p.product : p.product.id,
    unit_amount: extra.amountCents,
    // Exactly the plan's tax behaviour; "unspecified" is left out so the account default applies to both lines alike.
    ...sameTax(p.tax_behavior),
  };
}

const LIVE = new Set(["active", "trialing", "past_due", "unpaid"]);
export const isLive = (s: FoundSubscription) => LIVE.has(s.status);

/** How a Stripe error ends a claim. */
export function classify(e: unknown): ChargeResult {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string } | null)?.code ?? "";
  // The bank wants the person to confirm (3D Secure). Nobody is there at 6 AM: a soft decline, with the update-card email.
  if (/requires_action|authentication_required/i.test(code) || /requires_action|authentication_required|3d secure/i.test(msg)) {
    return { kind: "declined", code: code || "authentication_required", hard: false };
  }
  // The same key was used with different details: never retried blindly; an admin looks.
  if (e instanceof Stripe.errors.StripeIdempotencyError) return { kind: "error", error: `Idempotency conflict: ${msg}` };
  if (e instanceof Stripe.errors.StripeCardError) {
    const code = (e.decline_code as string | undefined) ?? e.code ?? null;
    return { kind: "declined", code, hard: isHardDecline(code) };
  }
  if (e instanceof Stripe.errors.StripeInvalidRequestError) {
    if (/tax/i.test(e.code ?? "") || /tax|location/i.test(msg)) return { kind: "tax_address", error: msg };
    // An idempotency mismatch or a stale object means we cannot know what happened: look it up later.
    if (e.code === "idempotency_key_in_use") return { kind: "unknown", error: msg };
    return { kind: "error", error: msg };
  }
  if (e instanceof Stripe.errors.StripeAuthenticationError || e instanceof Stripe.errors.StripePermissionError) return { kind: "error", error: msg };
  // Connection, rate limit, Stripe's own errors, timeouts: the charge may have gone through.
  return { kind: "unknown", error: msg };
}

export function stripeBilling(s: Stripe | null = stripe()): BillingGateway | null {
  if (!s) return null;
  return {
    async unitAmount(price) {
      return (await s.prices.retrieve(price)).unit_amount;
    },

    async preview({ customer, price, extra }) {
      const inv = await s.invoices.createPreview({
        customer,
        automatic_tax: { enabled: true },
        subscription_details: { items: [{ price }] },
        ...(extra?.amountCents ? { invoice_items: [{ price_data: await sameProduct(s, price, extra) }] } : {}),
      });
      return { totalCents: inv.total, currency: inv.currency.toUpperCase() };
    },

    async subscriptions(customer) {
      const list = await s.subscriptions.list({ customer, status: "all", limit: 20 });
      return list.data.map((x) => ({ id: x.id, status: x.status, claimId: x.metadata?.claim_id ?? null, anchor: x.billing_cycle_anchor }));
    },

    async createSubscription({ customer, price, extra, claimId, userId, idempotencyKey }) {
      try {
        const sub = await s.subscriptions.create(
          {
            customer,
            items: [{ price }],
            // The first month's higher-rate difference, on the first invoice only.
            ...(extra?.amountCents ? { add_invoice_items: [{ price_data: await sameProduct(s, price, extra), metadata: { kind: "first_month_higher_rate" } }] } : {}),
            automatic_tax: { enabled: true },
            payment_behavior: "error_if_incomplete",
            // A merchant-initiated charge on the card saved for later use: no one is there to confirm it.
            off_session: true,
            metadata: { claim_id: claimId, user_id: userId },
            expand: ["latest_invoice"],
          },
          { idempotencyKey },
        );
        const inv = sub.latest_invoice as Stripe.Invoice | string | null;
        return {
          kind: "succeeded",
          object: sub.id,
          anchor: sub.billing_cycle_anchor,
          amountCents: inv && typeof inv !== "string" ? inv.amount_paid : null,
          currency: inv && typeof inv !== "string" ? inv.currency.toUpperCase() : null,
        };
      } catch (e) {
        return classify(e);
      }
    },
  };
}

/**
 * The contributor rule (plan Unit 14): a month's higher-rate difference is a
 * pending invoice item on the subscription, made with a key from its stored
 * id (the subscription itself always stays at the standard price); the
 * itemised email reads Stripe's preview of the coming renewal invoice.
 */
export type PendingItem = { id: string; adjustmentId: string | null; subscription: string | null };
export type RenewalPreview = {
  totalCents: number;
  taxCents: number;
  currency: string;
  lines: { description: string; amountCents: number; invoiceItem: string | null }[];
};

export interface AdjustmentGateway {
  /** A price's unit amount in cents. */
  unitAmount?(price: string): Promise<number | null>;
  createInvoiceItem(o: {
    customer: string;
    subscription: string;
    amountCents: number;
    currency: string;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<string>;
  /**
   * Removes an item; one already gone counts as removed. "locked" when it is on
   * an invoice that is no longer a draft: it has been billed and can never be
   * deleted (a retry cannot help). Other failures throw.
   */
  deleteInvoiceItem(id: string): Promise<"deleted" | "locked">;
  /** The customer's invoice items not yet on any invoice. */
  pendingInvoiceItems(customer: string): Promise<PendingItem[]>;
  /** The subscription's next invoice as it stands, pending items included. */
  previewRenewal(o: { customer: string; subscription: string }): Promise<RenewalPreview>;
}

export function stripeAdjustments(s: Stripe | null = stripe()): AdjustmentGateway | null {
  if (!s) return null;
  return {
    async unitAmount(price) {
      return (await s.prices.retrieve(price)).unit_amount;
    },

    async createInvoiceItem({ customer, subscription, amountCents, currency, description, metadata, idempotencyKey }) {
      // Taxed exactly like the plan line: the same product (so the same tax code) and the same tax behaviour, under the subscription's automatic tax.
      const sub = await s.subscriptions.retrieve(subscription);
      const plan = sub.items.data[0]?.price;
      if (!plan) throw new Error(`Subscription ${subscription} has no price.`);
      const product = typeof plan.product === "string" ? plan.product : plan.product.id;
      const item = await s.invoiceItems.create(
        {
          customer,
          subscription,
          description,
          metadata,
          price_data: {
            currency: currency.toLowerCase(),
            product,
            unit_amount: amountCents,
            ...sameTax(plan.tax_behavior),
          },
        },
        { idempotencyKey },
      );
      return item.id;
    },

    async deleteInvoiceItem(id) {
      try {
        await s.invoiceItems.del(id);
        return "deleted";
      } catch (e) {
        if ((e as { code?: string } | null)?.code === "resource_missing") return "deleted";
        // Refused: if the item sits on an invoice that is no longer a draft, it is billed for good.
        const item = await s.invoiceItems.retrieve(id, { expand: ["invoice"] }).catch(() => null);
        const inv = item?.invoice;
        if (inv && typeof inv !== "string" && inv.status !== "draft") return "locked";
        throw e;
      }
    },

    async pendingInvoiceItems(customer) {
      const out: PendingItem[] = [];
      for await (const i of s.invoiceItems.list({ customer, pending: true, limit: 100 })) {
        const sub = i.parent?.subscription_details?.subscription ?? null;
        out.push({ id: i.id, adjustmentId: i.metadata?.adjustment_id ?? null, subscription: typeof sub === "string" ? sub : null });
      }
      return out;
    },

    async previewRenewal({ customer, subscription }) {
      const inv = await s.invoices.createPreview({ customer, subscription });
      return {
        totalCents: inv.total,
        taxCents: (inv.total_taxes ?? []).reduce((n, t) => n + t.amount, 0),
        currency: inv.currency.toUpperCase(),
        lines: inv.lines.data.map((l) => ({
          description: l.description ?? "",
          amountCents: l.amount,
          invoiceItem: l.parent?.invoice_item_details?.invoice_item ?? null,
        })),
      };
    },
  };
}

/**
 * One list at a time (plan Unit 12): an invoice made for the order, its one
 * item attached to it directly (so nothing is left pending on the customer),
 * finalized and paid off-session. Every step carries the claim id; a takeover
 * finds the invoice by it and finishes from whatever state it is in.
 */
export type FoundInvoice = { id: string; status: string; amountPaid: number; currency: string };
export type OrderCall = { customer: string; price: string; claimId: string; userId: string; week: string; idempotencyKey: string };

export interface OrderGateway {
  previewOrder(o: { customer: string; price: string }): Promise<{ totalCents: number; currency: string }>;
  findOrderInvoice(customer: string, claimId: string): Promise<FoundInvoice | null>;
  /** A draft invoice with its item; its id, or how Stripe refused (a definite refusal is never retried). */
  createOrderInvoice(o: OrderCall): Promise<{ ok: true; invoice: string } | { ok: false; result: ChargeResult }>;
  /** Makes sure the item is on the invoice, finalizes if needed, and pays; a decline leaves it open for the caller to void. */
  payOrderInvoice(invoiceId: string, o: OrderCall): Promise<ChargeResult>;
  voidInvoice(invoiceId: string): Promise<void>;
}

export function stripeOrders(s: Stripe | null = stripe()): OrderGateway | null {
  if (!s) return null;
  const addItem = (invoice: string, o: OrderCall) =>
    s.invoiceItems.create({ customer: o.customer, invoice, pricing: { price: o.price }, metadata: { claim_id: o.claimId } }, { idempotencyKey: `${o.idempotencyKey}:item` });
  const found = (i: Stripe.Invoice): FoundInvoice => ({ id: i.id!, status: i.status ?? "draft", amountPaid: i.amount_paid, currency: i.currency.toUpperCase() });
  return {
    async previewOrder({ customer, price }) {
      const inv = await s.invoices.createPreview({ customer, automatic_tax: { enabled: true }, invoice_items: [{ price }] });
      return { totalCents: inv.total, currency: inv.currency.toUpperCase() };
    },

    async findOrderInvoice(customer, claimId) {
      const list = await s.invoices.list({ customer, limit: 30 });
      const inv = list.data.find((i) => i.metadata?.claim_id === claimId);
      return inv ? found(inv) : null;
    },

    async createOrderInvoice(o) {
      const { customer, claimId, userId, week, idempotencyKey } = o;
      try {
      const inv = await s.invoices.create(
        {
          customer,
          auto_advance: false,
          automatic_tax: { enabled: true },
          collection_method: "charge_automatically",
          pending_invoice_items_behavior: "exclude",
          description: `Roger list for the week of ${week}`,
          metadata: { claim_id: claimId, user_id: userId, week },
        },
        { idempotencyKey: `${idempotencyKey}:invoice` },
      );
      await addItem(inv.id!, o);
      return { ok: true, invoice: inv.id! };
      } catch (e) {
        const r = classify(e);
        // A definite refusal: anything already made is removed, so nothing is left pending.
        if (r.kind !== "unknown") {
          const left = (await s.invoices.list({ customer, limit: 10 })).data.find((i) => i.metadata?.claim_id === claimId && i.status === "draft");
          if (left?.id) await s.invoices.del(left.id).catch(() => {});
        }
        return { ok: false, result: r };
      }
    },

    async payOrderInvoice(invoiceId, o) {
      const { idempotencyKey } = o;
      try {
        let inv = await s.invoices.retrieve(invoiceId);
        // The item may never have been added (a crash between the two calls): the same key adds it once.
        if (inv.status === "draft") {
          await addItem(invoiceId, o);
          inv = await s.invoices.finalizeInvoice(invoiceId, { auto_advance: false }, { idempotencyKey: `${idempotencyKey}:finalize` });
        }
        // Never record an empty invoice as a paid list.
        if (inv.total <= 0) return { kind: "error", error: `The invoice total is ${inv.total}; its item is missing.` };
        if (inv.status === "paid") return { kind: "succeeded", object: invoiceId, amountCents: inv.amount_paid, currency: inv.currency.toUpperCase(), receiptUrl: inv.hosted_invoice_url ?? null };
        if (inv.status !== "open") return { kind: "error", error: `The invoice is ${inv.status}.` };
        const paid = await s.invoices.pay(invoiceId, { off_session: true }, { idempotencyKey: `${idempotencyKey}:pay` });
        return paid.status === "paid"
          ? { kind: "succeeded", object: invoiceId, amountCents: paid.amount_paid, currency: paid.currency.toUpperCase(), receiptUrl: paid.hosted_invoice_url ?? null }
          : { kind: "unknown", error: `The invoice is ${paid.status} after paying.` };
      } catch (e) {
        return classify(e);
      }
    },

    async voidInvoice(invoiceId) {
      const inv = await s.invoices.retrieve(invoiceId);
      if (inv.status === "draft") await s.invoices.del(invoiceId);
      else if (inv.status === "open") await s.invoices.voidInvoice(invoiceId);
    },
  };
}

/**
 * The billing page (plan Unit 15): cancelling, switching, renewals and the
 * invoice list. A scheduled cancellation is read from the subscription's
 * cancel date (`cancel_at`), which newer API versions set; the older
 * period-end flag is only a fallback.
 */
export type SubscriptionInfo = {
  id: string;
  status: string;
  customer: string;
  /** When the subscription will end (unix seconds), or null when nothing is scheduled. */
  cancelAt: number | null;
  /** The end of the paid period (unix seconds). */
  periodEnd: number | null;
  endedAt: number | null;
};
export type InvoiceRow = { id: string; number: string | null; created: number; totalCents: number; currency: string; status: string; hostedUrl: string | null; subscription: string | null };

export interface PlanGateway {
  getSubscription(id: string): Promise<SubscriptionInfo | null>;
  /** Ends the subscription when its paid period ends: no renewal, no proration, no refund. */
  cancelAtPeriodEnd(id: string): Promise<SubscriptionInfo>;
  /** Takes back a scheduled cancellation, so the subscription renews as before. */
  keepSubscription(id: string): Promise<SubscriptionInfo>;
  /** Ends it now (an unpaid renewal being cancelled). */
  cancelNow(id: string): Promise<SubscriptionInfo>;
  /** Detaches every saved card; returns how many were removed. */
  removeCards(customer: string): Promise<number>;
  /** The customer's invoices, newest first (drafts left out). */
  invoices(customer: string): Promise<InvoiceRow[]>;
  /** The subscription's oldest open (unpaid) invoice, if any. */
  unpaidInvoice(subscription: string): Promise<InvoiceRow | null>;
  /** Every open invoice of the subscription, oldest first. */
  openInvoices(subscription: string): Promise<InvoiceRow[]>;
  /** One invoice as Stripe has it now, or null when there is none. */
  invoice(id: string): Promise<InvoiceRow | null>;
  /** Pays an open invoice off-session with the default card. */
  payInvoice(id: string, idempotencyKey: string): Promise<ChargeResult>;
}

export function subscriptionInfo(x: Stripe.Subscription): SubscriptionInfo {
  const periodEnd = x.items?.data?.[0]?.current_period_end ?? null;
  return {
    id: x.id,
    status: x.status,
    customer: typeof x.customer === "string" ? x.customer : x.customer.id,
    cancelAt: x.cancel_at ?? (x.cancel_at_period_end ? periodEnd : null),
    periodEnd,
    endedAt: x.ended_at ?? null,
  };
}

const invoiceRow = (i: Stripe.Invoice): InvoiceRow => {
  const sub = i.parent?.subscription_details?.subscription ?? null;
  return {
    id: i.id!,
    number: i.number ?? null,
    created: i.created,
    totalCents: i.total,
    currency: i.currency.toUpperCase(),
    status: i.status ?? "draft",
    hostedUrl: i.hosted_invoice_url ?? null,
    subscription: typeof sub === "string" ? sub : (sub?.id ?? null),
  };
};

export function stripePlans(s: Stripe | null = stripe()): PlanGateway | null {
  if (!s) return null;
  const openInvoices = async (subscription: string) => {
    const list = await s.invoices.list({ subscription, status: "open", limit: 20 });
    return list.data.map(invoiceRow).sort((a, b) => a.created - b.created);
  };
  return {
    async getSubscription(id) {
      try {
        return subscriptionInfo(await s.subscriptions.retrieve(id));
      } catch (e) {
        if ((e as { code?: string } | null)?.code === "resource_missing") return null;
        throw e;
      }
    },

    async cancelAtPeriodEnd(id) {
      return subscriptionInfo(await s.subscriptions.update(id, { cancel_at_period_end: true }));
    },

    async keepSubscription(id) {
      const now = await s.subscriptions.retrieve(id);
      // Whichever way the end was scheduled is the way it is taken back.
      const params: Stripe.SubscriptionUpdateParams = now.cancel_at_period_end ? { cancel_at_period_end: false } : { cancel_at: "" };
      return subscriptionInfo(await s.subscriptions.update(id, params));
    },

    async cancelNow(id) {
      try {
        return subscriptionInfo(await s.subscriptions.cancel(id));
      } catch (e) {
        // Already ended: report it as it stands.
        const now = await s.subscriptions.retrieve(id).catch(() => null);
        if (now && now.status === "canceled") return subscriptionInfo(now);
        throw e;
      }
    },

    async removeCards(customer) {
      let n = 0;
      for await (const pm of s.customers.listPaymentMethods(customer, { limit: 100 })) {
        await s.paymentMethods.detach(pm.id);
        n++;
      }
      return n;
    },

    async invoices(customer) {
      const list = await s.invoices.list({ customer, limit: 24 });
      return list.data.filter((i) => i.status !== "draft").map(invoiceRow);
    },

    async unpaidInvoice(subscription) {
      return (await openInvoices(subscription))[0] ?? null;
    },

    openInvoices,

    async invoice(id) {
      try {
        return invoiceRow(await s.invoices.retrieve(id));
      } catch (e) {
        if ((e as { code?: string } | null)?.code === "resource_missing") return null;
        throw e;
      }
    },

    async payInvoice(id, idempotencyKey) {
      try {
        const inv = await s.invoices.retrieve(id);
        if (inv.status === "paid") return { kind: "succeeded", object: id, amountCents: inv.amount_paid, currency: inv.currency.toUpperCase(), receiptUrl: inv.hosted_invoice_url ?? null };
        if (inv.status !== "open") return { kind: "error", error: `The invoice is ${inv.status}.` };
        const paid = await s.invoices.pay(id, { off_session: true }, { idempotencyKey });
        return paid.status === "paid"
          ? { kind: "succeeded", object: id, amountCents: paid.amount_paid, currency: paid.currency.toUpperCase(), receiptUrl: paid.hosted_invoice_url ?? null }
          : { kind: "unknown", error: `The invoice is ${paid.status} after paying.` };
      } catch (e) {
        return classify(e);
      }
    },
  };
}
