/**
 * The database client never lets Next's fetch cache answer a query
 * (docs/solutions/runtime-errors/next-build-answers-queries-from-the-previous-builds-fetch-cache-2026-11-27.md).
 *
 * What goes wrong without the option happens only in `next build`, where no unit test runs: a build prerenders
 * the public pages from the answers an earlier build got. So this holds the one thing a test can see, that the
 * driver is told not to cache.
 */
import { expect, it, vi } from "vitest";

const made = vi.hoisted(() => ({ args: [] as unknown[][] }));
vi.mock("@neondatabase/serverless", () => ({
  neon: (...args: unknown[]) => {
    made.args.push(args);
    return () => [];
  },
}));

it("builds the one client with its fetch set to no-store", async () => {
  await import("./db");
  expect(made.args).toHaveLength(1);
  expect(made.args[0][1]).toEqual({ fetchOptions: { cache: "no-store" } });
});
