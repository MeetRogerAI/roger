import { weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { zackConnectedEmail } from "@/lib/mail/templates/zack-connected";

/**
 * Stores what Zack sends (spec B.5 "Send"). Zack 2.0 sends two files each
 * week, to two addresses: the run (plays, may be shared) and the private
 * matching profile. Each is kept once per user and week; a second one before
 * the cutoff replaces the first. Intake (Unit 9) processes runs left in
 * `received`, and must write its result only if `revision` is unchanged.
 */
export const MAX_REPORT_CHARS = 80_000;

export type ReportKind = "run" | "profile";
export type Route = "connector" | "upload" | "admin";

const RUN_BLOCK = /```\s*roger-run\b/;
const PROFILE_SIGNS = /roger-profile|"matching_only"|^#+\s*Zack Profile\b|Zack Profile - \d{4}-\d{2}-\d{2}/m;

/**
 * Which file this is. The address says so for Zack 2.0 (?kind=). Without it
 * (an upload, an older Zack), anything that looks like a profile and has no
 * run block is a profile: the private file must never be stored as a run.
 * A body holding both, or a "run" that is really a profile, is refused.
 */
export function kindOf(text: string, asked?: string | null): ReportKind | "ambiguous" {
  const hasRun = RUN_BLOCK.test(text);
  const looksProfile = PROFILE_SIGNS.test(text);
  if (asked === "profile") return hasRun ? "ambiguous" : "profile";
  if (hasRun && /```\s*roger-profile\b/.test(text)) return "ambiguous";
  if (asked === "run") return !hasRun && looksProfile ? "ambiguous" : "run";
  return !hasRun && looksProfile ? "profile" : "run";
}

/** "2.0" from the structured block or the header line; "" when neither says. */
export function zackVersion(text: string): string {
  const m = text.match(/"zack_version"\s*:\s*"(\d+\.\d+)"/) ?? text.match(/Zack The Collector[^\n]*?\bv(\d+\.\d+)\b/);
  return m?.[1] ?? "";
}

/** The report as sent: plain Markdown, or JSON with the text in "report", "text", "content" or "markdown". */
export function reportText(raw: string): string {
  const t = raw.trimStart();
  if (t.startsWith("{")) {
    try {
      const body = JSON.parse(t) as Record<string, unknown>;
      for (const k of ["report", "text", "content", "markdown"]) if (typeof body[k] === "string") return body[k] as string;
    } catch {}
  }
  return raw;
}

export type Sender = { id: string; email: string; sharing: "share" | "match_only" | "off"; agent: string };

export type Checked = { ok: true; text: string; kind: ReportKind } | { ok: false; status: 400 | 413; error: string };

/** The checks that need no database: size, emptiness and which file it is. */
export function checkReport(body: string, asked?: string | null): Checked {
  const text = body.replace(/^﻿/, "");
  if (!text.trim()) return { ok: false, status: 400, error: "The report is empty." };
  if (text.length > MAX_REPORT_CHARS) return { ok: false, status: 413, error: `The report is over ${MAX_REPORT_CHARS.toLocaleString("en-US")} characters.` };
  const kind = kindOf(text, asked);
  if (kind === "ambiguous") return { ok: false, status: 400, error: "Send the run file and the profile file separately, each to its own address." };
  return { ok: true, text, kind };
}

export type Stored = { id: string; week_of: string; replaced: boolean; kind: ReportKind };

/** How long after a run its profile still counts for the run's week, when the two land either side of the cutoff. */
const PROFILE_FOLLOWS_RUN_MINUTES = 60;

export async function storeReport(q: Query, user: Sender, c: { text: string; kind: ReportKind }, o: { route: Route; test: boolean; cutoff: string; now?: Date }): Promise<Stored> {
  const now = o.now ?? new Date();
  let week = weekOf(now, o.cutoff);
  if (c.kind === "run") {
    // A replacement gets a new revision and drops plays made from the old text, in one statement.
    const rows = await q<{ id: string; replaced: boolean }>(
      `with old as (
         delete from plays where run_id in (select id from runs where user_id = $1 and week_of = $2 and is_test = $7 and status <> 'deleted')
       )
       insert into runs (user_id, week_of, route, agent, sharing, raw_text, is_test, zack_version, received_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (user_id, week_of, is_test) where user_id is not null and status <> 'deleted'
       do update set route = excluded.route, agent = excluded.agent, sharing = excluded.sharing, raw_text = excluded.raw_text,
         zack_version = excluded.zack_version, received_at = excluded.received_at, revision = runs.revision + 1,
         parsed = null, parsed_by = null, status = 'received', reason = '', attempts = 0, processed_at = null
       returning id, (revision > 0) as replaced`,
      [user.id, week, o.route, user.agent, user.sharing, c.text, o.test, zackVersion(c.text), now.toISOString()],
    );
    return { id: rows[0].id, week_of: week, replaced: Boolean(rows[0]?.replaced), kind: "run" };
  }
  // A profile sent just after the run belongs to the run's week, even across the cutoff.
  const [recent] = await q<{ week_of: string }>(
    `select to_char(week_of, 'YYYY-MM-DD') as week_of from runs
     where user_id = $1 and is_test = $2 and status <> 'deleted' and received_at > $3
     order by received_at desc limit 1`,
    [user.id, o.test, new Date(now.getTime() - PROFILE_FOLLOWS_RUN_MINUTES * 60_000).toISOString()],
  );
  if (recent) week = recent.week_of;
  const rows = await q<{ id: string; replaced: boolean }>(
    `insert into zack_profiles (user_id, week_of, route, raw_text, is_test, received_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, week_of, is_test) where status <> 'deleted'
     do update set route = excluded.route, raw_text = excluded.raw_text, received_at = excluded.received_at,
       revision = zack_profiles.revision + 1, parsed = null, status = 'received', reason = '', processed_at = null
     returning id, (revision > 0) as replaced`,
    [user.id, week, o.route, c.text, o.test, now.toISOString()],
  );
  return { id: rows[0].id, week_of: week, replaced: Boolean(rows[0]?.replaced), kind: "profile" };
}

/** The first run, and the first test, each tell the user Zack is connected (the claim keeps each to once). */
export async function sendConnected(user: Sender, stored: Stored, test: boolean, deps: MailDeps = {}): Promise<void> {
  if (stored.kind !== "run") return;
  await sendToUser({ id: user.id, email: user.email }, "zack_connected", test ? "test" : "first", zackConnectedEmail({ test, weekOf: stored.week_of }), deps).catch(
    (e) => console.error("[zack] connected email failed", e instanceof Error ? e.message : e),
  );
}

/**
 * A free-tool report brought along at sign-up (`users.pending_zack_token`)
 * becomes the user's run for the current week, once, by route `free_tool`.
 * The token must belong to the same email, and is spent only when the run is
 * stored: the insert comes first and the claim depends on it. Returns whether
 * a run was stored.
 */
export async function claimFreeRun(q: Query, userId: string, cutoff: string, now: Date = new Date()): Promise<boolean> {
  const week = weekOf(now, cutoff);
  const rows = await q(
    `with f as (
       select fr.token, fr.report, fr.agent, u.sharing
       from free_runs fr join users u on u.id = $1
       where fr.token = u.pending_zack_token and lower(fr.email) = lower(u.email)
         and fr.claimed_by is null and fr.report is not null and length(fr.report) <= $3
         and not exists (select 1 from runs r where r.user_id = $1 and r.week_of = $2 and not r.is_test and r.status <> 'deleted')
     ),
     ins as (
       insert into runs (user_id, week_of, route, agent, sharing, raw_text, zack_version)
       select $1, $2, 'free_tool', f.agent, f.sharing, f.report,
              coalesce(substring(f.report from '"zack_version"\\s*:\\s*"(\\d+\\.\\d+)"'), substring(f.report from 'Zack The Collector[^\\n]*?v(\\d+\\.\\d+)'), '')
       from f
       on conflict do nothing
       returning id
     )
     update free_runs set claimed_by = $1 where token = (select token from f) and exists (select 1 from ins)
     returning token`,
    [userId, week, MAX_REPORT_CHARS],
  );
  return rows.length > 0;
}

/** Another chance for a free-tool claim that failed at trial start (plan Unit 10). Never throws. */
export async function retryPendingClaim(q: Query, userId: string, cutoff: () => Promise<string>): Promise<boolean> {
  try {
    const [u] = await q<{ waiting: boolean }>(
      `select exists (select 1 from users u join free_runs f on f.token = u.pending_zack_token where u.id = $1 and f.claimed_by is null and f.report is not null) as waiting`,
      [userId],
    );
    return u?.waiting ? await claimFreeRun(q, userId, await cutoff()) : false;
  } catch (e) {
    console.error("[zack] free-run retry", e instanceof Error ? e.message : e);
    return false;
  }
}
