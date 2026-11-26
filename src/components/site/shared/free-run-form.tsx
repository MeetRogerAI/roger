"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";
import { saveFreeReport, startFreeRun, type ReportState, type StartRunState } from "@/app/zack/actions";
import { Honeypot } from "@/components/app/honeypot";
import { StartLink } from "./start-link";

/**
 * The forms of the free Zack run (plan KTD12, spec A.11), the same for every
 * site version: the email step, the paste-back step with the summary that
 * follows it, and the copy buttons of the instructions between them. Each
 * takes its words as props; the look around them is the version's.
 *
 * Both forms hand their fields to the action themselves, so React does not
 * clear what was typed when the action answers with an error. Where there is
 * no script the fields are filled again from the values the action returns.
 */

const input = "mt-2 block w-full rounded-[8px] border border-rule-strong bg-surface px-4 py-3 text-body";

/** Sends the form to its action without the reset a form action brings. */
function submitTo(action: (fd: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(() => action(fd));
  };
}

/** Copies text and says so, for screen readers too. */
export function CopyText({ text, label, copied, className }: { text: string; label: string; copied: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* The clipboard is blocked: the text is on the page to select, and Download still works. */
        }
      }}
    >
      <span aria-live="polite">{done ? copied : label}</span>
    </button>
  );
}

export type AdaptCopy = { label: string; placeholder: string; blank: string; prompt: string; copy: string; copied: string };

const AGENT = "[agent]";

/**
 * The prompt that adapts the Hark file to an agent with no file of its own.
 * With a known agent its name is in the prompt; for an agent we do not list,
 * the visitor types the name and it fills the gap.
 */
export function AdaptPrompt({ name, copy }: { name: string | null; copy: AdaptCopy }) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const agent = name ?? typed.trim();
  const [before, after] = copy.prompt.split(AGENT);
  return (
    <div className="mt-5">
      {name === null && (
        <>
          <label htmlFor={id} className="text-meta font-[560] text-ink-2">
            {copy.label}
          </label>
          <input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={copy.placeholder} autoComplete="off" maxLength={60} className={`${input} mb-4 max-w-[20rem]`} />
        </>
      )}
      <div className="on-night flex flex-col gap-4 rounded-[8px] bg-night p-5 text-night-ink sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <code className="min-w-0 break-words font-mono text-small leading-relaxed">
          {before}
          <span className="text-accent-night">{agent || copy.blank}</span>
          {after}
        </code>
        <CopyText text={copy.prompt.replace(AGENT, agent || copy.blank)} label={copy.copy} copied={copy.copied} className="btn btn-m btn-light shrink-0 self-start sm:self-auto" />
      </div>
    </div>
  );
}

export type EmailCopy = { label: string; submit: string; pending: string; started: string; continue: string };

/** The line shown when the address holds a run link that opens nothing, ending on a link to sign-in. */
export type EmailNotice = { text: string; signInLead: string; signIn: string };

const idleStart: StartRunState = { status: "idle" };

/** Where a started run lives: its agent's page, with the token in the address. */
const runHref = (agent: string, state: StartRunState) => (state.status === "ok" && state.token ? `/zack/${agent}?run=${state.token}` : null);

/** Step 2: the email that starts a run for this agent. On success the page address takes the run's token. */
export function FreeRunEmailForm({ agent, copy, notice }: { agent: string; copy: EmailCopy; /** Shown above the field: why the visitor is back at this step. */ notice?: EmailNotice }) {
  const [state, action, pending] = useActionState(startFreeRun, idleStart);
  const router = useRouter();
  const href = runHref(agent, state);
  useEffect(() => {
    if (href) router.replace(href, { scroll: false });
  }, [href, router]);
  return <FreeRunEmailView agent={agent} copy={copy} notice={notice} state={state} pending={pending} action={action} />;
}

/**
 * What the email step shows for an answer from its action. It holds no state
 * of its own, so a test can render it for any answer.
 */
export function FreeRunEmailView({
  agent,
  copy,
  notice,
  state,
  pending = false,
  action,
}: {
  agent: string;
  copy: EmailCopy;
  notice?: EmailNotice;
  /** The action's last answer. */
  state: StartRunState;
  pending?: boolean;
  action?: (fd: FormData) => void;
}) {
  const id = useId();
  const href = runHref(agent, state);

  if (href) {
    // Shown while the next step loads, and the way on where there is no script.
    return (
      <div role="status" className="mt-6">
        <p className="text-body">{copy.started}</p>
        <p className="mt-4">
          <a href={href} className="btn btn-m">
            {copy.continue}
          </a>
        </p>
      </div>
    );
  }

  const error = state.errors?.email;
  return (
    <form action={action} onSubmit={action && submitTo(action)} noValidate className="relative mt-6 max-w-[30rem]">
      <Honeypot />
      <input type="hidden" name="agent" value={agent} />
      {notice && state.status === "idle" && (
        <p role="status" data-run-notice className="mb-5 text-small text-ink-2">
          {notice.text} {notice.signInLead}{" "}
          <Link href="/signin" className="tlink">
            {notice.signIn}
          </Link>
        </p>
      )}
      <label htmlFor={`${id}-email`} className="text-meta font-[560] text-ink-2">
        {copy.label}
      </label>
      <input
        id={`${id}-email`}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-email-error` : undefined}
        className={input}
      />
      {error && (
        <p id={`${id}-email-error`} role="alert" className="mt-2 text-small text-error">
          {error}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" className="mt-4 text-small text-error">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-m mt-6" disabled={pending}>
        {pending ? copy.pending : copy.submit}
      </button>
    </form>
  );
}

export type ReportCopy = {
  label: string;
  submit: string;
  pending: string;
  startAgain: string;
  /** The line above the paste box, word for word from the spec. */
  warning: string;
  summaryTitle: string;
  saved: string;
  noPlays: string;
  next: string;
  already: string;
  again: string;
  /** The one button after the summary, and the line under it. */
  start: string;
  cardLine: string;
};

const idleReport: ReportState = { status: "idle" };

/** The one button the flow ends on: sign-up, with the run's token so the report is attached to the new account. */
function StartWithRun({ token, copy }: { token: string; copy: ReportCopy }) {
  return (
    <div className="mt-8">
      <p className="text-body">{copy.next}</p>
      <p className="mt-5">
        <StartLink audience="agents" zack={token} className="btn btn-l">
          {copy.start}
        </StartLink>
      </p>
      <p className="mt-4 text-meta text-ink-2">{copy.cardLine}</p>
    </div>
  );
}

/**
 * Step 4: the paste box under its warning, then the visitor's play titles and
 * the start button. `hasReport`: a report is already stored for this run (a
 * reopened tab), so the start button is offered before anything is pasted.
 */
export function FreeRunReportForm({ agent, token, hasReport, copy }: { agent: string; token: string; hasReport: boolean; copy: ReportCopy }) {
  const [state, action, pending] = useActionState(saveFreeReport, idleReport);
  // The answer the visitor chose to paste over, if any: its summary is not shown again.
  const [replaced, setReplaced] = useState<ReportState | null>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const done = state.status === "ok" && state !== replaced;
  useEffect(() => {
    if (done) summary.current?.focus();
  }, [done]);
  return (
    <FreeRunReportView
      agent={agent}
      token={token}
      hasReport={hasReport || replaced !== null}
      copy={copy}
      state={state}
      pasteOver={state === replaced}
      pending={pending}
      action={action}
      summaryRef={summary}
      onPasteOver={() => setReplaced(state)}
    />
  );
}

/**
 * What the paste-back step shows for an answer from its action. It holds no
 * state of its own, so a test can render it for any answer.
 */
export function FreeRunReportView({
  agent,
  token,
  hasReport,
  copy,
  state,
  pasteOver = false,
  pending = false,
  action,
  summaryRef,
  onPasteOver,
}: {
  agent: string;
  token: string;
  /** A report is stored for this run already. */
  hasReport: boolean;
  copy: ReportCopy;
  /** The action's last answer. */
  state: ReportState;
  /** The visitor chose to paste over that answer, so the box is shown again and not its summary. */
  pasteOver?: boolean;
  pending?: boolean;
  action?: (fd: FormData) => void;
  summaryRef?: Ref<HTMLHeadingElement>;
  onPasteOver?: () => void;
}) {
  const id = useId();
  const done = state.status === "ok" && !pasteOver;

  if (done) {
    const titles = state.titles ?? [];
    return (
      <div className="mt-6">
        <h3 ref={summaryRef} tabIndex={-1} className="text-title outline-none">
          {copy.summaryTitle}
        </h3>
        <p role="status" className="mt-3 text-body text-ink-2">
          {copy.saved}
        </p>
        {titles.length > 0 ? (
          <ol className="mt-6 border-b border-rule">
            {titles.map((title) => (
              <li key={title} className="border-t border-rule py-4 text-lead">
                {title}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-6 border-y border-rule py-4 text-body">{copy.noPlays}</p>
        )}
        <StartWithRun token={token} copy={copy} />
        <p className="mt-8">
          <button type="button" onClick={onPasteOver} className="tlink text-small">
            {copy.again}
          </button>
        </p>
      </div>
    );
  }

  const error = state.errors?.report;
  return (
    <div className="mt-6">
      {hasReport && (
        <div className="mb-10 border-y border-rule py-6">
          <p role="status" className="text-body">
            {copy.already}
          </p>
          <StartWithRun token={token} copy={copy} />
        </div>
      )}
      <form action={action} onSubmit={action && submitTo(action)} noValidate className="relative">
        <Honeypot />
        <input type="hidden" name="run" value={token} />
        <p id={`${id}-warning`} className="rounded-[8px] bg-ground-2 px-5 py-4 text-body">
          {copy.warning}
        </p>
        <label htmlFor={`${id}-report`} className="mt-6 block text-meta font-[560] text-ink-2">
          {copy.label}
        </label>
        <textarea
          id={`${id}-report`}
          name="report"
          rows={14}
          required
          spellCheck={false}
          defaultValue={state.values?.report ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-warning ${id}-report-error` : `${id}-warning`}
          className={`${input} font-mono text-small`}
        />
        {error && (
          <p id={`${id}-report-error`} role="alert" className="mt-2 text-small text-error">
            {error}
          </p>
        )}
        {(state.status === "error" || state.status === "gone") && state.message && (
          <p role="alert" className="mt-4 text-small text-error">
            {state.message}{" "}
            {state.status === "gone" && (
              <Link href={`/zack/${agent}`} className="tlink">
                {copy.startAgain}
              </Link>
            )}
          </p>
        )}
        <button type="submit" className="btn btn-m mt-6" disabled={pending}>
          {pending ? copy.pending : copy.submit}
        </button>
      </form>
    </div>
  );
}
