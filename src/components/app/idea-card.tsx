"use client";

import { useRef, type ReactNode } from "react";
import { WITHDRAWN_NOTICE, type IdeaView } from "@/lib/cora/idea-view";
import { IdeaSheet } from "./idea-sheet";

/**
 * The idea card (spec 0.7): one component for the Monday view and the public
 * sample. The front shows the title, the user's personal score when there is
 * one, why it fits, and the time line. Opening it shows the pull-out sheet.
 *
 * `sheetActions` is placed under the sheet's title (the Monday view passes
 * "I set this up"). `initiallyOpen` opens the sheet on load, for the public
 * sample's "opened to show the sheet" layout (spec A.4).
 */
export function IdeaCard({ idea, sheetActions, initiallyOpen = false }: { idea: IdeaView; sheetActions?: ReactNode; initiallyOpen?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const label = idea.personal
    ? `${idea.title}, your score ${idea.personal.score} of 100. Open the full idea.`
    : `${idea.title}. Open the full idea.`;

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="group block w-full rounded-[8px] border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong sm:p-6"
      >
        <span className="text-meta font-semibold uppercase tracking-wider text-ink-2">{idea.category}</span>
        <span className="mt-2 flex items-start justify-between gap-4">
          <span className="text-title">{idea.title}</span>
          {idea.personal && (
            <span className="shrink-0 text-right">
              <span className="tabular block text-h3 leading-none">{idea.personal.score}</span>
              <span className="text-meta text-ink-2">your score</span>
            </span>
          )}
        </span>
        {!idea.withdrawn && <span className="mt-3 block text-small text-ink-2">{idea.personal ? idea.personal.reason : idea.description}</span>}
        {idea.timeLine && (
          <span className="mt-4 block text-meta text-ink-2">
            {idea.timeLine}. An estimate from other users’ runs.
          </span>
        )}
        {idea.withdrawn ? <span className="mt-4 block text-small">{WITHDRAWN_NOTICE}</span> : <span className="tlink chev mt-4 inline-block text-small">Open and install</span>}
      </button>
      <IdeaSheet ref={dialog} idea={idea} actions={sheetActions} returnFocus={opener} initiallyOpen={initiallyOpen} />
    </>
  );
}
