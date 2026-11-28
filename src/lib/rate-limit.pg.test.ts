import { describe, expect, it } from "vitest";
import { testDb } from "@/test-helpers/pglite-db";
import { counterFor, hit, refund } from "./rate-limit";

// The real counter SQL, on a real Postgres.
describe("counterFor", () => {
  it("counts in one statement, returns numbers, and starts a new window at 1", async () => {
    const { query } = await testDb();
    const c = counterFor(query);
    const limit = { limit: 5, windowSeconds: 900 };
    const now = new Date("2026-11-22T10:00:00Z");
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await hit("signin:ip:1.2.3.4", limit, now, c));
    expect(results).toEqual([true, true, true, true, true, false]);
    expect(await c("k", 100, now)).toBe(1);
    expect(typeof (await c("k", 100, now))).toBe("number");
    expect(await hit("signin:ip:1.2.3.4", limit, new Date("2026-11-22T10:15:00Z"), c)).toBe(true);
  });

  it("gives an attempt back with refund, never below zero", async () => {
    const { query } = await testDb();
    const c = counterFor(query);
    const limit = { limit: 1, windowSeconds: 3600 };
    const now = new Date("2026-11-26T15:00:00Z");
    expect(await hit("tax:user:u", limit, now, c)).toBe(true);
    await refund("tax:user:u", limit, now, c);
    expect(await hit("tax:user:u", limit, now, c)).toBe(true);
    expect(await hit("tax:user:u", limit, now, c)).toBe(false);
    await refund("tax:other", limit, now, c);
    expect(await c("tax:other", Math.floor(now.getTime() / 1000 / 3600) * 3600, now)).toBe(1);
  });
});
