import type { Query } from "@/lib/db-query";

/**
 * Seed rows for the review bot's tests: a member, an admin, runs, plays,
 * picks, Cora's rows and feedback for one review week. Each helper returns
 * the row's id.
 */
export const WEEK = "2026-11-23";
/** Friday of the review week, 15:00 UTC (the schedule's window). */
export const FRIDAY = new Date("2026-11-27T15:00:00Z");

export async function member(q: Query, email: string, o: { name?: string; displayName?: string; cancelReason?: string; cancelAt?: string } = {}): Promise<string> {
  const [r] = await q<{ id: string }>(
    `insert into users (email, name, display_name, status, cancel_reason, cancel_requested_at) values ($1, $2, $3, 'active', $4, $5::timestamptz) returning id`,
    [email, o.name ?? "", o.displayName ?? "", o.cancelReason ?? null, o.cancelAt ?? null],
  );
  return r.id;
}

export async function run(q: Query, userId: string, o: { status?: string; reason?: string; agent?: string; parsedBy?: string; test?: boolean; week?: string; version?: string } = {}): Promise<string> {
  const [r] = await q<{ id: string }>(
    `insert into runs (user_id, week_of, route, agent, sharing, raw_text, status, reason, parsed_by, is_test, instructions_version, instructions_version_source)
     values ($1, $2::date, 'connector', $3, 'share', 'RAW RUN TEXT NEVER SENT', $4, $5, $6, $7, $8, 'fetch') returning id`,
    [userId, o.week ?? WEEK, o.agent ?? "claude", o.status ?? "accepted", o.reason ?? "", o.parsedBy ?? "block", o.test ?? false, o.version ?? "abc1234def"],
  );
  return r.id;
}

export async function flaggedPlay(q: Query, runId: string, userId: string, reasons: string[], position = 1): Promise<string> {
  const [r] = await q<{ id: string }>(
    `insert into plays (run_id, user_id, week_of, set_, position, title, category, body, flag) values ($1, $2, $3::date, 'A', $4, 'A play', 'Email', '{}'::jsonb, $5::jsonb) returning id`,
    [runId, userId, WEEK, position, JSON.stringify({ reasons, fields: ["playbook_md"] })],
  );
  return r.id;
}

export async function poolPlay(q: Query, category = "Email"): Promise<string> {
  const [r] = await q<{ id: string }>(
    `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('Pool play', $1, 'd', 'p', 'i', $2::date, $2::date) returning id`,
    [category, WEEK],
  );
  return r.id;
}

export async function pick(q: Query, userId: string, poolPlayId: string, o: { week?: string; position?: number; opened?: boolean; marked?: boolean; dryRun?: boolean } = {}): Promise<void> {
  await q(
    `insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at, opened_at, setup_marked_at)
     values ($1, $2::date, $3, $4, 50, 3, 'r', $5, $6::timestamptz, case when $7 then $6::timestamptz end, case when $8 then $6::timestamptz end)`,
    [userId, o.week ?? WEEK, o.position ?? 1, poolPlayId, o.dryRun ?? false, `${o.week ?? WEEK}T12:00:00Z`, o.opened ?? false, o.marked ?? false],
  );
}

export async function coraWeek(q: Query, userId: string, outcome: string, note = ""): Promise<void> {
  await q(`insert into cora_user_weeks (user_id, week_of, outcome, note, method_version) values ($1, $2::date, $3, $4, 'cora9876')`, [userId, WEEK, outcome, note]);
}

export async function note(q: Query, userId: string, body: string, at = "2026-11-25T10:00:00Z"): Promise<string> {
  const [r] = await q<{ id: string }>(
    `insert into member_feedback (user_id, week_of, source, body, created_at, updated_at) values ($1, $2::date, 'member_note', $3, $4::timestamptz, $4::timestamptz) returning id`,
    [userId, WEEK, body, at],
  );
  return r.id;
}

export async function reply(q: Query, userId: string, body: string, at = "2026-11-26T10:00:00Z"): Promise<string> {
  const [r] = await q<{ id: string }>(
    `insert into member_feedback (user_id, week_of, source, body, entered_by, created_at, updated_at) values ($1, $2::date, 'admin_reply', $3, 'admin@roger.test', $4::timestamptz, $4::timestamptz) returning id`,
    [userId, WEEK, body, at],
  );
  return r.id;
}
