import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { nextNavigation, Redirected } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * Plan 2026-11-26-001, Unit 5: `/start/payment/done?session_id=…`, where
 * Stripe sends the person after the Payment page's card form. It runs the
 * completion for the signed-in user and sends them on.
 */

const db: { query: Query | null; userId: string; gw: ReturnType<typeof fakeGateway> | null } = { query: null, userId: "", gw: null };
const sent: Parameters<Transport>[0][] = [];
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => nextNavigation);
vi.mock("@/lib/auth/access", () => ({ requireUser: async () => ({ userId: db.userId }) }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/billing/gateway", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/gateway")>()), stripeGateway: () => db.gw }));
vi.mock("@/lib/mail/send", async (orig) => {
  const m = await orig<typeof import("@/lib/mail/send")>();
  const transport: Transport = async (msg) => {
    sent.push(msg);
    return { ok: true };
  };
  return { ...m, sendToUser: (u: Parameters<typeof m.sendToUser>[0], k: string, r: string, msg: Parameters<typeof m.sendToUser>[3], d: Parameters<typeof m.sendToUser>[4] = {}) => m.sendToUser(u, k, r, msg, { ...d, query: db.query!, transport, sleep: async () => {} }) };
});
vi.mock("@/lib/v3-settings", async (orig) => {
  const m = await orig<typeof import("@/lib/v3-settings")>();
  return { ...m, readV3Settings: async () => m.mergeV3([]) };
});

const { default: Page } = await import("./page");
const { openEmbeddedSetup } = await import("@/lib/billing/card-setup");
const { setPendingPromo } = await import("@/lib/billing/promo");
const WEEK = "2026-12-14";

async function render(search: Record<string, string>): Promise<{ html: string; redirect: string | null }> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(<Page params={Promise.resolve({})} searchParams={Promise.resolve(search)} />, { onError: (e) => void errors.push(e) });
  const html = await new Response(prelude).text();
  const r = errors.find((e): e is Redirected => e instanceof Redirected);
  return { html, redirect: r?.url ?? null };
}

async function openSession(userId = db.userId) {
  const r = await openEmbeddedSetup(db.query!, db.gw!, { userId, ip: "203.0.113.9", returnUrl: "https://roger.test/start/payment/done?session_id={CHECKOUT_SESSION_ID}" });
  if (!r.ok) throw new Error(r.reason);
  return r.sessionId;
}

beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  db.gw = fakeGateway();
  sent.length = 0;
  const [u] = await query<{ id: string }>(
    "insert into users (email, name, status, plan, currency, consent_at, signup_step, first_teaser_at) values ('a@example.com', 'Ana', 'trial', 'monthly', 'CAD', now(), 'done', now()) returning id",
  );
  db.userId = u.id;
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [u.id, WEEK]);
  for (const [i, t] of ["Inbox triage", "Listing post", "Calendar prep"].entries()) {
    const [p] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures) values ($1, 'Sales', 'D.', '1. S.', 'I.', $2, $2, '{}') returning id`,
      [t, WEEK],
    );
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, 'Fits.')", [u.id, WEEK, i + 1, p.id]);
  }
});

describe("/start/payment/done", () => {
  it("saves the card, unlocks the held list and lands on the week with the notice flag", async () => {
    const sid = await openSession();
    db.gw!.complete(sid);
    const { redirect } = await render({ session_id: sid });
    expect(redirect).toBe(`/app/week/${WEEK}?card=saved`);
    const [u] = await db.query!<{ saved: boolean; free_lists_used: number }>("select trial_started_at is not null as saved, free_lists_used from users");
    expect(u).toEqual({ saved: true, free_lists_used: 1 });
    expect(sent.map((m) => m.subject)).toEqual(["Your three ideas for the week of Monday, December 14"]);
  });

  it("says so when the promo code could not be applied", async () => {
    const f = db.gw!.payment.addPromotion({ code: "LAST1", maxRedemptions: 1, timesRedeemed: 1 });
    await setPendingPromo(db.query!, db.userId, { code: "LAST1", couponId: f.coupon!.id, label: "Last one" });
    const sid = await openSession();
    db.gw!.complete(sid);
    expect((await render({ session_id: sid })).redirect).toBe(`/app/week/${WEEK}?card=promo`);
  });

  it("shows 'Confirming your card…' with a re-check while Stripe has not confirmed, then stops after the last check", async () => {
    const sid = await openSession();
    const first = await render({ session_id: sid });
    expect(first.redirect).toBeNull();
    expect(first.html).toContain("Step 4 of 4");
    expect(first.html).toContain("Confirming your card…");
    expect(first.html).toContain(`http-equiv="refresh"`);
    expect(first.html).toContain(`check=1`);
    const last = await render({ session_id: sid, check: "10" });
    expect(last.html).not.toContain(`http-equiv="refresh"`);
    expect(last.html).toContain("This is taking longer than usual.");
    expect(last.html).toContain('href="/start/payment"');
  });

  it("goes back to Payment with the address message when Stripe cannot place the address for tax", async () => {
    db.gw = fakeGateway("invalid");
    const sid = await openSession();
    db.gw.complete(sid);
    expect((await render({ session_id: sid })).redirect).toBe("/start/payment?error=address");
  });

  it("never asks Stripe about an id that is not the member's stored session (garbage or foreign)", async () => {
    await openSession();
    let reads = 0;
    const getSetupSession = db.gw!.getSetupSession;
    db.gw!.getSetupSession = async (id) => (reads++, getSetupSession(id));
    expect((await render({ session_id: "cs_garbage" })).redirect).toBe("/start/payment");
    expect((await render({ session_id: "x".repeat(500) })).redirect).toBe("/start/payment");
    expect(reads).toBe(0);
  });

  it("a member whose card is saved lands on their week without asking Stripe, whatever id the page was given", async () => {
    const sid = await openSession();
    db.gw!.complete(sid);
    expect((await render({ session_id: sid })).redirect).toBe(`/app/week/${WEEK}?card=saved`);
    let reads = 0;
    db.gw!.getSetupSession = async () => (reads++, Promise.reject(new Error("unexpected")));
    expect((await render({ session_id: "cs_other" })).redirect).toBe(`/app/week/${WEEK}?card=saved`);
    expect((await render({})).redirect).toBe(`/app/week/${WEEK}?card=saved`);
    expect(reads).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("limits completions per member: past the limit the page keeps confirming without asking Stripe", async () => {
    const sid = await openSession();
    let reads = 0;
    const getSetupSession = db.gw!.getSetupSession;
    db.gw!.getSetupSession = async (id) => (reads++, getSetupSession(id));
    for (let i = 0; i < 31; i++) expect((await render({ session_id: sid, check: "1" })).redirect).toBeNull();
    expect(reads).toBe(30);
  });

  it("when the check fails on our side, the last check says it is our problem (not Stripe's) with the support address", async () => {
    const sid = await openSession();
    const getSetupSession = db.gw!.getSetupSession;
    db.gw!.getSetupSession = async () => {
      throw new Error("Stripe connection reset");
    };
    const first = await render({ session_id: sid });
    expect(first.html).toContain("Confirming your card…");
    expect(first.html).toContain("e=1");
    const last = await render({ session_id: sid, check: "10" });
    expect(last.html).toContain("We hit a problem saving your card. We’ll finish it shortly — or write to us at hello@meetroger.ai.");
    expect(last.html).not.toContain("Stripe hasn’t confirmed");
    // Carried from an earlier failed check even when the last one is merely pending (Stripe answers "open").
    db.gw!.getSetupSession = getSetupSession;
    const carried = await render({ session_id: sid, check: "10", e: "1" });
    expect(carried.html).toContain("We hit a problem saving your card.");
    // Without a failure, the last check is the plain "not confirmed yet".
    expect((await render({ session_id: sid, check: "10" })).html).toContain("Stripe hasn’t confirmed your card yet.");
  });

  it("goes back to Payment for another member's session, or none", async () => {
    const [other] = await db.query!<{ id: string }>(
      "insert into users (email, name, status, plan, currency, consent_at, signup_step) values ('b@example.com', 'Bo', 'trial', 'monthly', 'USD', now(), 'done') returning id",
    );
    const sid = await openSession(other.id);
    db.gw!.complete(sid);
    expect((await render({ session_id: sid })).redirect).toBe("/start/payment");
    expect((await render({})).redirect).toBe("/start/payment");
    const [u] = await db.query!<{ n: number }>("select count(*)::int as n from users where trial_started_at is not null");
    expect(u.n).toBe(0);
  });
});
