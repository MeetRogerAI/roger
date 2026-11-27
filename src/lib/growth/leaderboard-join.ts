import type { Query } from "@/lib/db-query";
import { hit } from "@/lib/rate-limit";
import { featureOn } from "@/lib/v3-features";
import { readV3Settings } from "@/lib/v3-settings";
import { joinLeaderboard } from "./leaderboard";

export type JoinOutcome = { ok: true; name: string } | { ok: false; message: string; reason: "closed" | "limited" | "invalid" | "taken" | "account" | "not_on_board" };

export const JOIN_LIMIT = { limit: 20, windowSeconds: 24 * 60 * 60 };

/**
 * Joining as the signed-in member, the same from the page's action and from
 * /api/leaderboard: only while the leaderboard is switched on (read fresh,
 * not the display cache), rate-limited per member, then the board's name rules.
 */
export async function joinAsMember(q: Query, userId: string, rawName: string): Promise<JoinOutcome> {
  if (!featureOn(await readV3Settings(), "leaderboardOn")) return { ok: false, message: "The leaderboard isn’t open yet.", reason: "closed" };
  if (!(await hit(`leaderboard:join:${userId}`, JOIN_LIMIT))) return { ok: false, message: "Too many changes today. Try again tomorrow.", reason: "limited" };
  return joinLeaderboard(q, userId, rawName, new Date());
}
