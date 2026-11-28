import type { AdjustmentGateway } from "@/lib/billing/subscriptions";

type Item = {
  id: string;
  customer: string;
  subscription: string;
  amountCents: number;
  currency: string;
  description: string;
  metadata: Record<string, string>;
  invoice: string | null;
};

/**
 * A fake Stripe for the contributor rule: invoice items held in memory (an
 * idempotency key returns the item it first made), subscription prices, and
 * a renewal that sweeps the subscription's pending items onto an invoice,
 * with tax at 13% as its own row.
 */
export function fakeAdjustments(o: { prices?: Record<string, number> } = {}) {
  const items = new Map<string, Item>();
  const byKey = new Map<string, string>();
  const subPrice = new Map<string, string>();
  const priceCents: Record<string, number> = { price_monthly_usd: 20000, price_monthly_higher_usd: 40000, price_monthly_cad: 28000, price_monthly_higher_cad: 56000, ...o.prices };
  let n = 0;
  let failCreate = 0;
  let failDelete = 0;

  const invoiceFor = (customer: string, subscription: string) => {
    const price = subPrice.get(subscription) ?? "price_monthly_usd";
    const pending = [...items.values()].filter((i) => i.customer === customer && i.subscription === subscription && !i.invoice);
    const lines = [
      { description: "1 × Roger monthly", amountCents: priceCents[price] ?? 0, invoiceItem: null as string | null },
      ...pending.map((i) => ({ description: i.description, amountCents: i.amountCents, invoiceItem: i.id as string | null })),
    ];
    const subtotal = lines.reduce((s, l) => s + l.amountCents, 0);
    const taxCents = Math.round(subtotal * 0.13);
    return { lines, taxCents, totalCents: subtotal + taxCents, pending };
  };

  const gw: AdjustmentGateway & {
    items: typeof items;
    subPrice: typeof subPrice;
    pending(customer?: string): Item[];
    failNextCreates(k: number): void;
    failNextDeletes(k: number): void;
    /** Stripe's renewal: the pending items go onto the invoice; returns its rows. */
    renew(customer: string, subscription: string): { id: string; lines: { description: string; amountCents: number; invoiceItem: string | null }[]; taxCents: number; totalCents: number };
    /** An item made outside the app (or left behind). */
    stray(customer: string, subscription: string, metadata?: Record<string, string>): string;
  } = {
    items,
    subPrice,
    pending: (customer) => [...items.values()].filter((i) => !i.invoice && (!customer || i.customer === customer)),
    failNextCreates: (k) => (failCreate = k),
    failNextDeletes: (k) => (failDelete = k),
    async createInvoiceItem({ customer, subscription, amountCents, currency, description, metadata, idempotencyKey }) {
      if (failCreate > 0) {
        failCreate--;
        throw new Error("Stripe is down");
      }
      const known = byKey.get(idempotencyKey);
      if (known) return known;
      const id = `ii_${++n}`;
      items.set(id, { id, customer, subscription, amountCents, currency: currency.toUpperCase(), description, metadata, invoice: null });
      byKey.set(idempotencyKey, id);
      return id;
    },
    async deleteInvoiceItem(id) {
      if (failDelete > 0) {
        failDelete--;
        throw new Error("Stripe is down");
      }
      const i = items.get(id);
      // On a finalized invoice: billed for good.
      if (i?.invoice) return "locked";
      items.delete(id);
      return "deleted";
    },
    async unitAmount(price) {
      return priceCents[price] ?? null;
    },
    async pendingInvoiceItems(customer) {
      return [...items.values()].filter((i) => i.customer === customer && !i.invoice).map((i) => ({ id: i.id, adjustmentId: i.metadata.adjustment_id ?? null, subscription: i.subscription }));
    },
    async previewRenewal({ customer, subscription }) {
      const inv = invoiceFor(customer, subscription);
      return { totalCents: inv.totalCents, taxCents: inv.taxCents, currency: "USD", lines: inv.lines };
    },
    renew(customer, subscription) {
      const inv = invoiceFor(customer, subscription);
      const id = `in_${++n}`;
      for (const i of inv.pending) i.invoice = id;
      return { id, lines: inv.lines, taxCents: inv.taxCents, totalCents: inv.totalCents };
    },
    stray(customer, subscription, metadata = {}) {
      const id = `ii_${++n}`;
      items.set(id, { id, customer, subscription, amountCents: 999, currency: "USD", description: "left over", metadata, invoice: null });
      return id;
    },
  };
  return gw;
}
