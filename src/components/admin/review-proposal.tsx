"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState } from "react";
import { approveProposalAction, refreshFromGitHubAction, rejectProposalAction, runReviewNowAction } from "@/app/admin/review/actions";
import type { V3State } from "@/app/admin/v3-actions";
import { isRepoPullUrl } from "@/lib/review/pr-url";

/*
 * The buttons on /admin/review (B3 plan Unit 10). Every action refreshes the
 * page, and a proposal's card can move to another section when its status
 * changes, unmounting its form. So the result goes to one message area near
 * the top of the page (ReviewMessages, which stays mounted), and focus moves
 * there once it arrives. Each button shows its pending state while it works.
 */

type Action = (p: V3State, fd: FormData) => Promise<V3State>;
type Shown = V3State & { prefix?: string };

const idle: V3State = { status: "idle" };
const quiet = "min-h-10 rounded-full border border-rule-strong px-3 text-small hover:border-ink disabled:opacity-60";
const strong = "btn btn-s btn-ink disabled:opacity-60";

const Report = createContext<(s: Shown) => void>(() => {});

/** Holds the latest result and shows it in one place, focused when it changes. */
export function ReviewMessages({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState<Shown>(idle);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown.status !== "idle") ref.current?.focus();
  }, [shown]);
  const error = shown.status === "error";
  return (
    <Report.Provider value={setShown}>
      <div ref={ref} tabIndex={-1} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} className="outline-none focus-visible:ring-2 focus-visible:ring-ink">
        {shown.status !== "idle" && shown.message ? (
          <p className={`rounded-[var(--radius-control)] border px-4 py-3 text-small [overflow-wrap:anywhere] ${error ? "border-error text-error" : "border-rule text-ink"}`}>
            {shown.prefix ? `${shown.prefix}: ` : ""}
            {shown.message}
            {isRepoPullUrl(shown.link) ? (
              <>
                {" "}
                <a href={shown.link} className="tlink" target="_blank" rel="noreferrer">
                  Open the pull request
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      {children}
    </Report.Provider>
  );
}

function useReported(fn: Action, prefix?: string, after?: (s: V3State) => void) {
  const report = useContext(Report);
  return useActionState<V3State, FormData>(async (p, fd) => {
    let r: V3State;
    try {
      r = await fn(p, fd);
    } catch {
      r = { status: "error", message: "That didn’t work. Reload the page and try again.", at: Date.now() };
    }
    report({ ...r, prefix });
    after?.(r);
    return r;
  }, idle);
}

/** Run now, or Refresh from GitHub. */
export function ReviewJobButton({ job }: { job: "run" | "refresh" }) {
  const [, act, pending] = useReported(job === "run" ? () => runReviewNowAction() : () => refreshFromGitHubAction());
  return (
    <form action={act}>
      <button type="submit" disabled={pending} className={job === "run" ? strong : quiet}>
        {job === "run" ? (pending ? "Running (up to five minutes)…" : "Run now") : pending ? "Checking GitHub…" : "Refresh from GitHub"}
      </button>
    </form>
  );
}

/** Approve: the first or second read for a guardrail proposal, otherwise the approval itself. */
export function ApproveButton({ proposal, label }: { proposal: string; label: string }) {
  const [, act, pending] = useReported(approveProposalAction, `Proposal ${proposal}`);
  return (
    <form action={act}>
      <input type="hidden" name="proposal" value={proposal} />
      <button type="submit" disabled={pending} className={strong}>
        {pending ? "Working (this can take a minute)…" : label}
      </button>
    </form>
  );
}

/** Reject, with an optional note (admin text, kept with who and when). The note empties only once rejected. */
export function RejectForm({ proposal }: { proposal: string }) {
  const [note, setNote] = useState("");
  const [, act, pending] = useReported(rejectProposalAction, `Proposal ${proposal}`, (r) => {
    if (r.status === "ok") setNote("");
  });
  const id = `reject-note-${proposal}`;
  return (
    <form action={act} className="space-y-2">
      <input type="hidden" name="proposal" value={proposal} />
      <label htmlFor={id} className="block text-meta font-[600] text-ink-2">
        Why reject it (optional, kept with the proposal)
      </label>
      <textarea
        id={id}
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={2}
        className="w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 py-2 text-small outline-none focus:border-ink"
      />
      <button type="submit" disabled={pending} className={quiet}>
        {pending ? "Rejecting…" : "Reject"}
      </button>
    </form>
  );
}
