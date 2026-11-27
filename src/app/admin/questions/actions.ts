"use server";

import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db-query";
import { getAmounts } from "@/lib/site/amounts";
import { QUESTIONS_TAG, resetQuestion, saveQuestion } from "@/lib/site/questions";

/**
 * The two actions of /admin/questions. Server actions are public endpoints,
 * so each checks the admin first, whatever page it was called from: only
 * someone the admin area lets in (an address in ADMIN_EMAILS, or the shared
 * password while that login still exists) can change a word.
 *
 * `values` goes back to the form so it shows what was typed after a refused
 * save, and what was saved after a good one (React resets a form when its
 * action ends: docs/solutions/ui-bugs/react-19-form-action-reset-…).
 */
export type QuestionState = { status: "idle" | "ok" | "error"; message?: string; values?: { q: string; a: string }; at?: number };

const text = (fd: FormData, name: string, max: number) => {
  const v = fd.get(name);
  return typeof v === "string" ? v.slice(0, max) : "";
};

export async function saveQuestionAction(_p: QuestionState, fd: FormData): Promise<QuestionState> {
  const by = await requireAdmin();
  // Longer than any limit, so a text that is too long is refused with its length, not cut short without a word.
  const values = { q: text(fd, "q", 4000), a: text(fd, "a", 20000) };
  const id = text(fd, "id", 80);
  if (text(fd, "reset", 5) === "yes") {
    const r = await resetQuestion(query, by, id);
    if (r.ok) updateTag(QUESTIONS_TAG);
    refresh();
    return { status: r.ok ? "ok" : "error", message: r.message, at: Date.now() };
  }
  const r = await saveQuestion(query, by, { id, ...values }, await getAmounts());
  if (!r.ok) return { status: "error", message: r.message, values, at: Date.now() };
  updateTag(QUESTIONS_TAG);
  refresh();
  return { status: "ok", message: r.message, at: Date.now() };
}
