"use client";

import { useActionState, useId } from "react";
import { saveNotOpenLead, type StartFormState } from "@/app/start/actions";

const idle: StartFormState = { status: "idle" };

export function NotOpenForm({ utm }: { utm: string }) {
  const [state, action, pending] = useActionState(saveNotOpenLead, idle);
  const id = useId();

  if (state.status === "ok") {
    return (
      <p role="status" className="mt-8 text-title">
        Thanks. We’ll write once, when you can start.
      </p>
    );
  }

  const err = state.status === "error" ? state.message : undefined;
  return (
    <form action={action} className="relative mt-8 max-w-[30rem]" noValidate>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name="utm" value={utm} />
      <label htmlFor={`${id}-email`} className="block text-small font-[560]">
        Your email
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
          className="min-w-0 flex-1 rounded-[8px] border border-rule-strong bg-surface px-4 py-3 text-body"
        />
        <button type="submit" className="btn btn-m" disabled={pending}>
          {pending ? "Saving…" : "Tell me when it opens"}
        </button>
      </div>
      {err && (
        <p id={`${id}-err`} role="alert" className="mt-2 text-small text-error">
          {err}
        </p>
      )}
    </form>
  );
}
