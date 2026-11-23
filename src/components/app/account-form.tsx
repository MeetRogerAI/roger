"use client";

import { useActionState, useId } from "react";
import { startGoogleSignup, submitAccount, type StartFormState } from "@/app/start/actions";
import { Honeypot } from "./honeypot";

const idle: StartFormState = { status: "idle" };
const field = "mt-2 w-full rounded-[8px] border border-rule-strong bg-surface px-4 py-3 text-body";

/** `google`: whether "Continue with Google" is offered (only while Google's keys are set, plan Unit 18). */
export function AccountForm({ google = false }: { google?: boolean }) {
  const [state, action, pending] = useActionState(submitAccount, idle);
  const id = useId();
  const e = state.errors ?? {};

  if (state.status === "ok") {
    return (
      <div role="status" className="mt-10">
        <h2 className="text-title">Check your email.</h2>
        <p className="mt-3 max-w-[40rem] text-ink-2">
          We sent a link to <strong className="font-[600] text-ink">{state.email}</strong>. Open it on this device to confirm your address
          and choose your plan. It works for 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="relative mt-10 max-w-[30rem] space-y-6" noValidate>
      <Honeypot />
      <div>
        <label htmlFor={`${id}-name`} className="block text-small font-[560]">
          Your name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          autoComplete="name"
          maxLength={80}
          aria-invalid={e.name ? true : undefined}
          aria-describedby={e.name ? `${id}-name-err` : undefined}
          className={field}
        />
        {e.name && (
          <p id={`${id}-name-err`} role="alert" className="mt-2 text-small text-error">
            {e.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="block text-small font-[560]">
          Your email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={e.email ? true : undefined}
          aria-describedby={e.email ? `${id}-email-err` : undefined}
          className={field}
        />
        {e.email && (
          <p id={`${id}-email-err`} role="alert" className="mt-2 text-small text-error">
            {e.email}
          </p>
        )}
      </div>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-small text-error">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-l" disabled={pending}>
        {pending ? "Sending…" : "Email me a link"}
      </button>
      {google && (
        <div className="border-t border-rule pt-6">
          <p className="text-small text-ink-2">Or use your Google account. Its email address becomes your Roger address.</p>
          <button type="submit" formAction={startGoogleSignup} formNoValidate className="btn btn-m mt-3" disabled={pending}>
            Continue with Google
          </button>
        </div>
      )}
    </form>
  );
}
