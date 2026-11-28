"use client";

import { annotate, playbookSteps } from "@/lib/site/playbook";

/**
 * What the public card will make of a playbook as it is typed (plan U8): the parts it finds, each a "##" heading
 * with text under it, or that it finds none and shows the whole text in one piece. For the first example, also
 * whether /how-it-works can still put its notes beside the parts, or shows them beside the whole playbook.
 *
 * It reads the playbook with the same functions the pages do (src/lib/site/playbook.ts, which imports nothing), so
 * what it says is what the card will do. A malformed playbook is never refused: the page degrades, and this says how.
 */
export function PlaybookCheck({ id, value, pairs }: { id: string; value: string; /** For the first example: the parts /how-it-works has a note for, in order. Null for any other. */ pairs: readonly string[] | null }) {
  // Nothing typed yet: nothing to say (a save refuses an empty playbook on its own).
  if (value.trim() === "") return <div id={id} hidden />;
  const steps = playbookSteps(value);
  const paired = pairs ? annotate(value, pairs.map((part) => ({ part }))) !== null : null;
  const good = steps !== null && steps.length === 8 && paired !== false;
  return (
    <div id={id} data-playbook-check={good ? "ok" : "warn"} className={`mt-2 rounded-[8px] border p-3 text-meta ${good ? "border-rule text-ink-2" : "border-error text-ink"}`}>
      {steps ? (
        <p>
          The card finds {steps.length} {steps.length === 1 ? "part" : "parts"}, and shows {steps.length === 1 ? "it" : "them"} as “{steps.length} steps”:{" "}
          <span className="text-ink">{steps.map((step) => step.heading).join(" · ")}</span>.{steps.length === 8 ? "" : " The original plays have eight."}
        </p>
      ) : (
        <p>
          <strong className="font-[620]">The card cannot find this playbook’s parts.</strong> It shows the whole text in one piece, under “The full playbook”. To have parts, start each one on its own
          line with “## ” and its heading (for example “## 4. Steps”), with its text on the lines under it. A part needs a heading and some text, and nothing may come before the first one.
        </p>
      )}
      {paired !== null && (
        <p className="mt-1">
          {paired
            ? "How it works takes this first example apart, with a note beside each of its parts."
            : `How it works takes the first example apart and has a note for each of these parts, in this order: ${pairs!.join(", ")}. This playbook does not have them, so that page shows the notes in a list beside the whole playbook.`}
        </p>
      )}
    </div>
  );
}
