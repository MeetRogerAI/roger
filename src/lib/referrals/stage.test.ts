import { beforeEach, describe, expect, it } from "vitest";
import { deleteAccount } from "@/lib/admin/users";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { purgeReferralData } from "@/lib/housekeeping/retention";
import { testDb } from "@/test-helpers/pglite-db";
import { cleanCode, ensureReferralCode, referrerForCode } from "./code";
import { referralsFor, voidSameCardReferrals } from "./stage";

/** B2 plan Unit 3: codes, stages that void, the referrer's list, and retention. */

const NOW = new Date("2026-12-01T15:00:00Z");
let query: Query;

async function member(email: string, extra: { status?: string; fp?: string } = {}): Promise<string> {
  const [u] = await query<{ id: string }>(`insert into users (email, status, card_fingerprint) values ($1, $2, $3) returning id`, [email, extra.status ?? "trial", extra.fp ?? null]);
  return u.id;
}
async function referral(referrer: string, referred: string | null, o: { stage?: string; source?: string; email?: string; createdAt?: string } = {}): Promise<string> {
  const [r] = await query<{ id: string }>(
    `insert into referrals (referrer_id, referred_user_id, referred_email, source, stage, created_at) values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now())) returning id`,
    [referrer, referred, o.email ?? null, o.source ?? "link", o.stage ?? "trial", o.createdAt ?? null],
  );
  return r.id;
}
const stages = () => query<{ id: string; stage: string; void_reason: string | null; referred_email: string | null }>(`select id, stage, void_reason, referred_email from referrals order by created_at, id`);

beforeEach(async () => {
  ({ query } = await testDb());
  process.env.ADMIN_EMAILS = "peter@example.com";
});

describe("referral codes", () => {
  it("are 10 characters of the unambiguous base32 alphabet, made once even when two first visits race", async () => {
    const a = await member("ana@example.com");
    const codes = await Promise.all([ensureReferralCode(query, a), ensureReferralCode(query, a), ensureReferralCode(query, a)]);
    expect(new Set(codes).size).toBe(1);
    expect(codes[0]).toMatch(/^[a-km-np-z2-9]{10}$/);
    expect(await ensureReferralCode(query, a)).toBe(codes[0]);
    const [u] = await query<{ referral_code: string }>(`select referral_code from users where id = $1`, [a]);
    expect(u.referral_code).toBe(codes[0]);
  });

  it("look up case-insensitively; an unknown or malformed code finds nobody", async () => {
    const a = await member("ana@example.com");
    const code = (await ensureReferralCode(query, a))!;
    expect(await referrerForCode(query, code.toUpperCase())).toEqual({ id: a });
    expect(await referrerForCode(query, "abcdefghij")).toBeNull();
    expect(cleanCode("abc")).toBeNull();
    expect(cleanCode("abcdefghi0")).toBeNull();
    expect(cleanCode("../etc/pas")).toBeNull();
  });

  it("returns null for a member who does not exist", async () => {
    expect(await ensureReferralCode(query, "00000000-0000-4000-8000-000000000009")).toBeNull();
  });
});

describe("voidSameCardReferrals", () => {
  it("voids when either side saves the other side's card, and is idempotent", async () => {
    const a = await member("ana@example.com", { fp: "fp_1" });
    const b = await member("bo@example.com");
    const c = await member("cy@example.com", { fp: "fp_2" });
    const ab = await referral(a, b);
    const ac = await referral(a, c);
    // Bo saves Ana's card: Bo's referral goes void.
    await query(`update users set card_fingerprint = 'fp_1' where id = $1`, [b]);
    expect(await voidSameCardReferrals(query, b, NOW)).toBe(1);
    expect(await voidSameCardReferrals(query, b, NOW)).toBe(0);
    // Ana later saves Cy's card: called for the referrer, Cy's referral goes void too.
    await query(`update users set card_fingerprint = 'fp_2' where id = $1`, [a]);
    expect(await voidSameCardReferrals(query, a, NOW)).toBe(1);
    const s = await stages();
    expect(s.find((r) => r.id === ab)).toMatchObject({ stage: "void", void_reason: "same_card" });
    expect(s.find((r) => r.id === ac)).toMatchObject({ stage: "void", void_reason: "same_card" });
  });

  it("leaves a paying referral's stage alone and alerts both admins once", async () => {
    const a = await member("ana@example.com", { fp: "fp_1" });
    const b = await member("bo@example.com", { fp: "fp_1" });
    const ab = await referral(a, b, { stage: "paying" });
    const sent: string[] = [];
    const transport: Transport = async (m) => {
      sent.push(m.subject);
      return { ok: true };
    };
    expect(await voidSameCardReferrals(query, b, NOW, { transport })).toBe(0);
    expect(await voidSameCardReferrals(query, a, NOW, { transport })).toBe(0);
    expect(sent).toEqual(["[Roger] A paid referral shares a card with its referrer"]);
    expect((await stages()).find((r) => r.id === ab)).toMatchObject({ stage: "paying", void_reason: null });
  });

  it("does nothing when neither side has a card", async () => {
    const a = await member("ana@example.com");
    const b = await member("bo@example.com");
    await referral(a, b);
    expect(await voidSameCardReferrals(query, b, NOW)).toBe(0);
  });
});

describe("a deleted referred account", () => {
  it("voids its referral when an admin deletes it", async () => {
    const a = await member("ana@example.com");
    const b = await member("bo@example.com", { status: "closed" });
    const keep = await member("cy@example.com");
    await referral(a, b);
    await referral(a, keep);
    expect(await deleteAccount(query, "peter@example.com", b, "bo@example.com")).toMatchObject({ ok: true });
    const s = await query<{ referred_user_id: string | null; stage: string; void_reason: string | null }>(`select referred_user_id, stage, void_reason from referrals order by stage`);
    expect(s).toEqual([
      { referred_user_id: keep, stage: "trial", void_reason: null },
      { referred_user_id: null, stage: "void", void_reason: "account_deleted" },
    ]);
  });
});

describe("a deleted referred account that was already paying", () => {
  it("keeps its stage: the credit was earned", async () => {
    const a = await member("ana@example.com");
    const b = await member("bo@example.com", { status: "closed" });
    await referral(a, b, { stage: "paying" });
    expect(await deleteAccount(query, "peter@example.com", b, "bo@example.com")).toMatchObject({ ok: true });
    expect(await purgeReferralData(query, { now: NOW })).toEqual({ emails: 0, voided: 0 });
    expect(await query(`select referred_user_id, stage, void_reason from referrals`)).toEqual([{ referred_user_id: null, stage: "paying", void_reason: null }]);
  });
});

describe("referral retention (purgeReferralData)", () => {
  it("clears a never-linked invitation's address after 90 days, keeps a newer one, and voids rows whose account is gone", async () => {
    const a = await member("ana@example.com");
    const b = await member("bo@example.com");
    const old = await referral(a, null, { stage: "invited", source: "guest", email: "old@example.com", createdAt: "2026-08-01T00:00:00Z" });
    const fresh = await referral(a, null, { stage: "invited", source: "guest", email: "new@example.com", createdAt: "2026-11-20T00:00:00Z" });
    const gone = await referral(a, b);
    // Deleted outside deleteAccount: the hourly pass catches up.
    await query(`delete from users where id = $1`, [b]);
    expect(await purgeReferralData(query, { now: NOW })).toEqual({ emails: 1, voided: 1 });
    expect(await purgeReferralData(query, { now: NOW })).toEqual({ emails: 0, voided: 0 });
    const s = await stages();
    expect(s.find((r) => r.id === old)).toMatchObject({ stage: "invited", referred_email: null });
    expect(s.find((r) => r.id === fresh)).toMatchObject({ stage: "invited", referred_email: "new@example.com" });
    expect(s.find((r) => r.id === gone)).toMatchObject({ stage: "void", void_reason: "account_deleted" });
  });
});

describe("referralsFor", () => {
  it("lists link referrals as 'Someone you invited' and guests by the name the member typed, never an address or the person's own name", async () => {
    const a = await member("ana@example.com");
    const [b] = await query<{ id: string }>(`insert into users (email, name) values ('bo@example.com', 'Bo Typed-Himself') returning id`);
    await referral(a, b.id, { createdAt: "2026-11-01T00:00:00Z" });
    const g = await referral(a, null, { stage: "invited", source: "guest", email: "kim@example.com", createdAt: "2026-11-02T00:00:00Z" });
    await query(`insert into session_guests (token_hash, inviter_id, referral_id, session_date, name, email) values ('h1', $1, $2, '2026-11-10', 'Kim Lee', 'kim@example.com')`, [a, g]);
    await referral(a, null, { stage: "invited", source: "guest", email: "x@example.com", createdAt: "2026-11-03T00:00:00Z" });
    const list = await referralsFor(query, a);
    expect(list.map((l) => [l.who, l.stage])).toEqual([
      ["A guest you invited", "invited"],
      ["Kim Lee", "invited"],
      ["Someone you invited", "trial"],
    ]);
    expect(JSON.stringify(list)).not.toMatch(/@|Typed-Himself/);
  });
});
