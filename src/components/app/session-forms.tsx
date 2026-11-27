"use client";

import { useActionState, useEffect, useRef } from "react";
import { inviteGuestAction, resendInviteAction, type InviteState } from "@/app/app/sessions/actions";
import { clearExpectedResult, expectResult } from "@/components/result-status";

const input = "mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 text-small outline-none focus:border-ink aria-[invalid=true]:border-error";
const label = "block text-meta font-[600] text-ink-2";

export type FormWords = { guestName: string; guestEmail: string; send: string; sending: string; resend: string };

/** A message line that is always in the page, so a screen reader hears it when its text changes. */
function Msg({ s, id }: { s: InviteState; id: string }) {
  const show = s.status !== "idle" && !s.field ? s.message : "";
  return (
    <p id={id} role="status" className={`text-small ${s.status === "error" ? "text-error" : "text-ink"}`}>
      {show}
    </p>
  );
}

function Field({ id, name, type, labelText, value, error, focus, max }: { id: string; name: string; type: string; labelText: string; value: string; error?: string; focus: boolean; max: number }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <div>
      <label htmlFor={id} className={label}>
        {labelText}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        required
        maxLength={max}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={input}
      />
      {error && (
        <p id={`${id}-err`} className="mt-1 text-meta text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Invite one guest (B2 plan Unit 9). The fields are keyed on what they should
 * show, so React 19's form reset brings back what was typed after an error;
 * an error about one field is shown under it, which takes focus.
 */
export function InviteGuestForm({ words }: { words: FormWords }) {
  const [s, action, pending] = useActionState<InviteState, FormData>(inviteGuestAction, { status: "idle" });
  useEffect(() => {
    if (s.status === "error") clearExpectedResult();
  }, [s]);
  const v = s.status === "error" ? (s.values ?? { name: "", email: "" }) : { name: "", email: "" };
  const err = (f: "name" | "email") => (s.status === "error" && s.field === f ? s.message : undefined);
  return (
    <form action={action} onSubmit={expectResult} className="space-y-3">
      <div key={`${v.name}:${v.email}:${s.at ?? ""}`} className="grid gap-3 sm:grid-cols-2">
        <Field id="guest-name" name="name" type="text" labelText={words.guestName} value={v.name} error={err("name")} focus={Boolean(err("name"))} max={60} />
        <Field id="guest-email" name="email" type="email" labelText={words.guestEmail} value={v.email} error={err("email")} focus={Boolean(err("email"))} max={254} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-s">
          {pending ? words.sending : words.send}
        </button>
        <Msg s={s} id="invite-msg" />
      </div>
    </form>
  );
}

/** "Send it again", offered only when the invitation email failed or never started. */
export function ResendInviteButton({ words }: { words: FormWords }) {
  const [s, action, pending] = useActionState<InviteState>(resendInviteAction, { status: "idle" });
  useEffect(() => {
    if (s.status === "error") clearExpectedResult();
  }, [s]);
  return (
    <form action={action} onSubmit={expectResult} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending} className="btn btn-s">
        {pending ? words.sending : words.resend}
      </button>
      <Msg s={s} id="resend-msg" />
    </form>
  );
}
