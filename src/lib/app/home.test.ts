import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { loadHome } from "./home";

/** `/app` home (plan 2026-11-26-001, Unit 9): one call to action for a held list, and no one-at-a-time entry points. */

let query: Query;
const settings = mergeV3([]);
const WEEK = "2026-12-07";
const SATURDAY = new Date("2026-12-12T15:00:00Z");

async function user(cols: Record<string, unknown>): Promise<string> {
  const c = { email: "a@example.com", status: "trial", plan: "monthly", currency: "USD", ...cols };
  const keys = Object.keys(c);
  const [{ id }] = await query<{ id: string }>(`insert into users (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(c));
  return id;
}

async function held(userId: string) {
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 3)", [userId, WEEK]);
  for (const [i, t] of ["Inbox triage", "Listing post", "Calendar prep"].entries()) {
    const [p] = await query<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ($1, 'Sales', 'd', 'p', 'i', $2, $2) returning id",
      [t, WEEK],
    );
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason) values ($1, $2, $3, $4, 70, 3, 'r')", [userId, WEEK, i + 1, p.id]);
  }
}

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("/app home", () => {
  it("a held list has one call to action: the held block's button, not a second link on the status line", async () => {
    const id = await user({ first_teaser_at: "2026-12-07T12:05:00Z" });
    await held(id);
    const home = await loadHome(query, id, settings, SATURDAY);
    expect(home).toMatchObject({ held: { week: WEEK, count: 3 }, statusLink: null });
  });

  it("keeps the status line's Payment link when it asks for the card with no held titles to show", async () => {
    const id = await user({ first_teaser_at: "2026-12-07T12:05:00Z" });
    const home = await loadHome(query, id, settings, SATURDAY);
    expect(home).toMatchObject({ held: null, statusLink: { href: "/start/payment", label: "Add your card" } });
  });

  it("offers no order box, and a leftover one-at-a-time account still loads (preview only)", async () => {
    const id = await user({ status: "active", plan: "per_run", free_lists_used: 2, trial_started_at: "2026-11-01T15:00:00Z" });
    await query("insert into orders (user_id, week_of, status) values ($1, '2026-12-14', 'ordered')", [id]);
    const home = await loadHome(query, id, settings, SATURDAY);
    expect(home).toMatchObject({ status: "active", plan: "per_run", held: null, statusLink: null });
    expect(home).not.toHaveProperty("order");
  });
});
