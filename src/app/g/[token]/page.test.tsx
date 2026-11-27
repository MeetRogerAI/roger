import { createElement } from "react";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { hashGuestToken, newGuestToken } from "@/lib/growth/session-guests";
import { applyReferral, resolveReferrer } from "@/lib/referrals/attribution";
import { REF_COOKIE, readRefCookie, signRefCookie } from "@/lib/referrals/cookie";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { jar, nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";

/**
 * B2 plan Unit 9: a guest's invitation page, /g/{token}. Day, time and the
 * inviter's display name only; the Meet link only after the RSVP; a generic
 * page for an unknown token; "This session has passed" afterwards; and the
 * inviter remembered as the referrer, so the guest's sign-up promotes the
 * invited row instead of making a second one.
 */

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
let refreshed = 0;
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => void refreshed++ }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), hasDb: () => true }));

const LINK = "https://meet.google.com/abc-defg-hij";
const KEY = "test-ref-secret";
process.env.REF_SECRET = KEY;
const db: { query: Query | null; link: string; down: boolean } = { query: null, link: LINK, down: false };
vi.mock("@/lib/db-query", () => ({
  query: (t: string, p?: unknown[]) => (db.down ? Promise.reject(new Error("db down")) : db.query!(t, p)),
}));
const settings = () => ({ ...mergeV3([]), signupOpen: true, cycleLive: true, sessionDay: "Tuesday", sessionTime: "12:00", sessionLink: db.link });
vi.mock("@/lib/v3-settings-display", () => ({ getV3SettingsForDisplay: async () => settings() }));
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => settings() }));

const { default: Page } = await import("./page");
const { rememberInviterAction, rsvpAction } = await import("./actions");
const { GET: calendarRoute } = await import("./calendar.ics/route");
const calendar = (token: string) => calendarRoute(new Request(`https://meetroger.ai/g/${token}/calendar.ics`), { params: Promise.resolve({ token }) });
const noLink = (html: string) => {
  expect(html).not.toContain("meet.google.com");
  expect(html).not.toContain("calendar.ics");
};

async function render(token: string): Promise<string> {
  const { prelude } = await prerender(createElement(Page, { params: Promise.resolve({ token }) }));
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}
const rsvp = (token: string) => {
  const fd = new FormData();
  fd.append("token", token);
  return rsvpAction({ status: "idle" }, fd);
};

/** Days from today, as a Toronto-ish date: far enough either side that the time zone doesn't matter. */
const dayFromToday = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let ken: string;
async function guest(o: { date?: string; displayName?: string } = {}) {
  if (o.displayName !== undefined) await db.query!(`update users set display_name = $2 where id = $1`, [ken, o.displayName]);
  const token = newGuestToken();
  const [r] = await db.query!<{ id: string }>(
    `insert into referrals (referrer_id, referred_email, source, stage) values ($1, 'ana@example.com', 'guest', 'invited') on conflict do nothing returning id`,
    [ken],
  );
  await db.query!(`insert into session_guests (token_hash, inviter_id, referral_id, session_date, name, email) values ($1, $2, $3, $4::date, 'Ana', 'ana@example.com')`, [
    hashGuestToken(token),
    ken,
    r?.id ?? null,
    o.date ?? dayFromToday(3),
  ]);
  return token;
}

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  resetNextFakes();
  refreshed = 0;
  db.link = LINK;
  db.down = false;
  [{ id: ken }] = await db.query!<{ id: string }>(`insert into users (email, name, status, display_name, referral_code) values ('ken@example.com', 'Kenneth Private', 'active', 'Ken R.', 'kenkenkenk') returning id`);
});

describe("/g/{token}", () => {
  it("shows the session and the inviter's display name, and no Meet link before the RSVP", async () => {
    const token = await guest();
    const html = await render(token);
    expect(html).toContain("Ken R. invited you to Roger’s group session.");
    expect(html).toContain("Toronto time");
    expect(html).toContain("I’m coming");
    expect(html).not.toContain("meet.google.com");
    expect(html).not.toContain("calendar.ics");
    expect(html).not.toContain("Kenneth Private");
    expect(html).not.toContain("ken@example.com");
  });

  it("shows the Meet link once the guest has RSVPed", async () => {
    const token = await guest();
    expect(await rsvp(token)).toMatchObject({ status: "idle" });
    expect(refreshed).toBe(1);
    const html = await render(token);
    expect(html).toContain('data-rsvp="yes"');
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain(`href="/g/${token}/calendar.ics"`);
  });

  it("names an inviter without a usable display name 'A Roger member'", async () => {
    const token = await guest({ displayName: "Roger Support" });
    expect(await render(token)).toContain("A Roger member invited you");
  });

  it("says the session has passed afterwards, without the link, and refuses a late RSVP", async () => {
    const token = await guest({ date: dayFromToday(-3) });
    const html = await render(token);
    expect(html).toContain("This session has passed.");
    noLink(html);
    expect(await rsvp(token)).toMatchObject({ status: "error" });
    expect(await db.query!("select 1 from session_guests where rsvp_at is not null")).toHaveLength(0);
  });

  it("gives an unknown or malformed token the same generic page", async () => {
    await guest();
    for (const t of [newGuestToken(), "nope", "../../etc"]) {
      const html = await render(t);
      expect(html).toContain("This invitation link isn’t valid.");
      expect(html).not.toContain("Ken");
      noLink(html);
    }
  });

  it("is generic while sessions are switched off (a setting emptied)", async () => {
    const token = await guest();
    await rsvp(token);
    db.link = "";
    const html = await render(token);
    expect(html).toContain("This invitation link isn’t valid.");
    noLink(html);
  });

  it("shows a neutral 'try again' on a database failure, saying nothing about the token", async () => {
    const token = await guest();
    db.down = true;
    for (const t of [token, newGuestToken()]) {
      const html = await render(t);
      expect(html).toContain("We can’t open invitations just now.");
      expect(html).not.toContain("isn’t valid");
      noLink(html);
    }
    db.down = false;
  });

  it("shows the link only to the guest who RSVPed, when two are invited", async () => {
    const ana = await guest();
    const [{ id: mia }] = await db.query!<{ id: string }>(`insert into users (email, status, display_name) values ('mia@example.com', 'active', 'Mia') returning id`);
    const bo = newGuestToken();
    await db.query!(`insert into session_guests (token_hash, inviter_id, session_date, name, email) values ($1, $2, $3::date, 'Bo', 'bo@example.com')`, [hashGuestToken(bo), mia, dayFromToday(3)]);
    await rsvp(ana);
    expect(await render(ana)).toContain(LINK);
    noLink(await render(bo));
  });

  it("serves the guest's calendar file only after the RSVP, and the same 404 for a bad token", async () => {
    const token = await guest();
    expect((await calendar(token)).status).toBe(404);
    expect((await calendar(newGuestToken())).status).toBe(404);
    expect((await calendar("nope")).status).toBe(404);
    await rsvp(token);
    const res = await calendar(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).toContain(`LOCATION:${LINK}`);
    const past = await guest({ date: dayFromToday(-3) });
    await db.query!(`update session_guests set rsvp_at = now() where token_hash = $1`, [hashGuestToken(past)]);
    expect((await calendar(past)).status).toBe(404);
  });

  it("remembers the inviter as the referrer, unless the browser already holds one", async () => {
    const token = await guest();
    await rememberInviterAction(token);
    expect(readRefCookie(jar.get(REF_COOKIE), KEY, new Date())).toMatchObject({ code: "kenkenkenk", purpose: "guest" });

    const [other] = await db.query!<{ id: string }>(`insert into users (email, status, referral_code) values ('bo@example.com', 'active', 'bcbcbcbcbc') returning id`);
    expect(other).toBeTruthy();
    const held = signRefCookie({ code: "bcbcbcbcbc", issuedAt: Date.now(), purpose: "link" }, KEY);
    resetNextFakes({ [REF_COOKIE]: held });
    await rememberInviterAction(token);
    expect(jar.get(REF_COOKIE)).toBe(held);
  });

  it("a guest who signs up through the cookie becomes the inviter's referral: the invited row moves to trial, no second row", async () => {
    const token = await guest();
    await rememberInviterAction(token);
    const now = new Date();
    const referrer = await resolveReferrer(db.query!, jar.get(REF_COOKIE), now, KEY);
    expect(referrer).toEqual({ id: ken, via: "guest" });
    const [ana] = await db.query!<{ id: string }>(`insert into users (email, status) values ('Ana@Example.com', 'trial') returning id`);
    expect(await applyReferral(db.query!, { userId: ana.id, email: "Ana@Example.com", referrer, now })).toBe("attributed");
    const rows = await db.query!<{ referrer_id: string; referred_user_id: string; stage: string; referred_email: string | null }>(
      `select referrer_id, referred_user_id, stage, referred_email from referrals`,
    );
    expect(rows).toEqual([{ referrer_id: ken, referred_user_id: ana.id, stage: "trial", referred_email: null }]);
  });
});
