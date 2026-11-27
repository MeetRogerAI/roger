import Link from "next/link";
import { loadChecklist, type Checklist } from "@/lib/app/onboarding";
import { query } from "@/lib/db-query";

/** Spec B.10: shown at the top of /app until every step is done. Steps tick themselves. */
export async function OnboardingChecklist({ userId }: { userId: string }) {
  // A helper, not the page: if it can't be read, /app still shows the week's ideas.
  const list = await loadChecklist(query, userId).catch((e) => {
    console.error("[onboarding] checklist", e instanceof Error ? e.message : e);
    return null;
  });
  if (!list || list.complete) return null;
  return <ChecklistView list={list} />;
}

export function ChecklistView({ list }: { list: Checklist }) {
  const done = list.steps.filter((s) => s.done).length;
  const next = list.steps.find((s) => !s.done);
  return (
    <section aria-labelledby="onboarding-h" className="rounded-[8px] border border-rule bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="onboarding-h" className="text-title">
          Getting started
        </h2>
        <p className="text-small text-ink-2">
          {done} of {list.steps.length} done
        </p>
      </div>
      <ol className="mt-4 space-y-3">
        {list.steps.map((s, i) => (
          <li key={s.key} className="flex gap-3 text-small">
            <span
              aria-hidden="true"
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-meta ${s.done ? "border-accent bg-accent text-accent-ink" : "border-rule-strong text-ink-2"}`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span className={`pt-0.5 ${s.done ? "text-ink-2" : ""}`}>
              {s.href && !s.done ? (
                <Link href={s.href} className={s === next ? "tlink font-semibold" : "tlink"}>
                  {s.label}
                </Link>
              ) : (
                s.label
              )}
              <span className="sr-only">{s.done ? ", done" : ", not done yet"}</span>
              {s.key === "monday" && !s.done && <span className="block text-ink-2">Your first Cora Curation arrives on a Monday morning, once Zack has sent a report.</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
