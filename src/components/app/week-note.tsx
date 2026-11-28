"use client";

import { useActionState, useState } from "react";
import { deleteWeekNoteAction, saveWeekNoteAction, type NoteState } from "@/app/app/actions";
import { NOTE_MAX } from "@/lib/feedback/limits";

const idle: NoteState = { status: "idle" };

/**
 * The member's note on a list week (B3 plan Unit 5), under the ideas. Shown
 * only while `v3.feedbackOn` is on (the page decides). The textarea is
 * controlled, so React 19's form reset never brings back an older text
 * (docs/solutions/ui-bugs). After a save it holds the note as stored. The
 * saved note is shown as plain text only.
 */
export function WeekNote({ week, note }: { week: string; note: string | null }) {
  const [text, setText] = useState(note ?? "");
  // The note as last stored. After a save the box shows the stored (normalised) text, so Save is off until it changes.
  const [stored, setStored] = useState(note ?? "");
  const [saved, save, saving] = useActionState<NoteState, FormData>(async (p, fd) => {
    const r = await saveWeekNoteAction(p, fd);
    if (r.status === "saved" && typeof r.note === "string") {
      setText(r.note);
      setStored(r.note);
    }
    return r;
  }, idle);
  const [deleted, del, deleting] = useActionState<NoteState, FormData>(async (p, fd) => {
    const r = await deleteWeekNoteAction(p, fd);
    if (r.status === "deleted") {
      setText("");
      setStored("");
    }
    return r;
  }, idle);
  const busy = saving || deleting;
  const last = (deleted.at ?? 0) > (saved.at ?? 0) ? deleted : saved;
  const error = last.status === "error";
  return (
    <section aria-labelledby="week-note-h" className="rounded-[8px] border border-rule bg-surface p-6">
      <h2 id="week-note-h" className="text-title">
        A note for us
      </h2>
      <form action={save} className="mt-3 space-y-3">
        <input type="hidden" name="week" value={week} />
        <label htmlFor="week-note" className="block text-small text-ink-2">
          How were this week’s ideas? Only you and the Roger team see this. We read every note to make Roger better.
        </label>
        <textarea
          id="week-note"
          name="note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={NOTE_MAX}
          rows={4}
          aria-invalid={error}
          aria-describedby="week-note-msg"
          className="w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 py-2 text-small outline-none focus:border-ink"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !text.trim() || text === stored} className="btn btn-s">
            {saving ? "Saving…" : "Save note"}
          </button>
          <p id="week-note-msg" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} className={`text-small ${error ? "text-error" : "text-ink-2"}`}>
            {last.status !== "idle" ? (last.message ?? "") : ""}
          </p>
        </div>
      </form>
      {note !== null && (
        <form action={del} className="mt-2">
          <input type="hidden" name="week" value={week} />
          <button type="submit" disabled={busy} className="tlink inline-flex min-h-11 items-center text-small">
            {deleting ? "Deleting…" : "Delete note"}
          </button>
        </form>
      )}
    </section>
  );
}
