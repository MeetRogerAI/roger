import type Stripe from "stripe";
import { stripe } from "./stripe";

/**
 * The few Stripe calls the app makes, behind one small interface so the rules
 * around them can be tested with a fake. Every call that creates something
 * passes an idempotency key, so a retried request cannot create it twice.
 */
export type TaxLocation = "ok" | "not_collecting" | "invalid";

/** Stripe could not work out the tax this time; worth trying again, not the person's fault. */
export class TaxLookupUnavailable extends Error {}

export type SetupSession = {
  id: string;
  status: "open" | "complete" | "expired";
  customer: string | null;
  paymentMethod: string | null;
  userId: string | null;
  currency: "USD" | "CAD" | null;
  country: string | null;
};

export type CardGateway = {
  createCustomer(o: { userId: string; email: string; name: string }): Promise<string>;
  createSetupSession(o: { userId: string; customer: string; currency: "USD" | "CAD"; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }>;
  getSetupSession(id: string): Promise<SetupSession>;
  setDefaultCard(customer: string, paymentMethod: string): Promise<void>;
  checkTaxLocation(customer: string): Promise<TaxLocation>;
};

export function stripeGateway(s: Stripe | null = stripe()): CardGateway | null {
  if (!s) return null;
  return {
    async createCustomer({ userId, email, name }) {
      const c = await s.customers.create({ email, name, metadata: { user_id: userId } }, { idempotencyKey: `customer:${userId}` });
      return c.id;
    },

    async createSetupSession({ userId, customer, currency, successUrl, cancelUrl }) {
      const session = await s.checkout.sessions.create({
        mode: "setup",
        customer,
        currency: currency.toLowerCase(),
        billing_address_collection: "required",
        customer_update: { address: "auto", name: "auto" },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { user_id: userId, currency },
        setup_intent_data: { metadata: { user_id: userId } },
      });
      if (!session.url) throw new Error("Stripe returned no Checkout URL");
      return { id: session.id, url: session.url };
    },

    async getSetupSession(id) {
      const session = await s.checkout.sessions.retrieve(id, { expand: ["setup_intent"] });
      const intent = session.setup_intent as Stripe.SetupIntent | string | null;
      const pm = intent && typeof intent !== "string" ? intent.payment_method : null;
      const cur = session.metadata?.currency;
      return {
        id: session.id,
        status: (session.status ?? "open") as SetupSession["status"],
        customer: typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null),
        paymentMethod: typeof pm === "string" ? pm : (pm?.id ?? null),
        userId: session.metadata?.user_id ?? null,
        currency: cur === "USD" || cur === "CAD" ? cur : null,
        country: session.customer_details?.address?.country ?? null,
      };
    },

    async setDefaultCard(customer, paymentMethod) {
      await s.customers.update(customer, { invoice_settings: { default_payment_method: paymentMethod } });
    },

    async checkTaxLocation(customer) {
      try {
        const c = await s.customers.update(customer, { tax: { validate_location: "immediately" }, expand: ["tax"] });
        return taxStatus(c.tax?.automatic_tax);
      } catch (e) {
        if ((e as { code?: string }).code === "customer_tax_location_invalid") return "invalid";
        throw e;
      }
    },
  };
}

/**
 * Stripe Tax's verdict on a customer's address. Only "unrecognized_location"
 * means the address is not good enough; "failed" (or no answer) is Stripe's
 * problem and is retried, never blamed on the person.
 */
export function taxStatus(status: string | null | undefined): TaxLocation {
  if (status === "supported") return "ok";
  if (status === "not_collecting") return "not_collecting";
  if (status === "unrecognized_location") return "invalid";
  throw new TaxLookupUnavailable(`Stripe Tax answered ${status ?? "nothing"}`);
}
