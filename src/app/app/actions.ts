"use server";

import { refresh } from "next/cache";
import { requireUserForAction } from "@/lib/auth/access";
import { markSetUp } from "@/lib/app/week";
import { isRealDate } from "@/lib/clock";
import { query } from "@/lib/db-query";

/** "I set this up" (spec B.8 item 5): stores the mark at once for the user's own delivered pick. */
export async function setUpIdea(week: string, position: number): Promise<{ ok: boolean }> {
  const s = await requireUserForAction();
  if (!isRealDate(week) ||![1, 2, 3].includes(position)) return { ok: false };
  const ok = await markSetUp(query, s.userId, week, position);
  if (ok) refresh();
  return { ok };
}
