import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

/** Plan B2 Unit 2: /app/history shows the Season brick graph above the list, and never the word "Level". */

const db: { query: Query | null; userId: string } = { query: null, userId: "" };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/auth/access", () => ({ requireUser: async () => ({ userId: db.userId }) }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));

const { default: Page } = await import("./page");

async function render(): Promise<string> {
  const { prelude } = await prerender(<Page />);
  return new Response(prelude).text();
}

beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  const [u] = await query<{ id: string }>("insert into users (email, status, plan) values ('a@example.com', 'active', 'monthly') returning id");
  db.userId = u.id;
});

describe("/app/history", () => {
  it("shows the empty state with no graph before the first list", async () => {
    const html = await render();
    expect(html).toContain("Your graph starts with your first list.");
    expect(html).not.toContain("<svg");
  });

  it("shows the graph above the list, says Season, and never Level", async () => {
    const [p] = await db.query!<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('Inbox triage', 'Sales', 'd', 'p', 'i', '2026-12-07', '2026-12-07') returning id",
    );
    await db.query!(
      `insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, delivered_at, setup_marked_at, setup_confirmed_at)
       values ($1, '2026-12-07', 1, $2, 70, 3, 'r', '2026-12-07T11:00:00Z', '2026-12-15T15:00:00Z', '2026-12-20T15:00:00Z')`,
      [db.userId, p.id],
    );
    // Only Date is faked, so PGlite's timers keep running. Wednesday of week 3.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-23T15:00:00Z"));
    let html: string;
    try {
      html = await render();
    } finally {
      vi.useRealTimers();
    }
    expect(html).toContain("Season 1 · week 3 of 26 · 1 brick this Season · 1 in all");
    expect(html.replace(/<!-- -->/g, "")).toContain("1 set up, 1 confirmed by Zack.");
    expect(html.indexOf("<svg")).toBeGreaterThan(-1);
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("Inbox triage"));
    expect(html).not.toMatch(/level/i);
  });
});
