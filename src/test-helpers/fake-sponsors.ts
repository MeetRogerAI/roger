import { SponsorSendRefused, type SponsorGateway, type SponsorInvoice, type SponsorItem } from "@/lib/billing/sponsor-gateway";

/**
 * A fake of the Stripe calls in sponsor-gateway.ts, keeping the contracts
 * the code relies on:
 *
 * - an idempotency key used again with other parameters is refused like
 *   Stripe's `StripeIdempotencyError`; with the same parameters, Stripe's
 *   first answer is replayed as it was then (a stale status included).
 *   `expireKeys()` is Stripe forgetting keys after 24 hours;
 * - automatic tax is "complete" only when the customer has a country and a
 *   postal code, otherwise "requires_location_inputs" and no tax;
 * - sending a draft finalizes and emails it; Stripe refuses to finalize one
 *   whose tax can't be calculated (`customer_tax_location_invalid`).
 *
 * Interleavings and failures: `before(call, fn)` runs fn once just before
 * the next such call; `failNext(call)` fails it before it reaches Stripe;
 * `loseNextAnswer(call)` does it at Stripe and then throws.
 */
type Call = "customer" | "get" | "find" | "create" | "describe" | "list" | "delete" | "add" | "send";
type Inv = SponsorInvoice & { customer: string; created: number; emailed: number };

export function fakeSponsors(o: { taxRate?: number } = {}) {
  const rate = o.taxRate ?? 0.13;
  const customers = new Map<string, { name: string; email: string; country: string; postal: string; sponsorId: string }>();
  const invoices = new Map<string, Inv>();
  const items = new Map<string, SponsorItem & { invoice: string }>();
  const keys = new Map<string, { params: string; answer?: unknown; error?: unknown }>();
  const calls: string[] = [];
  const failing = new Map<Call, number>();
  const losing = new Set<Call>();
  const hooks = new Map<Call, () => Promise<void>>();
  let n = 0;

  const enter = async (c: Call, detail = "") => {
    calls.push(detail ? `${c}:${detail}` : c);
    const hook = hooks.get(c);
    if (hook) {
      hooks.delete(c);
      await hook();
    }
    const k = failing.get(c) ?? 0;
    if (k > 0) {
      failing.set(c, k - 1);
      throw new Error(`Stripe is down (${c})`);
    }
  };
  const leave = <T>(c: Call, v: T): T => {
    if (losing.delete(c)) throw new Error(`The answer to ${c} was lost`);
    return v;
  };
  const keyed = <T>(key: string, params: unknown, make: () => T): T => {
    const p = JSON.stringify(params);
    const had = keys.get(key);
    if (had) {
      if (had.params !== p) throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters they were first used with."), { type: "StripeIdempotencyError" });
      // Stripe replays a key's first answer for 24 hours, a refusal (4xx) included.
      if (had.error) throw had.error;
      return structuredClone(had.answer) as T;
    }
    let answer: T;
    try {
      answer = make();
    } catch (e) {
      if (e instanceof SponsorSendRefused) keys.set(key, { params: p, error: e });
      throw e;
    }
    keys.set(key, { params: p, answer: structuredClone(answer) });
    return answer;
  };
  const taxable = (customer: string) => {
    const c = customers.get(customer);
    return Boolean(c?.country && c.postal);
  };
  /** Recomputes an invoice's totals from its items, as Stripe does on each change. */
  const settle = (inv: Inv): SponsorInvoice => {
    const lines = [...items.values()].filter((i) => i.invoice === inv.id);
    inv.subtotalCents = lines.reduce((s, l) => s + l.quantity * l.unitCents, 0);
    const ok = taxable(inv.customer);
    inv.taxStatus = ok ? "complete" : "requires_location_inputs";
    inv.taxCents = ok ? Math.round(inv.subtotalCents * rate) : 0;
    inv.totalCents = inv.subtotalCents + (inv.taxCents ?? 0);
    const { customer: _c, created: _t, emailed: _e, ...out } = inv;
    void _c;
    void _t;
    void _e;
    return structuredClone(out);
  };
  const draftOnly = (inv: Inv | undefined, id: string) => {
    if (!inv) throw new Error(`No such invoice: ${id}`);
    if (inv.status !== "draft") throw Object.assign(new Error("This invoice is no longer a draft."), { code: "invoice_not_editable" });
    return inv;
  };

  const gw: SponsorGateway & {
    customers: typeof customers;
    invoices: typeof invoices;
    items: typeof items;
    calls: string[];
    failNext(c: Call, k?: number): void;
    loseNextAnswer(c: Call): void;
    before(c: Call, f: () => Promise<void>): void;
    expireKeys(): void;
    /** An admin voids the invoice in Stripe's dashboard (or deletes the draft). */
    voidInvoice(id: string, how?: "void" | "delete"): void;
    /** The tiers, quantities and prices on an invoice, sorted. */
    linesOf(id: string): [string, number, number][];
  } = {
    customers,
    invoices,
    items,
    calls,
    failNext(c, k = 1) {
      failing.set(c, k);
    },
    loseNextAnswer(c) {
      losing.add(c);
    },
    before(c, f) {
      hooks.set(c, f);
    },
    expireKeys() {
      keys.clear();
    },
    voidInvoice(id, how = "void") {
      if (how === "delete") invoices.delete(id);
      else invoices.get(id)!.status = "void";
    },
    linesOf(id) {
      return [...items.values()]
        .filter((i) => i.invoice === id)
        .map((i): [string, number, number] => [i.tier, i.quantity, i.unitCents])
        .sort();
    },

    async createSponsorCustomer(c) {
      await enter("customer", c.sponsorId);
      const id = keyed(`sponsor-customer:${c.sponsorId}`, c, () => {
        const id = `cus_s${++n}`;
        customers.set(id, { ...c });
        return id;
      });
      return leave("customer", id);
    },
    async getSponsorInvoice(id) {
      await enter("get", id);
      const inv = invoices.get(id);
      return leave("get", inv ? settle(inv) : null);
    },
    async findSponsorInvoice({ customer, sponsorId, month }) {
      await enter("find");
      const found = [...invoices.values()]
        .filter((i) => i.customer === customer && i.sponsorId === sponsorId && i.month === month && i.status !== "void")
        .sort((a, b) => b.created - a.created)[0];
      return leave("find", found ? settle(found) : null);
    },
    async createSponsorDraft(d) {
      await enter("create", `${d.sponsorId}:${d.month}`);
      if (!customers.has(d.customer)) throw new Error(`No such customer: ${d.customer}`);
      const answer = keyed(`sponsor-invoice:${d.sponsorId}:${d.month}:${d.replacing}`, d, () => {
        const inv: Inv = {
          id: `in_s${++n}`,
          customer: d.customer,
          created: n,
          emailed: 0,
          status: "draft",
          currency: d.currency,
          subtotalCents: 0,
          taxCents: 0,
          totalCents: 0,
          automaticTax: true,
          taxStatus: null,
          sponsorId: d.sponsorId,
          month: d.month,
          description: null,
        };
        invoices.set(inv.id, inv);
        return settle(inv);
      });
      return leave("create", answer);
    },
    async describeSponsorInvoice(id, description) {
      await enter("describe", id);
      draftOnly(invoices.get(id), id).description = description;
      leave("describe", null);
    },
    async listSponsorItems(invoice) {
      await enter("list", invoice);
      return leave(
        "list",
        [...items.values()].filter((i) => i.invoice === invoice).map(({ invoice: _i, ...rest }) => (void _i, { ...rest })),
      );
    },
    async deleteSponsorItem(id) {
      await enter("delete", id);
      const it = items.get(id);
      if (it) draftOnly(invoices.get(it.invoice), it.invoice);
      items.delete(id);
      leave("delete", null);
    },
    async addSponsorItem({ invoice, line }) {
      await enter("add", `${invoice}:${line.tier}`);
      draftOnly(invoices.get(invoice), invoice);
      const id = `ii_s${++n}`;
      items.set(id, { ...line, id, invoice });
      return leave("add", id);
    },
    async sendSponsorInvoice(id, refusals) {
      await enter("send", id);
      const answer = keyed(`sponsor-send:${id}:${refusals}`, { id }, () => {
        const inv = invoices.get(id);
        if (!inv) throw new Error(`No such invoice: ${id}`);
        if (inv.status === "draft") {
          if (!taxable(inv.customer)) throw new SponsorSendRefused("The customer's location isn't recognized for tax.", "customer_tax_location_invalid");
          inv.status = "open";
        }
        inv.emailed++;
        return settle(inv);
      });
      return leave("send", answer);
    },
  };
  return gw;
}
