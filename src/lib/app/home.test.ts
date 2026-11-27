import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";

// The one-at-a-time switch (`plans.oneAtATimeOffered`, read through billing/offered): off, as at launch, unless a test turns it on.
const offer = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/offered")>()), oneAtATimeOffered: () => offer.on }));

const { loadHome } = await import("./home");

let query: Query;
const settings = mergeV3([]);
// A Saturday: the coming Monday is December 14.
const SATURDAY = new Date("2026-12-12T15:00:00Z");
const WEEK = "2026-12-14";

const member = async (plan: "monthly" | "per_run", status = "active") =>
  (await query<{ id: string }>(`insert into users (email, status, plan, currency, sharing, stripe_customer, free_lists_used) values ($1, $2, $3, 'USD', 'share', 'cus_1', 2) returning id`, [`${plan}@example.com`, status, plan]))[0].id;

beforeEach(async () => {
  ({ query } = await testDb());
  offer.on = false;
});

describe("the order box on /app and /app/billing (the weekly view)", () => {
  it("is not shown to an account on one at a time while that plan is not offered: nothing to order and no price", async () => {
    const id = await member("per_run");
    const home = await loadHome(query, id, settings, SATURDAY);
    expect(home?.order).toBeNull();
    expect(home?.statusLine).toBe(
      "Ordering one Cora Curation at a time isn’t offered at the moment. Monthly brings a Cora Curation every Monday. You can switch to monthly on the billing page; nothing is charged unless you do.",
    );
    // The same for someone past their free ones in the trial.
    await query("update users set status = 'trial'");
    expect((await loadHome(query, id, settings, SATURDAY))?.order).toBeNull();
  });

  it("still shows an order placed before the option was withdrawn, so it can be cancelled", async () => {
    const id = await member("per_run");
    await query("insert into orders (user_id, week_of) values ($1, $2)", [id, WEEK]);
    expect((await loadHome(query, id, settings, SATURDAY))?.order).toEqual({ week: WEEK, ordered: true, price: "US$200" });
    await query("update orders set status = 'cancelled'");
    expect((await loadHome(query, id, settings, SATURDAY))?.order).toBeNull();
  });

  it("is never shown to a monthly member, and their status line names no other plan", async () => {
    const id = await member("monthly", "trial");
    for (const on of [false, true]) {
      offer.on = on;
      const home = await loadHome(query, id, settings, SATURDAY);
      expect(home?.order).toBeNull();
      expect(home?.statusLine).not.toMatch(/one at a time|order/i);
    }
  });

  it("is shown with its price while one at a time is offered (the switch on)", async () => {
    offer.on = true;
    const id = await member("per_run");
    expect((await loadHome(query, id, settings, SATURDAY))?.order).toEqual({ week: WEEK, ordered: false, price: "US$200" });
  });
});
