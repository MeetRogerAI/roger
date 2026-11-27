import type { Query } from "@/lib/db-query";
import { checkLeaderboardName, isNameTaken, NAME_TAKEN } from "./leaderboard-name";
import { myStanding, standings } from "./points";

/**
 * The leaderboard (spec B.15 "Leaderboard", origin R12, B2 plan Unit 7).
 *
 * - Opt-in only: `users.leaderboard_opt_in_at` is set only by joining from the
 *   leaderboard (its page or /api/leaderboard). A display_name set in settings
 *   alone never puts anyone on the board, and no name is ever made from an email.
 * - Ranks are points.ts's rank rule over every member (opted in or not), read
 *   through myStanding, so a rank means the same on the board, in the private
 *   view, the API and the stats email. The board can therefore skip ranks.
 * - Counts only: the board shows how many picks of a member's plays were
 *   adopted and set up, never who adopted them.
 * - Names: leaderboard-name.ts. The unique index on users.leaderboard_name_key
 *   among opted-in members decides "taken"; the guarded write plus the
 *   unique-violation catch turn a clash, even a race, into a message.
 * - On the board means opted in AND holding a name key: a row opted in before
 *   the key existed is treated as off the board until the member joins again
 *   (joining always writes the key). Nothing is cleared to make that so.
 * - A closed or cancelled account leaves the board (a database trigger), so
 *   its name is free again.
 */

/** Account states that can never be on the board (SQL `status <> all($n)` and JS). */
export const OFF_BOARD_STATUSES = ["signup", "closed", "cancelled"] as const;
const offBoard = (status: string) => (OFF_BOARD_STATUSES as readonly string[]).includes(status);

export type RenameResult = { ok: true; name: string } | { ok: false; message: string; reason: "invalid" | "taken" | "account" | "not_on_board" };

/**
 * Sets the member's board name (and display_name) under the board's rules.
 * `join: true` also opts them in (keeping the first opt-in time on a rename);
 * `join: false` (the settings page) changes the name only while they are on
 * the board. Shared by joining and by settings so both write the same key.
 */
export async function renameOnBoard(q: Query, userId: string, raw: string, o: { join: boolean; now: Date }): Promise<RenameResult> {
  const c = checkLeaderboardName(raw);
  if (!c.ok) return { ok: false, message: c.message, reason: "invalid" };
  try {
    const rows = await q(
      `update users u set display_name = $2, leaderboard_name_key = $3,
         leaderboard_opt_in_at = case when $5::boolean then coalesce(u.leaderboard_opt_in_at, $4::timestamptz) else u.leaderboard_opt_in_at end
       where u.id = $1 and u.status <> all($6::text[]) and ($5::boolean or (u.leaderboard_opt_in_at is not null and u.leaderboard_name_key is not null))
         and not exists (select 1 from users o where o.id <> u.id and o.leaderboard_opt_in_at is not null and o.leaderboard_name_key = $3)
       returning u.id`,
      [userId, c.name, c.key, o.now.toISOString(), o.join, [...OFF_BOARD_STATUSES]],
    );
    if (rows.length) return { ok: true, name: c.name };
    const [u] = await q<{ status: string; on_board: boolean }>(`select status, (leaderboard_opt_in_at is not null and leaderboard_name_key is not null) as on_board from users where id = $1`, [userId]);
    if (!u || offBoard(u.status)) return { ok: false, message: "Your account can’t join the leaderboard.", reason: "account" };
    if (!o.join && !u.on_board) return { ok: false, message: "You’re not on the leaderboard.", reason: "not_on_board" };
    return { ok: false, message: NAME_TAKEN, reason: "taken" };
  } catch (e) {
    if (isNameTaken(e)) return { ok: false, message: NAME_TAKEN, reason: "taken" };
    throw e;
  }
}

/** Joins the board under `rawName`, or changes the name while on it. */
export function joinLeaderboard(q: Query, userId: string, rawName: string, now: Date): Promise<RenameResult> {
  return renameOnBoard(q, userId, rawName, { join: true, now });
}

/** Leaves the board. The display name is kept (it is also what Roger calls the member). */
export async function leaveLeaderboard(q: Query, userId: string): Promise<void> {
  await q(`update users set leaderboard_opt_in_at = null where id = $1`, [userId]);
}

/** One row of the board: a name, a rank and counts. Never who adopted anything. */
export type BoardRow = { rank: number; name: string; adopted: number; confirmed: number; total: number; isMe: boolean };

/** The member's own standing, structured (for the page, the API and agents). */
export type MyStanding = { points: number; adopted: number; confirmed: number; rank: number; optedIn: boolean; name: string };

export type Leaderboard = { me: MyStanding; board: BoardRow[]; members: number; meShown: boolean };

/** The most rows the board shows. The member's own standing is always shown separately. */
export const BOARD_LIMIT = 100;

/** The member's own standing alone (the API, and the page while the board is paused). */
export async function myBoardStanding(q: Query, userId: string): Promise<MyStanding> {
  const [all, [mine]] = await Promise.all([
    standings(q),
    q<{ display_name: string; opted: boolean }>(`select display_name, (leaderboard_opt_in_at is not null and leaderboard_name_key is not null) as opted from users where id = $1`, [userId]),
  ]);
  const s = myStanding(all, userId);
  return { points: s.total, adopted: s.adopted, confirmed: s.confirmed, rank: s.rank, optedIn: Boolean(mine?.opted), name: mine?.display_name ?? "" };
}

/**
 * The board and the member's own standing in one read. The board lists
 * opted-in members whose accounts can be on it, best first, including those
 * with no points yet (they share the rank after everyone with some).
 */
export async function leaderboardFor(q: Query, userId: string): Promise<Leaderboard> {
  const [all, opted, [mine]] = await Promise.all([
    standings(q),
    q<{ id: string; display_name: string }>(
      `select id, display_name from users where leaderboard_opt_in_at is not null and leaderboard_name_key is not null and status <> all($1::text[]) and display_name <> ''`,
      [[...OFF_BOARD_STATUSES]],
    ),
    q<{ display_name: string; opted: boolean }>(`select display_name, (leaderboard_opt_in_at is not null and leaderboard_name_key is not null) as opted from users where id = $1`, [userId]),
  ]);
  const byId = new Map(all.map((s) => [s.userId, s]));
  const board: BoardRow[] = opted
    .map((u) => ({ u, s: byId.get(u.id) ?? myStanding(all, u.id) }))
    .sort((a, b) => a.s.rank - b.s.rank || a.u.display_name.localeCompare(b.u.display_name) || a.u.id.localeCompare(b.u.id))
    .slice(0, BOARD_LIMIT)
    .map(({ u, s }) => ({ rank: s.rank, name: u.display_name, adopted: s.adopted, confirmed: s.confirmed, total: s.total, isMe: u.id === userId }));
  const s = myStanding(all, userId);
  return {
    me: { points: s.total, adopted: s.adopted, confirmed: s.confirmed, rank: s.rank, optedIn: Boolean(mine?.opted), name: mine?.display_name ?? "" },
    board,
    members: opted.length,
    meShown: board.some((r) => r.isMe),
  };
}

/** The member's leaderboard state for the admin user page. */
export async function leaderboardEntryOf(q: Query, userId: string): Promise<{ displayName: string; optedInAt: string | null } | null> {
  const [r] = await q<{ display_name: string; opted_in_at: string | null }>(
    `select display_name, case when leaderboard_name_key is not null then leaderboard_opt_in_at::text end as opted_in_at from users where id = $1`,
    [userId],
  );
  return r ? { displayName: r.display_name, optedInAt: r.opted_in_at } : null;
}
