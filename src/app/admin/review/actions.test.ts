import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { ReviewJobDeps, ReviewJobResult } from "@/lib/review/job";
import { testDb } from "@/test-helpers/pglite-db";

vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => {} }));
let current: Query;
let admin: string | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/admin-auth", () => ({
  PASSWORD_ADMIN: "admin (password)",
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

// Approval itself is tested in src/lib/review/approve.test.ts against a fake GitHub; here only the action around it.
const approvals: { id: string; admin: { by: string; email: boolean }; live: boolean }[] = [];
vi.mock("@/lib/review/approve", async (orig) => ({
  ...(await orig<typeof import("@/lib/review/approve")>()),
  approveProposal: async (_q: unknown, id: string, admin: { by: string; email: boolean }, d: { gh: { live: boolean } }) => {
    approvals.push({ id, admin, live: d.gh.live });
    return { status: "dry_run", message: "Dry run: recorded." };
  },
}));

const { approveProposalAction, refreshFromGitHubAction, rejectProposalAction, runReviewNowAction } = await import("./actions");
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const idle = { status: "idle" as const };
const logged = () => current<{ admin_email: string; action: string; detail: Record<string, unknown> }>(`select admin_email, action, detail from admin_actions order by id`);

beforeEach(async () => {
  ({ query: current } = await testDb());
  admin = null;
  allowed = true;
  calls = [];
  answer = { week: "2026-11-23", status: "done", stored: 2, evidence: 9 };
  approvals.length = 0;
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

  it("says how many of Run now's 5 model attempts this week are used (whole-branch review)", async () => {
    admin = "peter@example.com";
    answer = { week: "2026-11-23", status: "failed", note: "ModelCutOff: the review model call failed", modelAttempts: 4, manualAttempts: 2 };
    expect(await runReviewNowAction()).toMatchObject({
      status: "error",
      message: "Week of 2026-11-23: the run failed (ModelCutOff: the review model call failed). Run now has used 2 of its 5 model attempts this week.",
    });
    answer = { week: "2026-11-23", status: "done", stored: 1, evidence: 3, modelAttempts: 1, manualAttempts: 1 };
    expect((await runReviewNowAction()).message).toBe("Week of 2026-11-23: 1 proposal stored from 3 evidence items. Run now has used 1 of its 5 model attempts this week.");
  });
});

describe("approve, reject and refresh", () => {
  const ID = "abcdefghij";
  // Never the network: a preview environment with no tokens, and fetch refused outright.
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("GITHUB_REVIEW_TOKEN", "");
    vi.stubEnv("GITHUB_READ_TOKEN", "");
    vi.stubGlobal("fetch", async () => {
      throw new Error("no network in tests");
    });
    return () => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    };
  });
  const insert = (status = "pending") =>
    current(
      `insert into review_proposals (public_id, review_week, paths, status, rationale) values ($1, '2026-11-23', array['content/zack/claude.md'], $2, 'private rationale')`,
      [ID, status],
    );

  it("refuses anyone but an admin, for each action, before doing anything", async () => {
    await insert();
    await expect(approveProposalAction(idle, form({ proposal: ID }))).rejects.toThrow("Not signed in");
    await expect(rejectProposalAction(idle, form({ proposal: ID }))).rejects.toThrow("Not signed in");
    await expect(refreshFromGitHubAction()).rejects.toThrow("Not signed in");
    expect(approvals).toEqual([]);
    expect(await logged()).toEqual([]);
    expect((await current<{ status: string }>(`select status from review_proposals`))[0].status).toBe("pending");
  });

  it("approves as the email admin, in dry run off production, and logs only the proposal id and outcome", async () => {
    admin = "peter@example.com";
    expect(await approveProposalAction(idle, form({ proposal: ID }))).toMatchObject({ status: "ok", message: "Dry run: recorded." });
    expect(approvals).toEqual([{ id: ID, admin: { by: "peter@example.com", email: true }, live: false }]);
    const [row] = await logged();
    expect(row).toMatchObject({ admin_email: "peter@example.com", action: "approve_proposal", detail: { proposal: ID, outcome: "done" } });
  });

  it("the shared-password admin approves as not email-signed-in", async () => {
    admin = "admin (password)";
    await approveProposalAction(idle, form({ proposal: ID }));
    expect(approvals[0].admin).toEqual({ by: "admin (password)", email: false });
  });

  it("refuses a malformed proposal id, and is rate-limited", async () => {
    admin = "peter@example.com";
    expect(await approveProposalAction(idle, form({ proposal: "../../x" }))).toMatchObject({ status: "error" });
    allowed = false;
    expect(await approveProposalAction(idle, form({ proposal: ID }))).toMatchObject({ status: "error" });
    expect(approvals).toEqual([]);
  });

  it("reject is rate-limited, changing and logging nothing (whole-branch review)", async () => {
    await insert();
    admin = "ck@example.com";
    allowed = false;
    expect(await rejectProposalAction(idle, form({ proposal: ID, note: "x" }))).toMatchObject({ status: "error", message: "Too many actions in a minute. Wait a moment." });
    expect((await current<{ status: string }>(`select status from review_proposals`))[0].status).toBe("pending");
    expect(await logged()).toEqual([]);
  });

  it("rejects with who and when, logging the note's length, not its text", async () => {
    await insert();
    admin = "ck@example.com";
    expect(await rejectProposalAction(idle, form({ proposal: ID, note: "Too vague for members" }))).toMatchObject({ status: "ok" });
    const [p] = await current<Record<string, unknown>>(`select status, rejected_by, reject_note from review_proposals`);
    expect(p).toEqual({ status: "rejected", rejected_by: "ck@example.com", reject_note: "Too vague for members" });
    const [row] = await logged();
    expect(row).toMatchObject({ action: "reject_proposal", detail: { proposal: ID, note_chars: 21 } });
    expect(JSON.stringify(row)).not.toContain("vague");
  });

  it("refresh in dry run says there is nothing to sync, and reaches no GitHub", async () => {
    admin = "peter@example.com";
    const r = await refreshFromGitHubAction();
    expect(r).toMatchObject({ status: "ok" });
    expect(r.message).toContain("Dry run");
    expect((await logged())[0]).toMatchObject({ action: "refresh_github" });
  });
});
