import type { Query } from "@/lib/db-query";

/**
 * The admin read log (B3 plan Unit 6, spec B.16 "Admin read log", moved from
 * launch list S22). Each time an admin page shows a member's private data
 * (their runs, picks, feedback, profile or email history), one admin_actions
 * row per kind records who read it, which members, from which page, and when.
 *
 * - FAIL-CLOSED: pages write the rows after the data loads and before it is
 *   rendered. If the write throws, the page shows READ_NOT_LOGGED instead of
 *   the data. Never catch the error and render anyway.
 * - Ids only: `detail` holds the page, the user ids and the count. Never
 *   member text, titles, emails or run content.
 * - Never truncated: a kind that shows more than READ_LOG_MAX_IDS members is
 *   written as several rows of up to that many ids each (`part` of `parts`),
 *   so every member shown is recorded.
 * - No deduplication: "each time" means each time.
 * - All rows for one page view go in one statement, so they are written
 *   together or not at all.
 */

/** read_profile: the quiz answers. read_emails: the notification (email) history. */
export type ReadWhat = "read_runs" | "read_picks" | "read_feedback" | "read_profile" | "read_emails";

/** At most this many user ids per row; more go in further rows. `count` is the full number. */
export const READ_LOG_MAX_IDS = 200;

/** What a page shows instead of the data when its read can't be logged. */
export const READ_NOT_LOGGED = "This page couldn’t be logged, so it isn’t shown. Try again in a minute.";

export async function logAdminReads(q: Query, by: string, page: string, reads: { what: ReadWhat; userIds: (string | null | undefined)[] }[]): Promise<void> {
  const rows = reads.flatMap(({ what, userIds }) => {
    const ids = [...new Set(userIds.filter((u): u is string => typeof u === "string" && u.length > 0))];
    const parts = Math.ceil(ids.length / READ_LOG_MAX_IDS);
    return Array.from({ length: parts }, (_, i) => ({
      action: what,
      user_id: ids.length === 1 ? ids[0] : null,
      detail: { page, user_ids: ids.slice(i * READ_LOG_MAX_IDS, (i + 1) * READ_LOG_MAX_IDS), count: ids.length, ...(parts > 1 ? { part: i + 1, parts } : {}) },
    }));
  });
  if (!rows.length) return;
  await q(
    `insert into admin_actions (admin_email, user_id, action, detail)
     select $1, (r.v->>'user_id')::uuid, r.v->>'action', r.v->'detail'
     from jsonb_array_elements($2::jsonb) with ordinality as r(v, n) order by r.n`,
    [by, JSON.stringify(rows)],
  );
}

/** For pages: true when the reads were logged; false (and the error reported) when they weren't, so the page shows READ_NOT_LOGGED. */
export async function readsLogged(q: Query, by: string, page: string, reads: Parameters<typeof logAdminReads>[3]): Promise<boolean> {
  try {
    await logAdminReads(q, by, page, reads);
    return true;
  } catch (e) {
    console.error("[admin] read not logged", page, e instanceof Error ? e.message : e);
    return false;
  }
}

export type MemberRead = { at: string; adminEmail: string; page: string; kinds: string[] };

/**
 * Who read one member's data (the member's admin page, "Who read this
 * member's data"): the latest `limit` page views that showed it, newest
 * first, each with its kinds. A view is the rows one logAdminReads statement
 * wrote (same time, admin and page). Rows naming the member by user_id or in
 * user_ids both count. Admin emails, pages and kinds only: no member data, so
 * showing this list is not itself a logged read.
 */
export async function readsOfMember(q: Query, userId: string, limit = 50): Promise<MemberRead[]> {
  return q<MemberRead>(
    `select created_at::text as at, admin_email as "adminEmail", coalesce(detail->>'page', '') as page, array_agg(distinct action order by action) as kinds
     from admin_actions
     where action like 'read\\_%' and (user_id = $1 or detail->'user_ids' @> jsonb_build_array($1::text))
     group by created_at, admin_email, detail->>'page'
     order by created_at desc
     limit $2`,
    [userId, limit],
  );
}
