"use client";

import { useActionState } from "react";
import { saveQuestionAction, type QuestionState } from "./actions";

/**
 * One question of /admin/questions: its wording and its answer, each in a
 * field, with Save, and Reset when it has been edited.
 *
 * The fields show what was typed after a refused save and what is stored
 * otherwise, and are keyed by that text, so the reset React gives a form when
 * its action ends lands on the right words.
 */
export type EditableQuestion = {
  id: string;
  /** Where it is shown: "Homepage", "/faq". */
  pages: string[];
  /** The wording in force: the admin's edit, or the built-in text. Amounts are still names in braces. */
  q: string;
  a: string;
  builtIn: { q: string; a: string };
  edited: boolean;
};

const idle: QuestionState = { status: "idle" };
const label = "block text-meta font-[600] text-ink-2";
const field = "mt-1.5 w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 py-2 text-small outline-none focus:border-ink";

export function QuestionEditor({ item, questionMax, answerMax }: { item: EditableQuestion; questionMax: number; answerMax: number }) {
  const [state, action, pending] = useActionState(saveQuestionAction, idle);
  const shown = state.status === "error" && state.values ? state.values : { q: item.q, a: item.a };
  return (
    <li data-question={item.id} className="rounded-[8px] border border-rule bg-surface p-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-2">
        <span>Shown on: {item.pages.join(", ")}</span>
        {item.edited ? (
          <span data-edited className="rounded-full border border-accent px-2 py-0.5 text-accent">
            Edited
          </span>
        ) : (
          <span className="rounded-full border border-rule px-2 py-0.5">Built-in wording</span>
        )}
      </p>
      <form action={action} key={`${shown.q}\n${shown.a}:${state.at ?? ""}`} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={item.id} />
        <div>
          <label className={label} htmlFor={`q-${item.id}`}>
            Question (at most {questionMax} characters)
          </label>
          <input id={`q-${item.id}`} name="q" defaultValue={shown.q} required className={`${field} h-11`} />
        </div>
        <div>
          <label className={label} htmlFor={`a-${item.id}`}>
            Answer (plain text, at most {answerMax} characters)
          </label>
          <textarea id={`a-${item.id}`} name="a" defaultValue={shown.a} required rows={5} className={field} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn btn-m btn-ink">
            {pending ? "Saving…" : "Save"}
          </button>
          {item.edited && (
            <button type="submit" name="reset" value="yes" disabled={pending} formNoValidate className="min-h-10 rounded-full border border-rule-strong px-4 text-small text-ink-2 hover:text-ink">
              Reset to the built-in wording
            </button>
          )}
          {state.status !== "idle" && state.message && (
            <p role={state.status === "error" ? "alert" : "status"} data-message={state.status} className={`text-small ${state.status === "error" ? "text-error" : "text-ink"}`}>
              {state.message}
            </p>
          )}
        </div>
      </form>
      {item.edited && (
        <details className="mt-4 text-small text-ink-2">
          <summary className="cursor-pointer">The built-in wording</summary>
          <p className="mt-2 font-[600]">{item.builtIn.q}</p>
          <p className="mt-1">{item.builtIn.a}</p>
        </details>
      )}
    </li>
  );
}
