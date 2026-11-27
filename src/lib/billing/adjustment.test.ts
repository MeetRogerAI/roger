import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { runHourly } from "@/lib/housekeeping/job";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeAdjustments } from "@/test-helpers/fake-adjustments";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { testDb } from "@/test-helpers/pglite-db";
import {
  adjustmentOnAccountClosed,
  adjustmentOnCancelScheduled,
  adjustmentOnCancelUndone,
  adjustmentOnSwitchToPerRun,
  placeAdjustments,
  retryDeletes,
  sendItemisedNotices,
  type AdjustDeps,
} from "./adjustment";
import { excuseWeek, processContributions, recordWeek } from "./contribution";
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
let stripe: ReturnType<typeof fakeAdjustments>;
const deps = (now: Date): AdjustDeps => ({ settings, now, adjust: stripe, query, transport, sleep: async () => {} });
const subjects = () => sent.filter((m) => !m.subject.startsWith("[Roger]")).map((m) => m.subject);
const at = (iso: string) => new Date(iso);
const mondayMorning = (week: string) => new Date(`${week}T12:05:00Z`);
const rows = () =>
  query<{ status: string; stripe_item: string | null; deleted_reason: string | null; invoice_at: string; create_after: string }>(
    `select status, stripe_item, deleted_reason, to_char(invoice_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as invoice_at,
            to_char(create_after at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as create_after
     from pending_adjustments order by created_at`,
  );

// First charged Thursday 2026-12-03, 6:05 AM Toronto: it renews on Jan 3, then Wednesday Feb 3, then Wednesday Mar 3.
const FIRST = "2026-12-03T11:05:00Z";
let uid: string;

async function miss(w: string) {
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready') on conflict (week_of) do nothing", [w]);
  await recordWeek(query, w, settings);
}

/** Two misses in December: the adjustment is on the invoice of January 3. */
async function secondMissInDecember() {
  for (const w of ["2026-12-07", "2026-12-14"]) {
    await miss(w);
    await processContributions(query, deps(mondayMorning(w)));
  }
  expect(stripe.pending()).toHaveLength(1);
}

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  stripe = fakeAdjustments();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_HIGHER_USD", "price_monthly_higher_usd");
  [{ id: uid }] = await query<{ id: string }>(
    "insert into users (email, status, plan, currency, sharing, stripe_customer, stripe_subscription, first_charge_at) values ('ana@example.com', 'active', 'monthly', 'USD', 'share', 'cus_1', 'sub_1', $1) returning id",
    [FIRST],
  );
});

describe("deleting and restoring the adjustment", () => {
  it("deletes the item when the user cancels after a second miss, so the final invoice does not carry it", async () => {
    await secondMissInDecember();
    await query("update users set cancel_requested_at = now()");
    expect(await adjustmentOnCancelScheduled(query, deps(at("2026-12-15T15:00:00Z")), uid)).toBe(1);
    expect(stripe.pending()).toEqual([]);
    expect(stripe.renew("cus_1", "sub_1").lines.map((l) => l.description)).toEqual(["1 × Roger monthly"]);
    expect(await rows()).toMatchObject([{ status: "deleted", deleted_reason: "cancel" }]);
  });

  it("keeps the line when a cancel lands after the renewal may have been drafted", async () => {
    await secondMissInDecember();
    // January 3 at 11:30 UTC: Stripe drafted the renewal at 11:05 with the item on it.
    await query("update users set cancel_requested_at = now()");
    expect(await adjustmentOnCancelScheduled(query, deps(at("2027-01-03T11:30:00Z")), uid)).toBe(0);
    expect(stripe.pending()).toHaveLength(1);
    expect(await rows()).toMatchObject([{ status: "pending" }]);
    expect(stripe.renew("cus_1", "sub_1").lines.map((l) => l.amountCents)).toEqual([20000, 20000]);
  });

  it("treats an item Stripe can no longer delete (finalized invoice) as billed: admins told once, no more retries", async () => {
    await secondMissInDecember();
    stripe.renew("cus_1", "sub_1"); // finalized before the excuse reached Stripe
    await excuseWeek(query, deps(at("2027-01-04T15:00:00Z")), { week: "2026-12-14", userId: uid, by: "admin@example.com" });
    await retryDeletes(query, deps(at("2027-01-04T16:00:00Z")));
    await retryDeletes(query, deps(at("2027-01-04T17:00:00Z")));
    expect(await rows()).toMatchObject([{ status: "invoiced" }]);
    expect(sent.filter((m) => m.subject === "[Roger] A dropped higher-rate difference was already billed")).toHaveLength(1);
  });

  it("never bills a month twice: a row raised again while the old item's delete was pending is dropped when that item turns out billed", async () => {
    await secondMissInDecember();
    const first = stripe.pending()[0].id;
    stripe.failNextDeletes(1);
    await excuseWeek(query, deps(at("2026-12-15T15:00:00Z")), { week: "2026-12-14", userId: uid, by: "admin@example.com" });
    await miss("2026-12-21");
    await processContributions(query, deps(mondayMorning("2026-12-21")));
    // The renewal finalizes with the old item on it before the delete is retried.
    stripe.renew("cus_1", "sub_1");
    await retryDeletes(query, deps(at("2027-01-03T13:00:00Z")));
    await placeAdjustments(query, deps(at("2027-01-03T14:00:00Z")));
    expect(stripe.items.size).toBe(1);
    expect(stripe.items.has(first)).toBe(true);
    expect((await rows()).map((r) => [r.status, r.deleted_reason])).toEqual([
      ["invoiced", "excused"],
      ["deleted", "billed"],
    ]);
  });

  it("adopts an item whose create answer was lost, instead of moving the row or making a second one", async () => {
    await miss("2026-12-07");
    await miss("2026-12-14");
    await processContributions(query, { ...deps(mondayMorning("2026-12-14")), adjust: undefined });
    // The create reaches Stripe, but the process dies before storing the id.
    const lost = { ...stripe, createInvoiceItem: async (o: Parameters<typeof stripe.createInvoiceItem>[0]) => {
      await stripe.createInvoiceItem(o);
      throw new Error("connection reset");
    } };
    await placeAdjustments(query, { ...deps(mondayMorning("2026-12-14")), adjust: lost });
    expect((await rows())[0].stripe_item).toBeNull();
    // Days later, now within three days of the invoice: the item is found, the row is not moved.
    await placeAdjustments(query, deps(at("2027-01-01T12:00:00Z")));
    expect(stripe.items.size).toBe(1);
    expect(await rows()).toMatchObject([{ stripe_item: stripe.pending()[0].id, invoice_at: "2027-01-03T11:05Z" }]);
  });

  it("puts the item back when the cancellation is undone", async () => {
    await secondMissInDecember();
    await query("update users set cancel_requested_at = now()");
    await adjustmentOnCancelScheduled(query, deps(at("2026-12-15T15:00:00Z")), uid);
    await query("update users set cancel_requested_at = null");
    expect(await adjustmentOnCancelUndone(query, deps(at("2026-12-16T15:00:00Z")), uid)).toBe(1);
    expect(stripe.pending()).toHaveLength(1);
    expect((await rows()).map((r) => r.status)).toEqual(["deleted", "pending"]);
    // Undoing twice adds nothing.
    await adjustmentOnCancelUndone(query, deps(at("2026-12-16T15:05:00Z")), uid);
    expect(stripe.pending()).toHaveLength(1);
    // The renewal bills the month and the difference once, with tax on its own row.
    const inv = stripe.renew("cus_1", "sub_1");
    expect(inv.lines.map((l) => l.amountCents)).toEqual([20000, 20000]);
    expect(inv.totalCents).toBe(45200);
  });

  it("sends the second-miss notice again for an adjustment raised again", async () => {
    await secondMissInDecember();
    await excuseWeek(query, deps(at("2026-12-15T15:00:00Z")), { week: "2026-12-14", userId: uid, by: "admin@example.com" });
    await miss("2026-12-21");
    await processContributions(query, deps(mondayMorning("2026-12-21")));
    expect(subjects().filter((s) => s === "Your second missed week this month")).toHaveLength(2);
  });

  it("deletes the item on a switch to one list at a time, and no later order invoice carries it", async () => {
    await secondMissInDecember();
    await adjustmentOnSwitchToPerRun(query, deps(at("2026-12-15T15:00:00Z")), uid);
    expect(stripe.pending()).toEqual([]);
    // A later pass does not raise it again: the switch replaces it.
    await processContributions(query, deps(at("2026-12-15T16:00:00Z")));
    expect(stripe.pending()).toEqual([]);
    expect(stripe.renew("cus_1", "sub_1").totalCents).toBe(22600);
  });

  it("drops the adjustment when placing it finds the user no longer qualifies (a cancel that skipped the hook)", async () => {
    await miss("2026-12-07");
    await miss("2026-12-14");
    await processContributions(query, { ...deps(mondayMorning("2026-12-14")), adjust: undefined });
    await query("update users set cancel_requested_at = now()");
    await placeAdjustments(query, deps(mondayMorning("2026-12-14")));
    expect(stripe.items.size).toBe(0);
    expect(await rows()).toMatchObject([{ status: "deleted", deleted_reason: "cancel" }]);
  });

  it("retries a failed Stripe delete hourly, and makes no new item for that month until it is confirmed", async () => {
    await secondMissInDecember();
    const first = stripe.pending()[0].id;
    stripe.failNextDeletes(1);
    await excuseWeek(query, deps(at("2026-12-15T15:00:00Z")), { week: "2026-12-14", userId: uid, by: "admin@example.com" });
    expect(stripe.items.has(first)).toBe(true);
    // A new miss raises the month again, but no item is made while the old one may still be there.
    await miss("2026-12-21");
    await processContributions(query, deps(mondayMorning("2026-12-21")));
    expect(stripe.pending().map((i) => i.id)).toEqual([first]);
    await retryDeletes(query, deps(at("2026-12-21T13:00:00Z")));
    expect(stripe.items.has(first)).toBe(false);
    await placeAdjustments(query, deps(at("2026-12-21T13:00:00Z")));
    expect(stripe.pending()).toHaveLength(1);
    expect(stripe.renew("cus_1", "sub_1").lines.map((l) => l.amountCents)).toEqual([20000, 20000]);
  });

  it("deletes the item when the subscription ends (webhook) and when the account closes", async () => {
    await secondMissInDecember();
    const ended = { id: "evt_end", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(query, fakeGateway(), ended, { getSettings: async () => settings, adjust: stripe, query, transport })).toBe("handled");
    expect(stripe.pending()).toEqual([]);
    expect(await rows()).toMatchObject([{ status: "deleted", deleted_reason: "ended" }]);
    expect(await adjustmentOnAccountClosed(query, deps(at("2026-12-16T15:00:00Z")), uid)).toBe(0);
    const unknown = { id: "evt_unknown", type: "customer.subscription.deleted", data: { object: { id: "sub_nobody" } } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(query, fakeGateway(), unknown, { getSettings: async () => settings, adjust: stripe, query, transport })).toBe("ignored");
  });

  it("deletes an item that was made while its row was being deleted", async () => {
    await miss("2026-12-07");
    await miss("2026-12-14");
    // The row is written without its item (no Stripe), then deleted before the item is stored.
    await processContributions(query, { ...deps(mondayMorning("2026-12-14")), adjust: undefined });
    const slow = { ...stripe, createInvoiceItem: async (o: Parameters<typeof stripe.createInvoiceItem>[0]) => {
      const id = await stripe.createInvoiceItem(o);
      await query("update pending_adjustments set status = 'deleted', deleted_reason = 'cancel'");
      return id;
    } };
    await placeAdjustments(query, { ...deps(mondayMorning("2026-12-14")), adjust: slow });
    expect(stripe.pending()).toEqual([]);
  });
});

describe("the invoice it goes on", () => {
  it("carries a second miss found two days before a Wednesday renewal to the invoice after, with the three-day email first", async () => {
    await miss("2027-01-25");
    await processContributions(query, deps(mondayMorning("2027-01-25")));
    await miss("2027-02-01");
    await processContributions(query, deps(mondayMorning("2027-02-01")));
    expect(await rows()).toMatchObject([{ status: "pending", stripe_item: null, invoice_at: "2027-03-03T11:05Z", create_after: "2027-02-03T13:05Z" }]);
    expect(sent.at(-1)!.text).toContain("will be on your invoice of Wednesday, March 3.");
    // Nothing reaches the renewal of February 3.
    expect(stripe.pending()).toEqual([]);
    const feb = stripe.renew("cus_1", "sub_1");
    expect(feb.lines).toHaveLength(1);
    // The hourly pass makes the item after that renewal, and emails three days before March 3.
    for (const t of ["2027-02-03T12:00:00Z", "2027-02-03T14:00:00Z", "2027-02-27T12:00:00Z", "2027-02-28T12:00:00Z", "2027-02-28T13:00:00Z"]) {
      await runHourly(query, { gw: {} as BillingGateway, adjust: stripe, settings, now: at(t), query, transport, sleep: async () => {} });
    }
    expect(stripe.pending()).toHaveLength(1);
    expect(subjects().filter((s) => s.includes("itemised"))).toEqual(["Your invoice of Wednesday, March 3, itemised"]);
  });

  it("shows the adjustment and the tax as their own rows, and the three-day email's total matches the invoice (spec check 26)", async () => {
    await secondMissInDecember();
    expect(await sendItemisedNotices(query, deps(at("2026-12-30T10:00:00Z")))).toBe(0); // more than three days before January 3
    expect(await sendItemisedNotices(query, deps(at("2026-12-31T12:00:00Z")))).toBe(1);
    expect(await sendItemisedNotices(query, deps(at("2026-12-31T13:00:00Z")))).toBe(0);
    const email = sent.find((m) => m.subject.includes("itemised"))!;
    const invoice = stripe.renew("cus_1", "sub_1");
    expect(invoice.lines.map((l) => l.description)).toEqual(["1 × Roger monthly", "Higher-rate adjustment for December 3 to January 3, 2027: two missed weeks"]);
    expect(invoice.taxCents).toBe(5200);
    expect(email.text).toContain("Higher-rate adjustment for December 3 to January 3, 2027: two missed weeks: US$200");
    expect(email.text).toContain("Tax: US$52");
    expect(email.text).toContain(`Total: US$${invoice.totalCents / 100}`);
  });

  const invoiceEvent = (id: string, type: string, invoice: ReturnType<typeof stripe.renew>) =>
    ({
      id,
      type,
      data: { object: { id: invoice.id, lines: { data: invoice.lines.map((l) => ({ parent: l.invoiceItem ? { invoice_item_details: { invoice_item: l.invoiceItem } } : null })) } } },
    }) as unknown as Stripe.Event;
  const handle = (e: Stripe.Event) => handleStripeEvent(query, fakeGateway(), e, { getSettings: async () => settings, adjust: stripe, query, transport });

  it("marks the adjustment invoiced only when the renewal invoice is finalized, never on a draft", async () => {
    await secondMissInDecember();
    const invoice = stripe.renew("cus_1", "sub_1");
    expect(await handle(invoiceEvent("evt_draft", "invoice.created", invoice))).toBe("ignored");
    expect(await rows()).toMatchObject([{ status: "pending" }]);
    expect(await handle(invoiceEvent("evt_final", "invoice.finalized", invoice))).toBe("handled");
    expect(await rows()).toMatchObject([{ status: "invoiced" }]);
    // A cancel afterwards has nothing left to delete; the period is not raised again.
    expect(await adjustmentOnCancelScheduled(query, deps(at("2027-01-04T15:00:00Z")), uid)).toBe(0);
  });

  it("tells admins when a deleted adjustment still reached an invoice, and when an excuse comes after it was invoiced", async () => {
    await secondMissInDecember();
    const invoice = stripe.renew("cus_1", "sub_1");
    await query("update pending_adjustments set status = 'deleted', deleted_reason = 'cancel'");
    await handle(invoiceEvent("evt_paid", "invoice.paid", invoice));
    expect(sent.map((m) => m.subject)).toContain("[Roger] A dropped higher-rate difference was already billed");
    await excuseWeek(query, deps(at("2027-01-04T15:00:00Z")), { week: "2026-12-14", userId: uid, by: "admin@example.com" });
    expect(sent.map((m) => m.subject)).toContain("[Roger] An excused week's higher-rate difference was already invoiced");
  });

  it("moves an adjustment whose item could not be made in time to the next invoice, and says so", async () => {
    await miss("2026-12-07");
    await miss("2026-12-14");
    // Stripe was down for two weeks: the row waits without its item.
    await processContributions(query, { ...deps(mondayMorning("2026-12-14")), adjust: undefined });
    expect(await rows()).toMatchObject([{ invoice_at: "2027-01-03T11:05Z" }]);
    await placeAdjustments(query, deps(at("2027-01-01T12:00:00Z")));
    expect(await rows()).toMatchObject([{ invoice_at: "2027-02-03T11:05Z", create_after: "2027-01-03T13:05Z", stripe_item: null }]);
    expect(sent.at(-1)!.text).toContain("will be on your invoice of Wednesday, February 3.");
    await placeAdjustments(query, deps(at("2027-01-03T14:00:00Z")));
    expect(stripe.pending()).toHaveLength(1);
  });
});

/** B2 plan Unit 5: an invoice that used referral credit refreshes the cached balance, with no Stripe call. */
describe("the cached credit balance after an invoice", () => {
  const event = (id: string, type: string, starting: number, ending: number | null) =>
    ({
      id,
      type,
      created: Date.parse("2027-01-03T12:00:00Z") / 1000,
      data: { object: { id: `in_${id}`, customer: "cus_1", lines: { data: [] }, starting_balance: starting, ending_balance: ending, status_transitions: { finalized_at: Date.parse("2027-01-03T11:10:00Z") / 1000 } } },
    }) as unknown as Stripe.Event;
  const handle = (e: Stripe.Event) => handleStripeEvent(query, fakeGateway(), e, { getSettings: async () => settings, adjust: stripe, query, transport });
  const cached = async () => (await query<{ cents: number; at: Date }>("select credit_balance_cents as cents, credit_balance_at as at from users where id = $1", [uid]))[0];

  it("invoice.finalized that used the credit: the cache becomes its ending balance, as of its finalization", async () => {
    await query("update users set credit_balance_cents = 28000, credit_balance_at = '2026-12-20T12:00:00Z' where id = $1", [uid]);
    expect(await handle(event("evt_fin", "invoice.finalized", -28000, -5400))).toBe("handled");
    expect(await cached()).toEqual({ cents: 5400, at: new Date("2027-01-03T11:10:00Z") });
  });

  it("an invoice that did not touch the balance changes nothing", async () => {
    await query("update users set credit_balance_cents = 28000, credit_balance_at = '2026-12-20T12:00:00Z' where id = $1", [uid]);
    expect(await handle(event("evt_none", "invoice.paid", 0, 0))).toBe("ignored");
    expect(await cached()).toMatchObject({ cents: 28000 });
  });
});
