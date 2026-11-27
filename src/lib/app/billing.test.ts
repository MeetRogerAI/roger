import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { AdjustmentGateway } from "@/lib/billing/subscriptions";
import { mergeV3 } from "@/lib/v3-settings";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";

// The one-at-a-time switch (`plans.oneAtATimeOffered`, read through billing/offered): off, as at launch, unless a test turns it on.
const offer = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/offered")>()), oneAtATimeOffered: () => offer.on }));

const { loadBilling } = await import("./billing");

let query: Query;
const settings = mergeV3([]);
const SATURDAY = new Date("2026-12-12T15:00:00Z");
let plans: ReturnType<typeof fakePlans>;

const adjust = (fail = false) =>
  ({
    async previewRenewal() {
      if (fail) throw new Error("Stripe is down");
      return { totalCents: 22600, taxCents: 2600, currency: "USD", lines: [] };
    },
  }) as unknown as AdjustmentGateway;

async function member(sql: string) {
  const [u] = await query<{ id: string }>(sql);
  return u.id;
}

beforeEach(async () => {
  ({ query } = await testDb());
  plans = fakePlans();
  offer.on = false;
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
});

describe("the billing page (spec B.10)", () => {
  it("a monthly member: the next charge with tax from Stripe's preview, invoices with their hosted copies, and cancel; no switch is offered", async () => {
    const id = await member(
      "insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, first_charge_at, billing_anchor) values ('a@example.com', 'active', 'monthly', 'USD', 'cus_a', 'sub_a', '2026-12-03T11:05:00Z', '2026-12-03T11:05:00Z') returning id",
    );
    plans.openInvoice("in_1", "cus_a", "sub_a");
    plans.bills[0].status = "paid";
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust() });
    expect(v).toMatchObject({
      plan: "monthly",
      planLine: "Monthly: US$200 a month, plus tax where it applies, for a Cora Curation every Monday.",
      nextCharge: "Next charge Sunday, January 3: US$226 with tax.",
      invoices: [{ id: "in_1", status: "paid", hostedUrl: "https://invoice.stripe.test/in_1" }],
      canUpdateCard: true,
      // Monthly is the only plan at launch: nothing to switch to, and no link to a switch under Cancel.
      offer: null,
      cancel: { label: "Cancel my plan", switchLink: false },
      undo: null,
    });
    expect(JSON.stringify(v)).not.toMatch(/one at a time|per_run|order/i);

    // With one at a time offered (the switch on), the page offers it again.
    offer.on = true;
    expect(await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust() })).toMatchObject({
      offer: { to: "per_run", allowed: true },
      cancel: { label: "Cancel my plan", switchLink: true },
    });
    offer.on = false;
    // Stripe unreachable: the price and the tax words instead, and the page still loads.
    const w = await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust(true) });
    expect(w?.nextCharge).toMatch(/^Next charge Sunday, January 3: US\$\d+, plus tax where it applies\.$/);
  });

  it("a trial: the told amount; a member cancelling inside the paid month: the undo", async () => {
    const t = await member(
      `insert into users (email, status, plan, currency, stripe_customer, free_lists_used, quote) values ('t@example.com', 'trial', 'monthly', 'USD', 'cus_t', 2,
        '{"totalCents": 22600, "currency": "USD", "week": "2026-12-14"}') returning id`,
    );
    expect(await loadBilling(query, t, { settings, now: SATURDAY, plans })).toMatchObject({
      nextCharge: "Your first charge, with your third Cora Curation: no earlier than Monday, December 14, US$226 with tax.",
      cancel: { label: "Cancel my trial" },
    });
    const c = await member(
      `insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, cancel_requested_at, access_ends_at) values ('c@example.com', 'active', 'monthly', 'USD', 'cus_c', 'sub_c', '2026-12-10T15:00:00Z', '2027-01-03T11:05:00Z') returning id`,
    );
    expect(await loadBilling(query, c, { settings, now: SATURDAY, plans })).toMatchObject({
      cancel: null,
      undo: { until: "Sunday, January 3" },
      offer: null,
      nextCharge: "Nothing more will be charged. Your Cora Curations continue until Sunday, January 3.",
    });
    // Once the subscription has ended: cancelled, nothing to undo.
    await query("update users set status = 'cancelled', access_ends_at = '2026-12-11T00:00:00Z' where id = $1", [c]);
    expect(await loadBilling(query, c, { settings, now: SATURDAY, plans })).toMatchObject({ cancel: null, undo: null, offer: null, canUpdateCard: false });
  });

  it("never calls a paying one-at-a-time member who switched to monthly a trial", async () => {
    const id = await member(
      `insert into users (email, status, plan, currency, stripe_customer, free_lists_used, switched_from_per_run_at) values ('s@example.com', 'trial', 'monthly', 'USD', 'cus_s', 2, now()) returning id`,
    );
    expect((await loadBilling(query, id, { settings, now: SATURDAY, plans }))?.cancel?.label).toBe("Cancel my account");
  });

  it("an account already on one at a time, while it is not offered: its plan with no price for one, no order to place, and only the switch to monthly", async () => {
    const id = await member(
      `insert into users (email, status, plan, currency, stripe_customer, free_lists_used) values ('p@example.com', 'active', 'per_run', 'USD', 'cus_p', 2) returning id`,
    );
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans });
    expect(v).toMatchObject({
      plan: "per_run",
      planLine: "One Cora Curation at a time. This plan is not offered at the moment.",
      nextCharge: "No new order can be placed. An order you placed earlier is still charged the Monday it is sent; otherwise nothing is charged unless you switch to monthly.",
      offer: { to: "monthly", allowed: true },
      cancel: { label: "Cancel my account", switchLink: false },
    });
    expect(v!.offer!.effect).toContain("Monthly starts with your next Cora Curation: US$200 plus tax where it applies");

    // With the option on, the same account reads as it did: its price, and what an order costs.
    offer.on = true;
    expect(await loadBilling(query, id, { settings, now: SATURDAY, plans })).toMatchObject({
      planLine: "One Cora Curation at a time: US$200 each, plus tax where it applies, only for the Mondays you order.",
      nextCharge: "Nothing is charged unless you order. Each Cora Curation is US$200, plus tax where it applies, charged the Monday it is sent.",
      offer: { to: "monthly", allowed: true },
    });
  });
});
