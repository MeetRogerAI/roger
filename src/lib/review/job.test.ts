import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { takeLease } from "@/lib/leases";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeReviewModel } from "@/test-helpers/fake-review-model";
import { testDb } from "@/test-helpers/pglite-db";
import { member, note, run, WEEK } from "@/test-helpers/review-fixtures";
import { reviewWeek } from "./evidence";
import { MAX_MANUAL_ATTEMPTS, MAX_MODEL_ATTEMPTS, REVIEW_LEASE, runReviewJob, type ReviewJobDeps } from "./job";
import type { ModelProposal } from "./model";
import { readInstructionFiles, runReview } from "./propose";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

const ADMIN = "admin@roger.test";
const CLAUDE = "content/zack/claude.md";
const claudeLines = (readInstructionFiles()[CLAUDE] as string).split("\n");
const at = claudeLines.findIndex((l) => l.startsWith("## What Zack does")) + 1;
const clean = (): ModelProposal => ({
  paths: [CLAUDE],
  hunks: [{ path: CLAUDE, start_line: at, end_line: at + 1, new_text: `${claudeLines[at - 1]}\n${claudeLines[at]}\nPrefer plays the member used this week.` }],
  rationale: "Members get plays they no longer use.",
  evidence: [{ id: "e1", why: "a play the member stopped using" }],
});

/** Friday 2026-11-27, the review week of 2026-11-23, at hh:mm UTC. */
const tick = (hm: string, day = "2026-11-27") => new Date(`${day}T${hm}:00Z`);
const on = mergeV3([{ key: "v3.reviewBotOn", value: true }]);
const off = mergeV3([]);

let q: Query;
let sent: Parameters<Transport>[0][];
/** Subjects the transport refuses (a failed send), until cleared. */
let refuse: string[] = [];
const transport: Transport = async (m) => {
  if (refuse.includes(m.subject)) return { ok: false, error: "provider down", retryable: false };
  sent.push(m);
  return { ok: true };
};
const alerts = (subject: string) => sent.filter((m) => m.subject === `[Roger] ${subject}`);
const ready = () => alerts("Review bot proposals are ready");
const failedAlerts = () => alerts("The weekly review bot did not finish");
const job = (now: Date, model: ReviewJobDeps["model"], o: Partial<ReviewJobDeps> = {}) =>
  runReviewJob(q, { settings: on, now, model, query: q, transport, sleep: async () => {}, admins: [ADMIN], ...o });
const reviewRun = async () => (await q<{ status: string; attempts: number; model_attempts: number }>(`select status, attempts, model_attempts from review_runs where week_of = $1::date`, [WEEK]))[0];
const proposalCount = async () => Number((await q<{ n: number }>(`select count(*)::int as n from review_proposals`))[0].n);

async function seedWeek() {
  const a = await member(q, "priya@example.com", { name: "Priya Raman", displayName: "PriyaR" });
  await run(q, a);
  await note(q, a, "Zack keeps picking a play I barely use anymore");
}

beforeAll(() => {
  // runReview never runs ahead of the real clock; the test Friday is in the past.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(async () => {
  ({ query: q } = await testDb());
  sent = [];
  refuse = [];
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
});

describe("runReviewJob on the schedule", () => {
  it("runs once on a Friday tick, stores proposals and alerts once; a second tick does nothing", async () => {
    await seedWeek();
    const model = fakeReviewModel([clean()]);
    expect(await job(tick("14:15"), model)).toMatchObject({ week: WEEK, status: "done", stored: 1, modelAttempts: 1, alerted: ["review_ready"] });
    expect(ready()).toHaveLength(1);
    expect(ready()[0].text).toContain("stored 1 proposal");
    expect(ready()[0].text).not.toContain("Priya");

    const again = await job(tick("14:45"), model);
    expect(again).toMatchObject({ status: "not_claimed", note: "This week's review is done." });
    expect(model.calls).toHaveLength(1);
    expect(await proposalCount()).toBe(1);
    expect(ready()).toHaveLength(1);
  });

  it("does nothing with v3.reviewBotOn off, and says so", async () => {
    await seedWeek();
    const model = fakeReviewModel([clean()]);
    expect(await job(tick("14:15"), model, { settings: off })).toEqual({ week: WEEK, status: "skipped", note: "The review bot is switched off (v3.reviewBotOn)." });
    expect(model.calls).toHaveLength(0);
    expect(await reviewRun()).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it("does nothing outside the Friday window, and only closes it from Friday 17:00", async () => {
    await seedWeek();
    const model = fakeReviewModel([clean()]);
    expect(await job(tick("13:45"), model)).toMatchObject({ status: "skipped" });
    expect(await job(tick("15:15", "2026-11-26"), model)).toMatchObject({ status: "skipped" });
    expect(await job(tick("15:15", "2026-11-28"), model)).toMatchObject({ status: "skipped" });
    expect(sent).toEqual([]);
    // A tick after 17:00 claims nothing and calls no model; it closes the window (no run started).
    expect(await job(tick("17:05"), model)).toMatchObject({ status: "closed", alerted: ["review_failed"] });
    expect(failedAlerts()[0].text).toContain("no run started");
    expect(model.calls).toHaveLength(0);
    expect(await reviewRun()).toBeUndefined();
    expect(await q(`select * from leases`)).toEqual([]);
  });

  it("the 17:15 close tick alerts review_failed once for a tick cut off mid-call (running, attempt counted, lease held)", async () => {
    await seedWeek();
    // The 16:45 tick reaches the model and never returns (the platform kills it): the row stays running, the lease stays held.
    const hung = fakeReviewModel(() => new Promise<ModelProposal[]>(() => {}));
    void job(tick("16:45"), hung);
    for (let i = 0; i < 50 && hung.calls.length === 0; i++) await new Promise((r) => setImmediate(r));
    expect(hung.calls).toHaveLength(1);
    expect(await reviewRun()).toMatchObject({ status: "running", model_attempts: 1 });
    expect(await takeLease(q, REVIEW_LEASE, "someone", 60)).toBe(false);
    expect(failedAlerts()).toEqual([]);

    const model = fakeReviewModel([clean()]);
    expect(await job(tick("17:15"), model)).toMatchObject({ status: "closed", modelAttempts: 1, alerted: ["review_failed"] });
    expect(failedAlerts()).toHaveLength(1);
    expect(failedAlerts()[0].text).toContain("cut off after 1 model attempt");
    expect(await job(tick("17:15"), model)).toMatchObject({ status: "closed" });
    expect(failedAlerts()).toHaveLength(1);
    expect(model.calls).toHaveLength(0);
    expect(await reviewRun()).toMatchObject({ status: "running", model_attempts: 1 });
  });

  it("a delayed last tick after 17:00 still closes a failed week", async () => {
    await seedWeek();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = fakeReviewModel(new Error("timed out"));
    await job(tick("16:15"), failing);
    expect(await job(tick("17:02"), failing)).toMatchObject({ status: "closed", modelAttempts: 1, alerted: ["review_failed"] });
    expect(failedAlerts()[0].text).toContain("the run failed after 1 model attempt");
    expect(await job(tick("23:59"), failing)).not.toHaveProperty("alerted");
    expect(failing.calls).toHaveLength(1);
    expect(failedAlerts()).toHaveLength(1);
    err.mockRestore();
  });

  it("the close tick retries a review_ready send that failed, once", async () => {
    await seedWeek();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    refuse = ["[Roger] Review bot proposals are ready"];
    const r = await job(tick("14:15"), fakeReviewModel([clean()]));
    expect(r).toMatchObject({ status: "done", stored: 1 });
    expect(r).not.toHaveProperty("alerted");
    expect(ready()).toEqual([]);
    refuse = [];
    expect(await job(tick("17:15"), fakeReviewModel([clean()]))).toMatchObject({ status: "closed", alerted: ["review_ready"] });
    expect(ready()).toHaveLength(1);
    expect(ready()[0].text).toContain("stored 1 proposal");
    expect(await job(tick("17:15"), fakeReviewModel([clean()]))).not.toHaveProperty("alerted");
    expect(ready()).toHaveLength(1);
    expect(failedAlerts()).toEqual([]);
    err.mockRestore();
  });

  it("keeps model and provider text out of the review_failed email (not even the error label)", async () => {
    await seedWeek();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const leak = Object.assign(new Error("provider said: Priya Raman wrote: Zack keeps picking a play. sk-ant-secret"), { name: "ProviderLeakError" });
    const failing = fakeReviewModel(leak);
    for (const hm of ["14:15", "14:45", "15:15"]) await job(tick(hm), failing);
    await job(tick("17:15"), failing);
    expect(failedAlerts()).toHaveLength(1);
    const mail = failedAlerts()[0];
    for (const text of [mail.text, mail.html, mail.subject]) {
      for (const bad of ["Priya", "Zack keeps", "sk-ant", "provider said", "ProviderLeakError"]) expect(text).not.toContain(bad);
    }
    expect(mail.text).toContain("failed 3 times");
    err.mockRestore();
  });

  it("retries a failed model call on the next tick, counting the failed attempt", async () => {
    await seedWeek();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await job(tick("14:15"), fakeReviewModel(new Error("timed out")))).toMatchObject({ status: "failed", modelAttempts: 1 });
    expect(await reviewRun()).toMatchObject({ status: "failed", model_attempts: 1 });
    expect(await job(tick("14:45"), fakeReviewModel([clean()]))).toMatchObject({ status: "done", stored: 1, modelAttempts: 2 });
    expect(await reviewRun()).toMatchObject({ status: "done", model_attempts: 2 });
    expect(failedAlerts()).toEqual([]);
    err.mockRestore();
  });

  it(`stops after ${MAX_MODEL_ATTEMPTS} model attempts, alerts once, and Run now still runs`, async () => {
    await seedWeek();
    const failing = fakeReviewModel(new Error("timed out"));
    expect(await job(tick("14:15"), failing)).toMatchObject({ status: "failed" });
    expect(await job(tick("14:45"), failing)).toMatchObject({ status: "failed" });
    expect(failedAlerts()).toHaveLength(0);
    expect(await job(tick("15:15"), failing)).toMatchObject({ status: "failed", modelAttempts: 3, alerted: ["review_failed"] });
    expect(failedAlerts()).toHaveLength(1);
    expect(failedAlerts()[0].text).toContain("failed 3 times");

    const later = await job(tick("15:45"), failing);
    expect(later).toMatchObject({ status: "not_claimed" });
    expect(later.note).toContain("Run now");
    expect(await job(tick("16:45"), failing)).toMatchObject({ status: "not_claimed" });
    expect(failing.calls).toHaveLength(3);
    expect(failedAlerts()).toHaveLength(1);

    const model = fakeReviewModel([clean()]);
    expect(await job(tick("17:30"), model, { trigger: "manual" })).toMatchObject({ status: "done", stored: 1, modelAttempts: 4 });
  });

  it("alerts review_failed once when the last tick finds the week still failed", async () => {
    await seedWeek();
    const failing = fakeReviewModel(new Error("timed out"));
    await job(tick("16:15"), failing);
    expect(failedAlerts()).toHaveLength(0);
    expect(await job(tick("16:45"), failing)).toMatchObject({ status: "failed", modelAttempts: 2, alerted: ["review_failed"] });
    // A late duplicate of the last tick does not alert again.
    await job(tick("16:46"), failing);
    expect(failedAlerts()).toHaveLength(1);
  });

  it("alerts at the last tick when no run ever started (every earlier tick failed before its claim)", async () => {
    await q(`insert into leases (name, holder, until) values ($1, 'someone-else', now() + interval '1 hour')`, [REVIEW_LEASE]);
    expect(await job(tick("16:45"), fakeReviewModel([clean()]))).toMatchObject({ status: "busy", alerted: ["review_failed"] });
    expect(failedAlerts()[0].text).toContain("no run started");
  });

  it("claims a skipped week (no evidence) again on the next tick, and those re-checks are not model attempts", async () => {
    const model = fakeReviewModel([clean()]);
    expect(await job(tick("14:15"), model)).toMatchObject({ status: "no_evidence", modelAttempts: 0 });
    for (const hm of ["14:45", "15:15", "15:45"]) expect(await job(tick(hm), model)).toMatchObject({ status: "no_evidence" });
    expect(await reviewRun()).toMatchObject({ status: "skipped", model_attempts: 0, attempts: 4 });
    expect(model.calls).toHaveLength(0);

    await seedWeek();
    expect(await job(tick("16:15"), model)).toMatchObject({ status: "done", stored: 1, modelAttempts: 1 });
  });

  it("does not alert at the last tick for a week with no evidence", async () => {
    expect(await job(tick("16:45"), fakeReviewModel([clean()]))).toMatchObject({ status: "no_evidence" });
    expect(sent).toEqual([]);
  });

  it("gives one run for two concurrent ticks (the lease and the claim)", async () => {
    await seedWeek();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const model = fakeReviewModel(async () => {
      await gate;
      return [clean()];
    });
    const first = job(tick("14:15"), model);
    // Let the first tick take the lease and reach the model.
    for (let i = 0; i < 50 && model.calls.length === 0; i++) await new Promise((r) => setImmediate(r));
    expect(model.calls).toHaveLength(1);
    const second = await job(tick("14:15"), model);
    expect(second).toMatchObject({ status: "busy" });
    release();
    expect(await first).toMatchObject({ status: "done", stored: 1 });
    expect(model.calls).toHaveLength(1);
    expect(await proposalCount()).toBe(1);
    // The lease is released after the run.
    expect(await takeLease(q, REVIEW_LEASE, "next", 60)).toBe(true);
  });

  it("re-throws an unexpected error after recording it, and releases the lease", async () => {
    await seedWeek();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: Query = (async (text: string, params?: unknown[]) => {
      if (/insert into review_proposals/.test(text)) throw new Error("database blip");
      return q(text, params);
    }) as Query;
    await expect(runReviewJob(broken, { settings: on, now: tick("14:15"), model: fakeReviewModel([clean()]), query: q, transport, admins: [ADMIN] })).rejects.toThrow("database blip");
    expect(await reviewRun()).toMatchObject({ status: "failed", model_attempts: 1 });
    expect(await takeLease(q, REVIEW_LEASE, "next", 60)).toBe(true);
    err.mockRestore();
  });
});

describe("runReviewJob: the job clock and the attempt limit", () => {
  it("uses min(asOf, the real clock), so a future ?asOf gets the same week as runReview's row", async () => {
    await seedWeek();
    // The real clock is Tuesday 2026-12-01; a future Friday as-of time is clamped to it.
    const future = new Date("2026-12-25T15:15:00Z");
    const scheduled = await job(future, fakeReviewModel([clean()]));
    expect(scheduled).toMatchObject({ status: "skipped", week: reviewWeek(new Date()) });
    const manual = await job(future, fakeReviewModel([clean()]), { trigger: "manual" });
    expect(manual.week).toBe(reviewWeek(new Date()));
    expect(manual.week).not.toBe(reviewWeek(future));
    const rows = await q<{ week_of: string }>(`select to_char(week_of, 'YYYY-MM-DD') as week_of from review_runs`);
    expect(rows).toEqual([{ week_of: manual.week }]);
  });

  it("gives the model call to only one of two claimers at model_attempts 2 of 3", async () => {
    // One PGlite connection: the two claims are serialized, not truly concurrent; the claim is still one statement.
    await seedWeek();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await q(`insert into review_runs (week_of, status, attempts, model_attempts, model, started_at) values ($1::date, 'failed', 2, 2, 'fake', $2::timestamptz)`, [WEEK, tick("14:45").toISOString()]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const model = fakeReviewModel(async () => {
      await gate;
      throw new Error("timed out");
    });
    const claim = (holder: string) => runReview(q, { now: tick("15:15"), model, holder, admins: [ADMIN], maxModelAttempts: MAX_MODEL_ATTEMPTS });
    const both = Promise.all([claim("a"), claim("b")]);
    for (let i = 0; i < 50 && model.calls.length === 0; i++) await new Promise((r) => setImmediate(r));
    release();
    const results = (await both).map((r) => r.status).sort();
    expect(results).toEqual(["failed", "not_claimed"]);
    expect(model.calls).toHaveLength(1);
    expect(await reviewRun()).toMatchObject({ status: "failed", model_attempts: 3 });
    // The attempts are used up: a further scheduled claim is refused.
    expect(await claim("c")).toMatchObject({ status: "not_claimed" });
    expect(model.calls).toHaveLength(1);
    err.mockRestore();
  });
});

describe("runReviewJob: Run now", () => {
  it("runs outside the Friday window", async () => {
    await seedWeek();
    expect(await job(tick("10:00", "2026-11-30"), fakeReviewModel([clean()]), { trigger: "manual" })).toMatchObject({ status: "done", week: "2026-11-30" });
  });

  it(`is capped at ${MAX_MANUAL_ATTEMPTS} model attempts a review week, counted apart from the schedule's ${MAX_MODEL_ATTEMPTS} (whole-branch review)`, async () => {
    await seedWeek();
    const failing = fakeReviewModel(new Error("timed out"));
    for (let i = 1; i <= MAX_MANUAL_ATTEMPTS; i++) {
      expect(await job(tick("18:00"), failing, { trigger: "manual" })).toMatchObject({ status: "failed", manualAttempts: i });
    }
    const sixth = await job(tick("18:00"), failing, { trigger: "manual" });
    expect(sixth).toMatchObject({ status: "not_claimed", manualAttempts: MAX_MANUAL_ATTEMPTS });
    expect(sixth.note).toBe(`Run now has used its ${MAX_MANUAL_ATTEMPTS} model attempts for this review week. The next review week opens on Monday.`);
    expect(failing.calls).toHaveLength(MAX_MANUAL_ATTEMPTS);
    expect(await q(`select model_attempts, manual_attempts from review_runs where week_of = $1::date`, [WEEK])).toEqual([{ model_attempts: 5, manual_attempts: 5 }]);
  });

  it("does nothing with the switch off", async () => {
    await seedWeek();
    const model = fakeReviewModel([clean()]);
    expect(await job(tick("18:00"), model, { trigger: "manual", settings: off })).toMatchObject({ status: "skipped" });
    expect(model.calls).toHaveLength(0);
  });

  it("does not run a done week again, and waits for a held lease", async () => {
    await seedWeek();
    await job(tick("14:15"), fakeReviewModel([clean()]));
    const model = fakeReviewModel([clean()]);
    expect(await job(tick("18:00"), model, { trigger: "manual" })).toMatchObject({ status: "not_claimed", note: "This week's review is done." });
    await q(`insert into leases (name, holder, until) values ($1, 'someone-else', now() + interval '1 hour') on conflict (name) do update set holder = excluded.holder, until = excluded.until`, [REVIEW_LEASE]);
    expect(await job(tick("18:00"), model, { trigger: "manual" })).toMatchObject({ status: "busy" });
    expect(model.calls).toHaveLength(0);
  });
});

describe("runReviewJob: the checkpoint and the dry run", () => {
  it("takes the December 14 checkpoint snapshot at the start, even with the switch off", async () => {
    vi.setSystemTime(new Date("2026-12-19T00:00:00Z"));
    try {
      expect(await job(tick("14:15", "2026-12-18"), fakeReviewModel([]), { settings: off })).toMatchObject({ status: "skipped" });
      expect(await q(`select key from measure_snapshots`)).toEqual([{ key: "checkpoint-2026-12-14" }]);
    } finally {
      vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    }
  });

  it("a dry run reports what a tick would do and writes nothing", async () => {
    await seedWeek();
    const model = fakeReviewModel([clean()]);
    const r = await job(tick("14:15"), model, { dryRun: true });
    expect(r).toMatchObject({ status: "dry_run", week: WEEK, modelAttempts: 0 });
    expect(r.evidence).toBeGreaterThan(0);
    expect(r.note).toContain("would call the model");
    expect((await job(tick("14:15"), model, { dryRun: true, settings: off })).note).toContain("the switch is off");
    expect((await job(tick("17:15"), model, { dryRun: true })).note).toContain("the Friday window has closed");
    expect(model.calls).toHaveLength(0);
    expect(await reviewRun()).toBeUndefined();
    expect(await q(`select * from leases`)).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe("PR status sync in the job (Unit 9)", () => {
  const TOKEN = "ghp_test_write_token_0123456789abcdefgh";
  /** A proposal with an open PR that a person has merged on GitHub; returns the fake and a live gateway. */
  async function mergedOnGitHub() {
    const { fakeGitHub } = await import("@/test-helpers/fake-github");
    const gh = fakeGitHub({ "README.md": "# Roger\n" });
    const w = gh.gateway({ token: TOKEN, canWrite: true });
    await w.createRef("review-bot/abcdefghij", gh.refs.get("main") as string);
    await w.createPull({ title: "t", body: "b", head: "review-bot/abcdefghij", base: "main" });
    gh.merge(101);
    await q(
      `insert into review_proposals (public_id, review_week, paths, status, pr_number, branch, result_versions) values ('abcdefghij', $1::date, array['README.md'], 'pr_open', 101, 'review-bot/abcdefghij', '{}'::jsonb)`,
      [WEEK],
    );
    return { gh, w };
  }
  const status = async () => (await q<{ status: string }>(`select status from review_proposals where public_id = 'abcdefghij'`))[0].status;

  it("syncs on every scheduled tick before the switch and window gates: switch off, outside the window, and the close tick", async () => {
    for (const [when, settings, expected] of [
      [tick("14:15"), off, "skipped"],
      [tick("09:00", "2026-11-24"), on, "skipped"],
      [tick("17:15"), on, "closed"],
    ] as const) {
      ({ query: q } = await testDb());
      const { w } = await mergedOnGitHub();
      const model = fakeReviewModel([clean()]);
      expect(await job(when, model, { settings, github: { live: true, gw: w } })).toMatchObject({ status: expected, prSync: { status: "synced", merged: 1 } });
      expect(await status()).toBe("merged");
      expect(model.calls).toHaveLength(0);
    }
  });

  it("syncs under its own short lease, not the run's: a held review lease doesn't stop it", async () => {
    await seedWeek();
    const { w } = await mergedOnGitHub();
    const { PR_SYNC_LEASE } = await import("./approve");
    await takeLease(q, REVIEW_LEASE, "another-run", 300);
    let syncLeaseHeld = false;
    const gw = {
      ...w,
      getPull: async (n: number) => {
        syncLeaseHeld = !(await takeLease(q, PR_SYNC_LEASE, "someone-else", 60));
        return w.getPull(n);
      },
    };
    expect(await job(tick("14:15"), fakeReviewModel([clean()]), { github: { live: true, gw } })).toMatchObject({ status: "busy", prSync: { merged: 1 } });
    expect(syncLeaseHeld).toBe(true);
    expect(await status()).toBe("merged");
    // Released after: another sync can take it.
    expect(await takeLease(q, PR_SYNC_LEASE, "next", 60)).toBe(true);
  });

  it("a held sync lease skips the sync; a sync failure never stops the run", async () => {
    await seedWeek();
    const { w } = await mergedOnGitHub();
    const { PR_SYNC_LEASE } = await import("./approve");
    await takeLease(q, PR_SYNC_LEASE, "another-sync", 60);
    expect(await job(tick("14:15"), fakeReviewModel([clean()]), { github: { live: true, gw: w } })).toMatchObject({ status: "done", prSync: { status: "skipped" } });
    expect(await status()).toBe("pr_open");

    await q(`delete from leases`);
    await q(`update review_runs set status = 'failed'`);
    const broken = { ...w, getPull: async () => Promise.reject(new Error("boom")) };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await job(tick("14:45"), fakeReviewModel([clean()]), { github: { live: true, gw: broken } })).toMatchObject({ status: "done", prSync: { errors: 1 } });
    } finally {
      err.mockRestore();
    }
  });

  it("does nothing in a dry run, or without live GitHub", async () => {
    const { gh, w } = await mergedOnGitHub();
    gh.calls.length = 0;
    await job(tick("14:15"), fakeReviewModel([clean()]), { dryRun: true, github: { live: true, gw: w } });
    expect(gh.calls).toEqual([]);
    const r = await job(tick("09:00", "2026-11-24"), fakeReviewModel([clean()]), { github: { live: false, why: "this is not the production deployment", gw: gh.gateway({ canWrite: false }) } });
    expect(r.prSync).toMatchObject({ status: "skipped" });
    expect(gh.calls).toEqual([]);
    expect(await status()).toBe("pr_open");
  });
});
