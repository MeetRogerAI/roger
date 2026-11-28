import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { AdjustmentGateway } from "@/lib/billing/subscriptions";
import { mergeV3 } from "@/lib/v3-settings";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
// The one-at-a-time switch (`plans.oneAtATimeOffered`, read through billing/offered): off, as at launch, unless a test turns it on.
const offer = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/offered")>()), oneAtATimeOffered: () => offer.on }));

const { CARD_LATER, loadBilling, NO_CARD_YET } = await import("./billing");

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
  offer.on = false;
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
      nextCharge: "Next charge Sunday, January 3: US$226 (US$200 plus US$26 tax).",
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
        '{"totalCents": 22600, "taxCents": 2600, "currency": "USD", "week": "2026-12-14"}', '2026-11-23T15:00:00Z') returning id`,
    );
    expect(await loadBilling(query, t, { settings, now: SATURDAY, plans })).toMatchObject({
      nextCharge: "Your first charge, with your third Cora Curation: no earlier than Monday, December 14, US$226 (US$200 plus US$26 tax).",
      cancel: { label: "Cancel my trial" },
    });
    const c = await member(
      `insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, cancel_requested_at, access_ends_at) values ('c@example.com', 'active', 'monthly', 'USD', 'cus_c', 'sub_c', '2026-12-10T15:00:00Z', '2027-01-03T11:05:00Z') returning id`,
    );
    expect(await loadBilling(query, c, { settings, now: SATURDAY, plans })).toMatchObject({
      cancel: null,
      undo: { until: "Sunday, January 3" },
      nextCharge: "Nothing more will be charged. Your Cora Curations continue until Sunday, January 3.",
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

  it("an account already on one at a time, while it is not offered: its plan with no price for one, no order to place, and no switch offered", async () => {
    const id = await member(
      `insert into users (email, status, plan, currency, stripe_customer, free_lists_used) values ('p@example.com', 'active', 'per_run', 'USD', 'cus_p', 2) returning id`,
    );
    const v = await loadBilling(query, id, { settings, now: SATURDAY, plans });
    expect(v).toMatchObject({
      plan: "per_run",
      planLine: "One Cora Curation at a time. This plan is not offered at the moment.",
      nextCharge: "No new order can be placed. An order you placed earlier is still charged the Monday it is sent; otherwise nothing is charged. Monthly is now the only plan. Write to us if you have questions about yours.",
      cancel: { label: "Cancel my account" },
    });
    expect(v).not.toHaveProperty("offer");

    // With the option on, the same account reads as it did: its price, and what an order costs.
    offer.on = true;
    expect(await loadBilling(query, id, { settings, now: SATURDAY, plans })).toMatchObject({
      planLine: "One Cora Curation at a time: US$200 each, plus tax where it applies, only for the Mondays you order.",
      nextCharge: "Nothing is charged unless you order. Each Cora Curation is US$200, plus tax where it applies, charged the Monday it is sent.",
    });
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
      `insert into users (email, status, plan, currency, free_lists_used, sponsor_id) values ('${email}', 'trial', 'monthly', 'USD', 0, ${o.sponsored ? "gen_random_uuid()" : "null"}) returning id`,
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
    expect(v).toMatchObject({ nextCharge: "We’ll ask for your card when your first Cora Curation is ready.", cardLink: null, canUpdateCard: false });
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
    expect(await loadBilling(query, c, { settings, now: SATURDAY, plans })).toMatchObject({ cardLink: null, nextCharge: expect.stringContaining("Nothing until your free Cora Curations are done") });
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
    expect(v?.planLine).toBe("One Cora Curation at a time. This plan is not offered at the moment.");
    expect(v).not.toHaveProperty("offer");
  });
});
