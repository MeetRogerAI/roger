import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { RECORD_PICKS_SQL, SUPERSEDE_AT_READY_SQL } from "@/lib/cora/job";
import { runSendJob } from "@/lib/cora/send-job";
import { MAX_UNLOCKS, sendPendingUnlocks, UnlockEmailNotSent, unlockWeek } from "@/lib/cora/unlock";
import type { BillingGateway } from "@/lib/billing/subscriptions";
import { HOURLY_TASKS, runHourly } from "@/lib/housekeeping/job";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { testDb } from "@/test-helpers/pglite-db";
import { cardSavePath } from "./card-saved";
import { CARD_SAVE_CLAIM_SQL, completeCardSetup, finishCardSave, openEmbeddedSetup } from "./card-setup";
import { choosePromoCode, clearPendingPromo, setPendingPromo } from "./promo";
import { handleStripeEvent } from "./webhook";

/**
 * Card-save completion and unlock (plan 2026-11-26-001, Unit 5): one
 * idempotent completion saves the card, locks in (or refuses) the pending
 * promo code and delivers the newest held list, from the return page, the
 * webhook and the hourly sweep alike.
 */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
let failing = false;
let failingTo: ((to: string) => boolean) | null = null;
const transport: Transport = async (m) => {
  if ((failing || failingTo?.(m.to[0])) && !m.subject.startsWith("[Roger]")) return { ok: false, error: "resend down", retryable: true };
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const getSettings = async () => settings;
const billing: BillingGateway = {
  preview: async () => ({ totalCents: 31640, currency: "CAD" }),
  subscriptions: async () => [],
  createSubscription: async () => ({ kind: "error", error: "unused" }),
};
const PREV = "2026-12-07";
const WEEK = "2026-12-14";
/** Wednesday 2026-12-16, 10:00 AM Toronto: the card is saved midweek. */
const NOW = new Date("2026-12-16T15:00:00Z");
const NOW_TEXT = "2026-12-16 15:00:00+00";
const TITLES = ["Inbox triage", "Listing post", "Calendar prep", "Expense log", "Follow-up drafts", "Open house notes"];
const REASON = "Fits the sales work your week shows.";
const LIST_SUBJECT = "Your three ideas for the week of Monday, December 14";
let plays: string[];
let gw: ReturnType<typeof fakeGateway>;

const opts = <O extends { expectUserId?: string; now?: Date }>(o: O = {} as O) => ({ getSettings, query, transport, sleep: async () => {}, ...o, now: o.now ?? NOW });

/** A trial with no card (sign-up ends without one), teased about its held list unless `teased: false`. */
async function member(email: string, o: { teased?: boolean } = {}) {
  const [u] = await query<{ id: string }>(
    `insert into users (email, name, status, plan, sharing, free_lists_used, email_prefs, currency, consent_at, signup_step, first_teaser_at)
     values ($1, 'Ana Silva', 'trial', 'monthly', 'share', 0, '{}', 'CAD', '2026-12-01T15:00:00Z', 'done', $2) returning id`,
    [email, o.teased === false ? null : "2026-12-14T12:05:00Z"],
  );
  return u.id;
}
async function coraWeek(w: string, status = "sent") {
  await query("insert into cora_weeks (week_of, status, phase) values ($1, $2, 'ready') on conflict (week_of) do update set status = $2", [w, status]);
}
async function picked(userId: string, w = WEEK, o: { offset?: number; superseded?: string } = {}) {
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count, superseded_at) values ($1, $2, 'picked', 3, $3)", [userId, w, o.superseded ?? null]);
  for (let i = 0; i < 3; i++) {
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, $5)", [
      userId,
      w,
      i + 1,
      plays[i + (o.offset ?? 0)],
      REASON,
    ]);
  }
}
/** The Payment page opened the embedded session (stored on the user); Stripe.js confirmed the card. */
async function savedCard(userId: string, o: { fingerprint?: string } = {}) {
  const r = await openEmbeddedSetup(query, gw, { userId, ip: "203.0.113.9", returnUrl: "https://roger.test/start/payment/done?session_id={CHECKOUT_SESSION_ID}" });
  if (!r.ok) throw new Error(`no session: ${r.reason}`);
  gw.complete(r.sessionId, "CA", o.fingerprint);
  return r.sessionId;
}
const userRow = async (id: string) =>
  (
    await query<{
      trial_started_at: string | null;
      free_lists_used: number;
      promo_code: string | null;
      promo_coupon: string | null;
      promo_label: string | null;
      promo_refused_at: string | null;
    }>("select trial_started_at::text, free_lists_used, promo_code, promo_coupon, promo_label, promo_refused_at::text from users where id = $1", [id])
  )[0];
const deliveredIn = async (id: string, w: string) => (await query("select 1 from picks where user_id = $1 and week_of = $2 and delivered_at is not null", [id, w])).length;
const lists = (email: string) => sent.filter((m) => m.to[0] === email && m.subject.startsWith("Your three ideas"));
const reservations = () => query<{ promotion_code: string; user_id: string; card_fingerprint: string | null; reserved_at: string; slot: number | null }>(
  "select promotion_code, user_id, card_fingerprint, reserved_at::text, slot from promo_reservations order by id",
);

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  failing = false;
  failingTo = null;
  gw = fakeGateway();
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  plays = [];
  for (const t of TITLES) {
    const [p] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
       values ($1, 'Sales', 'A description.', '1. A step.', 'Install it.', $2, $2, $3, 70, 7, 7, 7, 7, 7) returning id`,
      [t, WEEK, JSON.stringify({ current_hours_week: 2, runners: 3, confidence: "High" })],
    );
    plays.push(p.id);
  }
  await coraWeek(WEEK);
});

describe("completeCardSetup: the card is saved and the held list unlocked", () => {
  it("sets the default card, stamps the card at the job clock and delivers the newest held list as free list 1, with its list email", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    expect(await completeCardSetup(query, gw, sid, opts({ expectUserId: a }))).toBe("done");
    const [customer] = await query<{ stripe_customer: string; country: string; currency: string }>("select stripe_customer, country, currency from users where id = $1", [a]);
    expect(gw.defaults.get(customer.stripe_customer)).toBe("pm_card");
    expect(customer).toMatchObject({ country: "CA", currency: "CAD" });
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, free_lists_used: 1 });
    expect(await deliveredIn(a, WEEK)).toBe(3);
    const [m] = lists("a@example.com");
    expect(lists("a@example.com")).toHaveLength(1);
    expect(m.subject).toBe(LIST_SUBJECT);
    expect(m.text).toContain("Free list 1 of 2");
    expect(m.text).toContain(REASON);
    // A second call (Stripe's webhook after the return page) changes nothing and sends nothing.
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(lists("a@example.com")).toHaveLength(1);
    expect(await userRow(a)).toMatchObject({ free_lists_used: 1 });
  });

  it("the return page and the webhook at once: one card save, one delivery, one email, one reservation", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const f = gw.payment.addPromotion({ code: "WELCOME20" });
    await setPendingPromo(query, a, { code: "WELCOME20", couponId: f.coupon!.id, label: "Welcome, 20% off" });
    const sid = await savedCard(a);
    const both = await Promise.all([completeCardSetup(query, gw, sid, opts({ expectUserId: a })), completeCardSetup(query, gw, sid, opts())]);
    expect(both).toEqual(["done", "done"]);
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, free_lists_used: 1 });
    expect(lists("a@example.com")).toHaveLength(1);
    expect(await reservations()).toHaveLength(1);
  });

  it("unlocks only the newest held list; the superseded week stays undelivered", async () => {
    const a = await member("a@example.com");
    await coraWeek(PREV);
    await picked(a, PREV, { superseded: "2026-12-14T06:05:00Z" });
    await picked(a, WEEK, { offset: 3 });
    const sid = await savedCard(a);
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(await deliveredIn(a, PREV)).toBe(0);
    expect(await deliveredIn(a, WEEK)).toBe(3);
    expect(lists("a@example.com")[0].text).toContain("Expense log");
  });

  it("unlocks a held list older than late delivery's 8 days", async () => {
    const OLD = "2026-11-30";
    const a = await member("a@example.com");
    await query("delete from cora_weeks where week_of = $1", [WEEK]);
    await coraWeek(OLD);
    await picked(a, OLD);
    const sid = await savedCard(a);
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(await deliveredIn(a, OLD)).toBe(3);
    expect(sent.filter((m) => m.subject === "Your three ideas for the week of Monday, November 30")).toHaveLength(1);
    expect(await finishCardSave(query, gw, sid, opts({ expectUserId: a }))).toEqual({ outcome: "done", week: OLD, promoRefused: false });
  });

  it("with no held list yet (card saved before any teaser), saves the card and delivers nothing", async () => {
    const a = await member("a@example.com", { teased: false });
    const sid = await savedCard(a);
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, free_lists_used: 0 });
    expect(sent).toHaveLength(0);
    const r = await finishCardSave(query, gw, sid, opts({ expectUserId: a }));
    expect(r).toEqual({ outcome: "done", week: null, promoRefused: false });
    expect(cardSavePath(r)).toBe("/app?card=waiting");
  });

  it("a card saved Monday between Cora's pick and the 7:00 send unlocks this week's list at once; the send then sends nothing more", async () => {
    const a = await member("a@example.com");
    await coraWeek(PREV);
    await picked(a, PREV, { superseded: "2026-12-14T06:05:00Z" });
    await coraWeek(WEEK, "ready");
    await picked(a, WEEK, { offset: 3 });
    const fiveAm = new Date("2026-12-14T10:00:00Z");
    const sid = await savedCard(a);
    expect(await completeCardSetup(query, gw, sid, opts({ now: fiveAm }))).toBe("done");
    expect(await deliveredIn(a, WEEK)).toBe(3);
    expect(await deliveredIn(a, PREV)).toBe(0);
    await runSendJob(query, { settings, now: new Date("2026-12-14T12:05:00Z"), gw: billing, query, transport, sleep: async () => {} }, { week: WEEK });
    expect(sent.filter((m) => m.to[0] === "a@example.com").map((m) => m.subject)).toEqual([LIST_SUBJECT]);
    expect(await userRow(a)).toMatchObject({ free_lists_used: 1 });
  });

  it("while Cora is still picking a newer week, delivers nothing; once that week is ready the Monday send delivers it as free list 1", async () => {
    const H = "worker-1";
    const a = await member("a@example.com");
    await query("delete from cora_weeks where week_of = $1", [WEEK]);
    await coraWeek(PREV);
    await picked(a, PREV);
    await query("insert into cora_weeks (week_of, status, phase, holder, lease_until) values ($1, 'running', 'picked', $2, now() + interval '5 minutes')", [WEEK, H]);
    const picksJson = JSON.stringify([0, 1, 2].map((i) => ({ position: i + 1, id: plays[i], personal: 70, fit: 3, reason: REASON })));
    await query(RECORD_PICKS_SQL, [a, WEEK, "picked", 6, 3, "", false, picksJson, H]);

    const sid = await savedCard(a);
    const halfPast = new Date("2026-12-14T05:30:00Z");
    expect(await completeCardSetup(query, gw, sid, opts({ now: halfPast }))).toBe("done");
    expect(await deliveredIn(a, PREV)).toBe(0);
    expect(sent).toHaveLength(0);
    expect(cardSavePath(await finishCardSave(query, gw, sid, opts({ expectUserId: a, now: halfPast })))).toBe("/app?card=waiting");

    await query(SUPERSEDE_AT_READY_SQL, [WEEK, H, "2026-12-14T06:05:00Z"]);
    await runSendJob(query, { settings, now: new Date("2026-12-14T12:05:00Z"), gw: billing, query, transport, sleep: async () => {} }, { week: WEEK });
    expect(await deliveredIn(a, PREV)).toBe(0);
    expect(await deliveredIn(a, WEEK)).toBe(3);
    expect(await userRow(a)).toMatchObject({ free_lists_used: 1 });
    expect(sent.map((m) => m.subject)).toEqual([LIST_SUBJECT]);
    expect(sent[0].text).toContain("Free list 1 of 2");
  });

  it("a replay after the member changed card through Update card leaves the new default card alone (card and tax steps run only before the save)", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    await completeCardSetup(query, gw, sid, opts());
    const [{ stripe_customer }] = await query<{ stripe_customer: string }>("select stripe_customer from users where id = $1", [a]);
    gw.defaults.set(stripe_customer, "pm_new_card");
    let taxChecks = 0;
    const counting = { ...gw, checkTaxLocation: async () => (taxChecks++, "ok" as const) };
    expect(await completeCardSetup(query, counting, sid, opts())).toBe("done");
    expect(gw.defaults.get(stripe_customer)).toBe("pm_new_card");
    expect(taxChecks).toBe(0);
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT });
  });

  it("an address Stripe cannot place for tax leaves the card unsaved, delivers nothing and keeps the pending code", async () => {
    gw = fakeGateway("invalid");
    const a = await member("a@example.com");
    await picked(a);
    const f = gw.payment.addPromotion({ code: "WELCOME20" });
    await setPendingPromo(query, a, { code: "WELCOME20", couponId: f.coupon!.id, label: "Welcome" });
    const sid = await savedCard(a);
    const r = await finishCardSave(query, gw, sid, opts({ expectUserId: a }));
    expect(cardSavePath(r)).toBe("/start/payment?error=address");
    expect(await userRow(a)).toMatchObject({ trial_started_at: null, free_lists_used: 0, promo_code: "WELCOME20" });
    expect(await deliveredIn(a, WEEK)).toBe(0);
    expect(await reservations()).toEqual([]);
    expect(sent).toHaveLength(0);
    // The used-up session is no longer stored, so it is refused from now on (the webhook's copy too).
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("not_yours");
  });

  it("after an address Stripe cannot place, Payment opens a fresh session, and the card saved on it unlocks the list", async () => {
    gw = fakeGateway("invalid");
    const a = await member("a@example.com");
    await picked(a);
    const first = await savedCard(a);
    expect(await completeCardSetup(query, gw, first, opts({ expectUserId: a }))).toBe("address_invalid");
    expect((await query<{ setup_session: string | null }>("select setup_session from users where id = $1", [a]))[0].setup_session).toBeNull();
    // Back on Payment: not "complete" for ever, but a new, usable session.
    const again = await openEmbeddedSetup(query, gw, { userId: a, ip: "203.0.113.9", returnUrl: "https://x" });
    expect(again).toMatchObject({ ok: true, reused: false });
    if (!again.ok) throw new Error("no session");
    expect(again.sessionId).not.toBe(first);
    gw.setTax("ok");
    gw.complete(again.sessionId);
    expect(await finishCardSave(query, gw, again.sessionId, opts({ expectUserId: a }))).toEqual({ outcome: "done", week: WEEK, promoRefused: false });
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, free_lists_used: 1 });
    expect(lists("a@example.com")).toHaveLength(1);
  });
});

describe("ownership", () => {
  it("a session of another member changes nothing (the signed-in user is checked)", async () => {
    const a = await member("a@example.com");
    const b = await member("b@example.com");
    await picked(a);
    const sid = await savedCard(a);
    expect(await completeCardSetup(query, gw, sid, opts({ expectUserId: b }))).toBe("not_yours");
    expect(await userRow(a)).toMatchObject({ trial_started_at: null });
    expect(cardSavePath(await finishCardSave(query, gw, sid, opts({ expectUserId: b })))).toBe("/start/payment");
  });

  it("a complete session that is not the stored one is refused", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    await query("update users set setup_session = 'cs_newer' where id = $1", [a]);
    expect(await completeCardSetup(query, gw, sid, opts({ expectUserId: a }))).toBe("not_yours");
    expect(await userRow(a)).toMatchObject({ trial_started_at: null });
    expect(await deliveredIn(a, WEEK)).toBe(0);
    expect(gw.defaults.size).toBe(0);
  });

  it("a session whose metadata names no user, or another one, is refused", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    gw.sessions.set(sid, { ...gw.sessions.get(sid)!, userId: null });
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("not_yours");
    expect(await userRow(a)).toMatchObject({ trial_started_at: null });
  });

  it("an Update card session can never unlock a held list, even if it were stored", async () => {
    const a = await member("a@example.com");
    await picked(a);
    await savedCard(a); // the customer exists
    const [{ stripe_customer }] = await query<{ stripe_customer: string }>("select stripe_customer from users where id = $1", [a]);
    const upd = await gw.createSetupSession({ userId: a, customer: stripe_customer, currency: "CAD", successUrl: "https://x/ok", cancelUrl: "https://x/no", purpose: "card_update" });
    await query("update users set setup_session = $2 where id = $1", [a, upd.id]);
    gw.complete(upd.id);
    expect(await completeCardSetup(query, gw, upd.id, opts({ expectUserId: a }))).toBe("not_yours");
    expect(await userRow(a)).toMatchObject({ trial_started_at: null });
    expect(await deliveredIn(a, WEEK)).toBe(0);
  });

  it("a closed account saves nothing", async () => {
    const a = await member("a@example.com");
    const sid = await savedCard(a);
    await query("update users set status = 'closed' where id = $1", [a]);
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("closed");
    expect(gw.defaults.size).toBe(0);
  });

  it.each([
    ["closed", "closed"],
    ["cancelled", "closed"],
    ["active", "closed"],
    ["signup without consent", "not_consented"],
  ] as const)("the account state is checked before any Stripe side effect: %s → %s", async (state, outcome) => {
    const a = await member("a@example.com");
    const sid = await savedCard(a);
    if (state === "signup without consent") await query("update users set status = 'signup', consent_at = null where id = $1", [a]);
    else await query("update users set status = $2 where id = $1", [a, state]);
    const calls: string[] = [];
    const watched = {
      ...gw,
      setDefaultCard: async (c: string, pm: string) => void calls.push(`default ${c} ${pm}`),
      checkTaxLocation: async () => (calls.push("tax"), "ok" as const),
    };
    expect(await completeCardSetup(query, watched, sid, opts())).toBe(outcome);
    expect(calls).toEqual([]);
    expect(await userRow(a)).toMatchObject({ trial_started_at: null });
  });

  it("once the card is saved, the member's own earlier session still finishes the unlock after a newer session was stored", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    failing = true;
    await expect(completeCardSetup(query, gw, sid, opts())).rejects.toBeInstanceOf(UnlockEmailNotSent);
    failing = false;
    await query("update users set setup_session = 'cs_newer' where id = $1", [a]);
    // The webhook's retry for the old session: customer and metadata are the member's, so the unlock runs.
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(lists("a@example.com")).toHaveLength(1);
    // The return page for the old session lands on the week, not back on Payment.
    expect(await finishCardSave(query, gw, sid, opts({ expectUserId: a }))).toEqual({ outcome: "done", week: WEEK, promoRefused: false });
    // Still never another member's, and never a card update.
    const b = await member("b@example.com");
    expect(await completeCardSetup(query, gw, sid, opts({ expectUserId: b }))).toBe("not_yours");
    gw.sessions.set(sid, { ...gw.sessions.get(sid)!, userId: b });
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("not_yours");
    gw.sessions.set(sid, { ...gw.sessions.get(sid)!, userId: a, purpose: "card_update" });
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("not_yours");
  });

  it("a saved card's unlock still runs from the return page when the email failed and no webhook came", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    failing = true;
    await completeCardSetup(query, gw, sid, opts()).catch(() => {});
    failing = false;
    expect(await finishCardSave(query, gw, "cs_anything", opts({ expectUserId: a }))).toEqual({ outcome: "done", week: WEEK, promoRefused: false });
    expect(lists("a@example.com")).toHaveLength(1);
  });

  it("a session not confirmed yet is pending", async () => {
    const a = await member("a@example.com");
    const r = await openEmbeddedSetup(query, gw, { userId: a, ip: "203.0.113.9", returnUrl: "https://x" });
    if (!r.ok) throw new Error("no session");
    expect(await completeCardSetup(query, gw, r.sessionId, opts())).toBe("pending");
    expect(cardSavePath(await finishCardSave(query, gw, r.sessionId, opts({ expectUserId: a })))).toBe("/start/payment/done");
  });
});

describe("the promo code locked in at card save", () => {
  async function pending(userId: string, code: string) {
    const f = gw.payment.promotions.get(code.toUpperCase())!;
    expect(await setPendingPromo(query, userId, { code, couponId: f.coupon!.id, label: `${code} label` })).toBe(true);
    return f;
  }

  it("keeps the coupon and label and writes the reservation (card fingerprint, job clock) in the same completion", async () => {
    gw.payment.addPromotion({ code: "WELCOME20" });
    const a = await member("a@example.com");
    await picked(a);
    const f = await pending(a, "WELCOME20");
    const sid = await savedCard(a, { fingerprint: "fp_visa_4242" });
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(await userRow(a)).toMatchObject({ promo_code: "WELCOME20", promo_coupon: f.coupon!.id, promo_label: "WELCOME20 label", promo_refused_at: null });
    expect(await reservations()).toEqual([{ promotion_code: f.promotionCodeId, user_id: a, card_fingerprint: "fp_visa_4242", reserved_at: NOW_TEXT, slot: null }]);
    expect(await finishCardSave(query, gw, sid, opts({ expectUserId: a }))).toMatchObject({ promoRefused: false });
  });

  it("a code whose uses are taken (two of two reserved by others) is refused: the card is saved at the regular price and the page says so", async () => {
    const f = gw.payment.addPromotion({ code: "LAST2", maxRedemptions: 2 });
    for (const [i, e] of ["x@example.com", "y@example.com"].entries()) {
      const id = await member(e);
      await query("insert into promo_reservations (promotion_code, user_id, reserved_at, slot) values ($1, $2, now(), $3)", [f.promotionCodeId, id, i + 1]);
    }
    const a = await member("a@example.com");
    await picked(a);
    await pending(a, "LAST2");
    const sid = await savedCard(a);
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, free_lists_used: 1, promo_code: null, promo_coupon: null, promo_label: null, promo_refused_at: NOW_TEXT });
    expect((await reservations()).filter((r) => r.user_id === a)).toEqual([]);
    const r = await finishCardSave(query, gw, sid, opts({ expectUserId: a }));
    expect(r).toEqual({ outcome: "done", week: WEEK, promoRefused: true });
    expect(cardSavePath(r)).toBe(`/app/week/${WEEK}?card=promo`);
  });

  it("counts Stripe's own redemptions with Roger's reservations", async () => {
    const f = gw.payment.addPromotion({ code: "LAST2", maxRedemptions: 2, timesRedeemed: 1 });
    const x = await member("x@example.com");
    await query("insert into promo_reservations (promotion_code, user_id, reserved_at, slot) values ($1, $2, now(), 1)", [f.promotionCodeId, x]);
    const a = await member("a@example.com");
    await pending(a, "LAST2");
    const sid = await savedCard(a);
    await completeCardSetup(query, gw, sid, opts());
    expect(await userRow(a)).toMatchObject({ promo_code: null, promo_refused_at: NOW_TEXT });
  });

  it("two members saving the last use at once: exactly one reservation, the other saved at the regular price", async () => {
    gw.payment.addPromotion({ code: "LAST1", maxRedemptions: 1 });
    const a = await member("a@example.com");
    const b = await member("b@example.com");
    await pending(a, "LAST1");
    await pending(b, "LAST1");
    const [sa, sb] = [await savedCard(a), await savedCard(b)];
    expect(await Promise.all([completeCardSetup(query, gw, sa, opts()), completeCardSetup(query, gw, sb, opts())])).toEqual(["done", "done"]);
    const rows = await reservations();
    expect(rows).toHaveLength(1);
    expect(rows[0].slot).toBe(1);
    const users = [await userRow(a), await userRow(b)];
    expect(users.every((u) => u.trial_started_at === NOW_TEXT)).toBe(true);
    expect(users.filter((u) => u.promo_code === "LAST1")).toHaveLength(1);
    expect(users.filter((u) => u.promo_refused_at === NOW_TEXT)).toHaveLength(1);
  });

  it("the slot unique index refuses a second reservation of the same slot (what the losing side of a real race hits)", async () => {
    const x = await member("x@example.com");
    const y = await member("y@example.com");
    await query("insert into promo_reservations (promotion_code, user_id, reserved_at, slot) values ('promo_l', $1, now(), 1)", [x]);
    await expect(query("insert into promo_reservations (promotion_code, user_id, reserved_at, slot) values ('promo_l', $1, now(), 1)", [y])).rejects.toThrow();
    // A code with no limit leaves the slot null, and nulls never conflict.
    await query("insert into promo_reservations (promotion_code, user_id, reserved_at) values ('promo_free', $1, now()), ('promo_free', $2, now())", [x, y]);
  });

  it("losing a slot race writes nothing and tries again with a fresh count", async () => {
    gw.payment.addPromotion({ code: "LAST2", maxRedemptions: 2 });
    const a = await member("a@example.com");
    await pending(a, "LAST2");
    const sid = await savedCard(a);
    let claims = 0;
    const racing: Query = async <T,>(text: string, params?: unknown[]) => {
      if (text === CARD_SAVE_CLAIM_SQL && claims++ === 0) return [{ verdict: "lost_race", saved: false }] as T[];
      return query<T>(text, params);
    };
    expect(await completeCardSetup(racing, gw, sid, opts())).toBe("done");
    expect(claims).toBe(2);
    expect(await reservations()).toHaveLength(1);
    expect(await userRow(a)).toMatchObject({ promo_code: "LAST2", trial_started_at: NOW_TEXT });
  });

  /**
   * A real lost race on the real claim: a trigger inserts a rival member's
   * reservation at the same slot from inside the claim's own insert, after the
   * claim's snapshot counted the others (what a concurrent member committing
   * in between looks like). The claim must answer lost_race and write nothing,
   * and its retry must count the rival.
   */
  async function rivalTakesSlotOnFirstClaim(rival: string): Promise<{ wrapped: Query; verdicts: string[] }> {
    const verdicts: string[] = [];
    let armed = false;
    const wrapped: Query = async <T,>(text: string, params?: unknown[]) => {
      if (text === CARD_SAVE_CLAIM_SQL && !armed) {
        armed = true;
        await query(`create or replace function rival_slot() returns trigger language plpgsql as $f$
          begin
            if new.user_id <> '${rival}'::uuid then
              insert into promo_reservations (promotion_code, user_id, reserved_at, slot) values (new.promotion_code, '${rival}'::uuid, now(), new.slot);
            end if;
            return new;
          end $f$`);
        await query("create trigger rival_slot before insert on promo_reservations for each row execute function rival_slot()");
        try {
          const rows = await query<T>(text, params);
          verdicts.push((rows[0] as { verdict: string }).verdict);
          return rows;
        } finally {
          await query("drop trigger rival_slot on promo_reservations");
        }
      }
      const rows = await query<T>(text, params);
      if (text === CARD_SAVE_CLAIM_SQL) verdicts.push((rows[0] as { verdict: string }).verdict);
      return rows;
    };
    return { wrapped, verdicts };
  }

  it.each([
    [1, "refused", null],
    [2, "reserved", 2],
  ] as const)("the real claim loses the last slot to a rival (limit %i): lost_race, then %s on the retry", async (limit, retry, ownSlot) => {
    const f = gw.payment.addPromotion({ code: "LAST", maxRedemptions: limit });
    const rival = await member("r@example.com");
    const a = await member("a@example.com");
    await pending(a, "LAST");
    const sid = await savedCard(a);
    const { wrapped, verdicts } = await rivalTakesSlotOnFirstClaim(rival);
    expect(await completeCardSetup(wrapped, gw, sid, opts())).toBe("done");
    expect(verdicts).toEqual(["lost_race", retry]);
    const rows = await reservations();
    expect(rows.map((r) => [r.user_id, r.slot])).toEqual(ownSlot ? [[rival, 1], [a, ownSlot]] : [[rival, 1]]);
    expect(new Set(rows.map((r) => r.slot)).size).toBe(rows.length);
    expect(rows.every((r) => r.promotion_code === f.promotionCodeId)).toBe(true);
    expect(await userRow(a)).toMatchObject(retry === "refused" ? { promo_code: null, promo_refused_at: NOW_TEXT } : { promo_code: "LAST", promo_refused_at: null });
  });

  it("when every claim attempt loses, it throws for a retry: the card is not saved and nothing is delivered", async () => {
    gw.payment.addPromotion({ code: "LAST2", maxRedemptions: 2 });
    const a = await member("a@example.com");
    await picked(a);
    await pending(a, "LAST2");
    const sid = await savedCard(a);
    let claims = 0;
    const losing: Query = async <T,>(text: string, params?: unknown[]) => {
      if (text === CARD_SAVE_CLAIM_SQL) return (claims++, [{ verdict: "lost_race", saved: false }] as T[]);
      return query<T>(text, params);
    };
    await expect(completeCardSetup(losing, gw, sid, opts())).rejects.toThrow(/kept losing/);
    expect(claims).toBe(3);
    expect(await userRow(a)).toMatchObject({ trial_started_at: null, free_lists_used: 0, promo_code: "LAST2" });
    expect(await deliveredIn(a, WEEK)).toBe(0);
    expect(sent).toHaveLength(0);
    // The return page reads it as our problem, not Stripe's.
    expect(await finishCardSave(losing, gw, sid, opts({ expectUserId: a }))).toEqual({ outcome: "pending", problem: true });
  });

  it.each(["paid before (first_charge_at)", "a charged order"] as const)("a first-time-only code is refused for a member who has %s", async (history) => {
    gw.payment.addPromotion({ code: "FIRST", firstTimeOnly: true });
    const a = await member("a@example.com");
    await pending(a, "FIRST");
    if (history === "a charged order") await query("insert into orders (user_id, week_of, status, amount_cents, currency) values ($1, '2026-11-02', 'charged', 20000, 'USD')", [a]);
    else await query("update users set first_charge_at = '2026-11-02T12:00:00Z' where id = $1", [a]);
    expect(await completeCardSetup(query, gw, await savedCard(a, { fingerprint: "fp_fresh" }), opts())).toBe("done");
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, promo_code: null, promo_refused_at: NOW_TEXT });
    expect(await reservations()).toEqual([]);
  });

  it("a first-time-only code is refused when the same card was used by another member", async () => {
    const f = gw.payment.addPromotion({ code: "FIRST", firstTimeOnly: true });
    const x = await member("x@example.com");
    await query("insert into promo_reservations (promotion_code, user_id, card_fingerprint, reserved_at) values ('promo_other', $1, 'fp_shared', now())", [x]);
    const a = await member("a@example.com");
    await pending(a, "FIRST");
    const sid = await savedCard(a, { fingerprint: "fp_shared" });
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, promo_code: null, promo_refused_at: NOW_TEXT });
    expect((await reservations()).map((r) => r.promotion_code)).toEqual(["promo_other"]);
    expect(f.firstTimeOnly).toBe(true);
  });

  it("a first-time-only code is refused when this member already holds a reservation, and allowed for a new card and person", async () => {
    gw.payment.addPromotion({ code: "FIRST", firstTimeOnly: true });
    const a = await member("a@example.com");
    await query("insert into promo_reservations (promotion_code, user_id, reserved_at) values ('promo_earlier', $1, now())", [a]);
    await pending(a, "FIRST");
    await completeCardSetup(query, gw, await savedCard(a), opts());
    expect(await userRow(a)).toMatchObject({ promo_code: null, promo_refused_at: NOW_TEXT });

    const b = await member("b@example.com");
    await pending(b, "FIRST");
    await completeCardSetup(query, gw, await savedCard(b, { fingerprint: "fp_new" }), opts());
    expect(await userRow(b)).toMatchObject({ promo_code: "FIRST", promo_refused_at: null });
  });

  it("a code Stripe no longer accepts (deactivated while the person was on the page) is refused", async () => {
    gw.payment.addPromotion({ code: "GONE" });
    const a = await member("a@example.com");
    await pending(a, "GONE");
    gw.payment.promotions.get("GONE")!.active = false;
    await completeCardSetup(query, gw, await savedCard(a), opts());
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, promo_code: null, promo_refused_at: NOW_TEXT });
    expect(await reservations()).toEqual([]);
  });

  it("the pending selection: chosen and removed only before the card is saved", async () => {
    gw.payment.addPromotion({ code: "WELCOME20" });
    const a = await member("a@example.com");
    const chosen = await choosePromoCode(query, gw, { userId: a, ip: "203.0.113.9", code: "welcome20", currency: "CAD" });
    expect(chosen.ok).toBe(true);
    expect(await userRow(a)).toMatchObject({ promo_code: "WELCOME20" });
    expect(await clearPendingPromo(query, a)).toBe(true);
    expect(await userRow(a)).toMatchObject({ promo_code: null, promo_coupon: null, promo_label: null });
    await query("update users set trial_started_at = now() where id = $1", [a]);
    expect(await setPendingPromo(query, a, { code: "WELCOME20", couponId: "c", label: "l" })).toBe(false);
    expect(await clearPendingPromo(query, a)).toBe(false);
    expect(await choosePromoCode(query, gw, { userId: a, ip: "203.0.113.9", code: "WELCOME20", currency: "CAD" })).toEqual({ ok: false, reason: "not_allowed" });
  });
});

describe("a list email that fails after the card is saved", () => {
  it("throws so Stripe retries; the next call sends exactly one list email", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    failing = true;
    await expect(completeCardSetup(query, gw, sid, opts())).rejects.toBeInstanceOf(UnlockEmailNotSent);
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, free_lists_used: 1 });
    expect(await deliveredIn(a, WEEK)).toBe(3);
    // The return page still lands on the list.
    expect(await finishCardSave(query, gw, sid, opts({ expectUserId: a }))).toEqual({ outcome: "done", week: WEEK, promoRefused: false });
    failing = false;
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(await completeCardSetup(query, gw, sid, opts())).toBe("done");
    expect(lists("a@example.com")).toHaveLength(1);
    expect(await userRow(a)).toMatchObject({ free_lists_used: 1 });
  });

  it("through the webhook: answered with an error, then handled on Stripe's retry with one email", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    const event = { id: "evt_save", type: "checkout.session.completed", data: { object: { id: sid, mode: "setup", ui_mode: "elements", metadata: { user_id: a } } } } as never;
    failing = true;
    await expect(handleStripeEvent(query, gw, event, opts())).rejects.toBeInstanceOf(UnlockEmailNotSent);
    expect(await query("select status from stripe_events where id = 'evt_save'")).toEqual([{ status: "failed" }]);
    failing = false;
    expect(await handleStripeEvent(query, gw, event, opts())).toBe("handled");
    expect(lists("a@example.com")).toHaveLength(1);
  });

  it("the hourly unlock_pending sweep sends it, once", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    failing = true;
    await completeCardSetup(query, gw, sid, opts()).catch(() => {});
    failing = false;
    const later = new Date("2026-12-16T16:00:00Z");
    // Only this task: deliver_late, earlier in the same pass, also retries a list email of the past 8 days.
    const only = HOURLY_TASKS.filter((t) => t.name === "unlock_pending");
    expect(only).toHaveLength(1);
    const pass = async () => (await runHourly(query, { gw: billing, settings, now: later, query, transport, sleep: async () => {} }, only))["unlock_pending"];
    expect(await pass()).toBe(1);
    expect(await pass()).toBe(0);
    expect(lists("a@example.com")).toHaveLength(1);
  });
});

describe("the webhook", () => {
  it("routes an embedded setup session's checkout.session.completed to the same completion; a replay is a no-op", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    const ev = (id: string) => ({ id, type: "checkout.session.completed", data: { object: { id: sid, mode: "setup", ui_mode: "elements", metadata: { user_id: a, currency: "CAD" } } } }) as never;
    expect(await handleStripeEvent(query, gw, ev("evt_1"), opts())).toBe("handled");
    expect(await userRow(a)).toMatchObject({ trial_started_at: NOW_TEXT, free_lists_used: 1 });
    expect(lists("a@example.com")).toHaveLength(1);
    // The same event again (Stripe's resend, or the reconcile's replay): already done.
    expect(await handleStripeEvent(query, gw, ev("evt_1"), opts())).toBe("duplicate");
    // A replay under another event id reaches the completion, which has nothing left to do.
    expect(await handleStripeEvent(query, gw, ev("evt_2"), opts())).toBe("handled");
    expect(lists("a@example.com")).toHaveLength(1);
    expect(await query("select id, status, error from stripe_events order by id")).toEqual([
      { id: "evt_1", status: "done", error: null },
      { id: "evt_2", status: "done", error: null },
    ]);
  });

  it("notes a refused session on the event and unlocks nothing", async () => {
    const a = await member("a@example.com");
    await picked(a);
    const sid = await savedCard(a);
    await query("update users set setup_session = 'cs_other' where id = $1", [a]);
    const ev = { id: "evt_x", type: "checkout.session.completed", data: { object: { id: sid, mode: "setup" } } } as never;
    expect(await handleStripeEvent(query, gw, ev, opts())).toBe("handled");
    expect(await query("select error from stripe_events where id = 'evt_x'")).toEqual([{ error: "not_yours" }]);
    expect(await deliveredIn(a, WEEK)).toBe(0);
  });
});

describe("the hourly unlock_pending sweep", () => {
  it("delivers a saved card's held list whose unlock never ran (a closed return page and a webhook that never came)", async () => {
    const a = await member("a@example.com");
    await picked(a);
    await query("update users set trial_started_at = $2 where id = $1", [a, NOW.toISOString()]);
    const d = { settings, now: new Date("2026-12-16T16:00:00Z"), query, transport, sleep: async () => {} };
    expect(await sendPendingUnlocks(query, d)).toBe(1);
    expect(await sendPendingUnlocks(query, d)).toBe(0);
    expect(await deliveredIn(a, WEEK)).toBe(3);
    expect(await userRow(a)).toMatchObject({ free_lists_used: 1 });
    expect(lists("a@example.com")).toHaveLength(1);
  });

  it("in the full hourly pass, unlocks a held list older than 8 days that deliver_late never looks at", async () => {
    const OLD = "2026-11-30";
    const a = await member("a@example.com");
    await coraWeek(OLD);
    await picked(a, OLD);
    await query("update users set trial_started_at = $2 where id = $1", [a, NOW.toISOString()]);
    const out = await runHourly(query, { gw: billing, settings, now: new Date("2026-12-16T16:00:00Z"), query, transport, sleep: async () => {} });
    expect(out).toMatchObject({ deliver_late: 0, unlock_pending: 1 });
    expect(await deliveredIn(a, OLD)).toBe(3);
    expect(sent.filter((m) => m.subject === "Your three ideas for the week of Monday, November 30")).toHaveLength(1);
  });

  it("leaves alone a no-card trial, a superseded week, and a member whose first list and its email are done", async () => {
    const noCard = await member("n@example.com");
    await picked(noCard);
    const old = await member("o@example.com");
    await coraWeek(PREV);
    await picked(old, PREV, { superseded: "2026-12-14T06:05:00Z" });
    await query("update users set trial_started_at = $2 where id = $1", [old, NOW.toISOString()]);
    const done = await member("d@example.com");
    await picked(done);
    await query("update users set trial_started_at = $2 where id = $1", [done, NOW.toISOString()]);
    await query("update picks set delivered_at = $2 where user_id = $1", [done, NOW.toISOString()]);
    await query("update cora_user_weeks set delivered_at = $2 where user_id = $1", [done, NOW.toISOString()]);
    await query("insert into notifications (recipient, kind, ref, status, attempts) values ($1, 'monday_list', $2, 'sent', 1)", [done, WEEK]);
    expect(await sendPendingUnlocks(query, { settings, now: NOW, query, transport, sleep: async () => {} })).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("also unlocks a card saved before any teaser went out (first_teaser_at null) whose first list is held", async () => {
    const early = await member("e@example.com", { teased: false });
    await query("update users set trial_started_at = '2026-12-01T15:00:00Z' where id = $1", [early]);
    await picked(early);
    expect(await sendPendingUnlocks(query, { settings, now: NOW, query, transport, sleep: async () => {} })).toBe(1);
    expect(await deliveredIn(early, WEEK)).toBe(3);
    expect(lists("e@example.com")).toHaveLength(1);
  });

  it("a first list sent as a one-list order's receipt counts as its email (nothing sent again)", async () => {
    const a = await member("a@example.com");
    await picked(a);
    await query("update users set trial_started_at = $2 where id = $1", [a, NOW.toISOString()]);
    await query("update picks set delivered_at = $2 where user_id = $1", [a, NOW.toISOString()]);
    await query("update cora_user_weeks set delivered_at = $2 where user_id = $1", [a, NOW.toISOString()]);
    await query("insert into notifications (recipient, kind, ref, status, attempts) values ($1, 'order_receipt', $2, 'sent', 1)", [a, WEEK]);
    expect(await sendPendingUnlocks(query, { settings, now: NOW, query, transport, sleep: async () => {} })).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("the email is still owed when the list was delivered on an earlier clock than the card's stamp (clocks are not compared)", async () => {
    const a = await member("a@example.com");
    await picked(a);
    // Delivered by a job whose clock reads earlier than the card-save caller's clock.
    await query("update users set trial_started_at = $2 where id = $1", [a, NOW.toISOString()]);
    await query("update picks set delivered_at = '2026-12-16T14:00:00Z' where user_id = $1", [a]);
    await query("update cora_user_weeks set delivered_at = '2026-12-16T14:00:00Z' where user_id = $1", [a]);
    await query("insert into notifications (recipient, kind, ref, status, attempts) values ($1, 'monday_list', $2, 'failed', 1)", [a, WEEK]);
    expect(await unlockWeek(query, a, NOW)).toEqual({ week: WEEK, delivered: true });
    expect(await sendPendingUnlocks(query, { settings, now: new Date("2026-12-16T16:00:00Z"), query, transport, sleep: async () => {} })).toBe(1);
    expect(lists("a@example.com")).toHaveLength(1);
    expect(await unlockWeek(query, a, NOW)).toBeNull();
  });

  it("members whose unlock keeps failing cannot starve the rest: a healthy member is unlocked by the next pass", async () => {
    const stuck: string[] = [];
    for (let i = 0; i < MAX_UNLOCKS + 1; i++) {
      const id = await member(`s${i}@example.com`);
      await picked(id);
      // Saved earlier than the healthy member, so the old order (by card time) put them all first.
      await query("update users set trial_started_at = $2 where id = $1", [id, new Date(NOW.getTime() - (MAX_UNLOCKS + 2 - i) * 60_000).toISOString()]);
      stuck.push(id);
    }
    const healthy = await member("h@example.com");
    await picked(healthy);
    await query("update users set trial_started_at = $2 where id = $1", [healthy, NOW.toISOString()]);
    failingTo = (to) => to.startsWith("s");
    const d = (now: Date) => ({ settings, now, query, transport, sleep: async () => {} });

    const first = new Date("2026-12-16T16:00:00Z");
    expect(await sendPendingUnlocks(query, d(first))).toBe(0);
    const tried = await query<{ n: number }>("select count(*)::int as n from users where unlock_attempted_at = $1", [first.toISOString()]);
    expect(tried[0].n).toBe(MAX_UNLOCKS);
    expect(lists("h@example.com")).toHaveLength(0);
    // A re-run within the cool-down tries only the members not tried yet.
    expect(await sendPendingUnlocks(query, d(new Date("2026-12-16T16:10:00Z")))).toBe(1);
    expect(lists("h@example.com")).toHaveLength(1);
    expect(await deliveredIn(healthy, WEEK)).toBe(3);
    const retried = await query<{ n: number }>("select count(*)::int as n from users where unlock_attempted_at = '2026-12-16T16:10:00Z'");
    expect(retried[0].n).toBe(2);
  });

  it("the next hourly pass takes members never tried before those tried longest ago", async () => {
    const stuck: string[] = [];
    for (let i = 0; i < MAX_UNLOCKS + 1; i++) {
      const id = await member(`s${i}@example.com`);
      await picked(id);
      await query("update users set trial_started_at = $2 where id = $1", [id, new Date(NOW.getTime() - (MAX_UNLOCKS + 2 - i) * 60_000).toISOString()]);
      stuck.push(id);
    }
    failingTo = (to) => to.startsWith("s");
    const d = (now: Date) => ({ settings, now, query, transport, sleep: async () => {} });
    await sendPendingUnlocks(query, d(new Date("2026-12-16T16:00:00Z")));
    const healthy = await member("h@example.com");
    await picked(healthy);
    await query("update users set trial_started_at = $2 where id = $1", [healthy, NOW.toISOString()]);
    expect(await sendPendingUnlocks(query, d(new Date("2026-12-16T17:00:00Z")))).toBe(1);
    expect(lists("h@example.com")).toHaveLength(1);
    // The stuck member never tried went first too, then those tried longest ago.
    const [last] = await query<{ unlock_attempted_at: string }>("select unlock_attempted_at::text from users where id = $1", [stuck[MAX_UNLOCKS]]);
    expect(last.unlock_attempted_at).toBe("2026-12-16 17:00:00+00");
  });
});
