"use server";

import { refresh } from "next/cache";
import type { V3State } from "@/app/admin/v3-actions";
import { PASSWORD_ADMIN, requireAdmin } from "@/lib/admin-auth";
import { audited, logAdminAction } from "@/lib/admin/log";
import { query } from "@/lib/db-query";
import { hit } from "@/lib/rate-limit";
import { approveProposal, type ApproveResult, rejectProposal, syncPullRequestsLeased } from "@/lib/review/approve";
import { reviewWeek } from "@/lib/review/evidence";
import { reviewGitHub, reviewSyncGitHub } from "@/lib/review/github";
import { runReviewJob, type ReviewJobResult } from "@/lib/review/job";
import { gatewayReviewModel } from "@/lib/review/model";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * "Run now" on /admin/review (B3 plan Unit 8): the scheduled job for the
 * current review week, now, outside the Friday window and without the
 * schedule's attempt limit. The switch, the lease and the claim still apply,
 * so a done week is not run again. Server actions are public endpoints:
 * requireAdmin first, and the run is logged (started, then its outcome)
 * with who pressed it. The page sets maxDuration 300 for it.
 */
const JOB_LIMIT = { limit: 10, windowSeconds: 60 };

const bad = (message: string): V3State => ({ status: "error", message, at: Date.now() });

function describe(r: ReviewJobResult): string {
  if (r.status === "done") return `Week of ${r.week}: ${r.stored} proposal${r.stored === 1 ? "" : "s"} stored from ${r.evidence} evidence items.`;
  if (r.status === "no_evidence") return `Week of ${r.week}: no runs, picks or feedback yet, so nothing to review.`;
  if (r.status === "failed") return `Week of ${r.week}: the run failed (${r.note}). Model attempts this week: ${r.modelAttempts ?? 0}.`;
  return `Week of ${r.week}: ${r.note ?? r.status}`;
}

export async function runReviewNowAction(): Promise<V3State> {
  const by = await requireAdmin();
  if (!(await hit(`admin-job:${by}`, JOB_LIMIT))) return bad("Too many runs in a minute. Wait a moment.");
  const now = new Date();
  const settings = await readV3Settings();
  let r: ReviewJobResult;
  try {
    r = await audited(query, { by, action: "run_review", detail: { week: reviewWeek(now) } }, () =>
      runReviewJob(query, { settings, now, model: gatewayReviewModel, trigger: "manual", github: reviewSyncGitHub() }),
    );
  } catch (e) {
    // The log row holds the error; the message here stays fixed.
    console.error("[review] run now", e instanceof Error ? e.name : "Error");
    refresh();
    return bad("The review run failed. Its error is in the run list below.");
  }
  refresh();
  return { status: r.status === "failed" ? "error" : "ok", message: describe(r), at: Date.now() };
}

/**
 * Approve, reject and "Refresh from GitHub" (B3 plan Unit 9). Each is
 * requireAdmin first, rate-limited, and logged with `audited` (approve and
 * refresh reach GitHub, so their row is written before they start). Only the
 * proposal's public id goes in the log. The GitHub token never leaves the
 * server: the result is a fixed message, a PR number and its link.
 */
const PUBLIC_ID = /^[a-z2-7]{10}$/;
const idFrom = (fd: FormData) => {
  const v = String(fd.get("proposal") ?? "").trim();
  return PUBLIC_ID.test(v) ? v : null;
};
const fromApprove = (r: ApproveResult): V3State => ({
  status: ["first_read", "pr_open", "dry_run", "merged"].includes(r.status) ? "ok" : "error",
  message: r.message,
  link: r.pr_url,
  at: Date.now(),
});
const describeApprove = (r: ApproveResult) => ({ status: r.status, pr_number: r.pr_number ?? null, superseded: r.superseded ?? [], overlap: (r.overlap ?? []).map((o) => o.public_id) });

export async function approveProposalAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const id = idFrom(fd);
  if (!id) return bad("No such proposal.");
  if (!(await hit(`admin-job:${by}`, JOB_LIMIT))) return bad("Too many actions in a minute. Wait a moment.");
  const settings = await readV3Settings();
  let r: ApproveResult;
  try {
    r = await audited(query, { by, action: "approve_proposal", detail: { proposal: id } }, () => approveProposal(query, id, { by, email: by !== PASSWORD_ADMIN }, { gh: reviewGitHub(settings) }), describeApprove);
  } catch (e) {
    console.error("[review] approve action", e instanceof Error ? e.name : "Error");
    refresh();
    return bad("The approval failed. Reload the page and try again.");
  }
  refresh();
  return fromApprove(r);
}

export async function rejectProposalAction(_p: V3State, fd: FormData): Promise<V3State> {
  const by = await requireAdmin();
  const id = idFrom(fd);
  if (!id) return bad("No such proposal.");
  const note = String(fd.get("note") ?? "").slice(0, 2000);
  const r = await rejectProposal(query, id, { by, email: by !== PASSWORD_ADMIN }, note);
  const done = r.message.startsWith("Rejected");
  // The note is admin text: logged by length only.
  if (done) await logAdminAction(query, { by, action: "reject_proposal", detail: { proposal: id, note_chars: note.trim().length } });
  refresh();
  return { status: done ? "ok" : "error", message: r.message, at: Date.now() };
}

export async function refreshFromGitHubAction(): Promise<V3State> {
  const by = await requireAdmin();
  if (!(await hit(`admin-job:${by}`, JOB_LIMIT))) return bad("Too many actions in a minute. Wait a moment.");
  try {
    // The sync's own mode and lease, as on every review cron tick and in the hourly pass.
    const r = await audited(query, { by, action: "refresh_github", detail: {} }, () => syncPullRequestsLeased(query, reviewSyncGitHub()));
    refresh();
    if (r.status === "skipped") return { status: "ok", message: r.note, at: Date.now() };
    return {
      status: r.errors ? "error" : "ok",
      message: `Checked ${r.checked} pull request${r.checked === 1 ? "" : "s"}: ${r.merged} merged, ${r.closed} closed, ${r.superseded} superseded${r.errors ? `, ${r.errors} could not be read (tried again next time)` : ""}.`,
      at: Date.now(),
    };
  } catch (e) {
    console.error("[review] refresh", e instanceof Error ? e.name : "Error");
    return bad("GitHub could not be read. Try again later.");
  }
}
