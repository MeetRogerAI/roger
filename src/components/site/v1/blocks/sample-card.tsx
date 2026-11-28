import type { ReactNode } from "react";
import { CopyTextButton } from "@/components/app/copy-text-button";
import { SimpleMarkdown } from "@/components/app/simple-markdown";
import type { SampleCardCopy } from "@/data/site/copy-types";
import { playbookSteps } from "@/lib/site/playbook";
import type { IdeaView } from "@/lib/site/sample";
import { OneOpen } from "./one-open";

/**
 * The public sample idea (plan KTD6, R11): one real play, folded, to be opened
 * a part at a time (Peter's homepage review, November 26, 2026). It takes the
 * same IdeaView the app's idea card takes, but it is a marketing component of
 * its own.
 *
 * Two headings that do not fold, and under each its folded rows:
 *
 *   The Idea       Summary          the play's description
 *                  What To Copy     the install prompt and its copy button, with nothing under the button
 *                  Cora's scores    only for a play Cora has scored
 *   The Playbook   8 steps          one row, which opens to a row for each part of the playbook,
 *                                   each of which opens to that part's text
 *
 * The count is the play's own: a playbook with six parts says six. A playbook
 * that is not written as headed parts is shown whole under one row, with no
 * count. Every row is a native details element, so it opens by keyboard and
 * with no script, and all of the play's text is in the page whether a row is
 * open or not.
 *
 * - It is inline, never a modal.
 * - It prints no time line, no time tiles and no note on how time was worked
 *   out, whatever figures the play carries.
 * - It keeps Cora's five scores, each with its name and its number in words.
 *   The names are the copy's (`copy.scores.names`). The view's own labels and
 *   help lines are the app's and are not printed here: one of them is about
 *   time saved.
 *
 * The card sets its own surface and ink, so it reads the same on any ground.
 * Build the view with publicIdeaView in src/lib/site/sample.ts.
 */

// The data palette (globals.css): graphics only, and each bar also carries its number.
const fill: Record<IdeaView["scores"][number]["key"], string> = {
  hours: "bg-f-hours",
  reach: "bg-f-reach",
  ease: "bg-f-ease",
  proof: "bg-f-proof",
  surprise: "bg-f-surprise",
};

/** The plus that turns to a cross when its row is open. `open` is the class that turns it, for the row's own group. */
function Mark({ open }: { open: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`size-4 shrink-0 text-ink-2 transition-transform duration-200 motion-reduce:transition-none ${open}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M10 3v14M3 10h14" />
    </svg>
  );
}

const summaryRow = "flex min-h-12 cursor-pointer list-none items-center justify-between gap-6 py-3 [&::-webkit-details-marker]:hidden";

/**
 * One folded row of the card. `fold` names it for the page's tests and checks. `name` is shared by the card's rows, so
 * that opening one closes the other (Peter, November 26, 2026): the native `name` of details, which needs no script.
 */
function Fold({ fold, name, label, children }: { fold: string; name: string; label: string; children: ReactNode }) {
  return (
    <details data-fold={fold} name={name} className="group/fold border-t border-rule">
      <summary className={`${summaryRow} text-title`}>
        {label}
        <Mark open="group-open/fold:rotate-45" />
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}

export function SampleCard({ idea, copy, id = "sample" }: { idea: IdeaView; copy: SampleCardCopy; id?: string }) {
  const titleId = `${id}-idea`;
  const scored = idea.scores.some((s) => typeof s.value === "number");
  const steps = playbookSteps(idea.playbookMd);
  // One row of the card open at a time (Summary, What To Copy, Cora's scores, the steps), and inside the playbook one step.
  const rows = `${id}-rows`;
  const stepRows = `${id}-steps`;
  return (
    // data-claims: the play's own text and scores, for the claims check (src/lib/site/claims.ts).
    <article aria-labelledby={titleId} data-claims="sample" className="mx-auto max-w-[44rem] rounded-[8px] border border-rule bg-surface p-5 text-left text-ink sm:p-8">
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">{idea.category}</p>
      <h3 id={titleId} className="mt-2 text-h3">
        {idea.title}
      </h3>

      <section className="mt-8" aria-labelledby={`${id}-the-idea`}>
        <h4 id={`${id}-the-idea`} className="pb-3 text-meta font-semibold uppercase tracking-wider text-ink-2">
          {copy.idea.title}
        </h4>
        <div className="border-b border-rule">
          <Fold fold="summary" name={rows} label={copy.idea.summary}>
            <p className="text-body">{idea.description}</p>
          </Fold>

          <Fold fold="copy" name={rows} label={copy.idea.copy}>
            <p className="text-small text-ink-2">{copy.install.help}</p>
            <blockquote className="mt-4 border-l-2 border-rule-strong pl-4 text-small">{idea.pasteToInstall}</blockquote>
            {/* Nothing is printed under the button (Peter, November 27, 2026). */}
            <CopyTextButton text={idea.copyText} label={copy.install.copy} className="btn btn-m btn-ink mt-5" />
          </Fold>

          {scored && (
            <Fold fold="scores" name={rows} label={copy.scores.title}>
              <dl className="space-y-3">
                {idea.scores.map((s) => (
                  <div key={s.key} data-score={s.key} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3">
                    <dt className="text-small">{copy.scores.names[s.key]}</dt>
                    <dd className="h-2 overflow-hidden rounded-full bg-ground-2" aria-hidden="true">
                      <span className={`block h-full rounded-full ${fill[s.key]}`} style={{ width: `${(s.value ?? 0) * 10}%` }} />
                    </dd>
                    <dd className="tabular text-small font-[560]">{s.value === null ? copy.scores.notScored : `${s.value} ${copy.scores.outOf}`}</dd>
                  </div>
                ))}
              </dl>
            </Fold>
          )}
        </div>
      </section>

      {/* A play with no playbook text has no Playbook heading: a row there would open to nothing. */}
      {idea.playbookMd.trim() !== "" && (
        <section className="mt-8" aria-labelledby={`${id}-the-playbook`}>
          <h4 id={`${id}-the-playbook`} className="pb-3 text-meta font-semibold uppercase tracking-wider text-ink-2">
            {copy.playbook.title}
          </h4>
          <div className="border-b border-rule">
            {/* One row when folded, however many steps the playbook has. */}
            <Fold fold="playbook" name={rows} label={steps ? `${steps.length} ${copy.playbook.steps}` : copy.playbook.whole}>
              {steps ? (
                <div data-steps={steps.length} className="rounded-[8px] bg-ground px-4 sm:px-5">
                  {steps.map((step, i) => (
                    <details key={i} data-fold="step" name={stepRows} className="group/step border-t border-rule first:border-t-0">
                      <summary className={`${summaryRow} text-small font-[620]`}>
                        {step.heading}
                        <Mark open="group-open/step:rotate-45" />
                      </summary>
                      <SimpleMarkdown source={step.body} className="pb-5 text-small" />
                    </details>
                  ))}
                </div>
              ) : (
                <SimpleMarkdown source={idea.playbookMd} className="text-small" />
              )}
            </Fold>
          </div>
        </section>
      )}
      <OneOpen />
    </article>
  );
}
