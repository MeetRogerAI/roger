import type { CardGateway, SetupSession, TaxLocation } from "@/lib/billing/gateway";

/** A fake Stripe: one customer per user id (like the idempotency key), sessions held in memory. */
export function fakeGateway(tax: TaxLocation = "ok") {
  const customers = new Map<string, string>();
  const sessions = new Map<string, SetupSession>();
  const defaults = new Map<string, string>();
  let n = 0;
  const gw: CardGateway & {
    complete(id: string, country?: string): void;
    sessions: typeof sessions;
    defaults: typeof defaults;
    customersCreated: () => number;
  } = {
    async createCustomer({ userId }) {
      if (!customers.has(userId)) customers.set(userId, `cus_${userId.slice(0, 8)}`);
      return customers.get(userId)!;
    },
    async createSetupSession({ userId, customer, currency, purpose }) {
      const id = `cs_${++n}`;
      sessions.set(id, { id, status: "open", customer, paymentMethod: null, userId, currency, country: null, purpose: purpose ?? null });
      return { id, url: `https://checkout.stripe.test/${id}` };
    },
    async getSetupSession(id) {
      const s = sessions.get(id);
      if (!s) throw new Error("No such session");
      return s;
    },
    async setDefaultCard(customer, pm) {
      defaults.set(customer, pm);
    },
    async checkTaxLocation() {
      return tax;
    },
    complete(id, country = "CA") {
      const s = sessions.get(id)!;
      sessions.set(id, { ...s, status: "complete", paymentMethod: "pm_card", country });
    },
    sessions,
    defaults,
    customersCreated: () => customers.size,
  };
  return gw;
}
