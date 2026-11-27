"use client";

import { useActionState } from "react";
import { setAttendanceAction, type AttendanceState } from "@/app/admin/sessions/actions";

const idle: AttendanceState = { status: "idle" };

export type ToggleWords = { attended: string; markAttended: string; saving: string; forPerson: string };

/**
 * One person's attendance on /admin/sessions (B2 plan Unit 9): a toggle
 * button (aria-pressed) whose accessible name is its visible label plus the
 * person's name, and a message line that is always in the page.
 */
export function AttendanceToggle({ date, kind, id, attended, words }: { date: string; kind: "member" | "guest"; id: string; attended: boolean; words: ToggleWords }) {
  const [s, action, pending] = useActionState(setAttendanceAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="attended" value={attended ? "0" : "1"} />
      <button type="submit" disabled={pending} aria-pressed={attended} className={`btn btn-s min-h-11 ${attended ? "btn-ink" : ""}`}>
        {pending ? words.saving : attended ? words.attended : words.markAttended}
        <span className="sr-only">{words.forPerson}</span>
      </button>
      <span role="status" className={`text-meta ${s.status === "error" ? "text-error" : "text-ink-2"}`}>
        {s.status === "idle" ? "" : s.message}
      </span>
    </form>
  );
}
