"use client";

import { useActionState } from "react";
import { changeEmailAction, saveProfileAction, type EmailState, type ProfileState, type ProfileValues } from "@/app/app/settings/actions";

const input = "mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 text-small outline-none focus:border-ink";
const label = "block text-meta font-[600] text-ink-2";

function Message({ ok, text }: { ok: boolean; text?: string }) {
  return (
    <p role={ok ? "status" : "alert"} aria-live={ok ? "polite" : "assertive"} className={`text-small ${ok ? "text-ink-2" : "text-error"}`}>
      {text ?? ""}
    </p>
  );
}

/** Name, display name, time zone and which emails to receive. */
export function ProfileForm({ values, zones, perRun }: { values: ProfileValues; zones: readonly string[]; perRun: boolean }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfileAction, { status: "idle" });
  // The saved values after a save, what was typed after an error, so a form reset never brings back old ones.
  const shown = state.values ?? values;
  const e = state.errors ?? {};
  const allZones = zones.includes(shown.timezone) ? zones : [shown.timezone, ...zones];
  return (
    <form key={`${JSON.stringify(shown)}:${state.at ?? ""}`} action={action} className="space-y-6">
      <div>
        <label htmlFor="s-name" className={label}>
          Name
        </label>
        <input id="s-name" name="name" defaultValue={shown.name} autoComplete="name" maxLength={200} aria-invalid={Boolean(e.name)} className={input} />
        {e.name && <p className="mt-1 text-small text-error">{e.name}</p>}
      </div>
      <div>
        <label htmlFor="s-display" className={label}>
          Display name (what Roger calls you)
        </label>
        <input id="s-display" name="displayName" defaultValue={shown.displayName} maxLength={200} aria-invalid={Boolean(e.displayName)} className={input} />
        {e.displayName && <p className="mt-1 text-small text-error">{e.displayName}</p>}
      </div>
      <div>
        <label htmlFor="s-tz" className={label}>
          Time zone
        </label>
        <select id="s-tz" name="timezone" defaultValue={shown.timezone} aria-invalid={Boolean(e.timezone)} className={input}>
          {allZones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {e.timezone && <p className="mt-1 text-small text-error">{e.timezone}</p>}
      </div>
      <fieldset>
        <legend className="text-title">Emails</legend>
        <div className="mt-3 space-y-3 text-small">
          <label className="flex gap-3">
            <input type="checkbox" name="pref_monday" defaultChecked={shown.prefs.monday} className="mt-1 size-4 accent-accent" />
            <span>
              The Monday email with your Cora Curation
              <span className="block text-ink-2">Switched off, your ideas still arrive on this site each Monday.</span>
            </span>
          </label>
          {perRun ? (
            <label className="flex gap-3">
              <input type="checkbox" name="pref_friday_prompt" defaultChecked={shown.prefs.friday_prompt} className="mt-1 size-4 accent-accent" />
              <span>The reminder to order next Monday’s Cora Curation</span>
            </label>
          ) : (
            <input type="hidden" name="pref_friday_prompt" value={shown.prefs.friday_prompt ? "on" : ""} />
          )}
          <p className="text-ink-2">Billing emails (receipts, charges, card problems) and security emails always go: they can’t be switched off.</p>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Message ok={state.status !== "error"} text={state.message} />
      </div>
    </form>
  );
}

/** A new address takes effect only once the current address approves it and the new address confirms it. */
export function EmailForm({ current, supportEmail }: { current: string; supportEmail: string }) {
  const [state, action, pending] = useActionState<EmailState, FormData>(changeEmailAction, { status: "idle" });
  return (
    <form key={`${state.status}:${state.message ?? ""}`} action={action} className="space-y-4">
      <p className="text-small">
        Your email address: <span className="font-semibold">{current}</span>
      </p>
      <div>
        <label htmlFor="s-email" className={label}>
          New email address
        </label>
        <input id="s-email" name="email" type="email" required autoComplete="email" defaultValue={state.email ?? ""} className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Sending…" : "Change my email address"}
        </button>
        <Message ok={state.status !== "error"} text={state.message} />
      </div>
      <p className="text-small text-ink-2">
        We email your current address to approve the change, then the new address to confirm it. Lost access to your old address?{" "}
        <a href={`mailto:${supportEmail}`} className="tlink">
          Write to us
        </a>
        .
      </p>
    </form>
  );
}
