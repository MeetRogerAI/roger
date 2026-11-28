import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paidInvoiceFrom } from "@/lib/billing/gateway";
import { balance, newSandboxWorld, sandboxEnvPresent, type SandboxMember, type SandboxWorld } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * B2 referral credit in the Stripe sandbox (B3 plan Unit 13; spec B.15):
 * the referred member's first paid monthly invoice gives the referrer one
 * month of credit on their Stripe customer balance; the referrer's next
 * renewal, on the test clock, takes it; refunding the referred member's
 * payment then claws it back, as a balance the referrer owes.
 *
 * The real webhook handler, the real credit gateway (customer balance
 * transactions, refunds) and Stripe's own events, read back after each step.
 * Skipped unless SCENARIO_TARGET=sandbox and the sandbox variables are set.
 */
const LONG = 600_000;
let w: SandboxWorld;

const ledger = (w: SandboxWorld) =>
  w.query<{ kind: string; status: string; amount_cents: number; uncollected_cents: number; currency: string; user_id: string; stripe_txn: string | null }>(
    `select kind, status, amount_cents, uncollected_cents, currency, user_id, stripe_txn from credits order by created_at, kind`,
  );

async function referred(w: SandboxWorld, referrer: SandboxMember, m: Parameters<SandboxWorld["member"]>[0]) {
  const b = await w.member(m);
  await w.query(`insert into referrals (referrer_id, referred_user_id, source, stage, trial_at) values ($1, $2, 'link', 'trial', $3)`, [referrer.id, b.id, w.now.toISOString()]);
  return b;
}

describe.skipIf(!sandboxEnvPresent())("sandbox: referral credit, spent and clawed back", () => {
  beforeEach(async () => {
    w = await newSandboxWorld({ settings: [{ key: "v3.signupOpen", value: true }, { key: "v3.referralsOn", value: true }] });
  }, LONG);
  afterEach(async () => {
    await w?.cleanup();
  }, LONG);

  it(
    "grants CA$280 on the referred member's first invoice, the referrer's renewal takes it, and a refund claws it back",
    async () => {
      const ana = await w.member({ email: "ana@example.ca", currency: "CAD", country: "CA" });
      await w.subscribe(ana);
      const ben = await referred(w, ana, { email: "ben@example.ca", currency: "CAD", country: "CA" });
      // Ben's first monthly charge: Stripe's invoice.paid reaches the handler, which grants and posts the credit.
      await w.subscribe(ben);
      await w.until("the grant is posted", async () => (await ledger(w)).some((c) => c.kind === "grant" && c.status === "posted"));
      const [grant] = await ledger(w);
      expect(grant).toMatchObject({ kind: "grant", status: "posted", currency: "CAD", user_id: ana.id, amount_cents: 28000 });
      expect(grant.stripe_txn).toMatch(/^cbtxn_/);
      expect(await balance(w, ana.customer)).toBe(-28000);
      expect((await w.query<{ stage: string }>(`select stage from referrals where referred_user_id = $1`, [ben.id]))[0].stage).toBe("paying");

      // A month on: Ana's renewal, on her test clock, spends the credit.
      await w.advance(new Date(w.now.getTime() + 33 * 86_400_000));
      const renewal = (await w.stripe.invoices.list({ customer: ana.customer, limit: 10 })).data.find((x) => x.billing_reason === "subscription_cycle");
      expect(renewal?.status).toBe("paid");
      expect(renewal!.starting_balance).toBe(-28000);
      expect(await balance(w, ana.customer)).toBe(0);

      // Ben's first payment refunded in full: charge.refunded claws the grant back. Spent credit is owed (a positive balance).
      const first = (await w.stripe.invoices.list({ customer: ben.customer, status: "paid", limit: 10, expand: ["data.payments"] })).data.find(
        (x) => x.billing_reason === "subscription_create",
      )!;
      const pi = paidInvoiceFrom(first).paymentIntent;
      expect(pi).toBeTruthy();
      await w.stripe.refunds.create({ payment_intent: pi! });
      await w.until("the clawback is posted", async () => (await ledger(w)).some((c) => c.kind === "clawback" && c.status === "posted"));
      const claw = (await ledger(w)).find((c) => c.kind === "clawback")!;
      expect(claw).toMatchObject({ user_id: ana.id, currency: "CAD", amount_cents: 28000 });
      expect(await balance(w, ana.customer)).toBe(claw.amount_cents - claw.uncollected_cents);
    },
    LONG,
  );
});
