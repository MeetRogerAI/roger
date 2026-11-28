"use server";

import { refresh } from "next/cache";
import type { V3State } from "@/app/admin/v3-actions";
import { requireAdmin } from "@/lib/admin-auth";
import { audited } from "@/lib/admin/log";
import { query } from "@/lib/db-query";
import { hit } from "@/lib/rate-limit";
import { reviewWeek } from "@/lib/review/evidence";
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
      runReviewJob(query, { settings, now, model: gatewayReviewModel, trigger: "manual" }),
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
