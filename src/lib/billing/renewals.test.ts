import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverWeek } from "@/lib/cora/deliver";
import type { Query } from "@/lib/db-query";
import { runHourly } from "@/lib/housekeeping/job";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import { completeCardUpdate, startCardUpdate } from "./card-setup";
import { afterCardChange, type RenewalDeps } from "./renewals";
import type { BillingGateway } from "./subscriptions";
import { handleStripeEvent } from "./webhook";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const FIRST = "2026-12-03T11:05:00Z";
const RENEWAL = new Date("2027-01-03T11:05:00Z");
let plans: ReturnType<typeof fakePlans>;
let creates: number;
const billing: BillingGateway = {
  preview: async () => ({ totalCents: 22600, currency: "USD" }),
  subscriptions: async () => [],
  async createSubscription({ claimId }) {
    creates++;
    return { kind: "succeeded", object: `sub_${claimId.slice(0, 4)}`, amountCents: 22600, currency: "USD" };
  },
};
const deps = (now: Date): RenewalDeps & { gw: BillingGateway } => ({ plans, gw: billing, settings, now, query, transport, sleep: async () => {} });
const subjects = () => sent.filter((m) => !m.subject.startsWith("[Roger]")).map((m) => m.subject);
const user = async (id: string) =>
  (
    await query<{ status: string; hold_reason: string | null; renewal_invoice: string | null; access_ends_at: string | null; cancel_requested_at: string | null }>(
      `select status, hold_reason, renewal_invoice, to_char(access_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as access_ends_at, cancel_requested_at::text from users where id = $1`,
      [id],
    )
  )[0];
const event = (id: string, type: string, object: Record<string, unknown>) => ({ id, type, data: { object } }) as unknown as Stripe.Event;
const renewalInvoice = (attempt: number) => ({ id: "in_r1", billing_reason: "subscription_cycle", attempt_count: attempt, parent: { subscription_details: { subscription: "sub_a", metadata: { claim_id: "c_first" } } } });
const handle = (e: Stripe.Event, now: Date, card = fakeGateway()) => handleStripeEvent(query, card, e, { getSettings: async () => settings, plans, billing, query, transport, now });

let uid: string;
let play: string;

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  creates = 0;
  plans = fakePlans();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  [{ id: uid }] = await query<{ id: string }>(
    `insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, free_lists_used, first_charge_at, billing_anchor)
     values ('ana@example.com', 'active', 'monthly', 'USD', 'share', 'cus_a', 'sub_a', 2, $1, $1) returning id`,
    [FIRST],
  );
  plans.add("sub_a", "cus_a", RENEWAL);
  const [p] = await query<{ id: string }>(
    `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
     values ('Inbox triage', 'Sales', 'Does it.', '1. Step.', 'Save it.', '2027-01-11', '2027-01-11', '{}', 70, 7, 7, 7, 7, 7) returning id`,
  );
  play = p.id;
});

async function picksFor(week: string) {
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready') on conflict do nothing", [week]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 1)", [uid, week]);
  await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, 1, $3, 70, 3, 'Fits.')", [uid, week, play]);
}

describe("a renewal that fails", () => {
  it("is emailed at each attempt, holds lists after 7 days unpaid, and paying releases them", async () => {
    plans.openInvoice("in_r1", "cus_a", "sub_a");
    expect(await handle(event("evt_f1", "invoice.payment_failed", renewalInvoice(1)), new Date("2027-01-03T12:00:00Z"))).toBe("handled");
    expect(await handle(event("evt_f2", "invoice.payment_failed", renewalInvoice(2)), new Date("2027-01-06T12:00:00Z"))).toBe("handled");
    expect(subjects()).toEqual(["Your monthly payment didn’t go through", "Your monthly payment didn’t go through"]);
    expect(sent[0].text).toContain("still unpaid on Sunday, January 10");
    expect(await user(uid)).toMatchObject({ status: "active", renewal_invoice: "in_r1" });

    // Day 6: nothing yet. Day 7 (Toronto): held, with the reason.
    await runHourly(query, deps(new Date("2027-01-09T23:00:00Z")));
    expect((await user(uid)).status).toBe("active");
    await runHourly(query, deps(new Date("2027-01-10T05:30:00Z")));
    expect(await user(uid)).toMatchObject({ status: "held", hold_reason: "renewal_unpaid" });
    expect(subjects().at(-1)).toBe("Your Monday lists are paused");

    // Monday's list is not delivered while held.
    await picksFor("2027-01-11");
    expect((await deliverWeek(query, uid, "2027-01-11", 2, new Date("2027-01-11T12:05:00Z"))).delivered).toBe(0);

    // Paid (from Stripe's hosted page): released at once, and the waiting list goes out.
    plans.bills.find((i) => i.id === "in_r1")!.status = "paid";
    expect(await handle(event("evt_paid", "invoice.paid", { ...renewalInvoice(3), amount_paid: 22600, currency: "usd", lines: { data: [] } }), new Date("2027-01-11T15:00:00Z"))).toBe("handled");
    expect(await user(uid)).toMatchObject({ status: "active", hold_reason: null, renewal_invoice: null });
    expect(subjects()).toContain("Your payment went through");
    expect(await query("select 1 from picks where user_id = $1 and delivered_at is not null", [uid])).toHaveLength(1);
  });

  it("is not held when the hold pass finds it was paid after all", async () => {
    plans.openInvoice("in_r1", "cus_a", "sub_a");
    await handle(event("evt_f1", "invoice.payment_failed", renewalInvoice(1)), new Date("2027-01-03T12:00:00Z"));
    expect((await user(uid)).renewal_invoice).toBe("in_r1");
    // Paid in Stripe, and the webhook for the payment was missed.
    plans.bills[0].status = "paid";
    await runHourly(query, deps(new Date("2027-01-10T05:30:00Z")));
    expect(await user(uid)).toMatchObject({ status: "active", renewal_invoice: null });
  });

  it("is paid at once when the card is updated while held, once per new card", async () => {
    plans.openInvoice("in_r1", "cus_a", "sub_a");
    await query("update users set status = 'held', hold_reason = 'renewal_unpaid', renewal_failed_at = $2, renewal_invoice = 'in_r1' where id = $1", [uid, "2027-01-03T12:00:00Z"]);
    const card = fakeGateway();
    const started = await startCardUpdate(query, card, { userId: uid, successUrl: "https://x/done", cancelUrl: "https://x/billing" });
    expect(started).toMatchObject({ ok: true });
    const sessionId = [...card.sessions.keys()][0];
    expect(card.sessions.get(sessionId)?.purpose).toBe("card_update");
    card.complete(sessionId);
    // The return page and the webhook both finish it; the invoice is paid once.
    const now = new Date("2027-01-11T15:00:00Z");
    expect(await completeCardUpdate(query, card, sessionId, { expectUserId: uid, after: (id) => afterCardChange(query, deps(now), id, sessionId) })).toBe("done");
    expect(await handle(event("evt_cs", "checkout.session.completed", { id: sessionId, mode: "setup", metadata: { purpose: "card_update" } }), now, card)).toBe("handled");
    expect(plans.calls.filter((c) => c.startsWith("pay:"))).toEqual([`pay:in_r1:renewal:in_r1:${sessionId}`]);
    expect(card.defaults.get("cus_a")).toBe("pm_card");
    expect(await user(uid)).toMatchObject({ status: "active", hold_reason: null });
    // A card update never sends the sign-up welcome.
    expect(subjects()).toEqual(["Your payment went through"]);
  });

  it("refuses to open the card page for another customer's session", async () => {
    const card = fakeGateway();
    const [other] = await query<{ id: string }>("insert into users (email, status, stripe_customer) values ('bo@example.com', 'active', 'cus_b') returning id");
    await startCardUpdate(query, card, { userId: other.id, successUrl: "https://x/done", cancelUrl: "https://x/billing" });
    const sessionId = [...card.sessions.keys()][0];
    card.complete(sessionId);
    let ran = 0;
    expect(await completeCardUpdate(query, card, sessionId, { expectUserId: uid, after: async () => ran++ })).toBe("not_yours");
    expect(ran).toBe(0);
    expect(card.defaults.size).toBe(0);
  });
});

describe("a card updated after a declined first charge", () => {
  it("retries the charge at once", async () => {
    await query(
      `update users set status = 'held', hold_reason = 'first_charge_failed', stripe_subscription = null, first_charge_at = null, billing_anchor = null,
         quote = '{"totalCents": 22600, "currency": "USD", "price": "price_monthly_usd", "extraCents": 0, "week": "2026-12-14", "at": "2026-12-08T12:00:00Z"}'
       where id = $1`,
      [uid],
    );
    await query("insert into charge_attempts (user_id, purpose, week_of, attempt, outcome, settled_at, next_attempt_at) values ($1, 'first_charge', '2026-12-14', 1, 'declined', now(), $2)", [
      uid,
      "2026-12-15T11:00:00Z",
    ]);
    expect(await afterCardChange(query, deps(new Date("2026-12-14T18:00:00Z")), uid, "cs_1")).toBe("first_charge:charged");
    expect(creates).toBe(1);
    expect((await user(uid)).status).toBe("active");
  });
});

describe("the subscription as Stripe has it", () => {
  it("reads a cancellation made in Stripe from its cancel date, and an undo the same way", async () => {
    const DEC_20 = Math.floor(new Date("2026-12-20T17:00:00Z").getTime() / 1000);
    plans.subs.set("sub_a", { ...plans.subs.get("sub_a")!, cancelAt: DEC_20 });
    expect(await handle(event("evt_u1", "customer.subscription.updated", { id: "sub_a" }), new Date("2026-12-12T15:00:00Z"))).toBe("handled");
    // Cancelling: active until the subscription ends, with the cancel date as the end of access.
    expect(await user(uid)).toMatchObject({ status: "active", access_ends_at: "2026-12-20T17:00Z" });
    expect((await user(uid)).cancel_requested_at).not.toBeNull();
    expect(subjects()).toEqual(["Your Roger plan is cancelled"]);
    plans.subs.set("sub_a", { ...plans.subs.get("sub_a")!, cancelAt: null });
    await handle(event("evt_u2", "customer.subscription.updated", { id: "sub_a" }), new Date("2026-12-13T15:00:00Z"));
    expect(await user(uid)).toMatchObject({ status: "active", access_ends_at: null, cancel_requested_at: null });
  });

  it("keeps a switch in progress a switch, not a cancellation", async () => {
    await query("update users set plan_change_to = 'per_run' where id = $1", [uid]);
    plans.subs.set("sub_a", { ...plans.subs.get("sub_a")!, cancelAt: Math.floor(RENEWAL.getTime() / 1000) });
    await handle(event("evt_u1", "customer.subscription.updated", { id: "sub_a" }), new Date("2026-12-12T15:00:00Z"));
    expect(await user(uid)).toMatchObject({ status: "active", access_ends_at: "2027-01-03T11:05Z" });
  });

  it("tells admins when a subscription ends without a cancellation in Roger", async () => {
    await handle(event("evt_d", "customer.subscription.deleted", { id: "sub_a", ended_at: Math.floor(RENEWAL.getTime() / 1000) }), RENEWAL);
    expect(await user(uid)).toMatchObject({ status: "cancelled", access_ends_at: "2027-01-03T11:05Z" });
    expect(sent.map((m) => m.subject)).toContain("[Roger] A subscription ended without a cancellation in Roger");
  });
});

describe("after review", () => {
  it("ignores a failure event for an invoice that is no longer open", async () => {
    plans.openInvoice("in_r1", "cus_a", "sub_a");
    plans.bills[0].status = "paid";
    expect(await handle(event("evt_f1", "invoice.payment_failed", renewalInvoice(1)), new Date("2027-01-03T12:00:00Z"))).toBe("ignored");
    expect(await user(uid)).toMatchObject({ status: "active", renewal_invoice: null });
    expect(sent).toEqual([]);
  });

  it("keeps the hold while another invoice is open; a new card pays them all, oldest first, then releases", async () => {
    plans.openInvoice("in_old", "cus_a", "sub_a");
    plans.openInvoice("in_new", "cus_a", "sub_a");
    await query("update users set status = 'held', hold_reason = 'renewal_unpaid', renewal_failed_at = now(), renewal_invoice = 'in_new' where id = $1", [uid]);
    // One of them paid: still held, pointing at the one left.
    plans.bills.find((i) => i.id === "in_new")!.status = "paid";
    expect(await handle(event("evt_p", "invoice.paid", { ...renewalInvoice(1), id: "in_new", amount_paid: 22600, currency: "usd", lines: { data: [] } }), new Date("2027-01-11T15:00:00Z"))).toBe("handled");
    expect(await user(uid)).toMatchObject({ status: "held", renewal_invoice: "in_old" });
    plans.bills.find((i) => i.id === "in_new")!.status = "open";
    expect(await afterCardChange(query, deps(new Date("2027-01-11T16:00:00Z")), uid, "cs_9")).toBe("renewal:released");
    expect(plans.calls.filter((c) => c.startsWith("pay:")).map((c) => c.split(":")[1])).toEqual(["in_old", "in_new"]);
    expect(await user(uid)).toMatchObject({ status: "active", renewal_invoice: null });
  });

  it("a card update: only an 'Update card' session counts; the first caller does the work; a failed follow-up runs again on retry", async () => {
    const card = fakeGateway();
    let defaults = 0;
    const set = card.setDefaultCard.bind(card);
    card.setDefaultCard = async (c, pm) => {
      defaults++;
      await set(c, pm);
    };
    // A sign-up card session is not a card update.
    const signup = await card.createSetupSession({ userId: uid, customer: "cus_a", currency: "USD", successUrl: "x", cancelUrl: "y" });
    card.complete(signup.id);
    expect(await completeCardUpdate(query, card, signup.id, { after: async () => {} })).toBe("not_yours");
    expect(defaults).toBe(0);

    await startCardUpdate(query, card, { userId: uid, successUrl: "x", cancelUrl: "y" });
    const id = [...card.sessions.keys()].at(-1)!;
    card.complete(id);
    let runs = 0;
    const failing = async () => {
      runs++;
      if (runs === 1) throw new Error("Stripe blip");
    };
    await expect(completeCardUpdate(query, card, id, { after: failing })).rejects.toThrow("Stripe blip");
    // The retry (the webhook sent again) does it all again, once.
    expect(await completeCardUpdate(query, card, id, { after: failing })).toBe("done");
    expect(await completeCardUpdate(query, card, id, { after: failing })).toBe("done");
    expect(runs).toBe(2);
    expect(defaults).toBe(2);
  });

  it("reports the stored outcome to a second caller after a refused address", async () => {
    const card = fakeGateway("invalid");
    await startCardUpdate(query, card, { userId: uid, successUrl: "x", cancelUrl: "y" });
    const id = [...card.sessions.keys()][0];
    card.complete(id);
    let ran = 0;
    expect(await completeCardUpdate(query, card, id, { after: async () => ran++ })).toBe("address_invalid");
    expect(await completeCardUpdate(query, card, id, { after: async () => ran++ })).toBe("address_invalid");
    expect(ran).toBe(0);
  });
});
