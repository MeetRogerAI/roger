"use client";

import { useActionState } from "react";
import { cancelAction, switchAction, undoCancelAction, updateCardAction, type BillingState } from "@/app/app/billing/actions";

const idle: BillingState = { status: "idle" };

function Message({ state }: { state: BillingState }) {
  const ok = state.status !== "error";
  return (
    <p role={ok ? "status" : "alert"} aria-live={ok ? "polite" : "assertive"} className={`mt-2 text-small ${ok ? "text-ink-2" : "text-error"}`}>
      {state.message ?? ""}
    </p>
  );
}

/** "Update card": opens Stripe's own card page. */
export function UpdateCardButton() {
  const [state, action, pending] = useActionState(updateCardAction, idle);
  return (
    <form action={action}>
      <button type="submit" className="btn btn-s" disabled={pending}>
        {pending ? "Opening…" : "Update card"}
      </button>
      <Message state={state} />
    </form>
  );
}

/**
 * Switch plan in one click (spec B.9): the effect is shown beside the button
 * before it is pressed, so the click itself saves.
 */
export function SwitchForm({ to, effect, allowed, why }: { to: "monthly" | "per_run"; effect: string; allowed: boolean; why?: string }) {
  const [state, action, pending] = useActionState(switchAction, idle);
  const label = to === "monthly" ? "Switch to monthly" : "Switch to one list at a time";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="to" value={to} />
      <p className="text-small text-ink-2">{effect}</p>
      {allowed ? (
        <button type="submit" className="btn btn-s" disabled={pending}>
          {pending ? "Saving…" : label}
        </button>
      ) : (
        <p className="text-small text-ink-2">{why}</p>
      )}
      <Message state={state} />
    </form>
  );
}

/**
 * Cancel in one click with one optional question and no retention screen
 * (spec B.9, check 27). Under the button, one plain link to switch instead.
 */
export function CancelForm({ label, switchLink }: { label: string; switchLink: boolean }) {
  const [state, action, pending] = useActionState(cancelAction, idle);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="cancel-reason" className="block text-meta font-[600] text-ink-2">
          Why are you leaving? (optional)
        </label>
        <textarea
          id="cancel-reason"
          name="reason"
          rows={2}
          maxLength={1000}
          className="mt-1.5 w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 py-2 text-small outline-none focus:border-ink"
        />
      </div>
      <button type="submit" className="btn btn-s" disabled={pending}>
        {pending ? "Cancelling…" : label}
      </button>
      {switchLink && (
        <p className="text-small">
          <a href="#switch" className="tlink">
            Or switch to one list at a time.
          </a>
        </p>
      )}
      <Message state={state} />
    </form>
  );
}

/** Takes back a cancellation before the paid month ends. */
export function UndoForm({ until }: { until: string }) {
  const [state, action, pending] = useActionState(undoCancelAction, idle);
  return (
    <form action={action} className="space-y-2">
      <p className="text-small text-ink-2">Changed your mind? Until {until} you can keep your plan as it was.</p>
      <button type="submit" className="btn btn-s" disabled={pending}>
        {pending ? "Saving…" : "Undo the cancellation"}
      </button>
      <Message state={state} />
    </form>
  );
}
