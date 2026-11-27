import { beforeEach, describe, expect, it, vi } from "vitest";
import { placeOrder } from "@/lib/billing/orders";
import { delivered, leftoverPerRun, monday, newWorld, outcome, passHours, seedPool, sendRun, toronto, userRow, weeksWithRuns, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * One list at a time (spec B.9; checks 37, 38, 39): after the two free lists,
 * an order with a run is invoiced on its own invoice (one item, tax as its own
 * row), paid and sent with a receipt; an order with no run charges nothing and
 * says why; a week with no order is never charged; ordering needs sharing on.
 *
 * Legacy coverage only (plan 2026-11-26-001, Scope Boundaries and Unit 10):
 * monthly is the only plan and nothing offers one at a time any more, but the
 * per-run code stays, dormant, until the cleanup after launch, and leftover
 * per-run accounts on preview still reach it. The member here is such a
 * leftover account (`leftoverPerRun`: moved to per-run by hand, card saved);
 * the order is placed through `placeOrder` directly, as no page calls it.
 */
let w: World;
let m: Member;

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 8, playsEach: 3, ranOn: "2026-11-26" });
  await w.at("2026-12-02T16:00:00Z");
  m = await leftoverPerRun(w, { email: "omar@example.ca", currency: "CAD", country: "CA" });
  await weeksWithRuns(w, [m], ["2026-12-07", "2026-12-14"]);
});

const order = (week: string) => placeOrder(w.query, { userId: m.id, week, now: w.now, settings: w.settings, query: w.query, transport: w.charge().transport, sleep: async () => {} });
const orderStatus = async (week: string) => (await w.query<{ status: string }>(`select status from orders where user_id = $1 and week_of = $2`, [m.id, week]))[0]?.status ?? null;

describe("one list at a time", () => {
  it("charges an order with a run once, on its own invoice, and sends the list with its receipt; an order with no run charges nothing", async () => {
    // Whole-branch review W2: ordering is gone from the app, so no "order your next list" email after the free lists.
    expect(w.subjects(m.email)).not.toContain("Your free lists are done");
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", plan: "per_run", free_lists_used: 2 });

    // Saturday: order for Monday; Sunday: Zack's run; Monday: invoiced, paid, sent.
    await passHours(w, toronto("2026-12-19", "12:00"), 6);
    expect(await order("2026-12-21")).toEqual({ ok: true });
    expect(w.subjects(m.email)).toContain("Your list is ordered");
    await w.at(toronto("2026-12-20", "15:00"));
    await sendRun(w, m);
    const r = await monday(w, "2026-12-21");
    expect(r.charge.orders).toMatchObject({ charged: 1 });
    expect(r.charge.first?.charged).toBe(0);

    const [create] = w.stripe.callsTo("invoices.create.order");
    expect(create.args).toMatchObject({ customer: m.customer, price: "price_run_cad", pending_invoice_items_behavior: "exclude" });
    expect(String(create.args.idempotencyKey)).toMatch(/^order:[0-9a-f-]{36}:1$/);
    const [inv] = w.stripe.invoicesFor(m.customer);
    expect(inv).toMatchObject({ status: "paid", currency: "CAD", totalCents: 15820, subscription: null });
    expect(inv.lines.map((l) => [l.kind, l.amountCents])).toEqual([["order", 14000], ["tax", 1820]]);
    expect(await w.stripe.pendingInvoiceItems(m.customer)).toEqual([]);
    expect(w.stripe.subs.size).toBe(0);

    expect(await delivered(w, m.id, "2026-12-21")).toHaveLength(3);
    const receipt = w.mail(m.email).filter((x) => x.subject === "Your list, and your receipt");
    expect(receipt).toHaveLength(1);
    expect(receipt[0].text).toContain(`https://invoice.stripe.test/${inv.id}`);
    expect(await orderStatus("2026-12-21")).toBe("sent");
    // A paid order ends the trial; the free-list count is untouched.
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", plan: "per_run", free_lists_used: 2 });

    // Next week: an order, but no run by Sunday night. No charge, no list, one email saying why (spec check 38).
    await passHours(w, toronto("2026-12-26", "12:00"), 6);
    expect(await order("2026-12-28")).toEqual({ ok: true });
    await passHours(w, toronto("2026-12-27", "23:00"), 6);
    const r2 = await monday(w, "2026-12-28");
    expect(r2.charge.orders).toMatchObject({ no_run: 1, charged: 0 });
    expect(await orderStatus("2026-12-28")).toBe("no_run");
    expect(w.stripe.invoicesFor(m.customer)).toHaveLength(1);
    expect(await delivered(w, m.id, "2026-12-28")).toEqual([]);
    const why = w.mail(m.email).filter((x) => x.subject === "No list this week, and no charge");
    expect(why).toHaveLength(1);
    expect(why[0].text).toContain("didn’t arrive by Sunday night");

    // The order did not carry over: a run but no order the week after is never charged and gets no list (spec check 37).
    await passHours(w, toronto("2027-01-03", "15:00"), 6);
    await sendRun(w, m);
    await monday(w, "2027-01-04");
    expect(await orderStatus("2027-01-04")).toBeNull();
    expect(await outcome(w, m.id, "2027-01-04")).toBe("not_eligible");
    expect(w.stripe.invoicesFor(m.customer)).toHaveLength(1);
    expect(w.stripe.callsTo("invoices.create.order")).toHaveLength(1);
    expect(await delivered(w, m.id, "2027-01-04")).toEqual([]);
  });

  it("refuses an order while sharing is off, in the action itself (spec check 39)", async () => {
    await w.query(`update users set sharing = 'off' where id = $1`, [m.id]);
    const r = await order("2026-12-21");
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ message: expect.stringContaining("Zack is off") });
    expect(await orderStatus("2026-12-21")).toBeNull();
  });
});
