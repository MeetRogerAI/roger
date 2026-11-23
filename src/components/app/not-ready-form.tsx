"use client";

import { useActionState, useId } from "react";
import { saveNotReadyLead, type StartFormState } from "@/app/start/actions";
import { Honeypot } from "./honeypot";

const idle: StartFormState = { status: "idle" };

export function NotReadyForm() {
  const [state, action, pending] = useActionState(saveNotReadyLead, idle);
  const id = useId();
  if (state.status === "ok") {
    return (
      <p role="status" className="mt-4 text-title">
        Thanks. We’ll check in later.
      </p>
    );
  }
  const err = state.status === "error" ? state.message : undefined;
  return (
    <form action={action} className="relative mt-4 max-w-[30rem]" noValidate>
      <Honeypot />
      <label htmlFor={`${id}-email`} className="block text-small font-[560]">
        Your email
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
          className="min-w-0 flex-1 rounded-[8px] border border-rule-strong bg-surface px-4 py-3 text-body"
        />
        <button type="submit" className="btn btn-m btn-light" disabled={pending}>
          {pending ? "Saving…" : "Check in later"}
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
