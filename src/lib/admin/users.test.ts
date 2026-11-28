import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChargeJob } from "@/lib/billing/charge-job";
import { excuseWeek, recordWeek, undoExcuseForEveryone } from "@/lib/billing/contribution";
import { chargeFirst } from "@/lib/billing/first-charge";
import type { BillingGateway, FoundSubscription } from "@/lib/billing/subscriptions";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeAdjustments } from "@/test-helpers/fake-adjustments";
import { testDb, testSponsor } from "@/test-helpers/pglite-db";
import { memberStatusLine } from "./user-detail";
import { addRunForUser, changeUserEmail, closeAccount, deleteAccount, giveExtraFreeList, isMonday, saveNote, sendNudge } from "./users";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const settings = mergeV3([{ key: "v3.cycleLive", value: true }]);
const ADMIN = "admin@example.com";
const WEEK = "2026-12-14";
/** Monday 2026-12-14, 6:05 AM Toronto. */
const SIX_AM = new Date("2026-12-14T11:05:00Z");
const mail = () => ({ query, transport, sleep: async () => {} });

function fakeBilling(subs: FoundSubscription[] = []): BillingGateway & { creates: number } {
  const gw = {
    creates: 0,
    async preview() {
      return { totalCents: 23000, currency: "USD" };
    },
    async subscriptions() {
      return subs;
    },
    async createSubscription() {
      gw.creates++;
      return { kind: "succeeded" as const, object: "sub_new", amountCents: 23000, currency: "USD" };
    },
  };
  return gw;
}

let uid: string;
const log = () => query<{ admin_email: string; user_id: string | null; action: string }>("select admin_email, user_id, action from admin_actions order by id");
const u = async () => (await query<Record<string, unknown>>("select * from users where id = $1", [uid]))[0];

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  vi.stubEnv("STRIPE_PRICE_MONTHLY_USD", "price_monthly_usd");
  vi.stubEnv("STRIPE_PRICE_MONTHLY_HIGHER_USD", "price_monthly_higher_usd");
  [{ id: uid }] = await query<{ id: string }>(
    "insert into users (email, name, status, plan, currency, sharing, stripe_customer, free_lists_used, quote, trial_started_at) values ('ana@example.com', 'Ana', 'trial', 'monthly', 'USD', 'share', 'cus_1', 2, $1, '2026-11-16T15:00:00Z') returning id",
    [JSON.stringify({ totalCents: 23000, currency: "USD", week: WEEK, price: "price_monthly_usd" })],
  );
});

describe("one extra free list", () => {
  it("moves the first-charge Monday and the member's status line, and is logged", async () => {
    expect(await memberStatusLine(query, uid, settings, SIX_AM)).toMatch(/Free list 2 of 2\. Your next list is your first paid one/);
    expect(await giveExtraFreeList(query, ADMIN, uid)).toMatchObject({ ok: true });
    expect(await memberStatusLine(query, uid, settings, SIX_AM)).toBe("Free list 1 of 2.");
    expect(await u()).toMatchObject({ free_lists_used: 1, quote: null });

    // The Monday that would have been the first charge charges nothing now.
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
    await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [uid, WEEK]);
    const gw = fakeBilling();
    await runChargeJob(query, { gw, settings, now: SIX_AM, ...mail() }, { week: WEEK });
    expect(gw.creates).toBe(0);
    expect(await log()).toEqual([{ admin_email: ADMIN, user_id: uid, action: "extra_free_list" }]);
  });

  it("is refused for a one-at-a-time trial member with a list ordered, which would be charged", async () => {
    await query("update users set plan = 'per_run'");
    await query("insert into orders (user_id, week_of) values ($1, $2)", [uid, WEEK]);
    expect(await giveExtraFreeList(query, ADMIN, uid)).toMatchObject({ ok: false, message: expect.stringMatching(/ordered/) });
    expect((await u()).free_lists_used).toBe(2);
    await query("update orders set status = 'cancelled'");
    expect(await giveExtraFreeList(query, ADMIN, uid)).toMatchObject({ ok: true });
  });

  it("stops a first charge the job had already listed (chargeFirst re-checks the free lists)", async () => {
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')", [WEEK]);
    await giveExtraFreeList(query, ADMIN, uid);
    const gw = fakeBilling();
    expect(await chargeFirst(query, { gw, settings, now: SIX_AM, ...mail() }, uid, WEEK)).toBe("skipped");
    expect(gw.creates).toBe(0);
    expect(await query("select 1 from charge_attempts")).toEqual([]);
    expect((await u()).status).toBe("trial");
  });

  it("is refused after the trial, before any free list, and while a charge is in flight", async () => {
    await query("insert into charge_attempts (user_id, purpose, week_of) values ($1, 'first_charge', $2)", [uid, WEEK]);
    expect(await giveExtraFreeList(query, ADMIN, uid)).toMatchObject({ ok: false, message: expect.stringMatching(/in progress/) });
    await query("delete from charge_attempts");
    await query("update users set free_lists_used = 0");
    expect(await giveExtraFreeList(query, ADMIN, uid)).toMatchObject({ ok: false });
    await query("update users set status = 'active', free_lists_used = 2");
    expect(await giveExtraFreeList(query, ADMIN, uid)).toMatchObject({ ok: false });
    expect(await log()).toEqual([]);
  });
});

describe("excusing a week (spec check 31)", () => {
  const monthly = async () => {
    await query("update users set status = 'active', stripe_subscription = 'sub_1', first_charge_at = '2026-12-03T11:05:00Z', free_lists_used = 2");
  };

  it("writes a log row with the admin's email and removes the miss", async () => {
    await monthly();
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
    await recordWeek(query, WEEK, settings);
    expect(await query("select result from contribution_weeks")).toEqual([{ result: "missed" }]);
    await excuseWeek(query, { settings, now: new Date("2026-12-15T15:00:00Z"), adjust: fakeAdjustments(), ...mail() }, { week: WEEK, userId: uid, by: ADMIN });
    expect(await query("select result, excused_by from contribution_weeks")).toEqual([{ result: "excused", excused_by: ADMIN }]);
    expect(await log()).toEqual([{ admin_email: ADMIN, user_id: uid, action: "excuse_week" }]);
  });

  it("for everyone, also covers a week not recorded yet", async () => {
    await monthly();
    await excuseWeek(query, { settings, now: new Date("2026-12-12T15:00:00Z"), adjust: fakeAdjustments(), ...mail() }, { week: WEEK, userId: null, by: ADMIN });
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
    await recordWeek(query, WEEK, settings);
    expect(await query("select result, excused_by from contribution_weeks")).toEqual([{ result: "excused", excused_by: `${ADMIN} (everyone)` }]);
    // A member who contributed is still recorded as contributing.
    await query("delete from contribution_weeks");
    await query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, $2, 'connector', 'hark', 'share', 'x', 'accepted')", [uid, WEEK]);
    await recordWeek(query, WEEK, settings);
    expect(await query("select result, excused_by from contribution_weeks")).toEqual([{ result: "contributed", excused_by: null }]);
  });

  it("for one member ahead of the cutoff, applies only if the week turns out missed, never over by choice", async () => {
    await monthly();
    const deps = { settings, now: new Date("2026-12-12T15:00:00Z"), adjust: fakeAdjustments(), ...mail() };
    expect(await excuseWeek(query, deps, { week: WEEK, userId: uid, by: ADMIN })).toBe(0);
    expect(await query("select user_id from week_excuses")).toEqual([{ user_id: uid }]);
    // Sharing off at the cutoff: by choice stands.
    await query("insert into zack_settings_history (user_id, sharing, plays_per_week, changed_at) values ($1, 'off', 4, '2026-12-10T12:00:00Z')", [uid]);
    await recordWeek(query, WEEK, settings);
    expect(await query("select result, excused_by from contribution_weeks")).toEqual([{ result: "by_choice", excused_by: null }]);
    // The same pending excuse on a week that is a miss.
    await query("delete from contribution_weeks");
    await query("delete from zack_settings_history");
    await recordWeek(query, WEEK, settings);
    expect(await query("select result, excused_by from contribution_weeks")).toEqual([{ result: "excused", excused_by: ADMIN }]);
  });

  it("for everyone can be undone: the weeks count again, except one Roger caused or a member's own excuse", async () => {
    await monthly();
    const [{ id: bo }] = await query<{ id: string }>(
      "insert into users (email, status, plan, currency, sharing, stripe_subscription, first_charge_at) values ('bo@example.com', 'active', 'monthly', 'USD', 'share', 'sub_2', '2026-12-03T11:05:00Z') returning id",
    );
    const [{ id: cy }] = await query<{ id: string }>(
      "insert into users (email, status, plan, currency, sharing, stripe_subscription, first_charge_at) values ('cy@example.com', 'active', 'monthly', 'USD', 'share', 'sub_3', '2026-12-03T11:05:00Z') returning id",
    );
    await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
    await query("insert into cora_user_weeks (user_id, week_of, outcome) values ($1, $2, 'none')", [cy, WEEK]);
    const deps = { settings, now: new Date("2026-12-15T15:00:00Z"), adjust: fakeAdjustments(), ...mail() };
    await excuseWeek(query, deps, { week: WEEK, userId: bo, by: ADMIN });
    await recordWeek(query, WEEK, settings);
    expect(await excuseWeek(query, deps, { week: WEEK, userId: null, by: ADMIN })).toBe(2);
    expect(await undoExcuseForEveryone(query, deps, { week: WEEK, by: ADMIN })).toBe(2);
    const by = async (id: string) => (await query<{ result: string; excused_by: string | null }>("select result, excused_by from contribution_weeks where user_id = $1", [id]))[0];
    expect(await by(uid)).toEqual({ result: "missed", excused_by: null });
    expect(await by(bo)).toEqual({ result: "excused", excused_by: ADMIN });
    expect(await by(cy)).toEqual({ result: "excused", excused_by: "roger" });
    expect(await undoExcuseForEveryone(query, deps, { week: WEEK, by: ADMIN })).toBeNull();
    expect((await log()).map((l) => l.action)).toContain("excuse_week_undone");
  });

  it("takes only a Monday", () => {
    expect(isMonday("2026-12-14")).toBe(true);
    expect(isMonday("2026-12-15")).toBe(false);
    expect(isMonday("2026-13-01")).toBe(false);
  });
});

describe("changing a member's address for them (Unit 16)", () => {
  it("updates it, ends every session, marks Stripe for the sync, and tells both addresses", async () => {
    await query("insert into sessions (id_hash, user_id, method, expires_at) values ('h1', $1, 'email', now() + interval '1 day')", [uid]);
    const r = await changeUserEmail(query, mail(), ADMIN, uid, "Ana.New@Example.com");
    expect(r).toMatchObject({ ok: true });
    expect(await u()).toMatchObject({ email: "ana.new@example.com", stripe_email_synced: false });
    expect(await query("select 1 from sessions")).toEqual([]);
    expect(sent.map((m) => m.to[0]).sort()).toEqual(["ana.new@example.com", "ana@example.com"]);
    expect(await log()).toEqual([{ admin_email: ADMIN, user_id: uid, action: "change_email" }]);
  });

  it("refuses an admin's own account, in the check and in the update", async () => {
    await query("update users set email = $1 where id = $2", [ADMIN, uid]);
    expect(await changeUserEmail(query, mail(), ADMIN, uid, "else@example.com")).toMatchObject({ ok: false, message: expect.stringMatching(/admin/) });
    expect((await u()).email).toBe(ADMIN);
    expect(sent).toEqual([]);
  });

  it("warns the admin, alerts both admins and logs it when a notice fails", async () => {
    const failing: Transport = async (m) => {
      if (m.to[0] === "ana@example.com") return { ok: false, error: "bounced", retryable: false };
      sent.push(m);
      return { ok: true };
    };
    const r = await changeUserEmail(query, { query, transport: failing, sleep: async () => {} }, ADMIN, uid, "ana.new@example.com");
    expect(r).toMatchObject({ ok: true, message: expect.stringMatching(/could not be sent/) });
    expect(sent.some((m) => m.subject.includes("notice did not go"))).toBe(true);
    const [row] = await query<{ detail: Record<string, unknown> }>("select detail from admin_actions where action = 'change_email'");
    expect(row.detail).toMatchObject({ noticeToNew: "sent", noticeToOld: "failed" });
  });

  it("refuses an address another account uses, or an admin's", async () => {
    await query("insert into users (email) values ('bo@example.com')");
    expect(await changeUserEmail(query, mail(), ADMIN, uid, "BO@example.com")).toMatchObject({ ok: false });
    expect(await changeUserEmail(query, mail(), ADMIN, uid, ADMIN)).toMatchObject({ ok: false });
    expect((await u()).email).toBe("ana@example.com");
    expect(sent).toEqual([]);
  });
});

describe("closing and deleting an account", () => {
  const deps = (gw: BillingGateway | null) => ({ settings, now: SIX_AM, adjust: fakeAdjustments(), gw, ...mail() });

  it("is refused while Stripe has a live subscription", async () => {
    const r = await closeAccount(query, deps(fakeBilling([{ id: "sub_1", status: "active", claimId: null }])), ADMIN, uid);
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/Cancel it in Stripe/) });
    expect((await u()).status).toBe("trial");
  });

  it("closes: drops a pending difference, ends sessions and open orders, and logs it", async () => {
    await query("update users set status = 'active', stripe_subscription = 'sub_1', first_charge_at = '2026-12-03T11:05:00Z'");
    await query("insert into pending_adjustments (user_id, period_start, amount_cents, currency) values ($1, '2026-12-03', 500, 'USD')", [uid]);
    await query("insert into sessions (id_hash, user_id, method, expires_at) values ('h1', $1, 'email', now() + interval '1 day')", [uid]);
    await query("insert into orders (user_id, week_of) values ($1, $2)", [uid, WEEK]);
    expect(await closeAccount(query, deps(fakeBilling([{ id: "sub_1", status: "canceled", claimId: null }])), ADMIN, uid)).toMatchObject({ ok: true });
    expect((await u()).status).toBe("closed");
    expect(await query("select status, deleted_reason from pending_adjustments")).toEqual([{ status: "deleted", deleted_reason: "closed" }]);
    expect(await query("select 1 from sessions")).toEqual([]);
    expect(await query("select status from orders")).toEqual([{ status: "cancelled" }]);
    expect((await log()).map((l) => l.action)).toEqual(["close_account"]);
  });

  it("never closes or deletes an admin's own account", async () => {
    await query("update users set email = $1 where id = $2", [ADMIN, uid]);
    expect(await closeAccount(query, deps(fakeBilling()), ADMIN, uid)).toMatchObject({ ok: false, message: expect.stringMatching(/admin/) });
    await query("update users set status = 'closed'");
    expect(await deleteAccount(query, ADMIN, uid, ADMIN)).toMatchObject({ ok: false, message: expect.stringMatching(/admin/) });
    expect(await query("select 1 from users")).toHaveLength(1);
    expect(await log()).toEqual([]);
  });

  it("closing again re-runs the clean-up and logs once", async () => {
    expect(await closeAccount(query, deps(fakeBilling()), ADMIN, uid)).toMatchObject({ ok: true });
    // Something left behind (say, the clean-up failed half-way the first time).
    await query("insert into sessions (id_hash, user_id, method, expires_at) values ('h2', $1, 'email', now() + interval '1 day')", [uid]);
    await query("insert into orders (user_id, week_of) values ($1, $2)", [uid, WEEK]);
    expect(await closeAccount(query, deps(fakeBilling()), ADMIN, uid)).toMatchObject({ ok: true, message: expect.stringMatching(/already closed/) });
    expect(await query("select 1 from sessions")).toEqual([]);
    expect(await query("select status from orders")).toEqual([{ status: "cancelled" }]);
    expect((await log()).map((l) => l.action)).toEqual(["close_account"]);
  });

  it("deleting the account removes the member's notes and admin-entered replies (B3 Unit 5)", async () => {
    await query("insert into member_feedback (user_id, week_of, source, body) values ($1, $2, 'member_note', 'my note')", [uid, WEEK]);
    await query("insert into member_feedback (user_id, week_of, source, body, entered_by) values ($1, $2, 'admin_reply', 'a reply', $3)", [uid, WEEK, ADMIN]);
    await query("update users set status = 'closed'");
    expect(await deleteAccount(query, ADMIN, uid, "ana@example.com")).toMatchObject({ ok: true });
    expect(await query("select 1 from member_feedback")).toEqual([]);
  });

  it("won't delete while a dropped higher-rate item may still be in Stripe", async () => {
    await query("update users set status = 'closed'");
    await query("insert into pending_adjustments (user_id, period_start, amount_cents, currency, stripe_item, status) values ($1, '2026-12-03', 500, 'USD', 'ii_1', 'deleted')", [uid]);
    expect(await deleteAccount(query, ADMIN, uid, "ana@example.com")).toMatchObject({ ok: false, message: expect.stringMatching(/Stripe/) });
    await query("update pending_adjustments set stripe_deleted_at = now()");
    expect(await deleteAccount(query, ADMIN, uid, "ana@example.com")).toMatchObject({ ok: true });
  });

  it("won't delete a sponsored member while a month they held a billable seat in isn't invoiced (B2 Unit 10)", async () => {
    const sponsor = await testSponsor(query);
    await query("update users set sponsor_id = $1, sponsor_seat = 1 where id = $2", [sponsor, uid]);
    await query("insert into sponsor_seat_history (sponsor_id, user_id, seat, held_from) values ($1, $2, 1, '2026-10-01T12:00:00Z')", [sponsor, uid]);
    for (const w of ["2026-10-19", "2026-10-26", "2026-11-02"]) {
      await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count, delivered_at) values ($1, $2, 'picked', 3, now())", [uid, w]);
    }
    expect(await closeAccount(query, deps(fakeBilling()), ADMIN, uid)).toMatchObject({ ok: true });
    const [{ month }] = await query<{ month: string }>("select to_char(date_trunc('month', held_to at time zone 'America/Toronto'), 'YYYY-MM-DD') as month from sponsor_seat_history");
    expect(await deleteAccount(query, ADMIN, uid, "ana@example.com")).toEqual({ ok: false, message: expect.stringMatching(/sponsored seat in a month whose sponsor invoice isn’t sent yet/) });
    // Every month from the third list (November) to the close, invoiced and sent: then it may go.
    await query(
      `insert into sponsor_invoices (sponsor_id, month, stripe_invoice, sent_at)
       select $1, m::date, 'in_' || to_char(m, 'YYYYMM'), now() from generate_series('2026-11-01'::date, $2::date, interval '1 month') m`,
      [sponsor, month],
    );
    await query("update sponsor_invoices set sent_at = null where month = $1", [month]);
    expect(await deleteAccount(query, ADMIN, uid, "ana@example.com")).toMatchObject({ ok: false });
    await query("update sponsor_invoices set sent_at = now()");
    expect(await deleteAccount(query, ADMIN, uid, "ana@example.com")).toMatchObject({ ok: true });
  });

  it("a sponsored member who never reached a third list has nothing to bill, and may be deleted", async () => {
    const sponsor = await testSponsor(query);
    await query("update users set sponsor_id = $1, status = 'closed' where id = $2", [sponsor, uid]);
    await query("insert into sponsor_seat_history (sponsor_id, user_id, seat, held_from) values ($1, $2, 1, '2026-10-01T12:00:00Z')", [sponsor, uid]);
    expect(await deleteAccount(query, ADMIN, uid, "ana@example.com")).toMatchObject({ ok: true });
  });

  it("deletes only a closed account, with its email typed, and keeps the log", async () => {
    expect(await deleteAccount(query, ADMIN, uid, "ana@example.com")).toMatchObject({ ok: false });
    await query("update users set status = 'closed'");
    expect(await deleteAccount(query, ADMIN, uid, "someone@example.com")).toMatchObject({ ok: false });
    expect(await deleteAccount(query, ADMIN, uid, "ANA@example.com")).toMatchObject({ ok: true });
    expect(await query("select 1 from users")).toEqual([]);
    expect((await log()).map((l) => l.action)).toEqual(["delete_account"]);
  });
});

describe("other row actions", () => {
  it("stores an added run by route admin for the current week", async () => {
    const r = await addRunForUser(query, ADMIN, uid, "# Zack run\n\nSome report text.", { cutoff: settings.runCutoff, now: new Date("2026-12-10T15:00:00Z") });
    expect(r).toMatchObject({ ok: true, stored: { week_of: WEEK, kind: "run" } });
    expect(await query("select route, status from runs")).toEqual([{ route: "admin", status: "received" }]);
    expect(await addRunForUser(query, ADMIN, uid, "   ", { cutoff: settings.runCutoff, now: SIX_AM })).toMatchObject({ ok: false });
    expect((await log()).map((l) => l.action)).toEqual(["add_run"]);
  });

  it("refuses an extra free list for a trial with no card yet, with the waiting message, and logs nothing", async () => {
    // A no-card trial with a Stripe customer (Payment opened) and a list counted (an admin fixed it by hand).
    await query("update users set trial_started_at = null, free_lists_used = 1 where id = $1", [uid]);
    expect(await giveExtraFreeList(query, ADMIN, uid)).toEqual({ ok: false, message: "Waiting for the member’s card." });
    expect((await u()).free_lists_used).toBe(1);
    expect(await log()).toEqual([]);
    // A sponsored member needs no card.
    await query("update users set sponsor_id = $1 where id = $2", [await testSponsor(query), uid]);
    expect(await giveExtraFreeList(query, ADMIN, uid)).toMatchObject({ ok: true });
  });

  it("adds a run for a trial with no card yet, as Zack's own key would: runs count nothing before a card, and the list is held", async () => {
    await query("update users set trial_started_at = null, sponsor_id = null where id = $1", [uid]);
    const r = await addRunForUser(query, ADMIN, uid, "# Zack run\n\nSome report text.", { cutoff: settings.runCutoff, now: new Date("2026-12-10T15:00:00Z") });
    expect(r).toMatchObject({ ok: true, stored: { week_of: WEEK, kind: "run" } });
    expect(await query("select route, status from runs")).toEqual([{ route: "admin", status: "received" }]);
    expect((await log()).map((l) => l.action)).toEqual(["add_run"]);
  });

  it("sends a template nudge once a week, and saves the note", async () => {
    expect(await sendNudge(query, mail(), ADMIN, uid, "no_run", WEEK)).toMatchObject({ ok: true });
    expect(await sendNudge(query, mail(), ADMIN, uid, "no_run", WEEK)).toMatchObject({ ok: false });
    expect(sent.map((m) => m.subject)).toEqual(["Zack’s report hasn’t arrived yet"]);
    expect(await saveNote(query, ADMIN, uid, "  Called on Tuesday. ")).toMatchObject({ ok: true });
    expect((await u()).admin_note).toBe("Called on Tuesday.");
    expect((await log()).map((l) => l.action)).toEqual(["nudge", "note"]);
  });
});
