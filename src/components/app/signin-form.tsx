"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { requestLinkAction, type SignInState } from "@/app/signin/actions";

const idle: SignInState = { status: "idle" };
const RESEND_SECONDS = 30;

/** Email-link sign-in (spec B.3), with "send it again" after 30 seconds. */
export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(requestLinkAction, idle);
  const [sends, setSends] = useState(0);
  const id = useId();

  if (state.status === "sent") {
    return (
      <div role="status" className="mt-8">
        <h2 className="text-title">Check your email.</h2>
        <p className="mt-3 text-ink-2">
          If there’s a Roger account for <strong className="font-[600] text-ink">{state.email}</strong>, a sign-in link is on its way. It
          works once, for the next 15 minutes.
        </p>
        <form action={action} onSubmit={() => setSends((n) => n + 1)} className="mt-6">
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="next" value={next} />
          <ResendButton key={sends} pending={pending} />
        </form>
      </div>
    );
  }

  const err = state.status === "error" ? state.message : undefined;
  return (
    <form action={action} className="mt-8 max-w-[30rem]" noValidate>
      <input type="hidden" name="next" value={next} />
      <label htmlFor={`${id}-email`} className="block text-small font-[560]">
        Your email
      </label>
      <input
        id={`${id}-email`}
        name="email"
        type="email"
        autoComplete="email"
        required
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${id}-err` : undefined}
        className="mt-2 w-full rounded-[8px] border border-rule-strong bg-surface px-4 py-3 text-body"
      />
      {err && (
        <p id={`${id}-err`} role="alert" className="mt-2 text-small text-error">
          {err}
        </p>
      )}
      <button type="submit" className="btn btn-m mt-5" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}

/** Counts down from 30 seconds each time it mounts (a new key after every send). */
function ResendButton({ pending }: { pending: boolean }) {
  const [wait, setWait] = useState(RESEND_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <button type="submit" className="btn btn-m btn-light" disabled={wait > 0 || pending}>
      {wait > 0 ? `Send it again in ${wait} s` : pending ? "Sending…" : "Send it again"}
    </button>
  );
}
