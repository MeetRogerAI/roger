"use client";

import { useActionState } from "react";
import { agreeGoal, type GoalState } from "@/app/getstarted/actions";

/** "That's my goal" for a signed-in visitor (spec B.11 item 3). Once pressed it stays pressed. */
export function GoalButton({ agreed }: { agreed: boolean }) {
  const [state, action, pending] = useActionState<GoalState>(agreeGoal, { status: "idle" });
  const done = agreed || state.status === "saved";
  return (
    <form action={action} className="mt-6">
      {done ? (
        <p role="status" className="text-small text-ink-2">
          That’s your goal. It’s ticked on your checklist.
        </p>
      ) : (
        <button type="submit" className="btn btn-m" disabled={pending}>
          {pending ? "Saving…" : "That’s my goal"}
        </button>
      )}
    </form>
  );
}
