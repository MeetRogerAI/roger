import type { IdeaView } from "@/lib/cora/idea-view";

const fill: Record<string, string> = {
  hours: "bg-f-hours",
  reach: "bg-f-reach",
  ease: "bg-f-ease",
  proof: "bg-f-proof",
  surprise: "bg-f-surprise",
};

/** Cora's five scores as labelled bars. The number is always shown, so colour is never the only signal. */
export function ScoreBars({ scores }: { scores: IdeaView["scores"] }) {
  return (
    <dl className="space-y-3">
      {scores.map((s) => (
        <div key={s.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <dt className="text-small">
            {s.label}
            <span className="block text-meta text-ink-2">
              {s.help} · weight {s.weight}
            </span>
          </dt>
          <dd className="h-2 overflow-hidden rounded-full bg-ground-2" aria-hidden="true">
            <span className={`block h-full rounded-full ${fill[s.key]}`} style={{ width: `${(s.value ?? 0) * 10}%` }} />
          </dd>
          <dd className="tabular text-small font-[560]">{s.value === null ? "not scored" : `${s.value} of 10`}</dd>
        </div>
      ))}
    </dl>
  );
}
