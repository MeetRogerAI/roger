"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { startGoogleSignup, submitAccount, type StartFormState } from "@/app/start/actions";
import { Honeypot } from "./honeypot";

const idle: StartFormState = { status: "idle" };
const field = "mt-2 w-full rounded-[8px] border border-rule-strong bg-surface px-4 py-3 text-body";

/**
 * Sign-up step 2. `knownEmail`: the address this browser already typed into Roger, if any.
 * `google`: whether "Continue with Google" is offered (only while Google's keys are set, plan Unit 18).
 */
export function AccountForm({ google = false, knownEmail = null }: { google?: boolean; knownEmail?: string | null }) {
  const [state, action, pending] = useActionState(submitAccount, idle);
  const id = useId();
  const e = state.errors ?? {};
  // A known address is shown, not asked for; "Change" brings the box back.
  const [changing, setChanging] = useState(false);

  if (state.status === "ok") {
    return (
      <div role="status" className="mt-10">
        <h2 className="text-title">Check your email.</h2>
        <p className="mt-3 max-w-[40rem] text-ink-2">
          We sent a link to <strong className="font-[600] text-ink">{state.email}</strong>. Open it on this device to confirm your address
          and confirm your plan. It works for 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      // Submitted by hand so React doesn't clear what was typed when something is missing.
      onSubmit={(ev) => {
        if ((ev.nativeEvent as SubmitEvent).submitter?.hasAttribute("formaction")) return;
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => action(fd));
      }}
      className="relative mt-10 max-w-[30rem] space-y-6"
      noValidate
    >
      <Honeypot />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField id={`${id}-first`} name="firstName" label="First name" autoComplete="given-name" error={e.firstName} />
        <TextField id={`${id}-last`} name="lastName" label="Last name" autoComplete="family-name" error={e.lastName} />
      </div>
      {knownEmail && !changing ? (
        <p className="text-small text-ink-2">
          <input type="hidden" name="email" value={knownEmail} />
          We’ll send the link to <strong className="font-[600] text-ink">{knownEmail}</strong>.{" "}
          <button type="button" onClick={() => setChanging(true)} className="underline underline-offset-2 hover:text-ink">
            Change
          </button>
        </p>
      ) : (
        <TextField id={`${id}-email`} name="email" label="Your email" type="email" autoComplete="email" error={e.email} defaultValue={knownEmail ?? undefined} />
      )}
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

function TextField({ id, name, label, type = "text", autoComplete, error, defaultValue }: { id: string; name: string; label: string; type?: string; autoComplete: string; error?: string; defaultValue?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-small font-[560]">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        maxLength={type === "email" ? 254 : 40}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`${field} ${error ? "border-error" : ""}`}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-2 text-small text-error">
          {error}
        </p>
      )}
    </div>
  );
}
