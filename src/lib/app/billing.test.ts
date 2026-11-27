import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type Stripe from "stripe";
import { invoiceRow, type AdjustmentGateway } from "@/lib/billing/subscriptions";
import { mergeV3 } from "@/lib/v3-settings";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb, testSponsor } from "@/test-helpers/pglite-db";
import { CARD_LATER, invoiceAmount, loadBilling, NO_CARD_YET } from "./billing";

const ONE_AT_A_TIME = /one (list )?at a time|per list|order a list|switch plan/i;

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
  it("a monthly member: the next charge with tax from Stripe's preview, invoices with their hosted copies, and cancel with no switch", async () => {
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
      cardLink: null,
      cancel: { label: "Cancel my plan" },
      undo: null,
    });
    // Monthly only (plan 2026-11-26-001, Unit 9; origin R1, R28): no switch offer, no "switch to one list at a time" link.
    expect(v).not.toHaveProperty("offer");
    expect(v?.cancel).toEqual({ label: "Cancel my plan" });
    expect(JSON.stringify(v)).not.toMatch(ONE_AT_A_TIME);
    // Stripe unreachable: the price and the tax words instead, and the page still loads.
    const w = await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust(true) });
    expect(w?.nextCharge).toMatch(/^Next charge Sunday, January 3: US\$\d+, plus tax where it applies\.$/);
  });

  it("a trial: the told amount; a member cancelling inside the paid month: the undo", async () => {
    const t = await member(
      `insert into users (email, status, plan, currency, stripe_customer, free_lists_used, quote, trial_started_at) values ('t@example.com', 'trial', 'monthly', 'USD', 'cus_t', 2,
        '{"totalCents": 22600, "currency": "USD", "week": "2026-12-14"}', '2026-11-23T15:00:00Z') returning id`,
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
      nextCharge: "Nothing more will be charged. Your lists continue until Sunday, January 3.",
    });
    // Once the subscription has ended: cancelled, nothing to undo.
    await query("update users set status = 'cancelled', access_ends_at = '2026-12-11T00:00:00Z' where id = $1", [c]);
    expect(await loadBilling(query, c, { settings, now: SATURDAY, plans })).toMatchObject({ cancel: null, undo: null, canUpdateCard: false });
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

describe("a trial with no card yet: what the billing page says (plan 2026-11-26-001, Unit 9)", () => {
  const WEEK = "2026-12-07";
  async function noCard(email: string, o: { sponsored?: boolean } = {}) {
    return member(
      `insert into users (email, status, plan, currency, free_lists_used, sponsor_id) values ('${email}', 'trial', 'monthly', 'USD', 0, ${o.sponsored ? `'${await testSponsor(query)}'` : "null"}) returning id`,
    );
  }
  async function held(userId: string) {
    await query("insert into cora_weeks (week_of, status, phase, dry_run) values ($1, 'sent', 'ready', false) on conflict (week_of) do nothing", [WEEK]);
    await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count, dry_run) values ($1, $2, 'picked', 3, false)", [userId, WEEK]);
    for (const [i, t] of ["Inbox triage", "Listing post", "Calendar prep"].entries()) {
      const [p] = await query<{ id: string }>(
        `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
         values ($1, 'Sales', 'd', 'p', 'i', $2, $2, '{}', 70, 7, 7, 7, 7, 7) returning id`,
        [t, WEEK],
      );
      await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run) values ($1, $2, $3, $4, 70, 3, 'r', false)", [userId, WEEK, i + 1, p.id]);
    }
    await query("update users set first_teaser_at = '2026-12-07T12:05:00Z' where id = $1", [userId]);
  }

  it("with a held list: 'No card yet' and a link to Payment", async () => {
    const id = await noCard("h@example.com");
    await held(id);
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans });
    expect(v).toMatchObject({ nextCharge: NO_CARD_YET, cardLink: { href: "/start/payment", label: "Add your card" }, canUpdateCard: false, cancel: { label: "Cancel my trial" } });
    expect(v?.nextCharge).toMatch(/^No card yet\./);
  });

  it("with nothing held yet: the card is asked for when the first list is ready, and no link (Payment would send them back)", async () => {
    const id = await noCard("w@example.com");
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans });
    expect(v).toMatchObject({ nextCharge: "We’ll ask for your card when your first list is ready.", cardLink: null, canUpdateCard: false });
    expect(v?.nextCharge).toBe(CARD_LATER);
  });

  it("a leftover switched one-at-a-time member with a held list is never told 'No card yet' nor sent to Payment (review fixes Unit 9, F7)", async () => {
    const id = await noCard("sw@example.com");
    await query("update users set switched_from_per_run_at = '2026-11-20T15:00:00Z', free_lists_used = 2 where id = $1", [id]);
    await held(id);
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans });
    expect(v?.cardLink).toBeNull();
    expect(v?.nextCharge).not.toBe(NO_CARD_YET);
    expect(v?.nextCharge).not.toBe(CARD_LATER);
    expect(v?.cancel?.label).toBe("Cancel my account");
  });

  it("a sponsored trial and a trial with a card are never asked for one here", async () => {
    const s = await noCard("s@example.com", { sponsored: true });
    await held(s);
    expect(await loadBilling(query, s, { settings, now: SATURDAY, plans })).toMatchObject({ cardLink: null, nextCharge: expect.not.stringMatching(/card/) });
    const c = await noCard("c@example.com");
    await query("update users set trial_started_at = '2026-11-30T15:00:00Z' where id = $1", [c]);
    expect(await loadBilling(query, c, { settings, now: SATURDAY, plans })).toMatchObject({ cardLink: null, nextCharge: expect.stringContaining("Nothing until your free lists are done") });
  });
});

describe("a leftover one-at-a-time account (preview only) still renders", () => {
  it("shows its own plan and order price, with no switch and no order to place from here", async () => {
    vi.stubEnv("STRIPE_PRICE_RUN_USD", "price_run_usd");
    const id = await member(
      "insert into users (email, status, plan, currency, stripe_customer, free_lists_used, trial_started_at) values ('p@example.com', 'active', 'per_run', 'USD', 'cus_p', 2, '2026-11-01T15:00:00Z') returning id",
    );
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans });
    expect(v).toMatchObject({ plan: "per_run", cardLink: null, cancel: { label: "Cancel my account" } });
    expect(v?.planLine).toMatch(/^One list at a time:/);
    expect(v).not.toHaveProperty("offer");
  });
});

/** B2 plan Unit 5: referral credit under the next charge, and on invoices that used it. */
describe("referral credit on the billing page", () => {
  const active = () =>
    member(
      "insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, first_charge_at, billing_anchor) values ('c@example.com', 'active', 'monthly', 'USD', 'cus_c', 'sub_c', '2026-12-03T11:05:00Z', '2026-12-03T11:05:00Z') returning id",
    );

  it("the next renewal: credit applied and the card's part, with the date the balance was read", async () => {
    const id = await active();
    await query("update users set credit_balance_cents = 20000, credit_balance_at = '2026-12-10T15:00:00Z' where id = $1", [id]);
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust() });
    expect(v?.nextCharge).toBe("Next charge Sunday, January 3: US$226 with tax.");
    expect(v?.nextChargeCredit).toBe("Credit applied −US$200.00 · Card charged US$26.00 (your credit balance as of Thursday, December 10).");
    // The same in numbers, for agents.
    expect(v).toMatchObject({ creditCents: 20000, creditCurrency: "USD", creditAsOf: "2026-12-10T15:00:00.000Z", nextTotalCents: 22600, nextCardChargeCents: 2600 });
  });

  it("no line with no credit, a balance read before the last charge, credit in another currency, or no previewed total", async () => {
    const id = await active();
    expect((await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust() }))?.nextChargeCredit).toBeNull();
    await query("update users set credit_balance_cents = 20000, credit_balance_at = '2026-12-01T15:00:00Z' where id = $1", [id]);
    expect((await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust() }))?.nextChargeCredit).toBeNull();
    await query("update users set credit_balance_at = '2026-12-10T15:00:00Z', currency = 'CAD' where id = $1", [id]);
    expect((await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust() }))?.nextChargeCredit).toBeNull();
    await query("update users set currency = 'USD' where id = $1", [id]);
    expect((await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust(true) }))?.nextChargeCredit).toBeNull();
  });

  it("a trial's told first charge: the total stays, the credit line follows", async () => {
    const id = await member(
      `insert into users (email, status, plan, currency, stripe_customer, free_lists_used, trial_started_at, quote, credit_balance_cents, credit_balance_at)
       values ('t@example.com', 'trial', 'monthly', 'USD', 'cus_t', 2, '2026-11-30T15:00:00Z', '{"totalCents":22600,"currency":"USD","week":"2026-12-14"}', 30000, '2026-12-10T15:00:00Z') returning id`,
    );
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans });
    expect(v?.nextCharge).toContain("US$226 with tax.");
    expect(v?.nextChargeCredit).toBe("Credit applied −US$226.00 · Card charged US$0.00 (your credit balance as of Thursday, December 10).");
  });

  it("with no credit the numbers are empty, and a stated total has no card part beyond itself", async () => {
    const id = await active();
    expect(await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust() })).toMatchObject({
      creditCents: null,
      creditCurrency: null,
      creditAsOf: null,
      nextTotalCents: 22600,
      nextCardChargeCents: 22600,
    });
    expect(await loadBilling(query, id, { settings, now: SATURDAY, plans, adjust: adjust(true) })).toMatchObject({ nextTotalCents: null, nextCardChargeCents: null });
  });

  it("an invoice that used credit shows its own figures: charged once paid, due while open, the total alone otherwise", () => {
    const row = { id: "in_1", number: "R-1", created: 1, totalCents: 31640, currency: "CAD", status: "paid", hostedUrl: null, subscription: "sub_1" };
    expect(invoiceAmount(row)).toBe("CA$316.40");
    expect(invoiceAmount({ ...row, creditAppliedCents: 0, cardCents: 31640 })).toBe("CA$316.40");
    const used = { ...row, creditAppliedCents: 28000, cardCents: 3640 };
    expect(invoiceAmount(used)).toBe("CA$316.40 · Credit applied −CA$280.00 · Card charged CA$36.40");
    expect(invoiceAmount({ ...used, status: "open" })).toBe("CA$316.40 · Credit applied −CA$280.00 · Card due CA$36.40");
    for (const status of ["void", "uncollectible", "draft"]) expect(invoiceAmount({ ...used, status })).toBe("CA$316.40");
  });

  it("the invoice mapping reads the credit from the invoice's balances: none for a debt it collected", () => {
    const inv = (o: Partial<Stripe.Invoice>) =>
      invoiceRow({ id: "in_1", number: "R-1", created: 1, total: 31640, currency: "cad", status: "paid", hosted_invoice_url: null, parent: null, amount_paid: 3640, amount_due: 3640, ...o } as Stripe.Invoice);
    expect(inv({ starting_balance: -28000, ending_balance: 0 })).toMatchObject({ creditAppliedCents: 28000, cardCents: 3640 });
    expect(inv({ starting_balance: 500, ending_balance: 0, amount_paid: 32140 })).toMatchObject({ creditAppliedCents: 0, cardCents: 32140 });
    expect(inv({ status: "open", starting_balance: -28000, ending_balance: 0, amount_paid: 0 })).toMatchObject({ creditAppliedCents: 28000, cardCents: 3640 });
  });
});
