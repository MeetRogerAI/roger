/**
 * The sandbox world (B3 plan Unit 13): one scenario's marked scenario-test
 * database, the Stripe sandbox through the app's real gateways, a recording
 * mail transport, and one app clock with the Stripe test clocks in step.
 *
 * What differs from the fakes world (tests/scenarios/helpers.ts `newWorld`):
 * - Customers are made here, on a test clock (`customers.create({ test_clock })`):
 *   a customer can't join a clock later, so the Payment page's own customer and
 *   Checkout step are not driven. The card is Stripe's test card `pm_card_visa`,
 *   saved as the customer's default.
 * - Stripe's own events are not delivered by Stripe to this database. After
 *   every clock step, and in `until`, the world reads Stripe's events since the
 *   scenario began (the kinds the webhook handles), keeps the ones about its own
 *   customers, and hands them, oldest first, to the webhook's own handler
 *   (`handleStripeEvent`, which claims each event id once); then the accounts
 *   step of the reconcile (`reconcileUsers`) runs.
 *
 * Every sandbox scenario calls `cleanup()` in `afterEach`: the test clocks are
 * deleted, which deletes their customers, and so is any customer made off a
 * clock (a sponsor's).
 */
import type Stripe from "stripe";
import { vi } from "vitest";
import { stripeCredits, stripeGateway } from "@/lib/billing/gateway";
import { HANDLED_EVENT_TYPES, reconcileUsers } from "@/lib/billing/reconcile";
import { stripeSponsors } from "@/lib/billing/sponsor-gateway";
import { stripeAdjustments, stripeBilling, stripeOrders, stripePlans } from "@/lib/billing/subscriptions";
import { handleStripeEvent, type EventOutcome } from "@/lib/billing/webhook";
import type { Transport } from "@/lib/mail/send";
import { mergeV3, type V3Settings } from "@/lib/v3-settings";
import { openSandbox, stripeTestClocks, TestClocks } from "./sandbox";

export type SandboxMember = { id: string; email: string; customer: string; clock: string; currency: "USD" | "CAD"; country: "CA" | "US" };
type Sent = { to: string; subject: string; text: string };

/** A billing address Stripe Tax can place (automatic tax needs one). */
const ADDRESS = { CA: { country: "CA", postal_code: "M5V 2T6", state: "ON" }, US: { country: "US", postal_code: "10001", state: "NY" } } as const;

/** Stripe's test card that attaches but declines every charge (docs, "Testing": `pm_card_chargeCustomerFail`). */
const FAILING_CARD = "pm_card_chargeCustomerFail";

export async function newSandboxWorld(o: { settings?: { key: string; value: unknown }[] } = {}) {
  vi.stubEnv("ADMIN_EMAILS", "peter@example.com,ehab@example.com");
  // The refusals (live key, unmarked database, the production URL) come first, then the reset.
  const { query, stripe } = await openSandbox(process.env);
  const startedReal = Math.floor(Date.now() / 1000);
  const clocks = new TestClocks(stripeTestClocks(stripe), new Date(startedReal * 1000), { name: `roger scenario ${new Date().toISOString().slice(0, 16)}` });
  const settings: V3Settings = mergeV3([{ key: "v3.cycleLive", value: true }, ...(o.settings ?? [])]);
  await query(`insert into settings (key, value) values ('v3.cycleLive', 'true'::jsonb), ('v3.cycleLiveSince', to_jsonb($1::text)) on conflict (key) do nothing`, [clocks.now.toISOString()]);

  const sent: Sent[] = [];
  const transport: Transport = async (m) => {
    sent.push({ to: m.to.join(","), subject: m.subject, text: m.text });
    return { ok: true };
  };
  const mail = { query, transport, sleep: async () => {} };
  const card = stripeGateway(stripe)!;
  const billing = stripeBilling(stripe)!;
  const plans = stripePlans(stripe)!;
  const orders = stripeOrders(stripe)!;
  const adjust = stripeAdjustments(stripe)!;
  const credits = stripeCredits(stripe)!;
  const sponsors = stripeSponsors(stripe)!;
  const customers = new Set<string>();
  /** Customers made off any clock (a sponsor's): deleted one by one at cleanup. */
  const loose = new Set<string>();
  const outcomes: { id: string; type: string; outcome: EventOutcome }[] = [];

  const webhook = (e: Stripe.Event) =>
    handleStripeEvent(query, card, e, {
      getSettings: async () => settings,
      now: clocks.now,
      // The credit ledger's clock is never ahead of the real one (as the route and the reconcile pass it).
      creditsNow: new Date(Math.min(clocks.now.getTime(), Date.now())),
      adjust,
      plans,
      billing,
      orders,
      credits,
      ...mail,
    });

  const customerOf = (obj: unknown): string | null => {
    const c = (obj as { customer?: string | { id: string } | null }).customer;
    return c == null ? null : typeof c === "string" ? c : c.id;
  };

  /** Stripe's events about this world's customers since it began, oldest first, through the webhook's handler. */
  async function events(): Promise<number> {
    const page: Stripe.Event[] = [];
    let after: string | undefined;
    for (let n = 0; n < 10; n++) {
      const list = await stripe.events.list({ created: { gte: startedReal - 60 }, types: HANDLED_EVENT_TYPES, limit: 100, ...(after ? { starting_after: after } : {}) });
      page.push(...list.data);
      if (!list.has_more || !list.data.length) break;
      after = list.data.at(-1)!.id;
    }
    const ours = page.filter((e) => {
      const c = customerOf(e.data.object);
      return c != null && (customers.has(c) || loose.has(c));
    });
    ours.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
    let handled = 0;
    for (const e of ours) {
      if (outcomes.some((x) => x.id === e.id)) continue;
      const outcome = await webhook(e);
      outcomes.push({ id: e.id, type: e.type, outcome });
      if (outcome === "handled") handled++;
    }
    return handled;
  }

  /** The reconcile's accounts step, on the app clock. */
  const accounts = () => reconcileUsers(query, { plans, gw: billing, orders, adjust, settings, now: clocks.now, ...mail });

  const w = {
    query,
    stripe,
    settings,
    sent,
    clocks,
    outcomes,
    gateways: { card, billing, plans, orders, adjust, credits, sponsors },
    get now() {
      return clocks.now;
    },
    mail: { ...mail, settings, now: () => clocks.now },
    webhook,
    events,
    accounts,

    /**
     * A member with a saved card (a trial that has saved one: `trial_started_at` set), on the next test clock.
     */
    async member(m: { email: string; currency: "USD" | "CAD"; country: "CA" | "US"; status?: "trial" | "active" }): Promise<SandboxMember> {
      const clock = await clocks.nextCustomerClock();
      const [u] = await query<{ id: string }>(
        `insert into users (email, name, status, plan, sharing, currency, signup_step, email_verified_at, trial_started_at, card_fingerprint)
         values ($1, 'Scenario', $2, 'monthly', 'share', $3, 'done', $4, $4, $5) returning id`,
        [m.email, m.status ?? "trial", m.currency, clocks.now.toISOString(), `fp_${m.email}`],
      );
      const c = await stripe.customers.create({
        email: m.email,
        name: "Scenario",
        test_clock: clock,
        address: ADDRESS[m.country],
        payment_method: "pm_card_visa",
        invoice_settings: { default_payment_method: "pm_card_visa" },
        metadata: { user_id: u.id },
      });
      customers.add(c.id);
      await query(`update users set stripe_customer = $2 where id = $1`, [u.id, c.id]);
      return { id: u.id, email: m.email, customer: c.id, clock, currency: m.currency, country: m.country };
    },

    /** The first monthly charge through the real billing gateway, recorded as the charge job records it. */
    async subscribe(m: SandboxMember): Promise<string> {
      const price = process.env[m.currency === "CAD" ? "STRIPE_PRICE_MONTHLY_CAD" : "STRIPE_PRICE_MONTHLY_USD"]!;
      const r = await billing.createSubscription({ customer: m.customer, price, claimId: crypto.randomUUID(), userId: m.id, idempotencyKey: `scenario:${m.id}` });
      if (r.kind !== "succeeded") throw new Error(`${m.email}: the first charge was ${JSON.stringify(r)}`);
      await query(
        `update users set status = 'active', free_lists_used = $2, stripe_subscription = $3, first_charge_at = $4, billing_anchor = $4 where id = $1`,
        [m.id, settings.freeRuns, r.object, new Date((r.anchor ?? Math.floor(clocks.now.getTime() / 1000)) * 1000).toISOString()],
      );
      return r.object;
    },

    /** From now on every charge to this member is declined (the default card becomes Stripe's always-declining card). */
    async failLater(m: SandboxMember): Promise<void> {
      const pm = await stripe.paymentMethods.attach(FAILING_CARD, { customer: m.customer });
      await stripe.customers.update(m.customer, { invoice_settings: { default_payment_method: pm.id } });
    },

    /** A customer this scenario made off any clock (a sponsor's): its events are delivered and it is deleted at cleanup. */
    track(customer: string) {
      loose.add(customer);
    },

    /** Every clock to `to`, a month at most a step; after each step the events, then the accounts. */
    async advance(to: Date): Promise<void> {
      await clocks.advance(to, async () => {
        await events();
        await accounts();
      });
    },

    /** Delivers events until `check` holds (Stripe's events can trail a clock by a few seconds). */
    async until(label: string, check: () => Promise<boolean>, timeoutMs = 90_000): Promise<void> {
      const stop = Date.now() + timeoutMs;
      for (;;) {
        await events();
        if (await check()) return;
        if (Date.now() >= stop) throw new Error(`Timed out waiting for: ${label}`);
        await new Promise((r) => setTimeout(r, 3_000));
      }
    },

    /** The test clocks (and their customers) and any loose customer, deleted. */
    async cleanup(): Promise<void> {
      const errors: string[] = [];
      await clocks.deleteAll().catch((e: Error) => errors.push(e.message));
      for (const c of loose) await stripe.customers.del(c).catch(() => errors.push(`customer ${c}`));
      if (errors.length) throw new Error(`Sandbox cleanup left objects behind: ${errors.join("; ")}`);
    },
  };
  return w;
}

export type SandboxWorld = Awaited<ReturnType<typeof newSandboxWorld>>;

/** A member's Stripe balance in cents (negative is credit the next invoice takes). */
export async function balance(w: SandboxWorld, customer: string): Promise<number> {
  return w.gateways.credits.balance(customer);
}
