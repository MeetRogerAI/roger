import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { applyIdleRetention, applyRetention, cleanUpExpired, IDLE_CLOCK_FROM, KEEP_NOTIFICATION_KINDS, purgeOldRecords, purgeSessionGuests } from "./retention";
import { sendUnsentWelcomes } from "@/lib/signup/finish";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";

let query: Query;
const NOW = new Date("2027-03-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const EPOCH = "2000-01-01T00:00:00Z";

async function member(
  email: string,
  cols: Record<string, unknown>,
  has: { run?: "live" | "deleted"; unshared?: boolean; profile?: boolean } = {},
): Promise<{ id: string; run: string; pooled: string; unshared: string; pool: string }> {
  const keys = Object.keys(cols);
  const [{ id }] = await query<{ id: string }>(
    `insert into users (email, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [email, ...Object.values(cols)],
  );
  const [{ id: run }] = await query<{ id: string }>(
    has.run === "deleted"
      ? "insert into runs (user_id, week_of, route, agent, sharing, raw_text, parsed, status) values ($1, '2026-11-30', 'connector', 'hark', 'share', '', null, 'deleted') returning id"
      : "insert into runs (user_id, week_of, route, agent, sharing, raw_text, parsed) values ($1, '2026-11-30', 'connector', 'hark', 'share', 'the report', '{}'::jsonb) returning id",
    [id],
  );
  const [{ id: pool }] = await query<{ id: string }>(
    "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('Pooled', 'Marketing', 'd', 'p', 'i', '2026-11-30', '2026-11-30') returning id",
  );
  const play = async (position: number, poolId: string | null) =>
    (
      await query<{ id: string }>(
        "insert into plays (run_id, user_id, week_of, set_, position, title, category, body, shareable, pool_play_id) values ($1, $2, '2026-11-30', 'A', $3, 't', 'Marketing', '{}'::jsonb, $4, $5) returning id",
        [run, id, position, poolId != null, poolId],
      )
    )[0].id;
  const pooled = await play(1, pool);
  const unshared = has.unshared === false ? "" : await play(2, null);
  if (has.profile !== false) await query("insert into zack_profiles (user_id, week_of, route, raw_text) values ($1, '2026-11-30', 'connector', 'profile')", [id]);
  return { id, run, pooled, unshared, pool };
}

/** A member note and an admin reply for the member (B3 Unit 5). */
async function feedback(userId: string) {
  await query("insert into member_feedback (user_id, week_of, source, body) values ($1, '2026-11-30', 'member_note', 'my note')", [userId]);
  await query("insert into member_feedback (user_id, week_of, source, body, entered_by) values ($1, '2026-11-30', 'admin_reply', 'a reply', 'peter@example.com')", [userId]);
}

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("retention (spec B.14)", () => {
  it("erases runs and unshared plays 90 days after access ends, and keeps pooled plays", async () => {
    const m = await member("gone@example.com", { status: "cancelled", access_ends_at: daysAgo(91) });
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toEqual({ users: 1, runs: 1, plays: 1, profiles: 1, feedback: 0 });
    expect(await query("select status, raw_text, parsed from runs")).toEqual([{ status: "deleted", raw_text: "", parsed: null }]);
    expect((await query<{ id: string }>("select id from plays")).map((p) => p.id)).toEqual([m.pooled]);
    expect(await query("select id from pool_plays")).toEqual([{ id: m.pool }]);
    expect(await query("select status, raw_text from zack_profiles")).toEqual([{ status: "deleted", raw_text: "" }]);
    // Nothing left to do: the next pass finds no one.
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toEqual({ users: 0, runs: 0, plays: 0, profiles: 0, feedback: 0 });
  });

  it("erases the member's notes and admin-entered replies with the runs (B3 Unit 5)", async () => {
    const m = await member("gone@example.com", { status: "cancelled", access_ends_at: daysAgo(91) });
    const kept = await member("kept@example.com", { status: "cancelled", access_ends_at: daysAgo(10) });
    await feedback(m.id);
    await feedback(kept.id);
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toEqual({ users: 1, runs: 1, plays: 1, profiles: 1, feedback: 2 });
    expect(await query("select user_id from member_feedback")).toEqual([{ user_id: kept.id }, { user_id: kept.id }]);
  });

  it("erases a member whose only data left is feedback", async () => {
    const m = await member("notes@example.com", { status: "closed", access_ends_at: daysAgo(120) }, { run: "deleted", unshared: false, profile: false });
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toEqual({ users: 0, runs: 0, plays: 0, profiles: 0, feedback: 0 });
    await feedback(m.id);
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toEqual({ users: 1, runs: 0, plays: 0, profiles: 0, feedback: 2 });
    expect(await query("select 1 from member_feedback")).toEqual([]);
  });

  it("leaves a member at day 89 untouched", async () => {
    await member("recent@example.com", { status: "closed", access_ends_at: daysAgo(89) });
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toMatchObject({ users: 0 });
    expect(await query("select status, raw_text from runs")).toEqual([{ status: "received", raw_text: "the report" }]);
    expect(await query("select count(*)::int as n from plays")).toEqual([{ n: 2 }]);
  });

  it("never touches a member with access, whatever their dates say", async () => {
    await member("back@example.com", { status: "active", access_ends_at: daysAgo(200) });
    await member("noend@example.com", { status: "closed" });
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toMatchObject({ users: 0 });
  });
});

describe("clean-up of expired sign-in material", () => {
  it("removes links a day past expiry, expired sessions, old Google states and spent counters, and keeps live ones", async () => {
    const [{ id }] = await query<{ id: string }>("insert into users (email) values ('a@example.com') returning id");
    await query(
      `insert into login_tokens (token_hash, email, expires_at) values
        ('old', 'a@example.com', now() - interval '2 days'), ('recent', 'a@example.com', now() - interval '1 hour'), ('live', 'a@example.com', now() + interval '10 minutes')`,
    );
    await query("insert into sessions (id_hash, user_id, method, expires_at) values ('dead', $1, 'email', now() - interval '1 minute'), ('live', $1, 'email', now() + interval '1 day')", [id]);
    await query("insert into oauth_states (state_hash, verifier, nonce, expires_at) values ('s1', 'v', 'n', now() - interval '2 hours'), ('s2', 'v', 'n', now() + interval '5 minutes')");
    await query("insert into rate_events (key, window_start, expires_at) values ('k', 1, now() - interval '1 minute'), ('k', 2, now() + interval '1 minute')");
    expect(await cleanUpExpired(query)).toEqual({ tokens: 1, sessions: 1, states: 1, counters: 1 });
    expect((await query<{ token_hash: string }>("select token_hash from login_tokens order by 1")).map((r) => r.token_hash)).toEqual(["live", "recent"]);
    expect(await query("select id_hash from sessions")).toEqual([{ id_hash: "live" }]);
  });
});

describe("retention for idle members (privacy P3, 2026-11-27)", () => {
  const idle = (n: number) => ({ created_at: daysAgo(n), last_seen_at: daysAgo(n) });
  const age = async (m: { id: string; run: string }, n: number) => {
    await query("update runs set received_at = $2 where id = $1", [m.run, daysAgo(n)]);
  };

  it("erases a one-at-a-time member idle for over a year, keeping their pooled plays", async () => {
    const m = await member("idle@example.com", { status: "active", plan: "per_run", ...idle(400) });
    await age(m, 366);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toEqual({ users: 1, runs: 1, plays: 1, profiles: 1, feedback: 0 });
    expect(await query("select status, raw_text, parsed from runs")).toEqual([{ status: "deleted", raw_text: "", parsed: null }]);
    expect((await query<{ id: string }>("select id from plays")).map((p) => p.id)).toEqual([m.pooled]);
    expect(await query("select status, raw_text from zack_profiles")).toEqual([{ status: "deleted", raw_text: "" }]);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toEqual({ users: 0, runs: 0, plays: 0, profiles: 0, feedback: 0 });
  });

  it("erases an idle member's feedback too, also when it is all that is left", async () => {
    const m = await member("idle@example.com", { status: "active", plan: "per_run", ...idle(400) });
    await age(m, 366);
    await feedback(m.id);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toEqual({ users: 1, runs: 1, plays: 1, profiles: 1, feedback: 2 });
    expect(await query("select 1 from member_feedback")).toEqual([]);
    // Feedback alone is still data to erase.
    const n = await member("notes@example.com", { status: "held", hold_reason: "renewal_unpaid", ...idle(400) }, { run: "deleted", unshared: false, profile: false });
    await age(n, 400);
    await feedback(n.id);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toEqual({ users: 1, runs: 0, plays: 0, profiles: 0, feedback: 2 });
  });

  it("erases a held member idle for over a year", async () => {
    const m = await member("held@example.com", { status: "held", hold_reason: "renewal_unpaid", ...idle(500) });
    await age(m, 400);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toMatchObject({ users: 1 });
  });

  it("leaves a member at exactly 365 days idle, and one with a recent run, order, sign-in or live session", async () => {
    const edge = await member("edge@example.com", { status: "active", plan: "per_run", ...idle(365) });
    await age(edge, 365);
    const ran = await member("ran@example.com", { status: "active", plan: "per_run", ...idle(400) });
    await age(ran, 30);
    const ordered = await member("ordered@example.com", { status: "active", plan: "per_run", ...idle(400) });
    await age(ordered, 400);
    await query("insert into orders (user_id, week_of, created_at) values ($1, '2027-01-04', $2)", [ordered.id, daysAgo(20)]);
    const seen = await member("seen@example.com", { status: "held", hold_reason: "renewal_unpaid", created_at: daysAgo(400), last_seen_at: daysAgo(10) });
    await age(seen, 400);
    const live = await member("live@example.com", { status: "held", hold_reason: "renewal_unpaid", ...idle(400) });
    await age(live, 400);
    await query("insert into sessions (id_hash, user_id, method, created_at, expires_at, last_seen_at) values ('s', $1, 'email', $2, $3, $2)", [live.id, daysAgo(5), daysAgo(-25)]);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toMatchObject({ users: 0 });
    expect(await query("select count(*)::int as n from runs where status = 'deleted'")).toEqual([{ n: 0 }]);
  });

  it("never touches a monthly member with access, or a trial, however long idle", async () => {
    const a = await member("monthly@example.com", { status: "active", plan: "monthly", ...idle(800) });
    await age(a, 800);
    const t = await member("trial@example.com", { status: "trial", ...idle(800) });
    await age(t, 800);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toMatchObject({ users: 0 });
  });

  it("leaves cancelled and closed members to the 90-day rule, whatever their plan", async () => {
    const c = await member("cancelled@example.com", { status: "cancelled", plan: "per_run", access_ends_at: daysAgo(30), ...idle(400) });
    await age(c, 400);
    const z = await member("closed@example.com", { status: "closed", plan: "per_run", access_ends_at: daysAgo(30), ...idle(400) });
    await age(z, 400);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toMatchObject({ users: 0 });
    expect(await applyRetention(query, { now: NOW, retentionDays: 90 })).toMatchObject({ users: 0 });
    expect(await applyRetention(query, { now: new Date(NOW.getTime() + 61 * 86_400_000), retentionDays: 90 })).toMatchObject({ users: 2 });
  });

  it("erases whatever is left: an unshared play alone, or a profile alone; a member with only pooled plays is done", async () => {
    const p = await member("plays@example.com", { status: "active", plan: "per_run", ...idle(400) }, { run: "deleted", profile: false });
    await age(p, 400);
    const z = await member("profile@example.com", { status: "held", hold_reason: "renewal_unpaid", ...idle(400) }, { run: "deleted", unshared: false });
    await age(z, 400);
    const d = await member("done@example.com", { status: "active", plan: "per_run", ...idle(400) }, { run: "deleted", unshared: false, profile: false });
    await age(d, 400);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toEqual({ users: 2, runs: 0, plays: 1, profiles: 1, feedback: 0 });
  });

  it("counts a new account as activity even with no sign-in recorded, and erases an old one with none", async () => {
    const fresh = await member("fresh@example.com", { status: "active", plan: "per_run", created_at: daysAgo(30), last_seen_at: null });
    await age(fresh, 400);
    const old = await member("old@example.com", { status: "active", plan: "per_run", created_at: daysAgo(400), last_seen_at: null });
    await age(old, 400);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toMatchObject({ users: 1 });
    expect(await query("select u.email from users u join runs r on r.user_id = u.id where r.status = 'deleted'")).toEqual([{ email: "old@example.com" }]);
  });

  it("counts a charge or a card saved in the last year as activity", async () => {
    const charged = await member("charged@example.com", { status: "held", hold_reason: "first_charge_failed", ...idle(400) });
    await age(charged, 400);
    await query("insert into charge_attempts (user_id, purpose, week_of, attempt, claimed_at) values ($1, 'first_charge', '2027-01-04', 1, $2)", [charged.id, daysAgo(40)]);
    const carded = await member("carded@example.com", { status: "held", hold_reason: "renewal_unpaid", ...idle(400) });
    await age(carded, 400);
    await query("insert into card_updates (session_id, user_id, created_at) values ('cs_test', $1, $2)", [carded.id, daysAgo(40)]);
    expect(await applyIdleRetention(query, { now: NOW, clockFrom: EPOCH })).toMatchObject({ users: 0 });
  });

  it("starts the idle clock no earlier than the day P3 shipped, so silence from before it erases no one", async () => {
    const shipped = new Date(IDLE_CLOCK_FROM);
    const at = (days: number) => new Date(shipped.getTime() + days * 86_400_000);
    const m = await member("legacy@example.com", { status: "active", plan: "per_run", created_at: daysAgo(900), last_seen_at: null });
    await age(m, 900);
    expect(await applyIdleRetention(query, { now: at(100) })).toMatchObject({ users: 0 });
    expect(await applyIdleRetention(query, { now: at(365) })).toMatchObject({ users: 0 });
    expect(await applyIdleRetention(query, { now: at(366) })).toMatchObject({ users: 1 });
  });

  it("works through a backlog in bounded passes", async () => {
    for (const e of ["a", "b", "c"]) await age(await member(`${e}@example.com`, { status: "active", plan: "per_run", ...idle(400) }), 400);
    expect(await applyIdleRetention(query, { now: NOW, limit: 2, clockFrom: EPOCH })).toMatchObject({ users: 2 });
    expect(await applyIdleRetention(query, { now: NOW, limit: 2, clockFrom: EPOCH })).toMatchObject({ users: 1 });
    expect(await applyIdleRetention(query, { now: NOW, limit: 2, clockFrom: EPOCH })).toMatchObject({ users: 0 });
  });
});

describe("old records (privacy P6, 2026-11-27)", () => {
  // NOW is the 1st of a month, so stepping months back never overflows a month end.
  const monthsAgo = (n: number) => {
    const d = new Date(NOW);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString();
  };

  it("deletes sign-up interest over 12 months old that never became an account", async () => {
    await query("insert into users (email) values ('Joined@example.com'), ('lower@example.com')");
    await query(
      `insert into leads (email, kind, persona, created_at) values
        ('old@example.com', 'interest', 'p', $1), ('joined@example.com', 'interest', 'p', $1), ('LOWER@Example.com', 'pack', 'p', $1), ('young@example.com', 'interest', 'p', $2)`,
      [monthsAgo(13), monthsAgo(11)],
    );
    expect(await purgeOldRecords(query, { now: NOW })).toMatchObject({ leads: 1 });
    expect((await query<{ email: string }>("select email from leads order by 1")).map((r) => r.email)).toEqual(["LOWER@Example.com", "joined@example.com", "young@example.com"]);
  });

  it("deletes notification records over 12 months old, but keeps the welcome record so it is never sent twice", async () => {
    await query(
      `insert into notifications (recipient, kind, ref, status, claimed_at) values
        ('u1', 'monday_list', '2025-12-01', 'sent', $1), ('u1', 'monday_list', '2026-05-04', 'sent', $2), ('u1', 'welcome', 'signup', 'sent', $1)`,
      [monthsAgo(13), monthsAgo(11)],
    );
    expect(await purgeOldRecords(query, { now: NOW })).toMatchObject({ notifications: 1 });
    expect((await query<{ ref: string }>("select ref from notifications order by 1")).map((r) => r.ref)).toEqual(["2026-05-04", "signup"]);
  });

  it("deletes finished Stripe event records over 18 months old, never one still processing", async () => {
    await query(
      `insert into stripe_events (id, type, status, claimed_at) values
        ('evt_old', 'invoice.paid', 'done', $1), ('evt_oldfail', 'invoice.paid', 'failed', $1), ('evt_stuck', 'invoice.paid', 'processing', $1), ('evt_17', 'invoice.paid', 'done', $2)`,
      [monthsAgo(19), monthsAgo(17)],
    );
    expect(await purgeOldRecords(query, { now: NOW })).toMatchObject({ stripeEvents: 2 });
    expect((await query<{ id: string }>("select id from stripe_events order by 1")).map((r) => r.id)).toEqual(["evt_17", "evt_stuck"]);
  });

  it("cuts at exactly 12 and 18 months: on the line is kept, a second past it is deleted", async () => {
    const cut = async (months: number, extraMs: number) => (await query<{ at: string }>(`select ($1::timestamptz - make_interval(months => $2) - make_interval(secs => $3))::text as at`, [NOW.toISOString(), months, extraMs / 1000]))[0].at;
    await query("insert into leads (email, kind, persona, created_at) values ('on@example.com', 'interest', 'p', $1), ('past@example.com', 'interest', 'p', $2)", [await cut(12, 0), await cut(12, 1000)]);
    await query("insert into notifications (recipient, kind, ref, claimed_at) values ('u', 'monday_list', 'on', $1), ('u', 'monday_list', 'past', $2)", [await cut(12, 0), await cut(12, 1000)]);
    await query("insert into stripe_events (id, type, status, claimed_at) values ('evt_on', 't', 'done', $1), ('evt_past', 't', 'done', $2)", [await cut(18, 0), await cut(18, 1000)]);
    expect(await purgeOldRecords(query, { now: NOW })).toEqual({ leads: 1, notifications: 1, stripeEvents: 1 });
    expect(await query("select email from leads")).toEqual([{ email: "on@example.com" }]);
    expect(await query("select ref from notifications")).toEqual([{ ref: "on" }]);
    expect(await query("select id from stripe_events")).toEqual([{ id: "evt_on" }]);
  });

  it("dates a notification by when it was sent, and a Stripe event by when it was finished", async () => {
    await query("insert into notifications (recipient, kind, ref, status, claimed_at, sent_at) values ('u', 'monday_list', 'retried', 'sent', $1, $2), ('u', 'monday_list', 'failed', 'failed', $1, null)", [monthsAgo(14), monthsAgo(2)]);
    await query("insert into stripe_events (id, type, status, claimed_at, done_at) values ('evt_late', 't', 'done', $1, $2)", [monthsAgo(20), monthsAgo(1)]);
    expect(await purgeOldRecords(query, { now: NOW })).toEqual({ leads: 0, notifications: 1, stripeEvents: 0 });
    expect(await query("select ref from notifications")).toEqual([{ ref: "retried" }]);
  });

  it("never sends a welcome twice after the purge: the kept welcome record still guards the sweep", async () => {
    expect(KEEP_NOTIFICATION_KINDS).toContain("welcome");
    const signedUp = "2026-12-01T15:00:00Z";
    const later = new Date("2028-01-15T15:00:00Z");
    const [{ id }] = await query<{ id: string }>(
      "insert into users (email, status, signup_finished_at, signup_step) values ('ana@example.com', 'trial', $1, 'done') returning id",
      [signedUp],
    );
    await query("insert into notifications (recipient, kind, ref, status, claimed_at, sent_at) values ($1, 'welcome', 'signup', 'sent', $2, $2)", [id, signedUp]);
    await purgeOldRecords(query, { now: later });
    expect(await query("select kind from notifications")).toEqual([{ kind: "welcome" }]);
    const sent: unknown[] = [];
    const transport: Transport = async (m) => {
      sent.push(m);
      return { ok: true };
    };
    expect(await sendUnsentWelcomes(query, { settings: mergeV3([]), now: later, query, transport, sleep: async () => {} })).toBe(0);
    expect(sent).toEqual([]);
  });

  it("is bounded per pass", async () => {
    for (let i = 0; i < 3; i++) await query("insert into notifications (recipient, kind, ref, claimed_at) values ('u', 'monday_list', $1, $2)", [`w${i}`, monthsAgo(14)]);
    expect(await purgeOldRecords(query, { now: NOW, limit: 2 })).toMatchObject({ notifications: 2 });
    expect(await purgeOldRecords(query, { now: NOW, limit: 2 })).toMatchObject({ notifications: 1 });
  });
});

describe("session guest retention (B2 plan Unit 9)", () => {
  async function guestOn(date: string, email: string, linkedTo: string | null) {
    const [{ id: inviter }] = await query<{ id: string }>(`insert into users (email, status) values ($1, 'active') returning id`, [`inviter-${email}`]);
    const [{ id: ref }] = await query<{ id: string }>(
      `insert into referrals (referrer_id, referred_user_id, referred_email, source, stage) values ($1, $2, $3, 'guest', $4) returning id`,
      [inviter, linkedTo, linkedTo ? null : email, linkedTo ? "trial" : "invited"],
    );
    await query(`insert into session_guests (token_hash, inviter_id, referral_id, session_date, name, email) values ($1, $2, $3, $4::date, 'Guest', $5)`, [`h-${email}`, inviter, ref, date, email]);
  }

  it("removes an unconverted guest's name and email 90 days after the session, and keeps the rest", async () => {
    // NOW is 2027-03-01 (Toronto); 90 days before is 2026-12-01.
    await guestOn("2026-12-01", "old@example.com", null);
    await guestOn("2026-12-02", "recent@example.com", null);
    const [{ id: member }] = await query<{ id: string }>(`insert into users (email, status) values ('joined@example.com', 'trial') returning id`);
    await guestOn("2026-11-01", "joined@example.com", member);

    expect(await purgeSessionGuests(query, { now: NOW })).toEqual({ guests: 1, referrals: 1 });
    const rows = await query<{ name: string | null; email: string | null; session_date: string }>(`select name, email, session_date::text from session_guests order by session_date`);
    expect(rows).toEqual([
      { name: "Guest", email: "joined@example.com", session_date: "2026-11-01" },
      { name: null, email: null, session_date: "2026-12-01" },
      { name: "Guest", email: "recent@example.com", session_date: "2026-12-02" },
    ]);
    expect((await query<{ referred_email: string | null }>(`select referred_email from referrals where referred_email is not null`)).map((r) => r.referred_email)).toEqual(["recent@example.com"]);
    expect(await purgeSessionGuests(query, { now: NOW })).toEqual({ guests: 0, referrals: 0 });
  });

  it("keeps a shared referral's address while a later invitation still holds it, then clears it with the last one", async () => {
    const [{ id: ken }] = await query<{ id: string }>(`insert into users (email, status) values ('ken@example.com', 'active') returning id`);
    const [{ id: ref }] = await query<{ id: string }>(`insert into referrals (referrer_id, referred_email, source, stage) values ($1, 'ana@example.com', 'guest', 'invited') returning id`, [ken]);
    const add = (date: string, hash: string) =>
      query(`insert into session_guests (token_hash, inviter_id, referral_id, session_date, name, email, email_key) values ($1, $2, $3, $4::date, 'Ana', 'ana@example.com', 'ana@example.com')`, [hash, ken, ref, date]);
    await add("2026-11-24", "h1");
    await add("2026-12-15", "h2");
    expect(await purgeSessionGuests(query, { now: NOW })).toEqual({ guests: 1, referrals: 0 });
    expect(await query(`select referred_email from referrals`)).toEqual([{ referred_email: "ana@example.com" }]);
    expect(await query(`select email_key from session_guests where token_hash = 'h1'`)).toEqual([{ email_key: null }]);
    // 90 days after the second session, both are gone.
    expect(await purgeSessionGuests(query, { now: new Date("2027-03-20T12:00:00Z") })).toEqual({ guests: 1, referrals: 1 });
    expect(await query(`select referred_email from referrals`)).toEqual([{ referred_email: null }]);
  });

  it("never clears a referral that isn't a guest row", async () => {
    const [{ id: ken }] = await query<{ id: string }>(`insert into users (email, status) values ('ken@example.com', 'active') returning id`);
    const [{ id: ref }] = await query<{ id: string }>(`insert into referrals (referrer_id, referred_email, source, stage) values ($1, 'ana@example.com', 'link', 'invited') returning id`, [ken]);
    await query(`insert into session_guests (token_hash, inviter_id, referral_id, session_date, name, email) values ('h1', $1, $2, '2026-11-24', 'Ana', 'ana@example.com')`, [ken, ref]);
    expect(await purgeSessionGuests(query, { now: NOW })).toEqual({ guests: 1, referrals: 0 });
    expect(await query(`select referred_email from referrals`)).toEqual([{ referred_email: "ana@example.com" }]);
  });
});
