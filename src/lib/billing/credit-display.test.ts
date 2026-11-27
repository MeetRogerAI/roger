import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { cacheInvoiceBalance, displayCredit, emailCredit } from "./credit-display";
import { paymentCredit } from "./payment-page";

/** B2 plan Unit 5: which referral credit a display or an email may show. */

let query: Query;
let id: string;
const NOW = new Date("2026-12-12T15:00:00Z");
const cache = () => query<{ cents: number | null; at: Date | null }>("select credit_balance_cents as cents, credit_balance_at as at from users where id = $1", [id]).then((r) => r[0]);

beforeEach(async () => {
  ({ query } = await testDb());
  [{ id }] = await query<{ id: string }>(
    "insert into users (email, status, plan, currency, stripe_customer) values ('a@example.com', 'trial', 'monthly', 'CAD', 'cus_a') returning id",
  );
});

describe("displayCredit", () => {
  it("never read: null; read with no charge since: the credit", async () => {
    expect(await displayCredit(query, id, NOW)).toBeNull();
    await query("update users set credit_balance_cents = 28000, credit_balance_at = '2026-12-10T15:00:00Z' where id = $1", [id]);
    expect(await displayCredit(query, id, NOW)).toEqual({ cents: 28000, currency: "CAD", asOf: new Date("2026-12-10T15:00:00Z") });
  });

  it("a subscriber: a reading from before the current period's start is null; one after it is the credit", async () => {
    // Subscribed on November 3: the period that holds December 12 started on December 3.
    await query(
      "update users set status = 'active', stripe_subscription = 'sub_a', first_charge_at = '2026-11-03T11:05:00Z', billing_anchor = '2026-11-03T11:05:00Z', credit_balance_cents = 28000, credit_balance_at = '2026-12-01T12:00:00Z' where id = $1",
      [id],
    );
    expect(await displayCredit(query, id, NOW)).toBeNull();
    await query("update users set credit_balance_at = '2026-12-05T12:00:00Z' where id = $1", [id]);
    expect(await displayCredit(query, id, NOW)).toMatchObject({ cents: 28000, currency: "CAD" });
  });

  it("a query that throws: null, never a rejection", async () => {
    const broken: Query = async () => {
      throw new Error("database down");
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(displayCredit(broken, id, NOW)).resolves.toBeNull();
  });
});

describe("emailCredit", () => {
  it("reads the live Stripe balance over a stale cache, and caches it", async () => {
    await query("update users set credit_balance_cents = 5000, credit_balance_at = '2026-12-01T12:00:00Z' where id = $1", [id]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      const credit = await emailCredit(query, id, NOW, { balance: async () => -28000 });
      expect(credit).toEqual({ cents: 28000, currency: "CAD", asOf: NOW });
      expect(await cache()).toEqual({ cents: 28000, at: NOW });
    } finally {
      vi.useRealTimers();
    }
  });

  it("never stamps the cache later than the real clock, so an 'as of' clock ahead can't block real writes", async () => {
    const real = new Date("2026-12-05T15:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(real);
    try {
      await emailCredit(query, id, NOW, { balance: async () => -28000 }); // NOW is a week ahead of `real`
      expect(await cache()).toEqual({ cents: 28000, at: real });
    } finally {
      vi.useRealTimers();
    }
  });

  it("no balance left on Stripe: null; Stripe down: the cache; no gateway: the cache", async () => {
    await query("update users set credit_balance_cents = 5000, credit_balance_at = '2026-12-01T12:00:00Z' where id = $1", [id]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = {
      balance: async (): Promise<number> => {
        throw new Error("Stripe is down");
      },
    };
    expect(await emailCredit(query, id, NOW, down)).toMatchObject({ cents: 5000 });
    expect(await emailCredit(query, id, NOW)).toMatchObject({ cents: 5000 });
    expect(await emailCredit(query, id, NOW, { balance: async () => 0 })).toBeNull();
  });
});

describe("cacheInvoiceBalance (invoice.finalized / invoice.paid)", () => {
  it("an invoice that used credit leaves its ending balance as the cache", async () => {
    await query("update users set credit_balance_cents = 28000, credit_balance_at = '2026-12-01T12:00:00Z' where id = $1", [id]);
    const at = new Date("2026-12-14T11:05:00Z");
    expect(await cacheInvoiceBalance(query, { customer: "cus_a", starting_balance: -28000, ending_balance: 0, finalizedAt: at })).toBe(true);
    expect(await cache()).toEqual({ cents: 0, at });
  });

  it("never over a newer reading; an invoice that did not touch the balance, or an unknown customer, changes nothing", async () => {
    await query("update users set credit_balance_cents = 30000, credit_balance_at = '2026-12-15T12:00:00Z' where id = $1", [id]);
    await cacheInvoiceBalance(query, { customer: "cus_a", starting_balance: -28000, ending_balance: 0, finalizedAt: new Date("2026-12-14T11:05:00Z") });
    expect(await cache()).toMatchObject({ cents: 30000 });
    expect(await cacheInvoiceBalance(query, { customer: "cus_a", starting_balance: 0, ending_balance: 0, finalizedAt: new Date("2026-12-16T11:05:00Z") })).toBe(false);
    expect(await cacheInvoiceBalance(query, { customer: "cus_a", starting_balance: -28000, ending_balance: null, finalizedAt: new Date("2026-12-16T11:05:00Z") })).toBe(false);
    expect(await cacheInvoiceBalance(query, { customer: "cus_x", starting_balance: -28000, ending_balance: 0, finalizedAt: new Date("2026-12-16T11:05:00Z") })).toBe(false);
    expect(await cache()).toMatchObject({ cents: 30000 });
  });
});

describe("paymentCredit (the Payment page's Price Box prop)", () => {
  it("plain cents and currency for the browser, or null", async () => {
    expect(await paymentCredit(query, id, NOW)).toBeNull();
    await query("update users set credit_balance_cents = 28000, credit_balance_at = '2026-12-10T15:00:00Z' where id = $1", [id]);
    expect(await paymentCredit(query, id, NOW)).toEqual({ cents: 28000, currency: "CAD" });
  });
});
