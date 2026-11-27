import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { stripeCredits } from "./gateway";

/** The Stripe adapter for referral credit (B2 Unit 4), against a stubbed client shaped as the spike saw endive. */

const notFound = () => new Stripe.errors.StripeInvalidRequestError({ type: "invalid_request_error", code: "resource_missing", message: "No such object" });

function client(o: Record<string, unknown>) {
  return stripeCredits(o as unknown as Stripe)!;
}

describe("stripeCredits", () => {
  it("reads an invoice's payment intent through its expanded payments, and its subscription", async () => {
    const asked: unknown[] = [];
    const gw = client({
      invoices: {
        retrieve: async (id: string, p: unknown) => {
          asked.push(p);
          return {
            id,
            customer: "cus_1",
            status: "paid",
            currency: "cad",
            total_excluding_tax: 28000,
            subtotal: 28000,
            amount_paid: 21640,
            parent: { subscription_details: { subscription: "sub_1" } },
            payments: { data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_1" } }] },
          };
        },
      },
    });
    expect(await gw.paidInvoice("in_1")).toEqual({
      id: "in_1",
      customer: "cus_1",
      subscription: "sub_1",
      status: "paid",
      currency: "CAD",
      totalExcludingTax: 28000,
      amountPaid: 21640,
      paymentIntent: "pi_1",
    });
    expect(asked).toEqual([{ expand: ["payments"] }]);
  });

  it("a balance-covered invoice ($0 paid) has no payment intent", async () => {
    const gw = client({
      invoices: {
        retrieve: async (id: string) => ({ id, customer: { id: "cus_1" }, status: "paid", currency: "cad", total_excluding_tax: 28000, amount_paid: 0, parent: null, payments: { data: [] } }),
      },
    });
    expect(await gw.paidInvoice("in_1")).toMatchObject({ amountPaid: 0, paymentIntent: null, customer: "cus_1", subscription: null });
  });

  it("answers null for a missing invoice, charge or dispute, and throws other errors", async () => {
    const gone = async () => {
      throw notFound();
    };
    const gw = client({ invoices: { retrieve: gone }, charges: { retrieve: gone }, disputes: { retrieve: gone }, customers: { retrieve: async () => ({ deleted: true }) } });
    expect(await gw.paidInvoice("in_x")).toBeNull();
    expect(await gw.charge("ch_x")).toBeNull();
    expect(await gw.dispute("du_x")).toBeNull();
    expect(await gw.balance("cus_x")).toBe(0);
    const broken = client({
      charges: {
        retrieve: async () => {
          throw new Stripe.errors.StripeAPIError({ type: "api_error", message: "boom" });
        },
      },
    });
    await expect(broken.charge("ch_x")).rejects.toThrow("boom");
  });

  it("lists refunds over every page, oldest first", async () => {
    const pages = [
      { data: [{ id: "re_3", amount: 3, status: "succeeded", created: 30 }, { id: "re_2", amount: 2, status: "succeeded", created: 20 }], has_more: true },
      { data: [{ id: "re_1", amount: 1, status: "pending", created: 10 }], has_more: false },
    ];
    const asked: unknown[] = [];
    const gw = client({ refunds: { list: async (p: unknown) => (asked.push(p), pages.shift()) } });
    expect((await gw.refundsFor("pi_1")).map((r) => r.id)).toEqual(["re_1", "re_2", "re_3"]);
    expect(asked).toEqual([
      { payment_intent: "pi_1", limit: 100 },
      { payment_intent: "pi_1", limit: 100, starting_after: "re_2" },
    ]);
  });

  it("finds a balance transaction by its ledger id across pages, and stops at transactions older than the row", async () => {
    const page = (ids: [string, number, string?][], more: boolean) => ({ data: ids.map(([id, created, l]) => ({ id, created, ending_balance: -5, metadata: l ? { credit_ledger_id: l } : {} })), has_more: more });
    const lists = [page([["t3", 300], ["t2", 200]], true), page([["t1", 100, "row"]], false)];
    const gw = client({ customers: { listBalanceTransactions: async () => lists.shift() } });
    expect(await gw.findBalanceTransaction("cus_1", "row", 50)).toEqual({ id: "t1", endingBalance: -5 });
    const old = [page([["t3", 300], ["t2", 200]], true)];
    const gw2 = client({ customers: { listBalanceTransactions: async () => old.shift() } });
    expect(await gw2.findBalanceTransaction("cus_1", "row", 250)).toBeNull();
  });
});
