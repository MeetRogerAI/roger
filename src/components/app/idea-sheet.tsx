"use client";

import { useEffect, useId, type ReactNode, type RefObject } from "react";
import type { IdeaView, Tile } from "@/lib/cora/idea-view";
import { CopyTextButton } from "./copy-text-button";
import { ScoreBars } from "./score-bars";
import { SimpleMarkdown } from "./simple-markdown";

/**
 * The pull-out sheet (spec 0.7). A modal <dialog>: the browser traps focus
 * inside it and closes it on Escape. On close, focus goes back to the card
 * that opened it.
 */
export function IdeaSheet({
  ref,
  idea,
  actions,
  returnFocus,
  initiallyOpen,
}: {
  ref: RefObject<HTMLDialogElement | null>;
  idea: IdeaView;
  actions?: ReactNode;
  returnFocus: RefObject<HTMLElement | null>;
  initiallyOpen: boolean;
}) {
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => returnFocus.current?.focus();
    d.addEventListener("close", onClose);
    if (initiallyOpen && !d.open) d.showModal();
    return () => d.removeEventListener("close", onClose);
  }, [ref, returnFocus, initiallyOpen]);

  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === e.currentTarget) close();
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-[44rem] overflow-y-auto bg-ground p-0 text-ink backdrop:bg-night/60 motion-safe:transition-transform"
    >
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">{idea.category}</p>
            <h2 id={titleId} className="mt-2 text-h3">
              {idea.title}
            </h2>
          </div>
          <button type="button" onClick={close} className="btn btn-s btn-light shrink-0" aria-label="Close this idea">
            Close
          </button>
        </div>
        {actions && <div className="mt-4">{actions}</div>}

        {idea.personal && (
          <p className="mt-6 text-small text-ink-2">
            <span className="font-[560] text-ink">Your score {idea.personal.score} of 100.</span> {idea.personal.reason}
          </p>
        )}
        <p className="mt-6 text-lead">{idea.description}</p>

        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          {[idea.tiles.hours, idea.tiles.eachTime, idea.tiles.heavy, idea.tiles.runBy].map((t) => (
            <TileBox key={t.label} tile={t} />
          ))}
        </dl>
        <p className="mt-3 text-meta text-ink-2">Times are estimates from other users’ runs, not a promise.</p>

        <section className="mt-10 rounded-[8px] border border-rule bg-surface p-5 sm:p-6" aria-labelledby={`${titleId}-install`}>
          <h3 id={`${titleId}-install`} className="text-title">
            Paste to install
          </h3>
          <p className="mt-2 text-small text-ink-2">
            The button copies this prompt with the full playbook under it. Paste both into your AI agent, then answer its setup questions.
          </p>
          <blockquote className="mt-4 border-l-2 border-rule-strong pl-4 text-small">{idea.pasteToInstall}</blockquote>
          <CopyTextButton text={idea.copyText} label="Copy prompt and playbook" className="btn btn-m mt-5" />
          {idea.writtenOn && (
            <p className="mt-4 text-meta text-ink-2">
              Written on {idea.writtenOn}. Words like “skill” or “routine” may have another name on your AI agent.
            </p>
          )}
        </section>

        <section className="mt-10" aria-labelledby={`${titleId}-scores`}>
          <h3 id={`${titleId}-scores`} className="text-title">
            Cora’s scores
          </h3>
          <div className="mt-4">
            <ScoreBars scores={idea.scores} />
          </div>
        </section>

        <details className="mt-10" open>
          <summary className="cursor-pointer text-title">The playbook</summary>
          <SimpleMarkdown source={idea.playbookMd} className="mt-4 text-small" />
        </details>

        {idea.howWorkedOut && (
          <details className="mt-6">
            <summary className="cursor-pointer text-title">How the time saved was worked out</summary>
            <SimpleMarkdown source={idea.howWorkedOut} className="mt-4 text-small" />
          </details>
        )}
      </div>
    </dialog>
  );
}

function TileBox({ tile }: { tile: Tile }) {
  return (
    <div className="rounded-[8px] border border-rule bg-surface p-4">
      <dt className="text-meta text-ink-2">{tile.label}</dt>
      <dd className="mt-1 text-small font-[600]">{tile.headline ?? "Not available"}</dd>
      <dd className="mt-1 text-meta text-ink-2">{tile.detail}</dd>
    </div>
  );
}
