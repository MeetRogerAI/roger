import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { testDb } from "@/test-helpers/pglite-db";
import { optOutGuest } from "@/lib/mail/suppression";
import { guestOptOutToken, optOutOneClickUrl } from "@/lib/mail/unsubscribe";
import { GUEST_EMAILS_PER_DAY, guestForToken, hashGuestToken, inviteGuest, myGuest, resendGuestInvite, rsvpGuest } from "./session-guests";

/**
 * B2 plan Unit 9 and its review: guest invitations on a real (PGlite)
 * database. Hashed tokens, the invited referral, one guest per member per
 * session, one invitation per person a week, an atomic daily cap, the
 * normalised suppression and account checks, and a re-send that can only
 * ever send the token it stored.
 */

let q: Query;
let failReferral = false;
let failGuestInsert = 0;
let sent: { to: string[]; subject: string; text: string; html: string; headers?: Record<string, string> }[];
let failNext = 0;
const transport: Transport = async (m) => {
  if (failNext > 0) {
    failNext--;
    return { ok: false, error: "down", retryable: false };
  }
  sent.push({ to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
  return { ok: true };
};
const mail = () => ({ transport, sleep: async () => {}, query: q });
const plan = { dow: 2, hm: "12:00", link: "https://meet.google.com/abc-defg-hij" };
const NOW = new Date("2026-11-30T15:00:00Z"); // Monday; next session Tuesday 2026-12-01
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

async function user(email: string, o: { status?: string; displayName?: string; sponsored?: boolean } = {}) {
  let sponsor: string | null = null;
  if (o.sponsored) {
    [{ id: sponsor }] = await q<{ id: string }>(
      `insert into sponsors (name, currency, standard_cents, higher_cents, seats, code_hash, billing_email) values ('Acme', 'USD', 10000, 15000, 5, $1, 'b@acme.example') returning id`,
      [`h-${email}`],
    );
  }
  const [u] = await q<{ id: string }>(`insert into users (email, status, display_name, sponsor_id) values ($1, $2, $3, $4) returning id`, [email, o.status ?? "active", o.displayName ?? "", sponsor]);
  return u.id;
}
const invite = (inviterId: string, name: string, email: string, now = NOW) => inviteGuest(q, { inviterId, name, email, plan, now, mail: mail() });
const resend = (inviterId: string, now = NOW, p: typeof plan | null = plan) => resendGuestInvite(q, { inviterId, plan: p, now, mail: mail() });
const tokenIn = (text: string) => /\/g\/([A-Za-z0-9_-]{22})/.exec(text)?.[1] ?? "";

afterEach(() => vi.unstubAllEnvs());

beforeEach(async () => {
  vi.stubEnv("UNSUB_SECRET", "guest-test-secret");
  const db = await testDb();
  failReferral = false;
  failGuestInsert = 0;
  q = async (t, p) => {
    if (failReferral && /insert into referrals/.test(t)) throw new Error("referral write failed");
    if (failGuestInsert > 0 && /insert into session_guests/.test(t)) {
      failGuestInsert--;
      throw new Error("guest write failed");
    }
    return db.query(t, p);
  };
  sent = [];
  failNext = 0;
});

describe("inviting a guest", () => {
  it("stores the guest with a hashed 128-bit token and normalised address, an invited referral, and emails them once", async () => {
    const ken = await user("ken@example.com", { displayName: "Ken R." });
    expect(await invite(ken, "Ana Silva", "Ana.Silva+roger@Gmail.com")).toMatchObject({ ok: true, sent: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["Ana.Silva+roger@Gmail.com"]);
    expect(sent[0].text).toContain("Ken R. invited you");
    expect(sent[0].text).not.toContain("meet.google.com");
    const token = tokenIn(sent[0].text);
    expect(Buffer.from(token, "base64url")).toHaveLength(16);
    const [g] = await q<{ token_hash: string; session_date: string; referral_id: string; email_key: string }>(`select token_hash, session_date::text, referral_id, email_key from session_guests`);
    expect(g).toMatchObject({ token_hash: hashGuestToken(token), session_date: "2026-12-01", email_key: "anasilva@gmail.com" });
    const [ref] = await q<{ id: string; stage: string; source: string; referred_email: string }>(`select id, stage, source, referred_email from referrals`);
    expect(ref).toMatchObject({ id: g.referral_id, stage: "invited", source: "guest", referred_email: "anasilva@gmail.com" });
    expect(await myGuest(q, ken, "2026-12-01", NOW)).toEqual({ name: "Ana Silva", emailState: "sent", canResend: false });
  });

  it("rejects a second guest for the same session", async () => {
    const ken = await user("ken@example.com");
    await invite(ken, "Ana", "ana@example.com");
    expect(await invite(ken, "Bo", "bo@example.com")).toMatchObject({ ok: false, reason: "already" });
    expect(await q("select 1 from session_guests")).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("invites one person at most once a week, whoever invites and however the address is written", async () => {
    const [ken, mia, lou] = [await user("ken@example.com"), await user("mia@example.com"), await user("lou@example.com")];
    expect(await invite(ken, "Ana", "ana.silva@gmail.com")).toMatchObject({ ok: true });
    expect(await invite(mia, "Ana", "AnaSilva+x@googlemail.com")).toMatchObject({ ok: false, reason: "recent", field: "email" });
    expect(await invite(lou, "Ana", "a.n.a.silva@gmail.com")).toMatchObject({ ok: false, reason: "recent" });
    expect(sent).toHaveLength(1);
    // Eight days on, for the session after that, Ken may invite her again and keeps his one referral row.
    expect(await invite(ken, "Ana", "ana.silva@gmail.com", new Date(NOW.getTime() + 8 * 86_400_000))).toMatchObject({ ok: true });
    const refs = await q<{ id: string }>(`select id from referrals`);
    expect(refs).toHaveLength(1);
    expect(await q(`select 1 from session_guests where referral_id = $1`, [refs[0].id])).toHaveLength(2);
  });

  it("is only for paying and sponsored members", async () => {
    expect(await invite(await user("t@example.com", { status: "trial" }), "Ana", "ana@example.com")).toMatchObject({ ok: false, reason: "locked" });
    expect(await invite(await user("s@example.com", { status: "trial", sponsored: true }), "Ana", "ana@example.com")).toMatchObject({ ok: true });
  });

  it("validates the name and address, says which field, and refuses the member's own address", async () => {
    const ken = await user("ken.r@gmail.com");
    expect(await invite(ken, "", "ana@example.com")).toMatchObject({ reason: "name", field: "name" });
    expect(await invite(ken, "http://x", "ana@example.com")).toMatchObject({ reason: "name" });
    expect(await invite(ken, "Ana", "not-an-address")).toMatchObject({ reason: "email", field: "email" });
    expect(await invite(ken, "Me", "Kenr+guest@googlemail.com")).toMatchObject({ reason: "self", field: "email" });
    expect(await inviteGuest(q, { inviterId: ken, name: "Ana", email: "ana@example.com", plan: null, now: NOW, mail: mail() })).toMatchObject({ reason: "closed" });
    expect(sent).toHaveLength(0);
  });

  it("sends nothing to an address that unsubscribed, compared on the normalised address", async () => {
    const ken = await user("ken@example.com");
    await q(`insert into watches (email, query, token, unsubscribed_at) values ('A.N.A+watch@Gmail.com', 'x', 't1', now())`);
    expect(await invite(ken, "Ana", "ana@googlemail.com")).toMatchObject({ ok: false, reason: "blocked" });
    expect(sent).toHaveLength(0);
    expect(await q("select 1 from session_guests")).toHaveLength(0);
  });

  it("carries the guest's signed opt-out link and one-click List-Unsubscribe headers (whole-branch review; CASL and CAN-SPAM)", async () => {
    const ken = await user("ken@example.com");
    await invite(ken, "Ana", "Ana.Silva+x@Gmail.com");
    const t = guestOptOutToken("anasilva@gmail.com")!;
    expect(sent[0].text).toContain(`/o/${t}`);
    expect(sent[0].html).toContain(`/o/${t}`);
    expect(sent[0].headers).toEqual({ "List-Unsubscribe": `<${optOutOneClickUrl(t)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("an address that opted out gets no further invitation from any member, however it is written; a tampered token suppresses nothing", async () => {
    const ken = await user("ken@example.com");
    const mia = await user("mia@example.com");
    await invite(ken, "Ana", "ana.silva@gmail.com");
    const t = /[/]o[/]([A-Za-z0-9_-]+)/.exec(sent[0].text)![1];
    const tampered = `${t.slice(0, 10)}${t[10] === "A" ? "B" : "A"}${t.slice(11)}`;
    expect(await optOutGuest(q, tampered)).toBeNull();
    expect(await q("select 1 from email_suppressions")).toHaveLength(0);
    expect(await optOutGuest(q, t)).toEqual({ emailKey: "anasilva@gmail.com" });
    expect(await optOutGuest(q, t)).toEqual({ emailKey: "anasilva@gmail.com" });
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(await invite(mia, "Ana", "AnaSilva+again@googlemail.com", later)).toMatchObject({ ok: false, reason: "blocked" });
    expect(await invite(ken, "Ana", "ana.silva@gmail.com", later)).toMatchObject({ ok: false, reason: "blocked" });
    expect(sent).toHaveLength(1);
  });

  it("without UNSUB_SECRET there is no opt-out link, so nothing is sent", async () => {
    vi.stubEnv("UNSUB_SECRET", "");
    const ken = await user("ken@example.com");
    expect(await invite(ken, "Ana", "ana@example.com")).toMatchObject({ ok: false, reason: "closed" });
    expect(sent).toHaveLength(0);
    expect(await q("select 1 from session_guests")).toHaveLength(0);
  });

  it("makes no referral row for an address that already has an account, Gmail dots and tags included", async () => {
    const ken = await user("ken@example.com");
    await user("mia.lee@gmail.com");
    expect(await invite(ken, "Mia", "MiaLee+guest@googlemail.com")).toMatchObject({ ok: true });
    expect(await q("select 1 from referrals")).toHaveLength(0);
  });

  it(`stops at ${GUEST_EMAILS_PER_DAY} invitations a day across Roger`, async () => {
    const inviters: string[] = [];
    for (let i = 0; i <= GUEST_EMAILS_PER_DAY; i++) inviters.push(await user(`m${i}@example.com`));
    for (let i = 0; i < GUEST_EMAILS_PER_DAY; i++) expect(await invite(inviters[i], "Guest", `g${i}@example.com`)).toMatchObject({ ok: true });
    expect(await invite(inviters[GUEST_EMAILS_PER_DAY], "Guest", "late@example.com")).toMatchObject({ ok: false, reason: "cap" });
    expect(sent).toHaveLength(GUEST_EMAILS_PER_DAY);
    // The next day the count starts again, and the refused attempt didn't use up the person's week.
    expect(await invite(inviters[GUEST_EMAILS_PER_DAY], "Guest", "late@example.com", new Date(NOW.getTime() + 86_400_000))).toMatchObject({ ok: true });
  });

  it("lets only one of two concurrent invitations through at 49", async () => {
    const inviters: string[] = [];
    for (let i = 0; i < GUEST_EMAILS_PER_DAY + 1; i++) inviters.push(await user(`m${i}@example.com`));
    for (let i = 0; i < GUEST_EMAILS_PER_DAY - 1; i++) await invite(inviters[i], "Guest", `g${i}@example.com`);
    const both = await Promise.all([invite(inviters[49], "Guest", "x@example.com"), invite(inviters[50], "Guest", "y@example.com")]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.filter((r) => !r.ok && r.reason === "cap")).toHaveLength(1);
    expect(await q("select 1 from session_guests")).toHaveLength(GUEST_EMAILS_PER_DAY);
  });
});

describe("the counters when an invitation fails", () => {
  const counts = async () =>
    Object.fromEntries((await q<{ key: string; count: number }>(`select key, count from rate_events where key like 'guest-invite:%' order by key`)).map((r) => [r.key.startsWith("guest-invite:to:") ? "person" : "day", Number(r.count)]));

  it("gives both counts back when the guest row can't be written, so a retry for the same address succeeds", async () => {
    const [ken, mia] = [await user("ken@example.com"), await user("mia@example.com")];
    await invite(mia, "Bo", "bo@example.com");
    const before = await counts();
    expect(before).toEqual({ day: 1, person: 1 });
    failGuestInsert = 1;
    await expect(invite(ken, "Ana", "ana@example.com")).rejects.toThrow("guest write failed");
    const after = Object.fromEntries((await q<{ key: string; count: number }>(`select key, count from rate_events where key like 'guest-invite:%'`)).map((r) => [r.key, Number(r.count)]));
    expect(after["guest-invite:day"]).toBe(1);
    expect(Object.entries(after).filter(([k, n]) => k.startsWith("guest-invite:to:") && n > 0)).toHaveLength(1);
    expect(await invite(ken, "Ana", "ana@example.com")).toMatchObject({ ok: true, sent: "sent" });
    expect(await q("select 1 from session_guests")).toHaveLength(2);
  });

  it("lets only one of two members inviting the same address at once through", async () => {
    const [ken, mia] = [await user("ken@example.com"), await user("mia@example.com")];
    const both = await Promise.all([invite(ken, "Ana", "ana.silva@gmail.com"), invite(mia, "Ana", "AnaSilva@googlemail.com")]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.filter((r) => !r.ok && r.reason === "recent")).toHaveLength(1);
    expect(await q("select 1 from session_guests")).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect((await counts()).day).toBe(1);
  });
});

describe("sending an invitation again", () => {
  it("re-sends a failed invitation with a new token; the old one stops working; never one that went", async () => {
    const ken = await user("ken@example.com");
    failNext = 1;
    expect(await invite(ken, "Ana", "ana@example.com")).toMatchObject({ ok: true, sent: "failed" });
    expect(await myGuest(q, ken, "2026-12-01", NOW)).toMatchObject({ emailState: "failed", canResend: true });
    const [before] = await q<{ token_hash: string }>(`select token_hash from session_guests`);
    expect(await resend(ken)).toMatchObject({ ok: true, sent: "sent" });
    const token = tokenIn(sent[0].text);
    const [after] = await q<{ token_hash: string }>(`select token_hash from session_guests`);
    expect(after.token_hash).not.toBe(before.token_hash);
    expect(after.token_hash).toBe(hashGuestToken(token));
    expect(await guestForToken(q, token)).not.toBeNull();
    expect(await q(`select 1 from session_guests where token_hash = $1`, [before.token_hash])).toHaveLength(0);
    expect(await resend(ken)).toMatchObject({ ok: false, reason: "alreadySent" });
    expect(sent).toHaveLength(1);
  });

  it("lets only one of two concurrent re-sends win, and the token it sends is the one stored", async () => {
    const ken = await user("ken@example.com");
    failNext = 1;
    await invite(ken, "Ana", "ana@example.com");
    const both = await Promise.all([resend(ken), resend(ken)]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(sent).toHaveLength(1);
    const [g] = await q<{ token_hash: string }>(`select token_hash from session_guests`);
    expect(g.token_hash).toBe(hashGuestToken(tokenIn(sent[0].text)));
  });

  it("finishes an invitation whose referral step failed: the page offers a re-send after a few minutes, which links and sends", async () => {
    const ken = await user("ken@example.com");
    failReferral = true;
    await expect(invite(ken, "Ana", "ana@example.com")).rejects.toThrow("referral write failed");
    failReferral = false;
    expect(sent).toHaveLength(0);
    expect(await myGuest(q, ken, "2026-12-01", NOW)).toMatchObject({ emailState: "none", canResend: false });
    expect(await resend(ken)).toMatchObject({ ok: false, reason: "notYet" });
    expect(await myGuest(q, ken, "2026-12-01", minutes(6))).toMatchObject({ emailState: "none", canResend: true });
    expect(await resend(ken, minutes(6))).toMatchObject({ ok: true, sent: "sent" });
    const [g] = await q<{ referral_id: string | null }>(`select referral_id from session_guests`);
    expect(g.referral_id).not.toBeNull();
    expect(await q(`select 1 from referrals where stage = 'invited' and source = 'guest'`)).toHaveLength(1);
  });

  it("answers locked, closed, no guest, exhausted and unsubscribed", async () => {
    const ken = await user("ken@example.com");
    expect(await resend(ken)).toMatchObject({ reason: "noGuest" });
    expect(await resend(ken, NOW, null)).toMatchObject({ reason: "closed" });
    failNext = 3;
    await invite(ken, "Ana", "ana@example.com");
    expect(await resend(ken)).toMatchObject({ reason: "failed" });
    expect(await resend(ken)).toMatchObject({ reason: "failed" });
    expect(await resend(ken)).toMatchObject({ reason: "exhausted" });
    expect(await myGuest(q, ken, "2026-12-01", NOW)).toMatchObject({ emailState: "failed", canResend: false });

    const mia = await user("mia@example.com");
    failNext = 1;
    await invite(mia, "Bo", "bo@example.com");
    await q(`insert into watches (email, query, token, unsubscribed_at) values ('bo+w@example.com', 'x', 't2', now())`);
    expect(await resend(mia)).toMatchObject({ reason: "blocked" });
    await q(`update users set status = 'trial' where id = $1`, [mia]);
    expect(await resend(mia)).toMatchObject({ reason: "locked" });
    expect(sent).toHaveLength(0);
  });
});

describe("the guest's token", () => {
  it("opens the invitation by its hash; RSVP is recorded once and only for that guest; unknown tokens open nothing", async () => {
    const ken = await user("ken@example.com", { displayName: "Roger Admin" });
    const mia = await user("mia@example.com", { displayName: "Mia" });
    await invite(ken, "Ana", "ana@example.com");
    await invite(mia, "Bo", "bo@example.com");
    const [ana, bo] = sent.map((m) => tokenIn(m.text));
    expect(await guestForToken(q, ana)).toMatchObject({ inviterId: ken, inviterName: "A Roger member", sessionDate: "2026-12-01", rsvpAt: null });
    expect(await guestForToken(q, "A".repeat(22))).toBeNull();
    expect(await guestForToken(q, "short")).toBeNull();
    expect(await rsvpGuest(q, ana, NOW)).toBe(true);
    const first = (await guestForToken(q, ana))!.rsvpAt;
    expect(first).not.toBeNull();
    expect((await guestForToken(q, bo))!.rsvpAt).toBeNull();
    await rsvpGuest(q, ana, minutes(60));
    expect((await guestForToken(q, ana))!.rsvpAt).toBe(first);
    expect(await rsvpGuest(q, "A".repeat(22), NOW)).toBe(false);
  });
});
