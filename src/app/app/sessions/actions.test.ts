import { createElement } from "react";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { nextSession, sessionWhen } from "@/lib/growth/sessions";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";

/**
 * B2 plan Unit 9: /app/sessions and its actions. Paying and sponsored members
 * see the next session and its Meet link; a trial sees the card greyed out
 * with no link anywhere in the HTML; with a setting empty the card is hidden;
 * one guest per session.
 */

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
let refreshed = 0;
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => void refreshed++ }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

const LINK = "https://meet.google.com/abc-defg-hij";
const db: { query: Query | null; userId: string | null; link: string } = { query: null, userId: null, link: LINK };
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUserForAction: async () => {
    if (!db.userId) throw new Error("Not signed in");
    return { userId: db.userId };
  },
  requireUser: async () => {
    if (!db.userId) throw new Error("Not signed in");
    return { userId: db.userId };
  },
  lookupSession: async () => (db.userId ? { state: "live", session: { userId: db.userId } } : { state: "none", hasCookie: false }),
}));
const settings = () => ({ ...mergeV3([]), signupOpen: true, cycleLive: true, sessionDay: "Tuesday", sessionTime: "12:00", sessionLink: db.link });
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => settings() }));
vi.mock("@/lib/v3-settings-display", () => ({ getV3SettingsForDisplay: async () => settings() }));

const { inviteGuestAction, resendInviteAction } = await import("./actions");
const { default: Page } = await import("./page");
const { GET: calendar } = await import("./calendar.ics/route");
const { GET: nextApi } = await import("@/app/api/sessions/next/route");
const { POST: guestApi } = await import("@/app/api/sessions/guest/route");

let mails: { to: string[]; subject: string; text: string }[];
let mailFails = false;
beforeEach(async () => {
  ({ query: db.query } = await testDb());
  resetNextFakes();
  refreshed = 0;
  db.link = LINK;
  mails = [];
  mailFails = false;
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    if (mailFails) return new Response("down", { status: 422 });
    mails.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function user(email: string, status = "active", sponsored = false) {
  let sponsor: string | null = null;
  if (sponsored)
    [{ id: sponsor }] = await db.query!<{ id: string }>(
      `insert into sponsors (name, currency, standard_cents, higher_cents, seats, code_hash, billing_email) values ('Acme', 'USD', 10000, 15000, 5, $1, 'b@acme.example') returning id`,
      [`h-${email}`],
    );
  const [u] = await db.query!<{ id: string }>(`insert into users (email, name, status, display_name, sponsor_id) values ($1, 'Ken', $2, 'Ken R.', $3) returning id`, [email, status, sponsor]);
  return u.id;
}
const CAL = 'href="/app/sessions/calendar.ics"';
function expectNoLink(html: string) {
  expect(html).not.toContain("meet.google.com");
  expect(html).not.toContain("abc-defg-hij");
  expect(html).not.toContain("calendar.ics");
}
async function render(): Promise<string> {
  const { prelude } = await prerender(createElement(Page));
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const invite = (name: string, email: string) => inviteGuestAction({ status: "idle" }, form({ name, email }));
const plan = { dow: 2, hm: "12:00", link: LINK };

describe("/app/sessions", () => {
  it("shows a paying member the next Tuesday session, the Meet link and Add to calendar", async () => {
    db.userId = await user("ken@example.com");
    const html = await render();
    const next = nextSession(plan, new Date());
    expect(html).toContain('data-access="full"');
    expect(html).toContain(sessionWhen(next));
    expect(html).toContain("Tuesday");
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain(CAL);
    expect(html).toContain("Send the invitation");
  });

  it("shows a trial member the card greyed out, with no link anywhere in the HTML", async () => {
    db.userId = await user("t@example.com", "trial");
    const html = await render();
    expect(html).toContain('data-access="locked"');
    expect(html).toContain("Opens when you subscribe");
    expect(html).toContain("Not available on your plan.");
    expect(html).not.toContain("opacity-70");
    expectNoLink(html);
    expect(html).not.toContain("Send the invitation");
  });

  it("shows a sponsored trial member the link too", async () => {
    db.userId = await user("s@example.com", "trial", true);
    const html = await render();
    expect(html).toContain('data-access="full"');
    expect(html).toContain(`href="${LINK}"`);
  });

  it("shows held and cancelled members the locked card, with no link", async () => {
    for (const status of ["held", "cancelled"]) {
      db.userId = await user(`${status}@example.com`, status);
      const html = await render();
      expect(html).toContain('data-access="locked"');
      expectNoLink(html);
    }
  });

  it("offers Send it again for an invitation whose email never started, after a few minutes", async () => {
    db.userId = await user("ken@example.com");
    const next = nextSession(plan, new Date());
    await db.query!(
      `insert into session_guests (token_hash, inviter_id, session_date, name, email, email_key, created_at) values ('h', $1, $2::date, 'Ana', 'ana@example.com', 'ana@example.com', now() - interval '10 minutes')`,
      [db.userId, next.date],
    );
    const html = await render();
    expect(html).toContain("hasn’t gone yet");
    expect(html).toContain("Send it again");
    expect(await resendInviteAction()).toMatchObject({ status: "sent" });
    expect(mails).toHaveLength(1);
  });

  it("hides the card while a session setting is empty", async () => {
    db.userId = await user("ken@example.com");
    db.link = "";
    const html = await render();
    expect(html).toContain("coming soon");
    expect(html).not.toContain("data-access");
    expect(html).not.toContain("Join on Google Meet");
  });
});

describe("inviting a guest from /app/sessions", () => {
  it("sends the invitation, refreshes, and the page then shows the guest", async () => {
    db.userId = await user("ken@example.com");
    expect(await invite("Ana Silva", "ana@example.com")).toMatchObject({ status: "sent", message: "We’ve sent Ana Silva an invitation." });
    expect(refreshed).toBe(1);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(["ana@example.com"]);
    const html = await render();
    expect(html).toContain("You’ve invited Ana Silva to this session.");
    expect(html).not.toContain("Send the invitation");
  });

  it("puts a field error under its field", async () => {
    db.userId = await user("ken@example.com");
    expect(await invite("Ana", "nope")).toMatchObject({ status: "error", field: "email", values: { name: "Ana", email: "nope" } });
    expect(await invite("", "ana@example.com")).toMatchObject({ status: "error", field: "name" });
  });

  it("rejects a second invitation for the same session, keeping what was typed", async () => {
    db.userId = await user("ken@example.com");
    await invite("Ana", "ana@example.com");
    const r = await invite("Bo", "bo@example.com");
    expect(r).toMatchObject({ status: "error", message: "You’ve already invited a guest to this session.", values: { name: "Bo", email: "bo@example.com" } });
    expect(mails).toHaveLength(1);
  });

  it("refuses a trial member", async () => {
    db.userId = await user("t@example.com", "trial");
    expect(await invite("Ana", "ana@example.com")).toMatchObject({ status: "error", message: "Inviting a guest opens when you subscribe." });
    expect(mails).toHaveLength(0);
  });

  it("refuses everyone while a session setting is empty", async () => {
    db.userId = await user("ken@example.com");
    db.link = "";
    expect(await invite("Ana", "ana@example.com")).toMatchObject({ status: "error" });
    expect(await db.query!("select 1 from session_guests")).toHaveLength(0);
  });

  it("offers Send it again after a failed email, and it sends", async () => {
    db.userId = await user("ken@example.com");
    mailFails = true;
    expect(await invite("Ana", "ana@example.com")).toMatchObject({ status: "error" });
    expect(await render()).toContain("Send it again");
    mailFails = false;
    expect(await resendInviteAction()).toMatchObject({ status: "sent" });
    expect(mails).toHaveLength(1);
    expect(await render()).toContain("You’ve invited Ana to this session.");
  });

  it("needs a signed-in member", async () => {
    db.userId = null;
    await expect(invite("Ana", "ana@example.com")).rejects.toThrow("Not signed in");
  });
});

describe("/app/sessions/calendar.ics", () => {
  it("gives a paying member the next session's calendar file, privately", async () => {
    db.userId = await user("ken@example.com");
    const res = await calendar();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="roger-session-\d{4}-\d{2}-\d{2}\.ics"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain(`LOCATION:${LINK}`);
  });

  it("refuses a locked member, anyone signed out, and everyone while sessions are off", async () => {
    db.userId = await user("t@example.com", "trial");
    expect((await calendar()).status).toBe(404);
    db.userId = null;
    expect((await calendar()).status).toBe(401);
    db.userId = await user("ken@example.com");
    db.link = "";
    expect((await calendar()).status).toBe(404);
  });
});

describe("the agent surface", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    guestApi(new Request("https://meetroger.ai/api/sessions/guest", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

  it("GET /api/sessions/next gives the link only to a member with full access", async () => {
    db.userId = await user("ken@example.com");
    const full = await (await nextApi()).json();
    expect(full).toMatchObject({ open: true, access: "full", link: LINK, guest: null });
    expect(full.start).toBe(nextSession(plan, new Date()).start.toISOString());
    db.userId = await user("t@example.com", "trial");
    expect(await (await nextApi()).json()).toMatchObject({ open: true, access: "locked", link: null });
    db.link = "";
    expect(await (await nextApi()).json()).toEqual({ open: false });
    db.userId = null;
    expect((await nextApi()).status).toBe(401);
  });

  it("POST /api/sessions/guest invites through the same checks as the page", async () => {
    db.userId = await user("ken@example.com");
    const res = await post({ name: "Ana", email: "ana@example.com" });
    expect(res.status).toBe(201);
    expect(mails).toHaveLength(1);
    const again = await post({ name: "Bo", email: "bo@example.com" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ reason: "already" });
    expect((await post({ name: "Bo", email: "bo@example.com" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await guestApi(new Request("https://meetroger.ai/api/sessions/guest", { method: "POST", body: "name=x" }))).status).toBe(415);
  });

  it("POST /api/sessions/guest refuses a locked member and anyone signed out", async () => {
    db.userId = await user("t@example.com", "trial");
    expect((await post({ name: "Ana", email: "ana@example.com" })).status).toBe(403);
    db.userId = null;
    expect((await post({ name: "Ana", email: "ana@example.com" })).status).toBe(401);
    expect(mails).toHaveLength(0);
  });
});
