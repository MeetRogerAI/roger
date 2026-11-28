import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * B2 Unit 4 review: the admin user page's read-only "Referral credit" section,
 * behind the admin check. B3 Units 5 and 6: the Feedback section (plain text
 * only) and the read log written before anything is shown (fail-closed).
 */

const db: { query: Query | null; admin: boolean; failLog: boolean } = { query: null, admin: true, failLog: false };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/admin-auth", () => ({ adminIdentity: async () => (db.admin ? "peter@example.com" : null), isAdmin: async () => db.admin }));
vi.mock("@/lib/db-query", () => ({
  query: (t: string, p?: unknown[]) => {
    if (db.failLog && /insert into admin_actions/.test(t)) return Promise.reject(new Error("log down"));
    return db.query!(t, p);
  },
}));
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => mergeV3([{ key: "v3.cycleLive", value: true }]) }));

const { default: Page } = await import("./page");

async function render(id: string): Promise<string> {
  const { prelude } = await prerender(await Page({ params: Promise.resolve({ id }) } as Parameters<typeof Page>[0]));
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}

let userId: string;
beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  db.admin = true;
  db.failLog = false;
  const [u] = await query<{ id: string }>(
    `insert into users (email, name, status, currency, stripe_customer, credit_balance_cents, credit_balance_at) values ('ana@example.com', 'Ana', 'active', 'CAD', 'cus_ana', 14000, '2026-12-16T15:00:00Z') returning id`,
  );
  userId = u.id;
  await query(
    `insert into credits (user_id, kind, amount_cents, offset_cents, currency, status, stripe_txn, posted_at) values ($1, 'grant', 8000, 20000, 'CAD', 'posted', 'cbtxn_1', '2026-12-16T15:00:00Z')`,
    [userId],
  );
  await query(
    `insert into credits (user_id, kind, amount_cents, uncollected_cents, currency, status, reason, source_object_id) values ($1, 'clawback', 4000, 1000, 'CAD', 'pending_customer', 'refund', 're_1')`,
    [userId],
  );
});

describe("/admin/users/[id] referral credit", () => {
  it("lists the member's ledger rows and their cached balance", async () => {
    const html = await render(userId);
    expect(html).toContain("Referral credit");
    expect(html).toContain("Balance CA$140");
    expect(html).toMatch(/grant · posted · CA\$80/);
    expect(html).toContain("offset CA$200");
    expect(html).toMatch(/clawback · pending_customer · CA\$40/);
    expect(html).toContain("uncollected CA$10");
    expect(html).toContain("cbtxn_1");
  });

  it("shows nothing to someone who is not an admin", async () => {
    db.admin = false;
    expect(await Page({ params: Promise.resolve({ id: userId }) } as Parameters<typeof Page>[0])).toBeNull();
  });
});

describe("/admin/users/[id] feedback (B3 Unit 5)", () => {
  it("lists the member's notes and replies as plain text, and offers Add a reply", async () => {
    await db.query!("insert into member_feedback (user_id, week_of, source, body) values ($1, '2026-12-14', 'member_note', '<b>loved</b> the inbox idea')", [userId]);
    await db.query!("insert into member_feedback (user_id, week_of, source, body, entered_by) values ($1, '2026-12-14', 'admin_reply', 'Emailed thanks', 'tim@example.com')", [userId]);
    const html = await render(userId);
    expect(html).toContain("Feedback");
    expect(html).toContain("Note on the week of 2026-12-14");
    expect(html).toContain("&lt;b&gt;loved&lt;/b&gt; the inbox idea");
    expect(html).not.toContain("<b>loved</b>");
    expect(html).toContain("Reply, week of 2026-12-14, added by tim@example.com");
    expect(html).toContain("Add a reply");
  });
});

describe("/admin/users/[id] read log (B3 Unit 6)", () => {
  it("writes one row per kind shown (runs, picks, feedback, profile, emails) for the member, by the admin", async () => {
    await render(userId);
    expect(await db.query!("select admin_email, user_id, action, detail from admin_actions order by id")).toEqual(
      ["read_runs", "read_picks", "read_feedback", "read_profile", "read_emails"].map((action) => ({
        admin_email: "peter@example.com",
        user_id: userId,
        action,
        detail: { page: "/admin/users/[id]", user_ids: [userId], count: 1 },
      })),
    );
    // Each visit is logged again (no deduplication), and reads stay out of the page's own admin log list.
    const html = await render(userId);
    expect(await db.query!("select 1 from admin_actions")).toHaveLength(10);
    expect(html).not.toMatch(/· read_[a-z]+/);
  });

  it("shows none of the member's data when the log write fails", async () => {
    await db.query!("insert into member_feedback (user_id, week_of, source, body) values ($1, '2026-12-14', 'member_note', 'secret note')", [userId]);
    db.failLog = true;
    const html = await render(userId);
    expect(html).toContain("This page couldn’t be logged, so it isn’t shown.");
    for (const t of ["secret note", "ana@example.com", "cbtxn_1", "Referral credit"]) expect(html).not.toContain(t);
  });

  it("lists who read the member's data in a collapsed section, with no member text, and doesn't log that list", async () => {
    const html0 = await render(userId);
    expect(html0).toContain("Who read this member’s data");
    expect(html0).toContain("No reads logged yet.");
    // Another admin's view of the runs list that showed this member, as one of many.
    await db.query!(
      "insert into admin_actions (admin_email, action, detail) values ('tim@example.com', 'read_runs', jsonb_build_object('page', '/admin/runs', 'user_ids', jsonb_build_array($1::text, '00000000-0000-4000-8000-000000000999'), 'count', 2))",
      [userId],
    );
    const before = (await db.query!("select 1 from admin_actions")).length;
    const html = await render(userId);
    const section = html.slice(html.indexOf("Who read this member’s data"), html.indexOf("Quiz answers"));
    expect(section).toMatch(/<details>/);
    expect(section).not.toMatch(/<details open/);
    expect(section).toContain("The latest 2 page views that showed it");
    expect(section).toContain("tim@example.com · /admin/runs · ");
    expect(section).toContain("peter@example.com · /admin/users/[id] · ");
    expect(section).toContain("read_emails, read_feedback, read_picks, read_profile, read_runs");
    for (const t of ["ana@example.com", "Ana", "cbtxn_1"]) expect(section).not.toContain(t);
    // This visit logged its five reads, and nothing more for the list itself.
    expect((await db.query!("select 1 from admin_actions")).length - before).toBe(5);
  });
});
