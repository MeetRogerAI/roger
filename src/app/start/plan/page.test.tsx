import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * B2 plan Unit 10: Step 3 for a sponsored member shows no prices and no card
 * copy, and a refused sponsor code (`?sponsor=invalid`) shows the uniform
 * message above the usual prices.
 */

const db: { query: Query | null; userId: string | null } = { query: null, userId: null };
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => ({ ...nextNavigation, usePathname: () => "/start/plan" }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUser: async () => ({ userId: db.userId }),
  requireUserForAction: async () => ({ userId: db.userId }),
  getSession: async () => (db.userId ? { userId: db.userId } : null),
}));
vi.mock("@/lib/v3-settings-display", async () => {
  const m = await import("@/lib/v3-settings");
  return { getV3SettingsForDisplay: async () => m.mergeV3([]) };
});

const { default: Page } = await import("./page");
const { SPONSOR_INVALID } = await import("@/lib/sponsors/code");

async function render(search: Record<string, string> = {}): Promise<string> {
  const { prelude } = await prerender(<Page params={Promise.resolve({})} searchParams={Promise.resolve(search)} />);
  return (await new Response(prelude).text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replaceAll("&#x27;", "'");
}

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  resetNextFakes();
  const [u] = await db.query!<{ id: string }>(`insert into users (email, name, status, signup_step, agent) values ('ana@example.com', 'Ana', 'signup', 'plan', 'hark') returning id`);
  db.userId = u.id;
});

describe("/start/plan", () => {
  it("a sponsored member sees who pays, and no prices or card copy", async () => {
    await db.query!(
      `insert into sponsors (id, name, currency, standard_cents, higher_cents, seats, code_hash, billing_email) values ('00000000-0000-4000-8000-000000000009', 'Harbour Realty', 'CAD', 20000, 40000, 5, 'h', 'ap@example.com')`,
    );
    await db.query!(`update users set sponsor_id = '00000000-0000-4000-8000-000000000009' where id = $1`, [db.userId]);
    const text = await render({ sponsor: "invalid" });
    expect(text).toContain("Harbour Realty pays for your Roger membership, so you won’t be asked for a card.");
    expect(text).not.toMatch(/US\$|CA\$|a month|card before|free trial/);
    expect(text).not.toContain(SPONSOR_INVALID);
  });

  it("everyone else sees the prices; a refused sponsor code adds the uniform message", async () => {
    const plain = await render();
    expect(plain).toMatch(/Roger is US\$\d+ a month or CA\$\d+ a month, plus tax/);
    expect(plain).not.toContain(SPONSOR_INVALID);
    const refused = await render({ sponsor: "invalid" });
    expect(refused).toContain(SPONSOR_INVALID);
    expect(refused).toMatch(/Roger is US\$\d+ a month/);
  });
});
