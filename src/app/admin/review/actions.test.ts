import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { ReviewJobDeps, ReviewJobResult } from "@/lib/review/job";
import { testDb } from "@/test-helpers/pglite-db";

vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => {} }));
let current: Query;
let admin: string | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!admin) throw new Error("Not signed in");
    return admin;
  },
}));
let allowed = true;
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => allowed }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const actual = await orig<typeof import("@/lib/v3-settings")>();
  return { ...actual, readV3Settings: async () => actual.mergeV3([{ key: "v3.reviewBotOn", value: true }]) };
});
let calls: ReviewJobDeps[] = [];
let answer: ReviewJobResult | Error = { week: "2026-11-23", status: "done", stored: 2, evidence: 9 };
vi.mock("@/lib/review/job", async (orig) => ({
  ...(await orig<typeof import("@/lib/review/job")>()),
  runReviewJob: async (_q: unknown, d: ReviewJobDeps) => {
    calls.push(d);
    if (answer instanceof Error) throw answer;
    return answer;
  },
}));

const { runReviewNowAction } = await import("./actions");
const logged = () => current<{ admin_email: string; action: string; detail: Record<string, unknown> }>(`select admin_email, action, detail from admin_actions order by id`);

beforeEach(async () => {
  ({ query: current } = await testDb());
  admin = null;
  allowed = true;
  calls = [];
  answer = { week: "2026-11-23", status: "done", stored: 2, evidence: 9 };
});

describe("Run now (runReviewNowAction)", () => {
  it("refuses anyone but an admin, before running anything", async () => {
    await expect(runReviewNowAction()).rejects.toThrow("Not signed in");
    expect(calls).toEqual([]);
    expect(await logged()).toEqual([]);
  });

  it("runs the job for now as a manual run, with the gateway model, and logs who pressed it and the outcome", async () => {
    admin = "peter@example.com";
    const r = await runReviewNowAction();
    expect(r).toMatchObject({ status: "ok", message: "Week of 2026-11-23: 2 proposals stored from 9 evidence items." });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ trigger: "manual" });
    expect(calls[0].settings.reviewBotOn).toBe(true);
    expect(calls[0].model.name).toMatch(/^anthropic\//);
    expect(calls[0].dryRun).toBeUndefined();
    const [row] = await logged();
    expect(row).toMatchObject({ admin_email: "peter@example.com", action: "run_review", detail: { outcome: "done" } });
    expect(row.detail.week).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("passes the job's note through when it did nothing (switch off, done, busy)", async () => {
    admin = "peter@example.com";
    answer = { week: "2026-11-23", status: "skipped", note: "The review bot is switched off (v3.reviewBotOn)." };
    expect(await runReviewNowAction()).toMatchObject({ status: "ok", message: "Week of 2026-11-23: The review bot is switched off (v3.reviewBotOn)." });
  });

  it("shows a failed run as an error, and a thrown one with a fixed message, logged as an error", async () => {
    admin = "peter@example.com";
    answer = { week: "2026-11-23", status: "failed", note: "ModelCutOff: the review model call failed", modelAttempts: 2 };
    expect(await runReviewNowAction()).toMatchObject({ status: "error" });
    answer = new Error("database blip");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runReviewNowAction()).toMatchObject({ status: "error", message: "The review run failed. Its error is in the run list below." });
    } finally {
      err.mockRestore();
    }
    expect((await logged())[1].detail).toMatchObject({ outcome: "error", error: "database blip" });
  });

  it("is rate-limited", async () => {
    admin = "peter@example.com";
    allowed = false;
    expect(await runReviewNowAction()).toMatchObject({ status: "error" });
    expect(calls).toEqual([]);
  });
});
