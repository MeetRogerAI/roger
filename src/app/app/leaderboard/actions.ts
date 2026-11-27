"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserForAction } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { leaveLeaderboard } from "@/lib/growth/leaderboard";
import { joinAsMember } from "@/lib/growth/leaderboard-join";

/**
 * The leaderboard's two actions (B2 plan Unit 7). Each changes only the
 * signed-in member's own row. On success the page is refreshed so the form's
 * defaults are the saved name (docs/solutions/ui-bugs, React 19 form reset);
 * on an error the typed name comes back in the state.
 */
export type JoinState = { status: "idle" | "saved" | "error"; message?: string; name?: string; at?: number };

async function me(): Promise<string> {
  const s = await requireUserForAction();
  const [u] = await query<{ status: string }>(`select status from users where id = $1`, [s.userId]);
  if (!u || u.status === "signup") redirect("/start");
  return s.userId;
}

/** Join the board under a chosen name, or change the name while on it. Only while the leaderboard is switched on. */
export async function joinLeaderboardAction(_prev: JoinState, fd: FormData): Promise<JoinState> {
  const userId = await me();
  const typed = field(fd, "displayName", 200);
  const r = await joinAsMember(query, userId, typed);
  if (!r.ok) return { status: "error", name: typed, message: r.message, at: Date.now() };
  refresh();
  return { status: "saved", name: r.name, message: `You’re on the board as ${r.name}.`, at: Date.now() };
}

export type LeaveState = { status: "idle" | "left"; at?: number };

/** "Leave the board": always allowed, even with the leaderboard switched off. */
export async function leaveLeaderboardAction(): Promise<LeaveState> {
  const userId = await me();
  await leaveLeaderboard(query, userId);
  refresh();
  return { status: "left", at: Date.now() };
}
