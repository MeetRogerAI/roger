"use client";

import { useActionState } from "react";
import { openCardPage, type PlanState } from "@/app/start/billing-actions";

const idle: PlanState = { status: "idle" };

export function CardButton({ off }: { off: boolean }) {
  const [state, action, pending] = useActionState(openCardPage, idle);
  if (off) {
    return <p className="mt-8 text-ink-2">Card details open soon. Billing isn’t switched on yet.</p>;
  }
  return (
    <form action={action} className="mt-8">
      <button type="submit" className="btn btn-l" disabled={pending}>
        {pending ? "Opening…" : "Add card securely"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="mt-3 text-small text-error">
          {state.message}
        </p>
      )}
    </form>
  );
}
