import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import type { Counter } from "@/lib/rate-limit";
import { consumeToken, issueToken, userForToken, type NewAccount } from "@/lib/auth/login-link";
import { startAccount } from "@/lib/signup/account";
import type { SignupDraft } from "@/lib/signup/draft";
import { createPilotLink } from "@/lib/signup/pilot";
import { testDb } from "@/test-helpers/pglite-db";
import { HOURLY_TASKS, type HourlyDeps } from "@/lib/housekeeping/job";
import { applyReferral, referralEmailKey, resolveReferrer } from "./attribution";
import { ensureReferralCode } from "./code";
import { signRefCookie } from "./cookie";

/** B2 plan Unit 3: attribution from the referral cookie to the user row, on every account-creating path. */

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

const KEY = "test-ref-key";
const NOW = new Date("2026-12-01T15:00:00Z");
const DAY = 86_400_000;

let query: Query;
let sent: Parameters<Transport>[0][];
const transport: Transport = async (m) => {
  sent.push(m);
  return { ok: true };
};
const counter: Counter = async () => 1;
const draft: SignupDraft = {
  answers: { work: "real_estate", role: "Agent", uses: "most_weeks", agents: ["grok-bot"], agentOther: "", primary: "", level: 3, count: "1-2", help: [], software: "if_shown" },
  path: "new",
  continuedAnyway: false,
  source: "re",
  cur: "CAD",
  ref: "camp",
  zack: null,
  utm: "",
};
const account: NewAccount = { name: "New Person", path: "new", notReady: false, profile: {}, agent: "", currency: "USD", ref: "", utm: "", zack: null };

async function member(email: string): Promise<string> {
  const [u] = await query<{ id: string }>(`insert into users (email, status) values ($1, 'trial') returning id`, [email]);
  return u.id;
}
const cookieFor = (code: string, at = NOW) => signRefCookie({ code, issuedAt: at.getTime(), purpose: "link" }, KEY);
const userRow = async (email: string) =>
  (await query<{ id: string; referred_by: string | null; ref: string }>(`select id, referred_by, ref from users where email = $1`, [email]))[0];
const referrals = () =>
  query<{ referrer_id: string; referred_user_id: string | null; referred_email: string | null; source: string; stage: string; trial_at: unknown }>(
    `select referrer_id, referred_user_id, referred_email, source, stage, trial_at from referrals order by created_at`,
  );

/** Asks for the sign-up link with this browser's cookie, then opens the link somewhere with no cookies at all. */
async function signUpThroughLink(email: string, rawCookie: string | null, at = NOW) {
  const referrer = await resolveReferrer(query, rawCookie, at, KEY);
  expect(await startAccount(query, { name: "New Person", email, draft, ip: "1.2.3.4", referrer }, { query, transport, counter, now: at })).toBe("new");
  const m = sent.at(-1)!;
  const token = /t=([A-Za-z0-9_-]+)/.exec(m.text)![1];
  return userForToken(query, (await consumeToken(query, token, at))!, at);
}

beforeEach(async () => {
  ({ query } = await testDb());
  sent = [];
  process.env.ADMIN_EMAILS = "peter@example.com";
});

describe("referralEmailKey", () => {
  it("lower-cases, drops plus-tags, and drops Gmail dots (googlemail is Gmail)", () => {
    expect(referralEmailKey(" Jane.Doe+x@Gmail.com ")).toBe("janedoe@gmail.com");
    expect(referralEmailKey("jane.doe@googlemail.com")).toBe("janedoe@gmail.com");
    expect(referralEmailKey("jane.doe+news@example.com")).toBe("jane.doe@example.com");
  });
});

describe("the email sign-up link", () => {
  it("sets referred_by and a trial referral, even though the link is opened where there is no cookie", async () => {
    const a = await member("ana@example.com");
    const code = (await ensureReferralCode(query, a))!;
    const u = await signUpThroughLink("ben@example.com", cookieFor(code));
    const row = await userRow("ben@example.com");
    expect(row).toMatchObject({ id: u!.id, referred_by: a, ref: "camp" });
    expect(await referrals()).toEqual([{ referrer_id: a, referred_user_id: u!.id, referred_email: null, source: "link", stage: "trial", trial_at: expect.anything() }]);
  });

  it("still applies to a cookie 59 days old, and not to one 61 days old", async () => {
    const a = await member("ana@example.com");
    const code = (await ensureReferralCode(query, a))!;
    await signUpThroughLink("ben@example.com", cookieFor(code, new Date(NOW.getTime() - 59 * DAY)));
    await signUpThroughLink("cy@example.com", cookieFor(code, new Date(NOW.getTime() - 61 * DAY)));
    expect((await userRow("ben@example.com")).referred_by).toBe(a);
    expect((await userRow("cy@example.com")).referred_by).toBeNull();
    expect(await referrals()).toHaveLength(1);
  });

  it("gives an existing member who signs in again through a sign-up link no referral: the row was not newly created", async () => {
    const a = await member("ana@example.com");
    const ben = await member("ben@example.com");
    const token = await issueToken(query, { email: "ben@example.com", purpose: "signin", newAccount: { ...account, referrer: { id: a, via: "link" } } }, NOW);
    expect((await userForToken(query, (await consumeToken(query, token, NOW))!, NOW))?.id).toBe(ben);
    expect((await userRow("ben@example.com")).referred_by).toBeNull();
    expect(await referrals()).toEqual([]);
  });

  it("refuses the referrer signing up through their own link", async () => {
    const a = await member("ana@example.com");
    const code = (await ensureReferralCode(query, a))!;
    // Same address: an existing account, so it is a sign-in and nothing is created.
    expect(await startAccount(query, { name: "Ana", email: "ana@example.com", draft, ip: "1.2.3.4", referrer: await resolveReferrer(query, cookieFor(code), NOW, KEY) }, { query, transport, counter, now: NOW })).toBe("existing");
    expect(await applyReferral(query, { userId: a, email: "ana@example.com", referrer: { id: a, via: "link" }, now: NOW })).toBe("self");
    expect((await userRow("ana@example.com")).referred_by).toBeNull();
    expect(await referrals()).toEqual([]);
  });

  it("refuses jane.doe+x@gmail.com referred by janedoe@gmail.com (the same mailbox)", async () => {
    const jane = await member("janedoe@gmail.com");
    const code = (await ensureReferralCode(query, jane))!;
    await signUpThroughLink("jane.doe+x@gmail.com", cookieFor(code));
    expect((await userRow("jane.doe+x@gmail.com")).referred_by).toBeNull();
    expect(await referrals()).toEqual([]);
  });

  it("ignores a cookie whose signature was tampered with", async () => {
    const a = await member("ana@example.com");
    const code = (await ensureReferralCode(query, a))!;
    const [payload, sig] = cookieFor(code).split(".");
    const forged = Buffer.from(JSON.stringify({ c: code, t: NOW.getTime() + 1, p: "link" })).toString("base64url");
    expect(await resolveReferrer(query, `${forged}.${sig}`, NOW, KEY)).toBeNull();
    expect(await resolveReferrer(query, `${payload}.${sig}x`, NOW, KEY)).toBeNull();
    expect(await resolveReferrer(query, cookieFor(code), NOW, "another-key")).toBeNull();
    expect(await resolveReferrer(query, cookieFor(code), NOW, KEY)).toEqual({ id: a, via: "link" });
  });

  it("a referrer whose account is gone by the time the link is opened leaves no half-written referral", async () => {
    const a = await member("ana@example.com");
    const code = (await ensureReferralCode(query, a))!;
    const referrer = await resolveReferrer(query, cookieFor(code), NOW, KEY);
    await query(`delete from users where id = $1`, [a]);
    expect(await startAccount(query, { name: "Ben", email: "ben@example.com", draft, ip: "1.2.3.4", referrer }, { query, transport, counter, now: NOW })).toBe("new");
    const token = /t=([A-Za-z0-9_-]+)/.exec(sent.at(-1)!.text)![1];
    expect(await userForToken(query, (await consumeToken(query, token, NOW))!, NOW)).not.toBeNull();
    expect((await userRow("ben@example.com")).referred_by).toBeNull();
    expect(await referrals()).toEqual([]);
  });
});

describe("applyReferral", () => {
  it("keeps the first referrer: a second call changes nothing", async () => {
    const a = await member("ana@example.com");
    const b = await member("bo@example.com");
    const c = await member("cy@example.com");
    expect(await applyReferral(query, { userId: c, email: "cy@example.com", referrer: { id: a, via: "link" }, now: NOW })).toBe("attributed");
    expect(await applyReferral(query, { userId: c, email: "cy@example.com", referrer: { id: b, via: "link" }, now: NOW })).toBe("none");
    expect((await userRow("cy@example.com")).referred_by).toBe(a);
    expect((await referrals()).map((r) => r.referrer_id)).toEqual([a]);
  });

  it("promotes the referrer's guest invitation to trial and clears its address", async () => {
    const a = await member("ana@example.com");
    await query(`insert into referrals (referrer_id, referred_email, source, stage) values ($1, 'janedoe@gmail.com', 'guest', 'invited')`, [a]);
    const j = await member("jane.doe@gmail.com");
    expect(await applyReferral(query, { userId: j, email: "jane.doe@gmail.com", referrer: { id: a, via: "link" }, now: NOW })).toBe("attributed");
    expect(await referrals()).toEqual([{ referrer_id: a, referred_user_id: j, referred_email: null, source: "guest", stage: "trial", trial_at: expect.anything() }]);
  });

  it("takes the oldest guest invitation for the address first, then the cookie: A invites, B's link, A wins and B gets no row", async () => {
    const a = await member("ana@example.com");
    const b = await member("bo@example.com");
    const c = await member("cy@example.com");
    await query(`insert into referrals (referrer_id, referred_email, source, stage, created_at) values ($1, 'kim@example.com', 'guest', 'invited', '2026-11-01')`, [a]);
    await query(`insert into referrals (referrer_id, referred_email, source, stage, created_at) values ($1, 'kim@example.com', 'guest', 'invited', '2026-11-02')`, [c]);
    const kim = await member("kim@example.com");
    expect(await applyReferral(query, { userId: kim, email: "kim@example.com", referrer: { id: b, via: "link" }, now: NOW })).toBe("attributed");
    expect((await userRow("kim@example.com")).referred_by).toBe(a);
    const rows = await query<{ referrer_id: string; referred_user_id: string | null; stage: string; source: string }>(
      `select referrer_id, referred_user_id, stage, source from referrals order by created_at`,
    );
    expect(rows).toEqual([
      { referrer_id: a, referred_user_id: kim, stage: "trial", source: "guest" },
      { referrer_id: c, referred_user_id: null, stage: "invited", source: "guest" },
    ]);
  });

  it("with no invitation, the cookie's referrer counts", async () => {
    const b = await member("bo@example.com");
    const lu = await member("lu@example.com");
    expect(await applyReferral(query, { userId: lu, email: "lu@example.com", referrer: { id: b, via: "link" }, now: NOW })).toBe("attributed");
    expect(await referrals()).toEqual([{ referrer_id: b, referred_user_id: lu, referred_email: null, source: "link", stage: "trial", trial_at: expect.anything() }]);
  });

  it("refuses a cookie that is the person's own address and falls back to another member's invitation", async () => {
    const a = await member("ana@example.com");
    const self = await member("jane.d@gmail.com");
    await query(`insert into referrals (referrer_id, referred_email, source, stage) values ($1, 'janed@gmail.com', 'guest', 'invited')`, [a]);
    const j = await member("jane.d+new@gmail.com");
    // The cookie names her own mailbox (janed@gmail.com): refused, and A's invitation counts.
    expect(await applyReferral(query, { userId: j, email: "jane.d+new@gmail.com", referrer: { id: self, via: "link" }, now: NOW })).toBe("attributed");
    expect((await userRow("jane.d+new@gmail.com")).referred_by).toBe(a);
    const k = await member("jane.d+other@gmail.com");
    await query(`update referrals set stage = 'void' where referrer_id = $1`, [a]);
    expect(await applyReferral(query, { userId: k, email: "jane.d+other@gmail.com", referrer: { id: self, via: "link" }, now: NOW })).toBe("self");
    expect((await userRow("jane.d+other@gmail.com")).referred_by).toBeNull();
  });
});

describe("durable attribution (users.pending_referrer_id)", () => {
  it("is written with the new account and cleared once attribution has run", async () => {
    const a = await member("ana@example.com");
    const code = (await ensureReferralCode(query, a))!;
    await signUpThroughLink("ben@example.com", cookieFor(code));
    expect((await query<{ p: string | null }>(`select pending_referrer_id as p from users where email = 'ben@example.com'`))[0].p).toBeNull();
    expect((await userRow("ben@example.com")).referred_by).toBe(a);
  });

  it("a failed first attempt never stops the sign-in, and the hourly task completes the referral exactly once", async () => {
    const a = await member("ana@example.com");
    const real = query;
    let failures = 0;
    // The attribution write fails twice (the attempt and its immediate retry), then works.
    query = (async (text: string, params?: unknown[]) => {
      if (text.includes("update users set referred_by") && failures < 2) {
        failures++;
        throw new Error("db blip");
      }
      return real(text, params);
    }) as Query;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = await issueToken(query, { email: "ben@example.com", purpose: "signin", newAccount: { ...account, referrer: { id: a, via: "link" } } }, NOW);
    const u = await userForToken(query, (await consumeToken(query, token, NOW))!, NOW);
    errors.mockRestore();
    expect(u?.email).toBe("ben@example.com");
    expect(failures).toBe(2);
    query = real;
    expect((await query<{ p: string | null; r: string | null }>(`select pending_referrer_id as p, referred_by as r from users where id = $1`, [u!.id]))[0]).toEqual({ p: a, r: null });

    const task = HOURLY_TASKS.find((t) => t.name === "referral_pending")!;
    const deps = { now: NOW } as unknown as HourlyDeps;
    const ctx = { deadline: Date.now() + 60_000 };
    expect(await task.run(query, deps, ctx)).toEqual({ done: 1, failed: 0 });
    expect(await task.run(query, deps, ctx)).toEqual({ done: 0, failed: 0 });
    expect((await userRow("ben@example.com")).referred_by).toBe(a);
    expect(await referrals()).toEqual([{ referrer_id: a, referred_user_id: u!.id, referred_email: null, source: "link", stage: "trial", trial_at: expect.anything() }]);
  });

  it("is cleared when the referrer's account is deleted", async () => {
    const a = await member("ana@example.com");
    const [b] = await query<{ id: string }>(`insert into users (email, pending_referrer_id) values ('ben@example.com', $1) returning id`, [a]);
    await query(`delete from users where id = $1`, [a]);
    expect((await query<{ p: string | null }>(`select pending_referrer_id as p from users where id = $1`, [b.id]))[0].p).toBeNull();
  });

  it("two sign-up links for one address opened at once make one account and one referral", async () => {
    const a = await member("ana@example.com");
    const b = await member("bo@example.com");
    const t1 = await issueToken(query, { email: "kim@example.com", purpose: "signin", newAccount: { ...account, referrer: { id: a, via: "link" } } }, NOW);
    const t2 = await issueToken(query, { email: "kim@example.com", purpose: "signin", newAccount: { ...account, referrer: { id: b, via: "link" } } }, NOW);
    const [u1, u2] = await Promise.all([t1, t2].map(async (t) => userForToken(query, (await consumeToken(query, t, NOW))!, NOW)));
    expect(u1?.id).toBe(u2?.id);
    const rows = await referrals();
    expect(rows).toHaveLength(1);
    expect((await userRow("kim@example.com")).referred_by).toBe(rows[0].referrer_id);
  });
});

describe("pilot accounts", () => {
  it("apply attribution through the shared function on a new account (from a guest invitation), and never on an existing one", async () => {
    const a = await member("ana@example.com");
    await query(`insert into referrals (referrer_id, referred_email, source, stage) values ($1, 'robyn@example.com', 'guest', 'invited')`, [a]);
    const r = await createPilotLink(query, { email: "Robyn@Example.com", name: "Robyn M", createdBy: "peter@example.com" }, NOW);
    expect(r.ok).toBe(true);
    expect((await userRow("robyn@example.com")).referred_by).toBe(a);
    expect(await referrals()).toEqual([{ referrer_id: a, referred_user_id: (await userRow("robyn@example.com")).id, referred_email: null, source: "guest", stage: "trial", trial_at: expect.anything() }]);

    // An account made before the invitation: a fresh pilot link for it changes nothing.
    const ken = await query<{ id: string }>(`insert into users (email, name) values ('ken@example.com', 'Ken') returning id`);
    await query(`insert into referrals (referrer_id, referred_email, source, stage) values ($1, 'ken@example.com', 'guest', 'invited')`, [a]);
    expect((await createPilotLink(query, { email: "ken@example.com", name: "Ken F", createdBy: "peter@example.com" }, NOW)).ok).toBe(true);
    expect((await userRow("ken@example.com")).referred_by).toBeNull();
    expect(ken).toHaveLength(1);
  });
});
