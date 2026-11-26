import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { completeCardSetup, startCardSetup, startCardUpdate } from "./card-setup";
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

  it("starts the trial, sets the default card, and sends one welcome email, charging nothing", async () => {
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
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Welcome to Roger");
    expect(sent[0].text).toMatch(/charged only with the third/);
    expect(sent[0].text).toMatch(/CA\$280 a month, plus HST/);
    expect(sent[0].text).toMatch(/that month is CA\$560/);
  });

  it("is safe from both the browser return and the webhook: one trial, one email", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    const both = await Promise.all([
      completeCardSetup(query, gw, id, { expectUserId: userId, getSettings, query, transport }),
      completeCardSetup(query, gw, id, { getSettings, query, transport }),
    ]);
    expect(both).toEqual(["done", "done"]);
    expect(sent).toHaveLength(1);
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

  it("tells one-at-a-time users they pay only when they order", async () => {
    await query("update users set plan = 'per_run', currency = 'USD'");
    const gw = fakeGateway();
    await startCardSetup(query, gw, { userId, currency: "USD", ...urls });
    const id = [...gw.sessions.keys()].pop()!;
    gw.complete(id, "US");
    await completeCardSetup(query, gw, id, { getSettings, query, transport });
    expect(sent[0].text).toMatch(/US\$200, plus tax where it applies, only when you order a list/);
    expect(sent[0].text).not.toMatch(/misses two weeks/);
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
    expect(sent).toHaveLength(1);
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
