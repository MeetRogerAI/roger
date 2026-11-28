import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { testDb } from "@/test-helpers/pglite-db";
import { sendSignupWelcome } from "@/lib/signup/finish";
import { completeCardSetup, openEmbeddedSetup } from "./card-setup";
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
const setupEvent = (id: string, sessionId: string) => ({ id, type: "checkout.session.completed", data: { object: { id: sessionId, mode: "setup" } } }) as never;

/** Sign-up ends at Step 3 with a trial and no card (Unit 2); the card is saved on Payment's embedded session. */
beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  process.env.ADMIN_EMAILS = "";
  [{ id: userId }] = await query<{ id: string }>(
    "insert into users (email, name, status, plan, currency, path, email_verified_at, signup_step, consent_at) values ('ana@example.com', 'Ana Silva', 'trial', 'monthly', 'CAD', 'new', now(), 'done', now()) returning id",
  );
});

/** Opens the Payment page's session in the account's currency (`currency` sets it first). */
async function opened(gw: ReturnType<typeof fakeGateway>, currency?: "USD" | "CAD") {
  if (currency) await query("update users set currency = $1", [currency]);
  const r = await openEmbeddedSetup(query, gw, { userId, ip: "203.0.113.9", returnUrl: "https://x/start/payment/done?session_id={CHECKOUT_SESSION_ID}" });
  if (!r.ok) throw new Error(`no session: ${r.reason}`);
  return r.sessionId;
}

describe("the account state", () => {
  it("an account still signing up (no consent) can open no Payment session and save no card", async () => {
    await query("update users set status = 'signup', signup_step = 'plan', consent_at = null");
    const gw = fakeGateway();
    expect(await openEmbeddedSetup(query, gw, { userId, ip: "203.0.113.9", returnUrl: "https://x" })).toEqual({ ok: false, reason: "not_allowed" });
    expect(gw.sessions.size).toBe(0);
  });
});

describe("the welcome email", () => {
  it("is not sent by the card step: sign-up sends it at Step 3 (plan 2026-11-26-001, Unit 2)", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport })).toBe("done");
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport })).toBe("done");
    const [u] = await query<{ status: string }>("select status from users");
    expect(u.status).toBe("trial");
    expect(sent).toHaveLength(0);
  });
});

describe("ordering and ownership", () => {
  it("browser first, webhook later: one trial start, the start time unchanged", async () => {
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    await completeCardSetup(query, gw, id, { expectUserId: userId, getSettings, query, transport });
    const [before] = await query<{ trial_started_at: Date }>("select trial_started_at from users");
    expect(await handleStripeEvent(query, gw, setupEvent("evt_seq", id), { getSettings, query, transport })).toBe("handled");
    const [after] = await query<{ trial_started_at: Date; status: string }>("select trial_started_at, status from users");
    expect(after.status).toBe("trial");
    expect(new Date(after.trial_started_at).getTime()).toBe(new Date(before.trial_started_at).getTime());
    expect(sent).toHaveLength(0);
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

describe("a free-tool report brought to sign-up (claimed at Step 3 now, not here)", () => {
  beforeEach(async () => {
    await query("insert into free_runs (token, email, agent, report, report_at) values ('tok1', 'ana@example.com', 'hark', '# free report', now())");
    await query("update users set pending_zack_token = 'tok1'");
  });

  it("becomes the user's run once, at Step 3, and the card step and Stripe's retries add nothing", async () => {
    await sendSignupWelcome(query, userId, { settings, query, transport });
    const gw = fakeGateway();
    const id = await opened(gw);
    gw.complete(id);
    expect(await completeCardSetup(query, gw, id, { getSettings, query, transport })).toBe("done");
    expect(await handleStripeEvent(query, gw, setupEvent("evt_free", id), { getSettings, query, transport })).toBe("handled");
    const runs = await query<{ route: string }>("select route from runs");
    expect(runs).toEqual([{ route: "free_tool" }]);
  });

  it("never blocks the welcome email when the claim fails", async () => {
    const failing: typeof query = async (t, p) => {
      if (/free_runs/.test(t)) throw new Error("db blip");
      return query(t, p);
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendSignupWelcome(failing, userId, { settings, query, transport })).toBe("sent");
    errors.mockRestore();
    expect(sent.map((m) => m.subject)).toEqual(["Welcome to Roger"]);
  });
});
