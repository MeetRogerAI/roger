import type { Query } from "@/lib/db-query";
import type { AutoFixed, FixAction } from "@/lib/intake/auto-admit";
import { logAdminAction } from "./log";
import type { Done } from "./users";

/**
 * The flags log (spec B.6, B.12; read-only since 2026-11-27, Peter). Intake
 * no longer holds plays for a person: it admits what it fixed (drafted,
 * redacted, outline only) and drops harm. This page lists both, with the
 * reasons, so an admin can see what was done. An admitted play's text can
 * still be edited, and its pool play removed from the pool for good
 * (2026-11-28); a dropped play cannot be brought back from here.
 *
 * Plays held before auto-admit are admitted or dropped by the one-off
 * backfill (scripts/auto-admit-held.ts, `admitHeld` and `dropHeld` below),
 * which clear them as an admin's approval used to: `shareable` from the run
 * and the member, never from the flag alone (Unit 9 review). Once a run has
 * no open flags, it is marked accepted.
 */
export type LogEntry = {
  id: string;
  runId: string;
  who: string;
  weekOf: string;
  title: string;
  category: string;
  body: Record<string, unknown>;
  /** fixed: admitted after an automatic fix; dropped: kept out of the pool for harm. */
  kind: "fixed" | "dropped";
  actions: FixAction[];
  reasons: string[];
  fields: string[];
  shareable: boolean;
  /** In the pool and not removed from it. */
  inPool: boolean;
  /** The pool play it joined, if any (removed or not). */
  poolPlayId: string | null;
  /** An admin took its pool play out for good ("Remove from pool", 2026-11-28). */
  removed: boolean;
};

/** A flag still waiting for a decision (a rejected play keeps its flag, marked rejected). Only plays from before auto-admit. */
export const OPEN_FLAG = `(p.flag is not null and not coalesce((p.flag->>'rejected')::boolean, false))`;

/** Who clears a play when no person did. */
export const AUTO_BY = "roger (auto)";

/** The text fields an admin can edit, in the order the form shows them. */
export const EDITABLE_FIELDS = ["title", "job", "description", "heavy_use_for", "who_can_use_it", "best_trick", "working", "playbook_md", "install_notes"] as const;

const ACTIONS: FixAction[] = ["drafted", "redacted", "outline_only"];

/** What intake fixed or dropped, newest week first. */
export async function listAutoLog(q: Query, o: { limit?: number } = {}): Promise<LogEntry[]> {
  const rows = await q<{
    id: string;
    run_id: string;
    who: string;
    week_of: string;
    title: string;
    category: string;
    body: Record<string, unknown>;
    flag: { reasons?: string[]; fields?: string[] } | null;
    auto_fixed: Partial<AutoFixed> | null;
    shareable: boolean;
    pool_play_id: string | null;
    removed: boolean;
  }>(
    `select p.id, p.run_id, coalesce(u.email, 'seed: ' || sc.label) as who, to_char(p.week_of, 'YYYY-MM-DD') as week_of,
            p.title, p.category, p.body, p.flag, p.auto_fixed, p.shareable, p.pool_play_id, (pp.removed_at is not null) as removed
     from plays p left join users u on u.id = p.user_id left join seed_contributors sc on sc.id = p.contributor_id
       left join pool_plays pp on pp.id = p.pool_play_id
     where (p.flag is null and p.auto_fixed is not null) or coalesce((p.flag->>'auto')::boolean, false)
     order by p.week_of desc, p.run_id, p.set_, p.position
     limit $1`,
    [o.limit ?? 200],
  );
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return rows.map((r) => {
    const dropped = r.flag !== null;
    return {
      id: r.id,
      runId: r.run_id,
      who: r.who,
      weekOf: r.week_of,
      title: r.title,
      category: r.category,
      body: r.body ?? {},
      kind: dropped ? "dropped" : "fixed",
      actions: dropped ? [] : (list(r.auto_fixed?.actions).filter((a) => (ACTIONS as string[]).includes(a)) as FixAction[]),
      reasons: dropped ? list(r.flag?.reasons) : list(r.auto_fixed?.reasons),
      fields: dropped ? list(r.flag?.fields) : [],
      shareable: r.shareable,
      inPool: r.pool_play_id !== null && !r.removed,
      poolPlayId: r.pool_play_id,
      removed: r.removed,
    };
  });
}

/** Plays still held from before auto-admit, waiting for the backfill. */
export async function heldCount(q: Query): Promise<number> {
  const [r] = await q<{ n: number | string }>(`select count(*) as n from plays p where ${OPEN_FLAG}`);
  return Number(r?.n ?? 0);
}

/** Runs flagged as a whole (unreadable, or cut off for length): no plays, so an admin reads the run. */
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

/**
 * Replaces an admitted play's text fields (only the editable ones, trimmed).
 * A play in the pool takes the new text at the next Cora run, which rebuilds
 * each pool play from its plays. A dropped play cannot be edited.
 */
export async function editPlay(q: Query, by: string, playId: string, fields: Record<string, string>): Promise<Done> {
  const edits: Record<string, string> = {};
  for (const k of EDITABLE_FIELDS) if (typeof fields[k] === "string") edits[k] = fields[k].replace(/\r\n/g, "\n").trim();
  if (!edits.title) return { ok: false, message: "The title can’t be empty." };
  const rows = await q<{ user_id: string | null }>(
    `update plays p set body = p.body || $2::jsonb, title = $2::jsonb->>'title', cleared_by = $3
     where p.id = $1 and p.flag is null returning p.user_id`,
    [playId, JSON.stringify(edits), by],
  );
  if (!rows.length) return { ok: false, message: "That play can’t be edited: it was dropped, or it is gone." };
  await logAdminAction(q, { by, userId: rows[0].user_id, action: "play_edited", detail: { playId, fields: Object.keys(edits) } });
  return { ok: true, message: "Saved. A play in the pool shows the new text after the next Cora run." };
}

/**
 * Takes a pool play out for good (Peter, 2026-11-28: the undo for auto-admit).
 * removed_at is the durable mark, since the Cora job sets `active` again for
 * every play it scores: Cora never loads, scores, picks or reactivates a
 * removed play, and a new play that merges into it stays out with it
 * (src/lib/cora/context.ts loadPool, job.ts, merge.ts). It stops being the
 * public sample. Lists already picked keep it; nothing is recalled.
 */
export async function removeFromPool(q: Query, by: string, poolPlayId: string): Promise<Done> {
  const rows = await q<{ title: string }>(
    `update pool_plays set removed_at = now(), removed_by = $2, active = false, score = null, is_public_sample = false
     where id = $1 and removed_at is null returning title`,
    [poolPlayId, by],
  );
  if (!rows.length) {
    const [exists] = await q(`select 1 from pool_plays where id = $1`, [poolPlayId]);
    return { ok: false, message: exists ? "Already removed from the pool." : "No such play." };
  }
  const { title } = rows[0];
  await logAdminAction(q, { by, action: "remove_pool_play", detail: { poolPlayId, title } });
  return { ok: true, message: `Removed “${title}” from the pool. Cora won’t pick it again; lists already picked keep it.` };
}

/**
 * Admits a play held before auto-admit with its fixed text, as an admin's
 * approval used to. Only while it is still held at the revision that was
 * read, so a rerun or a replaced run changes nothing. True when it was admitted.
 */
export async function admitHeld(q: Query, playId: string, revision: number, fix: { title: string; body: Record<string, unknown>; autoFixed: AutoFixed | null }): Promise<boolean> {
  const rows = await q<{ run_id: string }>(
    `update plays p set flag = null, cleared_by = $3, shareable = ${SHAREABLE_SQL}, title = $4, body = $5::jsonb, auto_fixed = $6::jsonb
     from runs r left join users u on u.id = r.user_id
     where p.id = $1 and p.revision = $2 and r.id = p.run_id and ${OPEN_FLAG}
     returning p.run_id`,
    [playId, revision, AUTO_BY, fix.title, JSON.stringify(fix.body), fix.autoFixed ? JSON.stringify(fix.autoFixed) : null],
  );
  if (rows.length) await settleRun(q, rows[0].run_id);
  return rows.length > 0;
}

/** Drops a play held before auto-admit for harm: rejected and auto, never in the pool. True when it was dropped. */
export async function dropHeld(q: Query, playId: string, revision: number): Promise<boolean> {
  const rows = await q<{ run_id: string }>(
    `update plays p set flag = p.flag || jsonb_build_object('rejected', true, 'auto', true), cleared_by = $3, shareable = false
     where p.id = $1 and p.revision = $2 and ${OPEN_FLAG} returning p.run_id`,
    [playId, revision, AUTO_BY],
  );
  if (rows.length) await settleRun(q, rows[0].run_id);
  return rows.length > 0;
}
