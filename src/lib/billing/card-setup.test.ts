import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import type { Counter } from "@/lib/rate-limit";
import { CHECKOUT_LIMITED, completeCardSetup, discardSetupSession, openEmbeddedSetup, startCardSetup, startCardUpdate } from "./card-setup";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { claimEvent, handleStripeEvent } from "./webhook";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

const settings = mergeV3([]);
const getSettings = async () => settings;
let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};


let userId: string;
const urls = { successUrl: "https://x/start/done?session_id={CHECKOUT_SESSION_ID}", cancelUrl: "https://x/start/card" };

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  [{ id: userId }] = await query<{ id: string }>(
    "insert into users (email, name, plan, currency, path, email_verified_at, signup_step, consent_at) values ('ana@example.com', 'Ana Silva', 'monthly', 'CAD', 'new', now(), 'card', now()) returning id",
  );
});

describe("startCardSetup", () => {
  it("creates one Stripe customer per user and opens the hosted card page", async () => {
    const gw = fakeGateway();
    const a = await startCardSetup(query, gw, { userId, currency: "CAD", ...urls });
    const b = await startCardSetup(query, gw, { userId, currency: "USD", ...urls });
    expect(a.ok && b.ok).toBe(true);
    expect(gw.customersCreated()).toBe(1);
    const [u] = await query<{ stripe_customer: string; status: string }>("select stripe_customer, status from users");
    expect(u.stripe_customer).toMatch(/^cus_/);
    expect(u.status).toBe("signup");
  });

  it("refuses once the card is saved", async () => {
    await query("update users set status = 'trial'");
    expect(await startCardSetup(query, fakeGateway(), { userId, currency: "CAD", ...urls })).toEqual({ ok: false, reason: "already_saved" });
  });
});

describe("completeCardSetup", () => {
  async function opened(gw: ReturnType<typeof fakeGateway>) {
    await startCardSetup(query, gw, { userId, currency: "CAD", ...urls });
    return [...gw.sessions.keys()].pop()!;
  }

  it("starts the trial and sets the default card, charging nothing and sending no welcome (it moved to Step 3, Unit 2)", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    expect(await completeCardSetup(query, gw, id, { expectUserId: userId, getSettings, query, transport })).toBe("done");
    const [u] = await query<{ status: string; signup_step: string; currency: string; country: string; trial_started_at: unknown }>(
      "select status, signup_step, currency, country, trial_started_at from users",
    );
    expect(u).toMatchObject({ status: "trial", signup_step: "done", currency: "CAD", country: "CA" });
    expect(u.trial_started_at).not.toBeNull();
    expect([...gw.defaults.values()]).toEqual(["pm_card"]);
    expect(sent).toHaveLength(0);
  });

  it("is safe from both the browser return and the webhook: one trial, no email", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    const both = await Promise.all([
      completeCardSetup(query, gw, id, { expectUserId: userId, getSettings, query, transport }),
      completeCardSetup(query, gw, id, { getSettings, query, transport }),
    ]);
    expect(both).toEqual(["done", "done"]);
    const [u] = await query<{ status: string }>("select status from users");
    expect(u.status).toBe("trial");
    expect(sent).toHaveLength(0);
  });

  it("waits while the card page is not finished", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    expect(await completeCardSetup(query, gw, id, { expectUserId: userId, getSettings, query, transport })).toBe("pending");
  });

  it("changes nothing when the session belongs to someone else", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    expect(await completeCardSetup(query, gw, id, { expectUserId: "00000000-0000-0000-0000-000000000000", getSettings, query, transport })).toBe("not_yours");
    const [u] = await query<{ status: string }>("select status from users");
    expect(u.status).toBe("signup");
  });

  it("keeps the user at the card step when the address is not good enough for tax", async () => {
    const gw = fakeGateway("invalid");
    const id = await opened(gw);
    gw.complete(id);
    expect(await completeCardSetup(query, gw, id, { expectUserId: userId, getSettings, query, transport })).toBe("address_invalid");
    const [u] = await query<{ status: string }>("select status from users");
    expect(u.status).toBe("signup");
    expect(sent).toHaveLength(0);
  });

  it("still starts the trial where Stripe collects no tax (no registration there)", async () => {
    const gw = fakeGateway("not_collecting");
    const id = await opened(gw);
    gw.complete(id, "US");
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport })).toBe("done");
  });
});

describe("Stripe webhook handling", () => {
  it("handles a setup checkout once, however many times Stripe sends it", async () => {
    const gw = fakeGateway();
    await startCardSetup(query, gw, { userId, currency: "CAD", ...urls });
    const id = [...gw.sessions.keys()].pop()!;
    gw.complete(id);
    const event = { id: "evt_1", type: "checkout.session.completed", data: { object: { id, mode: "setup" } } } as never;
    expect(await handleStripeEvent(query, gw, event, { getSettings, query, transport })).toBe("handled");
    expect(await handleStripeEvent(query, gw, event, { getSettings, query, transport })).toBe("duplicate");
    const [u] = await query<{ status: string }>("select status from users");
    expect(u.status).toBe("trial");
  });

  it("lets Stripe's retry run an event whose handling failed", async () => {
    const gw = fakeGateway();
    const broken = { ...gw, getSetupSession: async () => Promise.reject(new Error("stripe down")) };
    const event = { id: "evt_2", type: "checkout.session.completed", data: { object: { id: "cs_x", mode: "setup" } } } as never;
    await expect(handleStripeEvent(query, broken, event, { getSettings, query, transport })).rejects.toThrow("stripe down");
    const [row] = await query<{ status: string }>("select status from stripe_events where id = 'evt_2'");
    expect(row.status).toBe("failed");
    expect(await claimEvent(query, "evt_2", "x")).toBe(true);
  });

  it("records events it does not act on yet, so they are not handled twice later", async () => {
    const event = { id: "evt_3", type: "invoice.paid", data: { object: {} } } as never;
    expect(await handleStripeEvent(query, fakeGateway(), event, { getSettings, query, transport })).toBe("ignored");
    const [row] = await query<{ status: string }>("select status from stripe_events where id = 'evt_3'");
    expect(row.status).toBe("done");
  });
});

describe("openEmbeddedSetup: the Payment page's card session (plan 2026-11-26-001, Unit 4)", () => {
  const returnUrl = "https://x/start/payment/done?session_id={CHECKOUT_SESSION_ID}";
  const NOW = new Date("2026-11-26T15:00:00Z");
  function memoryCounter(): Counter {
    const m = new Map<string, number>();
    return async (key, start) => {
      const k = `${key}@${start}`;
      m.set(k, (m.get(k) ?? 0) + 1);
      return m.get(k)!;
    };
  }
  let counter: Counter;
  const open = (gw: ReturnType<typeof fakeGateway>, ip = "1.2.3.4") => openEmbeddedSetup(query, gw, { userId, ip, returnUrl, now: NOW, counter });
  const stored = async () => (await query<{ setup_session: string | null; stripe_customer: string | null }>("select setup_session, stripe_customer from users where id = $1", [userId]))[0];

  beforeEach(async () => {
    counter = memoryCounter();
    // Sign-up ends at Step 3 without a card (Unit 2).
    await query("update users set status = 'trial', signup_step = 'done' where id = $1", [userId]);
  });

  it("creates the customer once and one open session, and a second call returns the same stored session", async () => {
    const gw = fakeGateway();
    const create = vi.spyOn(gw, "createEmbeddedSetupSession");
    const a = await open(gw);
    expect(a).toEqual({ ok: true, sessionId: expect.stringMatching(/^cs_/), clientSecret: expect.stringContaining("_secret_"), currency: "CAD", reused: false });
    const b = await open(gw);
    expect(b).toMatchObject({ ok: true, reused: true });
    if (!a.ok || !b.ok) throw new Error("unreachable");
    expect(b.sessionId).toBe(a.sessionId);
    expect(b.clientSecret).toBe(a.clientSecret);
    expect(gw.customersCreated()).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ userId, customer: expect.stringMatching(/^cus_/), currency: "CAD", returnUrl });
    expect(await stored()).toMatchObject({ setup_session: a.sessionId, stripe_customer: expect.stringMatching(/^cus_/) });
  });

  it.each(["complete", "expired"] as const)("makes and stores a new session when the stored one is %s", async (status) => {
    const gw = fakeGateway();
    const a = await open(gw);
    if (!a.ok) throw new Error("unreachable");
    gw.sessions.set(a.sessionId, { ...gw.sessions.get(a.sessionId)!, status });
    const b = await open(gw);
    expect(b).toMatchObject({ ok: true, reused: false });
    if (!b.ok) throw new Error("unreachable");
    expect(b.sessionId).not.toBe(a.sessionId);
    expect((await stored()).setup_session).toBe(b.sessionId);
  });

  it("makes a new session when Stripe no longer has the stored one", async () => {
    const gw = fakeGateway();
    await query("update users set setup_session = 'cs_gone' where id = $1", [userId]);
    expect(await open(gw)).toMatchObject({ ok: true, reused: false });
  });

  it("makes a new session in the new currency after a currency change", async () => {
    const gw = fakeGateway();
    const a = await open(gw);
    await query("update users set currency = 'USD' where id = $1", [userId]);
    const b = await open(gw);
    expect(b).toMatchObject({ ok: true, reused: false, currency: "USD" });
    if (!a.ok || !b.ok) throw new Error("unreachable");
    expect(gw.sessions.get(b.sessionId)?.currency).toBe("USD");
  });

  it("two tabs opening at once end with one stored session, which both are given", async () => {
    const gw = fakeGateway();
    const [a, b] = await Promise.all([open(gw), open(gw)]);
    if (!a.ok || !b.ok) throw new Error(`refused: ${JSON.stringify([a, b])}`);
    expect(a.sessionId).toBe(b.sessionId);
    expect((await stored()).setup_session).toBe(a.sessionId);
    // A session that lost the store is closed, so it can never save a card no completion accepts.
    const open_ = [...gw.sessions.values()].filter((s) => s.status === "open");
    expect(open_.map((s) => s.id)).toEqual([a.sessionId]);
  });

  it.each([
    ["a trial whose card is saved", "update users set trial_started_at = now() where id = $1"],
    ["an account still signing up", "update users set status = 'signup', signup_step = 'plan' where id = $1"],
    ["an active member", "update users set status = 'active', trial_started_at = now() where id = $1"],
    ["a closed account", "update users set status = 'closed' where id = $1"],
    ["a sponsored trial (never asked for a card)", "update users set sponsor_id = id where id = $1"],
  ])("refuses %s (not_allowed) and opens nothing", async (_n, sql) => {
    const gw = fakeGateway();
    await query(sql, [userId]);
    expect(await open(gw)).toEqual({ ok: false, reason: "not_allowed" });
    expect(gw.sessions.size).toBe(0);
    expect(gw.customersCreated()).toBe(0);
  });

  it("refuses an unknown user", async () => {
    expect(await openEmbeddedSetup(query, fakeGateway(), { userId: "00000000-0000-0000-0000-000000000000", ip: "1.2.3.4", returnUrl, counter })).toEqual({ ok: false, reason: "not_found" });
  });

  it("is rate-limited by the checkout limits when it would open a new session, with the existing message", async () => {
    const gw = fakeGateway();
    for (let i = 0; i < 3; i++) {
      const r = await open(gw);
      if (!r.ok) throw new Error("unreachable");
      await gw.expireSetupSession(r.sessionId);
    }
    expect(await open(gw)).toEqual({ ok: false, reason: "rate_limited" });
    expect(CHECKOUT_LIMITED).toBe("Too many tries. Wait a while and try again, or write to us.");
  });

  it("does not count a reused session against the limit", async () => {
    const gw = fakeGateway();
    for (let i = 0; i < 10; i++) expect(await open(gw)).toMatchObject({ ok: true });
    expect(gw.sessions.size).toBe(1);
  });
});

describe("discardSetupSession: a currency change on the Payment page (Unit 4 helper for Unit 6)", () => {
  beforeEach(async () => {
    await query("update users set status = 'trial', signup_step = 'done' where id = $1", [userId]);
  });
  const counter: Counter = async () => 1;
  const openOne = async (gw: ReturnType<typeof fakeGateway>) => {
    const r = await openEmbeddedSetup(query, gw, { userId, ip: "1.2.3.4", returnUrl: "https://x/r", counter });
    if (!r.ok) throw new Error("unreachable");
    return r.sessionId;
  };

  it("expires the open session in Stripe and clears it, so the next open makes a new one", async () => {
    const gw = fakeGateway();
    const id = await openOne(gw);
    expect(await discardSetupSession(query, gw, userId)).toBe("discarded");
    expect(gw.sessions.get(id)?.status).toBe("expired");
    const [u] = await query<{ setup_session: string | null }>("select setup_session from users where id = $1", [userId]);
    expect(u.setup_session).toBeNull();
    expect(await openOne(gw)).not.toBe(id);
  });

  it("keeps a session that already completed: the card is saved, and the caller runs the completion", async () => {
    const gw = fakeGateway();
    const id = await openOne(gw);
    gw.complete(id);
    expect(await discardSetupSession(query, gw, userId)).toBe("complete");
    const [u] = await query<{ setup_session: string | null }>("select setup_session from users where id = $1", [userId]);
    expect(u.setup_session).toBe(id);
  });

  it("does nothing when no session is stored", async () => {
    expect(await discardSetupSession(query, fakeGateway(), userId)).toBe("none");
  });
});

describe("startCardUpdate for a trial with no card yet (plan 2026-11-26-001, Unit 1)", () => {
  const update = { successUrl: "https://x/app/billing?session_id={CHECKOUT_SESSION_ID}", cancelUrl: "https://x/app/billing" };

  it("refuses with no_card_yet even with a Stripe customer, and opens no session: a card saved there would skip the unlock", async () => {
    const gw = fakeGateway();
    await query("update users set status = 'trial', signup_step = 'done', stripe_customer = 'cus_n' where id = $1", [userId]);
    expect(await startCardUpdate(query, gw, { userId, ...update })).toEqual({ ok: false, reason: "no_card_yet" });
    expect(gw.sessions.size).toBe(0);
  });

  it("opens the update for the same trial once its card is saved", async () => {
    const gw = fakeGateway();
    await query("update users set status = 'trial', signup_step = 'done', stripe_customer = 'cus_n', trial_started_at = now() where id = $1", [userId]);
    expect(await startCardUpdate(query, gw, { userId, ...update })).toMatchObject({ ok: true });
    expect([...gw.sessions.values()].map((s) => s.purpose)).toEqual(["card_update"]);
  });
});
