"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { count } from "./parts";
import { dismissWarning, useDismissed } from "./review-dismissals";

/** One wording warning as the review prints it: `body` is drawn on the server, `label` names it for a screen reader. */
export type WordingWarningItem = { id: string; rule: string; label: string; body: React.ReactNode };

const wrap = "[overflow-wrap:anywhere]";

/**
 * The review's "Wording warnings" box, at the top of the screen (Peter, November 28, 2026). Each warning has a Dismiss
 * button once the page's scripts run; a dismissed one leaves the box, and the box goes with the last one. Focus then
 * moves to the next warning's Dismiss, or to the publish button, and a polite message says what happened.
 * With no script every warning shows, with no Dismiss button.
 */
export function WordingWarnings({ review, items }: { review: string; items: WordingWarningItem[] }) {
  const { ready, ids } = useDismissed(review);
  const shown = items.filter((item) => !ids.includes(item.id));
  const [said, setSaid] = useState("");
  // Where the focus goes once the dismissed warning has left the page: a warning's id, or "publish".
  const focusNext = useRef<string | null>(null);

  useLayoutEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    const el = target === "publish" ? document.querySelector<HTMLElement>("[data-publish]") : document.querySelector<HTMLElement>(`[data-dismiss="${CSS.escape(target)}"]`);
    el?.focus();
  });

  const dismiss = (id: string) => {
    const at = shown.findIndex((item) => item.id === id);
    const rest = shown.filter((item) => item.id !== id);
    focusNext.current = (rest[at] ?? rest[at - 1])?.id ?? "publish";
    setSaid(rest.length > 0 ? `Warning dismissed. ${count(rest.length, "wording warning", "wording warnings")} left.` : "All wording warnings dismissed.");
    dismissWarning(review, id);
  };

  return (
    <>
      {shown.length > 0 && (
        <div data-warnings className="rounded-[8px] border border-error bg-surface p-5">
          <h2 className="text-title">Wording warnings: {shown.length}</h2>
          <p className="mt-2 text-small text-ink-2">
            These texts break one of the site’s wording rules. You decide: change the text, or publish anyway. Publishing anyway is noted in the admin log.
            {ready ? " Dismiss a warning once you have read it: the text stays as it is, and the warning is still noted in the log when you publish." : ""}
          </p>
          <ul className="mt-4 space-y-4">
            {shown.map((item) => (
              <li key={item.id} data-warning={item.rule} className={`min-w-0 text-small ${wrap}`}>
                {item.body}
                {ready && (
                  <p className="mt-2">
                    <button type="button" data-dismiss={item.id} onClick={() => dismiss(item.id)} className="min-h-10 rounded-full border border-rule-strong px-4 text-small text-ink hover:bg-ground-2">
                      Dismiss<span className="sr-only">: the warning on {item.label}</span>
                    </button>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Outside the box, so the message is still read when the box has gone. */}
      <p role="status" aria-live="polite" data-dismiss-status className="sr-only">
        {said}
      </p>
    </>
  );
}
