import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { heldTeaser } from "@/lib/app/held";
import { userForToken, type NewAccount, type UsedToken } from "@/lib/auth/login-link";
import { isNoCardTrialUser } from "@/lib/billing/has-card";
import { paymentAccount } from "@/lib/billing/payment-page";
import { deliverWeek } from "@/lib/cora/deliver";
import type { Transport } from "@/lib/mail/send";
import { finishSignup } from "@/lib/signup/finish";
import { testDb } from "@/test-helpers/pglite-db";
import {
  afterSignupPath,
  alertAt,
  checkSponsorAtStart,
  claimSponsorSeat,
  createSponsor,
  postalFits,
  newSponsorCode,
  releaseSeat,
  revokeSponsor,
  endSeatOnClose,
  setSponsorSeats,
  sponsorRefusedAtStart,
  sponsorCodeHash,
  sponsorHashFor,
  type SponsorInput,
} from "./sponsors";
import { cleanSponsorCode } from "./code";

/**
 * B2 plan Unit 10 (R14, acceptance #48): sponsor codes, the seat claim at
 * account creation, the 80% alert, and the admin changes, on real SQL.
 */

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const mail = () => ({ transport, sleep: async () => {} });
const BY = "peter@meetroger.ai";
const NOW = new Date("2026-11-27T15:00:00Z");

const input = (o: Partial<SponsorInput> = {}): SponsorInput => ({
  name: "Harbour Realty",
  currency: "CAD",
  standardCents: 20000,
  higherCents: 40000,
  seats: 3,
  billingEmail: "ap@harbour.example",
  billingCountry: "CA",
  billingPostal: "M5V 2T6",
  ...o,
});

async function sponsorsOn(on = true) {
  for (const k of ["sponsorsOn", "signupOpen", "cycleLive"]) {
    await query(`insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value`, [`v3.${k}`, JSON.stringify(on)]);
  }
}

async function newSponsor(o: Partial<SponsorInput> = {}) {
  const r = await createSponsor(query, null, BY, input(o));
  if (!r.ok) throw new Error(r.message);
  return r;
}

const account = (sponsorHash: string | null): NewAccount => ({
  name: "Ana Lima",
  path: "running",
  notReady: false,
  profile: {},
  agent: "hark",
  currency: "CAD",
  ref: "",
  utm: "",
  zack: null,
  referrer: null,
  sponsorHash,
});
const link = (email: string, code: string | null): UsedToken => ({
  email,
  purpose: "signin",
  userId: null,
  nextPath: "/start/plan",
  newAccount: account(code ? sponsorHashFor(code) : null),
  data: null,
  hash: `h-${email}`,
});
const userRow = async (id: string) =>
  (await query<{ sponsor_id: string | null; sponsor_seat: number | null; status: string }>(`select sponsor_id, sponsor_seat, status from users where id = $1`, [id]))[0];
const bareUser = async (email: string) => (await query<{ id: string }>(`insert into users (email, status) values ($1, 'signup') returning id`, [email]))[0].id;

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  await sponsorsOn();
});
afterEach(() => vi.unstubAllEnvs());
/** Admin alerts go out only when ADMIN_EMAILS is set (the alert tests set it). */
const admins = () => vi.stubEnv("ADMIN_EMAILS", "peter@meetroger.ai");

describe("codes", () => {
  it("are 12 characters of base32, and only their hash is stored", async () => {
    const r = await newSponsor();
    expect(r.code).toMatch(/^[A-Z2-7]{12}$/);
    expect(newSponsorCode()).not.toBe(newSponsorCode());
    const [row] = await query<{ code_hash: string }>(`select code_hash from sponsors where id = $1`, [r.id]);
    expect(row.code_hash).toBe(sponsorCodeHash(r.code));
    expect(JSON.stringify(await query(`select * from sponsors`))).not.toContain(r.code);
  });

  it("are read whatever the case, spaces or dashes, and anything else is not a code", () => {
    expect(cleanSponsorCode("abcd-efgh 2345")).toBe("ABCDEFGH2345");
    expect(cleanSponsorCode("ABCDEFGH234")).toBeNull();
    expect(cleanSponsorCode("ABCDEFGH2341")).toBeNull(); // 1 is not base32
    expect(sponsorHashFor("nope")).toBeNull();
  });

  it("the admin_actions row for creating a sponsor doesn't contain the code", async () => {
    const r = await newSponsor();
    const rows = await query<{ action: string; detail: unknown }>(`select action, detail from admin_actions`);
    expect(rows.map((x) => x.action)).toEqual(["sponsor_create"]);
    expect(rows[0].detail).toMatchObject({ sponsorId: r.id });
    expect(JSON.stringify(rows)).not.toContain(r.code);
    expect(JSON.stringify(rows)).not.toContain(sponsorCodeHash(r.code));
  });

  it("refuses incomplete details and writes nothing", async () => {
    expect(await createSponsor(query, null, BY, input({ billingPostal: "" }))).toMatchObject({ ok: false });
    expect(await createSponsor(query, null, BY, input({ higherCents: 100 }))).toMatchObject({ ok: false });
    expect(await query(`select 1 from sponsors`)).toHaveLength(0);
  });
});

describe("signing up with a sponsor code (#48)", () => {
  it("a valid code makes a sponsored member who never sees a teaser or Payment and gets their list on the first Monday", async () => {
    const { code, id: sponsorId } = await newSponsor();
    const user = await userForToken(query, link("ana@example.com", code), NOW);
    expect(user?.sponsor).toBe("claimed");
    expect(await userRow(user!.id)).toMatchObject({ sponsor_id: sponsorId, sponsor_seat: 1 });
    expect(afterSignupPath("/start/plan", { kind: "claimed", sponsorId, seat: 1 })).toBe("/start/plan");

    expect(await finishSignup(query, user!.id, NOW)).toBe(true);
    expect(await isNoCardTrialUser(query, user!.id)).toBe(false);
    expect(await paymentAccount(query, user!.id)).toBeNull();

    // The first Monday: Cora picked for them, and the list is delivered in full, with no teaser.
    const WEEK = "2026-11-30";
    const [play] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen, figures, score, f_hours, f_reach, f_ease, f_proof, f_surprise)
       values ('Inbox triage', 'Sales', 'd', 'p', 'i', $1, $1, '{}'::jsonb, 70, 7, 7, 7, 7, 7) returning id`,
      [WEEK],
    );
    await query(`insert into cora_weeks (week_of, status, phase) values ($1, 'ready', 'ready')`, [WEEK]);
    await query(`insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'short', 1)`, [user!.id, WEEK]);
    await query(`insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, 1, $3, 70, 3, 'Fits.')`, [user!.id, WEEK, play.id]);
    expect(await deliverWeek(query, user!.id, WEEK, 2, new Date("2026-11-30T12:05:00Z"))).toMatchObject({ delivered: 1 });
    expect(await heldTeaser(query, user!.id)).toBeNull();
  });

  it("a revoked code gives an ordinary trial and the uniform message", async () => {
    const { code, id } = await newSponsor();
    await revokeSponsor(query, BY, id);
    const user = await userForToken(query, link("ana@example.com", code), NOW);
    expect(user?.sponsor).toBe("refused");
    expect(await userRow(user!.id)).toMatchObject({ sponsor_id: null, status: "signup" });
    expect(afterSignupPath("/start/plan", { kind: "refused" })).toBe("/start/plan?sponsor=invalid");
    await finishSignup(query, user!.id, NOW);
    expect(await isNoCardTrialUser(query, user!.id)).toBe(true);
  });

  it("a code with every seat taken gives an ordinary trial and the uniform message", async () => {
    const { code } = await newSponsor({ seats: 1 });
    expect((await userForToken(query, link("a@example.com", code), NOW))?.sponsor).toBe("claimed");
    const b = await userForToken(query, link("b@example.com", code), NOW);
    expect(b?.sponsor).toBe("refused");
    expect((await userRow(b!.id)).sponsor_id).toBeNull();
  });

  it("an unknown code is refused the same way", async () => {
    const user = await userForToken(query, link("ana@example.com", "ABCDEFGHJKLM"), NOW);
    expect(user?.sponsor).toBe("refused");
  });

  it("with sponsors switched off, the code is ignored: an ordinary trial and no message", async () => {
    const { code } = await newSponsor();
    await sponsorsOn(false);
    const user = await userForToken(query, link("ana@example.com", code), NOW);
    expect(user?.sponsor).toBe("off");
    expect(afterSignupPath("/start/plan", { kind: "off" })).toBe("/start/plan");
    expect((await userRow(user!.id)).sponsor_id).toBeNull();
  });

  it("an existing account signing in again with a code is never given a seat", async () => {
    const { code } = await newSponsor();
    const first = await userForToken(query, link("ana@example.com", null), NOW);
    const again = await userForToken(query, link("ana@example.com", code), NOW);
    expect(again?.id).toBe(first?.id);
    expect(again?.sponsor).toBeUndefined();
    expect((await userRow(first!.id)).sponsor_id).toBeNull();
  });
});

describe("the seat claim", () => {
  it("two sign-ups racing for the last seat give exactly one sponsored member", async () => {
    const { code, id } = await newSponsor({ seats: 2 });
    await claimSponsorSeat(query, await bareUser("first@example.com"), sponsorHashFor(code));
    const [a, b] = [await bareUser("a@example.com"), await bareUser("b@example.com")];
    const r = await Promise.all([claimSponsorSeat(query, a, sponsorHashFor(code)), claimSponsorSeat(query, b, sponsorHashFor(code))]);
    expect(r.map((x) => x.kind).sort()).toEqual(["claimed", "refused"]);
    expect(await query(`select 1 from users where sponsor_id = $1`, [id])).toHaveLength(2);
  });

  it("two members can never hold the same seat: the loser's statement fails and is tried again", async () => {
    const { code, id } = await newSponsor({ seats: 2 });
    const a = await bareUser("a@example.com");
    const b = await bareUser("b@example.com");
    await query(`update users set sponsor_id = $1, sponsor_seat = 1 where id = $2`, [id, a]);
    await expect(query(`update users set sponsor_id = $1, sponsor_seat = 1 where id = $2`, [id, b])).rejects.toMatchObject({ code: "23505" });

    // The race as Postgres sees it under read committed: the first attempt picks a seat someone else just took.
    let clashes = 0;
    const racing: Query = async (text, params) => {
      if (text.includes("generate_series") && clashes === 0) {
        clashes++;
        throw Object.assign(new Error('duplicate key value violates unique constraint "users_sponsor_seat"'), { code: "23505", constraint: "users_sponsor_seat" });
      }
      return query(text, params);
    };
    expect(await claimSponsorSeat(racing, b, sponsorHashFor(code))).toEqual({ kind: "claimed", sponsorId: id, seat: 2 });
    expect(clashes).toBe(1);
  });

  it("takes the lowest free seat, and a released seat is taken again", async () => {
    const { code, id } = await newSponsor({ seats: 2 });
    const a = await bareUser("a@example.com");
    const b = await bareUser("b@example.com");
    const c = await bareUser("c@example.com");
    await claimSponsorSeat(query, a, sponsorHashFor(code));
    await claimSponsorSeat(query, b, sponsorHashFor(code));
    expect((await claimSponsorSeat(query, c, sponsorHashFor(code))).kind).toBe("refused");
    expect(await releaseSeat(query, BY, id, a)).toBe(true);
    expect(await userRow(a)).toMatchObject({ sponsor_id: null, sponsor_seat: null });
    expect(await claimSponsorSeat(query, c, sponsorHashFor(code))).toEqual({ kind: "claimed", sponsorId: id, seat: 1 });
  });

  it("reaching 8 of 10 seats alerts the admins once", async () => {
    admins();
    const { code, id } = await newSponsor({ seats: 10 });
    expect(alertAt(10)).toBe(8);
    for (let i = 1; i <= 10; i++) {
      await claimSponsorSeat(query, await bareUser(`m${i}@example.com`), sponsorHashFor(code), mail());
      expect(sent).toHaveLength(i < 8 ? 0 : 1);
    }
    expect(sent[0].subject).toBe("[Roger] Harbour Realty has used 8 of 10 sponsored seats");
    expect(sent[0].text).not.toContain(code);
    const [s] = await query<{ alerted: boolean }>(`select alerted_80_at is not null as alerted from sponsors where id = $1`, [id]);
    expect(s.alerted).toBe(true);
  });

  it("more seats below 80% arm the alert again", async () => {
    admins();
    const { code, id } = await newSponsor({ seats: 5 });
    for (let i = 1; i <= 4; i++) await claimSponsorSeat(query, await bareUser(`m${i}@example.com`), sponsorHashFor(code), mail());
    expect(sent).toHaveLength(1);
    expect(await setSponsorSeats(query, BY, id, 10)).toMatchObject({ ok: true });
    for (let i = 5; i <= 8; i++) await claimSponsorSeat(query, await bareUser(`m${i}@example.com`), sponsorHashFor(code), mail());
    expect(sent.map((m) => m.subject)).toEqual(["[Roger] Harbour Realty has used 4 of 5 sponsored seats", "[Roger] Harbour Realty has used 8 of 10 sponsored seats"]);
  });
});

describe("the check at /start", () => {
  it("a correct code is never counted; wrong ones are, and past the limit codes are no longer looked up there", async () => {
    const { code } = await newSponsor();
    for (let i = 0; i < 10; i++) expect(await checkSponsorAtStart(query, "ABCDEFGHJKLM", "1.2.3.4", NOW)).toBe("invalid");
    expect(await checkSponsorAtStart(query, "ABCDEFGHJKLM", "1.2.3.4", NOW)).toBe("unchecked");
    expect(await checkSponsorAtStart(query, code, "1.2.3.4", NOW)).toBe("unchecked");
    // Another IP is unaffected, and its correct code adds nothing to any count.
    for (let i = 0; i < 20; i++) expect(await checkSponsorAtStart(query, code, "5.6.7.8", NOW)).toBe("ok");
    expect(await checkSponsorAtStart(query, "ABCDEFGHJKLM", "5.6.7.8", NOW)).toBe("invalid");
    // The code still works where it counts: when the account is made.
    expect((await userForToken(query, link("ana@example.com", code), NOW))?.sponsor).toBe("claimed");
  });

  it("a revoked or full code is invalid at /start too", async () => {
    const full = await newSponsor({ seats: 1 });
    await claimSponsorSeat(query, await bareUser("a@example.com"), sponsorHashFor(full.code));
    expect(await checkSponsorAtStart(query, full.code, "1.2.3.4", NOW)).toBe("invalid");
    const revoked = await newSponsor({ name: "Other" });
    await revokeSponsor(query, BY, revoked.id);
    expect(await checkSponsorAtStart(query, revoked.code, "1.2.3.4", NOW)).toBe("invalid");
  });
});

describe("the check at /start, more", () => {
  it("with no IP known, wrong codes are never counted in a shared bucket", async () => {
    const { code } = await newSponsor();
    for (let i = 0; i < 15; i++) expect(await checkSponsorAtStart(query, "ABCDEFGHJKLM", "unknown", NOW)).toBe("invalid");
    expect(await checkSponsorAtStart(query, code, "unknown", NOW)).toBe("ok");
    expect(await query(`select 1 from rate_events where key like 'sponsor:bad:%'`)).toHaveLength(0);
  });

  it("sponsorRefusedAtStart: the cookie's code first, else the draft's; nothing while sponsors are off or the database fails", async () => {
    const { code } = await newSponsor();
    const ask = (o: { cookie?: string | null; draft?: string | null }, q: Query = query) => sponsorRefusedAtStart(q, { ...o, ip: "1.2.3.4", now: NOW });
    expect(await ask({})).toBe(false);
    expect(await ask({ cookie: code })).toBe(false);
    expect(await ask({ cookie: "ABCDEFGHJKLM" })).toBe(true);
    expect(await ask({ draft: "ABCDEFGHJKLM" })).toBe(true);
    expect(await ask({ cookie: code, draft: "ABCDEFGHJKLM" })).toBe(false);
    expect(await ask({ cookie: "not a code" })).toBe(false);
    const broken: Query = async () => {
      throw new Error("db down");
    };
    expect(await ask({ cookie: "ABCDEFGHJKLM" }, broken)).toBe(false);
    await sponsorsOn(false);
    expect(await ask({ cookie: "ABCDEFGHJKLM" })).toBe(false);
  });
});

describe("seat history", () => {
  it("is opened by the claim at the job clock, ended by a release, and ended when the account closes", async () => {
    const { code, id } = await newSponsor();
    const a = await bareUser("a@example.com");
    const b = await bareUser("b@example.com");
    await claimSponsorSeat(query, a, sponsorHashFor(code), { now: new Date("2026-11-03T15:00:00Z") });
    await claimSponsorSeat(query, b, sponsorHashFor(code), { now: new Date("2026-11-04T15:00:00Z") });
    await releaseSeat(query, BY, id, a, new Date("2026-12-02T15:00:00Z"));
    await query(`update users set status = 'closed', access_ends_at = '2026-12-05T15:00:00Z' where id = $1`, [b]);
    await endSeatOnClose(query, b);
    await endSeatOnClose(query, b);
    const rows = await query<{ user_id: string; seat: number; held_from: string; held_to: string }>(
      `select user_id, seat, held_from::text, held_to::text from sponsor_seat_history order by held_from`,
    );
    expect(rows).toEqual([
      { user_id: a, seat: 1, held_from: "2026-11-03 15:00:00+00", held_to: "2026-12-02 15:00:00+00" },
      { user_id: b, seat: 2, held_from: "2026-11-04 15:00:00+00", held_to: "2026-12-05 15:00:00+00" },
    ]);
  });

  it("an open account's history is left alone by the close step", async () => {
    const { code } = await newSponsor();
    const a = await bareUser("a@example.com");
    await claimSponsorSeat(query, a, sponsorHashFor(code));
    await endSeatOnClose(query, a);
    expect(await query(`select 1 from sponsor_seat_history where held_to is null`)).toHaveLength(1);
  });
});

describe("billing address", () => {
  it("takes a Canadian postal code or a US ZIP, and refuses the rest", async () => {
    expect(postalFits("CA", "m5v 2t6")).toBe(true);
    expect(postalFits("CA", "M5V2T6")).toBe(true);
    expect(postalFits("US", "10001")).toBe(true);
    expect(postalFits("US", "10001-1234")).toBe(true);
    expect(postalFits("CA", "10001")).toBe(false);
    expect(postalFits("US", "M5V 2T6")).toBe(false);
    expect(postalFits("FR", "75001")).toBe(false);
    expect(await createSponsor(query, null, BY, input({ billingPostal: "12345" }))).toEqual({ ok: false, message: "Enter a Canadian postal code, like M5V 2T6." });
    expect(await createSponsor(query, null, BY, input({ billingCountry: "US", billingPostal: "M5V 2T6" }))).toEqual({ ok: false, message: "Enter a US ZIP code, like 10001." });
    expect(await createSponsor(query, null, BY, input({ billingCountry: "FR" as "CA" }))).toEqual({ ok: false, message: "Choose Canada or the United States." });
  });
});

describe("admin changes", () => {
  it("revoke, seats and release are logged with the sponsor id", async () => {
    const { id, code } = await newSponsor();
    const a = await bareUser("a@example.com");
    await claimSponsorSeat(query, a, sponsorHashFor(code));
    await revokeSponsor(query, BY, id);
    expect(await revokeSponsor(query, BY, id)).toBe(false);
    await setSponsorSeats(query, BY, id, 5);
    await releaseSeat(query, BY, id, a);
    expect(await releaseSeat(query, BY, id, a)).toBe(false);
    const rows = await query<{ action: string; detail: Record<string, unknown>; admin_email: string }>(`select action, detail, admin_email from admin_actions order by id`);
    expect(rows.map((r) => r.action)).toEqual(["sponsor_create", "sponsor_revoke", "sponsor_seats", "sponsor_release"]);
    expect(rows.every((r) => r.detail.sponsorId === id && r.admin_email === BY)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(code);
  });
});
