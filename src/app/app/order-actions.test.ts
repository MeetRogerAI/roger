import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * Review fixes (Unit 9), F1: the dormant one-at-a-time order actions are
 * public endpoints with no page calling them. They refuse every account that
 * is not a leftover per-run account with a card before touching the database
 * or Stripe.
 */
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => {} }));

let current: Query;
let signedIn: string | null = null;
const settingsRead = vi.fn(async () => mergeV3([]));
const placed = vi.fn(async () => ({ ok: true as const }));
const cancelled = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUserForAction: async () => {
    if (!signedIn) throw new Error("Not signed in");
    return { userId: signedIn };
  },
}));
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: () => settingsRead() }));
vi.mock("@/lib/billing/orders", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/orders")>()), placeOrder: () => placed(), cancelOrder: () => cancelled() }));

const { orderNextList, cancelNextList } = await import("./order-actions");
const form = (week: string) => {
  const fd = new FormData();
  fd.set("week", week);
  return fd;
};

async function account(cols: string, values: string): Promise<string> {
  const [u] = await current<{ id: string }>(`insert into users (email, ${cols}) values ('m${Math.random().toString(36).slice(2, 8)}@example.com', ${values}) returning id`);
  return u.id;
}

beforeEach(async () => {
  ({ query: current } = await testDb());
  settingsRead.mockClear();
  placed.mockClear();
  cancelled.mockClear();
});

describe("the dormant per-run order actions (review fixes Unit 9, F1)", () => {
  const refused = [
    ["a monthly member", "status, plan, trial_started_at", "'active', 'monthly', now()"],
    ["a monthly trial with a card", "status, plan, trial_started_at", "'trial', 'monthly', now()"],
    ["a monthly trial with no card", "status, plan", "'trial', 'monthly'"],
    ["a leftover per-run trial with no card", "status, plan", "'trial', 'per_run'"],
  ] as const;

  for (const [name, cols, values] of refused) {
    it(`refuse ${name}, with nothing read, written or charged`, async () => {
      signedIn = await account(cols, values);
      const before = await current("select * from users order by id");
      expect(await orderNextList(form("2026-12-14"))).toEqual({ ok: false, message: "Monthly is the only plan." });
      expect(await cancelNextList(form("2026-12-14"))).toEqual({ ok: false, message: "Monthly is the only plan." });
      expect(settingsRead).not.toHaveBeenCalled();
      expect(placed).not.toHaveBeenCalled();
      expect(cancelled).not.toHaveBeenCalled();
      expect(await current("select 1 from orders")).toEqual([]);
      expect(await current("select * from users order by id")).toEqual(before);
    });
  }

  it("refuse an unknown account", async () => {
    signedIn = "00000000-0000-4000-8000-000000000009";
    expect(await orderNextList(form("2026-12-14"))).toEqual({ ok: false, message: "Monthly is the only plan." });
    expect(placed).not.toHaveBeenCalled();
  });

  it("still let a leftover per-run account with a card through the guard", async () => {
    signedIn = await account("status, plan, trial_started_at", "'active', 'per_run', now()");
    expect(await orderNextList(form("not-a-date"))).toEqual({ ok: false, message: "Choose a Monday." });
    expect(await cancelNextList(form("2026-12-14"))).toEqual({ ok: true });
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("refuse someone who is not signed in", async () => {
    signedIn = null;
    await expect(orderNextList(form("2026-12-14"))).rejects.toThrow("Not signed in");
    await expect(cancelNextList(form("2026-12-14"))).rejects.toThrow("Not signed in");
  });
});
