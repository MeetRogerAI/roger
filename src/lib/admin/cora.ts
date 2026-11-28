import { runChargeJob, type ChargeJobResult } from "@/lib/billing/charge-job";
import type { ChargeDeps } from "@/lib/billing/first-charge";
import { wallToInstant } from "@/lib/clock";
import { runSendJob, type SendDeps, type SendResult } from "@/lib/cora/send-job";
import type { Query } from "@/lib/db-query";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * The Cora page (spec B.12, plan Unit 17): the week's state, and the
 * recovery button "Charge and send now", which runs the two Monday jobs in
 * order, charge first. Both jobs keep every one of their own checks (the
 * cycle is live, it is past their time, the week is ready); this only stops
 * early, with the reason, when the week is not ready, and never sends when
 * the charge did not run.
 */
export type WeekState = {
  week: string;
  status: string | null;
  phase: string | null;
  dryRun: boolean;
  runsRead: number;
  playsMerged: number;
  poolSize: number;
  usersPicked: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  sentAt: string | null;
  coraAt: string;
  chargeAt: string;
  sendAt: string;
};

export async function weekState(q: Query, week: string, s: V3Settings): Promise<WeekState> {
  const [w] = await q<{
    status: string;
    phase: string;
    dry_run: boolean;
    runs_read: number;
    plays_merged: number;
    pool_size: number;
    users_picked: number;
    error: string | null;
    started_at: string | null;
    finished_at: string | null;
    sent_at: string | null;
  }>(
    `select status, phase, dry_run, runs_read, plays_merged, pool_size, users_picked, error, started_at::text, finished_at::text, sent_at::text from cora_weeks where week_of = $1`,
    [week],
  );
  const at = (hm: string) => wallToInstant(week, hm).toISOString();
  return {
    week,
    status: w?.status ?? null,
    phase: w?.phase ?? null,
    dryRun: w?.dry_run ?? false,
    runsRead: w?.runs_read ?? 0,
    playsMerged: w?.plays_merged ?? 0,
    poolSize: w?.pool_size ?? 0,
    usersPicked: w?.users_picked ?? 0,
    error: w?.error ?? null,
    startedAt: w?.started_at ?? null,
    finishedAt: w?.finished_at ?? null,
    sentAt: w?.sent_at ?? null,
    coraAt: at(s.coraAt),
    chargeAt: at(s.chargeAt),
    sendAt: at(s.sendAt),
  };
}

/** Why the week can't be charged and sent, in words; null when it is ready (or already sent). */
export function notReadyReason(w: Pick<WeekState, "status" | "phase" | "dryRun">, s: Pick<V3Settings, "cycleLive">): string | null {
  if (!s.cycleLive) return "The cycle is not live (v3.cycleLive is off), so nothing is charged or sent.";
  if (!w.status) return "Cora hasn’t started this week.";
  if (w.dryRun) return "This week is a dry run: nobody is charged or sent a dry run’s picks.";
  if (w.status === "failed") return "Cora’s week failed. Nothing is charged or sent for a failed week.";
  if (w.status === "running") return `Cora is still working on this week (phase: ${w.phase}).`;
  return null;
}

export type ChargeAndSend =
  | { done: false; reason: string; charge?: ChargeJobResult; send?: SendResult }
  | { done: true; charge: ChargeJobResult; send: SendResult };

export async function chargeAndSendNow(q: Query, d: ChargeDeps & SendDeps, week: string): Promise<ChargeAndSend> {
  const w = await weekState(q, week, d.settings);
  const reason = notReadyReason(w, d.settings);
  if (reason) return { done: false, reason };
  const charge = await runChargeJob(q, d, { week });
  // The send releases third lists only once their charge is settled, but it is never run when the charge did not run at all.
  if (charge.status !== "done") return { done: false, reason: charge.note ?? "The charge job did not run.", charge };
  const send = await runSendJob(q, d, { week });
  // Charged, but the send skipped (before the send time, say): say so rather than report success.
  if (send.status !== "done") return { done: false, reason: send.note ?? "The send job did not run.", charge, send };
  return { done: true, charge, send };
}

export type UserPick = { weekOf: string; position: number; title: string; reason: string; fit: number; personalScore: number; dryRun: boolean; deliveredAt: string | null; openedAt: string | null; setupMarkedAt: string | null; poolPlayId: string; removed: boolean };

/** A read-only view of one user's picks, newest week first (dry runs marked). `removed`: an admin took the play out of the pool for good (2026-11-28); the pick itself stays. */
export async function userPicks(q: Query, userId: string, limit = 60): Promise<UserPick[]> {
  return q<UserPick>(
    `select to_char(p.week_of, 'YYYY-MM-DD') as "weekOf", p.position, pp.title, p.reason, p.fit, p.personal_score as "personalScore", p.dry_run as "dryRun",
            p.delivered_at::text as "deliveredAt", p.opened_at::text as "openedAt", p.setup_marked_at::text as "setupMarkedAt",
            pp.id as "poolPlayId", (pp.removed_at is not null) as removed
     from picks p join pool_plays pp on pp.id = p.pool_play_id where p.user_id = $1 order by p.week_of desc, p.dry_run, p.position limit $2`,
    [userId, limit],
  );
}
