import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";

/** B2 plan Unit 3: /app/referrals shows the link, the script and the people referred, never an address; off means "coming soon". */

const db: { query: Query | null; userId: string; on: boolean } = { query: null, userId: "", on: true };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/auth/access", () => ({ requireUser: async () => ({ userId: db.userId }) }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/v3-settings-display", () => ({
  getV3SettingsForDisplay: async () => ({ ...mergeV3([]), signupOpen: true, cycleLive: true, referralsOn: db.on }),
}));

const { default: Page } = await import("./page");

async function render(): Promise<string> {
  const { prelude } = await prerender(<Page />);
  return new Response(prelude).text();
}

beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  db.on = true;
  const [u] = await query<{ id: string }>("insert into users (email, status) values ('ana@example.com', 'trial') returning id");
  db.userId = u.id;
});

describe("/app/referrals", () => {
  it("shows the link with Copy, the script, and each referred person with their stage, with no email in the HTML", async () => {
    const [b] = await db.query!<{ id: string }>("insert into users (email, name) values ('bo@example.com', 'Bo Self-Named') returning id");
    await db.query!("insert into referrals (referrer_id, referred_user_id, source, stage, created_at) values ($1, $2, 'link', 'trial', '2026-11-01')", [db.userId, b.id]);
    const [g] = await db.query!<{ id: string }>(
      "insert into referrals (referrer_id, referred_email, source, stage, created_at) values ($1, 'kim@example.com', 'guest', 'invited', '2026-11-02') returning id",
      [db.userId],
    );
    await db.query!("insert into session_guests (token_hash, inviter_id, referral_id, session_date, name, email) values ('h1', $1, $2, '2026-11-10', 'Kim Lee', 'kim@example.com')", [db.userId, g.id]);

    const html = await render();
    const [u] = await db.query!<{ referral_code: string }>("select referral_code from users where id = $1", [db.userId]);
    expect(u.referral_code).toMatch(/^[a-z2-9]{10}$/);
    expect(html).toContain(`/r/${u.referral_code}`);
    expect(html).toContain("Copy link");
    expect(html).toContain('<span class="sr-only">None yet</span>');
    expect(html).toContain("Every Monday it sends me three ideas that are working for other real estate people");
    expect(html).toContain("Someone you invited");
    expect(html).toContain("Kim Lee");
    expect(html).toContain("In trial");
    expect(html).toContain("Invited");
    expect(html).toContain("—");
    expect(html).not.toContain("@");
    expect(html).not.toContain("Self-Named");
  });

  it("says the link could not be made (not 'coming soon') when no code can be made, and logs it", async () => {
    db.userId = "00000000-0000-4000-8000-000000000099";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await render();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
    expect(html).toContain("make your link just now. Try again in a minute.");
    expect(html).not.toContain("coming soon");
  });

  it("shows an empty list before anyone signs up", async () => {
    expect(await render()).toContain("No one yet.");
  });

  it("says coming soon while referrals are off, and makes no code", async () => {
    db.on = false;
    const html = await render();
    expect(html).toContain("coming soon");
    expect(html).not.toContain("/r/");
    const [u] = await db.query!<{ referral_code: string | null }>("select referral_code from users where id = $1", [db.userId]);
    expect(u.referral_code).toBeNull();
  });
});
