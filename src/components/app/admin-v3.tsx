"use client";

import { useActionState, useState } from "react";
import {
  addRunAction,
  changeEmailAction,
  chargeAndSendAction,
  chooseSampleAction,
  clearDisplayNameAction,
  closeAccountAction,
  closeFailedOrdersAction,
  deleteAccountAction,
  excuseWeekAction,
  extraFreeListAction,
  flagAction,
  linkContributorAction,
  nudgeAction,
  pilotLinkAction,
  rebuildPointsAction,
  runJobAction,
  saveB3SwitchesAction,
  saveNoteAction,
  saveTestimonialAction,
  seedImportAction,
  undoExcuseAction,
  type V3State,
} from "@/app/admin/v3-actions";

/*
 * The interactive pieces of the v3 admin (plan Unit 17). Every action
 * re-renders the page (refresh), so fields whose typing would be lost to
 * React 19's form reset on an error are controlled (docs/solutions/ui-bugs).
 */

const idle: V3State = { status: "idle" };
const input = "mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 text-small outline-none focus:border-ink";
const area = `${input} h-auto py-2`;
const label = "block text-meta font-[600] text-ink-2";
const small = "btn btn-s btn-ink";
const quiet = "min-h-10 rounded-full border border-rule-strong px-3 text-small hover:border-ink";

type Action = (p: V3State, fd: FormData) => Promise<V3State>;

/** Runs `reset` after a successful action, so a controlled form empties only when its work is done. */
const clearOnOk =
  (fn: Action, reset: () => void): Action =>
  async (p, fd) => {
    const r = await fn(p, fd);
    if (r.status === "ok") reset();
    return r;
  };

function Msg({ s }: { s: V3State }) {
  if (s.status === "idle" || !s.message) return null;
  return (
    <p role={s.status === "error" ? "alert" : "status"} className={`text-small [overflow-wrap:anywhere] ${s.status === "error" ? "text-error" : "text-ink"}`}>
      {s.message}
    </p>
  );
}

function Hidden({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

/** A one-button action with its message beside it. */
export function ActionButton({ action, values, label: text, pendingLabel, className = quiet }: { action: "extra" | "closeOrders" | "rebuildPoints" | "clearDisplayName"; values?: Record<string, string>; label: string; pendingLabel?: string; className?: string }) {
  const fn: Action = action === "extra" ? extraFreeListAction : action === "clearDisplayName" ? clearDisplayNameAction : action === "rebuildPoints" ? () => rebuildPointsAction() : () => closeFailedOrdersAction();
  const [s, act, pending] = useActionState(fn, idle);
  return (
    <form action={act} className="flex flex-wrap items-center gap-3">
      <Hidden values={values ?? {}} />
      <button type="submit" disabled={pending} className={className}>
        {pending ? (pendingLabel ?? "Working…") : text}
      </button>
      <Msg s={s} />
    </form>
  );
}

export function NoteEditor({ userId, note, compact = false }: { userId: string; note: string; compact?: boolean }) {
  const [s, act, pending] = useActionState(saveNoteAction, idle);
  const [text, setText] = useState(note);
  return (
    <form action={act} className="space-y-2">
      <Hidden values={{ userId }} />
      <label className={compact ? "sr-only" : label} htmlFor={`note-${userId}`}>
        Private note
      </label>
      <textarea id={`note-${userId}`} name="note" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={compact ? 2 : 4} className={area} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || text === note} className={quiet}>
          {pending ? "Saving…" : "Save note"}
        </button>
        <Msg s={s} />
      </div>
    </form>
  );
}

export function NudgeForm({ userId, templates }: { userId: string; templates: Record<string, string> }) {
  const [s, act, pending] = useActionState(nudgeAction, idle);
  return (
    <form action={act} className="flex flex-wrap items-end gap-3">
      <Hidden values={{ userId }} />
      <div>
        <label className={label} htmlFor={`nudge-${userId}`}>
          Template nudge
        </label>
        <select id={`nudge-${userId}`} name="template" className={input}>
          {Object.entries(templates).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className={quiet}>
        {pending ? "Sending…" : "Send"}
      </button>
      <Msg s={s} />
    </form>
  );
}

export function ExcuseForm({ userId, week }: { userId: string | null; week: string }) {
  const [s, act, pending] = useActionState(excuseWeekAction, idle);
  const [w, setW] = useState(week);
  return (
    <form action={act} className="flex flex-wrap items-end gap-3">
      <Hidden values={userId ? { userId } : { everyone: "yes" }} />
      <div>
        <label className={label} htmlFor={`excuse-${userId ?? "all"}`}>
          {userId ? "Excuse the week of (Monday)" : "Excuse for everyone, the week of (Monday)"}
        </label>
        <input id={`excuse-${userId ?? "all"}`} name="week" type="date" value={w} onChange={(e) => setW(e.target.value)} required className={input} />
      </div>
      {!userId && (
        <label className="flex items-center gap-2 text-small">
          <input type="checkbox" name="confirmAhead" value="yes" /> Excuse it in advance, if not recorded yet
        </label>
      )}
      <button type="submit" disabled={pending} className={quiet}>
        {pending ? "Excusing…" : userId ? "Excuse" : "Excuse for everyone"}
      </button>
      <Msg s={s} />
    </form>
  );
}

/** Undoes an excuse for everyone for a week. */
export function UndoExcuseForm({ week }: { week: string }) {
  const [s, act, pending] = useActionState(undoExcuseAction, idle);
  const [w, setW] = useState(week);
  return (
    <form action={act} className="flex flex-wrap items-end gap-3">
      <div>
        <label className={label} htmlFor="undo-excuse">
          Undo an excuse for everyone, the week of (Monday)
        </label>
        <input id="undo-excuse" name="week" type="date" value={w} onChange={(e) => setW(e.target.value)} required className={input} />
      </div>
      <button type="submit" disabled={pending} className={quiet}>
        {pending ? "Undoing…" : "Undo"}
      </button>
      <Msg s={s} />
    </form>
  );
}

export function AddRunForm({ userId }: { userId: string }) {
  const [text, setText] = useState("");
  const [s, act, pending] = useActionState(clearOnOk(addRunAction, () => setText("")), idle);
  return (
    <form action={act} className="space-y-2">
      <Hidden values={{ userId }} />
      <label className={label} htmlFor={`run-${userId}`}>
        Add a run for this user (paste Zack’s run file)
      </label>
      <p className="text-meta text-ink-2">
        It counts for the coming Monday’s list. Added after Sunday’s cutoff, it counts for the Monday a week later. It replaces a run already stored for that week.
      </p>
      <textarea id={`run-${userId}`} name="report" value={text} onChange={(e) => setText(e.target.value)} rows={6} className={`${area} font-mono`} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !text.trim()} className={quiet}>
          {pending ? "Storing…" : "Add run"}
        </button>
        <Msg s={s} />
      </div>
    </form>
  );
}

export function PilotLinkForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [s, act, pending] = useActionState(
    clearOnOk(pilotLinkAction, () => {
      setName("");
      setEmail("");
    }),
    idle,
  );
  return (
    <form action={act} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className={label} htmlFor="pilot-name">
          Name
        </label>
        <input id="pilot-name" name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={input} />
      </div>
      <div>
        <label className={label} htmlFor="pilot-email">
          Email
        </label>
        <input id="pilot-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={input} />
      </div>
      <button type="submit" disabled={pending} className={small}>
        {pending ? "Making…" : "Make account and link"}
      </button>
      <div className="sm:col-span-3 space-y-2">
        <Msg s={s} />
        {s.link && (
          <p className="rounded-[var(--radius-inner)] bg-ground-2 p-3 font-mono text-meta [overflow-wrap:anywhere]">
            {s.link}
          </p>
        )}
      </div>
    </form>
  );
}

export function LinkContributorForm({ userId, contributors, linked }: { userId: string; contributors: { id: string; label: string; userId: string | null }[]; linked: string | null }) {
  const [s, act, pending] = useActionState(linkContributorAction, idle);
  const free = contributors.filter((c) => !c.userId || c.userId === userId);
  return (
    <div className="space-y-2">
      {linked ? (
        <form action={act} className="flex flex-wrap items-center gap-3">
          <Hidden values={{ contributorId: linked, userId: "" }} />
          <button type="submit" disabled={pending} className={quiet}>
            Unlink
          </button>
        </form>
      ) : (
        <form action={act} className="flex flex-wrap items-end gap-3">
          <Hidden values={{ userId }} />
          <div>
            <label className={label} htmlFor={`contrib-${userId}`}>
              Seed contributor
            </label>
            <select id={`contrib-${userId}`} name="contributorId" className={input}>
              {free.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pending || free.length === 0} className={quiet}>
            {pending ? "Linking…" : "Link to this user"}
          </button>
        </form>
      )}
      <Msg s={s} />
    </div>
  );
}

export function ChangeEmailForm({ userId }: { userId: string }) {
  const [email, setEmail] = useState("");
  const [s, act, pending] = useActionState(clearOnOk(changeEmailAction, () => setEmail("")), idle);
  return (
    <form action={act} className="flex flex-wrap items-end gap-3">
      <Hidden values={{ userId }} />
      <div className="min-w-[16rem] flex-1">
        <label className={label} htmlFor={`email-${userId}`}>
          New email address (they lost the old one)
        </label>
        <input id={`email-${userId}`} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={input} />
      </div>
      <button type="submit" disabled={pending} className={quiet}>
        {pending ? "Changing…" : "Change address"}
      </button>
      <div className="w-full">
        <Msg s={s} />
      </div>
    </form>
  );
}

export function CloseAccountForm({ userId }: { userId: string }) {
  const [s, act, pending] = useActionState(closeAccountAction, idle);
  return (
    <form action={act} className="space-y-2">
      <Hidden values={{ userId }} />
      <label className="flex items-center gap-2 text-small">
        <input type="checkbox" name="confirm" value="yes" required /> Close this account: nothing more is charged or sent, and they are signed out.
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={quiet}>
          {pending ? "Closing…" : "Close account"}
        </button>
        <Msg s={s} />
      </div>
    </form>
  );
}

export function DeleteAccountForm({ userId }: { userId: string }) {
  const [s, act, pending] = useActionState(deleteAccountAction, idle);
  const [email, setEmail] = useState("");
  return (
    <form action={act} className="flex flex-wrap items-end gap-3">
      <Hidden values={{ userId }} />
      <div className="min-w-[16rem] flex-1">
        <label className={label} htmlFor={`del-${userId}`}>
          Delete for good: type their email address to confirm
        </label>
        <input id={`del-${userId}`} name="confirmEmail" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </div>
      <button type="submit" disabled={pending || !email} className={quiet}>
        {pending ? "Deleting…" : "Delete account"}
      </button>
      <div className="w-full">
        <Msg s={s} />
      </div>
    </form>
  );
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  job: "Job",
  description: "Description",
  heavy_use_for: "Heavy use for",
  who_can_use_it: "Who can use it",
  best_trick: "Best trick",
  working: "Working",
  playbook_md: "Playbook",
  install_notes: "Install notes",
};

/** One flagged play: approve, reject, or edit then approve. */
export function FlagDecision({ playId, fields }: { playId: string; fields: Record<string, string> }) {
  const [s, act, pending] = useActionState(flagAction, idle);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(fields);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={act}>
          <Hidden values={{ playId, decision: "approve" }} />
          <button type="submit" disabled={pending} className={small}>
            Approve
          </button>
        </form>
        <button type="button" onClick={() => setEditing((e) => !e)} className={quiet} aria-expanded={editing}>
          {editing ? "Stop editing" : "Edit"}
        </button>
        <form action={act}>
          <Hidden values={{ playId, decision: "reject" }} />
          <button type="submit" disabled={pending} className={quiet}>
            Reject
          </button>
        </form>
        <Msg s={s} />
      </div>
      {editing && (
        <form action={act} className="space-y-3 rounded-[var(--radius-inner)] bg-ground-2 p-4">
          <Hidden values={{ playId, decision: "edit" }} />
          {Object.keys(values).map((k) => (
            <div key={k}>
              <label className={label} htmlFor={`${playId}-${k}`}>
                {FIELD_LABELS[k] ?? k}
              </label>
              <textarea
                id={`${playId}-${k}`}
                name={k}
                value={values[k]}
                onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                rows={k === "playbook_md" ? 12 : k === "title" ? 1 : 3}
                className={`${area} ${k === "playbook_md" ? "font-mono" : ""}`}
              />
            </div>
          ))}
          <button type="submit" disabled={pending} className={small}>
            {pending ? "Saving…" : "Save edits and approve"}
          </button>
        </form>
      )}
    </div>
  );
}

type T = { id: string; person: string; attribution: string; quote: string; saidOn: string | null; audience: string; position: number; cleared: boolean };

export function TestimonialForm({ t }: { t?: T }) {
  const initial = {
    person: t?.person ?? "",
    attribution: t?.attribution ?? "",
    quote: t?.quote ?? "",
    saidOn: t?.saidOn ?? "",
    audience: t?.audience ?? "re",
    position: String(t?.position ?? 0),
    cleared: t?.cleared ?? false,
  };
  const [v, setV] = useState(initial);
  // An edit form keeps what was saved; the "add" form empties for the next one.
  const [s, act, pending] = useActionState(clearOnOk(saveTestimonialAction, () => (t ? undefined : setV(initial))), idle);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((x) => ({ ...x, [k]: e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const id = t?.id ?? "new";
  return (
    <form action={act} className="grid gap-3 sm:grid-cols-2">
      <Hidden values={t ? { id: t.id } : {}} />
      <div>
        <label className={label} htmlFor={`${id}-person`}>
          Name
        </label>
        <input id={`${id}-person`} name="person" value={v.person} onChange={set("person")} required maxLength={80} className={input} />
      </div>
      <div>
        <label className={label} htmlFor={`${id}-attr`}>
          Attribution
        </label>
        <input id={`${id}-attr`} name="attribution" value={v.attribution} onChange={set("attribution")} maxLength={120} className={input} />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor={`${id}-quote`}>
          Quote
        </label>
        <textarea id={`${id}-quote`} name="quote" value={v.quote} onChange={set("quote")} required maxLength={1200} rows={3} className={area} />
      </div>
      <div>
        <label className={label} htmlFor={`${id}-date`}>
          Date
        </label>
        <input id={`${id}-date`} name="saidOn" type="date" value={v.saidOn} onChange={set("saidOn")} className={input} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor={`${id}-aud`}>
            Audience
          </label>
          <select id={`${id}-aud`} name="audience" value={v.audience} onChange={set("audience")} className={input}>
            <option value="re">Real estate</option>
            <option value="agents">Agents</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-pos`}>
            Order
          </label>
          <input id={`${id}-pos`} name="position" type="number" min={0} max={999} value={v.position} onChange={set("position")} className={input} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-small sm:col-span-2">
        <input type="checkbox" name="cleared" checked={v.cleared} onChange={set("cleared")} /> Cleared: shown on the public site
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={small}>
          {pending ? "Saving…" : t ? "Save" : "Add testimonial"}
        </button>
        <Msg s={s} />
      </div>
    </form>
  );
}

export function SampleChooser({ plays }: { plays: { id: string; title: string; category: string; isSample: boolean }[] }) {
  const [s, act, pending] = useActionState(chooseSampleAction, idle);
  const current = plays.find((p) => p.isSample)?.id ?? "";
  const [chosen, setChosen] = useState(current);
  const [readIt, setReadIt] = useState(false);
  return (
    <div className="space-y-4">
      <form action={act} className="space-y-3">
        <label className={label} htmlFor="sample-play">
          Play to show on the public site
        </label>
        <select id="sample-play" name="playId" value={chosen} onChange={(e) => (setChosen(e.target.value), setReadIt(false))} className={input}>
          <option value="">Choose a play…</option>
          {plays.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.category}){p.isSample ? " — shown now" : ""}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-small">
          <input type="checkbox" name="readIt" checked={readIt} onChange={(e) => setReadIt(e.target.checked)} /> I have read this play and it contains nothing private.
        </label>
        <button type="submit" disabled={pending || !chosen} className={small}>
          {pending ? "Saving…" : "Show this play"}
        </button>
      </form>
      {current && (
        <form action={act}>
          <Hidden values={{ clear: "yes" }} />
          <button type="submit" disabled={pending} className={quiet}>
            Show no sample
          </button>
        </form>
      )}
      <Msg s={s} />
    </div>
  );
}

/** The Cora buttons. "As of" appears only where the server would accept it (it checks again). */
export function CoraButtons({ asOfAllowed }: { asOfAllowed: boolean }) {
  const [s, act, pending] = useActionState(runJobAction, idle);
  const [cs, cact, cpending] = useActionState(chargeAndSendAction, idle);
  const [asOf, setAsOf] = useState("");
  const busy = pending || cpending;
  return (
    <div className="space-y-4">
      {asOfAllowed && (
        <div className="max-w-sm">
          <label className={label} htmlFor="as-of">
            As of (preview and local only, an ISO time; empty means now)
          </label>
          <input id="as-of" value={asOf} onChange={(e) => setAsOf(e.target.value)} placeholder="2026-12-07T11:00:00Z" className={input} />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {[
          ["cora", "Run Cora now"],
          ["dry", "Dry run"],
        ].map(([job, text]) => (
          <form key={job} action={act}>
            <Hidden values={{ job, asOf }} />
            <button type="submit" disabled={busy} className={job === "cora" ? small : quiet}>
              {text}
            </button>
          </form>
        ))}
        <form action={cact}>
          <Hidden values={{ asOf }} />
          <button type="submit" disabled={busy} className={quiet}>
            Charge and send now
          </button>
        </form>
        {asOfAllowed &&
          [
            ["charge", "Charge job as of"],
            ["send", "Send job as of"],
            ["hourly", "Hourly pass as of"],
          ].map(([job, text]) => (
            <form key={job} action={act}>
              <Hidden values={{ job, asOf }} />
              <button type="submit" disabled={busy || !asOf} className={quiet}>
                {text}
              </button>
            </form>
          ))}
      </div>
      {busy && <p className="text-small text-ink-2">Working… this can take a few minutes.</p>}
      <Msg s={s} />
      <Msg s={cs} />
    </div>
  );
}

export function SeedImportForm() {
  const empty = { label: "", agent: "", ranOn: "", text: "" };
  const [v, setV] = useState(empty);
  const [s, act, pending] = useActionState(clearOnOk(seedImportAction, () => setV(empty)), idle);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form action={act} className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className={label} htmlFor="seed-label">
          Contributor (hidden label)
        </label>
        <input id="seed-label" name="label" value={v.label} onChange={set("label")} required className={input} />
      </div>
      <div>
        <label className={label} htmlFor="seed-agent">
          Agent
        </label>
        <input id="seed-agent" name="agent" value={v.agent} onChange={set("agent")} required placeholder="grok-bot" className={input} />
      </div>
      <div>
        <label className={label} htmlFor="seed-date">
          Run date
        </label>
        <input id="seed-date" name="ranOn" type="date" value={v.ranOn} onChange={set("ranOn")} required className={input} />
      </div>
      <div className="sm:col-span-3">
        <label className={label} htmlFor="seed-text">
          Run file
        </label>
        <textarea id="seed-text" name="text" value={v.text} onChange={set("text")} rows={8} required className={`${area} font-mono`} />
      </div>
      <label className="flex items-center gap-2 text-small sm:col-span-3">
        <input type="checkbox" name="replace" /> Replace this person’s run for that agent and week if there is one
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className={small}>
          {pending ? "Importing…" : "Import"}
        </button>
        <Msg s={s} />
      </div>
    </form>
  );
}

const B3_SWITCH_ROWS = [
  { name: "feedbackOn", label: "Weekly notes from members", hint: "The note box on /app/week. Also needs sign-up open and the cycle live." },
  { name: "reviewBotOn", label: "Review bot", hint: "The Friday run. Pull requests open only on production with the GitHub token; otherwise every approval is a dry run." },
  { name: "coraUpgradesOn", label: "Cora upgrades", hint: "Cora may offer one upgrade to something a member already runs. Cora runs only while the cycle is live." },
] as const;

/** The B3 switches (B3 plan Unit 1), all off by default. */
export function B3SwitchesForm({ values }: { values: Record<(typeof B3_SWITCH_ROWS)[number]["name"], boolean> }) {
  const [s, act, pending] = useActionState(saveB3SwitchesAction, idle);
  return (
    <form action={act} className="space-y-4 rounded-[var(--radius-object)] border border-rule bg-surface p-6 sm:p-8">
      <h2 className="text-title">B3 switches</h2>
      {B3_SWITCH_ROWS.map((r) => (
        <label key={r.name} className="flex items-start gap-3 text-small">
          <input type="checkbox" name={r.name} defaultChecked={values[r.name]} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
          <span>
            <span className="font-[600]">{r.label}</span>
            <span className="block text-ink-2">{r.hint}</span>
          </span>
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={small}>
          {pending ? "Saving…" : "Save switches"}
        </button>
        <Msg s={s} />
      </div>
    </form>
  );
}
