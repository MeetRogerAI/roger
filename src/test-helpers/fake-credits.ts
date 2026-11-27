import { sortByCreated, type BalanceTxn, type ChargeFacts, type CreditGateway, type DisputeFacts, type PaidInvoice, type RefundFacts } from "@/lib/billing/gateway";
import type { Currency } from "@/lib/billing/prices";

/**
 * A fake Stripe customer balance, invoices, refunds and disputes, as the
 * Unit 4 spike saw them on endive (see `CreditGateway` in gateway.ts):
 *
 * - balances use Stripe's sign (negative is credit), and a customer's
 *   currency is fixed by its first balance transaction or invoice: another
 *   currency is refused, as Stripe refuses it;
 * - a balance transaction keeps `metadata.credit_ledger_id`, and the same
 *   idempotency key with other parameters is refused like Stripe's
 *   `StripeIdempotencyError` (same parameters: the first answer again);
 *   `expireKeys()` is Stripe forgetting keys after 24 hours;
 * - `payInvoice` applies the balance before the card, as Stripe does: the
 *   card pays `total - credit`, and an invoice the balance covers has
 *   `amountPaid` 0 and no payment intent.
 */
export function fakeCredits() {
  const balances = new Map<string, number>();
  const currencies = new Map<string, Currency>();
  const txns: { id: string; customer: string; amount: number; ledgerId: string; endingBalance: number; created: number }[] = [];
  const keys = new Map<string, { params: string; result: BalanceTxn }>();
  const invoices = new Map<string, PaidInvoice>();
  const charges = new Map<string, ChargeFacts>();
  const refunds: (RefundFacts & { paymentIntent: string })[] = [];
  const disputes = new Map<string, DisputeFacts>();
  const calls: string[] = [];
  const failing = new Set<string>();
  let n = 0;
  let failures = 0;
  let lost = 0;
  let beforePost: (() => Promise<void>) | null = null;
  const clock = () => 1_800_000_000 + n;

  const fixCurrency = (customer: string, c: Currency) => {
    const had = currencies.get(customer);
    if (had && had !== c) {
      throw Object.assign(new Error(`You cannot use ${c.toLowerCase()} for this customer: its currency is ${had.toLowerCase()}.`), { type: "StripeInvalidRequestError" });
    }
    currencies.set(customer, c);
  };

  const gw: CreditGateway & {
    balances: typeof balances;
    txns: typeof txns;
    calls: string[];
    /** The next k balance posts fail before reaching Stripe. */
    failNext(k?: number): void;
    /** Every balance post for this customer fails (until `failing.delete`). */
    failing: typeof failing;
    /** The next balance post is made in Stripe, but its answer is lost. */
    loseNextAnswer(): void;
    /** Runs once, just before the next balance post reaches Stripe (an interleaving). */
    onNextPost(f: () => Promise<void>): void;
    /** Stripe forgets idempotency keys after 24 hours. */
    expireKeys(): void;
    /** Credit available to the customer (cents, positive). */
    credit(customer: string): number;
    /** Stripe finalizes and collects an invoice: the balance first, the card for the rest. */
    payInvoice(o: { id: string; customer: string; currency: Currency; totalExcludingTax: number; taxCents?: number; subscription?: string | null }): PaidInvoice & { chargeId: string | null; total: number };
    refund(charge: string, amount: number): string;
    openDisputeOn(charge: string, amount?: number): string;
    closeDispute(id: string, status: "won" | "lost"): void;
  } = {
    balances,
    txns,
    calls,
    failing,
    failNext: (k = 1) => void (failures = k),
    loseNextAnswer: () => void (lost = 1),
    onNextPost: (f) => void (beforePost = f),
    expireKeys: () => keys.clear(),
    credit: (c) => Math.max(0, -(balances.get(c) ?? 0)),

    async postBalance(o) {
      calls.push(`post:${o.customer}:${o.amountCents}`);
      if (beforePost) {
        const f = beforePost;
        beforePost = null;
        await f();
      }
      if (failures > 0 || failing.has(o.customer)) {
        if (failures > 0) failures--;
        throw new Error("Stripe is down");
      }
      const params = JSON.stringify([o.customer, o.amountCents, o.currency, o.ledgerId]);
      const seen = keys.get(o.idempotencyKey);
      if (seen) {
        if (seen.params !== params) {
          throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters they were first used with."), {
            type: "StripeIdempotencyError",
            rawType: "idempotency_error",
          });
        }
        return seen.result;
      }
      fixCurrency(o.customer, o.currency);
      const ending = (balances.get(o.customer) ?? 0) + o.amountCents;
      balances.set(o.customer, ending);
      const t = { id: `cbtxn_${++n}`, customer: o.customer, amount: o.amountCents, ledgerId: o.ledgerId, endingBalance: ending, created: clock() };
      txns.push(t);
      const result = { id: t.id, endingBalance: ending };
      keys.set(o.idempotencyKey, { params, result });
      if (lost > 0) {
        lost--;
        throw new Error("The connection dropped after Stripe made the transaction");
      }
      return result;
    },
    async findBalanceTransaction(customer, ledgerId) {
      calls.push(`list:${customer}`);
      const t = txns.filter((x) => x.customer === customer).find((x) => x.ledgerId === ledgerId);
      return t ? { id: t.id, endingBalance: t.endingBalance } : null;
    },
    async balance(customer) {
      return balances.get(customer) ?? 0;
    },
    async paidInvoice(id) {
      calls.push(`invoice:${id}`);
      const i = invoices.get(id);
      return i ? { ...i } : null;
    },
    async paidInvoices(customer) {
      return [...invoices.values()].filter((i) => i.customer === customer && i.status === "paid").map((i) => ({ ...i }));
    },
    async charge(id) {
      const c = charges.get(id);
      return c ? { ...c } : null;
    },
    async refundsFor(pi) {
      return sortByCreated(refunds.filter((r) => r.paymentIntent === pi).map((r) => ({ id: r.id, amount: r.amount, status: r.status, created: r.created })));
    },
    async dispute(id) {
      const d = disputes.get(id);
      return d ? { ...d } : null;
    },
    async disputesFor(pi) {
      return sortByCreated([...disputes.values()].filter((d) => d.paymentIntent === pi).map((d) => ({ ...d })));
    },

    payInvoice(o) {
      fixCurrency(o.customer, o.currency);
      const total = o.totalExcludingTax + (o.taxCents ?? 0);
      const credit = Math.max(0, -(balances.get(o.customer) ?? 0));
      const applied = Math.min(credit, total);
      if (applied) balances.set(o.customer, (balances.get(o.customer) ?? 0) + applied);
      const amountPaid = total - applied;
      const k = ++n;
      const pi = amountPaid > 0 ? `pi_${k}` : null;
      const chargeId = pi ? `ch_${k}` : null;
      if (pi && chargeId) charges.set(chargeId, { id: chargeId, amount: amountPaid, paymentIntent: pi });
      const inv: PaidInvoice = {
        id: o.id,
        customer: o.customer,
        subscription: o.subscription === undefined ? `sub_${o.customer}` : o.subscription,
        status: "paid",
        currency: o.currency,
        totalExcludingTax: o.totalExcludingTax,
        amountPaid,
        paymentIntent: pi,
      };
      invoices.set(o.id, inv);
      return { ...inv, chargeId, total };
    },
    refund(charge, amount) {
      const c = charges.get(charge)!;
      const id = `re_${++n}`;
      refunds.push({ id, amount, status: "succeeded", created: clock(), paymentIntent: c.paymentIntent! });
      return id;
    },
    openDisputeOn(charge, amount) {
      const c = charges.get(charge)!;
      const id = `du_${++n}`;
      disputes.set(id, { id, status: "needs_response", charge, paymentIntent: c.paymentIntent, amount: amount ?? c.amount, created: clock() });
      return id;
    },
    closeDispute(id, status) {
      const d = disputes.get(id)!;
      disputes.set(id, { ...d, status });
    },
  };
  return gw;
}
