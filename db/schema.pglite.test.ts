import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { splitSchema } from "./schema-split.mjs";

// Applies schema.sql to a real (in-process) Postgres, the way setup.mjs does.
const statements: string[] = splitSchema(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

let db: PGlite;
const apply = async () => {
  for (const s of statements) await db.query(s);
};

beforeAll(async () => {
  db = new PGlite();
  await apply();
}, 60_000);

const columns = async () =>
  (
    await db.query<{ t: string; c: string }>(
      "select table_name as t, column_name as c from information_schema.columns where table_schema = 'public' order by 1, 2",
    )
  ).rows.map((r) => `${r.t}.${r.c}`);

describe("schema.sql on Postgres", () => {
  it("applies a second time with no error and no change", async () => {
    const before = await columns();
    await apply();
    expect(await columns()).toEqual(before);
  });

  it("lets one seed contributor keep runs from different agents in one week, but not two from the same agent", async () => {
    const [{ id }] = (await db.query<{ id: string }>("insert into seed_contributors (label) values ('Seed 1') returning id")).rows;
    const run = (agent: string) =>
      db.query("insert into runs (contributor_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-11-16', 'seed', $2, 'share', 'x')", [id, agent]);
    await run("claude");
    await run("hark");
    await expect(run("claude")).rejects.toThrow();
  });

  it("requires a run to belong to exactly one of a user or a seed contributor", async () => {
    await expect(
      db.query("insert into runs (week_of, route, sharing, raw_text) values ('2026-11-16', 'upload', 'share', 'x')"),
    ).rejects.toThrow();
  });

  it("keeps one run per user per week, and allows a new one after deletion", async () => {
    const [{ id }] = (await db.query<{ id: string }>("insert into users (email) values ('a@example.com') returning id")).rows;
    const insert = () =>
      db.query<{ id: string }>("insert into runs (user_id, week_of, route, sharing, raw_text) values ($1, '2026-11-23', 'upload', 'share', 'x') returning id", [id]);
    const first = (await insert()).rows[0].id;
    await expect(insert()).rejects.toThrow();
    await db.query("update runs set status = 'deleted' where id = $1", [first]);
    await expect(insert()).resolves.toBeTruthy();
  });

  it("claims an email once per (recipient, kind, ref)", async () => {
    const claim = () =>
      db.query("insert into notifications (recipient, kind, ref) values ('admins', 'cora_failed', '2026-11-23') on conflict do nothing returning id");
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
  });

  it("claims a charge attempt once", async () => {
    const [{ id }] = (await db.query<{ id: string }>("insert into users (email) values ('b@example.com') returning id")).rows;
    const claim = () =>
      db.query("insert into charge_attempts (user_id, purpose, week_of, attempt) values ($1, 'first_charge', '2026-11-30', 1) on conflict do nothing returning id", [id]);
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
  });

  it("allows at most three picks per user per week and only one public sample", async () => {
    const [{ id: u }] = (await db.query<{ id: string }>("insert into users (email) values ('c@example.com') returning id")).rows;
    const [{ id: p }] = (
      await db.query<{ id: string }>(
        "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, is_public_sample) values ('t','Research','d','p','i','2026-11-16','2026-11-16', true) returning id",
      )
    ).rows;
    await expect(
      db.query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1,'2026-11-23',4,$2,50,3,'r')", [u, p]),
    ).rejects.toThrow();
    await expect(
      db.query("insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, is_public_sample) values ('t2','Research','d','p','i','2026-11-16','2026-11-16', true)"),
    ).rejects.toThrow();
  });

  it("has the payment-at-first-list columns, and keeps one promo reservation per code and member (plan 2026-11-26-001, Unit 1)", async () => {
    const cols = await columns();
    for (const c of ["users.first_teaser_at", "users.setup_session", "users.promo_code", "users.promo_coupon", "users.promo_label", "cora_user_weeks.superseded_at", "users.promo_refused_at", "users.unlock_attempted_at", "charge_attempts.coupon", "users.promo_ended_label", "users.promo_duration", "users.promo_duration_months", "users.signup_finished_at", "users.card_fingerprint"]) {
      expect(cols).toContain(c);
    }
    const [{ id }] = (await db.query<{ id: string }>("insert into users (email) values ('promo@example.com') returning id")).rows;
    const reserve = () =>
      db.query("insert into promo_reservations (promotion_code, user_id, card_fingerprint, reserved_at) values ('promo_1', $1, 'fp_1', now()) on conflict do nothing returning id", [id]);
    expect((await reserve()).rows).toHaveLength(1);
    expect((await reserve()).rows).toHaveLength(0);
    await expect(db.query("insert into promo_reservations (promotion_code, user_id) values ('promo_2', $1)", [id])).rejects.toThrow();
    await db.query("delete from users where id = $1", [id]);
    expect((await db.query("select 1 from promo_reservations")).rows).toHaveLength(0);
  });

  describe("B2 (plan 2026-11-27-001, Unit 1)", () => {
    const user = async (email: string) => (await db.query<{ id: string }>("insert into users (email) values ($1) returning id", [email])).rows[0].id;
    const referral = async (referrer: string, referred: string) =>
      (await db.query<{ id: string }>("insert into referrals (referrer_id, referred_user_id, source, stage) values ($1, $2, 'link', 'trial') returning id", [referrer, referred])).rows[0].id;
    const sponsor = (code: string, standard = 20000) =>
      db.query<{ id: string }>(
        "insert into sponsors (name, currency, standard_cents, higher_cents, seats, code_hash, billing_email) values ('Co', 'USD', $1, 40000, 5, $2, 'billing@example.com') returning id",
        [standard, code],
      );

    it("has the B2 tables and columns", async () => {
      const tables = (
        await db.query<{ t: string }>("select table_name as t from information_schema.tables where table_schema = 'public'")
      ).rows.map((r) => r.t);
      for (const t of ["referrals", "credits", "points", "session_guests", "session_attendance", "sponsors", "sponsor_invoices"]) expect(tables).toContain(t);
      const cols = await columns();
      for (const c of [
        "users.leaderboard_opt_in_at", "users.leaderboard_name_key", "users.credit_balance_cents", "users.credit_balance_at", "users.pending_referrer_id", "pool_play_contributors.contributed_at",
        "credits.uncollected_cents", "credits.offset_cents", "credits.reason", "credits.source_payment_intent", "referrals.referred_user_id",
        "session_guests.inviter_id", "points.total", "sponsors.alerted_80_at",
      ]) expect(cols).toContain(c);
    });

    it("applies again over existing users and contributors, leaving contributed_at null", async () => {
      await user("again@example.com");
      const [{ id: p }] = (
        await db.query<{ id: string }>(
          "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('t','Research','d','p','i','2026-11-16','2026-11-16') returning id",
        )
      ).rows;
      await db.query("insert into pool_play_contributors (pool_play_id, contributor) values ($1, 'someone')", [p]);
      const before = await columns();
      await apply();
      expect(await columns()).toEqual(before);
      const rows = (await db.query<{ at: string | null }>("select contributed_at as at from pool_play_contributors where pool_play_id = $1", [p])).rows;
      expect(rows).toEqual([{ at: null }]);
    });

    it("keeps one referrer per account, no self-referral, one row per referrer and guest email, and only known stages", async () => {
      const a = await user("ref-a@example.com");
      const b = await user("ref-b@example.com");
      const c = await user("ref-c@example.com");
      await referral(a, b);
      await expect(referral(c, b)).rejects.toThrow();
      await expect(referral(a, a)).rejects.toThrow();
      const guest = (email: string) => db.query("insert into referrals (referrer_id, referred_email, source) values ($1, $2, 'guest')", [a, email]);
      await guest("g1@example.com");
      await guest("g2@example.com");
      await expect(guest("G1@Example.com")).rejects.toThrow();
      await expect(db.query("insert into referrals (referrer_id, referred_email, source) values ($1, 'g1@example.com', 'guest')", [c])).resolves.toBeTruthy();
      await expect(db.query("insert into referrals (referrer_id, source, stage) values ($1, 'link', 'signed_up')", [a])).rejects.toThrow();
    });

    it("keeps one grant per referral, one clawback per refund, one lapse per close, and each Stripe transaction once", async () => {
      const a = await user("cr-a@example.com");
      const r = await referral(a, await user("cr-b@example.com"));
      const insert = (kind: string, source: string | null, extra = "") =>
        db.query(`insert into credits (user_id, referral_id, kind, amount_cents, currency, source_object_id${extra ? ", stripe_txn" : ""}) values ($1, $2, $3, 100, 'USD', $4${extra ? ", $5" : ""})`, extra ? [a, r, kind, source, extra] : [a, r, kind, source]);
      await insert("grant", "in_1");
      await expect(insert("grant", "in_2")).rejects.toThrow();

      await insert("clawback", "re_1");
      await expect(insert("clawback", "re_1")).rejects.toThrow();
      await insert("clawback", "dp_1");
      await expect(insert("clawback", null)).rejects.toThrow();

      await insert("lapse", "close_1");
      await expect(insert("lapse", "close_1")).rejects.toThrow();
      await expect(insert("lapse", null)).rejects.toThrow();

      await insert("clawback", "re_2", "cbtxn_1");
      await expect(insert("clawback", "re_3", "cbtxn_1")).rejects.toThrow();
    });

    it("refuses an unknown currency or status and a negative amount", async () => {
      const a = await user("cr-bad@example.com");
      const r = await referral(a, await user("cr-bad-b@example.com"));
      const insert = (amount: number, currency: string, status = "pending_customer") =>
        db.query("insert into credits (user_id, referral_id, kind, amount_cents, currency, status) values ($1, $2, 'grant', $3, $4, $5)", [a, r, amount, currency, status]);
      await expect(insert(100, "EUR")).rejects.toThrow();
      await expect(insert(-1, "USD")).rejects.toThrow();
      await expect(insert(100, "USD", "refunded")).rejects.toThrow();
      await expect(insert(100, "CAD", "pending_switch")).resolves.toBeTruthy();
    });

    it("keeps the ledger when the member or the referral is deleted", async () => {
      const a = await user("keep-a@example.com");
      const r = await referral(a, await user("keep-b@example.com"));
      const [{ id }] = (
        await db.query<{ id: string }>("insert into credits (user_id, referral_id, kind, amount_cents, currency, status, stripe_txn) values ($1, $2, 'grant', 100, 'USD', 'posted', 'cbtxn_keep') returning id", [a, r])
      ).rows;
      await db.query("delete from users where id = $1", [a]);
      const [ref] = (await db.query<{ referrer_id: string | null }>("select referrer_id from referrals where id = $1", [r])).rows;
      expect(ref.referrer_id).toBeNull();
      await db.query("delete from referrals where id = $1", [r]);
      const rows = (await db.query<{ user_id: string | null; referral_id: string | null; stripe_txn: string }>("select user_id, referral_id, stripe_txn from credits where id = $1", [id])).rows;
      expect(rows).toEqual([{ user_id: null, referral_id: null, stripe_txn: "cbtxn_keep" }]);
    });

    it("caches one points row per member per week", async () => {
      const a = await user("pts@example.com");
      const put = () => db.query("insert into points (user_id, week_of, adopted, confirmed, total) values ($1, '2026-11-30', 2, 1, 3)", [a]);
      await put();
      await expect(put()).rejects.toThrow();
    });

    it("keeps one session guest per member per session, and a unique guest token", async () => {
      const id = await user("host@example.com");
      const invite = (hash: string, date: string) =>
        db.query("insert into session_guests (token_hash, inviter_id, session_date, name, email) values ($1, $2, $3, 'Guest', 'guest@example.com')", [hash, id, date]);
      await invite("h1", "2026-12-01");
      await expect(invite("h2", "2026-12-01")).rejects.toThrow();
      await expect(invite("h1", "2026-12-08")).rejects.toThrow();
      await expect(invite("h3", "2026-12-08")).resolves.toBeTruthy();
    });

    it("records attendance for exactly one of a member or a guest, once per session", async () => {
      const u = await user("att@example.com");
      const [{ id: g }] = (
        await db.query<{ id: string }>("insert into session_guests (token_hash, inviter_id, session_date) values ('att_h', $1, '2026-12-01') returning id", [u])
      ).rows;
      const mark = (userId: string | null, guestId: string | null, date = "2026-12-01") =>
        db.query("insert into session_attendance (session_date, user_id, guest_id, marked_by) values ($1, $2, $3, 'admin@example.com')", [date, userId, guestId]);
      await expect(mark(null, null)).rejects.toThrow();
      await expect(mark(u, g)).rejects.toThrow();
      await mark(u, null);
      await expect(mark(u, null)).rejects.toThrow();
      await mark(null, g);
      await expect(mark(null, g)).rejects.toThrow();
      await expect(mark(u, null, "2026-12-08")).resolves.toBeTruthy();
      await expect(mark(null, g, "2026-12-08")).resolves.toBeTruthy();
    });

    it("refuses a sponsor price of 0 and a repeated code, and one invoice per sponsor per month", async () => {
      await expect(sponsor("code_zero", 0)).rejects.toThrow();
      const [{ id }] = (await sponsor("code_1")).rows;
      await expect(sponsor("code_1")).rejects.toThrow();
      const invoice = () => db.query("insert into sponsor_invoices (sponsor_id, month) values ($1, '2026-12-01')", [id]);
      await invoice();
      await expect(invoice()).rejects.toThrow();
    });

    it("links users.sponsor_id to a real sponsor, and keeps a sponsor while a member points at it", async () => {
      const u = await user("sponsored@example.com");
      await expect(db.query("update users set sponsor_id = gen_random_uuid() where id = $1", [u])).rejects.toThrow();
      const [{ id: s }] = (await sponsor("code_fk")).rows;
      await db.query("update users set sponsor_id = $1 where id = $2", [s, u]);
      await expect(db.query("delete from sponsors where id = $1", [s])).rejects.toThrow();
      await db.query("update users set sponsor_id = null where id = $1", [u]);
      await expect(db.query("delete from sponsors where id = $1", [s])).resolves.toBeTruthy();
    });

    it("keeps leaderboard name keys unique among opted-in members only, and frees a name when the account closes", async () => {
      const named = (email: string, key: string, optIn: boolean, status = "active") =>
        db.query<{ id: string }>(`insert into users (email, status, leaderboard_name_key, leaderboard_opt_in_at) values ($1, $2, $3, ${optIn ? "now()" : "null"}) returning id`, [email, status, key]);
      const a = (await named("lb1@example.com", "ace", true)).rows[0].id;
      await expect(named("lb2@example.com", "ace", true)).rejects.toThrow();
      await expect(named("lb3@example.com", "ace", false)).resolves.toBeTruthy();
      await db.query("update users set status = 'closed' where id = $1", [a]);
      expect((await db.query<{ at: string | null }>("select leaderboard_opt_in_at as at from users where id = $1", [a])).rows[0].at).toBeNull();
      await expect(named("lb4@example.com", "ace", true)).resolves.toBeTruthy();
      await expect(named("lb5@example.com", "bee", true, "cancelled")).resolves.toBeTruthy();
      expect((await db.query<{ at: string | null }>("select leaderboard_opt_in_at as at from users where email = 'lb5@example.com'")).rows[0].at).toBeNull();
      const idx = (await db.query<{ n: string }>("select indexname as n from pg_indexes where tablename = 'users' and indexname like 'users_leaderboard%'")).rows.map((r) => r.n);
      expect(idx).toEqual(["users_leaderboard_name_key"]);
    });
  });

  it("increments a rate counter in one statement", async () => {
    const hit = () =>
      db.query<{ count: number }>(
        "insert into rate_events (key, window_start, count, expires_at) values ('k', 100, 1, now()) on conflict (key, window_start) do update set count = rate_events.count + 1 returning count",
      );
    expect((await hit()).rows[0].count).toBe(1);
    expect((await hit()).rows[0].count).toBe(2);
  });
});
