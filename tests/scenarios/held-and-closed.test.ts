import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/clock";
import { applyPromo, delivered, dollars, hourly, monday, newWorld, openPayment, passHours, saveCard, seedPool, sendRun, signUp, toronto, userRow, weeksWithRuns, event, type Member, type World } from "./helpers";
import { finishCardSave } from "@/lib/billing/card-setup";
import { cardSavePath } from "@/lib/billing/card-saved";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * Held lists and the no-card closes (plan 2026-11-26-001, Units 3, 5, 7 and
 * 10; origin R8–R11, R29). Sign-up ends with no card; each Monday a list is
 * picked and held (a titles-only teaser) until a card is saved:
 *
 * - a newer held list replaces the older one when the newer week is ready,
 *   and the card unlocks only the newest; the first charge still comes with
 *   the third delivered list;
 * - a member who never adds a card gets the day-2 and day-7 reminders and is
 *   closed 14 days after the first teaser, with one closing email, never
 *   charged; held lists never extend that close;
 * - a member who never connects Zack gets the day-3, 10 and 17 nudges and is
 *   closed 21 days after consent;
 * - a card confirmed in Stripe around the close reopens the trial and unlocks
 *   the list (the 7-day grace, Unit 7 review F1), and nothing is billed
 *   until the third delivered list;
 * - a promo code refused at the card save unlocks the held list at the
 *   regular price, says so, and the first charge is the full told amount;
 * - a sponsored member gets lists from the first Monday and is never asked
 *   for a card.
 */
let w: World;
const CA = { currency: "CAD" as const, country: "CA" as const };
const TEASER = "Your first 3 ideas are ready";
const REMINDER = "Your ideas are waiting";
const CLOSED = "Your Roger trial has closed";

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 8, playsEach: 3, ranOn: "2026-11-26" });
  await w.at("2026-12-02T16:00:00Z");
});

const count = (m: Member, subject: string) => w.subjects(m.email).filter((s) => s === subject).length;
const facts = async (m: Member) =>
  (
    await w.query<{ first_teaser_at: string | null; trial_started_at: string | null; setup_session: string | null }>(
      `select first_teaser_at::text, trial_started_at::text, setup_session from users where id = $1`,
      [m.id],
    )
  )[0];
const superseded = async (m: Member, week: string) =>
  (await w.query<{ at: string | null }>(`select superseded_at::text as at from cora_user_weeks where user_id = $1 and week_of = $2 and not dry_run`, [m.id, week]))[0]?.at ?? null;
const at = (s: string | null) => (s ? new Date(s).toISOString() : null);
/** Nothing billed: no subscription created and no charge claim for anyone (review fixes Unit 10, T2). */
async function nothingCharged() {
  expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);
  expect(await w.query("select 1 from charge_attempts")).toEqual([]);
}
/**
 * The first paid list's amount as told (review fixes Unit 10, T3): the stored quote, which the "first paid one"
 * email and the 48-hour reminder both state in dollars.
 */
async function toldCents(m: Member): Promise<number> {
  const quote = (await userRow(w, m.id)).quote as { totalCents: number; currency: string } | null;
  expect(quote).not.toBeNull();
  const told = dollars(quote!.totalCents, quote!.currency);
  expect(w.mail(m.email).find((x) => x.subject === "Your next list is your first paid one")!.text).toContain(told);
  return quote!.totalCents;
}
/** The first charge is the told amount: the paid invoice and the charge claim both carry it. */
async function chargedTold(m: Member, told: number) {
  expect(w.stripe.invoicesFor(m.customer)[0]).toMatchObject({ status: "paid", totalCents: told });
  const claims = await w.query<{ amount_cents: number; outcome: string }>("select amount_cents, outcome from charge_attempts where user_id = $1 and purpose = 'first_charge'", [m.id]);
  expect(claims).toEqual([{ amount_cents: told, outcome: "succeeded" }]);
}
/** n days later at the same Toronto wall time (no daylight-saving change in December), in ms. */
const addDaysMs = (d: Date, n: number) => d.getTime() + n * 86_400_000;

/** Zack's run on the Sunday afternoon, then the Monday. */
async function runAndMonday(m: Member, week: string) {
  await w.at(toronto(addDays(week, -1), "15:00"));
  await sendRun(w, m);
  return monday(w, week);
}

describe("two held Mondays without a card", () => {
  it("replaces the first held list when the second is ready, unlocks only the newest, and charges with the third delivered list", async () => {
    const m = await signUp(w, { email: "hana@example.ca", ...CA });
    await runAndMonday(m, "2026-12-07");
    expect(count(m, TEASER)).toBe(1);
    const firstTeaser = at((await facts(m)).first_teaser_at);
    expect(firstTeaser).toBe(toronto("2026-12-07", "07:05").toISOString());

    // The second Monday: Cora's ready step (about 1:00 AM) supersedes the first held list, before the 7:00 teaser.
    await runAndMonday(m, "2026-12-14");
    expect(at(await superseded(m, "2026-12-07"))).toBe(toronto("2026-12-14", "01:05").toISOString());
    expect(await superseded(m, "2026-12-14")).toBeNull();
    expect(count(m, TEASER)).toBe(2);
    // A replaced teaser does not restart the no-card clock.
    expect(at((await facts(m)).first_teaser_at)).toBe(firstTeaser);
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", free_lists_used: 0 });

    // Tuesday: the card. Only the newest held list is delivered (free list 1); the replaced one never is.
    await w.at(toronto("2026-12-15", "12:00"));
    expect(await saveCard(w, m)).toMatchObject({ outcome: "done", week: "2026-12-14" });
    expect(await delivered(w, m.id, "2026-12-14")).toHaveLength(3);
    expect(await delivered(w, m.id, "2026-12-07")).toEqual([]);
    expect((await userRow(w, m.id)).free_lists_used).toBe(1);
    expect(w.mail(m.email).find((x) => x.subject.includes("December 14"))!.text).toContain("Free list 1 of 2.");

    // Hourly passes to the next Monday: nothing delivers the replaced list late, and no reminder follows the card.
    const reminders = count(m, REMINDER);
    await passHours(w, toronto("2026-12-20", "12:00"), 6);
    expect(await delivered(w, m.id, "2026-12-07")).toEqual([]);
    expect(count(m, REMINDER)).toBe(reminders);

    // Free list 2, then the first charge with the third delivered list (one subscription, at the told amount).
    const [second] = await weeksWithRuns(w, [m], ["2026-12-21"]);
    expect(second.charge.first?.charged ?? 0).toBe(0);
    expect((await userRow(w, m.id)).free_lists_used).toBe(2);
    expect(w.mail(m.email).find((x) => x.subject === "Your next list is your first paid one")!.text).toContain("December 28");
    const told = await toldCents(m);
    // CA$280 plus 13% HST.
    expect(told).toBe(31640);
    const [third] = await weeksWithRuns(w, [m], ["2026-12-28"]);
    expect(third.charge.first).toMatchObject({ charged: 1 });
    expect(w.stripe.callsTo("subscriptions.create")).toHaveLength(1);
    await chargedTold(m, told);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", free_lists_used: 2 });
    for (const week of ["2026-12-14", "2026-12-21", "2026-12-28"]) expect(await delivered(w, m.id, week)).toHaveLength(3);
    expect(await delivered(w, m.id, "2026-12-07")).toEqual([]);
  });
});

describe("a member who never adds a card", () => {
  it("gets the day-2 and day-7 reminders, is closed 14 days after the first teaser with one closing email, and is never charged", async () => {
    const m = await signUp(w, { email: "ines@example.ca", ...CA });
    await runAndMonday(m, "2026-12-07");
    const teaser = toronto("2026-12-07", "07:05");
    await passHours(w, toronto("2026-12-13", "15:00"), 3);
    expect(count(m, REMINDER)).toBe(1);
    // Zack keeps running: each Monday's list is held again (and replaces the last), which never extends the close.
    await runAndMonday(m, "2026-12-14");
    expect(count(m, TEASER)).toBe(2);
    expect(count(m, REMINDER)).toBe(2);
    await passHours(w, toronto("2026-12-20", "15:00"), 3);
    await w.at(toronto("2026-12-20", "15:00"));
    await sendRun(w, m);
    await passHours(w, toronto("2026-12-21", "00:30"), 3);
    expect((await userRow(w, m.id)).status).toBe("trial");

    // The third Monday: the close is due at 7:05 (teaser + 14 days). The 7:05 send skips a third teaser (the close is
    // within a day), the 2:05 pass is too early to close, and the 8:05 pass closes.
    await monday(w, "2026-12-21");
    expect(count(m, TEASER)).toBe(2);
    const u = await userRow(w, m.id);
    expect(u).toMatchObject({ status: "closed", closed_reason: "no_card", free_lists_used: 0 });
    const ended = new Date(u.access_ends_at!).getTime();
    expect(ended).toBeGreaterThanOrEqual(addDaysMs(teaser, 14));
    expect(ended).toBeLessThanOrEqual(addDaysMs(teaser, 14) + 3_600_000);
    expect(count(m, CLOSED)).toBe(1);
    expect(w.mail(m.email).find((x) => x.subject === CLOSED)!.text).toContain("no card was added");
    expect(count(m, REMINDER)).toBe(2);

    // Never charged, never asked to Stripe; closed stays closed: no teaser, list or second closing email later.
    await runAndMonday(m, "2026-12-28");
    await passHours(w, toronto("2027-01-04", "12:00"), 12);
    expect(count(m, TEASER)).toBe(2);
    expect(count(m, CLOSED)).toBe(1);
    for (const week of ["2026-12-07", "2026-12-14", "2026-12-21", "2026-12-28"]) expect(await delivered(w, m.id, week)).toEqual([]);
    expect(w.stripe.callsTo("customers.create")).toEqual([]);
    expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);
    expect(await w.query("select 1 from charge_attempts")).toEqual([]);
  });
});

describe("a member who never connects Zack (spec check 23)", () => {
  it("nudges on days 3, 10 and 17 from consent, closes on day 21 with no charge and one email, and says each Monday that no free list was used", async () => {
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
    // Consent was December 2 at 16:00 UTC: the close is due 21 days later at the same Toronto wall time, and the
    // first hourly pass after that moment (16:05 UTC) closes.
    expect(u).toMatchObject({ status: "closed", closed_reason: "no_first_list", free_lists_used: 0 });
    expect(new Date(u.access_ends_at!).toISOString()).toBe("2026-12-23T16:05:00.000Z");
    const s = w.subjects(m.email);
    expect(s.filter((x) => x === "Zack hasn’t sent a report yet")).toHaveLength(2);
    expect(s.filter((x) => x === "Your Roger trial closes soon")).toHaveLength(1);
    expect(s.filter((x) => x === CLOSED)).toHaveLength(1);
    // The nudges are keyed by consent (the no-card clock), and no held reminder or teaser was ever sent.
    const refs = await w.query<{ ref: string }>(`select ref from notifications where recipient = $1 and kind = 'zack_not_yet' order by ref`, [m.id]);
    expect(refs.map((r) => r.ref.split(":").pop())).toEqual(["10", "17", "3"]);
    expect(s.filter((x) => x === TEASER || x === REMINDER)).toEqual([]);
    // Spec B.8 item 6 (check 20): each Monday without a run says so, and no free list was used.
    expect(s.filter((x) => x === "No list this week")).toHaveLength(3);
    expect(w.mail(m.email).find((x) => x.subject === "No list this week")!.text).toContain("no free list was used");
    expect(w.stripe.callsTo("customers.create")).toEqual([]);
    expect(await w.query("select 1 from charge_attempts")).toEqual([]);
  });
});

describe("a card confirmed in Stripe around the no-card close (the 7-day grace)", () => {
  /** A held list on December 7, Payment opened on the 20th but not confirmed, then the hours up to the close's hour. */
  async function upToTheClose() {
    const m = await signUp(w, { email: "olu@example.ca", ...CA });
    await runAndMonday(m, "2026-12-07");
    await w.at(toronto("2026-12-20", "18:00"));
    const sid = await openPayment(w, m);
    await passHours(w, toronto("2026-12-21", "06:05"), 6);
    expect((await userRow(w, m.id)).status).toBe("trial");
    return { m, sid };
  }

  it("confirmed while the close runs (before the close's expiry reaches Stripe): reopened at once, the list unlocked, no closing email", async () => {
    const { m, sid } = await upToTheClose();
    // Stripe.js confirmed the card just before the close's expiry of the stored session reached Stripe.
    w.stripe.expireSetupSession = async (id) => w.stripe.completeSession(id, "CA");
    // The hourly pass at the close moment (first teaser + 14 days).
    await w.at(toronto("2026-12-21", "07:05"));
    await hourly(w);
    expect(w.stripe.sessions.get(sid)!.status).toBe("complete");
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", closed_reason: null, access_ends_at: null, free_lists_used: 1 });
    expect((await facts(m)).trial_started_at).not.toBeNull();
    expect(await delivered(w, m.id, "2026-12-07")).toHaveLength(3);
    expect(w.mail(m.email).find((x) => x.subject.includes("December 7"))!.text).toContain("Free list 1 of 2.");
    expect(count(m, CLOSED)).toBe(0);
    // Reopened as a trial, not billed: the first charge is still two delivered lists away.
    await nothingCharged();
  });

  it("confirmed after the close (its expiry failed): the return page two days later reopens the trial and unlocks the list", async () => {
    const { m, sid } = await upToTheClose();
    const expire = w.stripe.expireSetupSession;
    w.stripe.expireSetupSession = async () => {
      throw new Error("Stripe is unavailable");
    };
    await w.at(toronto("2026-12-21", "07:05"));
    await hourly(w);
    expect(await userRow(w, m.id)).toMatchObject({ status: "closed", closed_reason: "no_card" });
    expect((await facts(m)).setup_session).toBe(sid);
    expect(count(m, CLOSED)).toBe(1);
    w.stripe.expireSetupSession = expire;

    // Wednesday: the old Payment tab confirms the card; the return page and then the webhook complete it.
    await w.at(toronto("2026-12-23", "09:00"));
    w.stripe.completeSession(sid, "CA");
    const c = w.charge();
    expect(await finishCardSave(w.query, w.stripe, sid, { expectUserId: m.id, getSettings: async () => w.settings, now: c.now, query: c.query, transport: c.transport, sleep: c.sleep })).toMatchObject({
      outcome: "done",
      week: "2026-12-07",
    });
    expect(await w.webhook(event("checkout.session.completed", { id: sid, object: "checkout.session", mode: "setup", metadata: { user_id: m.id } }))).toBe("handled");
    expect(await userRow(w, m.id)).toMatchObject({ status: "trial", closed_reason: null, access_ends_at: null, free_lists_used: 1 });
    expect(await delivered(w, m.id, "2026-12-07")).toHaveLength(3);
    expect(w.subjects(m.email).filter((s) => s.includes("December 7"))).toHaveLength(1);
    await nothingCharged();

    // The trial carries on: the next Monday is free list 2, still with no charge.
    await runAndMonday(m, "2026-12-28");
    expect(await delivered(w, m.id, "2026-12-28")).toHaveLength(3);
    expect((await userRow(w, m.id)).free_lists_used).toBe(2);
    await nothingCharged();
  });
});

describe("a promo code refused when the card is saved on a held list", () => {
  it("saves the card and unlocks the list at the regular price, says so, and charges the full price with the third list", async () => {
    const m = await signUp(w, { email: "remy@example.ca", ...CA });
    w.stripe.payment.addPromotion({ code: "SPRING20", coupon: { id: "co_spring", percentOff: 20, duration: "once" } });
    await runAndMonday(m, "2026-12-07");
    await w.at(toronto("2026-12-08", "12:00"));
    expect(await applyPromo(w, m, "SPRING20")).toMatchObject({ ok: true });
    // The code is switched off in Stripe between Apply and the card save.
    w.stripe.payment.promotions.get("SPRING20")!.active = false;
    await w.at(toronto("2026-12-09", "12:00"));
    const r = await saveCard(w, m);
    expect(r).toMatchObject({ outcome: "done", week: "2026-12-07", promoRefused: true });
    // The return page lands on the unlocked week with the "regular price" notice.
    expect(cardSavePath(r)).toBe("/app/week/2026-12-07?card=promo");
    expect(await w.query("select promo_code, promo_coupon, promo_label from users where id = $1", [m.id])).toEqual([{ promo_code: null, promo_coupon: null, promo_label: null }]);
    expect(await w.query("select 1 from promo_reservations where user_id = $1", [m.id])).toEqual([]);
    expect(await delivered(w, m.id, "2026-12-07")).toHaveLength(3);

    await weeksWithRuns(w, [m], ["2026-12-14"]);
    expect((await userRow(w, m.id)).free_lists_used).toBe(2);
    const told = await toldCents(m);
    expect(told).toBe(31640);
    expect(w.mail(m.email).find((x) => x.subject === "Your next list is your first paid one")!.text).not.toContain("promo code");
    const [third] = await weeksWithRuns(w, [m], ["2026-12-21"]);
    expect(third.charge.first).toMatchObject({ charged: 1 });
    expect(w.stripe.callsTo("subscriptions.create").map((c) => c.args.coupon ?? null)).toEqual([null]);
    await chargedTold(m, told);
  });
});

describe("a sponsored member with no card (R29)", () => {
  it("gets lists from the first Monday and is never asked for a card", async () => {
    const m = await signUp(w, { email: "sami@example.ca", ...CA, sponsored: true });
    await weeksWithRuns(w, [m], ["2026-12-07", "2026-12-14", "2026-12-21"]);
    await passHours(w, toronto("2026-12-27", "12:00"), 12);
    for (const week of ["2026-12-07", "2026-12-14", "2026-12-21"]) expect(await delivered(w, m.id, week)).toHaveLength(3);
    const s = w.subjects(m.email);
    expect(s.filter((x) => x === TEASER || x === REMINDER || x === CLOSED)).toEqual([]);
    for (const x of w.mail(m.email)) expect(x.text).not.toContain("/start/payment");
    expect((await facts(m)).first_teaser_at).toBeNull();
    expect((await userRow(w, m.id)).status).toBe("trial");
    expect(w.stripe.callsTo("customers.create")).toEqual([]);
    expect(w.stripe.callsTo("checkout.sessions.create")).toEqual([]);
    expect(w.stripe.callsTo("subscriptions.create")).toEqual([]);
  });
});
