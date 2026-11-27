import Stripe from "stripe";
import type { BillingCountry } from "./gateway";
import type { Currency } from "./prices";
import { stripe } from "./stripe";

/**
 * Sponsor invoicing in Stripe (B2 plan Unit 10). A sponsor is a Stripe
 * customer with its billing email and address (automatic tax needs the
 * country and postal code), billed by one invoice per calendar month that an
 * admin prepares as a draft and then sends. Every write is one small call,
 * so `invoice.ts` can check its claim on the month before each one.
 *
 * - The draft is created with only fields that never change for that
 *   (sponsor, month): customer, currency, collection and tax settings, and
 *   metadata `{ sponsor_id, month }`, under the key `sponsor-invoice:{sponsor}:{month}:{replacing}`.
 *   The memo is set afterwards. Before creating one, an existing draft is
 *   looked for (the id stored on the row, else the customer's invoices by
 *   that metadata), so a retry after Stripe has forgotten the key reuses it.
 * - Lines are invoice items with metadata `tier`; they are listed, deleted
 *   and added one at a time.
 * - Send is Stripe's `sendInvoice` on the draft (it finalizes and emails in
 *   one call), under the key `sponsor-send:{invoice}:{refusals}`. Roger never finalizes a
 *   sponsor invoice any other way, so an invoice that is open, paid or
 *   uncollectible has been sent: that is how a send whose answer was lost is
 *   recognised.
 */
export type SponsorTier = "standard" | "higher";
export type SponsorLine = { tier: SponsorTier; quantity: number; unitCents: number; description: string };
export type SponsorItem = SponsorLine & { id: string };
/** Stripe's automatic tax status: only "complete" means the tax is right. */
export type SponsorTaxStatus = "complete" | "requires_location_inputs" | "failed" | null;
export type SponsorInvoice = {
  id: string;
  status: string | null;
  currency: Currency | null;
  subtotalCents: number;
  taxCents: number | null;
  totalCents: number;
  automaticTax: boolean;
  taxStatus: SponsorTaxStatus;
  sponsorId: string | null;
  month: string | null;
  description: string | null;
};

/** Stripe refused to send (finalize) the invoice; `code` is Stripe's error code, e.g. a tax location one. */
export class SponsorSendRefused extends Error {
  constructor(
    message: string,
    public code: string | null,
  ) {
    super(message);
  }
}

export const SENT_STATUSES: readonly string[] = ["open", "paid", "uncollectible"];

export interface SponsorGateway {
  createSponsorCustomer(o: { sponsorId: string; name: string; email: string; country: BillingCountry; postal: string }): Promise<string>;
  /** The invoice with this id, or null when Stripe has none (or it was deleted). */
  getSponsorInvoice(id: string): Promise<SponsorInvoice | null>;
  /** The customer's newest invoice carrying this (sponsor, month) in its metadata, not void; null if none. */
  findSponsorInvoice(o: { customer: string; sponsorId: string; month: string }): Promise<SponsorInvoice | null>;
  /**
   * `replacing` is the draft id stored before (or "none"): part of the key, so a new draft can be made
   * after Stripe's copy was voided or deleted, while a retry of the same attempt gets the same draft back.
   */
  createSponsorDraft(o: { customer: string; sponsorId: string; month: string; currency: Currency; replacing: string }): Promise<SponsorInvoice>;
  describeSponsorInvoice(id: string, description: string): Promise<void>;
  listSponsorItems(invoice: string): Promise<SponsorItem[]>;
  deleteSponsorItem(id: string): Promise<void>;
  addSponsorItem(o: { invoice: string; customer: string; currency: Currency; sponsorId: string; month: string; line: SponsorLine }): Promise<string>;
  /**
   * Finalizes and emails a draft, under the key `sponsor-send:{invoice}:{refusals}`: a retry after an
   * unknown outcome replays the same request; after a definite refusal the count moves on, so the
   * next attempt isn't answered from Stripe's cache. Throws SponsorSendRefused when Stripe refuses it.
   */
  sendSponsorInvoice(id: string, refusals: number): Promise<SponsorInvoice>;
}

const toCurrency = (c: string | null | undefined): Currency | null => (c?.toUpperCase() === "USD" ? "USD" : c?.toUpperCase() === "CAD" ? "CAD" : null);
const missing = (e: unknown) => e instanceof Stripe.errors.StripeError && e.code === "resource_missing";
const taxStatusOf = (s: string | null | undefined): SponsorTaxStatus => (s === "complete" || s === "requires_location_inputs" || s === "failed" ? s : null);

export function sponsorInvoiceFrom(inv: Stripe.Invoice): SponsorInvoice {
  if (!inv.id) throw new Error("Stripe returned an invoice with no id");
  return {
    id: inv.id,
    status: inv.status ?? null,
    currency: toCurrency(inv.currency),
    subtotalCents: inv.subtotal ?? 0,
    taxCents: inv.total_taxes ? inv.total_taxes.reduce((n, t) => n + (t.amount ?? 0), 0) : null,
    totalCents: inv.total ?? 0,
    automaticTax: Boolean(inv.automatic_tax?.enabled),
    taxStatus: taxStatusOf(inv.automatic_tax?.status),
    sponsorId: inv.metadata?.sponsor_id ?? null,
    month: inv.metadata?.month ?? null,
    description: inv.description ?? null,
  };
}

export function sponsorItemFrom(i: Stripe.InvoiceItem): SponsorItem {
  const quantity = i.quantity || 1;
  return {
    id: i.id,
    tier: i.metadata?.tier === "higher" ? "higher" : "standard",
    quantity,
    unitCents: Math.round(i.amount / quantity),
    description: i.description ?? "",
  };
}

export function stripeSponsors(s: Stripe | null = stripe()): SponsorGateway | null {
  if (!s) return null;
  return {
    async createSponsorCustomer({ sponsorId, name, email, country, postal }) {
      const c = await s.customers.create(
        { name, email, address: { country, postal_code: postal }, metadata: { sponsor_id: sponsorId } },
        { idempotencyKey: `sponsor-customer:${sponsorId}` },
      );
      return c.id;
    },

    async getSponsorInvoice(id) {
      try {
        const inv = await s.invoices.retrieve(id, { expand: ["total_taxes"] });
        return sponsorInvoiceFrom(inv);
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },

    async findSponsorInvoice({ customer, sponsorId, month }) {
      const list = await s.invoices.list({ customer, limit: 100 });
      const found = list.data.filter((i) => i.metadata?.sponsor_id === sponsorId && i.metadata?.month === month && i.status !== "void").sort((a, b) => b.created - a.created)[0];
      return found ? sponsorInvoiceFrom(found) : null;
    },

    async createSponsorDraft({ customer, sponsorId, month, currency, replacing }) {
      const inv = await s.invoices.create(
        {
          customer,
          currency: currency.toLowerCase(),
          collection_method: "send_invoice",
          days_until_due: 30,
          auto_advance: false,
          automatic_tax: { enabled: true },
          pending_invoice_items_behavior: "exclude",
          metadata: { sponsor_id: sponsorId, month },
        },
        { idempotencyKey: `sponsor-invoice:${sponsorId}:${month}:${replacing}` },
      );
      return sponsorInvoiceFrom(inv);
    },

    async describeSponsorInvoice(id, description) {
      await s.invoices.update(id, { description });
    },

    async listSponsorItems(invoice) {
      const list = await s.invoiceItems.list({ invoice, limit: 100 });
      return list.data.map(sponsorItemFrom);
    },

    async deleteSponsorItem(id) {
      try {
        await s.invoiceItems.del(id);
      } catch (e) {
        if (!missing(e)) throw e;
      }
    },

    async addSponsorItem({ invoice, customer, currency, sponsorId, month, line }) {
      const item = await s.invoiceItems.create({
        customer,
        invoice,
        currency: currency.toLowerCase(),
        quantity: line.quantity,
        unit_amount_decimal: Stripe.Decimal.from(String(line.unitCents)),
        tax_behavior: "exclusive",
        description: line.description,
        metadata: { sponsor_id: sponsorId, month, tier: line.tier },
      });
      return item.id;
    },

    async sendSponsorInvoice(id, refusals) {
      try {
        return sponsorInvoiceFrom(await s.invoices.sendInvoice(id, {}, { idempotencyKey: `sponsor-send:${id}:${refusals}` }));
      } catch (e) {
        if (e instanceof Stripe.errors.StripeInvalidRequestError) throw new SponsorSendRefused(e.message, e.code ?? null);
        throw e;
      }
    },
  };
}
