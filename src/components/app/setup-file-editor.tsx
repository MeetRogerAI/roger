"use client";

import { useActionState } from "react";
import { saveSetupFile, type SetupFileState } from "@/app/admin/setup-file/actions";

const field = "mt-1.5 w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 py-2 text-small outline-none focus:border-ink";
const label = "block text-meta font-[600] text-ink-2";

/**
 * The Markdown editor and the required "What changed" note (spec B.11).
 * Starts from the text it is given (the latest version, or the one opened).
 * After a save the saved text stays; after an error what was typed stays.
 */
export function SetupFileEditor({ initial, startedFrom }: { initial: string; startedFrom: number | null }) {
  const [state, action, pending] = useActionState<SetupFileState, FormData>(saveSetupFile, { status: "idle" });
  const body = state.body ?? initial;
  const note = state.note ?? "";
  return (
    <form key={`${startedFrom ?? "new"}:${state.at ?? ""}:${state.status}`} action={action} className="space-y-4">
      <div>
        <label htmlFor="setup-body" className={label}>
          Setup file (Markdown){startedFrom ? `, starting from version ${startedFrom}` : ""}
        </label>
        <textarea id="setup-body" name="body" defaultValue={body} rows={24} spellCheck={false} className={`${field} font-mono`} />
      </div>
      <div>
        <label htmlFor="setup-note" className={label}>
          What changed (required)
        </label>
        <input id="setup-note" name="note" defaultValue={note} required maxLength={300} className={`${field} h-11`} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn btn-m btn-ink">
          {pending ? "Saving…" : "Save as new version"}
        </button>
        <p role={state.status === "error" ? "alert" : "status"} className={`text-small ${state.status === "error" ? "text-error" : "text-ink"}`}>
          {state.status === "idle" ? "" : (state.message ?? "")}
        </p>
      </div>
    </form>
  );
}
