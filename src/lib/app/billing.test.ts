import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { AdjustmentGateway } from "@/lib/billing/subscriptions";
import { mergeV3 } from "@/lib/v3-settings";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import { loadBilling } from "./billing";

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
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
});

describe("the billing page (spec B.10)", () => {
  it("a monthly member: the next charge with tax from Stripe's preview, invoices with their hosted copies, switch and cancel", async () => {
    const id = await member(
      "insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, first_charge_at, billing_anchor) values ('a@example.com', 'active', 'monthly', 'USD', 'cus_a', 'sub_a', '2026-12-03T11:05:00Z', '2026-12-03T11:05:00Z') returning id",
    );
    plans.openInvoice("in_1", "cus_a", "sub_a");
    plans.bills[0].status = "paid";
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust() });
    expect(v).toMatchObject({
      plan: "monthly",
      nextCharge: "Next charge Sunday, January 3: US$226 with tax.",
      invoices: [{ id: "in_1", status: "paid", hostedUrl: "https://invoice.stripe.test/in_1" }],
      canUpdateCard: true,
      offer: { to: "per_run", allowed: true },
      cancel: { label: "Cancel my plan", switchLink: true },
      undo: null,
    });
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
      nextCharge: "Your first charge, with your third list: no earlier than Monday, December 14, US$226 with tax.",
      cancel: { label: "Cancel my trial" },
    });
    const c = await member(
      `insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, cancel_requested_at, access_ends_at) values ('c@example.com', 'active', 'monthly', 'USD', 'cus_c', 'sub_c', '2026-12-10T15:00:00Z', '2027-01-03T11:05:00Z') returning id`,
    );
    expect(await loadBilling(query, c, { settings, now: SATURDAY, plans })).toMatchObject({
      cancel: null,
      undo: { until: "Sunday, January 3" },
      offer: null,
      nextCharge: "Nothing more will be charged. Your lists continue until Sunday, January 3.",
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
});

describe("a trial with no card yet (plan 2026-11-26-001, Unit 1)", () => {
  it("can't update a card it never saved, even with a Stripe customer, and can still cancel its trial", async () => {
    // Payment creates the Stripe customer before the card is saved (trial_started_at is "card saved").
    const id = await member(
      "insert into users (email, status, plan, currency, stripe_customer, free_lists_used) values ('n@example.com', 'trial', 'monthly', 'USD', 'cus_n', 0) returning id",
    );
    expect(await loadBilling(query, id, { settings, now: SATURDAY, plans })).toMatchObject({ canUpdateCard: false, cancel: { label: "Cancel my trial" } });
    await query("update users set trial_started_at = '2026-11-30T15:00:00Z' where id = $1", [id]);
    expect((await loadBilling(query, id, { settings, now: SATURDAY, plans }))?.canUpdateCard).toBe(true);
  });
});
