import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newSandboxWorld, sandboxEnvPresent, type SandboxMember, type SandboxWorld } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * B1 billing in the Stripe sandbox (B3 plan Unit 13, the by-hand integration
 * check): four monthly members, so two test clocks (three customers each at
 * most), charged through the real billing gateway, then one month on the test
 * clocks. Every clock ends at the same instant as the app clock; Stripe's own
 * renewals and their events reach the webhook's handler; three renewals are
 * paid and the fourth (a card that now declines) is recorded as failed.
 *
 * Skipped unless SCENARIO_TARGET=sandbox and the sandbox variables are set
 * (tests/scenarios/README.md). Never runs against a live key.
 */
const LONG = 600_000;
let w: SandboxWorld;

describe.skipIf(!sandboxEnvPresent())("sandbox: a monthly renewal on two test clocks", () => {
  beforeEach(async () => {
    w = await newSandboxWorld();
  }, LONG);
  afterEach(async () => {
    await w?.cleanup();
  }, LONG);

  it(
    "renews four subscribers across two clocks, all clocks at the app clock's instant; the declining card is recorded as a failed renewal",
    async () => {
      const members: SandboxMember[] = [];
      for (const [email, currency, country] of [
        ["pia@example.ca", "CAD", "CA"],
        ["tess@example.com", "USD", "US"],
        ["sid@example.ca", "CAD", "CA"],
        ["dee@example.com", "USD", "US"],
      ] as const) {
        members.push(await w.member({ email, currency, country }));
      }
      // Customers 1 to 3 on the first clock, customer 4 on a second.
      expect(w.clocks.ids).toHaveLength(2);
      expect(members.map((m) => m.clock)).toEqual([w.clocks.ids[0], w.clocks.ids[0], w.clocks.ids[0], w.clocks.ids[1]]);

      const subs = [];
      for (const m of members) subs.push(await w.subscribe(m));
      const status = async (m: SandboxMember) => (await w.query<{ status: string }>(`select status from users where id = $1`, [m.id]))[0].status;
      for (const m of members) expect(await status(m)).toBe("active");
      const declining = members[3];
      await w.failLater(declining);

      // A month and two days on: past each anniversary, and past the hour Stripe waits before finalizing a renewal.
      const to = new Date(w.now.getTime() + 33 * 86_400_000);
      await w.advance(to);
      expect(w.now.getTime()).toBe(Math.floor(to.getTime() / 1000) * 1000);
      for (const id of w.clocks.ids) {
        const c = await w.stripe.testHelpers.testClocks.retrieve(id);
        expect(c).toMatchObject({ status: "ready", frozen_time: Math.floor(w.now.getTime() / 1000) });
      }

      // Stripe renewed every subscription on its own clock.
      for (const [i, m] of members.entries()) {
        const invoices = await w.stripe.invoices.list({ customer: m.customer, subscription: subs[i], limit: 10 });
        expect(invoices.data.filter((x) => x.billing_reason === "subscription_cycle")).toHaveLength(1);
      }
      const failedAt = async () => (await w.query<{ at: string | null }>(`select renewal_failed_at::text as at from users where id = $1`, [declining.id]))[0].at;
      await w.until("the declined renewal reaches the webhook", async () => (await failedAt()) !== null);
      for (const m of members.slice(0, 3)) {
        const [u] = await w.query<{ status: string; renewal_failed_at: string | null }>(`select status, renewal_failed_at::text from users where id = $1`, [m.id]);
        expect(u).toEqual({ status: "active", renewal_failed_at: null });
        const paid = await w.stripe.invoices.list({ customer: m.customer, status: "paid", limit: 10 });
        expect(paid.data).toHaveLength(2);
      }
      // The handler took Stripe's own renewal events (a failing handler would have thrown above).
      expect(w.outcomes.length).toBeGreaterThan(0);
      expect(w.outcomes.map((o) => o.type)).toEqual(expect.arrayContaining(["invoice.paid", "invoice.payment_failed"]));
    },
    LONG,
  );
});
