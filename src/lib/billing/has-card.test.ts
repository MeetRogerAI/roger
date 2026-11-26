import { beforeEach, describe, expect, it } from "vitest";
import { loadUsers } from "@/lib/cora/context";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { HAS_CARD_OR_SPONSORED_SQL, HAS_CARD_SQL, hasCard, hasCardOrSponsored, isNoCardTrial } from "./has-card";

let query: Query;
beforeEach(async () => {
  ({ query } = await testDb());
});

const SPONSOR = "00000000-0000-4000-8000-000000000001";
const STATUSES = ["signup", "trial", "active", "held", "cancelled", "closed"] as const;

describe("has card (plan 2026-11-26-001, Unit 1)", () => {
  it("the SQL fragment and the TS helper agree on every status, card and sponsor combination", async () => {
    const cases: { status: string; started: string | null; sponsored: boolean }[] = [];
    for (const status of STATUSES) for (const started of [null, "2026-11-30T15:00:00Z"]) for (const sponsored of [false, true]) cases.push({ status, started, sponsored });
    for (const [i, c] of cases.entries()) {
      await query(`insert into users (email, status, trial_started_at, sponsor_id, stripe_customer) values ($1, $2, $3, $4, $5)`, [
        `u${i}@example.com`,
        c.status,
        c.started,
        c.sponsored ? SPONSOR : null,
        // A Stripe customer is never what decides it.
        `cus_${i}`,
      ]);
    }
    const rows = await query<{ email: string; card: boolean; covered: boolean }>(
      `select email, ${HAS_CARD_SQL("u")} as card, ${HAS_CARD_OR_SPONSORED_SQL("u")} as covered from users u order by email`,
    );
    for (const [i, c] of cases.entries()) {
      const r = rows.find((x) => x.email === `u${i}@example.com`)!;
      const facts = { status: c.status, trialStartedAt: c.started, sponsored: c.sponsored };
      expect(r.card, JSON.stringify(c)).toBe(hasCard(facts));
      expect(r.covered, JSON.stringify(c)).toBe(hasCardOrSponsored(facts));
    }
  });

  it("a trial has a card only once trial_started_at is set; active, held and cancelled always count; signup and closed never", () => {
    expect(hasCard({ status: "trial", trialStartedAt: null })).toBe(false);
    expect(hasCard({ status: "trial", trialStartedAt: "2026-11-30T15:00:00Z" })).toBe(true);
    expect(hasCard({ status: "trial", trialStartedAt: new Date() })).toBe(true);
    for (const status of ["active", "held", "cancelled"]) expect(hasCard({ status, trialStartedAt: null })).toBe(true);
    for (const status of ["signup", "closed"]) expect(hasCard({ status, trialStartedAt: null })).toBe(false);
  });

  it("a sponsored trial with no card counts as 'has card or sponsored', and is not a no-card trial", () => {
    const f = { status: "trial", trialStartedAt: null, sponsored: true };
    expect(hasCard(f)).toBe(false);
    expect(hasCardOrSponsored(f)).toBe(true);
    expect(isNoCardTrial(f)).toBe(false);
    expect(isNoCardTrial({ status: "trial", trialStartedAt: null })).toBe(true);
    expect(isNoCardTrial({ status: "active", trialStartedAt: null })).toBe(false);
  });

  it("Cora's loadUsers carries the fact for the admin reason text, and still considers the no-card trial", async () => {
    const [{ id: noCard }] = await query<{ id: string }>(`insert into users (email, status) values ('n@example.com', 'trial') returning id`);
    const [{ id: card }] = await query<{ id: string }>(`insert into users (email, status, trial_started_at) values ('c@example.com', 'trial', now()) returning id`);
    const [{ id: sponsored }] = await query<{ id: string }>(`insert into users (email, status, sponsor_id) values ('s@example.com', 'trial', $1) returning id`, [SPONSOR]);
    const users = await loadUsers(query, "2026-12-14", { now: new Date("2026-12-14T06:00:00Z") });
    const fact = (id: string) => users.find((u) => u.id === id)?.facts.hasCard;
    expect(fact(noCard)).toBe(false);
    expect(fact(card)).toBe(true);
    expect(fact(sponsored)).toBe(true);
  });
});
