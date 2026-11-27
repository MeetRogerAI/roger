import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";

/** B2 Unit 4 review: the admin user page's read-only "Referral credit" section, behind the admin check. */

const db: { query: Query | null; admin: boolean } = { query: null, admin: true };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/admin-auth", () => ({ isAdmin: async () => db.admin }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
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
