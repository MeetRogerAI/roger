import type { Query } from "@/lib/db-query";
import { logAdminAction } from "./log";
import type { Done } from "./users";

/**
 * The flags queue (spec B.6, B.12): plays intake held back for a person to
 * read. Approving clears the flag and sets `shareable` from the run, never
 * from the flag alone (Unit 9 review): the run shares, is not a test, and
 * its member still shares. So a "matching only" play stays out of the pool
 * even once cleared. Editing replaces the text, then approves. Rejecting
 * keeps the play out of the pool for good. Once a run has no open flags,
 * it is marked accepted.
 */
export type FlaggedPlay = {
  id: string;
  runId: string;
  userId: string | null;
  who: string;
  weekOf: string;
  title: string;
  category: string;
  body: Record<string, unknown>;
  reasons: string[];
  fields: string[];
  runSharing: string;
};

/** A flag still waiting for a decision (a rejected play keeps its flag, marked rejected). */
export const OPEN_FLAG = `(p.flag is not null and not coalesce((p.flag->>'rejected')::boolean, false))`;

/** The text fields an admin can edit, in the order the form shows them. */
export const EDITABLE_FIELDS = ["title", "job", "description", "heavy_use_for", "who_can_use_it", "best_trick", "working", "playbook_md", "install_notes"] as const;

export async function listFlags(q: Query): Promise<FlaggedPlay[]> {
  const rows = await q<{
    id: string;
    run_id: string;
    user_id: string | null;
    who: string;
    week_of: string;
    title: string;
    category: string;
    body: Record<string, unknown>;
    flag: { reasons?: string[]; fields?: string[] };
    run_sharing: string;
  }>(
    `select p.id, p.run_id, p.user_id, coalesce(u.email, 'seed: ' || sc.label) as who, to_char(p.week_of, 'YYYY-MM-DD') as week_of,
            p.title, p.category, p.body, p.flag, r.sharing as run_sharing
     from plays p join runs r on r.id = p.run_id left join users u on u.id = p.user_id left join seed_contributors sc on sc.id = p.contributor_id
     where ${OPEN_FLAG} order by p.week_of desc, p.run_id, p.set_, p.position`,
  );
  return rows.map((r) => ({
    id: r.id,
    runId: r.run_id,
    userId: r.user_id,
    who: r.who,
    weekOf: r.week_of,
    title: r.title,
    category: r.category,
    body: r.body ?? {},
    reasons: Array.isArray(r.flag?.reasons) ? r.flag.reasons : [],
    fields: Array.isArray(r.flag?.fields) ? r.flag.fields : [],
    runSharing: r.run_sharing,
  }));
}

/** Runs flagged as a whole (unreadable, or cut off for length): no plays to approve, so an admin reads the run. */
export async function flaggedRunsWithoutPlays(q: Query): Promise<{ id: string; who: string; weekOf: string; reason: string }[]> {
  return q(
    `select r.id, coalesce(u.email, 'seed: ' || sc.label) as who, to_char(r.week_of, 'YYYY-MM-DD') as "weekOf", r.reason
     from runs r left join users u on u.id = r.user_id left join seed_contributors sc on sc.id = r.contributor_id
     where r.status = 'flagged' and not exists (select 1 from plays p where p.run_id = r.id) order by r.week_of desc`,
  );
}

/** shareable from the run and the member, never from the flag. */
const SHAREABLE_SQL = `(r.sharing = 'share' and not r.is_test and (r.contributor_id is not null or u.sharing = 'share'))`;

/** Marks a run accepted once none of its plays has an open flag. */
async function settleRun(q: Query, runId: string): Promise<void> {
  await q(
    `update runs r set status = 'accepted' where r.id = $1 and r.status = 'flagged'
       and exists (select 1 from plays p where p.run_id = r.id) and not exists (select 1 from plays p where p.run_id = r.id and ${OPEN_FLAG})`,
    [runId],
  );
}

async function clear(q: Query, by: string, playId: string, edits: Record<string, string> | null): Promise<Done> {
  const rows = await q<{ run_id: string; user_id: string | null; shareable: boolean }>(
    `update plays p set flag = null, cleared_by = $2, shareable = ${SHAREABLE_SQL},
            body = case when $3::jsonb is null then p.body else p.body || $3::jsonb end,
            title = coalesce($3::jsonb->>'title', p.title)
     from runs r left join users u on u.id = r.user_id
     where p.id = $1 and r.id = p.run_id and ${OPEN_FLAG}
     returning p.run_id, p.user_id, p.shareable`,
    [playId, by, edits ? JSON.stringify(edits) : null],
  );
  if (!rows.length) return { ok: false, message: "That play is no longer waiting for a decision." };
  await settleRun(q, rows[0].run_id);
  await logAdminAction(q, { by, userId: rows[0].user_id, action: edits ? "flag_edited" : "flag_approved", detail: { playId, shareable: rows[0].shareable, fields: edits ? Object.keys(edits) : [] } });
  return { ok: true, message: rows[0].shareable ? "Cleared. It joins the pool at the next Cora run." : "Cleared. It stays out of the pool: the run or the member isn’t sharing." };
}

export const approvePlay = (q: Query, by: string, playId: string) => clear(q, by, playId, null);

/** Replaces the play's text fields (only the editable ones, trimmed) and approves it. */
export function editPlay(q: Query, by: string, playId: string, fields: Record<string, string>): Promise<Done> {
  const edits: Record<string, string> = {};
  for (const k of EDITABLE_FIELDS) if (typeof fields[k] === "string") edits[k] = fields[k].replace(/\r\n/g, "\n").trim();
  if (!edits.title) return Promise.resolve({ ok: false, message: "The title can’t be empty." });
  return clear(q, by, playId, edits);
}

export async function rejectPlay(q: Query, by: string, playId: string): Promise<Done> {
  const rows = await q<{ run_id: string; user_id: string | null }>(
    `update plays p set flag = p.flag || jsonb_build_object('rejected', true), cleared_by = $2, shareable = false
     where p.id = $1 and ${OPEN_FLAG} returning p.run_id, p.user_id`,
    [playId, by],
  );
  if (!rows.length) return { ok: false, message: "That play is no longer waiting for a decision." };
  await settleRun(q, rows[0].run_id);
  await logAdminAction(q, { by, userId: rows[0].user_id, action: "flag_rejected", detail: { playId } });
  return { ok: true, message: "Rejected. It never joins the pool." };
}
