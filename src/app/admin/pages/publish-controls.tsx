"use client";

import { useState, useTransition } from "react";
import { publishAction, resetToReleaseAction, undoPublishAction, type PublishState } from "./actions";

/**
 * The two buttons that change what visitors see (plan U5): Publish, on the
 * review, and Undo last publish. Each keeps its message on screen after the
 * page's data has been refreshed, and neither breaks the page when the call
 * cannot reach the server.
 */
const idle: PublishState = { status: "idle" };
const UNKNOWN = "The answer did not come back, so this page cannot tell whether it went through. Reload the page to see what the site shows now.";

function useCall(call: () => Promise<PublishState>) {
  const [state, setState] = useState<PublishState>(idle);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      try {
        setState(await call());
      } catch {
        setState({ status: "error", message: UNKNOWN });
      }
    });
  return { state, pending, run };
}

function Message({ state }: { state: PublishState }) {
  // Always in the page, so a screen reader hears a message when it arrives.
  return (
    <p role={state.status === "error" ? "alert" : "status"} data-message={state.status} className={`text-small ${state.status === "error" ? "text-error" : "text-ink"}`}>
      {state.message}
    </p>
  );
}

/**
 * Publish, on the review screen. `review` is the fingerprint of the list above the button: the server publishes
 * only when the drafts and the warnings are still the ones that list shows. `count` is how many texts will change,
 * and `warnings` how many wording warnings the owner is publishing over.
 */
export function PublishButton({ review, count, warnings }: { review: string; count: number; warnings: number }) {
  const { state, pending, run } = useCall(() => {
    const fd = new FormData();
    fd.set("review", review);
    return publishAction(fd);
  });
  const all = count === 1 ? "this 1 change" : `all ${count} changes`;
  return (
    <div className="space-y-3">
      {count > 0 && (
        <button type="button" data-publish disabled={pending} onClick={run} className="btn btn-m btn-ink">
          {pending ? "Publishing…" : warnings > 0 ? `Publish anyway: ${all}` : `Publish ${all}`}
        </button>
      )}
      <Message state={state} />
    </div>
  );
}

/**
 * "Reset all to the release" (plan U10, AE10). It asks once before it changes the site, and the question says what
 * goes: `differences` rows of the list above, and `drafts` changes saved and not published. `seen` is the
 * fingerprint of what the list was made from.
 */
export function ResetToRelease({ seen, differences, drafts }: { seen: string; differences: number; drafts: number }) {
  const { state, pending, run } = useCall(() => {
    const fd = new FormData();
    fd.set("seen", seen);
    return resetToReleaseAction(fd);
  });
  const [step, setStep] = useState<"button" | "asking" | "back">("button");
  const asking = step === "asking";
  const rows = differences === 1 ? "the 1 difference above" : `all ${differences} differences above`;
  return (
    <div className="space-y-3">
      {differences > 0 && !asking && (
        <button type="button" data-reset-all autoFocus={step === "back"} onClick={() => setStep("asking")} disabled={pending} className="min-h-10 rounded-full border border-rule-strong px-4 text-small text-ink hover:bg-ground-2">
          {pending ? "Resetting…" : "Reset all to the release"}
        </button>
      )}
      {differences > 0 && asking && (
        <div data-reset-ask className="rounded-[8px] border border-rule-strong bg-surface p-4">
          <p className="text-small">
            Make this site show the release exactly, for every visitor? This takes away {rows}.{" "}
            {drafts > 0 ? (
              <strong data-reset-drafts className="font-[620]">
                It also throws away {drafts === 1 ? "the 1 change" : `the ${drafts} changes`} saved as a draft and not published.
              </strong>
            ) : (
              "No unpublished drafts are waiting."
            )}{" "}
            Undo last publish brings back this site’s edits until the next publish{drafts > 0 ? ", and those drafts as long as nothing is saved first" : ""}.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              data-reset-yes
              autoFocus
              onClick={() => {
                setStep("button");
                run();
              }}
              className="btn btn-m btn-ink"
            >
              Yes, reset all to the release
            </button>
            <button type="button" data-reset-no onClick={() => setStep("back")} className="min-h-10 rounded-full border border-rule-strong px-4 text-small text-ink-2 hover:text-ink">
              No, keep this site’s edits
            </button>
          </div>
        </div>
      )}
      <Message state={state} />
    </div>
  );
}

/** Undo last publish. It asks once before it changes the site. `available` is false when there is no publish to go back from. */
export function UndoPublish({ available }: { available: boolean }) {
  const { state, pending, run } = useCall(undoPublishAction);
  // "back": the question was just answered with No, so the button takes the focus the answer had.
  const [step, setStep] = useState<"button" | "asking" | "back">("button");
  const asking = step === "asking";
  return (
    <div className="space-y-3">
      {available && !asking && (
        <button type="button" data-undo autoFocus={step === "back"} onClick={() => setStep("asking")} disabled={pending} className="min-h-10 rounded-full border border-rule-strong px-4 text-small text-ink hover:bg-ground-2">
          {pending ? "Undoing…" : "Undo last publish"}
        </button>
      )}
      {available && asking && (
        <div data-undo-ask className="rounded-[8px] border border-rule-strong bg-surface p-4">
          <p className="text-small">Put the whole site back to how it was before the last publish? Your drafts stay as they are, so you can fix them and publish again.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              data-undo-yes
              autoFocus
              onClick={() => {
                setStep("button");
                run();
              }}
              className="btn btn-m btn-ink"
            >
              Yes, undo the last publish
            </button>
            <button type="button" data-undo-no onClick={() => setStep("back")} className="min-h-10 rounded-full border border-rule-strong px-4 text-small text-ink-2 hover:text-ink">
              No, leave the site as it is
            </button>
          </div>
        </div>
      )}
      <Message state={state} />
    </div>
  );
}
