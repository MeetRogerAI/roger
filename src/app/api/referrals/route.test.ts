import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";

/** B2 whole-branch review: GET /api/referrals, the agent surface for /app/referrals (the caller's own link, people and credit). */

const db: { query: Query | null; userId: string | null; on: boolean; dbDown: boolean } = { query: null, userId: null, on: true, dbDown: false };
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  lookupSession: async () => (db.dbDown ? { state: "error" } : db.userId ? { state: "live", session: { userId: db.userId } } : { state: "none", hasCookie: false }),
}));
const settings = () => ({ ...mergeV3([]), signupOpen: true, cycleLive: true, referralsOn: db.on });
vi.mock("@/lib/v3-settings-display", () => ({ getV3SettingsForDisplay: async () => settings() }));

const { GET } = await import("./route");

let ken: string;
beforeEach(async () => {
  ({ query: db.query } = await testDb());
  Object.assign(db, { on: true, dbDown: false });
  [{ id: ken }] = await db.query!<{ id: string }>("insert into users (email, status, currency) values ('ken@example.com', 'active', 'CAD') returning id");
  db.userId = ken;
});

describe("GET /api/referrals", () => {
  it("returns the caller's link, the people they referred with their stage (no address), and their credit", async () => {
    const [{ id: ana }] = await db.query!<{ id: string }>("insert into users (email, status) values ('ana@example.com', 'trial') returning id");
    await db.query!("insert into referrals (referrer_id, referred_user_id, source, stage, trial_at) values ($1, $2, 'link', 'trial', now())", [ken, ana]);
    await db.query!("insert into credits (user_id, kind, amount_cents, currency, status, posted_at) values ($1, 'grant', 28000, 'CAD', 'posted', now())", [ken]);
    await db.query!("insert into credits (user_id, kind, amount_cents, currency, status) values ($1, 'grant', 14000, 'CAD', 'pending_customer')", [ken]);
    await db.query!("insert into credits (user_id, kind, amount_cents, uncollected_cents, currency, status, posted_at, source_object_id) values ($1, 'clawback', 7000, 1000, 'CAD', 'posted', now(), 're_1')", [ken]);
    await db.query!("update users set credit_balance_cents = 21000, credit_balance_at = '2026-11-27T15:00:00Z' where id = $1", [ken]);

    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body.open).toBe(true);
    expect(body.code).toMatch(/^[A-Za-z0-9]+$/);
    expect(body.link).toContain(body.code);
    expect(body.people).toEqual([{ who: "Someone you invited", stage: "trial" }]);
    expect(JSON.stringify(body)).not.toContain("ana@example.com");
    expect(body.credit).toEqual({
      balance: { cents: 21000, currency: "CAD", asOf: "2026-11-27T15:00:00.000Z" },
      ledger: { earnedCents: 28000, waitingCents: 14000, takenBackCents: 6000, currency: "CAD" },
    });
    // The same code every time.
    expect((await (await GET()).json()).code).toBe(body.code);
  });

  it("while referrals are switched off: no link or people, the credit still shown", async () => {
    db.on = false;
    const body = await (await GET()).json();
    expect(body).toEqual({ open: false, code: null, link: null, people: [], credit: { balance: null, ledger: { earnedCents: 0, waitingCents: 0, takenBackCents: 0, currency: null } } });
    expect(await db.query!("select referral_code from users where id = $1 and referral_code is not null", [ken])).toEqual([]);
  });

  it("refuses without a session (401), while signing up (403), and says so when the sign-in check fails (503)", async () => {
    db.userId = null;
    expect((await GET()).status).toBe(401);
    [{ id: db.userId }] = await db.query!<{ id: string }>("insert into users (email, status) values ('new@example.com', 'signup') returning id");
    expect((await GET()).status).toBe(403);
    db.dbDown = true;
    expect((await GET()).status).toBe(503);
  });
});
