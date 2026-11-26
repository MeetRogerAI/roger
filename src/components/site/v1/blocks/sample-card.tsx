import { CopyTextButton } from "@/components/app/copy-text-button";
import { SimpleMarkdown } from "@/components/app/simple-markdown";
import type { SampleCardCopy } from "@/data/site/copy-types";
import type { IdeaView } from "@/lib/site/sample";

/**
 * The public sample idea (plan KTD6, R11): one real play, laid open on the
 * page. It takes the same IdeaView the app's idea card takes, but it is a
 * marketing component of its own:
 *
 * - it is inline, never a modal;
 * - it prints no time line, no time tiles and no note on how time was worked
 *   out, whatever figures the play carries;
 * - it keeps Cora's five scores, each with its name and its number in words.
 *   The names are the copy's (`copy.scores.names`). The view's own labels and
 *   help lines are the app's and are not printed here: one of them is about
 *   time saved;
 * - a play Cora has not scored at all has no score section.
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

export function SampleCard({ idea, copy, id = "sample" }: { idea: IdeaView; copy: SampleCardCopy; id?: string }) {
  const titleId = `${id}-idea`;
  const scored = idea.scores.some((s) => typeof s.value === "number");
  return (
    // data-claims: the play's own text and scores, for the claims check (src/lib/site/claims.ts).
    <article aria-labelledby={titleId} data-claims="sample" className="mx-auto max-w-[44rem] rounded-[8px] border border-rule bg-surface p-5 text-left text-ink sm:p-8">
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">{idea.category}</p>
      <h3 id={titleId} className="mt-2 text-h3">
        {idea.title}
      </h3>
      <p className="mt-5 text-lead">{idea.description}</p>

      <section className="mt-8 rounded-[8px] border border-rule bg-ground p-5 sm:p-6" aria-labelledby={`${id}-install`}>
        <h4 id={`${id}-install`} className="text-title">
          {copy.install.title}
        </h4>
        <p className="mt-2 text-small text-ink-2">{copy.install.help}</p>
        <blockquote className="mt-4 border-l-2 border-rule-strong pl-4 text-small">{idea.pasteToInstall}</blockquote>
        <CopyTextButton text={idea.copyText} label={copy.install.copy} className="btn btn-m btn-ink mt-5" />
        {idea.writtenOn && <p className="mt-4 text-meta text-ink-2">{`${copy.install.writtenOn} ${idea.writtenOn}. ${copy.install.writtenOnNote}`}</p>}
      </section>

      {scored && (
        <section className="mt-10" aria-labelledby={`${id}-scores`}>
          <h4 id={`${id}-scores`} className="text-title">
            {copy.scores.title}
          </h4>
          <dl className="mt-4 space-y-3">
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
        </section>
      )}

      <section className="mt-10" aria-labelledby={`${id}-playbook`}>
        <h4 id={`${id}-playbook`} className="text-title">
          {copy.playbook.title}
        </h4>
        <SimpleMarkdown source={idea.playbookMd} className="mt-4 text-small" />
      </section>
    </article>
  );
}
