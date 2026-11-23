import type { Query } from "@/lib/db-query";

/**
 * The admin action log (spec B.12, spec check 31). Every admin action, on a
 * user or not, writes one row here with who did it: the admin's email, or
 * "admin (password)" while the shared-password login still exists.
 *
 * Written after the action succeeds, with what it did in `detail`, so the
 * log never claims something that did not happen. Never put a secret (a
 * sign-in link, a key) in `detail`.
 */
export type LoggedAction = {
  id: number;
  adminEmail: string;
  userId: string | null;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export async function logAdminAction(
  q: Query,
  o: { by: string; userId?: string | null; action: string; detail?: Record<string, unknown> },
): Promise<number> {
  const [row] = await q<{ id: number | string }>(
    `insert into admin_actions (admin_email, user_id, action, detail) values ($1, $2, $3, $4::jsonb) returning id`,
    [o.by, o.userId ?? null, o.action, JSON.stringify(o.detail ?? {})],
  );
  return Number(row.id);
}

/**
 * Runs a long or risky admin action (a job run, a seed import) with its log
 * row written FIRST, marked "started", and completed in a finally with the
 * outcome or the error. A run cut off by the platform's time limit still
 * leaves its "started" row.
 */
export async function audited<T>(
  q: Query,
  o: { by: string; userId?: string | null; action: string; detail?: Record<string, unknown> },
  run: () => Promise<T>,
  describe: (r: T) => unknown = (r) => JSON.stringify(r)?.slice(0, 600),
): Promise<T> {
  const id = await logAdminAction(q, { ...o, detail: { ...o.detail, outcome: "started" } });
  let outcome: Record<string, unknown> = { outcome: "error", error: "did not finish" };
  try {
    const r = await run();
    outcome = { outcome: "done", result: describe(r) };
    return r;
  } catch (e) {
    outcome = { outcome: "error", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
    throw e;
  } finally {
    await q(`update admin_actions set detail = detail || $2::jsonb where id = $1`, [id, JSON.stringify(outcome)]).catch((e) =>
      console.error("[admin] log outcome", e instanceof Error ? e.message : e),
    );
  }
}

type Row = { id: number | string; admin_email: string; user_id: string | null; action: string; detail: Record<string, unknown>; created_at: string };

const toAction = (r: Row): LoggedAction => ({
  id: Number(r.id),
  adminEmail: r.admin_email,
  userId: r.user_id,
  action: r.action,
  detail: r.detail ?? {},
  createdAt: r.created_at,
});

/** The log for one user, newest first (the user page). */
export async function actionsForUser(q: Query, userId: string, limit = 100): Promise<LoggedAction[]> {
  const rows = await q<Row>(
    `select id, admin_email, user_id, action, detail, created_at::text from admin_actions where user_id = $1 order by created_at desc, id desc limit $2`,
    [userId, limit],
  );
  return rows.map(toAction);
}

/** The whole log, newest first (the Cora page shows the latest runs of each button). */
export async function recentActions(q: Query, o: { actions?: string[]; limit?: number } = {}): Promise<LoggedAction[]> {
  const rows = await q<Row>(
    `select id, admin_email, user_id, action, detail, created_at::text from admin_actions
     where ($1::text[] is null or action = any($1::text[])) order by created_at desc, id desc limit $2`,
    [o.actions ?? null, o.limit ?? 50],
  );
  return rows.map(toAction);
}
