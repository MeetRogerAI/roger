import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * Plan 2026-11-26-001, Unit 3: the week page for a held list (no card yet)
 * renders the titles only. The rendered page is checked for the absence of
 * every detail field.
 */

const db: { query: Query | null; userId: string } = { query: null, userId: "" };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/auth/access", () => ({ requireUser: async () => ({ userId: db.userId }) }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const m = await orig<typeof import("@/lib/v3-settings")>();
  return { ...m, readV3Settings: async () => m.mergeV3([]) };
});

const { default: Page } = await import("./page");
const WEEK = "2026-12-14";

async function render(date: string): Promise<string> {
  const { prelude } = await prerender(<Page params={Promise.resolve({ date })} searchParams={Promise.resolve({})} />);
  const html = await new Response(prelude).text();
  return html;
}

beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  const [u] = await query<{ id: string }>("insert into users (email, status, plan) values ('a@example.com', 'trial', 'monthly') returning id");
  db.userId = u.id;
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [u.id, WEEK]);
  for (const [i, t] of ["Inbox triage", "Listing post", "Calendar prep"].entries()) {
    const [p] = await query<{ id: string }>(
      `insert into pool_plays (title, category, description, playbook_md, paste_to_install, heavy_use_for, first_seen, last_seen, figures)
       values ($1, 'Sales', 'Secret description.', '1. Secret step.', 'Secret install.', 'Secret heavy use.', $2, $2, '{"current_hours_week": 2}') returning id`,
      [t, WEEK],
    );
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 77, 3, 'Secret reason.')", [u.id, WEEK, i + 1, p.id]);
  }
});

describe("/app/week/[date] for a held list", () => {
  it("shows the titles, locked, and no reason, score, step or install text", async () => {
    const html = await render(WEEK);
    expect(html).toContain("Your first 3 ideas are ready");
    for (const t of ["Inbox triage", "Listing post", "Calendar prep"]) expect(html).toContain(t);
    expect(html).toContain('href="/start/payment"');
    expect(html).not.toMatch(/Secret|your score|Open and install|77/);
  });

  it("shows the ideas in full once the list is delivered", async () => {
    await db.query!("update picks set delivered_at = now()");
    await db.query!("update users set trial_started_at = now()");
    const html = await render(WEEK);
    expect(html).toContain("Secret reason.");
    expect(html).not.toContain("Your first 3 ideas are ready");
  });

  it("shows the plain empty state for another week", async () => {
    const html = await render("2026-12-07");
    expect(html).toContain("There are no ideas for you for that week.");
    expect(html).not.toContain("Inbox triage");
  });
});
