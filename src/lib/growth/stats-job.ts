import { randomUUID } from "node:crypto";
import { isAtOrPast, torontoDate, wallParts } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { brickSeries, brickSummary } from "@/lib/app/week";
import { displayCredit } from "@/lib/billing/credit-display";
import { HAS_CARD_OR_SPONSORED_SQL } from "@/lib/billing/has-card";
import { releaseLease, takeLease } from "@/lib/leases";
import { adminAlert, alertAdmins, recordFailure, retryPolicy, sendToUser, type MailDeps } from "@/lib/mail/send";
import { statsEmail } from "@/lib/mail/templates/stats";
import { unsubConfigured, unsubHeaders, unsubPageUrl, unsubToken } from "@/lib/mail/unsubscribe";
import { ensureReferralCode, referralLink } from "@/lib/referrals/code";
import { featureOn } from "@/lib/v3-features";
import type { V3Settings } from "@/lib/v3-settings";
import { standingsFor } from "./points";

/**
 * The Wednesday stats email (spec B.15, B2 plan Unit 8, "The Wednesday stats
 * job").
 *
 * - `/api/cron/stats` runs every 10 minutes on Wednesdays from 12:00 to 18:00
 *   UTC (vercel.json); the job acts from `v3.statsAt` Toronto time (08:00 to
 *   12:00, inside that window in summer and winter time), on the job clock.
 * - Only while `v3.statsOn` is on (with the v3 app live, featureOn).
 * - Recipients: active members, that is a trial with a card, a paying member
 *   (active), or a sponsored member, who have not switched it off
 *   (`email_prefs.stats`). A trial still waiting for its card, closed,
 *   held and cancelled accounts get nothing.
 * - Once per member per Toronto Wednesday: the notifications claim
 *   (member, "stats", date). A failed send is tried again by a later run, at
 *   least 45 minutes on, up to 6 attempts (send.ts `kindRetry`), so a short
 *   outage does not use up the window.
 * - Leased ("stats-send"): one run at a time, renewed before each member; the
 *   run stops when it loses the lease or its time budget.
 * - Without UNSUB_SECRET nothing is sent (each email must carry its signed
 *   unsubscribe) and the admins are alerted once that day.
 * - When the window closes, members still unsent are reported to the admins,
 *   once per Wednesday (`stats_unsent`): by the last scheduled run (17:50 UTC)
 *   whatever happened to it (it failed, or another run held the lease), and
 *   independently by the 18:00 UTC check run (`mode: "check"`), which only
 *   counts.
 * - A dry run (preview) only counts who is due: no code is made, nothing is
 *   claimed or sent.
 */
export const STATS_KIND = "stats";
export const STATS_LEASE = "stats-send";
const LEASE_SECONDS = 300;
/** The last run the schedule makes (`*\/10 12-17 * * 3`), in UTC minutes after midnight. */
export const LAST_RUN_UTC = 17 * 60 + 50;

/** SQL: the members who get the stats email (alias `u`). */
export const STATS_RECIPIENT_SQL = (alias = "u") =>
  `(${alias}.status in ('trial', 'active') and ${HAS_CARD_OR_SPONSORED_SQL(alias)} and coalesce(${alias}.email_prefs ->> 'stats', '') <> 'false')`;

/**
 * SQL: nothing to do for the member this Wednesday ($1 the date): the email
 * went (or was switched off at sending), it was given up on ($2 attempts), or
 * its last failure is too recent to try again ($3 minutes, the claim's rule).
 */
const NOT_DUE_SQL = (alias = "u") =>
  `exists (select 1 from notifications n where n.recipient = ${alias}.id::text and n.kind = '${STATS_KIND}' and n.ref = $1
             and (n.status in ('sent', 'skipped')
                  or (n.status = 'failed' and (n.attempts >= $2 or n.claimed_at > now() - make_interval(mins => $3)))))`;

export type StatsDeps = {
  settings: V3Settings;
  now: Date;
  /** "send" (the default) sends; "check" (the 18:00 UTC run) only reports members still unsent. */
  mode?: "send" | "check";
  dryRun?: boolean;
  /** Stop starting new sends after this long (ms of real time). */
  budgetMs?: number;
  holder?: string;
  /** For tests: where UNSUB_SECRET is read. */
  env?: Record<string, string | undefined>;
} & MailDeps;

export type StatsResult = {
  date: string;
  status: "skipped" | "done" | "busy" | "dry_run" | "checked";
  note?: string;
  due?: number;
  sent?: number;
  failed?: number;
  unsent?: number;
};

type Member = { id: string; email: string; email_prefs: Record<string, unknown> | null };

async function dueMembers(q: Query, date: string): Promise<Member[]> {
  const p = retryPolicy(STATS_KIND);
  return q<Member>(
    `select u.id, u.email, u.email_prefs from users u
     where ${STATS_RECIPIENT_SQL("u")} and not ${NOT_DUE_SQL("u")}
     order by u.id`,
    [date, p.maxAttempts, p.retryAfterMinutes],
  );
}

/** Members the email has not reached (sent, or switched off at sending) this Wednesday. Read only. */
export async function unsentCount(q: Query, date: string): Promise<number> {
  const [r] = await q<{ n: number | string }>(
    `select count(*) as n from users u where ${STATS_RECIPIENT_SQL("u")}
       and not exists (select 1 from notifications n where n.recipient = u.id::text and n.kind = '${STATS_KIND}' and n.ref = $1 and n.status in ('sent', 'skipped'))`,
    [date],
  );
  return Number(r?.n ?? 0);
}

const mailOf = (d: StatsDeps): MailDeps => ({ query: d.query, transport: d.transport, sleep: d.sleep });

/** The window has closed (or is closing with this run) for the job clock's day. */
const windowClosing = (now: Date) => now.getUTCHours() * 60 + now.getUTCMinutes() >= LAST_RUN_UTC;

/** Counts who is still unsent and tells the admins, once per Wednesday whichever run finds it first. Never throws. */
async function reportUnsent(q: Query, d: StatsDeps, date: string, error?: string): Promise<number | undefined> {
  try {
    const unsent = await unsentCount(q, date);
    if (unsent > 0) {
      await alertAdmins(
        "stats_unsent",
        date,
        adminAlert("Wednesday stats emails were not all sent", [
          `${unsent} member${unsent === 1 ? "" : "s"} did not get the stats email on ${date}, and the sending window has closed.`,
          ...(error ? [`The last run failed: ${error}`] : []),
          "Failed sends are in the notifications table (kind stats).",
        ]),
        mailOf(d),
      ).catch(() => {});
    }
    return unsent;
  } catch (e) {
    console.error("[stats] unsent check", e instanceof Error ? e.message : e);
    return undefined;
  }
}

type Built = { ok: true; message: ReturnType<typeof statsEmail> & { headers: Record<string, string> } } | { ok: false; reason: string };

/** One member's email: their code is made if they have none yet. */
async function buildFor(q: Query, d: StatsDeps, m: Member, standing: { total: number; rank: number }): Promise<Built> {
  const code = await ensureReferralCode(q, m.id);
  if (!code) return { ok: false, reason: "no referral code could be made" };
  const token = unsubToken(m.id, "stats", d.env ?? process.env);
  if (!token) return { ok: false, reason: "no unsubscribe token could be made" };
  const series = await brickSeries(q, m.id, d.now);
  // displayCredit hides a reading from before the member's last charge (B2 Unit 5's rule).
  const credit = await displayCredit(q, m.id, d.now);
  const message = statsEmail({
    season: series ? brickSummary(series) : null,
    points: standing.total,
    rank: standing.rank,
    credit: credit && credit.cents > 0 ? { cents: credit.cents, currency: credit.currency, asOf: torontoDate(credit.asOf ?? d.now) } : null,
    inviteUrl: referralLink(code),
    unsubscribeUrl: unsubPageUrl(token),
  });
  return { ok: true, message: { ...message, headers: unsubHeaders(token) } };
}

export async function runStatsJob(q: Query, d: StatsDeps): Promise<StatsResult> {
  const date = torontoDate(d.now);
  if (!featureOn(d.settings, "statsOn")) return { date, status: "skipped", note: "The stats email is switched off." };
  if (wallParts(d.now).dow !== 3) return { date, status: "skipped", note: "The stats email goes out on Wednesdays." };

  if (d.mode === "check") {
    if (!windowClosing(d.now)) return { date, status: "skipped", note: "The sending window is still open." };
    return { date, status: "checked", unsent: await reportUnsent(q, d, date) };
  }

  if (!isAtOrPast(d.now, date, d.settings.statsAt)) return { date, status: "skipped", note: `Before ${d.settings.statsAt} Toronto.` };

  if (!unsubConfigured(d.env ?? process.env)) {
    if (!d.dryRun) {
      await alertAdmins(
        "stats_no_unsub_secret",
        date,
        adminAlert("The Wednesday stats email was not sent", [
          `UNSUB_SECRET is not set, so no stats email can carry its unsubscribe link. Nothing was sent on ${date}.`,
          "Set UNSUB_SECRET in Vercel (Production and Preview) and redeploy; the next run in the window sends.",
        ]),
        mailOf(d),
      ).catch(() => {});
    }
    return { date, status: "skipped", note: "UNSUB_SECRET is not set." };
  }

  if (d.dryRun) return { date, status: "dry_run", due: (await dueMembers(q, date)).length };

  const holder = d.holder ?? randomUUID();
  if (!(await takeLease(q, STATS_LEASE, holder, LEASE_SECONDS))) {
    // Another run is sending. On the last run of the window, still report (read only, no lease).
    const unsent = windowClosing(d.now) ? await reportUnsent(q, d, date) : undefined;
    return { date, status: "busy", note: "Another run is sending.", ...(unsent !== undefined ? { unsent } : {}) };
  }
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  let due = 0;
  let error: unknown = null;
  try {
    const members = await dueMembers(q, date);
    due = members.length;
    // One read of the standings for everyone (Unit 7's rank rule), never one per member.
    const standing = await standingsFor(
      q,
      members.map((m) => m.id),
    );
    for (const m of members) {
      if (d.budgetMs !== undefined && Date.now() - started > d.budgetMs) {
        console.warn("[stats] out of time; the next run goes on", { date, sent, left: due - sent - failed });
        break;
      }
      // The lease guards each send, not only entry: stop if another run has it now.
      if (!(await takeLease(q, STATS_LEASE, holder, LEASE_SECONDS))) {
        console.warn("[stats] lease lost; stopping", { date, holder, sent });
        break;
      }
      try {
        const built = await buildFor(q, d, m, standing.get(m.id) ?? { total: 0, rank: 0 });
        if (!built.ok) {
          failed++;
          console.error("[stats] email not built", { userId: m.id, reason: built.reason });
          await recordFailure(q, m.id, STATS_KIND, date, built.reason);
          continue;
        }
        const r = await sendToUser({ id: m.id, email: m.email, emailPrefs: m.email_prefs }, STATS_KIND, date, built.message, mailOf(d));
        if (r === "sent") sent++;
        else if (r === "failed") failed++;
      } catch (e) {
        failed++;
        console.error("[stats] member", m.id, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    error = e;
  } finally {
    await releaseLease(q, STATS_LEASE, holder).catch(() => {});
  }

  // The window closes after the last scheduled run: whoever is still unsent will not get this week's email.
  const unsent = windowClosing(d.now) ? await reportUnsent(q, d, date, error ? (error instanceof Error ? error.message : String(error)) : undefined) : undefined;
  if (error) throw error;
  return { date, status: "done", due, sent, failed, ...(unsent !== undefined ? { unsent } : {}) };
}
