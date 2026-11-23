import type { ChargeResult, InvoiceRow, PlanGateway, SubscriptionInfo } from "@/lib/billing/subscriptions";

type Invoice = InvoiceRow & { customer: string };

/**
 * A fake Stripe for the billing page: subscriptions with a paid period and a
 * cancel date, invoices, saved cards and scripted payments. Every call is
 * recorded, so a test can show which subscription was touched.
 */
export function fakePlans() {
  const subs = new Map<string, SubscriptionInfo>();
  const invoices: Invoice[] = [];
  const cards = new Map<string, number>();
  const calls: string[] = [];
  const pay: ChargeResult[] = [];
  let failures = 0;
  let lostAnswers = 0;
  const failIfAsked = () => {
    if (failures > 0) {
      failures--;
      throw new Error("Stripe is down");
    }
  };
  const sec = (d: Date) => Math.floor(d.getTime() / 1000);

  const gw: PlanGateway & {
    subs: typeof subs;
    bills: Invoice[];
    cards: typeof cards;
    calls: string[];
    pay: ChargeResult[];
    failNext(k: number): void;
    /** The next cancel is made in Stripe, but its answer never arrives. */
    loseNextAnswer(): void;
    add(id: string, customer: string, periodEnd: Date): void;
    /** Stripe ends the subscription (the paid period is over). */
    end(id: string, at: Date): void;
    /** A renewal invoice Stripe could not collect. */
    openInvoice(id: string, customer: string, subscription: string, cents?: number): void;
  } = {
    subs,
    bills: invoices,
    cards,
    calls,
    pay,
    failNext: (k) => (failures = k),
    loseNextAnswer: () => (lostAnswers = 1),
    add(id, customer, periodEnd) {
      subs.set(id, { id, status: "active", customer, cancelAt: null, periodEnd: sec(periodEnd), endedAt: null });
      cards.set(customer, 1);
    },
    end(id, at) {
      const s = subs.get(id)!;
      subs.set(id, { ...s, status: "canceled", endedAt: sec(at) });
    },
    openInvoice(id, customer, subscription, cents = 22600) {
      invoices.unshift({ id, customer, subscription, number: `R-${invoices.length + 1}`, created: 1_800_000_000 + invoices.length,totalCents: cents, currency: "USD", status: "open", hostedUrl: `https://invoice.stripe.test/${id}` });
    },
    async getSubscription(id) {
      calls.push(`get:${id}`);
      failIfAsked();
      const s = subs.get(id);
      return s ? { ...s } : null;
    },
    async cancelAtPeriodEnd(id) {
      calls.push(`cancel_at_end:${id}`);
      failIfAsked();
      const s = subs.get(id);
      if (!s) throw new Error(`No such subscription: ${id}`);
      // Newer API versions report the end as the cancel date.
      subs.set(id, { ...s, cancelAt: s.periodEnd });
      if (lostAnswers > 0) {
        lostAnswers--;
        throw new Error("The connection dropped after Stripe made the change");
      }
      return { ...subs.get(id)! };
    },
    async keepSubscription(id) {
      calls.push(`keep:${id}`);
      failIfAsked();
      const s = subs.get(id);
      if (!s) throw new Error(`No such subscription: ${id}`);
      if (s.status === "canceled") return { ...s };
      subs.set(id, { ...s, cancelAt: null });
      return { ...subs.get(id)! };
    },
    async cancelNow(id) {
      calls.push(`cancel_now:${id}`);
      failIfAsked();
      const s = subs.get(id)!;
      subs.set(id, { ...s, status: "canceled", endedAt: sec(new Date()) });
      return { ...subs.get(id)! };
    },
    async removeCards(customer) {
      calls.push(`remove_cards:${customer}`);
      failIfAsked();
      const n = cards.get(customer) ?? 0;
      cards.set(customer, 0);
      return n;
    },
    async invoices(customer) {
      return invoices.filter((i) => i.customer === customer).map((i) => ({ ...i }));
    },
    async unpaidInvoice(subscription) {
      return (await gw.openInvoices(subscription))[0] ?? null;
    },
    async openInvoices(subscription) {
      return invoices
        .filter((x) => x.subscription === subscription && x.status === "open")
        .sort((a, b) => a.created - b.created)
        .map((i) => ({ ...i }));
    },
    async invoice(id) {
      const i = invoices.find((x) => x.id === id);
      return i ? { ...i } : null;
    },
    async payInvoice(id, key) {
      calls.push(`pay:${id}:${key}`);
      const r = pay.shift() ?? ({ kind: "succeeded", object: id, amountCents: 22600, currency: "USD" } as ChargeResult);
      if (r.kind === "succeeded") {
        const i = invoices.find((x) => x.id === id);
        if (i) i.status = "paid";
      }
      return r;
    },
  };
  return gw;
}
