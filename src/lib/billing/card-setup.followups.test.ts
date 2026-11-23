import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { testDb } from "@/test-helpers/pglite-db";
import { completeCardSetup, startCardSetup } from "./card-setup";
import { claimEvent, handleStripeEvent } from "./webhook";

// Cases from the Unit 7 code review.
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
const urls = { successUrl: "https://x/start/done", cancelUrl: "https://x/start/card" };
const setupEvent = (id: string, sessionId: string) => ({ id, type: "checkout.session.completed", data: { object: { id: sessionId, mode: "setup" } } }) as never;

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  process.env.ADMIN_EMAILS = "";
  [{ id: userId }] = await query<{ id: string }>(
    "insert into users (email, name, plan, currency, path, email_verified_at, signup_step, consent_at) values ('ana@example.com', 'Ana Silva', 'monthly', 'CAD', 'new', now(), 'card', now()) returning id",
  );
});

async function opened(gw: ReturnType<typeof fakeGateway>, currency: "USD" | "CAD" = "CAD") {
  await startCardSetup(query, gw, { userId, currency, ...urls });
  return [...gw.sessions.keys()].pop()!;
}

describe("consent", () => {
  it("is required to open the card page and to start the trial, not only on the page", async () => {
    await query("update users set consent_at = null");
    expect(await startCardSetup(query, fakeGateway(), { userId, currency: "CAD", ...urls })).toEqual({ ok: false, reason: "not_consented" });
    await query("update users set consent_at = now()");
    const gw = fakeGateway();
    const id = await opened(gw);
    await query("update users set consent_at = null");
    gw.complete(id);
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport })).toBe("not_consented");
    const [u] = await query<{ status: string }>("select status from users");
    expect(u.status).toBe("signup");
  });
});

describe("the welcome email", () => {
  it("is sent on the next visit if the first send failed, and only once", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    let fail = true;
    const flaky: Transport = async (m) => {
      if (fail) return { ok: false, error: "resend 500", retryable: true };
      sent.push(m);
      return { ok: true };
    };
    await expect(completeCardSetup(query, gw, id, { getSettings, query, transport: flaky, sleep: async () => {} })).rejects.toThrow(/welcome email/);
    const [u] = await query<{ status: string }>("select status from users");
    expect(u.status).toBe("trial");
    fail = false;
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport: flaky })).toBe("done");
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport: flaky })).toBe("done");
    expect(sent.filter((m) => m.subject === "Welcome to Roger")).toHaveLength(1);
  });
});

describe("ordering and ownership", () => {
  it("browser first, webhook later: one trial start, one email, the start time unchanged", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    await completeCardSetup(query, gw, id, { expectUserId: userId, getSettings, query, transport });
    const [before] = await query<{ trial_started_at: Date }>("select trial_started_at from users");
    expect(await handleStripeEvent(query, gw, setupEvent("evt_seq", id), { getSettings, query, transport })).toBe("handled");
    const [after] = await query<{ trial_started_at: Date; status: string }>("select trial_started_at, status from users");
    expect(after.status).toBe("trial");
    expect(new Date(after.trial_started_at).getTime()).toBe(new Date(before.trial_started_at).getTime());
    expect(sent).toHaveLength(1);
  });

  it("changes nothing when the session's own metadata names another user (the webhook's only check)", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    gw.sessions.set(id, { ...gw.sessions.get(id)!, userId: "00000000-0000-0000-0000-000000000000" });
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport })).toBe("not_yours");
  });

  it("does nothing for a Stripe customer no user has, and notes why on the event", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    gw.sessions.set(id, { ...gw.sessions.get(id)!, customer: "cus_elsewhere", userId: null });
    expect(await handleStripeEvent(query, gw, setupEvent("evt_unknown", id), { getSettings, query, transport })).toBe("handled");
    const [row] = await query<{ status: string; error: string }>("select status, error from stripe_events where id = 'evt_unknown'");
    expect(row).toEqual({ status: "done", error: "unknown_customer" });
  });

  it("asks Stripe to send the event again when the session is not complete yet", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    await expect(handleStripeEvent(query, gw, setupEvent("evt_early", id), { getSettings, query, transport })).rejects.toThrow();
    expect(await claimEvent(query, "evt_early", "x")).toBe(true);
  });
});

describe("currency, address and settings", () => {
  it("keeps the currency the person chose last, not the one an older card tab was opened with", async () => {
    const gw = fakeGateway();
    const id = await opened(gw, "USD");
    await query("update users set currency = 'CAD'");
    gw.complete(id);
    await completeCardSetup(query, gw, id, { getSettings, query, transport });
    const [u] = await query<{ currency: string }>("select currency from users");
    expect(u.currency).toBe("CAD");
  });

  it("lets someone whose address was refused fix it and finish", async () => {
    const gw = fakeGateway("invalid");
    const first = await opened(gw);
    gw.complete(first);
    expect(await completeCardSetup(query, gw, first, { getSettings, query, transport })).toBe("address_invalid");
    const fixed = { ...gw, checkTaxLocation: async () => "ok" as const };
    const second = await opened(gw);
    gw.complete(second);
    expect(await completeCardSetup(query, fixed, second, { getSettings, query, transport })).toBe("done");
  });

  it("does not read settings at all for an event that needs none", async () => {
    const event = { id: "evt_other", type: "invoice.paid", data: { object: {} } } as never;
    const unreadable = async () => Promise.reject(new Error("settings unreadable"));
    expect(await handleStripeEvent(query, fakeGateway(), event, { getSettings: unreadable, query, transport })).toBe("ignored");
  });
});

describe("claimEvent", () => {
  it("takes over a claim stuck in processing for 15 minutes, but not a fresh one or a finished one", async () => {
    expect(await claimEvent(query, "evt_stuck", "x")).toBe(true);
    expect(await claimEvent(query, "evt_stuck", "x")).toBe(false);
    await query("update stripe_events set claimed_at = now() - interval '16 minutes' where id = 'evt_stuck'");
    expect(await claimEvent(query, "evt_stuck", "x")).toBe(true);
    await query("update stripe_events set status = 'done', claimed_at = now() - interval '1 day' where id = 'evt_stuck'");
    expect(await claimEvent(query, "evt_stuck", "x")).toBe(false);
  });
});
