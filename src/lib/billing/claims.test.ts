import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { chargeInFlight, claimCharge, closeTrialAt, idempotencyKey, isHardDecline, nextAttempt, nextRetryAt, settle, staleClaims, takeOver } from "./claims";

let query: Query;
let userId: string;
const WEEK = "2026-12-14";
const first = { purpose: "first_charge" as const, weekOf: WEEK };

beforeEach(async () => {
  ({ query } = await testDb());
  [{ id: userId }] = await query<{ id: string }>("insert into users (email, status, plan) values ('ana@example.com', 'trial', 'monthly') returning id");
});

describe("claimCharge", () => {
  it("claims an attempt once: the second claim of the same attempt gets nothing", async () => {
    const a = await claimCharge(query, { userId, ...first, attempt: 1 });
    const b = await claimCharge(query, { userId, ...first, attempt: 1 });
    expect(a).toMatchObject({ userId, purpose: "first_charge", weekOf: WEEK, attempt: 1 });
    expect(b).toBeNull();
    expect(await query("select 1 from charge_attempts")).toHaveLength(1);
  });

  it("refuses inside the claim when a cancellation landed first, or the user is no longer on monthly, or already subscribed", async () => {
    await query("update users set cancel_requested_at = now()");
    expect(await claimCharge(query, { userId, ...first, attempt: 1 })).toBeNull();
    await query("update users set cancel_requested_at = null, plan = 'per_run'");
    expect(await claimCharge(query, { userId, ...first, attempt: 1 })).toBeNull();
    await query("update users set plan = 'monthly', stripe_subscription = 'sub_1'");
    expect(await claimCharge(query, { userId, ...first, attempt: 1 })).toBeNull();
    expect(await query("select 1 from charge_attempts")).toHaveLength(0);
  });

  it("lets a held user's first charge be retried, but not someone held for another reason", async () => {
    await query("update users set status = 'held', hold_reason = 'first_charge_failed'");
    expect(await claimCharge(query, { userId, ...first, attempt: 2 })).not.toBeNull();
    await query("update users set hold_reason = 'renewal_unpaid'");
    expect(await claimCharge(query, { userId, ...first, attempt: 3 })).toBeNull();
  });

  it("claims an order only when an order for that week is open", async () => {
    await query("update users set plan = 'per_run', status = 'active'");
    expect(await claimCharge(query, { userId, purpose: "order", weekOf: WEEK, attempt: 1 })).toBeNull();
    await query("insert into orders (user_id, week_of) values ($1, $2)", [userId, WEEK]);
    expect(await claimCharge(query, { userId, purpose: "order", weekOf: WEEK, attempt: 1 })).not.toBeNull();
  });
});

describe("nextAttempt and settle", () => {
  it("moves to the next attempt only after a recorded decline or error, never after an unknown outcome", async () => {
    expect(await nextAttempt(query, { userId, ...first })).toBe(1);
    const c = (await claimCharge(query, { userId, ...first, attempt: 1 }))!;
    expect(await nextAttempt(query, { userId, ...first })).toBeNull();
    await settle(query, c.id, "unknown", { error: "timeout" });
    expect(await nextAttempt(query, { userId, ...first })).toBeNull();
    await settle(query, c.id, "declined", { declineCode: "insufficient_funds" });
    expect(await nextAttempt(query, { userId, ...first })).toBe(2);
  });

  it("settles an open claim once; a settled claim cannot be changed", async () => {
    const c = (await claimCharge(query, { userId, ...first, attempt: 1 }))!;
    expect(await settle(query, c.id, "succeeded", { stripeObject: "sub_1", amountCents: 20000, currency: "USD" })).toBe(true);
    expect(await settle(query, c.id, "declined")).toBe(false);
    expect(await query("select outcome, stripe_object, amount_cents from charge_attempts")).toEqual([{ outcome: "succeeded", stripe_object: "sub_1", amount_cents: 20000 }]);
    expect(await nextAttempt(query, { userId, ...first })).toBeNull();
  });

  it("says a charge is in flight while a claim is open", async () => {
    expect(await chargeInFlight(query, userId)).toBe(false);
    const c = (await claimCharge(query, { userId, ...first, attempt: 1 }))!;
    expect(await chargeInFlight(query, userId)).toBe(true);
    await settle(query, c.id, "succeeded");
    expect(await chargeInFlight(query, userId)).toBe(false);
  });
});

describe("takeover", () => {
  it("offers a claim for takeover only after 15 minutes, to one worker", async () => {
    const c = (await claimCharge(query, { userId, ...first, attempt: 1 }))!;
    expect(await staleClaims(query)).toEqual([]);
    expect(await takeOver(query, c.id)).toBe(false);
    await query("update charge_attempts set claimed_at = now() - interval '16 minutes'");
    expect((await staleClaims(query)).map((x) => x.id)).toEqual([c.id]);
    expect(await takeOver(query, c.id)).toBe(true);
    expect(await takeOver(query, c.id)).toBe(false);
  });
});

describe("keys and the retry schedule", () => {
  it("gives the same key to a repeated call and a new key to a new attempt", () => {
    expect(idempotencyKey({ id: "c1", purpose: "first_charge", attempt: 1 })).toBe("first_charge:c1:1");
    expect(idempotencyKey({ id: "c2", purpose: "first_charge", attempt: 2 })).not.toBe("first_charge:c1:1");
  });

  it("retries on days 1, 3 and 7 at the charge time, then stops (spec check 22)", () => {
    // Monday 2026-12-14, 6:00 AM Toronto (EST) = 11:00 UTC.
    expect(nextRetryAt(WEEK, 1, "06:00")?.toISOString()).toBe("2026-12-15T11:00:00.000Z");
    expect(nextRetryAt(WEEK, 2, "06:00")?.toISOString()).toBe("2026-12-17T11:00:00.000Z");
    expect(nextRetryAt(WEEK, 3, "06:00")?.toISOString()).toBe("2026-12-21T11:00:00.000Z");
    expect(nextRetryAt(WEEK, 4, "06:00")).toBeNull();
    expect(closeTrialAt(WEEK, "06:00").toISOString()).toBe("2026-12-21T11:00:00.000Z");
  });

  it("tells hard declines from soft ones", () => {
    expect(isHardDecline("stolen_card")).toBe(true);
    expect(isHardDecline("insufficient_funds")).toBe(false);
    expect(isHardDecline(null)).toBe(false);
  });
});
