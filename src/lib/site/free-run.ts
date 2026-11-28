/**
 * Storage for the free Zack run on /zack (plan KTD12, spec A.11): the
 * `free_runs` table, which sign-up's claim reads (claimFreeRun in
 * src/lib/zack/receive.ts).
 *
 * The rules this file keeps:
 *   - A stored report is reachable only by its token. No function here takes
 *     an email and returns a token, a report or whether a row exists.
 *   - A start treats every email alike. A row already attached to an account
 *     is reset like any other, so neither the answer nor the page that follows
 *     says whether an email has a run or an account.
 *   - Each write is one statement, because the database is reached over HTTP
 *     with no transactions.
 *   - Every time comes from the caller's clock, never the database's now().
 */
import { randomBytes } from "node:crypto";
import type { Query } from "@/lib/db-query";

/**
 * The cap on a pasted report. The spec says 20,000 characters (A.11), but ten of the thirteen real reports in
 * artifacts/Zack Runs are longer than that, the longest about 33,200, so the tool would have refused most visitors.
 * The claim at sign-up accepts 80,000, so anything stored here is claimable.
 */
export const FREE_RUN_REPORT_CHARS = 40_000;

/** The shape /start accepts for `zack` (parseStartParams in src/lib/signup/params.ts). */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

export const isRunToken = (value: unknown): value is string => typeof value === "string" && TOKEN_SHAPE.test(value);

/** A new run token: 256 random bits, URL-safe. */
export function newRunToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Starts a run for an email and agent, and returns a new token.
 *
 * One statement covers both cases, and the answer and what follows it are the
 * same in both:
 *   - no row yet: one is written with the new token;
 *   - a row already there, claimed or not: it takes the new token, loses any
 *     stored report and is unclaimed again. Someone who knows an email can
 *     make its owner start again, but can never read or attach the owner's
 *     report, and cannot tell from the answer or the next page whether the
 *     email has a run, or an account.
 *
 * Resetting a claimed row loses nothing: the claim copied the report into the
 * account's own `runs` row (claimFreeRun), and the row here was only a marker.
 * The account's `pending_zack_token` still holds the old token, so the new
 * run is not attached to it a second time.
 *
 * It must stay ONE statement. `unique (email, agent)` then makes two starts
 * at once safe (the second becomes the update, and one row is left); a read
 * followed by a write would not be.
 */
export async function startRun(q: Query, o: { email: string; agent: string; now: Date }): Promise<{ token: string }> {
  const token = newRunToken();
  await q(
    `insert into free_runs (token, email, agent, created_at)
     values ($1, $2, $3, $4)
     on conflict (email, agent) do update
       set token = excluded.token, report = null, report_at = null, claimed_by = null, created_at = excluded.created_at`,
    [token, o.email.trim().toLowerCase(), o.agent, o.now.toISOString()],
  );
  return { token };
}

export type ReportCheck = "ok" | "empty" | "too_long";

/** The checks on a pasted report that need no database. */
export function checkFreeReport(report: string): ReportCheck {
  if (!report.trim()) return "empty";
  return report.length > FREE_RUN_REPORT_CHARS ? "too_long" : "ok";
}

export type SaveResult = "saved" | "not_found" | Exclude<ReportCheck, "ok">;

/** Stores a report on the unclaimed row with this token. An unknown, replaced or claimed token stores nothing. */
export async function saveReport(q: Query, o: { token: string; report: string; now: Date }): Promise<SaveResult> {
  const check = checkFreeReport(o.report);
  if (check !== "ok") return check;
  if (!isRunToken(o.token)) return "not_found";
  const rows = await q(`update free_runs set report = $2, report_at = $3 where token = $1 and claimed_by is null returning 1 as saved`, [o.token, o.report, o.now.toISOString()]);
  return rows.length > 0 ? "saved" : "not_found";
}

export type RunView = { agent: string; hasReport: boolean };

/**
 * What the page may know about a run from its token: the agent, and whether a
 * report is in. Null for an unknown, replaced or claimed token, and, when the
 * page names its agent, for a run started for another one.
 */
export async function readRun(q: Query, token: string, agent: string | null = null): Promise<RunView | null> {
  if (!isRunToken(token)) return null;
  const [row] = await q<{ agent: string; has_report: boolean }>(
    `select agent, report is not null as has_report from free_runs where token = $1 and claimed_by is null and ($2::text is null or agent = $2)`,
    [token, agent],
  );
  return row ? { agent: row.agent, hasReport: Boolean(row.has_report) } : null;
}

/**
 * Retention (KTD12): a run that was never claimed is deleted once it is older
 * than the retention period, and a claimed run of that age loses its report
 * (sign-up copied it to the account's own runs when it claimed it). Age counts
 * from the last start.
 *
 * A claimed run whose account no longer exists is deleted at any age:
 * `claimed_by` has no foreign key, so deleting a user leaves the row behind,
 * with an email on it. The three parts never touch the same row. Safe to run
 * twice.
 */
export async function purgeFreeRuns(q: Query, o: { now: Date; retentionDays: number }): Promise<{ deleted: number; cleared: number; orphaned: number }> {
  const [r] = await q<{ deleted: number; cleared: number; orphaned: number }>(
    `with d as (
       delete from free_runs where claimed_by is null and created_at <= $1::timestamptz - make_interval(days => $2) returning 1
     ),
     g as (
       delete from free_runs f where f.claimed_by is not null and not exists (select 1 from users u where u.id = f.claimed_by) returning 1
     ),
     c as (
       update free_runs f set report = null, report_at = null
       where f.claimed_by is not null and exists (select 1 from users u where u.id = f.claimed_by)
         and (f.report is not null or f.report_at is not null) and f.created_at <= $1::timestamptz - make_interval(days => $2)
       returning 1
     )
     select (select count(*) from d)::int as deleted, (select count(*) from c)::int as cleared, (select count(*) from g)::int as orphaned`,
    [o.now.toISOString(), o.retentionDays],
  );
  return { deleted: Number(r.deleted), cleared: Number(r.cleared), orphaned: Number(r.orphaned) };
}
