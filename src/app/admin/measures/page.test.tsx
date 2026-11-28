import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

/** B3 Unit 3: /admin/measures, behind the admin check, with the checkpoint card first and accessible tables. */

const db: { query: Query | null; admin: boolean } = { query: null, admin: true };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/admin-auth", () => ({ isAdmin: async () => db.admin }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));

const { default: Page } = await import("./page");

async function render(): Promise<string> {
  const { prelude } = await prerender((await Page())!);
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}

async function user(email: string, su: string): Promise<string> {
  const [{ id }] = await db.query!<{ id: string }>(`insert into users (email, status, signup_finished_at) values ($1, 'active', $2) returning id`, [email, su]);
  return id;
}

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  db.admin = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-10T15:00:00Z"));
  process.env.ADMIN_EMAILS = "boss@example.com";
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.ADMIN_EMAILS;
});

describe("/admin/measures", () => {
  it("shows the checkpoint against the floor in words, and the weekly tables with captions and header scopes", async () => {
    // Four members before November 23; one referred sign-up in the week of November 23: 1 of 4.
    const c = await user("c@example.com", "2026-11-01T15:00:00Z");
    for (const e of ["d@example.com", "e@example.com", "f@example.com"]) await user(e, "2026-11-01T15:00:00Z");
    const r = await user("r@example.com", "2026-11-24T15:00:00Z");
    await db.query!(`insert into referrals (referrer_id, referred_user_id, source, stage, created_at) values ($1, $2, 'link', 'trial', '2026-11-24T15:00:00Z')`, [c, r]);
    // An admin's sign-up is never counted.
    await user("boss@example.com", "2026-11-01T15:00:00Z");

    const html = await render();
    expect(html).toContain("December 14 checkpoint");
    expect(html.indexOf("December 14 checkpoint")).toBeLessThan(html.indexOf("<table"));
    expect(html).toContain("In progress, 3 of 3 weeks");
    expect(html).toContain("Floor 0.25");
    expect(html).toContain("From app data only");
    // Pooled: 1 of (4 + 5 + 5) = 1 / 14 = 0.07.
    expect(html).toContain("0.07");
    expect(html).toContain("1 of 14");
    expect(html).toContain("Below the floor");
    expect(html).toContain("0.25 (1 of 4)");
    expect(html).toMatch(/<caption[^>]*>New members per member, by week<\/caption>/);
    expect(html).toMatch(/<caption[^>]*>Ideas adopted out of ideas sent, by list week \(target: 2 of 3\)<\/caption>/);
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    // 26 weekly rows in each of the four tables.
    expect(html.match(/<th scope="row"[^>]*>2026-12-07<\/th>/g)).toHaveLength(4);
    // No member's email or name on the page.
    expect(html).not.toContain("@example.com");
  });

  it("shows No data, not 0.00, when there is nothing to count", async () => {
    const html = await render();
    expect(html).toContain("No data");
    expect(html).not.toContain("0.00");
    expect(html).not.toContain("Below the floor");
  });

  it("shows the frozen snapshot from December 14", async () => {
    vi.setSystemTime(new Date("2026-12-14T15:00:00Z"));
    const html = await render();
    expect(html).toContain("Frozen on");
    expect(await db.query!("select key from measure_snapshots")).toEqual([{ key: "checkpoint-2026-12-14" }]);
  });

  it("shows nothing to someone who is not an admin", async () => {
    db.admin = false;
    expect(await Page()).toBeNull();
  });
});
