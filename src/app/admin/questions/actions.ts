"use server";

import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db-query";
import { getAmounts } from "@/lib/site/amounts";
import { baseline, textAt } from "@/lib/site/content/model";
import { CONTENT_TAG } from "@/lib/site/content/read";
import { publish, saveDraft } from "@/lib/site/content/store";
import { plainLine } from "@/lib/site/content/text";
import { questionFields, refusal } from "@/lib/site/questions";

/**
 * The one action of /admin/questions. Server actions are public endpoints,
 * so it checks the admin first, whatever page it was called from: only
 * someone the admin area lets in (an address in ADMIN_EMAILS, or the shared
 * password while that login still exists) can change a word.
 *
 * Until Pages replaces this screen (plan U5) it behaves as it always has, on
 * the new store (src/lib/site/content/store.ts): a save refuses what it
 * always refused, stores the wording in the site's draft, and publishes in
 * the same action, so a saved answer is live from the next page view. Reset
 * takes the question's two entries out and publishes that. The screen
 * publishes the whole draft, which until Pages exists holds nothing this
 * screen did not put there.
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

/** Two writes met at the same moment and this one gave way. Nothing of it is live. */
const BUSY = "Someone else changed the site’s words at the same moment, so this was not published. Save it again.";

export async function saveQuestionAction(_p: QuestionState, fd: FormData): Promise<QuestionState> {
  const by = await requireAdmin();
  // Longer than any limit, so a text that is too long is refused with its length, not cut short without a word.
  const values = { q: text(fd, "q", 4000), a: text(fd, "a", 20000) };
  const id = text(fd, "id", 80);
  const reset = text(fd, "reset", 5) === "yes";
  const error = (message: string): QuestionState => ({ status: "error", message, ...(reset ? {} : { values }), at: Date.now() });

  const fields = questionFields(id);
  if (!fields) return error("No such question.");

  let wording: { q: string | null; a: string | null } = { q: null, a: null };
  if (!reset) {
    const question = plainLine(values.q);
    const answer = plainLine(values.a);
    const amounts = await getAmounts();
    const bad = refusal("question", question, amounts) ?? refusal("answer", answer, amounts);
    if (bad) return error(bad);
    wording = { q: question, a: answer };
  }

  const saved = await saveDraft(query, [
    { field: fields.q, text: wording.q },
    { field: fields.a, text: wording.a },
  ]);
  if (!saved.ok) return error(saved.reason === "busy" ? BUSY : "That wording cannot be stored.");
  let published: Awaited<ReturnType<typeof publish>>;
  try {
    published = await publish(query, by, saved.content.draft, { note: { from: "questions", id, ...(reset ? { reset: true } : {}) } });
  } catch (failure) {
    // The statement that publishes may have landed before what failed (its log row is written after it).
    updateTag(CONTENT_TAG);
    throw failure;
  }
  if (!published.ok) return error(BUSY);

  // Expired after every save that got this far, not only when this call changed what is live: "nothing changed"
  // is also the answer when an earlier try published and then failed before it could expire anything, and the
  // pages would then keep the old wording for the cache's whole hour while this screen says "Saved".
  updateTag(CONTENT_TAG);
  refresh();
  const builtIn = wording.q === textAt(baseline, fields.q) && wording.a === textAt(baseline, fields.a);
  const message = reset
    ? "Reset. The site shows the built-in wording from the next page view."
    : builtIn
      ? "That is the built-in wording, so nothing is stored for this question."
      : "Saved. The site shows it from the next page view.";
  return { status: "ok", message, at: Date.now() };
}
