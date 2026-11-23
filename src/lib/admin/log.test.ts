import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { audited } from "./log";

let query: Query;
const details = async () => (await query<{ detail: Record<string, unknown> }>("select detail from admin_actions order by id")).map((r) => r.detail);

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("audited admin actions", () => {
  it("writes the row before the work, then records the outcome", async () => {
    const r = await audited(query, { by: "admin@example.com", action: "run_dry", detail: { week: "2026-12-14" } }, async () => {
      // The row is already there while the work runs.
      expect(await details()).toEqual([{ week: "2026-12-14", outcome: "started" }]);
      return { status: "ready" };
    });
    expect(r).toEqual({ status: "ready" });
    expect(await details()).toEqual([{ week: "2026-12-14", outcome: "done", result: '{"status":"ready"}' }]);
  });

  it("records the error and still throws it", async () => {
    await expect(audited(query, { by: "admin@example.com", action: "seed_import" }, async () => Promise.reject(new Error("model down")))).rejects.toThrow("model down");
    expect(await details()).toEqual([{ outcome: "error", error: "model down" }]);
  });
});
