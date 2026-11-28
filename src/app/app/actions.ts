"use server";

import { refresh } from "next/cache";
import { requireUserForAction } from "@/lib/auth/access";
import { markSetUp } from "@/lib/app/week";
import { isRealDate } from "@/lib/clock";
import { query } from "@/lib/db-query";
import { deleteMemberNote, saveMemberNote } from "@/lib/feedback/feedback";
import { field } from "@/lib/form";
import { hit, limits } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";
import { featureOn } from "@/lib/v3-features";

/** "I set this up" (spec B.8 item 5): stores the mark at once for the user's own delivered pick. */
export async function setUpIdea(week: string, position: number): Promise<{ ok: boolean }> {
  const s = await requireUserForAction();
  if (!isRealDate(week) ||![1, 2, 3].includes(position)) return { ok: false };
  const ok = await markSetUp(query, s.userId, week, position);
  if (ok) refresh();
  return { ok };
}

/**
 * The member's weekly note (B3 plan Unit 5). Always the signed-in member's own
 * row: the user comes from the session, never from the form. The form's
 * textarea is controlled, so an error never wipes what was typed.
 */
/** `note` (on "saved") is the note as stored, normalised, so the form can show exactly what was saved. */
export type NoteState = { status: "idle" | "saved" | "deleted" | "error"; message?: string; note?: string; at?: number };

/** Saves the note. Refused while `v3.feedbackOn` (through featureOn) is off. Failed saves are rate-limited; a valid one never is. */
export async function saveWeekNoteAction(_prev: NoteState, fd: FormData): Promise<NoteState> {
  const s = await requireUserForAction();
  const typed = typeof fd.get("note") === "string" ? String(fd.get("note")).slice(0, 20_000) : "";
  if (!featureOn(await readV3Settings(), "feedbackOn")) return { status: "error", message: "Notes are switched off just now.", at: Date.now() };
  const r = await saveMemberNote(query, s.userId, field(fd, "week", 10), typed);
  if (!r.ok) {
    const allowed = await hit(`feedback:bad:${s.userId}`, limits.feedbackBadPerUser);
    return { status: "error", message: allowed ? r.message : "Too many tries. Wait a few minutes.", at: Date.now() };
  }
  refresh();
  return { status: "saved", message: r.message, note: r.note, at: Date.now() };
}

/**
 * Deletes the note. Allowed whatever the switch says: a member can always
 * remove what they wrote (like leaving the leaderboard).
 */
export async function deleteWeekNoteAction(_prev: NoteState, fd: FormData): Promise<NoteState> {
  const s = await requireUserForAction();
  const r = await deleteMemberNote(query, s.userId, field(fd, "week", 10));
  if (!r.ok) return { status: "error", message: r.message, at: Date.now() };
  refresh();
  return { status: "deleted", message: r.message, at: Date.now() };
}
