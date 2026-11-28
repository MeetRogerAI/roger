import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/clock";
import { applyPromo, delivered, dollars, firstList, monday, newWorld, passHours, seedPool, saveCard, sendRun, signUp, toronto, userRow, vercelCron, type World } from "./helpers";
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * Trial to the third-list charge (plan Unit 19; spec B.9 "The trial and the
 * first charge", checks 19, 20, 21, 26, 28; plan 2026-11-26-001, Unit 10, for
 * the card asked for at the first list), for a Canadian and a US member side
 * by side: sign-up with no card, the first Monday's list held as a
 * titles-only teaser, the card saved midweek (the held list delivered as free
 * list 1), the second free Monday, the two emails that state the amount, then
 * the first charge with the third list, each at their own set price, with
 * HST as its own row for the Canadian and no tax row for the US member.
 */
let w: World;
const WEEKS = ["2026-12-07", "2026-12-14", "2026-12-21"];

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 6, playsEach: 3, ranOn: "2026-11-26" });
});

/** A member's picks for a week that are not delivered (a held list), by title. */
const heldTitles = async (userId: string, week: string) =>
  (
    await w.query<{ title: string }>(
      `select pp.title from picks k join pool_plays pp on pp.id = k.pool_play_id where k.user_id = $1 and k.week_of = $2 and not k.dry_run and k.delivered_at is null order by k.position`,
      [userId, week],
    )
  ).map((r) => r.title);

describe("trial to the third-list charge", () => {
  it("signs up with no card, holds the first list as a teaser, unlocks it with the card midweek, and charges once with the third list at the amount told", async () => {
    await w.at("2026-12-02T16:00:00Z");
    const ca = await signUp(w, { email: "carla@example.ca", currency: "CAD", country: "CA" });
    const us = await signUp(w, { email: "sam@example.com", currency: "USD", country: "US" });
    expect(w.subjects(ca.email)).toEqual(["Welcome to Roger"]);
    // Sign-up asks for no card: no Stripe customer, no card session.
    expect(w.stripe.callsTo("customers.create")).toEqual([]);
    expect(w.stripe.callsTo("checkout.sessions.create")).toEqual([]);

    // The first Monday: Zack's run, Cora picks, and the list is held (R8): titles only, nothing delivered, no free list used.
    await w.at(toronto(addDays(WEEKS[0], -1), "15:00"));
    for (const m of [ca, us]) await sendRun(w, m);
    const r1 = await monday(w, WEEKS[0]);
    expect(r1.cora.status).toBe("ready");
    const teaserAt = toronto(WEEKS[0], "07:05").toISOString();
    for (const m of [ca, us]) {
      expect(await delivered(w, m.id, WEEKS[0])).toEqual([]);
      expect(await userRow(w, m.id)).toMatchObject({ status: "trial", free_lists_used: 0 });
      // The teaser's stamp is the send job's clock (the 14-day no-card close counts from it).
      expect(await w.query(`select first_teaser_at = $2::timestamptz as at_send from users where id = $1`, [m.id, teaserAt])).toEqual([{ at_send: true }]);
    }
    const titles = await heldTitles(ca.id, WEEKS[0]);
    expect(titles).toHaveLength(3);
    const teaser = w.mail(ca.email).find((m) => m.subject === "Your first 3 ideas are ready")!;
    for (const t of titles) expect(teaser.text).toContain(t);
    // No idea details before the card: no playbook steps, install notes or install links.
    for (const detail of ["Do the thing", "Save as a skill", "Open and install"]) expect(teaser.text).not.toContain(detail);
    expect(teaser.text).toContain("/start/payment");
    expect(w.subjects(ca.email)).toEqual(["Welcome to Roger", "Your first 3 ideas are ready"]);

    // Wednesday: each member adds a card on Payment. The held list is delivered at once, as free list 1 of 2.
    await w.at(toronto("2026-12-09", "12:00"));
    expect(await saveCard(w, ca)).toMatchObject({ outcome: "done", week: WEEKS[0], promoRefused: false });
    await saveCard(w, us, { via: "webhook" });
    expect(w.stripe.callsTo("checkout.sessions.create").map((c) => [c.args.currency, c.args.ui_mode])).toEqual([["CAD", "elements"], ["USD", "elements"]]);
    for (const m of [ca, us]) {
      expect(await delivered(w, m.id, WEEKS[0])).toHaveLength(3);
      expect((await userRow(w, m.id)).free_lists_used).toBe(1);
    }
    expect(await delivered(w, ca.id, WEEKS[0])).toEqual(titles);
    const list1 = w.mail(ca.email).filter((m) => m.subject.startsWith("Your three ideas"));
    expect(list1).toHaveLength(1);
    expect(list1[0].text).toContain("Free list 1 of 2.");
    expect(list1[0].text).toContain("Open and install");

    // The second Monday: free list 2.
    await w.at(toronto(addDays(WEEKS[1], -1), "15:00"));
    for (const m of [ca, us]) await sendRun(w, m);
    const r2 = await monday(w, WEEKS[1]);
    expect(r2.charge.first?.charged ?? 0).toBe(0);
    for (const m of [ca, us]) {
      expect(await delivered(w, m.id, WEEKS[1])).toHaveLength(3);
      expect((await userRow(w, m.id)).free_lists_used).toBe(2);
    }
    // Nothing was charged in the trial (spec check 19: "at no other time").
    expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);

    // After the second list: the first paid one, with the date and the amount with tax (spec check 21).
    const told = { ca: 31640, us: 20000 };
    const paidNext = (email: string) => w.mail(email).find((m) => m.subject === "Your next list is your first paid one")!;
    expect(paidNext(ca.email).text).toContain(dollars(told.ca, "CAD"));
    expect(paidNext(ca.email).text).toContain("December 21");
    expect(paidNext(us.email).text).toContain(dollars(told.us, "USD"));
    // S18 point a: the price plus the HST for the Ontario member; no tax collected for the US one, so just the amount.
    expect(paidNext(ca.email).text).toContain("we’ll charge CA$316.40 (CA$280 plus CA$36.40 HST) for your first month.");
    expect(paidNext(us.email).text).toContain("we’ll charge US$200 for your first month.");
    for (const e of [ca.email, us.email]) expect(paidNext(e).text).not.toContain("tax included");
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
    expect(subscribed.text).toContain("We charged CA$316.40 (CA$280 plus CA$36.40 HST).");
    expect(w.mail(us.email).find((m) => m.subject === "You’re subscribed")!.text).toContain("We charged US$200. ");

    // A fourth Monday: the subscription covers it; no second charge.
    await w.at(toronto("2026-12-27", "15:00"));
    await monday(w, "2026-12-28");
    expect(w.stripe.callsTo("subscriptions.create")).toHaveLength(2);
    expect(await delivered(w, ca.id, "2026-12-28")).toHaveLength(3);
    expect(w.subjects(ca.email).filter((s) => s.startsWith("Your three ideas"))).toHaveLength(4);
  });
});

// S18 point c (Peter, 2026-11-27): a member whose Zack shares for matching only at the cutoff of the first paid
// Monday pays the higher rate's difference on the first invoice, as its own line named for why it is owed,
// never "Roger Monthly" twice.
describe("the first charge with Zack not sharing", () => {
  it("bills the plan line and one named higher-rate line on one invoice, told and charged alike", async () => {
    await w.at("2026-12-02T16:00:00Z");
    const m = await signUp(w, { email: "nia@example.ca", currency: "CAD", country: "CA", sharing: "match_only" });
    await firstList(w, [m], WEEKS[0]);
    await w.at(toronto(addDays(WEEKS[1], -1), "15:00"));
    await sendRun(w, m);
    await monday(w, WEEKS[1]);
    // CA$280 + CA$280 + 13% HST: told as the price plus the tax (S18 point a).
    const paidNext = w.mail(m.email).find((x) => x.subject === "Your next list is your first paid one")!;
    expect(paidNext.text).toContain("we’ll charge CA$632.80 (CA$560 plus CA$72.80 HST) for your first month.");
    await w.at(toronto(addDays(WEEKS[2], -1), "15:00"));
    await sendRun(w, m);
    expect((await monday(w, WEEKS[2])).charge.first).toMatchObject({ charged: 1, held_amount: 0 });

    const creates = w.stripe.callsTo("subscriptions.create");
    expect(creates).toHaveLength(1);
    expect(creates[0].args).toMatchObject({ price: "price_monthly_cad", extra: { amountCents: 28000, currency: "CAD", description: "Higher monthly rate: Zack not sharing" } });
    const [inv] = w.stripe.invoicesFor(m.customer);
    expect(w.stripe.invoicesFor(m.customer)).toHaveLength(1);
    expect(inv).toMatchObject({ status: "paid", totalCents: 63280 });
    expect(inv.lines.map((l) => [l.kind, l.description, l.amountCents])).toEqual([
      ["plan", "1 × Roger monthly", 28000],
      ["extra", "Higher monthly rate: Zack not sharing", 28000],
      ["tax", "HST (13%)", 7280],
    ]);
    expect(w.mail(m.email).find((x) => x.subject === "You’re subscribed")!.text).toContain("We charged CA$632.80 (CA$560 plus CA$72.80 HST).");
  });
});

// Plan 2026-11-26-001, Key Technical Decisions "Pre-existing charge gap" (Unit 8): the charge cron runs every
// 10 minutes on Monday, also after the 7:00 send. The second free list delivered at 7:00 must not make that
// same Monday's later charge runs start the subscription: that week's list was itself free.
describe("the charge cron re-runs after the second free list", () => {
  it("creates no subscription the Monday the second free list is delivered, and charges once the next Monday with the third", async () => {
    await w.at("2026-12-02T16:00:00Z");
    const m = await signUp(w, { email: "lee@example.ca", currency: "CAD", country: "CA" });
    // The first list, held, then unlocked by the card on the Wednesday: free list 1.
    await firstList(w, [m], WEEKS[0]);
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

describe("a promo locked in at card save (plan 2026-11-26-001, Units 5, 8 and 10)", () => {
  type PromoCoupon = NonNullable<Parameters<World["stripe"]["payment"]["addPromotion"]>[0]["coupon"]>;
  /**
   * The promo through the Payment page: the first list held, then on the Wednesday the code applied ("Have a
   * promo code?") and the card saved, which locks the coupon in with its reservation; then the second free list.
   */
  async function promoMember(email: string, o: { currency?: "CAD" | "USD"; country?: "CA" | "US"; code?: string; coupon?: PromoCoupon; duration?: "once" | "repeating" | "forever" } = {}) {
    await w.at("2026-12-02T16:00:00Z");
    const m = await signUp(w, { email, currency: o.currency ?? "CAD", country: o.country ?? "CA" });
    const code = o.code ?? "WELCOME20";
    const p = w.stripe.payment.addPromotion({ code, coupon: { ...(o.coupon ?? { id: "co_20", percentOff: 20 }), duration: o.duration ?? "once" } });
    await w.at(toronto(addDays(WEEKS[0], -1), "15:00"));
    await sendRun(w, m);
    await monday(w, WEEKS[0]);
    await w.at(toronto("2026-12-09", "12:00"));
    expect(await applyPromo(w, m, code.toLowerCase())).toMatchObject({ ok: true });
    expect(await saveCard(w, m)).toMatchObject({ outcome: "done", week: WEEKS[0], promoRefused: false });
    expect(await w.query("select promo_code, promo_coupon, promo_label, promo_duration from users where id = $1", [m.id])).toEqual([
      { promo_code: code, promo_coupon: p.coupon!.id, promo_label: code, promo_duration: o.duration ?? "once" },
    ]);
    expect(await w.query("select promotion_code from promo_reservations where user_id = $1", [m.id])).toEqual([{ promotion_code: p.promotionCodeId }]);
    await w.at(toronto(addDays(WEEKS[1], -1), "15:00"));
    await sendRun(w, m);
    await monday(w, WEEKS[1]);
    expect((await userRow(w, m.id)).free_lists_used).toBe(2);
    return m;
  }

  it("tells the discounted amount after the second list and charges exactly that with the third", async () => {
    const m = await promoMember("dee@example.ca");
    // CA$280 less 20% = CA$224, plus 13% HST = CA$253.12.
    const paidNext = w.mail(m.email).find((x) => x.subject === "Your next list is your first paid one")!;
    // The price plus the tax, never "tax included" (S18 point a).
    expect(paidNext.text).toContain("we’ll charge CA$253.12 (CA$224 plus CA$29.12 HST) for your first month.");
    expect(paidNext.text).toContain("That includes your promo code WELCOME20: CA$56 off your first month. After that, it’s CA$280 a month plus HST.");
    await w.at(toronto(addDays(WEEKS[2], -1), "15:00"));
    await sendRun(w, m);
    expect((await monday(w, WEEKS[2])).charge.first).toMatchObject({ charged: 1 });
    expect(w.stripe.callsTo("subscriptions.create").map((c) => c.args.coupon)).toEqual(["co_20"]);
    expect(w.stripe.invoicesFor(m.customer)[0]).toMatchObject({ status: "paid", totalCents: 25312, discountCents: 5600 });
    expect(w.mail(m.email).find((x) => x.subject === "You’re subscribed")!.text).toContain("We charged CA$253.12 (CA$224 plus CA$29.12 HST).");
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

  // Review F7: an amount-off coupon in each currency, told and charged alike.
  it.each([
    // CA$280 less CA$56 = CA$224, plus 13% HST = CA$253.12.
    ["CAD", "CA", { usd: 4000, cad: 5600 }, 25312, 5600],
    // US$200 less US$40, no tax collected: US$160.
    ["USD", "US", { usd: 4000, cad: 5600 }, 16000, 4000],
  ] as const)("an amount-off code in %s: the told amount is the charge", async (currency, country, amountOff, told, off) => {
    const m = await promoMember(`amt-${country.toLowerCase()}@example.com`, { currency, country, code: "TAKE40", coupon: { id: "co_amt", percentOff: null, amountOff: { ...amountOff } }, duration: "forever" });
    const paidNext = w.mail(m.email).find((x) => x.subject === "Your next list is your first paid one")!;
    expect(paidNext.text).toContain(dollars(told, currency));
    expect(paidNext.text).toContain(`That includes your promo code TAKE40: ${dollars(off, currency)} off every month.`);
    await w.at(toronto(addDays(WEEKS[2], -1), "15:00"));
    await sendRun(w, m);
    expect((await monday(w, WEEKS[2])).charge.first).toMatchObject({ charged: 1 });
    expect(w.stripe.invoicesFor(m.customer)[0]).toMatchObject({ status: "paid", currency, totalCents: told, discountCents: off });
    expect((await w.query<{ amount_cents: number }>("select amount_cents from charge_attempts where user_id = $1", [m.id]))[0].amount_cents).toBe(told);
  });

  // Review F7: a coupon whose redeem_by passes after the second-list email, through the reminder and the charge.
  it("a coupon that expires (redeem_by) after the second-list email: the reminder tells the full price, and the charge matches it", async () => {
    const m = await promoMember("ivy@example.ca");
    expect(w.mail(m.email).find((x) => x.subject === "Your next list is your first paid one")!.text).toContain("CA$253.12");
    // Expires on the Friday before the third Monday, before the 48-hour reminder.
    w.stripe.payment.coupons.get("co_20")!.redeemBy = Math.floor(toronto("2026-12-18", "12:00").getTime() / 1000);
    await passHours(w, toronto("2026-12-20", "15:00"), 6);
    const reminder = w.mail(m.email).find((x) => x.subject === "Your first charge could be on Monday")!;
    expect(reminder.text).toContain("CA$316.40");
    expect(reminder.text).not.toContain("promo code");
    expect((await w.query("select promo_coupon from users where id = $1", [m.id]))[0]).toEqual({ promo_coupon: null });
    await sendRun(w, m);
    expect((await monday(w, WEEKS[2])).charge.first).toMatchObject({ charged: 1 });
    expect(w.stripe.callsTo("subscriptions.create").map((c) => c.args.coupon)).toEqual([null]);
    expect(w.stripe.invoicesFor(m.customer)[0]).toMatchObject({ status: "paid", totalCents: 31640 });
  });

  it("a coupon that expires (redeem_by) after the reminder: held and told the discount ended, charged the full price the next day", async () => {
    const m = await promoMember("jo@example.ca");
    await passHours(w, toronto("2026-12-20", "15:00"), 6);
    expect(w.mail(m.email).find((x) => x.subject === "Your first charge could be on Monday")!.text).toContain("CA$253.12");
    w.stripe.payment.coupons.get("co_20")!.redeemBy = Math.floor(toronto("2026-12-20", "18:00").getTime() / 1000);
    await sendRun(w, m);
    expect((await monday(w, WEEKS[2])).charge.first).toMatchObject({ held_amount: 1 });
    const changed = w.mail(m.email).find((x) => x.subject === "Your first charge amount changed")!;
    expect(changed.text).toContain("(WELCOME20) has ended");
    expect(changed.text).toContain("CA$316.40");
    await passHours(w, toronto(addDays(WEEKS[2], 1), "08:00"));
    expect(w.stripe.callsTo("subscriptions.create").map((c) => c.args.coupon)).toEqual([null]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active" });
  });
});

describe("no run on the announced first-charge Monday", () => {
  async function toThirdMondayWithoutRun() {
    await w.at("2026-12-02T16:00:00Z");
    const m = await signUp(w, { email: "rae@example.ca", currency: "CAD", country: "CA" });
    await firstList(w, [m], WEEKS[0]);
    await w.at(toronto(addDays(WEEKS[1], -1), "15:00"));
    await sendRun(w, m);
    await monday(w, WEEKS[1]);
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

// The trial with no first list (spec check 23), now a no-card trial that never connects Zack, is in
// held-and-closed.test.ts with the other no-card closes.
