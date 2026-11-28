import { randomUUID } from "node:crypto";
import { snapshotCheckpoint } from "@/lib/admin/measures";
import { adminEmails } from "@/lib/auth/admin-emails";
import type { Query } from "@/lib/db-query";
import { releaseLease, takeLease } from "@/lib/leases";
import { adminAlert, alertAdmins, type MailDeps } from "@/lib/mail/send";
import type { V3Settings } from "@/lib/v3-settings";
import { loadEvidence, reviewWeek } from "./evidence";
import type { ReviewModel } from "./model";
import { type Discarded, REVIEW_LEASE_SECONDS, runReview } from "./propose";

/**
 * The review bot's schedule (B3 plan Unit 8). `/api/cron/review` ticks at :15
 * and :45 past 14, 15 and 16 UTC on Fridays, plus a close tick at 17:15
 * (CLOSE_TICK_UTC; a second vercel.json entry on the same path, so the mode
 * comes from the clock, not a query string). "Run now" on /admin/review runs
 * the same job for the current review week.
 *
 * - The job clock is min(now, the real clock), as in runReview, so the week,
 *   the window, the abandoned check and the alert refs all agree with the run
 *   row runReview writes. A test that needs a later Friday moves the real
 *   clock (fake timers); there is no other override.
 *
 * - The December 14 checkpoint snapshot is taken first, whatever the switch
 *   says (Unit 3), so it is frozen on the first Friday even if nobody opens
 *   /admin/measures. It never stops the run.
 * - `v3.reviewBotOn` (the raw switch: the bot is admin-only, not gated on
 *   sign-up or the cycle) off: nothing else happens, for the schedule and for
 *   "Run now" alike, and the result says so.
 * - Schedule only: the job clock must be in the Friday window (14:00 to 16:59
 *   UTC) to claim. "Run now" ignores the window.
 * - Closing the window: any scheduled tick on a Friday at or after 16:45
 *   (LAST_TICK_UTC) closes it. From 17:00 (the close tick, or a late 16:45
 *   tick) the job claims nothing, takes no lease and calls no model: it only
 *   closes. Closing reads the week's row: failed, never claimed, or running
 *   past its lease (a tick cut off mid-call) alerts `review_failed`; done
 *   with proposals re-sends `review_ready`. Both are deduped per week, so
 *   this only retries a send that failed.
 * - One run at a time: the `review-bot` lease (330 seconds, the claim's
 *   lease, covering the route's 300), then Unit 7's claim on review_runs. A
 *   done week is never run again.
 * - Attempts: a scheduled tick claims a failed (or abandoned) week only while
 *   it has reached the model fewer than MAX_MODEL_ATTEMPTS times; the attempt
 *   that uses up the last one alerts the admins, and the schedule stops until
 *   next Friday's week or a "Run now", which has no limit. A skipped week (no
 *   evidence) is claimed again on the next tick, and those re-checks are not
 *   model attempts.
 * - Alerts, each once per week: `review_ready` when proposals were stored
 *   (by either trigger), `review_failed` when the attempts are used up, or
 *   when closing finds the week not done. Neither holds member or model
 *   text: the error label stays on /admin/review.
 * - A dry run (preview) only reports what a tick would do: no snapshot, no
 *   lease, no claim, no model call, no alert.
 *
 * PR status sync (Unit 9) runs here, under the lease, once it exists.
 */
export const REVIEW_LEASE = "review-bot";
export const MAX_MODEL_ATTEMPTS = 3;
/** The Friday window's first and last scheduled ticks (`15,45 14-16 * * 5`), in UTC minutes after midnight. */
export const FIRST_TICK_UTC = 14 * 60 + 15;
export const LAST_TICK_UTC = 16 * 60 + 45;
/** The close tick (`15 17 * * 5`): outside the window, so it only closes. */
export const CLOSE_TICK_UTC = 17 * 60 + 15;
/** The window the schedule acts in: from 14:00 UTC to the end of the 16:00 hour, so a late tick still counts. */
const WINDOW_START_UTC = 14 * 60;
const WINDOW_END_UTC = 17 * 60;

export type ReviewTrigger = "schedule" | "manual";

export type ReviewJobDeps = {
  settings: V3Settings;
  now: Date;
  model: ReviewModel;
  trigger?: ReviewTrigger;
  dryRun?: boolean;
  holder?: string;
  admins?: string[];
} & MailDeps;

export type ReviewJobResult = {
  week: string;
  /** skipped: switched off or outside the window; closed: a Friday tick from 17:00 that only closed the window; no_evidence: claimed, nothing to review (claimed again next tick). */
  status: "skipped" | "busy" | "dry_run" | "done" | "no_evidence" | "failed" | "not_claimed" | "closed";
  note?: string;
  evidence?: number;
  stored?: number;
  discarded?: Discarded;
  modelAttempts?: number;
  alerted?: string[];
};

type RunRow = { status: string; model_attempts: number; started_at: string | Date };

async function runRow(q: Query, week: string): Promise<RunRow | null> {
  const [r] = await q<RunRow>(`select status, model_attempts, started_at from review_runs where week_of = $1::date`, [week]);
  return r ?? null;
}

const minutesUtc = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const inWindow = (d: Date) => d.getUTCDay() === 5 && minutesUtc(d) >= WINDOW_START_UTC && minutesUtc(d) < WINDOW_END_UTC;
/** Any Friday time at or after the last tick closes the window, so a delayed tick still closes it. */
const lastTick = (d: Date) => d.getUTCDay() === 5 && minutesUtc(d) >= LAST_TICK_UTC;
const mailOf = (d: ReviewJobDeps): MailDeps => ({ query: d.query, transport: d.transport, sleep: d.sleep });

/** Running, and its claim older than the lease: the run was cut off and nobody holds it. */
const abandoned = (r: RunRow, now: Date) => r.status === "running" && now.getTime() - new Date(r.started_at).getTime() >= REVIEW_LEASE_SECONDS * 1000;

/** Why a week was not claimed, from its row. */
function notClaimedNote(r: RunRow | null): string {
  if (r?.status === "done") return "This week's review is done.";
  if (r && r.model_attempts >= MAX_MODEL_ATTEMPTS && r.status !== "running") {
    return `This week's review used its ${MAX_MODEL_ATTEMPTS} model attempts. Press Run now on /admin/review to try again.`;
  }
  return "Another run holds this week's review.";
}

async function alertFailed(d: ReviewJobDeps, week: string, why: string): Promise<boolean> {
  const r = await alertAdmins(
    "review_failed",
    week,
    adminAlert("The weekly review bot did not finish", [
      `The review of the week of ${week} did not finish: ${why}`,
      "The run's error is on /admin/review. Press Run now there to try again.",
    ]),
    mailOf(d),
  ).catch(() => "failed" as const);
  return r === "sent";
}

async function alertReady(d: ReviewJobDeps, week: string, proposals: { status: string; guardrail: boolean }[]): Promise<boolean> {
  const blocked = proposals.filter((p) => p.status === "blocked").length;
  const guardrail = proposals.filter((p) => p.guardrail).length;
  const r = await alertAdmins(
    "review_ready",
    week,
    adminAlert("Review bot proposals are ready", [
      `The review of the week of ${week} stored ${proposals.length} proposal${proposals.length === 1 ? "" : "s"}${blocked ? `, ${blocked} blocked` : ""}${guardrail ? `, ${guardrail} needing a second read` : ""}.`,
      "Read them on /admin/review.",
    ]),
    mailOf(d),
  ).catch(() => "failed" as const);
  return r === "sent";
}

async function weekProposals(q: Query, week: string): Promise<{ status: string; guardrail: boolean }[]> {
  return q<{ status: string; guardrail: boolean }>(`select status, guardrail from review_proposals where review_week = $1::date`, [week]);
}

export async function runReviewJob(q: Query, d: ReviewJobDeps): Promise<ReviewJobResult> {
  const trigger = d.trigger ?? "schedule";
  // The job clock never runs ahead of the real one (as in runReview), so a future ?asOf gets the same week as the run row.
  const now = new Date(Math.min(d.now.getTime(), Date.now()));
  const week = reviewWeek(now);
  const admins = d.admins ?? adminEmails();
  /** A Friday tick from 17:00 (the close tick, or a late last tick): it only closes the window. */
  const closeOnly = trigger === "schedule" && !inWindow(now) && lastTick(now);

  if (d.dryRun) {
    const row = await runRow(q, week);
    const { items, empty } = await loadEvidence(q, { week, now, admins });
    const why = !d.settings.reviewBotOn
      ? "the switch is off"
      : closeOnly
        ? "the Friday window has closed (it would only report the week)"
        : trigger === "schedule" && !inWindow(now)
          ? "outside the Friday window"
          : null;
    return {
      week,
      status: "dry_run",
      evidence: empty ? 0 : items.length,
      modelAttempts: row?.model_attempts ?? 0,
      note: `Run ${row ? `${row.status}, ${row.model_attempts} model attempt${row.model_attempts === 1 ? "" : "s"}` : "not started"}. ${why ? `A tick would do nothing: ${why}.` : empty ? "A tick would record no evidence." : "A tick would call the model if it can claim the week."}`,
    };
  }

  try {
    await snapshotCheckpoint(q, { now, adminEmails: admins });
  } catch (e) {
    console.error("[review] checkpoint snapshot", e instanceof Error ? e.message : e);
  }

  if (!d.settings.reviewBotOn) return { week, status: "skipped", note: "The review bot is switched off (v3.reviewBotOn)." };
  if (trigger === "schedule" && !inWindow(now) && !closeOnly) return { week, status: "skipped", note: "The review bot runs on Fridays from 14:15 to 16:45 UTC." };

  const holder = d.holder ?? `review-${randomUUID()}`;
  const alerted: string[] = [];
  /**
   * Closing the window (a scheduled tick on a Friday from 16:45): reads the
   * week's row and alerts, each alert deduped per week. Not done (failed,
   * never claimed, running past its lease, or out of attempts and not
   * running): review_failed. Done with proposals: review_ready again, which
   * only sends if the first send failed. Claims nothing.
   */
  const closeWindow = async () => {
    if (trigger !== "schedule" || !lastTick(now)) return;
    try {
      const r = await runRow(q, week);
      if (r?.status === "done") {
        const proposals = await weekProposals(q, week);
        if (proposals.length && !alerted.includes("review_ready") && (await alertReady(d, week, proposals))) alerted.push("review_ready");
        return;
      }
      const cutOff = !!r && abandoned(r, now);
      const open = !r || r.status === "failed" || cutOff || (r.model_attempts >= MAX_MODEL_ATTEMPTS && r.status !== "running" && r.status !== "skipped");
      if (!open || alerted.includes("review_failed")) return;
      const attempts = r ? ` after ${r.model_attempts} model attempt${r.model_attempts === 1 ? "" : "s"}` : "";
      const why = !r ? "no run started" : cutOff ? `the run was cut off${attempts}` : `the run failed${attempts}`;
      if (await alertFailed(d, week, `${why}, and the Friday window has closed.`)) alerted.push("review_failed");
    } catch (e) {
      console.error("[review] window check", e instanceof Error ? e.message : e);
    }
  };

  if (closeOnly) {
    await closeWindow();
    const row = await runRow(q, week).catch(() => null);
    return { week, status: "closed", note: "The Friday window has closed: this tick only reports the week.", modelAttempts: row?.model_attempts ?? 0, ...(alerted.length ? { alerted } : {}) };
  }

  if (!(await takeLease(q, REVIEW_LEASE, holder, REVIEW_LEASE_SECONDS))) {
    await closeWindow();
    return { week, status: "busy", note: "Another review run holds the lease.", ...(alerted.length ? { alerted } : {}) };
  }

  let result: ReviewJobResult;
  try {
    // Unit 9: syncPullRequests(q, …) goes here, before the run.
    const r = await runReview(q, { now, model: d.model, holder, admins, maxModelAttempts: trigger === "schedule" ? MAX_MODEL_ATTEMPTS : null });
    const row = await runRow(q, week);
    const modelAttempts = row?.model_attempts ?? 0;
    if (r.status === "done") {
      result = { week, status: "done", evidence: r.evidence, stored: r.stored, discarded: r.discarded, modelAttempts };
      if (r.stored > 0 && (await alertReady(d, week, r.proposals))) alerted.push("review_ready");
    } else if (r.status === "skipped") {
      result = { week, status: "no_evidence", note: "No runs, picks or feedback this week: nothing to review. The next tick looks again.", modelAttempts };
    } else if (r.status === "failed") {
      result = { week, status: "failed", note: r.error, modelAttempts };
      if (trigger === "schedule" && modelAttempts >= MAX_MODEL_ATTEMPTS) {
        if (await alertFailed(d, week, `the model call failed ${modelAttempts} times. The schedule stops until next Friday.`)) alerted.push("review_failed");
      }
    } else {
      result = { week, status: "not_claimed", note: notClaimedNote(row), modelAttempts };
    }
  } catch (e) {
    // runReview has marked the run failed. Count it toward the limit, then report.
    if (trigger === "schedule") {
      const row = await runRow(q, week).catch(() => null);
      if (row && row.model_attempts >= MAX_MODEL_ATTEMPTS && (await alertFailed(d, week, `the run failed ${row.model_attempts} times. The schedule stops until next Friday.`))) alerted.push("review_failed");
    }
    await closeWindow();
    throw e;
  } finally {
    await releaseLease(q, REVIEW_LEASE, holder).catch(() => {});
  }
  await closeWindow();
  return alerted.length ? { ...result, alerted } : result;
}
