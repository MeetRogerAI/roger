import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/clock";
import { delivered, dollars, monday, newWorld, passHours, seedPool, sendRun, signUp, toronto, userRow, vercelCron, type World } from "./helpers";
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * Trial to the third-list charge (plan Unit 19; spec B.9 "The trial and the
 * first charge", checks 19, 20, 21, 26, 28), for a Canadian and a US member
 * side by side: two free Mondays, the two emails that state the amount, then
 * the first charge with the third list, each at their own set price, with
 * HST as its own row for the Canadian and no tax row for the US member.
 * The 21-day close is here too: the other way a trial ends with no charge.
 */
let w: World;
const WEEKS = ["2026-12-07", "2026-12-14", "2026-12-21"];

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 6, playsEach: 3, ranOn: "2026-11-26" });
});

describe("trial to the third-list charge", () => {
  it("charges a Canadian and a US member once each, with the third list, at their own set price and the amount they were told", async () => {
    await w.at("2026-12-02T16:00:00Z");
    const ca = await signUp(w, { email: "carla@example.ca", currency: "CAD", country: "CA" });
    const us = await signUp(w, { email: "sam@example.com", currency: "USD", country: "US" });
    expect(w.subjects(ca.email)).toEqual(["Welcome to Roger"]);
    expect(w.stripe.callsTo("checkout.sessions.create").map((c) => c.args.currency)).toEqual(["CAD", "USD"]);

    // Two free Mondays: runs on Sunday afternoon, a list on Monday, a free list counted.
    for (const [i, week] of WEEKS.slice(0, 2).entries()) {
      await w.at(toronto(addDays(week, -1), "15:00"));
      for (const m of [ca, us]) await sendRun(w, m);
      const r = await monday(w, week);
      expect(r.cora.status).toBe("ready");
      expect(r.charge.first?.charged ?? 0).toBe(0);
      for (const m of [ca, us]) {
        expect(await delivered(w, m.id, week)).toHaveLength(3);
        expect((await userRow(w, m.id)).free_lists_used).toBe(i + 1);
      }
    }
    // Nothing was charged in the trial (spec check 19: "at no other time").
    expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);
    expect(w.mail(ca.email).find((m) => m.subject.startsWith("Your three ideas"))!.text).toContain("Free list 1 of 2.");

    // After the second list: the first paid one, with the date and the amount with tax (spec check 21).
    const told = { ca: 31640, us: 20000 };
    const paidNext = (email: string) => w.mail(email).find((m) => m.subject === "Your next list is your first paid one")!;
    expect(paidNext(ca.email).text).toContain(dollars(told.ca, "CAD"));
    expect(paidNext(ca.email).text).toContain("December 21");
    expect(paidNext(us.email).text).toContain(dollars(told.us, "USD"));
    expect((await userRow(w, ca.id)).quote).toMatchObject({ totalCents: told.ca, currency: "CAD", price: "price_monthly_cad" });
    expect((await userRow(w, us.id)).quote).toMatchObject({ totalCents: told.us, currency: "USD", price: "price_monthly_usd" });

    // 48 hours before: the reminder with the same date and amount.
    await passHours(w, toronto("2026-12-20", "15:00"), 6);
    const reminder = (email: string) => w.mail(email).find((m) => m.subject === "Your first charge could be on Monday")!;
    expect(reminder(ca.email).text).toContain(dollars(told.ca, "CAD"));
    expect(reminder(us.email).text).toContain(dollars(told.us, "USD"));
    expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);

    // The third Monday: the subscription starts with the third list.
    for (const m of [ca, us]) await sendRun(w, m);
    const r = await monday(w, WEEKS[2]);
    expect(r.charge.first).toMatchObject({ charged: 2, declined: 0, held_amount: 0 });

    const creates = w.stripe.callsTo("subscriptions.create");
    expect(creates).toHaveLength(2);
    const byCustomer = (c: string) => creates.find((x) => x.args.customer === c)!.args;
    // The request: the member's own set price, the standard rate, no extra line, off-session, keyed by the claim's first attempt.
    expect(byCustomer(ca.customer)).toMatchObject({ price: "price_monthly_cad", extra: null, off_session: true, payment_behavior: "error_if_incomplete", automatic_tax: true, userId: ca.id });
    expect(byCustomer(us.customer)).toMatchObject({ price: "price_monthly_usd", extra: null, userId: us.id });
    expect(String(byCustomer(ca.customer).idempotencyKey)).toMatch(/^first_charge:[0-9a-f-]{36}:1$/);
    // The preview just before the charge used the same price.
    expect(w.stripe.callsTo("invoices.createPreview").filter((c) => c.args.customer === ca.customer).every((c) => c.args.price === "price_monthly_cad")).toBe(true);

    // The invoices: the plan at the set price, tax as its own row where collected (spec checks 26, 28).
    const [caInv] = w.stripe.invoicesFor(ca.customer);
    expect(caInv).toMatchObject({ status: "paid", currency: "CAD", totalCents: told.ca });
    expect(caInv.lines.map((l) => [l.kind, l.amountCents])).toEqual([["plan", 28000], ["tax", 3640]]);
    const [usInv] = w.stripe.invoicesFor(us.customer);
    expect(usInv).toMatchObject({ status: "paid", currency: "USD", totalCents: told.us });
    expect(usInv.lines.map((l) => [l.kind, l.amountCents])).toEqual([["plan", 20000]]);

    // The charge is the told amount, recorded on its claim; the member is active with the list delivered.
    const claims = await w.query<{ user_id: string; amount_cents: number; outcome: string }>(`select user_id, amount_cents, outcome from charge_attempts order by user_id`);
    expect(claims.map((c) => [c.user_id === ca.id ? "ca" : "us", c.amount_cents, c.outcome]).sort()).toEqual([["ca", told.ca, "succeeded"], ["us", told.us, "succeeded"]]);
    for (const m of [ca, us]) {
      expect(await userRow(w, m.id)).toMatchObject({ status: "active", hold_reason: null, free_lists_used: 2 });
      expect(await delivered(w, m.id, WEEKS[2])).toHaveLength(3);
    }
    const subscribed = w.mail(ca.email).find((m) => m.subject === "You’re subscribed")!;
    expect(subscribed.text).toContain(dollars(told.ca, "CAD"));

    // A fourth Monday: the subscription covers it; no second charge.
    await w.at(toronto("2026-12-27", "15:00"));
    await monday(w, "2026-12-28");
    expect(w.stripe.callsTo("subscriptions.create")).toHaveLength(2);
    expect(await delivered(w, ca.id, "2026-12-28")).toHaveLength(3);
    expect(w.subjects(ca.email).filter((s) => s.startsWith("Your three ideas"))).toHaveLength(4);
  });
});

// Plan 2026-11-26-001, Key Technical Decisions "Pre-existing charge gap" (Unit 8): the charge cron runs every
// 10 minutes on Monday, also after the 7:00 send. The second free list delivered at 7:00 must not make that
// same Monday's later charge runs start the subscription: that week's list was itself free.
describe("the charge cron re-runs after the second free list", () => {
  it("creates no subscription the Monday the second free list is delivered, and charges once the next Monday with the third", async () => {
    await w.at("2026-12-02T16:00:00Z");
    const m = await signUp(w, { email: "lee@example.ca", currency: "CAD", country: "CA" });
    await w.at(toronto(addDays(WEEKS[0], -1), "15:00"));
    await sendRun(w, m);
    await monday(w, WEEKS[0]);
    expect((await userRow(w, m.id)).free_lists_used).toBe(1);

    // Second Monday, unattended: every route at its vercel.json minutes until 13:00 (charge every 10 minutes from 5:00).
    await w.at(toronto(addDays(WEEKS[1], -1), "15:00"));
    await sendRun(w, m);
    const log = await vercelCron(w, toronto(WEEKS[1], "13:00"));
    const charges = log.filter((c) => c.route === "charge" && c.status === "done");
    expect(charges.filter((c) => c.at > toronto(WEEKS[1], "07:00").toISOString()).length).toBeGreaterThan(30);
    expect(await delivered(w, m.id, WEEKS[1])).toHaveLength(3);
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", free_lists_used: 2, stripe_subscription: null });
    expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);
    expect(await w.query("select 1 from charge_attempts")).toEqual([]);
    expect(w.subjects(m.email)).toContain("Your next list is your first paid one");

    // The third Monday: one subscription, with the third list.
    await w.at(toronto(addDays(WEEKS[2], -1), "15:00"));
    await sendRun(w, m);
    await vercelCron(w, toronto(WEEKS[2], "13:00"));
    expect(w.stripe.callsTo("subscriptions.create")).toHaveLength(1);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", free_lists_used: 2 });
    expect(await delivered(w, m.id, WEEKS[2])).toHaveLength(3);
  }, 120_000);
});

describe("a promo locked in at card save (plan 2026-11-26-001, Unit 8)", () => {
  async function promoMember(email: string) {
    await w.at("2026-12-02T16:00:00Z");
    const m = await signUp(w, { email, currency: "CAD", country: "CA" });
    const p = w.stripe.payment.addPromotion({ code: "WELCOME20", coupon: { id: "co_20", percentOff: 20 } });
    await w.query("update users set promo_code = $2, promo_coupon = $3, promo_label = 'WELCOME20' where id = $1", [m.id, p.code, p.coupon!.id]);
    for (const week of WEEKS.slice(0, 2)) {
      await w.at(toronto(addDays(week, -1), "15:00"));
      await sendRun(w, m);
      await monday(w, week);
    }
    return m;
  }

  it("tells the discounted amount after the second list and charges exactly that with the third", async () => {
    const m = await promoMember("dee@example.ca");
    // CA$280 less 20% = CA$224, plus 13% HST = CA$253.12.
    const paidNext = w.mail(m.email).find((x) => x.subject === "Your next list is your first paid one")!;
    expect(paidNext.text).toContain("CA$253.12");
    expect(paidNext.text).toContain("That includes your promo code WELCOME20: CA$56 off.");
    await w.at(toronto(addDays(WEEKS[2], -1), "15:00"));
    await sendRun(w, m);
    expect((await monday(w, WEEKS[2])).charge.first).toMatchObject({ charged: 1 });
    expect(w.stripe.callsTo("subscriptions.create").map((c) => c.args.coupon)).toEqual(["co_20"]);
    expect(w.stripe.invoicesFor(m.customer)[0]).toMatchObject({ status: "paid", totalCents: 25312, discountCents: 5600 });
    expect(w.mail(m.email).find((x) => x.subject === "You’re subscribed")!.text).toContain("CA$253.12");
  });

  it("a coupon deleted before the third Monday: held and told the full price, charged it the next day", async () => {
    const m = await promoMember("eli@example.ca");
    w.stripe.payment.coupons.delete("co_20");
    await w.at(toronto(addDays(WEEKS[2], -1), "15:00"));
    await sendRun(w, m);
    expect((await monday(w, WEEKS[2])).charge.first).toMatchObject({ held_amount: 1 });
    expect(await userRow(w, m.id)).toMatchObject({ status: "held", hold_reason: "amount_changed" });
    expect(w.mail(m.email).find((x) => x.subject === "Your first charge amount changed")!.text).toContain("CA$316.40");
    await passHours(w, toronto(addDays(WEEKS[2], 1), "08:00"));
    expect(w.stripe.callsTo("subscriptions.create").map((c) => c.args.coupon)).toEqual([null]);
    expect(w.stripe.invoicesFor(m.customer)[0]).toMatchObject({ status: "paid", totalCents: 31640 });
    expect(await userRow(w, m.id)).toMatchObject({ status: "active" });
  });
});

describe("no run on the announced first-charge Monday", () => {
  async function toThirdMondayWithoutRun() {
    await w.at("2026-12-02T16:00:00Z");
    const m = await signUp(w, { email: "rae@example.ca", currency: "CAD", country: "CA" });
    for (const week of WEEKS.slice(0, 2)) {
      await w.at(toronto(addDays(week, -1), "15:00"));
      await sendRun(w, m);
      await monday(w, week);
    }
    await passHours(w, toronto("2026-12-20", "23:00"), 6);
    const r = await monday(w, WEEKS[2]);
    return { m, r };
  }

  it("charges nothing and sends no list that Monday", async () => {
    const { m, r } = await toThirdMondayWithoutRun();
    expect(r.charge.first?.charged).toBe(0);
    expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);
    expect(await delivered(w, m.id, WEEKS[2])).toEqual([]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", free_lists_used: 2 });
  });

  // Seams review: a trial past its free lists closes `trialCloseDays` after its last delivered list (here December 14,
  // so January 4), and is charged with the next list before then. Delivery stamps `delivered_at` with the job clock
  // (deliverWeek's `now`), which the close counts from; before that fix it closed on December 21 under "as of" runs.
  it("charges with the list on the next Monday the run arrives (the close counts from the last list, on the job clock)", async () => {
    const { m } = await toThirdMondayWithoutRun();
    await passHours(w, toronto("2026-12-27", "15:00"), 6);
    expect(w.subjects(m.email).filter((s) => s === "Your first charge could be on Monday")).toHaveLength(2);
    await sendRun(w, m);
    const next = await monday(w, "2026-12-28");
    expect(next.charge.first).toMatchObject({ charged: 1 });
    expect(await delivered(w, m.id, "2026-12-28")).toHaveLength(3);
  });

  // Plan, Resolved During Planning and the seams review: "If the Monday passes with no run or no eligible plays, the
  // user gets one note with the next possible date" (fixed in PR #42; this was a known failure in the first pass).
  it("tells a third-list member whose Zack sent nothing that the first charge moved, with the next date", async () => {
    const { m } = await toThirdMondayWithoutRun();
    const moved = w.mail(m.email).filter((x) => x.subject === "Your first charge moved");
    expect(moved).toHaveLength(1);
    expect(moved[0].text).toContain("December 28");
  });
});

describe("a trial with no first list (spec check 23)", () => {
  it("nudges on days 3, 10 and 17, closes on day 21 with no charge and one email, and says each Monday that no free list was used", async () => {
    await w.at("2026-12-02T16:00:00Z");
    const m = await signUp(w, { email: "nora@example.com", currency: "USD", country: "US" });
    for (const week of ["2026-12-07", "2026-12-14", "2026-12-21"]) {
      await passHours(w, toronto(addDays(week, -1), "23:00"), 3);
      await monday(w, week);
      expect(await delivered(w, m.id, week)).toEqual([]);
    }
    await passHours(w, new Date("2026-12-23T15:00:00Z"), 3);
    expect((await userRow(w, m.id)).status).toBe("trial");
    await passHours(w, new Date("2026-12-24T15:00:00Z"), 1);

    const u = await userRow(w, m.id);
    expect(u).toMatchObject({ status: "closed", closed_reason: "no_first_list", free_lists_used: 0 });
    const s = w.subjects(m.email);
    expect(s.filter((x) => x === "Zack hasn’t sent a report yet")).toHaveLength(2);
    expect(s.filter((x) => x === "Your Roger trial closes soon")).toHaveLength(1);
    expect(s.filter((x) => x === "Your Roger trial has closed")).toHaveLength(1);
    // Spec B.8 item 6 (check 20): each Monday without a run says so, and no free list was used.
    expect(s.filter((x) => x === "No list this week")).toHaveLength(3);
    expect(w.mail(m.email).find((x) => x.subject === "No list this week")!.text).toContain("no free list was used");
    expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);
    expect(await w.query("select 1 from charge_attempts")).toEqual([]);
  });
});
