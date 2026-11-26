import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { loadInterest } from "./interest";

let query: Query;

async function user(email: string, cols: Record<string, unknown> = {}): Promise<string> {
  const c = { status: "trial", plan: "monthly", ...cols };
  const keys = Object.keys(c);
  const [{ id }] = await query<{ id: string }>(
    `insert into users (email, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [email, ...Object.values(c)],
  );
  return id;
}
const run = (userId: string, o: { test?: boolean; route?: string } = {}) =>
  query("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status, is_test) values ($1, '2026-12-07', $2, 'hark', 'share', 'x', 'accepted', $3)", [
    userId,
    o.route ?? "connector",
    Boolean(o.test),
  ]);

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("the sign-up funnel (plan 2026-11-26-001, Unit 9; origin R30)", () => {
  it("counts each sign-up week's people at every stage they reached", async () => {
    // Week of Monday 2026-11-30 (Toronto). The last one signs up Sunday 11:30 PM Toronto, still that week.
    const at = "2026-11-30T15:00:00Z";
    await user("a@example.com", { created_at: at, zack_key_created_at: at, first_teaser_at: "2026-12-07T12:05:00Z", trial_started_at: "2026-12-08T15:00:00Z", status: "active", first_charge_at: "2026-12-21T11:05:00Z" });
    await user("b@example.com", { created_at: at, zack_key_created_at: at, first_teaser_at: "2026-12-07T12:05:00Z", trial_started_at: "2026-12-08T15:00:00Z" });
    await user("c@example.com", { created_at: at, zack_key_created_at: at, first_teaser_at: "2026-12-07T12:05:00Z" });
    // Connected by a real run only (no key stamp).
    const d = await user("d@example.com", { created_at: "2026-12-02T15:00:00Z" });
    await run(d, { route: "upload" });
    // Signed up, never connected: a test run does not count.
    const e = await user("e@example.com", { created_at: "2026-12-07T04:30:00Z", status: "signup" });
    await run(e, { test: true });
    // The next week, and a sponsored member (never asked for a card) left out.
    await user("f@example.com", { created_at: "2026-12-07T15:00:00Z" });
    await user("s@example.com", { created_at: at, sponsor_id: "00000000-0000-4000-8000-000000000001", zack_key_created_at: at });

    const { funnel, plans } = await loadInterest(query);
    expect(funnel).toEqual([
      { week: "2026-12-07", signedUp: 1, zackConnected: 0, firstTeaser: 0, cardSaved: 0, firstCharge: 0 },
      { week: "2026-11-30", signedUp: 5, zackConnected: 4, firstTeaser: 3, cardSaved: 2, firstCharge: 1 },
    ]);
    // The per-run plan count is gone (monthly only).
    expect(plans).not.toHaveProperty("perRun");
    expect(plans).toMatchObject({ monthly: 1, sponsored: 1 });
  });

  it("is empty with nobody signed up", async () => {
    expect((await loadInterest(query)).funnel).toEqual([]);
  });

  it("still loads with a leftover one-at-a-time account (preview only)", async () => {
    await user("p@example.com", { status: "active", plan: "per_run", created_at: "2026-11-30T15:00:00Z", trial_started_at: "2026-11-30T16:00:00Z" });
    const i = await loadInterest(query);
    expect(i.funnel).toEqual([{ week: "2026-11-30", signedUp: 1, zackConnected: 0, firstTeaser: 0, cardSaved: 1, firstCharge: 0 }]);
    expect(i.plans).toEqual({ monthly: 0, trial: 0, sponsored: 0 });
  });
});
