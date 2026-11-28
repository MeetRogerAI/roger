import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import type { Counter } from "@/lib/rate-limit";
import { CHECKOUT_LIMITED, completeCardSetup, discardSetupSession, openEmbeddedSetup, startCardUpdate } from "./card-setup";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { claimEvent, handleStripeEvent } from "./webhook";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
// One at a time is not offered at launch (./offered): off here, as at launch, unless a test turns it on.
const offer = vi.hoisted(() => ({ on: false }));
vi.mock("./offered", async (orig) => ({ ...(await orig<typeof import("./offered")>()), oneAtATimeOffered: () => offer.on }));

const settings = mergeV3([]);
const getSettings = async () => settings;
let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};


let userId: string;

/** Sign-up ends at Step 3 with a trial and no card (Unit 2); the hosted card-at-sign-up page is gone (whole-branch review W8). */
beforeEach(async () => {
  offer.on = false;
  ({ query } = await testDb());
  sent = [];
  [{ id: userId }] = await query<{ id: string }>(
    "insert into users (email, name, status, plan, currency, path, email_verified_at, signup_step, consent_at) values ('ana@example.com', 'Ana Silva', 'trial', 'monthly', 'CAD', 'new', now(), 'done', now()) returning id",
  );
});

/** The Payment page's stored embedded session (the one the completion accepts). */
async function opened(gw: ReturnType<typeof fakeGateway>) {
  const r = await openEmbeddedSetup(query, gw, { userId, ip: "203.0.113.9", returnUrl: "https://x/start/payment/done?session_id={CHECKOUT_SESSION_ID}" });
  if (!r.ok) throw new Error(`no session: ${r.reason}`);
  return r.sessionId;
}

describe("completeCardSetup", () => {
  it("saves the card on a no-card trial and sets the default card, charging nothing and sending no welcome (it moved to Step 3, Unit 2)", async () => {
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
    const [u] = await query<{ status: string; trial_started_at: string | null }>("select status, trial_started_at from users");
    expect(u).toEqual({ status: "trial", trial_started_at: null });
  });

  it("leaves the card unsaved when the address is not good enough for tax", async () => {
    const gw = fakeGateway("invalid");
    const id = await opened(gw);
    gw.complete(id);
    expect(await completeCardSetup(query, gw, id, { expectUserId: userId, getSettings, query, transport })).toBe("address_invalid");
    const [u] = await query<{ status: string; trial_started_at: string | null }>("select status, trial_started_at from users");
    expect(u).toEqual({ status: "trial", trial_started_at: null });
    expect(sent).toHaveLength(0);
  });

  it("an account still signing up never saves a card through it (the old card-at-sign-up branch is gone, W8)", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    await query("update users set status = 'signup', signup_step = 'card'");
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport })).toBe("closed");
    const [u] = await query<{ status: string; trial_started_at: string | null }>("select status, trial_started_at from users");
    expect(u).toEqual({ status: "signup", trial_started_at: null });
    expect(gw.defaults.size).toBe(0);
    // Not a cancelled or closed account: its card is not touched either.
    expect(gw.detached).toEqual([]);
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
    const id = await opened(gw);
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

  it("makes and stores a new session when the stored one is expired", async () => {
    const gw = fakeGateway();
    const a = await open(gw);
    if (!a.ok) throw new Error("unreachable");
    gw.sessions.set(a.sessionId, { ...gw.sessions.get(a.sessionId)!, status: "expired" });
    const b = await open(gw);
    expect(b).toMatchObject({ ok: true, reused: false });
    if (!b.ok) throw new Error("unreachable");
    expect(b.sessionId).not.toBe(a.sessionId);
    expect((await stored()).setup_session).toBe(b.sessionId);
  });

  it("never replaces a stored session that is complete: it answers 'complete' so the caller runs the completion", async () => {
    const gw = fakeGateway();
    const a = await open(gw);
    if (!a.ok) throw new Error("unreachable");
    gw.complete(a.sessionId);
    const create = vi.spyOn(gw, "createEmbeddedSetupSession");
    const counted = vi.fn(counter);
    expect(await openEmbeddedSetup(query, gw, { userId, ip: "1.2.3.4", returnUrl, now: NOW, counter: counted })).toEqual({ ok: false, reason: "complete", sessionId: a.sessionId });
    expect(create).not.toHaveBeenCalled();
    expect(counted).not.toHaveBeenCalled();
    expect((await stored()).setup_session).toBe(a.sessionId);
  });

  it.each([
    ["another customer", { customer: "cus_other" }],
    ["another user", { userId: "11111111-1111-1111-1111-111111111111" }],
    ["a card update", { purpose: "card_update" }],
    ["no client secret (a hosted page)", { clientSecret: null }],
  ])("does not hand back a stored open session for %s: a new one replaces it, and the old one is expired", async (_n, over) => {
    const gw = fakeGateway();
    const a = await open(gw);
    if (!a.ok) throw new Error("unreachable");
    gw.sessions.set(a.sessionId, { ...gw.sessions.get(a.sessionId)!, ...over });
    const b = await open(gw);
    expect(b).toMatchObject({ ok: true, reused: false });
    if (!b.ok) throw new Error("unreachable");
    expect(b.sessionId).not.toBe(a.sessionId);
    expect((await stored()).setup_session).toBe(b.sessionId);
    expect(gw.sessions.get(a.sessionId)?.status).toBe("expired");
  });

  it("lets a failure to read the stored session through (only a missing one is replaced)", async () => {
    const gw = fakeGateway();
    await open(gw);
    vi.spyOn(gw, "getSetupSession").mockRejectedValue(Object.assign(new Error("api down"), { type: "StripeAPIError" }));
    const create = vi.spyOn(gw, "createEmbeddedSetupSession");
    await expect(open(gw)).rejects.toThrow("api down");
    expect(create).not.toHaveBeenCalled();
  });

  it("makes a new session when Stripe no longer has the stored one", async () => {
    const gw = fakeGateway();
    await query("update users set setup_session = 'cs_gone' where id = $1", [userId]);
    expect(await open(gw)).toMatchObject({ ok: true, reused: false });
  });

  it("hands back the open session after a currency change: no new session, nothing counted (switching USD/CAD never reloads the card form)", async () => {
    const gw = fakeGateway();
    const a = await open(gw);
    await query("update users set currency = 'USD' where id = $1", [userId]);
    const create = vi.spyOn(gw, "createEmbeddedSetupSession");
    const counted = vi.fn(counter);
    const b = await openEmbeddedSetup(query, gw, { userId, ip: "1.2.3.4", returnUrl, now: NOW, counter: counted });
    if (!a.ok || !b.ok) throw new Error("unreachable");
    expect(b).toMatchObject({ ok: true, reused: true, currency: "USD", sessionId: a.sessionId, clientSecret: a.clientSecret });
    expect(create).not.toHaveBeenCalled();
    expect(counted).not.toHaveBeenCalled();
    expect(gw.sessions.get(a.sessionId)?.status).toBe("open");
  });

  it("still opens the new session when expiring the replaced one fails", async () => {
    const gw = fakeGateway();
    const a = await open(gw);
    if (!a.ok) throw new Error("unreachable");
    // A stored session that cannot be handed back (no client secret) is replaced.
    gw.sessions.set(a.sessionId, { ...gw.sessions.get(a.sessionId)!, clientSecret: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(gw, "expireSetupSession").mockRejectedValue(new Error("api down"));
    const b = await open(gw);
    expect(warn).toHaveBeenCalledWith("[card] expire setup session failed", expect.objectContaining({ message: "api down" }));
    warn.mockRestore();
    expect(b).toMatchObject({ ok: true, reused: false });
    if (!b.ok) throw new Error("unreachable");
    expect((await stored()).setup_session).toBe(b.sessionId);
  });

  it("keeps a replaced session that completed while it was being expired: it is stored again, the new one closed, and 'complete' answered", async () => {
    const gw = fakeGateway();
    const a = await open(gw);
    if (!a.ok) throw new Error("unreachable");
    gw.sessions.set(a.sessionId, { ...gw.sessions.get(a.sessionId)!, clientSecret: null });
    // The old tab's confirm lands just before the expiry: Stripe completes it, and the expire is a no-op.
    const expire = gw.expireSetupSession.bind(gw);
    vi.spyOn(gw, "expireSetupSession").mockImplementation(async (id) => {
      if (id === a.sessionId) gw.complete(id);
      return expire(id);
    });
    const create = vi.spyOn(gw, "createEmbeddedSetupSession");
    expect(await open(gw)).toEqual({ ok: false, reason: "complete", sessionId: a.sessionId });
    expect((await stored()).setup_session).toBe(a.sessionId);
    const made = (await create.mock.results[0].value) as { id: string };
    expect(gw.sessions.get(made.id)?.status).toBe("expired");
    expect(gw.sessions.get(a.sessionId)?.status).toBe("complete");
  });

  describe("losing the compare-and-set (forced: the winner is stored between the read and the store)", () => {
    function racedGateway(o: { failExpire?: boolean } = {}) {
      const gw = fakeGateway();
      const real = gw.createEmbeddedSetupSession.bind(gw);
      let winner: string | null = null;
      vi.spyOn(gw, "createEmbeddedSetupSession").mockImplementation(async (args) => {
        const mine = await real(args);
        if (!winner) {
          // The other tab creates and stores its session first.
          winner = (await real(args)).id;
          await query("update users set setup_session = $2 where id = $1", [userId, winner]);
        }
        return mine;
      });
      const expire = gw.expireSetupSession.bind(gw);
      if (o.failExpire) vi.spyOn(gw, "expireSetupSession").mockRejectedValue(new Error("api down"));
      else vi.spyOn(gw, "expireSetupSession").mockImplementation(expire);
      return { gw, winner: () => winner };
    }

    it("the loser closes its own session and hands back the winner's, counted once against the limits", async () => {
      const { gw, winner } = racedGateway();
      const counted = vi.fn(counter);
      const r = await openEmbeddedSetup(query, gw, { userId, ip: "1.2.3.4", returnUrl, now: NOW, counter: counted });
      expect(r).toMatchObject({ ok: true, reused: true, sessionId: winner() });
      expect((await stored()).setup_session).toBe(winner());
      const loser = [...gw.sessions.keys()].find((id) => id !== winner())!;
      expect(gw.sessions.get(loser)?.status).toBe("expired");
      expect(gw.expireSetupSession).toHaveBeenCalledWith(loser);
      expect(counted.mock.calls.filter(([k]) => String(k).startsWith("checkout:user:"))).toHaveLength(1);
    });

    it("still hands back the winner's session when closing its own fails", async () => {
      const { gw, winner } = racedGateway({ failExpire: true });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await open(gw)).toMatchObject({ ok: true, reused: true, sessionId: winner() });
      warn.mockRestore();
    });
  });

  it("answers try_again, not not_allowed, when every store is lost", async () => {
    const gw = fakeGateway();
    const real = gw.createEmbeddedSetupSession.bind(gw);
    vi.spyOn(gw, "createEmbeddedSetupSession").mockImplementation(async (args) => {
      const mine = await real(args);
      // Each pass, another tab stores a session that is then closed again before the next read.
      const theirs = await real(args);
      await query("update users set setup_session = $2 where id = $1", [userId, theirs.id]);
      gw.sessions.set(theirs.id, { ...gw.sessions.get(theirs.id)!, status: "expired" });
      return mine;
    });
    expect(await open(gw)).toEqual({ ok: false, reason: "try_again" });
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

  it("keeps a session whose confirm landed just before the expiry: 'complete', and it stays stored", async () => {
    const gw = fakeGateway();
    const id = await openOne(gw);
    vi.spyOn(gw, "expireSetupSession").mockImplementation(async (sid) => gw.complete(sid));
    expect(await discardSetupSession(query, gw, userId)).toBe("complete");
    const [u] = await query<{ setup_session: string | null }>("select setup_session from users where id = $1", [userId]);
    expect(u.setup_session).toBe(id);
  });

  it.each([
    ["expired", (gw: ReturnType<typeof fakeGateway>, id: string) => gw.sessions.set(id, { ...gw.sessions.get(id)!, status: "expired" })],
    ["gone from Stripe", (gw: ReturnType<typeof fakeGateway>, id: string) => gw.sessions.delete(id)],
  ])("clears a stored session that is %s ('discarded')", async (_n, change) => {
    const gw = fakeGateway();
    const id = await openOne(gw);
    change(gw, id);
    const expire = vi.spyOn(gw, "expireSetupSession");
    expect(await discardSetupSession(query, gw, userId)).toBe("discarded");
    expect(expire).not.toHaveBeenCalled();
    const [u] = await query<{ setup_session: string | null }>("select setup_session from users where id = $1", [userId]);
    expect(u.setup_session).toBeNull();
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
