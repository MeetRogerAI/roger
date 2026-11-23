import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/clock";
import { excuseWeek } from "@/lib/billing/contribution";
import { delivered, dollars, monday, newWorld, passHours, seedPool, sendRun, signUp, toronto, userRow, weeksWithRuns, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * The contributor rule over one billing month (spec B.9; checks 24, 25, 26):
 * a Canadian monthly member subscribed on Monday December 21 contributes one
 * week, misses the next (forgiven), misses again (the month's difference is
 * raised as one pending invoice item), misses a third (nothing more), gets the
 * itemised email three days before the renewal, and the renewal invoice
 * carries exactly one difference line, with tax as its own row. As built, the
 * subscription stays at the standard price and the higher rate is billed as
 * that one labelled line (plan Unit 14 deviation).
 */
let w: World;
let m: Member;

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 10, playsEach: 4, ranOn: "2026-11-26" });
  await w.at("2026-12-02T16:00:00Z");
  m = await signUp(w, { email: "mia@example.ca", currency: "CAD", country: "CA" });
  await weeksWithRuns(w, [m], ["2026-12-07", "2026-12-14", "2026-12-21"]);
  expect(await userRow(w, m.id)).toMatchObject({ status: "active" });
});

/** Mondays with or without the member's run; monthly members get their list either way. */
async function weeks(plan: [string, boolean][]) {
  for (const [week, run] of plan) {
    await passHours(w, toronto(addDays(week, -1), "15:00"), 3);
    if (run) await sendRun(w, m);
    await monday(w, week);
    expect(await delivered(w, m.id, week)).toHaveLength(3);
  }
}
const results = async () =>
  (await w.query<{ week_of: string; result: string }>(`select to_char(week_of, 'YYYY-MM-DD') as week_of, result from contribution_weeks where user_id = $1 order by week_of`, [m.id])).map((r) => [r.week_of, r.result]);
const lineKinds = (inv: { lines: { kind: string; amountCents: number }[] }) => inv.lines.map((l) => [l.kind, l.amountCents]);

describe("missed weeks in a billing month", () => {
  it("forgives the first miss, bills the second as one difference line on the next invoice with the notices, and adds nothing for a third", async () => {
    await weeks([["2026-12-28", true], ["2027-01-04", false]]);
    expect(w.subjects(m.email).filter((s) => s === "Zack didn’t send a report this week")).toHaveLength(1);
    expect(w.stripe.callsTo("invoiceItems.create")).toEqual([]);

    await weeks([["2027-01-11", false]]);
    expect(w.subjects(m.email)).toContain("Your second missed week this month");
    const created = w.stripe.callsTo("invoiceItems.create");
    expect(created).toHaveLength(1);
    // The month's difference in the member's currency (CA$560 - CA$280), on the subscription, labelled, keyed by its row.
    expect(created[0].args).toMatchObject({ customer: m.customer, amountCents: 28000, currency: "CAD" });
    expect(String(created[0].args.description)).toMatch(/^Higher-rate adjustment for .+: two missed weeks$/);
    expect(String(created[0].args.idempotencyKey)).toMatch(/^adjustment:/);

    // A third miss in the same month adds nothing.
    await weeks([["2027-01-18", false]]);
    expect(await results()).toEqual([
      ["2026-12-28", "contributed"],
      ["2027-01-04", "missed"],
      ["2027-01-11", "missed"],
      ["2027-01-18", "missed"],
    ]);
    expect(w.stripe.callsTo("invoiceItems.create")).toHaveLength(1);
    expect(w.subjects(m.email).filter((s) => s === "Zack didn’t send a report this week")).toHaveLength(1);

    // Three days before the renewal: the itemised email, from Stripe's preview of the invoice.
    await passHours(w, new Date("2027-01-21T14:00:00Z"), 1);
    const itemised = w.mail(m.email).filter((x) => /^Your invoice of .+, itemised$/.test(x.subject));
    expect(itemised).toHaveLength(1);

    // The renewal (Stripe's clock, then its webhooks): plan at the standard price, one difference line, HST as its own row.
    const renewal = w.stripe.invoicesFor(m.customer).find((i) => i.billingReason === "subscription_cycle")!;
    expect(renewal).toMatchObject({ status: "paid", currency: "CAD" });
    expect(lineKinds(renewal)).toEqual([["plan", 28000], ["item", 28000], ["tax", 7280]]);
    expect(renewal.lines.filter((l) => l.kind === "item")).toHaveLength(1);
    expect(renewal.totalCents).toBe(63280);
    // The three-day email's total matches the invoice (spec check 26).
    expect(itemised[0].text).toContain(dollars(63280, "CAD"));
    expect(await w.query(`select status, reason from pending_adjustments where user_id = $1`, [m.id])).toEqual([{ status: "invoiced", reason: "two_misses" }]);
    expect(await w.stripe.pendingInvoiceItems(m.customer)).toEqual([]);
    expect((await userRow(w, m.id)).status).toBe("active");
  });

  it("never counts an excused week: an admin excuses the second miss and the difference is deleted before the renewal (spec check 25)", async () => {
    await weeks([["2026-12-28", true], ["2027-01-04", false], ["2027-01-11", false]]);
    expect(w.stripe.callsTo("invoiceItems.create")).toHaveLength(1);
    const d = w.charge();
    expect(await excuseWeek(w.query, { settings: d.settings, now: d.now, adjust: d.adjust, query: d.query, transport: d.transport, sleep: d.sleep }, { week: "2027-01-11", userId: m.id, by: "ehab@example.com" })).toBe(1);
    await passHours(w, new Date("2027-01-21T14:00:00Z"), 3);
    expect(w.stripe.callsTo("invoiceItems.del")).toHaveLength(1);
    const renewal = w.stripe.invoicesFor(m.customer).find((i) => i.billingReason === "subscription_cycle")!;
    expect(lineKinds(renewal)).toEqual([["plan", 28000], ["tax", 3640]]);
    expect(await results()).toContainEqual(["2027-01-11", "excused"]);
  });
});
