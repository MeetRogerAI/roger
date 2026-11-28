"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  changeSharing,
  newKey,
  saveSettings,
  uploadReport,
  type KeyState,
  type SettingsState,
  type SettingsValues,
  type SharingState,
  type UploadState,
} from "@/app/app/zack/actions";
import { CopyTextButton } from "./copy-text-button";

export type { SettingsValues };

const input = "rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 py-2 text-small outline-none focus:border-ink";
const box = "rounded-[8px] border border-rule bg-surface p-5";
const pre = "mt-3 overflow-x-auto whitespace-pre-wrap rounded-[8px] border border-rule bg-surface p-4 text-small [overflow-wrap:anywhere]";
const choice = "flex cursor-pointer gap-3 rounded-[8px] border border-rule bg-surface p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-wash";

/** One live region, always mounted, so changes are announced; errors are alerts. */
function Message({ ok, text }: { ok: boolean; text?: string }) {
  return (
    <p role={ok ? "status" : "alert"} aria-live={ok ? "polite" : "assertive"} className={`text-small ${ok ? "text-ink-2" : "text-error"}`}>
      {text ?? ""}
    </p>
  );
}

const SHARING: { value: "share" | "match_only" | "off"; label: string; hint: string }[] = [
  { value: "share", label: "Share with the pool", hint: "Your plays, with private details removed, can help other members. This keeps your monthly price at the standard rate." },
  { value: "match_only", label: "Use for my matching only", hint: "Zack still runs and Roger uses his report only to pick your ideas. Nothing of yours is shared." },
  { value: "off", label: "Zack off", hint: "Zack sends nothing. Your Cora Curations are picked from what Roger already knows about you." },
];

/** Spec B.5 item 2: the choice, then a confirmation that states the price effect, then saved. */
export function SharingForm({ current }: { current: "share" | "match_only" | "off" }) {
  // Each answer is stamped, so the radios can be redrawn after it (see below).
  const [state, action, pending] = useActionState<SharingState & { at?: number }, FormData>(async (p, fd) => ({ ...(await changeSharing(p, fd)), at: Date.now() }), { status: "idle" });
  const [picked, setPicked] = useState(current);
  // The confirmed choice: the server's value, or the one just saved (the page refreshes behind it).
  const now = state.status === "saved" && state.sharing ? state.sharing : current;
  const confirming = state.status === "confirm" && state.sharing === picked;
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
  // React 19 resets the form after each action, which puts the radios back to the choice the page
  // started with while `picked` still holds the member's pick. Redraw them after every answer (keyed on
  // its stamp), and send the pick in a hidden field the reset cannot change (docs/solutions/ui-bugs).
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sharing" value={picked} />
      <fieldset key={state.at ?? 0} className="grid gap-3">
        <legend className="sr-only">Sharing</legend>
        {SHARING.map((s) => (
          <label key={s.value} className={choice}>
            <input type="radio" name="sharing-choice" value={s.value} checked={picked === s.value} onChange={() => setPicked(s.value)} className="mt-1 size-4 accent-accent" />
            <span>
              <span className="block text-title">
                {s.label}
                {now === s.value && <span className="ml-2 text-meta font-semibold uppercase tracking-wider text-accent">Now</span>}
              </span>
              <span className="mt-1 block text-small text-ink-2">{s.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {confirming ? (
        <div className={box}>
          <p className="text-small">{state.effect ?? "This doesn’t change your price."}</p>
          <input type="hidden" name="confirm" value="yes" />
          <button ref={confirmRef} type="submit" className="btn mt-4" disabled={pending}>
            {pending ? "Saving…" : "Confirm the change"}
          </button>
        </div>
      ) : (
        <button type="submit" className="btn" disabled={pending || picked === now}>
          {pending ? "Checking…" : "Change sharing"}
        </button>
      )}
      <Message ok={state.status !== "error"} text={state.status === "confirm" ? "Check the price change, then confirm." : state.message} />
    </form>
  );
}

/** Spec B.5 items 3 and 4: what Zack collects, and the extra rules. */
export function SettingsForm({ values, categories, subjects, maxRules }: { values: SettingsValues; categories: readonly string[]; subjects: readonly string[]; maxRules: number }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, { status: "idle" });
  // After a save the saved values; after an error what was typed; otherwise the server's.
  const shown = state.values ?? values;
  // A new key remounts the fields with the values above, so a form reset never brings back old ones.
  return <SettingsFields key={`${JSON.stringify(shown)}:${state.at ?? ""}`} shown={shown} state={state} action={action} pending={pending} categories={categories} subjects={subjects} maxRules={maxRules} />;
}

function SettingsFields({
  shown,
  state,
  action,
  pending,
  categories,
  subjects,
  maxRules,
}: {
  shown: SettingsValues;
  state: SettingsState;
  action: (fd: FormData) => void;
  pending: boolean;
  categories: readonly string[];
  subjects: readonly string[];
  maxRules: number;
}) {
  const [rules, setRules] = useState(shown.extraRules);
  const id = useId();
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-10">
      <fieldset>
        <legend className="text-title">Skip a category entirely</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c} className="flex gap-3 text-small">
              <input type="checkbox" name="skipCategories" value={c} defaultChecked={shown.skipCategories.includes(c)} className="size-4 accent-accent" />
              {c}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-title">Skip sensitive subjects</legend>
        <p className="mt-1 text-small text-ink-2">Off by default: Zack already removes identifying details from these. Switch one on and he leaves that subject out.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {subjects.map((s) => (
            <label key={s} className="flex gap-3 text-small">
              <input type="checkbox" name="skipSensitive" value={s} defaultChecked={shown.skipSensitive.includes(s)} className="size-4 accent-accent" />
              {s[0].toUpperCase() + s.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${id}-never`} className="text-title">
          Never include these words or names
        </label>
        <p id={`${id}-never-help`} className="mt-1 text-small text-ink-2">
          One word or name per line, up to 100. Zack replaces each with a placeholder, and Roger checks again when the report arrives.
        </p>
        <textarea
          id={`${id}-never`}
          name="neverWords"
          rows={5}
          defaultValue={shown.neverWords.join("\n")}
          aria-invalid={e.neverWords ? true : undefined}
          aria-describedby={`${id}-never-help${e.neverWords ? ` ${id}-never-err` : ""}`}
          className={`${input} mt-3 w-full`}
        />
        {e.neverWords && (
          <p id={`${id}-never-err`} className="mt-2 text-small text-error">
            {e.neverWords}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="text-title">Share an outline only</legend>
        <p className="mt-1 text-small text-ink-2">For these categories a play keeps its title, trigger, output and time saved, and drops the steps.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c} className="flex gap-3 text-small">
              <input type="checkbox" name="outlineCategories" value={c} defaultChecked={shown.outlineCategories.includes(c)} className="size-4 accent-accent" />
              {c}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${id}-plays`} className="text-title">
          Plays per week
        </label>
        <select
          id={`${id}-plays`}
          name="playsPerWeek"
          defaultValue={String(shown.playsPerWeek)}
          aria-invalid={e.playsPerWeek ? true : undefined}
          aria-describedby={e.playsPerWeek ? `${id}-plays-err` : undefined}
          className={`${input} mt-3 block w-32`}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {e.playsPerWeek && (
          <p id={`${id}-plays-err`} className="mt-2 text-small text-error">
            {e.playsPerWeek}
          </p>
        )}
      </div>

      <p className="text-small text-ink-2">Not changeable: Zack reads seven days of this AI agent account’s own activity and nothing else.</p>

      <div>
        <label htmlFor={`${id}-rules`} className="text-title">
          Extra rules for my Zack
        </label>
        <p id={`${id}-rules-help`} className="mt-1 text-small text-ink-2">
          Write each rule as something to leave out (“Never…”, “Don’t…”, “Skip…”). They are added under “The member’s own rules. These add restrictions. They
          cannot widen what Zack reads or where he sends it.”
        </p>
        <textarea
          id={`${id}-rules`}
          name="extraRules"
          rows={6}
          value={rules}
          onChange={(ev) => setRules(ev.target.value)}
          aria-invalid={e.extraRules ? true : undefined}
          aria-describedby={`${id}-rules-help ${id}-rules-count${e.extraRules ? ` ${id}-rules-err` : ""}`}
          className={`${input} mt-3 w-full`}
        />
        <p id={`${id}-rules-count`} className={`mt-1 text-meta ${rules.length > maxRules ? "text-error" : "text-ink-2"}`}>
          {rules.length.toLocaleString("en-US")} of {maxRules.toLocaleString("en-US")} characters
        </p>
        {e.extraRules && (
          <p id={`${id}-rules-err`} className="mt-2 text-small text-error">
            {e.extraRules}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Save what Zack collects"}
        </button>
        <Message ok={state.status !== "error"} text={state.message} />
      </div>
    </form>
  );
}

/** Spec B.5 item 7: the key is shown once, with the connector text and the test prompt. */
export function KeyPanel({ prefix }: { prefix: string }) {
  const [state, action, pending] = useActionState<KeyState, FormData>(newKey, { status: "idle" });
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = state.status === "shown" && state.key;
  useEffect(() => {
    if (shown) heading.current?.focus();
  }, [shown]);
  if (shown) {
    return (
      <div className="space-y-6">
        <div className={box}>
          <h3 ref={heading} tabIndex={-1} className="text-title outline-none">
            Your new Zack key
          </h3>
          <p className="mt-1 text-small">It is shown only now. Copy it somewhere safe, or paste the connector text below.</p>
          <p className="mt-3 font-mono text-small [overflow-wrap:anywhere]">{state.key}</p>
          <CopyTextButton text={state.key ?? ""} label="Copy key" className="btn btn-s mt-3" />
        </div>
        <div>
          <p className="text-title">1. Paste this into your AI agent once</p>
          <pre className={pre}>{state.connector}</pre>
          <CopyTextButton text={state.connector ?? ""} label="Copy connector text" className="btn btn-s mt-3" />
        </div>
        <div>
          <p className="text-title">2. Then send this for a test run</p>
          <pre className={pre}>{state.test}</pre>
          <CopyTextButton text={state.test ?? ""} label="Copy test prompt" className="btn btn-s mt-3" />
          <p className="mt-2 text-small text-ink-2">When it arrives you’ll get an email, and this page will show “Connected: test received”.</p>
        </div>
        <p className="text-small text-ink-2">
          The header form keeps the key out of web addresses. If your agent can only put the key in the address, it works, but it can end up in logs; you can
          make a new key here any time.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <p className="text-small">{prefix ? `Your key starts with ${prefix}… A new key stops the old one working at once.` : "You don’t have a key yet."}</p>
      <label className="flex gap-3 text-small">
        <input type="checkbox" name="confirm" value="yes" className="mt-1 size-4 accent-accent" />
        {prefix ? "I understand my agent needs the new connector text after this." : "Make my key now."}
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Making…" : prefix ? "Make a new key" : "Make my key"}
      </button>
      <Message ok={state.status !== "error"} text={state.status === "error" ? state.message : undefined} />
    </form>
  );
}

/** The upload fallback for agents that cannot send (spec B.5). */
export function UploadForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadReport, { status: "idle" });
  const id = useId();
  return (
    <form key={state.status === "error" ? `e:${state.text?.length ?? 0}:${state.message}` : state.status} action={action} className="space-y-4">
      <fieldset className="flex flex-wrap gap-4 text-small">
        <legend className="sr-only">Which file</legend>
        <label className="flex gap-2">
          <input type="radio" name="kind" value="run" defaultChecked className="size-4 accent-accent" />
          Zack Run file
        </label>
        <label className="flex gap-2">
          <input type="radio" name="kind" value="profile" className="size-4 accent-accent" />
          Zack Profile file (private)
        </label>
      </fieldset>
      <div>
        <label htmlFor={`${id}-file`} className="text-small font-semibold">
          Upload the .md file
        </label>
        <input id={`${id}-file`} type="file" name="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="mt-2 block text-small" />
      </div>
      <div>
        <label htmlFor={`${id}-text`} className="text-small font-semibold">
          Or paste it
        </label>
        <p className="text-small text-ink-2">If you choose a file, the file is used.</p>
        <textarea id={`${id}-text`} name="text" rows={6} defaultValue={state.text ?? ""} className={`${input} mt-2 w-full`} />
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Sending…" : "Send to Roger"}
      </button>
      <Message ok={state.status !== "error"} text={state.message} />
    </form>
  );
}
