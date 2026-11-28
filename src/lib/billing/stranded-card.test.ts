import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeAccount } from "@/lib/admin/users";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeAdjustments } from "@/test-helpers/fake-adjustments";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import { cancelPlan, type PlanDeps } from "./cancel";
import { completeCardSetup, completeCardUpdate, openEmbeddedSetup } from "./card-setup";
import { dueRetries, type ChargeDeps } from "./first-charge";
import type { BillingGateway } from "./subscriptions";
import { handleStripeEvent } from "./webhook";

/**
 * Whole-branch review of plan 2026-11-26-001: a card confirmed in Stripe on an
 * account that has ended for good is never left on the Stripe customer (W3,
 * W4), a card update records the card's fingerprint (W7), and one failing
 * member never blocks the first-charge retries of the others (W6).
 */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const getSettings = async () => settings;
/** Saturday 2026-12-12, 10:00 AM Toronto. */
const NOW = new Date("2026-12-12T15:00:00Z");
const ADMIN = "admin@example.com";
const billing: BillingGateway = {
  preview: async () => ({ totalCents: 22600, currency: "USD" }),
  subscriptions: async () => [],
  createSubscription: async () => ({ kind: "error", error: "unused" }),
};
let card: ReturnType<typeof fakeGateway>;
let plans: ReturnType<typeof fakePlans>;
const mail = () => ({ query, transport, sleep: async () => {} });
const complete = (sid: string) => completeCardSetup(query, card, sid, { getSettings, now: NOW, ...mail() });
const alerts = () => sent.filter((m) => m.subject === "[Roger] A card was confirmed on an account that has ended");
const row = async (id: string) =>
  (
    await query<{ status: string; trial_started_at: string | null; setup_session: string | null; cards_removed_at: string | null }>(
      "select status, trial_started_at::text, setup_session, cards_removed_at::text from users where id = $1",
      [id],
    )
  )[0];

/** A no-card trial (sign-up ends without one) with the Payment page open: a stored embedded session on its own customer. */
async function withPayment(email = "ana@example.com") {
  const [{ id }] = await query<{ id: string }>(
    `insert into users (email, name, status, plan, currency, sharing, signup_step, consent_at, first_teaser_at)
     values ($1, 'Ana', 'trial', 'monthly', 'USD', 'share', 'done', '2026-11-30T15:00:00Z', '2026-12-07T12:05:00Z') returning id`,
    [email],
  );
  const r = await openEmbeddedSetup(query, card, { userId: id, ip: "203.0.113.9", returnUrl: "https://roger.test/start/payment/done" });
  if (!r.ok) throw new Error(`no session: ${r.reason}`);
  return { id, sid: r.sessionId };
}

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  card = fakeGateway();
  plans = fakePlans();
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
});

describe("W4: a card confirmed on an account that can no longer save one is removed from the customer", () => {
  const planDeps = (): PlanDeps => ({ plans, gw: billing, card, settings, now: NOW, ...mail() });

  it("cancel whose Stripe expiry failed, then a late confirm: the card is detached although the cancellation's card removal already ran", async () => {
    const { id, sid } = await withPayment();
    const errors = vi.spyOn(console, "warn").mockImplementation(() => {});
    card.expireSetupSession = async () => {
      throw new Error("Stripe is down");
    };
    expect(await cancelPlan(query, planDeps(), { userId: id })).toMatchObject({ ok: true });
    errors.mockRestore();
    // The cancel went through; the session could not be closed, so it is still stored, and the card removal ran.
    expect(await row(id)).toMatchObject({ status: "cancelled", trial_started_at: null, setup_session: sid });
    expect((await row(id)).cards_removed_at).not.toBeNull();

    // The member confirms the card in the still-open tab; Stripe's webhook arrives.
    card.complete(sid);
    const event = { id: "evt_late", type: "checkout.session.completed", data: { object: { id: sid, mode: "setup" } } } as never;
    expect(await handleStripeEvent(query, card, event, { getSettings, now: NOW, ...mail() })).toBe("handled");
    expect(card.detached).toEqual(["pm_card"]);
    expect(card.defaults.size).toBe(0);
    expect(await row(id)).toMatchObject({ status: "cancelled", trial_started_at: null });
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].text).toContain(`User ${id}, account cancelled`);
    expect(alerts()[0].text).toContain("The card was removed from the Stripe customer.");
    // Stripe's resend under a new id: detached again (harmless), one alert in all.
    await handleStripeEvent(query, card, { ...(event as object), id: "evt_late_2" } as never, { getSettings, now: NOW, ...mail() });
    expect(alerts()).toHaveLength(1);
  });

  it("a card confirmed in the moment of the cancel (before the expiry lands) is detached by the cancel itself", async () => {
    const { id } = await withPayment();
    card.expireSetupSession = async (s) => card.complete(s);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await cancelPlan(query, planDeps(), { userId: id })).toMatchObject({ ok: true });
    vi.mocked(console.warn).mockRestore();
    expect(card.detached).toEqual(["pm_card"]);
    expect(await row(id)).toMatchObject({ status: "cancelled", trial_started_at: null, setup_session: null });
  });

  it("closed no_first_list, then a late confirm: not saved (never reopened), detached, admins told", async () => {
    const { id, sid } = await withPayment();
    await query("update users set status = 'closed', closed_reason = 'no_first_list', access_ends_at = $2 where id = $1", [id, NOW.toISOString()]);
    card.complete(sid);
    expect(await complete(sid)).toBe("closed");
    expect(card.detached).toEqual(["pm_card"]);
    expect(card.defaults.size).toBe(0);
    expect(await row(id)).toMatchObject({ status: "closed", trial_started_at: null });
    expect(alerts()[0].text).toContain("account closed (no_first_list)");
  });

  it("closed no_card past the 7-day grace: detached; within the grace it is reopened and the card kept", async () => {
    const late = await withPayment("late@example.com");
    await query("update users set status = 'closed', closed_reason = 'no_card', access_ends_at = $2 where id = $1", [late.id, new Date(NOW.getTime() - 8 * 86_400_000).toISOString()]);
    card.complete(late.sid);
    expect(await complete(late.sid)).toBe("closed");
    expect(card.detached).toEqual(["pm_card"]);

    const grace = await withPayment("grace@example.com");
    await query("update users set status = 'closed', closed_reason = 'no_card', access_ends_at = $2 where id = $1", [grace.id, new Date(NOW.getTime() - 2 * 86_400_000).toISOString()]);
    card.complete(grace.sid);
    expect(await complete(grace.sid)).toBe("done");
    expect(card.detached).toEqual(["pm_card"]);
    expect((await row(grace.id)).status).toBe("trial");
    expect((await row(grace.id)).trial_started_at).not.toBeNull();
    expect(alerts()).toHaveLength(1);
  });

  it("a detach that fails throws (Stripe sends the event again), and the next try removes it", async () => {
    const { id, sid } = await withPayment();
    await query("update users set status = 'cancelled', cancel_requested_at = $2, access_ends_at = $2 where id = $1", [id, NOW.toISOString()]);
    card.complete(sid);
    const detach = card.detachPaymentMethod.bind(card);
    card.detachPaymentMethod = async () => {
      throw new Error("Stripe is down");
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(complete(sid)).rejects.toThrow("could not be removed");
    errors.mockRestore();
    expect(alerts()[0].text).toContain("Removing the card from the Stripe customer failed");
    card.detachPaymentMethod = detach;
    expect(await complete(sid)).toBe("closed");
    expect(card.detached).toEqual(["pm_card"]);
  });
});

describe("W3: an admin close settles the stored Payment session", () => {
  const deps = () => ({ settings, now: NOW, adjust: fakeAdjustments(), gw: billing, card, ...mail() });

  it("an open session is expired in Stripe and cleared", async () => {
    const { id, sid } = await withPayment();
    expect(await closeAccount(query, deps(), ADMIN, id)).toMatchObject({ ok: true });
    expect(await row(id)).toMatchObject({ status: "closed", setup_session: null });
    expect(card.expired).toEqual([sid]);
    expect(card.detached).toEqual([]);
  });

  it("a session the member had already confirmed: the card is not saved, it is removed from the customer, and the session cleared", async () => {
    const { id, sid } = await withPayment();
    card.complete(sid);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await closeAccount(query, deps(), ADMIN, id)).toMatchObject({ ok: true });
    vi.mocked(console.warn).mockRestore();
    expect(await row(id)).toMatchObject({ status: "closed", trial_started_at: null, setup_session: null });
    expect(card.detached).toEqual(["pm_card"]);
    expect(card.defaults.size).toBe(0);
    // Its webhook afterwards finds no stored session: nothing more happens.
    expect(await complete(sid)).toBe("not_yours");
  });

  it("Stripe failing does not stop the close (logged); a card confirmed later is removed by its completion", async () => {
    const { id, sid } = await withPayment();
    card.expireSetupSession = async () => {
      throw new Error("Stripe is down");
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await closeAccount(query, deps(), ADMIN, id)).toMatchObject({ ok: true });
    expect(errors).toHaveBeenCalledWith("[admin] stored Payment session after a close", id, "Stripe is down");
    errors.mockRestore();
    expect(await row(id)).toMatchObject({ status: "closed", setup_session: sid });
    card.complete(sid);
    expect(await complete(sid)).toBe("closed");
    expect(card.detached).toEqual(["pm_card"]);
  });

  it("without the card gateway (Stripe not set up) the close asks nothing of Stripe", async () => {
    const { id } = await withPayment();
    const read = vi.spyOn(card, "getSetupSession");
    expect(await closeAccount(query, { ...deps(), card: null }, ADMIN, id)).toMatchObject({ ok: true });
    expect(read).not.toHaveBeenCalled();
  });
});

describe("W7: a card update records the new card's fingerprint", () => {
  it("stores it once the update is done (not when the address is refused)", async () => {
    const [{ id }] = await query<{ id: string }>(
      "insert into users (email, name, status, plan, currency, stripe_customer, trial_started_at, card_fingerprint) values ('c@example.com', 'C', 'active', 'monthly', 'USD', 'cus_c', $1, 'fp_old') returning id",
      [NOW.toISOString()],
    );
    const fp = async () => (await query<{ card_fingerprint: string }>("select card_fingerprint from users where id = $1", [id]))[0].card_fingerprint;
    const s1 = await card.createSetupSession({ userId: id, customer: "cus_c", currency: "USD", successUrl: "x", cancelUrl: "y", purpose: "card_update" });
    card.complete(s1.id, "CA", "fp_refused");
    card.setTax("invalid");
    expect(await completeCardUpdate(query, card, s1.id, { after: async () => {} })).toBe("address_invalid");
    expect(await fp()).toBe("fp_old");
    card.setTax("ok");
    const s2 = await card.createSetupSession({ userId: id, customer: "cus_c", currency: "USD", successUrl: "x", cancelUrl: "y", purpose: "card_update" });
    card.complete(s2.id, "CA", "fp_new");
    expect(await completeCardUpdate(query, card, s2.id, { after: async () => {} })).toBe("done");
    expect(await fp()).toBe("fp_new");
  });
});

describe("W6: the first-charge retries", () => {
  it("one member whose retry throws does not stop the others", async () => {
    const quote = JSON.stringify({ at: "2026-12-10T12:00:00Z", week: "2026-12-14", totalCents: 22600, currency: "USD" });
    const ids: string[] = [];
    for (const e of ["bad@example.com", "good@example.com"]) {
      const [{ id }] = await query<{ id: string }>(
        `insert into users (email, name, status, hold_reason, plan, currency, stripe_customer, trial_started_at, free_lists_used, quote)
         values ($1, 'H', 'held', 'amount_changed', 'monthly', 'USD', $2, '2026-11-16T15:00:00Z', 2, $3::jsonb) returning id`,
        [e, `cus_${e.slice(0, 3)}`, quote],
      );
      ids.push(id);
    }
    const [bad, good] = ids;
    const seen: string[] = [];
    const q: Query = async (text, params = []) => {
      if (params.includes(bad)) throw new Error("db blip for one member");
      if (params.includes(good)) seen.push(text);
      return query(text, params);
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const d: ChargeDeps = { gw: billing, settings, now: NOW, query: q, transport, sleep: async () => {} };
    const tally = await dueRetries(q, d);
    expect(errors).toHaveBeenCalledWith("[charge] first charge retry", bad, "db blip for one member");
    errors.mockRestore();
    expect(tally.unknown).toBeGreaterThanOrEqual(1);
    // The other member's retry still ran.
    expect(seen.length).toBeGreaterThan(0);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(2);
  });
});
