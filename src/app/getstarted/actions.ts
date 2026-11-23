"use server";

import { refresh } from "next/cache";
import { noteOnboarding } from "@/lib/app/onboarding";
import { requireUserForAction } from "@/lib/auth/access";
import { query } from "@/lib/db-query";

export type GoalState = { status: "idle" | "saved" };

/** "That's my goal" (spec B.11 item 3): ticks the checklist for the signed-in user only. The goal itself is never measured. */
export async function agreeGoal(_prev: GoalState): Promise<GoalState> {
  const s = await requireUserForAction();
  await noteOnboarding(query, s.userId, "goal_at");
  refresh();
  return { status: "saved" };
}
