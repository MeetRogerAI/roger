import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * Plan 2026-11-26-001, Unit 6: the Payment page's server actions. Each one
 * guards itself (signed in, trial, no card, a held list) and works out every
 * amount on the server.
 */

const db: { query: Query | null; userId: string | null; gw: ReturnType<typeof fakeGateway> | null } = { query: null, userId: null, gw: null };
const sent: Parameters<Transport>[0][] = [];
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("@/lib/auth/access", () => ({ getSession: async () => (db.userId ? { userId: db.userId } : null) }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/billing/gateway", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/gateway")>()), stripeGateway: () => db.gw }));
vi.mock("@/lib/v3-settings-display", async () => {
  const m = await import("@/lib/v3-settings");
  return { getV3SettingsForDisplay: async () => m.mergeV3([]) };
});
vi.mock("@/lib/v3-settings", async (orig) => {
  const m = await orig<typeof import("@/lib/v3-settings")>();
  return { ...m, readV3Settings: async () => m.mergeV3([]) };
});
vi.mock("@/lib/mail/send", async (orig) => {
  const m = await orig<typeof import("@/lib/mail/send")>();
  const transport: Transport = async (msg) => {
    sent.push(msg);
    return { ok: true };
  };
  return { ...m, sendToUser: (u: Parameters<typeof m.sendToUser>[0], k: string, r: string, msg: Parameters<typeof m.sendToUser>[3], d: Parameters<typeof m.sendToUser>[4] = {}) => m.sendToUser(u, k, r, msg, { ...d, query: db.query!, transport, sleep: async () => {} }) };
});

const actions = await import("./actions");
const { openEmbeddedSetup } = await import("@/lib/billing/card-setup");
const { PROMO_INVALID } = await import("@/lib/billing/promo");
const { PROMO_GONE } = await import("@/lib/billing/payment-page");
const { TAX_UNAVAILABLE } = await import("@/lib/billing/payment-view");
const WEEK = "2026-12-14";
const RETURN = "https://roger.test/start/payment/done?session_id={CHECKOUT_SESSION_ID}";

async function makeUser(o: { email?: string; status?: string; card?: boolean; held?: boolean; currency?: string } = {}) {
  const q = db.query!;
  const [u] = await q<{ id: string }>(
    `insert into users (email, name, status, plan, currency, consent_at, signup_step, first_teaser_at, trial_started_at)
     values ($1, 'Ana', $2, 'monthly', $3, now(), 'done', now(), $4) returning id`,
    [o.email ?? "a@example.com", o.status ?? "trial", o.currency ?? "CAD", o.card ? new Date().toISOString() : null],
  );
  if (o.held !== false) {
    await q("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready') on conflict do nothing", [WEEK]);
    await q("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [u.id, WEEK]);
    for (const [i, t] of ["Inbox triage", "Listing post", "Calendar prep"].entries()) {
      const [p] = await q<{ id: string }>(
        `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures) values ($1, 'Sales', 'D.', '1. S.', 'I.', $2, $2, '{}') returning id`,
        [`${t} ${u.id.slice(0, 4)}`, WEEK],
      );
      await q("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, 'Fits.')", [u.id, WEEK, i + 1, p.id]);
    }
  }
  return u.id;
}

const snapshot = async () =>
  JSON.stringify(await db.query!(`select id, status, currency, setup_session, promo_code, promo_coupon, trial_started_at, stripe_customer from users order by id`));

beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  db.gw = fakeGateway();
  sent.length = 0;
  resetNextFakes({}, { "x-vercel-forwarded-for": "203.0.113.9" });
  db.userId = await makeUser();
});

/** Every action, called directly as a client could. */
const everyAction = () => ({
  setPaymentCurrency: () => actions.setPaymentCurrency("USD", { country: "CA", postal: "M5V 2T6" }),
  quoteTax: () => actions.quoteTax("CA", "M5V 2T6"),
  applyPromo: () => actions.applyPromo("SAVE20"),
  removePromo: () => actions.removePromo(),
  openSession: () => actions.openSession(),
});

describe("the shared guard", () => {
  const cases: [string, () => Promise<void>][] = [
    ["signed out", async () => void (db.userId = null)],
    ["a card already saved", async () => void (await db.query!(`update users set trial_started_at = now()`))],
    ["a closed account", async () => void (await db.query!(`update users set status = 'closed'`))],
    ["no held list yet", async () => void (await db.query!(`delete from picks`), await db.query!(`delete from cora_user_weeks`))],
    ["a sponsored member", async () => void (await db.query!(`update users set sponsor_id = id`))],
  ];
  for (const [name, setup] of cases) {
    it(`refuses every action for ${name}, with no database or Stripe change`, async () => {
      db.gw!.payment.addPromotion({ code: "SAVE20" });
      await setup();
      const before = await snapshot();
      for (const [action, call] of Object.entries(everyAction())) {
        const r = await call();
        expect(r, action).toMatchObject({ ok: false });
        expect((r as { message: string }).message, action).toBeTruthy();
      }
      expect(await snapshot()).toBe(before);
      expect(db.gw!.sessions.size).toBe(0);
      expect(db.gw!.customersCreated()).toBe(0);
      expect(db.gw!.payment.previews).toHaveLength(0);
      expect(await db.query!(`select * from rate_events`)).toHaveLength(0);
    });
  }

  it("refuses a currency that is not USD or CAD before reading anything", async () => {
    expect(await actions.setPaymentCurrency("EUR")).toEqual({ ok: false, message: "Choose US or Canadian dollars." });
    expect(db.gw!.sessions.size).toBe(0);
  });
});

describe("quoteTax", () => {
  it("shows HST from an Ontario postal code, worked out on the server, and serves repeats from the cache", async () => {
    const r = await actions.quoteTax("ca", "m5v2t6");
    expect(r).toMatchObject({ ok: true, price: { currency: "CAD", subtotalCents: 28000, tax: "calculated", taxName: "HST", taxRate: 13, taxCents: 3640, totalCents: 31640 } });
    const n = db.gw!.payment.previews.length;
    await actions.quoteTax("CA", "M5V 2T6");
    expect(db.gw!.payment.previews.length).toBe(n);
  });

  it("makes no Stripe call for a malformed postal code or another country; the tax stays to come", async () => {
    for (const [c, p] of [["CA", "12345"], ["US", "1000"], ["GB", "SW1A 1AA"]]) {
      const r = await actions.quoteTax(c, p);
      expect(r).toMatchObject({ ok: true, price: { tax: "pending", subtotalCents: 28000, totalCents: 28000 } });
    }
    expect(db.gw!.payment.previews).toHaveLength(0);
  });

  it("when Stripe cannot work out the tax, says it will be added and asks the page to try again later", async () => {
    db.gw!.previewMonthly = async () => {
      throw new Error("Stripe is down");
    };
    // A postal code no other test asks for (answers are cached across tests).
    const r = await actions.quoteTax("CA", "H2X 1Y4");
    expect(r).toEqual({ ok: true, price: expect.objectContaining({ tax: "pending", totalCents: 28000 }), notice: TAX_UNAVAILABLE, taxRetry: true });
  });

  it("refuses past the hourly limit; cached answers are not counted", async () => {
    const codes = Array.from({ length: 41 }, (_, i) => `K1A ${i % 10}${"ABCEGHJKLM"[Math.floor(i / 10)]}${i % 10}`);
    for (const c of codes.slice(0, 40)) expect(await actions.quoteTax("CA", c), c).toMatchObject({ ok: true, price: { tax: "calculated" } });
    // A repeat is a cache hit: still answered.
    expect(await actions.quoteTax("CA", codes[0])).toMatchObject({ ok: true });
    expect(await actions.quoteTax("CA", codes[40])).toEqual({ ok: false, message: "Too many tries. Wait a while and try again." });
  });
});

describe("setPaymentCurrency", () => {
  it("switches CAD to USD: the same card session is kept (the card form does not reload), the account currency saved and every line in USD", async () => {
    const first = await openEmbeddedSetup(db.query!, db.gw!, { userId: db.userId!, ip: "203.0.113.9", returnUrl: RETURN });
    if (!first.ok) throw new Error(first.reason);
    const create = vi.spyOn(db.gw!, "createEmbeddedSetupSession");
    const r = await actions.setPaymentCurrency("USD", { country: "US", postal: "10001" });
    if (!r.ok) throw new Error(r.message);
    expect(r.currency).toBe("USD");
    expect(r).toMatchObject({ sessionId: first.sessionId, clientSecret: first.clientSecret });
    expect(create).not.toHaveBeenCalled();
    expect(db.gw!.sessions.get(first.sessionId)!.status).toBe("open");
    expect(r.price).toMatchObject({ currency: "USD", subtotalCents: 20000, totalCents: 20000, tax: "calculated" });
    const [u] = await db.query!<{ currency: string; setup_session: string }>(`select currency, setup_session from users`);
    expect(u).toEqual({ currency: "USD", setup_session: first.sessionId });
  });

  it("switching back and forth many times never hits the card-session limit (the old 'Too many tries')", async () => {
    const first = await openEmbeddedSetup(db.query!, db.gw!, { userId: db.userId!, ip: "203.0.113.9", returnUrl: RETURN });
    if (!first.ok) throw new Error(first.reason);
    for (let i = 0; i < 12; i++) {
      const r = await actions.setPaymentCurrency(i % 2 ? "CAD" : "USD");
      expect(r).toMatchObject({ ok: true, currency: i % 2 ? "CAD" : "USD", sessionId: first.sessionId });
    }
  });

  it("without a location shows the plan price in the new currency, tax to come", async () => {
    const r = await actions.setPaymentCurrency("USD");
    expect(r).toMatchObject({ ok: true, currency: "USD", price: { subtotalCents: 20000, tax: "pending" } });
  });

  it("when no card session can be opened, still changes the currency, answers with the account's currency and price as stored, and a retry opens", async () => {
    const create = db.gw!.createEmbeddedSetupSession;
    db.gw!.createEmbeddedSetupSession = async () => {
      throw new Error("Stripe is down");
    };
    const r = await actions.setPaymentCurrency("USD", { country: "US", postal: "10001" });
    expect(r).toMatchObject({ ok: false, message: "We couldn’t open the card form. Try again in a moment.", current: { ok: true, currency: "USD", price: { currency: "USD", subtotalCents: 20000 } } });
    const [u] = await db.query!<{ currency: string }>(`select currency from users`);
    expect(u.currency).toBe("USD");

    db.gw!.createEmbeddedSetupSession = create;
    const again = await actions.openSession({ country: "US", postal: "10001" });
    expect(again).toMatchObject({ ok: true, currency: "USD", price: { currency: "USD", subtotalCents: 20000, tax: "calculated" } });
    if (!again.ok) throw new Error(again.message);
    expect(db.gw!.sessions.get(again.sessionId)).toMatchObject({ currency: "USD" });
  });

  it("drops a pending code that does not apply in the new currency and says so, even without a location", async () => {
    db.gw!.payment.addPromotion({ code: "TENCAD", coupon: { amountOff: { cad: 1000 }, percentOff: null } });
    expect(await actions.applyPromo("TENCAD")).toMatchObject({ ok: true, promo: { code: "TENCAD" } });
    const r = await actions.setPaymentCurrency("USD");
    expect(r).toMatchObject({ ok: true, currency: "USD", promo: null, notice: PROMO_GONE, price: { currency: "USD", discountCents: 0, totalCents: 20000 } });
    expect(await db.query!(`select promo_code, promo_coupon from users`)).toEqual([{ promo_code: null, promo_coupon: null }]);
  });

  it("finishes the card save instead when the stored session completed meanwhile", async () => {
    const first = await openEmbeddedSetup(db.query!, db.gw!, { userId: db.userId!, ip: "203.0.113.9", returnUrl: RETURN });
    if (!first.ok) throw new Error(first.reason);
    db.gw!.complete(first.sessionId);
    expect(await outcome(() => actions.setPaymentCurrency("USD"))).toEqual({ redirect: `/app/week/${WEEK}?card=saved` });
    const [u] = await db.query!<{ currency: string; saved: boolean }>(`select currency, trial_started_at is not null as saved from users`);
    expect(u).toEqual({ currency: "CAD", saved: true });
  });
});

describe("applyPromo / removePromo", () => {
  it("applies a valid code: stored as pending, a discount line and a lower total; Remove goes back to the full price", async () => {
    db.gw!.payment.addPromotion({ code: "SAVE20" });
    const r = await actions.applyPromo("save20", { country: "CA", postal: "M5V 2T6" });
    expect(r).toMatchObject({ ok: true, promo: { code: "SAVE20", duration: "once", percentOff: 20 }, price: { discountCents: 5600, taxCents: 2912, totalCents: 25312 } });
    const [u] = await db.query!<{ promo_code: string | null; promo_coupon: string | null }>(`select promo_code, promo_coupon from users`);
    expect(u.promo_code).toBe("SAVE20");
    expect(u.promo_coupon).toBeTruthy();

    // Without a location the discount still shows, from the code's own terms.
    expect(await actions.applyPromo("SAVE20")).toMatchObject({ ok: true, price: { subtotalCents: 28000, discountCents: 5600, totalCents: 22400, tax: "pending" } });

    const off = await actions.removePromo({ country: "CA", postal: "M5V 2T6" });
    expect(off).toMatchObject({ ok: true, promo: null, price: { discountCents: 0, totalCents: 31640 } });
    expect(await db.query!(`select promo_code, promo_coupon, promo_label from users`)).toEqual([{ promo_code: null, promo_coupon: null, promo_label: null }]);
  });

  it("refuses an unknown code with the generic message and stores nothing", async () => {
    expect(await actions.applyPromo("NOPE")).toEqual({ ok: false, message: PROMO_INVALID });
    expect(await actions.applyPromo("   ")).toEqual({ ok: false, message: "Enter a code." });
    expect(await db.query!(`select promo_code from users`)).toEqual([{ promo_code: null }]);
  });

  it("the tax line drops a pending code whose coupon Stripe no longer accepts, and says so", async () => {
    const f = db.gw!.payment.addPromotion({ code: "GONE" });
    expect(await actions.applyPromo("GONE")).toMatchObject({ ok: true });
    db.gw!.payment.coupons.delete(f.coupon!.id);
    const r = await actions.quoteTax("CA", "M5V 2T6");
    expect(r).toMatchObject({ ok: true, promo: null, price: { discountCents: 0, totalCents: 31640 } });
    expect((r as { notice?: string }).notice).toMatch(/no longer applies/);
    expect(await db.query!(`select promo_code from users`)).toEqual([{ promo_code: null }]);
  });
});

describe("openSession", () => {
  it("hands back the stored open session (no second session for a reload or retry)", async () => {
    const a = await actions.openSession();
    const b = await actions.openSession();
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);
    expect(db.gw!.sessions.size).toBe(1);
  });

  it("finishes the card save when the stored session already holds a confirmed card", async () => {
    const a = await actions.openSession();
    if (!a.ok) throw new Error(a.message);
    db.gw!.complete(a.sessionId);
    expect(await outcome(() => actions.openSession())).toEqual({ redirect: `/app/week/${WEEK}?card=saved` });
    expect(sent.map((m) => m.subject)).toEqual(["Your three ideas for the week of Monday, December 14"]);
  });
});
